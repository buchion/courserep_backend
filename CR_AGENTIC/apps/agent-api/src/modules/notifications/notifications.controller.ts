import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgentNotificationService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: AgentNotificationService) {}

  @Get('notifications')
  list(@CurrentUser('id') userId: string) {
    return this.notificationsService.listNotifications(userId);
  }
}
