import { Queue, Worker, JobsOptions, ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import { getQueuePolicy } from './queue-config';
import { getRedisConnectionOptions } from './connection';

const queueCache = new Map<string, Queue>();

function getConnection(): ConnectionOptions {
  return getRedisConnectionOptions() as ConnectionOptions;
}

export function getQueue(queueName: string): Queue {
  const cached = queueCache.get(queueName);
  if (cached) return cached;

  const policy = getQueuePolicy(queueName);
  const queue = new Queue(queueName, {
    connection: getConnection(),
    prefix: 'cr:agent:bull',
    defaultJobOptions: policy.defaultJobOptions,
  });
  queueCache.set(queueName, queue);
  return queue;
}

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: import('bullmq').Job<T>) => Promise<unknown>,
): Worker<T> {
  const policy = getQueuePolicy(queueName);
  return new Worker<T>(queueName, processor, {
    connection: getConnection(),
    prefix: 'cr:agent:bull',
    concurrency: policy.concurrency,
    lockDuration: 120_000,
  });
}

export async function enqueueJob<T>(
  queueName: string,
  _connection: unknown,
  jobName: string,
  data: T,
  options?: JobsOptions,
): Promise<string> {
  const queue = getQueue(queueName);
  const policy = getQueuePolicy(queueName);
  const job = await queue.add(jobName, data, {
    ...policy.defaultJobOptions,
    ...options,
  });
  return String(job.id);
}

export function getAllQueueNames(): string[] {
  return Object.values(QUEUE_NAMES);
}
