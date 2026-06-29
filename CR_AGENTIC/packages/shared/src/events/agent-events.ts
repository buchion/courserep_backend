export enum AgentEventType {
  LECTURE_UPLOADED = 'LectureUploaded',
  DOCUMENT_PROCESSED = 'DocumentProcessed',
  FLASHCARDS_GENERATED = 'FlashcardsGenerated',
  QUIZ_GENERATED = 'QuizGenerated',
  STUDY_PLAN_UPDATED = 'StudyPlanUpdated',
  ASSIGNMENT_DUE = 'AssignmentDue',
  EXAM_APPROACHING = 'ExamApproaching',
  NEW_ANNOUNCEMENT = 'NewAnnouncement',
  SESSION_EXPIRED = 'SessionExpired',
  QUIZ_COMPLETED = 'QuizCompleted',
}

export enum AgentEventStatus {
  PENDING = 'PENDING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

export interface AgentEventPayload {
  eventType: AgentEventType;
  aggregateId: string;
  userId: string;
  payload: Record<string, unknown>;
}
