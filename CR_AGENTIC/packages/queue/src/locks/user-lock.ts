import Redis from 'ioredis';
import { REDIS_LOCK_PREFIX } from '@cr-agentic/shared';

export class UserLock {
  constructor(private readonly redis: Redis) {}

  private key(userId: string): string {
    return `${REDIS_LOCK_PREFIX}${userId}`;
  }

  async acquire(
    userId: string,
    ttlSeconds = 300,
  ): Promise<{ token: string; release: () => Promise<void> } | null> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await this.redis.set(
      this.key(userId),
      token,
      'EX',
      ttlSeconds,
      'NX',
    );
    if (result !== 'OK') return null;

    return {
      token,
      release: async () => {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redis.eval(script, 1, this.key(userId), token);
      },
    };
  }

  async withLock<T>(
    userId: string,
    fn: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const lock = await this.acquire(userId, ttlSeconds);
    if (!lock) {
      throw new Error(`Could not acquire user lock for ${userId}`);
    }
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}
