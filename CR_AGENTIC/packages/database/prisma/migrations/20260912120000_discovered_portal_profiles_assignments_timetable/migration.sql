-- CreateTable
CREATE TABLE "discovered_portal_profiles" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "studentId" TEXT,
    "departmentName" TEXT,
    "academicLevelName" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_portal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_assignments" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "courseExternalId" TEXT,
    "courseTitle" TEXT,
    "dueAt" TIMESTAMP(3),
    "url" TEXT,
    "eventType" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_timetable_slots" (
    "id" UUID NOT NULL,
    "onboardingSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "courseExternalId" TEXT,
    "courseTitle" TEXT,
    "dayOfWeek" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discovered_portal_profiles_onboardingSessionId_key" ON "discovered_portal_profiles"("onboardingSessionId");

-- CreateIndex
CREATE INDEX "discovered_portal_profiles_userId_idx" ON "discovered_portal_profiles"("userId");

-- CreateIndex
CREATE INDEX "discovered_assignments_onboardingSessionId_idx" ON "discovered_assignments"("onboardingSessionId");

-- CreateIndex
CREATE INDEX "discovered_assignments_userId_idx" ON "discovered_assignments"("userId");

-- CreateIndex
CREATE INDEX "discovered_timetable_slots_onboardingSessionId_idx" ON "discovered_timetable_slots"("onboardingSessionId");

-- CreateIndex
CREATE INDEX "discovered_timetable_slots_userId_idx" ON "discovered_timetable_slots"("userId");

-- AddForeignKey
ALTER TABLE "discovered_portal_profiles" ADD CONSTRAINT "discovered_portal_profiles_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_assignments" ADD CONSTRAINT "discovered_assignments_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_timetable_slots" ADD CONSTRAINT "discovered_timetable_slots_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "onboarding_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
