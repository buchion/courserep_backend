import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisConnection } from '@cr-agentic/queue';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => createRedisConnection(),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class QueueModule {}
