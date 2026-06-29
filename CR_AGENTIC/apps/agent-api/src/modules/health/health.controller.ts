import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  liveness() {
    return this.healthService.liveness();
  }

  @Public()
  @Get('ready')
  readiness() {
    return this.healthService.readiness();
  }
}
