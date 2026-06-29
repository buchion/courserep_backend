import Redis from 'ioredis';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import type { DlqJob } from '@cr-agentic/shared';
import { enqueueJob } from './queue-factory';

export async function moveToDlq(
  connection: Redis,
  originalQueue: string,
  originalJobId: string,
  payload: unknown,
  error: unknown,
): Promise<void> {
  const dlqPayload: DlqJob = {
    originalQueue,
    originalJobId,
    payload,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    failedAt: new Date().toISOString(),
  };
  await enqueueJob(
    QUEUE_NAMES.AGENT_DLQ,
    connection,
    'failed',
    dlqPayload,
  );
}
