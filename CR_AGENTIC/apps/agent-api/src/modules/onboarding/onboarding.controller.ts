import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { OnboardingService } from './onboarding.service';
import { PortalService } from './portal.service';
import { LoginService } from './login.service';
import { DeepDiscoveryService } from './deep-discovery.service';
import { SyncService } from './sync.service';
import {
  ApplyResultsRequestDto,
  ConfirmPortalRequestDto,
  LoginBridgeRequestDto,
  ManualPortalRequestDto,
  StartOnboardingRequestDto,
} from './dto/onboarding.request.dto';

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly portal: PortalService,
    private readonly login: LoginService,
    private readonly deepDiscovery: DeepDiscoveryService,
    private readonly sync: SyncService,
  ) {}

  @Post('start')
  start(@CurrentUser('id') userId: string, @Body() dto: StartOnboardingRequestDto) {
    return this.onboarding.start(userId, dto);
  }

  @Get(':sessionId')
  status(@CurrentUser('id') userId: string, @Param('sessionId') sessionId: string) {
    return this.onboarding.getStatus(userId, sessionId);
  }

  @Post(':sessionId/cancel')
  cancel(@CurrentUser('id') userId: string, @Param('sessionId') sessionId: string) {
    return this.onboarding.cancel(userId, sessionId);
  }

  @Post(':sessionId/discover-portal')
  discoverPortal(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.portal.discover(userId, sessionId);
  }

  @Get(':sessionId/portal-candidates')
  portalCandidates(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.portal.listCandidates(userId, sessionId);
  }

  @Post(':sessionId/confirm-portal')
  confirmPortal(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ConfirmPortalRequestDto,
  ) {
    return this.portal.confirm(userId, sessionId, dto);
  }

  @Post(':sessionId/confirm-portal-manual')
  confirmPortalManual(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ManualPortalRequestDto,
  ) {
    return this.portal.confirmManual(userId, sessionId, dto);
  }

  @Post(':sessionId/login/start')
  loginStart(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.login.start(userId, sessionId);
  }

  @Get(':sessionId/login/status')
  loginStatus(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.login.status(userId, sessionId);
  }

  @Post(':sessionId/login/complete')
  loginComplete(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.login.complete(userId, sessionId);
  }

  // Public: authenticated by the one-time HMAC bridge token, not JWT.
  @Public()
  @Post('login-bridge')
  loginBridge(@Body() dto: LoginBridgeRequestDto) {
    return this.login.bridge(dto);
  }

  @Post(':sessionId/discover-academics')
  discoverAcademics(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.deepDiscovery.start(userId, sessionId);
  }

  @Get(':sessionId/discovery-results')
  discoveryResults(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.deepDiscovery.results(userId, sessionId);
  }

  @Post(':sessionId/apply-results')
  applyResults(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ApplyResultsRequestDto,
  ) {
    return this.deepDiscovery.applyResults(userId, sessionId, dto);
  }

  @Post(':sessionId/sync-to-course-rep')
  syncToCourseRep(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sync.syncToCourseRep(userId, sessionId);
  }
}
