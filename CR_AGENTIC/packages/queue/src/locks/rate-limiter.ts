import Redis from 'ioredis';
import { REDIS_RATE_LIMIT_PREFIX } from '@cr-agentic/shared';

export class LmsRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly maxRequests = 30,
    private readonly windowSeconds = 60,
  ) {}

  private key(lmsBaseUrl: string): string {
    return `${REDIS_RATE_LIMIT_PREFIX}${encodeURIComponent(lmsBaseUrl)}`;
  }

  async check(lmsBaseUrl: string): Promise<boolean> {
    const key = this.key(lmsBaseUrl);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }
    return count <= this.maxRequests;
  }

  async waitForSlot(lmsBaseUrl: string, maxWaitMs = 30_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this.check(lmsBaseUrl)) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`LMS rate limit exceeded for ${lmsBaseUrl}`);
  }
}
