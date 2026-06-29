import { Injectable } from '@nestjs/common';
import { MemoryCategory } from '@cr-agentic/database';
import { PrismaMemoryStore } from './prisma-memory.store';

@Injectable()
export class MemoryService {
  constructor(private readonly store: PrismaMemoryStore) {}

  list(userId: string, category?: MemoryCategory) {
    return this.store.list(userId, category ? [category] : undefined);
  }

  updatePreferences(userId: string, preferences: Record<string, unknown>) {
    return this.store.upsert({
      userId,
      category: MemoryCategory.PREFERENCES,
      key: 'default',
      value: preferences,
    });
  }
}
