import { Injectable } from '@nestjs/common';
import { prisma, MemoryCategory as PrismaMemoryCategory } from '@cr-agentic/database';
import type { MemoryStore, MemoryEntry } from '@cr-agentic/agent-core';

@Injectable()
export class PrismaMemoryStore implements MemoryStore {
  async get(userId: string, category: PrismaMemoryCategory, key: string): Promise<MemoryEntry | null> {
    const row = await prisma.agentMemoryEntry.findUnique({
      where: { userId_category_key: { userId, category, key } },
    });
    if (!row) return null;
    return {
      userId: row.userId,
      category: row.category,
      key: row.key,
      value: row.value as Record<string, unknown>,
      connectedAccountId: row.connectedAccountId ?? undefined,
    };
  }

  async list(
    userId: string,
    categories?: PrismaMemoryCategory[],
    limit = 20,
  ): Promise<MemoryEntry[]> {
    const rows = await prisma.agentMemoryEntry.findMany({
      where: {
        userId,
        ...(categories?.length ? { category: { in: categories } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      userId: row.userId,
      category: row.category,
      key: row.key,
      value: row.value as Record<string, unknown>,
      connectedAccountId: row.connectedAccountId ?? undefined,
    }));
  }

  async upsert(entry: MemoryEntry): Promise<MemoryEntry> {
    const row = await prisma.agentMemoryEntry.upsert({
      where: {
        userId_category_key: {
          userId: entry.userId,
          category: entry.category,
          key: entry.key,
        },
      },
      create: {
        userId: entry.userId,
        category: entry.category,
        key: entry.key,
        value: entry.value as object,
        connectedAccountId: entry.connectedAccountId,
      },
      update: {
        value: entry.value as object,
        connectedAccountId: entry.connectedAccountId,
      },
    });
    return {
      userId: row.userId,
      category: row.category,
      key: row.key,
      value: row.value as Record<string, unknown>,
      connectedAccountId: row.connectedAccountId ?? undefined,
    };
  }

  async delete(userId: string, category: PrismaMemoryCategory, key: string): Promise<void> {
    await prisma.agentMemoryEntry.deleteMany({
      where: { userId, category, key },
    });
  }
}
