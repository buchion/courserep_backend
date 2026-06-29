import { AgentEventType } from '@cr-agentic/shared';

export interface NotificationRequest {
  userId: string;
  title: string;
  message: string;
  dedupeKey?: string;
  connectedAccountId?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationEngine {
  notify(request: NotificationRequest): Promise<void>;
  notifyFromEvent(
    eventType: AgentEventType,
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export const EVENT_NOTIFICATION_TEMPLATES: Partial<
  Record<AgentEventType, (payload: Record<string, unknown>) => NotificationRequest | null>
> = {
  [AgentEventType.LECTURE_UPLOADED]: (payload) => ({
    userId: payload.userId as string,
    title: 'New lecture material',
    message: `New file detected: ${payload.title ?? 'lecture material'}`,
    dedupeKey: `lecture:${payload.lectureMaterialId}`,
    metadata: payload,
  }),
  [AgentEventType.DOCUMENT_PROCESSED]: (payload) => ({
    userId: payload.userId as string,
    title: 'Study resources ready',
    message: 'Your lecture has been summarized with flashcards and quiz.',
    dedupeKey: `doc-processed:${payload.documentId}`,
    metadata: payload,
  }),
  [AgentEventType.SESSION_EXPIRED]: (payload) => ({
    userId: payload.userId as string,
    title: 'LMS reconnection required',
    message: 'Please reconnect your LMS account to continue syncing.',
    dedupeKey: `session-expired:${payload.connectedAccountId}`,
    metadata: payload,
  }),
};
