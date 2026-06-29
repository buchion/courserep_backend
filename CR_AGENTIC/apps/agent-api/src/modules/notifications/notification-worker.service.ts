import { Injectable, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { createWorker } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import type { NotificationSendJob } from '@cr-agentic/shared';
import { REDIS_CLIENT } from '../queue/queue.module';
import { AgentNotificationService } from './notifications.service';
import { createLogger, metrics } from '@cr-agentic/observability';

@Injectable()
export class NotificationWorkerService implements OnModuleInit {
  private readonly logger = createLogger('notification-worker');

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly notifications: AgentNotificationService,
  ) {}

  onModuleInit() {
    createWorker<NotificationSendJob>(
      QUEUE_NAMES.NOTIFICATIONS_SEND,
      async (job) => {
        metrics.increment('notifications.processed');
        await this.notifications.processNotificationJob(job.data);
        this.logger.info({ jobId: job.id }, 'Notification sent');
      },
    );
    this.logger.info('Notification worker started');
  }
}
