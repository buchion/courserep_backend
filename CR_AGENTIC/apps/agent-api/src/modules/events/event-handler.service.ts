import { Injectable } from '@nestjs/common';
import { AgentEventType } from '@cr-agentic/shared';
import { AgentNotificationService } from '../notifications/notifications.service';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import { REDIS_CLIENT } from '../queue/queue.module';
import { prisma } from '@cr-agentic/database';

@Injectable()
export class EventHandlerService {
  constructor(
    private readonly notifications: AgentNotificationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async handle(eventType: string, payload: Record<string, unknown>) {
    const userId = payload.userId as string;
    if (!userId) return;

    switch (eventType) {
      case AgentEventType.LECTURE_UPLOADED:
      case AgentEventType.SESSION_EXPIRED:
        await this.notifications.notifyFromEvent(
          eventType as AgentEventType,
          userId,
          payload,
        );
        break;
      case AgentEventType.DOCUMENT_PROCESSED:
        await this.notifications.notifyFromEvent(
          AgentEventType.DOCUMENT_PROCESSED,
          userId,
          payload,
        );
        await enqueueJob(QUEUE_NAMES.STUDY_PLAN_UPDATE, this.redis, 'update', {
          userId,
          reason: 'document_processed',
          metadata: payload,
        });
        break;
      default:
        break;
    }

    const agentEventId = payload.agentEventId as string | undefined;
    if (agentEventId) {
      await prisma.agentEvent.update({
        where: { id: agentEventId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }
  }
}
