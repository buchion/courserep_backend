"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentEventStatus = exports.AgentEventType = void 0;
var AgentEventType;
(function (AgentEventType) {
    AgentEventType["LECTURE_UPLOADED"] = "LectureUploaded";
    AgentEventType["DOCUMENT_PROCESSED"] = "DocumentProcessed";
    AgentEventType["FLASHCARDS_GENERATED"] = "FlashcardsGenerated";
    AgentEventType["QUIZ_GENERATED"] = "QuizGenerated";
    AgentEventType["STUDY_PLAN_UPDATED"] = "StudyPlanUpdated";
    AgentEventType["ASSIGNMENT_DUE"] = "AssignmentDue";
    AgentEventType["EXAM_APPROACHING"] = "ExamApproaching";
    AgentEventType["NEW_ANNOUNCEMENT"] = "NewAnnouncement";
    AgentEventType["SESSION_EXPIRED"] = "SessionExpired";
    AgentEventType["QUIZ_COMPLETED"] = "QuizCompleted";
})(AgentEventType || (exports.AgentEventType = AgentEventType = {}));
var AgentEventStatus;
(function (AgentEventStatus) {
    AgentEventStatus["PENDING"] = "PENDING";
    AgentEventStatus["PUBLISHED"] = "PUBLISHED";
    AgentEventStatus["FAILED"] = "FAILED";
})(AgentEventStatus || (exports.AgentEventStatus = AgentEventStatus = {}));
//# sourceMappingURL=agent-events.js.map