import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PortalService } from './portal.service';
import { LoginService } from './login.service';
import { DeepDiscoveryService } from './deep-discovery.service';
import { SyncService } from './sync.service';
import { sessionStorageProvider } from './session-storage.provider';

@Module({
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    PortalService,
    LoginService,
    DeepDiscoveryService,
    SyncService,
    sessionStorageProvider,
  ],
  exports: [OnboardingService],
})
export class OnboardingModule {}
