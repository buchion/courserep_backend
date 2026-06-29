-- AlterEnum
ALTER TYPE "AgentTaskType" ADD VALUE 'DISCOVER_PORTAL';
ALTER TYPE "AgentTaskType" ADD VALUE 'DEEP_ACADEMIC_DISCOVERY';
ALTER TYPE "AgentTaskType" ADD VALUE 'SYNC_TO_MAIN';

-- CreateEnum
CREATE TYPE "OnboardingStage" AS ENUM ('UNIVERSITY_SELECTED', 'PORTAL_DISCOVERING', 'PORTAL_SUGGESTED', 'PORTAL_CONFIRMED', 'AWAITING_LOGIN', 'LOGIN_IN_PROGRESS', 'SESSION_CAPTURED', 'DEEP_DISCOVERY', 'ONBOARDING_COMPLETE', 'REAUTH_REQUIRED', 'CANCELLED', 'FAILED');
CREATE TYPE "PortalCandidateSource" AS ENUM ('WEB_SEARCH', 'UNIVERSITY_CACHE', 'MANUAL', 'OPS_OVERRIDE');
CREATE TYPE "DiscoveryStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "connected_accounts"
    ADD COLUMN "universityId" UUID,
    ADD COLUMN "discoveryStatus" "DiscoveryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN "onboardingSessionId" UUID,
    ADD COLUMN "portalCandidateId" UUID;

-- CreateTable
CREATE TABLE "onboarding_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "universityId" UUID,
    "universityName" TEXT NOT NULL,
    "country" TEXT,
    "website" TEXT,
    "departmentName" TEXT,
    "academicLevelName" TEXT,
    "stage" "OnboardingStage" NOT NULL DEFAULT 'UNIVERSITY_SELECTED',
    "selectedCandidateId" UUID,
    "loginBridgeTokenHash" TEXT,
    "loginBridgeExpiresAt" TIMESTAMP(3),
    "lastError" JSONB,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_candidates" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "loginUrl" TEXT NOT NULL,
    "portalName" TEXT,
    "lmsType" "LmsType" NOT NULL DEFAULT 'GENERIC',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "PortalCandidateSource" NOT NULL DEFAULT 'WEB_SEARCH',
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "university_cache" (
    "id" UUID NOT NULL,
    "universityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "website" TEXT,
    "studentPortalUrl" TEXT,
    "lmsType" "LmsType",
    "portalDiscoveredAt" TIMESTAMP(3),
    "hints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_cache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_adapter_configs" (
    "id" UUID NOT NULL,
    "universityId" UUID,
    "lmsType" "LmsType" NOT NULL DEFAULT 'GENERIC',
    "loginUrl" TEXT,
    "selectors" JSONB,
    "paths" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_adapter_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discovered_courses" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "externalId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "units" INTEGER,
    "semester" TEXT,
    "instructor" TEXT,
    "rawHtmlS3Key" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discovered_academic_records" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cumulativeGpa" DOUBLE PRECISION,
    "gradingScale" JSONB,
    "courseGrades" JSONB,
    "rawTextS3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_academic_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discovered_calendar_events" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_audit_events" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "fromStage" "OnboardingStage",
    "toStage" "OnboardingStage" NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connected_accounts_universityId_idx" ON "connected_accounts"("universityId");
CREATE INDEX "onboarding_sessions_userId_stage_idx" ON "onboarding_sessions"("userId", "stage");
CREATE INDEX "onboarding_sessions_stage_expiresAt_idx" ON "onboarding_sessions"("stage", "expiresAt");
CREATE INDEX "portal_candidates_onboardingSessionId_confidence_idx" ON "portal_candidates"("onboardingSessionId", "confidence");
CREATE UNIQUE INDEX "university_cache_universityId_key" ON "university_cache"("universityId");
CREATE INDEX "university_cache_name_idx" ON "university_cache"("name");
CREATE UNIQUE INDEX "portal_adapter_configs_universityId_lmsType_key" ON "portal_adapter_configs"("universityId", "lmsType");
CREATE INDEX "portal_adapter_configs_lmsType_idx" ON "portal_adapter_configs"("lmsType");
CREATE INDEX "discovered_courses_onboardingSessionId_idx" ON "discovered_courses"("onboardingSessionId");
CREATE INDEX "discovered_courses_userId_idx" ON "discovered_courses"("userId");
CREATE INDEX "discovered_academic_records_onboardingSessionId_idx" ON "discovered_academic_records"("onboardingSessionId");
CREATE INDEX "discovered_calendar_events_onboardingSessionId_idx" ON "discovered_calendar_events"("onboardingSessionId");
CREATE INDEX "onboarding_audit_events_onboardingSessionId_createdAt_idx" ON "onboarding_audit_events"("onboardingSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_portalCandidateId_fkey" FOREIGN KEY ("portalCandidateId") REFERENCES "portal_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portal_candidates" ADD CONSTRAINT "portal_candidates_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovered_courses" ADD CONSTRAINT "discovered_courses_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovered_academic_records" ADD CONSTRAINT "discovered_academic_records_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovered_calendar_events" ADD CONSTRAINT "discovered_calendar_events_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_audit_events" ADD CONSTRAINT "onboarding_audit_events_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
