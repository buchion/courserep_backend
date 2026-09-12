import type { Page } from 'playwright';
import Redis from 'ioredis';
import { prisma, OnboardingStage, recordOnboardingTransition } from '@cr-agentic/database';
import { createLogger, writeAuditLog } from '@cr-agentic/observability';
import { enqueueJob } from '@cr-agentic/queue';
import { QUEUE_NAMES } from '@cr-agentic/shared';
import type { DeepScrapePhase, DiscoveryDeepScrapeJob } from '@cr-agentic/shared';
import {
  LmsAdapterRegistry,
  GenericPortalAdapter,
  CanvasAdapter,
  MoodleAdapter,
} from '@cr-agentic/lms-adapters';
import type { GenericPortalConfig } from '@cr-agentic/lms-adapters';
import { LmsType } from '@cr-agentic/shared';
import type { LlmCompletionClient } from '@cr-agentic/portal-discovery';
import { DiscoveryBrowser } from '../browser/discovery-browser';

const logger = createLogger('deep-scrape-processor');

const PHASE_ORDER: DeepScrapePhase[] = [
  'profile',
  'courses',
  'assignments',
  'timetable',
];

const ASSIGNMENT_PATHS = ['?pg=home', '/assignments', '/assignment', '/homework', '/coursework', '/calendar'];
const TIMETABLE_PATHS = ['?pg=home', '/timetable', '/schedule', '/calendar', '/academic-calendar', '/events'];
const PROFILE_PATHS = ['?pg=biodata', '?pg=home', '/profile'];

export class DeepScrapeProcessor {
  private readonly registry = new LmsAdapterRegistry();

  constructor(
    private readonly redis: Redis,
    private readonly browser: DiscoveryBrowser,
    private readonly llm: LlmCompletionClient,
  ) {
    this.registry.register(new GenericPortalAdapter());
    this.registry.register(new CanvasAdapter());
    this.registry.register(new MoodleAdapter());
  }


