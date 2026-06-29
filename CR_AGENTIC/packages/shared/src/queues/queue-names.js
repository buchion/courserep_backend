"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDIS_RATE_LIMIT_PREFIX = exports.REDIS_LOCK_PREFIX = exports.QUEUE_NAMES = void 0;
exports.QUEUE_NAMES = {
    BROWSER_CONNECT_LMS: 'browser.connect-lms',
    BROWSER_REFRESH_SESSION: 'browser.refresh-session',
    LMS_CHECK: 'lms.check',
    LMS_DOWNLOAD: 'lms.download',
    AI_SUMMARIZE: 'ai.summarize',
    AI_FLASHCARDS: 'ai.flashcards',
    AI_QUIZ: 'ai.quiz',
    AI_PROCESS_DOCUMENT: 'ai.process-document',
    STUDY_PLAN_UPDATE: 'study-plan.update',
    NOTIFICATIONS_SEND: 'notifications.send',
    AGENT_RETRY_FAILED: 'agent.retry-failed',
    AGENT_DLQ: 'agent.dlq',
};
exports.REDIS_LOCK_PREFIX = 'cr:agent:lock:user:';
exports.REDIS_RATE_LIMIT_PREFIX = 'cr:agent:ratelimit:lms:';
//# sourceMappingURL=queue-names.js.map