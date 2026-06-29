export interface PlannedTask {
  taskType: string;
  priority: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  dependsOn?: string[];
}

export interface PlannerInput {
  goal: 'connect_lms' | 'sync_lms' | 'process_document' | 'manual_sync';
  userId: string;
  connectedAccountId?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

export class AgentPlanner {
  plan(input: PlannerInput): PlannedTask[] {
    switch (input.goal) {
      case 'connect_lms':
        return [
          {
            taskType: 'CONNECT_LMS',
            priority: 10,
            payload: {
              connectedAccountId: input.connectedAccountId,
              ...input.metadata,
            },
            idempotencyKey: `connect:${input.connectedAccountId}`,
          },
        ];
      case 'sync_lms':
      case 'manual_sync':
        return [
          {
            taskType: 'LMS_CHECK',
            priority: 5,
            payload: { connectedAccountId: input.connectedAccountId },
            idempotencyKey: `lms-check:${input.connectedAccountId}:${Date.now()}`,
          },
        ];
      case 'process_document':
        return [
          {
            taskType: 'PROCESS_DOCUMENT',
            priority: 7,
            payload: {
              documentId: input.documentId,
              connectedAccountId: input.connectedAccountId,
            },
            idempotencyKey: `process-doc:${input.documentId}`,
          },
        ];
      default:
        return [];
    }
  }
}
