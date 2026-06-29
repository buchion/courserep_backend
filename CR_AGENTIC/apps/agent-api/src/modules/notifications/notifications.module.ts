import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { AgentNotificationService } from './notifications.service';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  controllers: [NotificationsController],
  providers: [AgentNotificationService, NotificationWorkerService],
  exports: [AgentNotificationService],
})
export class NotificationsModule {}
