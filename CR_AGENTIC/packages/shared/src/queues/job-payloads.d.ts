export interface BrowserConnectLmsJob {
    connectedAccountId: string;
    userId: string;
    lmsType: string;
    lmsBaseUrl: string;
    taskId: string;
    taskRunId: string;
}
export interface BrowserRefreshSessionJob {
    connectedAccountId: string;
    userId: string;
    taskId: string;
    taskRunId: string;
}
export interface LmsCheckJob {
    connectedAccountId: string;
    userId: string;
    taskId: string;
    taskRunId: string;
}
export interface LmsDownloadJob {
    connectedAccountId: string;
    userId: string;
    lectureMaterialId: string;
    taskId: string;
    taskRunId: string;
}
export interface AiProcessDocumentJob {
    documentId: string;
    userId: string;
    connectedAccountId: string;
    taskId?: string;
}
export interface AiSummarizeJob {
    documentId: string;
    userId: string;
}
export interface AiFlashcardsJob {
    documentId: string;
    userId: string;
}
export interface AiQuizJob {
    documentId: string;
    userId: string;
}
export interface StudyPlanUpdateJob {
    userId: string;
    reason: string;
    metadata?: Record<string, unknown>;
}
export interface NotificationSendJob {
    userId: string;
    title: string;
    message: string;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
}
export interface DlqJob {
    originalQueue: string;
    originalJobId: string;
    payload: unknown;
    error: string;
    failedAt: string;
}
//# sourceMappingURL=job-payloads.d.ts.map