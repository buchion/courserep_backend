import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { prisma } from '@cr-agentic/database';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES, AgentEventType } from '@cr-agentic/shared';
import { EVENT_NOTIFICATION_TEMPLATES } from '@cr-agentic/agent-core';
import { REDIS_CLIENT } from '../queue/queue.module';
import { CourseRepClient } from '../../integrations/course-rep/course-rep.client';

@Injectable()
export class AgentNotificationService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly courseRep: CourseRepClient,
  ) {}

  async listNotifications(userId: string) {
    return prisma.agentNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async sendNotification(payload: {
    userId: string;
    title: string;
    message: string;
    dedupeKey?: string;
    connectedAccountId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const local = await prisma.agentNotification.create({
      data: {
        userId: payload.userId,
        connectedAccountId: payload.connectedAccountId,
        title: payload.title,
        message: payload.message,
        dedupeKey: payload.dedupeKey,
        metadata: payload.metadata as object | undefined,
        status: 'PENDING',
      },
    });

    await enqueueJob(QUEUE_NAMES.NOTIFICATIONS_SEND, this.redis, 'send', {
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      dedupeKey: payload.dedupeKey,
      metadata: { ...payload.metadata, agentNotificationId: local.id },
    });

    return local;
  }

  async processNotificationJob(payload: {
    userId: string;
    title: string;
    message: string;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
  }) {
    const result = await this.courseRep.createNotification({
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      dedupeKey: payload.dedupeKey,
      type: 'push',
      metadata: payload.metadata,
    });

    const agentNotificationId = payload.metadata?.agentNotificationId as string | undefined;
    if (agentNotificationId) {
      await prisma.agentNotification.update({
        where: { id: agentNotificationId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          mainNotificationId: result.notificationId,
        },
      });
    }

    return result;
  }

  async notifyFromEvent(
    eventType: AgentEventType,
    userId: string,
    payload: Record<string, unknown>,
  ) {
    const templateFn = EVENT_NOTIFICATION_TEMPLATES[eventType];
    if (!templateFn) return null;
    const request = templateFn({ ...payload, userId });
    if (!request) return null;
    return this.sendNotification(request);
  }
}
