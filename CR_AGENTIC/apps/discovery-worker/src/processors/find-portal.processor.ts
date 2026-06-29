import { prisma, OnboardingStage, recordOnboardingTransition } from '@cr-agentic/database';
import { createLogger, writeAuditLog } from '@cr-agentic/observability';
import { PortalDiscoveryService, PortalCandidateResult } from '@cr-agentic/portal-discovery';
import type { DiscoveryFindPortalJob } from '@cr-agentic/shared';

const logger = createLogger('find-portal-processor');

export class FindPortalProcessor {
  constructor(private readonly discovery: PortalDiscoveryService) {}

  async process(job: { data: DiscoveryFindPortalJob }): Promise<void> {
    const { onboardingSessionId, userId } = job.data;

    const session = await prisma.onboardingSession.findUnique({
      where: { id: onboardingSessionId },
    });
    if (!session) throw new Error('Onboarding session not found');

    try {
      const candidates = await this.discovery.discover({
        universityName: job.data.universityName,
        country: job.data.country,
        website: job.data.website,
      });

      await this.persistCandidates(onboardingSessionId, candidates);

      await this.applyCacheHints(session.universityId, candidates);

      await recordOnboardingTransition(
        onboardingSessionId,
        session.stage,
        OnboardingStage.PORTAL_SUGGESTED,
        { candidateCount: candidates.length },
      );

      await writeAuditLog({
        actorId: userId,
        action: 'portal_discovery_completed',
        resourceType: 'onboarding_session',
        resourceId: onboardingSessionId,
        metadata: { candidateCount: candidates.length },
      });

      logger.info({ onboardingSessionId, count: candidates.length }, 'Portal discovery complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordOnboardingTransition(
        onboardingSessionId,
        session.stage,
        OnboardingStage.FAILED,
        { error: message },
        { lastError: { stage: 'PORTAL_DISCOVERING', message } },
      );
      throw err;
    }
  }

  private async persistCandidates(
    onboardingSessionId: string,
    candidates: PortalCandidateResult[],
  ): Promise<void> {
    await prisma.portalCandidate.deleteMany({ where: { onboardingSessionId } });
    if (candidates.length === 0) return;
    await prisma.portalCandidate.createMany({
      data: candidates.map((c) => ({
        onboardingSessionId,
        loginUrl: c.loginUrl,
        portalName: c.portalName,
        lmsType: c.lmsType,
        confidence: c.confidence,
        evidence: c.evidence,
        source: 'WEB_SEARCH' as const,
      })),
    });
  }

  /** Caches the top candidate's portal hint per university for faster re-onboarding. */
  private async applyCacheHints(
    universityId: string | null,
    candidates: PortalCandidateResult[],
  ): Promise<void> {
    if (!universityId || candidates.length === 0) return;
    const top = candidates[0];
    await prisma.universityCache
      .update({
        where: { universityId },
        data: {
          studentPortalUrl: top.loginUrl,
          lmsType: top.lmsType,
          portalDiscoveredAt: new Date(),
        },
      })
      .catch(() => undefined);
  }
}
