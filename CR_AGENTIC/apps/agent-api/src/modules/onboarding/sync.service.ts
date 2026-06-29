import { Injectable } from '@nestjs/common';
import { prisma } from '@cr-agentic/database';
import { writeAuditLog } from '@cr-agentic/observability';
import { CourseRepClient } from '../../integrations/course-rep/course-rep.client';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class SyncService {
  constructor(
    private readonly courseRep: CourseRepClient,
    private readonly onboarding: OnboardingService,
  ) {}

  /**
   * Pushes the user's selected discovered courses and calendar events to the
   * main Course Rep API. Optional step; failures are surfaced per-section so a
   * partial sync still reports what succeeded.
   */
  async syncToCourseRep(userId: string, sessionId: string) {
    const session = await this.onboarding.requireSession(userId, sessionId);

    const courses = await prisma.discoveredCourse.findMany({
      where: { onboardingSessionId: sessionId, selected: true },
    });
    const calendarEvents = await prisma.discoveredCalendarEvent.findMany({
      where: { onboardingSessionId: sessionId, selected: true },
    });

    let importedCourses = 0;
    if (courses.length > 0) {
      const result = await this.courseRep.importCourses({
        userId,
        courses: courses.map((c) => ({
          code: c.code ?? c.externalId ?? c.title,
          title: c.title,
          units: c.units ?? undefined,
          instructor: c.instructor ?? undefined,
        })),
      });
      importedCourses = result.imported;
      await prisma.discoveredCourse.updateMany({
        where: { onboardingSessionId: sessionId, selected: true },
        data: { syncedAt: new Date() },
      });
    }

    let syncedEvents = 0;
    for (const event of calendarEvents) {
      await this.courseRep.createStudyPlanEvent({
        userId,
        type: this.mapEventType(event.eventType),
        title: event.title,
        startsAt: event.startsAt ?? undefined,
        endsAt: event.endsAt ?? undefined,
        dueAt: event.startsAt ?? undefined,
      });
      syncedEvents += 1;
    }
    if (syncedEvents > 0) {
      await prisma.discoveredCalendarEvent.updateMany({
        where: { onboardingSessionId: sessionId, selected: true },
        data: { syncedAt: new Date() },
      });
    }

    // Promote the confirmed portal to the main university record (single source of truth).
    if (session.universityId) {
      const account = await prisma.connectedAccount.findFirst({
        where: { onboardingSessionId: sessionId },
        orderBy: { createdAt: 'desc' },
      });
      if (account) {
        await this.courseRep
          .updateUniversityPortal({
            universityId: session.universityId,
            studentPortalUrl: account.lmsBaseUrl,
            lmsType: account.lmsType,
          })
          .catch(() => undefined);
      }
    }

    await prisma.connectedAccount.updateMany({
      where: { onboardingSessionId: sessionId },
      data: { lastSyncAt: new Date() },
    });

    await writeAuditLog({
      actorId: userId,
      action: 'onboarding_synced_to_course_rep',
      resourceType: 'onboarding_session',
      resourceId: sessionId,
      metadata: { importedCourses, syncedEvents },
    });

    return { importedCourses, syncedEvents };
  }

  // Discovered calendar events map to the closest existing study-plan event type.
  private mapEventType(eventType: string | null): string {
    switch ((eventType ?? '').toLowerCase()) {
      case 'exam':
      case 'test':
        return 'test';
      case 'assignment':
        return 'assignment';
      case 'presentation':
        return 'presentation';
      case 'lab':
      case 'practical':
        return 'lab_practical';
      default:
        return 'outside_activity';
    }
  }
}
