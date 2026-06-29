import { Injectable } from '@nestjs/common';
import { prisma } from '@cr-agentic/database';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../queue/queue.module';

@Injectable()
export class HealthService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async liveness() {
    return { status: 'ok', service: 'agent-api' };
  }

  async readiness() {
    await prisma.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return { status: 'ready', service: 'agent-api' };
  }
}
