import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { prisma } from '@cr-agentic/database';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import type { BrowserValidateSessionJob } from '@cr-agentic/shared';
import { SessionStorageService } from '@cr-agentic/storage';
import { writeAuditLog } from '@cr-agentic/observability';
import { REDIS_CLIENT } from '../queue/queue.module';
import { SESSION_STORAGE } from './session-storage.provider';
import { OnboardingService } from './onboarding.service';
import { LoginBridgeRequestDto } from './dto/onboarding.request.dto';
import { createBridgeToken, verifyBridgeToken } from './bridge-token';

const BROWSER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class LoginService {
  private readonly bridgeSecret: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(SESSION_STORAGE) private readonly sessionStorage: SessionStorageService,
    private readonly onboarding: OnboardingService,
    config: ConfigService,
  ) {
    this.bridgeSecret = config.get<string>('SESSION_ENCRYPTION_KEY', '');
  }

  /** Opens an interactive login: issues a short-lived bridge token + the portal URL. */
  async start(userId: string, sessionId: string) {
    const session = await this.onboarding.requireSession(userId, sessionId);
    if (!session.selectedCandidateId) {
      throw new BadRequestException('No confirmed portal for this session');
    }

    const candidate = await prisma.portalCandidate.findUnique({
      where: { id: session.selectedCandidateId },
    });
    if (!candidate) throw new NotFoundException('Confirmed portal not found');

    const { token, tokenHash, expiresAt } = createBridgeToken(
      sessionId,
      this.bridgeSecret,
    );

    await this.onboarding.transition(
      sessionId,
      session.stage,
      'AWAITING_LOGIN',
      { loginBridgeTokenHash: tokenHash, loginBridgeExpiresAt: expiresAt },
    );

    return {
      sessionId,
      loginUrl: candidate.loginUrl,
      bridgeToken: token,
      expiresAt,
    };
  }

  status(userId: string, sessionId: string) {
    return this.onboarding.requireSession(userId, sessionId).then((session) => ({
      status: this.mapStatus(session.stage),
      stage: session.stage,
    }));
  }

  /**
   * Public endpoint hit by the mobile WebView. Authenticated solely by the
   * one-time HMAC bridge token (no JWT). Persists the captured storage state
   * and hands off to the browser worker for server-side validation.
   */
  async bridge(dto: LoginBridgeRequestDto) {
    const session = await prisma.onboardingSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) throw new NotFoundException('Onboarding session not found');

    const valid = verifyBridgeToken(
      dto.bridgeToken,
      dto.sessionId,
      this.bridgeSecret,
      session.loginBridgeTokenHash,
      session.loginBridgeExpiresAt,
    );
    if (!valid) throw new UnauthorizedException('Invalid or expired bridge token');

    const account = await prisma.connectedAccount.findFirst({
      where: { onboardingSessionId: session.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!account) throw new BadRequestException('No connected account to attach session');

    const s3Key = await this.sessionStorage.saveSession(
      account.id,
      Date.now().toString(),
      { cookies: dto.storageState.cookies, origins: dto.storageState.origins },
    );

    const browserSession = await prisma.browserSession.create({
      data: {
        connectedAccountId: account.id,
        storageStateS3Key: s3Key,
        expiresAt: new Date(Date.now() + BROWSER_SESSION_TTL_MS),
        status: 'ACTIVE',
      },
    });

    // Consume the one-time token and advance the state machine.
    await this.onboarding.transition(
      session.id,
      session.stage,
      'LOGIN_IN_PROGRESS',
      { loginBridgeTokenHash: null, loginBridgeExpiresAt: null },
    );

    await enqueueJob<BrowserValidateSessionJob>(
      QUEUE_NAMES.BROWSER_VALIDATE_SESSION,
      this.redis,
      'validate',
      {
        connectedAccountId: account.id,
        onboardingSessionId: session.id,
        userId: session.userId,
        browserSessionId: browserSession.id,
      },
    );

    await writeAuditLog({
      actorId: session.userId,
      action: 'login_bridge_received',
      resourceType: 'onboarding_session',
      resourceId: session.id,
      metadata: { connectedAccountId: account.id },
    });

    return { status: 'in_progress' };
  }

  /** Re-triggers validation if the worker handoff needs a manual nudge. */
  async complete(userId: string, sessionId: string) {
    const session = await this.onboarding.requireSession(userId, sessionId);
    return { status: this.mapStatus(session.stage), stage: session.stage };
  }

  private mapStatus(stage: string): 'awaiting' | 'in_progress' | 'captured' | 'failed' {
    switch (stage) {
      case 'AWAITING_LOGIN':
        return 'awaiting';
      case 'LOGIN_IN_PROGRESS':
        return 'in_progress';
      case 'SESSION_CAPTURED':
      case 'DEEP_DISCOVERY':
      case 'ONBOARDING_COMPLETE':
        return 'captured';
      case 'REAUTH_REQUIRED':
      case 'FAILED':
        return 'failed';
      default:
        return 'awaiting';
    }
  }
}
