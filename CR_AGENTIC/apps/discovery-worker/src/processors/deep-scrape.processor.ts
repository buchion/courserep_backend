import type { Page } from 'playwright';
import Redis from 'ioredis';
import { prisma, OnboardingStage, recordOnboardingTransition } from '@cr-agentic/database';
import { createLogger, writeAuditLog } from '@cr-agentic/observability';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import type { DeepScrapePhase, DiscoveryDeepScrapeJob } from '@cr-agentic/shared';
import { LmsAdapterRegistry, GenericPortalAdapter, CanvasAdapter } from '@cr-agentic/lms-adapters';
import { LmsType } from '@cr-agentic/shared';
import type { LlmCompletionClient } from '@cr-agentic/portal-discovery';
import { DiscoveryBrowser } from '../browser/discovery-browser';

const logger = createLogger('deep-scrape-processor');

const PHASE_ORDER: DeepScrapePhase[] = ['courses', 'transcript', 'calendar'];

const TRANSCRIPT_PATHS = ['/transcript', '/results', '/grades', '/academic-record'];
const CALENDAR_PATHS = ['/calendar', '/academic-calendar', '/timetable', '/events'];

export class DeepScrapeProcessor {
  private readonly registry = new LmsAdapterRegistry();

  constructor(
    private readonly redis: Redis,
    private readonly browser: DiscoveryBrowser,
    private readonly llm: LlmCompletionClient,
  ) {
    this.registry.register(new GenericPortalAdapter());
    this.registry.register(new CanvasAdapter());
  }

  async process(job: { data: DiscoveryDeepScrapeJob }): Promise<void> {
    const { connectedAccountId, onboardingSessionId, userId, phase } = job.data;

    const account = await prisma.connectedAccount.findUnique({
      where: { id: connectedAccountId },
      include: {
        browserSessions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!account?.browserSessions[0]) {
      throw new Error('No active browser session for deep scrape');
    }

    const context = await this.browser.contextFromSession(
      account.browserSessions[0].storageStateS3Key,
    );
    const page = await context.newPage();

    try {
      switch (phase) {
        case 'courses':
          await this.scrapeCourses(page, account, onboardingSessionId, userId);
          break;
        case 'transcript':
          await this.scrapeTranscript(page, account.lmsBaseUrl, onboardingSessionId, userId);
          break;
        case 'calendar':
          await this.scrapeCalendar(page, account.lmsBaseUrl, onboardingSessionId, userId);
          break;
      }

      await writeAuditLog({
        actorId: userId,
        action: `deep_scrape_${phase}`,
        resourceType: 'onboarding_session',
        resourceId: onboardingSessionId,
      });

      await this.enqueueNextPhase(job.data);
    } finally {
      await context.close();
    }
  }

  private async enqueueNextPhase(data: DiscoveryDeepScrapeJob): Promise<void> {
    const idx = PHASE_ORDER.indexOf(data.phase);
    const next = PHASE_ORDER[idx + 1];
    if (!next) {
      logger.info({ onboardingSessionId: data.onboardingSessionId }, 'Deep scrape complete');
      return;
    }
    await enqueueJob<DiscoveryDeepScrapeJob>(
      QUEUE_NAMES.DISCOVERY_DEEP_SCRAPE,
      this.redis,
      'deep-scrape',
      { ...data, phase: next },
    );
  }

  private async scrapeCourses(
    page: Page,
    account: { lmsType: string; lmsBaseUrl: string; universityId: string | null },
    onboardingSessionId: string,
    userId: string,
  ): Promise<void> {
    await page.goto(account.lmsBaseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const adapter = this.registry.get(account.lmsType as LmsType);
    const courses = await adapter.listCourses(page).catch(() => []);

    for (const course of courses) {
      await prisma.discoveredCourse.create({
        data: {
          onboardingSessionId,
          userId,
          externalId: course.externalId,
          title: course.title,
        },
      });
    }
    logger.info({ onboardingSessionId, count: courses.length }, 'Scraped courses');
  }

  private async scrapeTranscript(
    page: Page,
    baseUrl: string,
    onboardingSessionId: string,
    userId: string,
  ): Promise<void> {
    const text = await this.collectText(page, baseUrl, TRANSCRIPT_PATHS);
    if (!text) return;

    const extracted = await this.extractJson(
      'Extract the student academic record from the page text. Return STRICT JSON: ' +
        '{"cumulativeGpa": number|null, "gradingScale": object|null, "courseGrades": [{"course": string, "grade": string}]}.',
      text,
    );

    await prisma.discoveredAcademicRecord.create({
      data: {
        onboardingSessionId,
        userId,
        cumulativeGpa:
          typeof extracted.cumulativeGpa === 'number' ? extracted.cumulativeGpa : null,
        gradingScale: (extracted.gradingScale as object) ?? undefined,
        courseGrades: (extracted.courseGrades as object) ?? undefined,
      },
    });
    logger.info({ onboardingSessionId }, 'Scraped transcript');
  }

  private async scrapeCalendar(
    page: Page,
    baseUrl: string,
    onboardingSessionId: string,
    userId: string,
  ): Promise<void> {
    const text = await this.collectText(page, baseUrl, CALENDAR_PATHS);
    if (text) {
      const extracted = await this.extractJson(
        'Extract academic calendar events from the page text. Return STRICT JSON: ' +
          '{"events": [{"title": string, "eventType": string|null, "startsAt": ISO8601|null, "endsAt": ISO8601|null}]}.',
        text,
      );
      const events = Array.isArray(extracted.events) ? extracted.events : [];
      for (const ev of events) {
        if (!ev || typeof ev !== 'object') continue;
        const e = ev as Record<string, unknown>;
        if (typeof e.title !== 'string') continue;
        await prisma.discoveredCalendarEvent.create({
          data: {
            onboardingSessionId,
            userId,
            title: e.title,
            eventType: typeof e.eventType === 'string' ? e.eventType : undefined,
            startsAt: this.parseDate(e.startsAt),
            endsAt: this.parseDate(e.endsAt),
          },
        });
      }
      logger.info({ onboardingSessionId, count: events.length }, 'Scraped calendar');
    }

    // Calendar is the final phase: mark onboarding ready for review.
    const session = await prisma.onboardingSession.findUnique({
      where: { id: onboardingSessionId },
    });
    if (session && session.stage !== OnboardingStage.DEEP_DISCOVERY) {
      await recordOnboardingTransition(
        onboardingSessionId,
        session.stage,
        OnboardingStage.DEEP_DISCOVERY,
      ).catch(() => undefined);
    }
  }

  /** Navigates candidate paths and returns the first page's trimmed body text. */
  private async collectText(
    page: Page,
    baseUrl: string,
    paths: string[],
  ): Promise<string | null> {
    for (const path of paths) {
      try {
        await page.goto(new URL(path, baseUrl).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        const text = (await page.locator('body').innerText()).trim();
        if (text.length > 200) return text.slice(0, 12_000);
      } catch {
        continue;
      }
    }
    return null;
  }

  private async extractJson(
    instruction: string,
    text: string,
  ): Promise<Record<string, unknown>> {
    try {
      const raw = await this.llm.completeJson(instruction, text);
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
