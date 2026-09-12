import type { Page } from 'playwright-core';
import { LmsType } from '@cr-agentic/shared';
import {
  GenericPortalConfig,
  ILmsAdapter,
  LmsAssignment,
  LmsCourse,
  LmsMaterial,
  LmsProfile,
  LmsTimetableSlot,
} from '../core/lms-adapter.interface';

/**
 * Moodle adapter — covers many Nigerian/African student portals that run
 * Moodle or Moodle-like LMS shells.
 */
export class MoodleAdapter implements ILmsAdapter {
  readonly lmsType = LmsType.MOODLE;

  loginUrl(baseUrl: string): string {
    return new URL('/login/index.php', baseUrl).toString();
  }

  async validateSession(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(
        '#page-header, .usermenu, .userbutton, a[href*="/user/profile"]',
        { timeout: 10_000 },
      );
      return true;
    } catch {
      return false;
    }
  }

  async attemptCredentialLogin(
    page: Page,
    credentials: { username: string; password: string },
  ): Promise<boolean> {
    const base = page.url();
    await page.goto(this.loginUrl(base), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const username = page.locator('#username, input[name="username"]').first();
    const password = page.locator('#password, input[name="password"]').first();
    const submit = page.locator('#loginbtn, button[type="submit"], input[type="submit"]').first();

    if ((await username.count()) === 0 || (await password.count()) === 0) {
      return false;
    }

    await username.fill(credentials.username);
    await password.fill(credentials.password);
    await submit.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);

    // MFA / SSO redirects leave us on an auth challenge page.
    const url = page.url().toLowerCase();
    if (
      url.includes('mfa') ||
      url.includes('sso') ||
      url.includes('oauth') ||
      url.includes('captcha') ||
      url.includes('challenge')
    ) {
      return false;
    }

    return this.validateSession(page);
  }

  async listCourses(page: Page): Promise<LmsCourse[]> {
    const base = page.url();
    await page.goto(new URL('/my/courses.php', base).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    }).catch(async () => {
      await page.goto(new URL('/my/', base).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
    });

    const links = await page
      .locator('a[href*="/course/view.php"], .coursename a, .course-listitem a')
      .all()
      .catch(() => []);

    const seen = new Set<string>();
    const courses: LmsCourse[] = [];
    for (const link of links) {
      const href = await link.getAttribute('href');
      if (!href || !href.includes('course')) continue;
      const idMatch = href.match(/[?&]id=(\d+)/);
      const externalId = idMatch?.[1] ?? href;
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      const title = (await link.textContent())?.trim();
      if (!title) continue;
      courses.push({
        externalId,
        title,
        url: href.startsWith('http') ? href : new URL(href, base).toString(),
      });
    }
    return courses;
  }

  async listAssignments(page: Page): Promise<LmsAssignment[]> {
    const base = page.url();
    await page.goto(new URL('/calendar/view.php?view=upcoming', base).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    }).catch(() => undefined);

    const events = await page
      .locator('.event, .calendar_event_course, [data-type="event"]')
      .all()
      .catch(() => []);

    const assignments: LmsAssignment[] = [];
    for (let i = 0; i < events.length; i++) {
      const el = events[i];
      const title =
        (await el.locator('.eventname, .name, a').first().textContent().catch(() => null))?.trim() ||
        (await el.textContent())?.trim();
      if (!title) continue;
      const href = await el.locator('a').first().getAttribute('href').catch(() => null);
      const dueText =
        (await el.locator('.date, .time, time').first().textContent().catch(() => null))?.trim() ??
        undefined;
      const dueAt = dueText ? tryParseDate(dueText) : undefined;
      assignments.push({
        externalId: href ?? `moodle-event-${i}`,
        title,
        dueAt,
        url: href ? (href.startsWith('http') ? href : new URL(href, base).toString()) : undefined,
        eventType: /exam|test|quiz/i.test(title) ? 'exam' : 'assignment',
      });
    }
    return assignments;
  }

  async listTimetable(page: Page): Promise<LmsTimetableSlot[]> {
    const base = page.url();
    await page.goto(new URL('/calendar/view.php?view=month', base).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    }).catch(() => undefined);

    const rows = await page.locator('.event, .calevent').all().catch(() => []);
    const slots: LmsTimetableSlot[] = [];
    for (let i = 0; i < rows.length; i++) {
      const el = rows[i];
      const title =
        (await el.locator('.eventname, .name, a').first().textContent().catch(() => null))?.trim() ||
        (await el.textContent())?.trim();
      if (!title) continue;
      if (/assignment|due|submit|deadline/i.test(title)) continue;
      slots.push({
        externalId: `moodle-slot-${i}-${title.slice(0, 40)}`,
        title,
      });
    }
    return slots;
  }

  async extractProfile(page: Page): Promise<LmsProfile | null> {
    const base = page.url();
    await page.goto(new URL('/user/profile.php', base).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    }).catch(() => undefined);

    const displayName =
      (await page.locator('.page-header-headings h1, .userprofile .fullname').first().textContent().catch(() => null))?.trim() ||
      undefined;
    const email =
      (await page.locator('a[href^="mailto:"]').first().textContent().catch(() => null))?.trim() ||
      undefined;

    if (!displayName && !email) return null;
    return { displayName, email };
  }

  async listMaterials(page: Page, course: LmsCourse): Promise<LmsMaterial[]> {
    if (course.url) {
      await page.goto(course.url, { waitUntil: 'domcontentloaded' });
    }
    const links = await page
      .locator('a[href*="/mod/resource"], a[href*="/pluginfile.php"], a[href*="forcedownload"]')
      .all()
      .catch(() => []);
    const materials: LmsMaterial[] = [];
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = await link.getAttribute('href');
      const title = (await link.textContent())?.trim();
      if (!href || !title) continue;
      materials.push({
        externalId: href,
        title,
        url: href.startsWith('http') ? href : new URL(href, page.url()).toString(),
        courseExternalId: course.externalId,
        courseTitle: course.title,
      });
    }
    return materials;
  }

  async downloadMaterial(page: Page, material: LmsMaterial): Promise<Buffer> {
    if (!material.url) throw new Error('Material URL missing');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.goto(material.url),
    ]);
    const stream = await download.createReadStream();
    if (!stream) throw new Error('Download stream unavailable');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

function tryParseDate(text: string): string | undefined {
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export type MoodleConfig = GenericPortalConfig;
