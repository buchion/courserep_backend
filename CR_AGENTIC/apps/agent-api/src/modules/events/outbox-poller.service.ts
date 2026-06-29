import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '@cr-agentic/database';
import { EventHandlerService } from './event-handler.service';
import { createLogger } from '@cr-agentic/observability';

@Injectable()
export class OutboxPollerService {
  private readonly logger = createLogger('outbox-poller');

  constructor(private readonly handler: EventHandlerService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollOutbox() {
    const events = await prisma.outboxEvent.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const event of events) {
      try {
        await this.handler.handle(
          event.eventType,
          event.payload as Record<string, unknown>,
        );
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { published: true, publishedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(
          { err, eventId: event.id },
          'Failed to publish outbox event',
        );
      }
    }
  }
}
