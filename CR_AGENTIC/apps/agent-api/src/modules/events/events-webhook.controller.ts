import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { OutboxService } from './outbox.service';
import { AgentEventType } from '@cr-agentic/shared';

@ApiTags('webhooks')
@Controller('webhooks')
export class EventsWebhookController {
  constructor(private readonly outbox: OutboxService) {}

  @Public()
  @Post('quiz-completed')
  quizCompleted(
    @Body() body: { userId: string; quizId: string; score?: number },
  ) {
    return this.outbox.publishAgentEvent({
      eventType: AgentEventType.QUIZ_COMPLETED,
      aggregateId: body.quizId,
      userId: body.userId,
      payload: body as unknown as Record<string, unknown>,
    });
  }
}
