export enum MemoryCategoryEnum {
  PREFERENCES = 'PREFERENCES',
  COURSES = 'COURSES',
  WEAK_TOPICS = 'WEAK_TOPICS',
  STRONG_TOPICS = 'STRONG_TOPICS',
  STUDY_SCHEDULE = 'STUDY_SCHEDULE',
  LEARNING_HISTORY = 'LEARNING_HISTORY',
  AGENT_OBSERVATIONS = 'AGENT_OBSERVATIONS',
  NOTIFICATION_HISTORY = 'NOTIFICATION_HISTORY',
}

export type MemoryCategory = `${MemoryCategoryEnum}`;

export interface MemoryEntry {
  userId: string;
  category: MemoryCategory;
  key: string;
  value: Record<string, unknown>;
  connectedAccountId?: string;
}

export interface MemoryStore {
  get(
    userId: string,
    category: MemoryCategory,
    key: string,
  ): Promise<MemoryEntry | null>;
  list(
    userId: string,
    categories?: MemoryCategory[],
    limit?: number,
  ): Promise<MemoryEntry[]>;
  upsert(entry: MemoryEntry): Promise<MemoryEntry>;
  delete(userId: string, category: MemoryCategory, key: string): Promise<void>;
}

export interface MemoryRetrievalContext {
  userId: string;
  categories: MemoryCategory[];
  limit?: number;
}

export function rankMemoryEntries(
  entries: MemoryEntry[],
  limit = 20,
): MemoryEntry[] {
  return entries.slice(0, limit);
}
