import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxPollerService } from './outbox-poller.service';
import { EventHandlerService } from './event-handler.service';
import { EventsWebhookController } from './events-webhook.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EventsWebhookController],
  providers: [OutboxService, OutboxPollerService, EventHandlerService],
  exports: [OutboxService],
})
export class EventsModule {}