  private async resolvePortalHome(account: {
    id: string;
    lmsBaseUrl: string;
    portalCandidateId?: string | null;
  }): Promise<string> {
    let home = account.lmsBaseUrl;
    if (account.portalCandidateId) {
      const candidate = await prisma.portalCandidate.findUnique({
        where: { id: account.portalCandidateId },
      });
      if (candidate?.loginUrl) {
        try {
          const u = new URL(candidate.loginUrl);
          let path = u.pathname.replace(/\/login\/?$/i, '/');
          if (!path.endsWith('/')) path += '/';
          home = path === '/' ? u.origin : `${u.origin}${path}`;
        } catch {
          home = candidate.loginUrl;
        }
      }
    }
    // Prefer a path-bearing LMS base from the confirmed candidate (e.g. /portalplus/,
    // /studentportal/) over a bare school hub origin whenever we have one.
    return home;
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

    const config = await this.loadAdapterConfig(account.universityId, account.lmsType);
    const context = await this.browser.contextFromSession(
      account.browserSessions[0].storageStateS3Key,
    );
    const page = await context.newPage();

    try {
      try {
        switch (phase) {
          case 'profile':
            await this.scrapeProfile(page, account, onboardingSessionId, userId, config);
            break;
          case 'courses':
            await this.scrapeCourses(page, account, onboardingSessionId, userId, config);
            break;
          case 'assignments':
            await this.scrapeAssignments(page, account, onboardingSessionId, userId, config);
            break;
          case 'timetable':
            await this.scrapeTimetable(page, account, onboardingSessionId, userId, config);
            break;
          case 'transcript':
          case 'calendar':
            // Legacy phases no longer in the default chain; keep no-ops for old jobs.
            break;
        }
      } catch (err) {
        logger.warn(
          { err, onboardingSessionId, phase },
          'Deep scrape phase failed; continuing to next phase',
        );
      }

      await writeAuditLog({
        actorId: userId,
        action: `deep_scrape_${phase}`,
        resourceType: 'onboarding_session',
        resourceId: onboardingSessionId,
      }).catch(() => undefined);

      await this.enqueueNextPhase(job.data);
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  private async enqueueNextPhase(data: DiscoveryDeepScrapeJob): Promise<void> {
    const idx = PHASE_ORDER.indexOf(data.phase);
    const next = idx >= 0 ? PHASE_ORDER[idx + 1] : undefined;
    if (!next) {
      const session = await prisma.onboardingSession.findUnique({
        where: { id: data.onboardingSessionId },
      });
      if (session && session.stage !== OnboardingStage.DEEP_DISCOVERY) {
        await recordOnboardingTransition(
          data.onboardingSessionId,
          session.stage,
          OnboardingStage.DEEP_DISCOVERY,
        ).catch(() => undefined);
      }
      await prisma.connectedAccount.update({
        where: { id: data.connectedAccountId },
        data: { discoveryStatus: 'COMPLETE' },
      }).catch(() => undefined);
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

  private portalPage(home: string, pg: string): string {
    const base = home.includes('?') ? home.replace(/(\?.*)$/, '') : home.replace(/\/?$/, '/');
    const root = base.endsWith('/') ? base : `${base}/`;
    return `${root}?pg=${pg}`;
  }

  private async scrapeProfile(
    page: Page,
    account: { id: string; lmsType: string; lmsBaseUrl: string; portalCandidateId?: string | null },
    onboardingSessionId: string,
    userId: string,
    config?: GenericPortalConfig,
  ): Promise<void> {
    const home = await this.resolvePortalHome(account);
    await this.capturePortalAcademics(page, home, onboardingSessionId, userId);
  }

  /** Semester/result tables via ?pg=result or similar portal query pages. */
  private async scrapeAcademicResults(
    page: Page,
    home: string,
    onboardingSessionId: string,
    userId: string,
  ): Promise<void> {
    const resultUrl = this.portalPage(home, 'result');
    await page.goto(resultUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForSelector('table', { timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const text = ((await page.locator('body').innerText().catch(() => '')) || '').trim();
    if (!/academic session|cgpa|gpa/i.test(text)) {
      logger.warn({ onboardingSessionId, resultUrl, url: page.url() }, 'No GPA table markers');
      return;
    }

    const rows: Array<Record<string, string>> = [];
    const tableText = await page.locator('table').first().innerText().catch(() => '');
    for (const line of tableText.split('\n')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      const sessionIdx = parts.findIndex((p) => /\d{4}\/\d{4}/.test(p));
      if (sessionIdx >= 0 && parts.length - sessionIdx >= 5) {
        const slice = parts.slice(sessionIdx);
        rows.push({
          session: slice[0],
          semester: slice[1],
          level: slice[2],
          cgpa: slice[3],
          gpa: slice[4],
        });
      }
    }
    if (rows.length === 0) {
      logger.warn({ onboardingSessionId, tableText: tableText.slice(0, 300) }, 'GPA rows empty');
      return;
    }

    const latestCgpa = Number(rows[rows.length - 1]?.cgpa);
    await prisma.discoveredAcademicRecord.create({
      data: {
        onboardingSessionId,
        userId,
        cumulativeGpa: Number.isFinite(latestCgpa) ? latestCgpa : undefined,
        courseGrades: rows,
        gradingScale: { source: 'portal-result-table' },
      },
    });
    logger.info({ onboardingSessionId, rows: rows.length }, 'Scraped academic results');
  }

  private async scrapeCourses(
    page: Page,
    account: { id: string; lmsType: string; lmsBaseUrl: string; universityId: string | null; portalCandidateId?: string | null },
    onboardingSessionId: string,
    userId: string,
    config?: GenericPortalConfig,
  ): Promise<void> {
    const home = await this.resolvePortalHome(account);
    logger.info({ onboardingSessionId, home }, 'Deep scrape courses home');

    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    const adapter = this.safeAdapter(account.lmsType);
    const courses = await adapter.listCourses(page, config).catch(() => []);

    for (const course of courses) {
      await prisma.discoveredCourse.create({
        data: {
          onboardingSessionId,
          userId,
          externalId: course.externalId,
          code: course.code,
          title: course.title,
        },
      });
    }
    logger.info({ onboardingSessionId, count: courses.length, home }, 'Scraped courses');

    // Prefer structured signals we already extracted (e.g. programme:<matric>).
    for (const course of courses) {
      const fromExt = /^programme:(.+)$/i.exec(course.externalId || '')?.[1];
      if (!fromExt && !course.title) continue;
      const synthetic = [
        fromExt ? `Matric number: ${fromExt}` : '',
        course.title ? `Programme: ${course.title}` : '',
        course.title || '',
      ]
        .filter(Boolean)
        .join('\n');
      await this.harvestIdentityFromText(
        synthetic,
        onboardingSessionId,
        userId,
        'course-record',
      ).catch((err) => logger.warn({ err, onboardingSessionId }, 'course-record harvest failed'));
      break;
    }

    // Also try live page text when available.
    const dashText = ((await page.locator('body').innerText().catch(() => '')) || '').trim();
    if (dashText.length > 40) {
      await this.harvestIdentityFromText(dashText, onboardingSessionId, userId, 'courses-page').catch(
        (err) => logger.warn({ err, onboardingSessionId }, 'identity harvest failed'),
      );
    }

    // Then try biodata/result pages for richer profile + GPA tables.
    await this.capturePortalAcademics(page, home, onboardingSessionId, userId);
  }


  /**
   * School-agnostic identity harvest: if a page exposes matric/name/email/programme
   * labels or common dashboard patterns, upsert a portal profile. Safe to call often.
   */
  private async harvestIdentityFromText(
    text: string,
    onboardingSessionId: string,
    userId: string,
    source: string,
  ): Promise<boolean> {
    const body = (text || '').trim();
    if (body.length < 20) return false;

    let profile: {
      displayName?: string;
      email?: string;
      studentId?: string;
      departmentName?: string;
      academicLevelName?: string;
    } | null = null;

    const adapter = this.safeAdapter('GENERIC');
    if (adapter instanceof GenericPortalAdapter) {
      profile = adapter.parseLabeledProfile(body);
    }
    if (!profile) {
      const matric = /\b([A-Z]\/[A-Z0-9][A-Z0-9/]+|\d{5,}[A-Z]?\d*)\b/i.exec(body)?.[1];
      const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(body)?.[0];
      const full = /Full Name:\s*([^\n\r]+)/i.exec(body)?.[1]?.trim();
      const nameLine = body
        .split(/\n/)
        .map((l) => l.trim().replace(/\s+/g, ' '))
        .find(
          (l) =>
            /^[A-Z][A-Z\s.'-]{5,}$/.test(l) &&
            !/DASHBOARD|SEMESTER|STATUS|DOWNLOAD|ACADEMIC|CURRENT|COLLEGE|HELP|SETTINGS|PORTAL/i.test(
              l,
            ),
        );
      const programme = /\b((?:ND|HND|B\.?Sc\.?|B\.?Eng\.?|M\.?Sc\.?)\s*\([^)]+\)[^\n]*)/i.exec(
        body,
      )?.[1]?.trim();
      if (!full && !matric && !email && !nameLine) return false;
      profile = {
        displayName: full || nameLine,
        studentId: matric,
        email,
        departmentName: programme,
      };
    }

    await prisma.discoveredPortalProfile.upsert({
      where: { onboardingSessionId },
      create: {
        onboardingSessionId,
        userId,
        displayName: profile.displayName,
        email: profile.email,
        studentId: profile.studentId,
        departmentName: profile.departmentName,
        academicLevelName: profile.academicLevelName,
        rawJson: { ...profile, source },
      },
      update: {
        displayName: profile.displayName ?? undefined,
        email: profile.email ?? undefined,
        studentId: profile.studentId ?? undefined,
        departmentName: profile.departmentName ?? undefined,
        academicLevelName: profile.academicLevelName ?? undefined,
        rawJson: { ...profile, source },
      },
    });
    logger.info(
      { onboardingSessionId, source, studentId: profile.studentId, displayName: profile.displayName },
      'Harvested portal identity',
    );
    return true;
  }

  /** Retrying biodata/result capture used by profile + courses phases. */
  private async capturePortalAcademics(
    page: Page,
    home: string,
    onboardingSessionId: string,
    userId: string,
  ): Promise<void> {
    const existing = await prisma.discoveredPortalProfile.findUnique({
      where: { onboardingSessionId },
    });

    if (!existing) {
      for (const pg of ['home', 'biodata'] as const) {
        try {
          await page.goto(this.portalPage(home, pg), {
            waitUntil: 'domcontentloaded',
            timeout: 25_000,
          });
          if (pg === 'biodata') {
            await page.waitForSelector('text=Full Name', { timeout: 6_000 }).catch(() => undefined);
          }
          await page.waitForTimeout(900);
          const body = ((await page.locator('body').innerText().catch(() => '')) || '').trim();
          const ok = await this.harvestIdentityFromText(
            body,
            onboardingSessionId,
            userId,
            `capture:${pg}`,
          );
          if (ok) break;
        } catch (err) {
          logger.warn({ err, onboardingSessionId, pg }, 'capture page failed');
        }
      }
    }

    const recCount = await prisma.discoveredAcademicRecord.count({
      where: { onboardingSessionId },
    });
    if (recCount === 0) {
      for (const pg of ['result', 'results', 'transcript'] as const) {
        try {
          // scrapeAcademicResults navigates using portalPage(home,'result') internally when home given;
          // for alternate pages, goto first then reuse table parser via temporary home query.
          await page.goto(this.portalPage(home, pg), {
            waitUntil: 'domcontentloaded',
            timeout: 20_000,
          });
          await page.waitForSelector('table', { timeout: 5_000 }).catch(() => undefined);
          const text = ((await page.locator('body').innerText().catch(() => '')) || '').trim();
          if (!/academic session|cgpa|\bgpa\b|transcript|grade/i.test(text)) continue;
          // Parse table in-place (same logic as scrapeAcademicResults) without re-navigation.
          const rows: Array<Record<string, string>> = [];
          const tableText = await page.locator('table').first().innerText().catch(() => '');
          for (const line of tableText.split('\n')) {
            const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
            const sessionIdx = parts.findIndex((p) => /\d{4}\/\d{4}/.test(p));
            if (sessionIdx >= 0 && parts.length - sessionIdx >= 5) {
              const slice = parts.slice(sessionIdx);
              rows.push({
                session: slice[0],
                semester: slice[1],
                level: slice[2],
                cgpa: slice[3],
                gpa: slice[4],
              });
            }
          }
          if (rows.length === 0) continue;
          const latestCgpa = Number(rows[rows.length - 1]?.cgpa);
          await prisma.discoveredAcademicRecord.create({
            data: {
              onboardingSessionId,
              userId,
              cumulativeGpa: Number.isFinite(latestCgpa) ? latestCgpa : undefined,
              courseGrades: rows,
              gradingScale: { source: 'portal-result-table', page: pg },
            },
          });
          logger.info({ onboardingSessionId, rows: rows.length, pg }, 'Scraped academic results');
          break;
        } catch {
          continue;
        }
      }
    }
  }

  private async scrapeAssignments(
    page: Page,
    account: { id: string; lmsType: string; lmsBaseUrl: string; portalCandidateId?: string | null },
    onboardingSessionId: string,
    userId: string,
    config?: GenericPortalConfig,
  ): Promise<void> {
    const home = await this.resolvePortalHome(account);
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const adapter = this.safeAdapter(account.lmsType);
    let assignments =
      (adapter.listAssignments
        ? await adapter.listAssignments(page, config).catch(() => [])
        : []) ?? [];

    if (assignments.length === 0) {
      const text = await this.collectText(page, home, ASSIGNMENT_PATHS);
      if (text) {
        const extracted = await this.extractJson(
          'Extract assignments and deadlines from the page text. Return STRICT JSON: ' +
            '{"assignments": [{"title": string, "dueAt": ISO8601|null, "courseTitle": string|null, ' +
            '"eventType": "assignment"|"exam"|"test"|"quiz"|null}]}.',
          text,
        );
        const list = Array.isArray(extracted.assignments) ? extracted.assignments : [];
        assignments = list
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
          .filter((a) => typeof a.title === 'string')
          .map((a, i) => ({
            externalId: `llm-a-${i}`,
            title: a.title as string,
            courseTitle: typeof a.courseTitle === 'string' ? a.courseTitle : undefined,
            dueAt: typeof a.dueAt === 'string' ? a.dueAt : undefined,
            eventType:
              typeof a.eventType === 'string'
                ? (a.eventType as 'assignment' | 'exam' | 'test' | 'quiz')
                : 'assignment',
          }));
      }
    }

    for (const a of assignments) {
      await prisma.discoveredAssignment.create({
        data: {
          onboardingSessionId,
          userId,
          externalId: a.externalId,
          title: a.title,
          courseExternalId: a.courseExternalId,
          courseTitle: a.courseTitle,
          dueAt: this.parseDate(a.dueAt),
          url: a.url,
          eventType: a.eventType,
        },
      });
    }
    logger.info({ onboardingSessionId, count: assignments.length }, 'Scraped assignments');
  }

  private async scrapeTimetable(
    page: Page,
    account: { id: string; lmsType: string; lmsBaseUrl: string; portalCandidateId?: string | null },
    onboardingSessionId: string,
    userId: string,
    config?: GenericPortalConfig,
  ): Promise<void> {
    const home = await this.resolvePortalHome(account);
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const adapter = this.safeAdapter(account.lmsType);
    let slots =
      (adapter.listTimetable
        ? await adapter.listTimetable(page, config).catch(() => [])
        : []) ?? [];

    if (slots.length === 0) {
      const text = await this.collectText(page, home, TIMETABLE_PATHS);
      if (text) {
        const extracted = await this.extractJson(
          'Extract class timetable / schedule slots. Return STRICT JSON: ' +
            '{"slots": [{"title": string, "dayOfWeek": 1-7|null, "startsAt": ISO8601|null, ' +
            '"endsAt": ISO8601|null, "location": string|null, "courseTitle": string|null}]}.',
          text,
        );
        const list = Array.isArray(extracted.slots) ? extracted.slots : [];
        slots = list
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .filter((s) => typeof s.title === 'string')
          .map((s, i) => ({
            externalId: `llm-slot-${i}`,
            title: s.title as string,
            dayOfWeek: typeof s.dayOfWeek === 'number' ? s.dayOfWeek : undefined,
            startsAt: typeof s.startsAt === 'string' ? s.startsAt : undefined,
            endsAt: typeof s.endsAt === 'string' ? s.endsAt : undefined,
            location: typeof s.location === 'string' ? s.location : undefined,
            courseTitle: typeof s.courseTitle === 'string' ? s.courseTitle : undefined,
          }));
      }
    }

    for (const slot of slots) {
      await prisma.discoveredTimetableSlot.create({
        data: {
          onboardingSessionId,
          userId,
          externalId: slot.externalId,
          title: slot.title,
          courseExternalId: slot.courseExternalId,
          courseTitle: slot.courseTitle,
          dayOfWeek: slot.dayOfWeek,
          startsAt: this.parseDate(slot.startsAt),
          endsAt: this.parseDate(slot.endsAt),
          location: slot.location,
        },
      });
    }
    logger.info({ onboardingSessionId, count: slots.length }, 'Scraped timetable');
  }

  private safeAdapter(lmsType: string) {
    try {
      return this.registry.get(lmsType as LmsType);
    } catch {
      return this.registry.get(LmsType.GENERIC);
    }
  }

  private async loadAdapterConfig(
    universityId: string | null,
    lmsType: string,
  ): Promise<GenericPortalConfig | undefined> {
    if (!universityId) return undefined;
    const row = await prisma.portalAdapterConfig.findUnique({
      where: {
        universityId_lmsType: {
          universityId,
          lmsType: lmsType as never,
        },
      },
    });
    if (!row) return undefined;
    return {
      selectors: (row.selectors as GenericPortalConfig['selectors']) ?? undefined,
      paths: (row.paths as GenericPortalConfig['paths']) ?? undefined,
    };
  }

  private async collectText(
    page: Page,
    baseUrl: string,
    paths: string[],
  ): Promise<string | null> {
    for (const path of paths) {
      try {
        const target = path.startsWith('?')
          ? (() => {
              const u = new URL(baseUrl);
              u.search = path.slice(1);
              return u.toString();
            })()
          : new URL(path, baseUrl).toString();
        await page.goto(target, {
          waitUntil: 'domcontentloaded',
          timeout: 8_000,
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
