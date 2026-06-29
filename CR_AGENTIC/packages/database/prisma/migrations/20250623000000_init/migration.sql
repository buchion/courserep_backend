-- CreateEnum
CREATE TYPE "ConnectedAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'REAUTH_REQUIRED', 'REVOKED');
CREATE TYPE "LmsType" AS ENUM ('GENERIC', 'CANVAS', 'MOODLE', 'BLACKBOARD', 'BRIGHTSPACE', 'GOOGLE_CLASSROOM');
CREATE TYPE "BrowserSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "AgentTaskType" AS ENUM ('CONNECT_LMS', 'REFRESH_SESSION', 'LMS_CHECK', 'LMS_DOWNLOAD', 'PROCESS_DOCUMENT', 'SUMMARIZE', 'GENERATE_FLASHCARDS', 'GENERATE_QUIZ', 'UPDATE_STUDY_PLAN', 'SEND_NOTIFICATION', 'MANUAL_SYNC');
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "TaskRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "DownloadStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('PENDING', 'EXTRACTING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "MemoryCategory" AS ENUM ('PREFERENCES', 'COURSES', 'WEAK_TOPICS', 'STRONG_TOPICS', 'STUDY_SCHEDULE', 'LEARNING_HISTORY', 'AGENT_OBSERVATIONS', 'NOTIFICATION_HISTORY');
CREATE TYPE "AgentEventType" AS ENUM ('LectureUploaded', 'DocumentProcessed', 'FlashcardsGenerated', 'QuizGenerated', 'StudyPlanUpdated', 'AssignmentDue', 'ExamApproaching', 'NewAnnouncement', 'SessionExpired', 'QuizCompleted');
CREATE TYPE "AgentEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');
CREATE TYPE "AgentNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "connected_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lmsType" "LmsType" NOT NULL,
    "lmsBaseUrl" TEXT NOT NULL,
    "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "syncCursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connected_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "browser_sessions" (
    "id" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "storageStateS3Key" TEXT NOT NULL,
    "encryptionKeyId" TEXT NOT NULL DEFAULT 'default',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "status" "BrowserSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL,
    "connectedAccountId" UUID,
    "userId" UUID NOT NULL,
    "taskType" "AgentTaskType" NOT NULL,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "plan" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_runs" (
    "id" UUID NOT NULL,
    "agentTaskId" UUID NOT NULL,
    "status" "TaskRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "workerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" JSONB,
    "screenshotS3Keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lecture_materials" (
    "id" UUID NOT NULL,
    "connectedAccountId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "title" TEXT NOT NULL,
    "mimeType" TEXT,
    "courseExternalId" TEXT,
    "courseTitle" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadStatus" "DownloadStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lecture_materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_documents" (
    "id" UUID NOT NULL,
    "lectureMaterialId" UUID NOT NULL,
    "s3Key" TEXT NOT NULL,
    "checksum" TEXT,
    "pageCount" INTEGER,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "extractedMetadata" JSONB,
    "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "mainMaterialId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "summaries" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokenUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_flashcards" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "explanation" TEXT,
    "topic" TEXT,
    "difficulty" TEXT,
    "mainFlashcardId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_flashcards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_quizzes" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "questions" JSONB NOT NULL,
    "mainQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_quizzes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_memory_entries" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "connectedAccountId" UUID,
    "category" "MemoryCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memory_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_events" (
    "id" UUID NOT NULL,
    "eventType" "AgentEventType" NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "agentTaskId" UUID,
    "payload" JSONB NOT NULL,
    "status" "AgentEventStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "connectedAccountId" UUID,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AgentNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "mainNotificationId" UUID,
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connected_accounts_userId_idx" ON "connected_accounts"("userId");
CREATE INDEX "connected_accounts_status_idx" ON "connected_accounts"("status");
CREATE INDEX "browser_sessions_connectedAccountId_status_idx" ON "browser_sessions"("connectedAccountId", "status");
CREATE UNIQUE INDEX "agent_tasks_idempotencyKey_key" ON "agent_tasks"("idempotencyKey");
CREATE INDEX "agent_tasks_userId_idx" ON "agent_tasks"("userId");
CREATE INDEX "agent_tasks_connectedAccountId_status_idx" ON "agent_tasks"("connectedAccountId", "status");
CREATE INDEX "agent_tasks_taskType_status_idx" ON "agent_tasks"("taskType", "status");
CREATE INDEX "task_runs_agentTaskId_idx" ON "task_runs"("agentTaskId");
CREATE INDEX "task_runs_status_idx" ON "task_runs"("status");
CREATE UNIQUE INDEX "lecture_materials_connectedAccountId_externalId_key" ON "lecture_materials"("connectedAccountId", "externalId");
CREATE INDEX "lecture_materials_connectedAccountId_downloadStatus_idx" ON "lecture_materials"("connectedAccountId", "downloadStatus");
CREATE UNIQUE INDEX "agent_documents_lectureMaterialId_key" ON "agent_documents"("lectureMaterialId");
CREATE INDEX "agent_documents_processingStatus_idx" ON "agent_documents"("processingStatus");
CREATE UNIQUE INDEX "summaries_documentId_key" ON "summaries"("documentId");
CREATE INDEX "agent_flashcards_documentId_idx" ON "agent_flashcards"("documentId");
CREATE INDEX "agent_quizzes_documentId_idx" ON "agent_quizzes"("documentId");
CREATE UNIQUE INDEX "agent_memory_entries_userId_category_key_key" ON "agent_memory_entries"("userId", "category", "key");
CREATE INDEX "agent_memory_entries_userId_category_idx" ON "agent_memory_entries"("userId", "category");
CREATE INDEX "agent_events_status_createdAt_idx" ON "agent_events"("status", "createdAt");
CREATE INDEX "agent_events_userId_idx" ON "agent_events"("userId");
CREATE INDEX "agent_events_eventType_idx" ON "agent_events"("eventType");
CREATE INDEX "agent_notifications_userId_status_idx" ON "agent_notifications"("userId", "status");
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "outbox_events_published_createdAt_idx" ON "outbox_events"("published", "createdAt");

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lecture_materials" ADD CONSTRAINT "lecture_materials_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_documents" ADD CONSTRAINT "agent_documents_lectureMaterialId_fkey" FOREIGN KEY ("lectureMaterialId") REFERENCES "lecture_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "agent_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_flashcards" ADD CONSTRAINT "agent_flashcards_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "agent_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_quizzes" ADD CONSTRAINT "agent_quizzes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "agent_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_memory_entries" ADD CONSTRAINT "agent_memory_entries_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_notifications" ADD CONSTRAINT "agent_notifications_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
