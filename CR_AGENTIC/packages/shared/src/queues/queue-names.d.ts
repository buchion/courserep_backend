export declare const QUEUE_NAMES: {
    readonly BROWSER_CONNECT_LMS: "browser.connect-lms";
    readonly BROWSER_REFRESH_SESSION: "browser.refresh-session";
    readonly LMS_CHECK: "lms.check";
    readonly LMS_DOWNLOAD: "lms.download";
    readonly AI_SUMMARIZE: "ai.summarize";
    readonly AI_FLASHCARDS: "ai.flashcards";
    readonly AI_QUIZ: "ai.quiz";
    readonly AI_PROCESS_DOCUMENT: "ai.process-document";
    readonly STUDY_PLAN_UPDATE: "study-plan.update";
    readonly NOTIFICATIONS_SEND: "notifications.send";
    readonly AGENT_RETRY_FAILED: "agent.retry-failed";
    readonly AGENT_DLQ: "agent.dlq";
};
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export declare const REDIS_LOCK_PREFIX = "cr:agent:lock:user:";
export declare const REDIS_RATE_LIMIT_PREFIX = "cr:agent:ratelimit:lms:";
//# sourceMappingURL=queue-names.d.ts.map