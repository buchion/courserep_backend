import { Injectable } from '@nestjs/common';
import { prisma, AgentEventType as PrismaEventType } from '@cr-agentic/database';
import { AgentEventType } from '@cr-agentic/shared';

@Injectable()
export class OutboxService {
  async append(
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    return prisma.outboxEvent.create({
      data: {
        eventType,
        aggregateId,
        payload: payload as object,
      },
    });
  }

  async publishAgentEvent(input: {
    eventType: AgentEventType;
    aggregateId: string;
    userId: string;
    agentTaskId?: string;
    payload: Record<string, unknown>;
  }) {
    const event = await prisma.agentEvent.create({
      data: {
        eventType: input.eventType as PrismaEventType,
        aggregateId: input.aggregateId,
        userId: input.userId,
        agentTaskId: input.agentTaskId,
        payload: input.payload as object,
        status: 'PENDING',
      },
    });

    await this.append(input.eventType, input.aggregateId, {
      ...input.payload,
      userId: input.userId,
      agentEventId: event.id,
    });

    return event;
  }
}
