export declare enum LmsType {
    GENERIC = "GENERIC",
    CANVAS = "CANVAS",
    MOODLE = "MOODLE",
    BLACKBOARD = "BLACKBOARD",
    BRIGHTSPACE = "BRIGHTSPACE",
    GOOGLE_CLASSROOM = "GOOGLE_CLASSROOM"
}
export interface ConnectLmsDto {
    lmsType: LmsType;
    lmsBaseUrl: string;
    metadata?: Record<string, unknown>;
}
export interface ReconnectLmsDto {
    connectedAccountId: string;
}
export interface AgentRunDto {
    connectedAccountId: string;
    taskType?: string;
}
//# sourceMappingURL=connect-lms.dto.d.ts.map