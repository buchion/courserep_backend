import Redis, { RedisOptions } from 'ioredis';
import { REDIS_KEY_PREFIX } from '@cr-agentic/config';

export function getRedisConnectionOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  };
}

export function createRedisConnection(options?: RedisOptions): Redis {
  return new Redis({
    ...getRedisConnectionOptions(),
    ...options,
    keyPrefix: REDIS_KEY_PREFIX,
  });
}
