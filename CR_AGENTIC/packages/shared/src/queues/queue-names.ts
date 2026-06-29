export const QUEUE_NAMES = {
  BROWSER_CONNECT_LMS: 'browser.connect-lms',
  BROWSER_REFRESH_SESSION: 'browser.refresh-session',
  BROWSER_VALIDATE_SESSION: 'browser.validate-session',
  LMS_CHECK: 'lms.check',
  LMS_DOWNLOAD: 'lms.download',
  AI_SUMMARIZE: 'ai.summarize',
  AI_FLASHCARDS: 'ai.flashcards',
  AI_QUIZ: 'ai.quiz',
  AI_PROCESS_DOCUMENT: 'ai.process-document',
  STUDY_PLAN_UPDATE: 'study-plan.update',
  NOTIFICATIONS_SEND: 'notifications.send',
  DISCOVERY_FIND_PORTAL: 'discovery.find-portal',
  DISCOVERY_DEEP_SCRAPE: 'discovery.deep-scrape',
  AGENT_RETRY_FAILED: 'agent.retry-failed',
  AGENT_DLQ: 'agent.dlq',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const REDIS_LOCK_PREFIX = 'cr:agent:lock:user:';
export const REDIS_RATE_LIMIT_PREFIX = 'cr:agent:ratelimit:lms:';
