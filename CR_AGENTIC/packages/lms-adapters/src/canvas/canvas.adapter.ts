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
 * Canvas (Instructure) adapter. Uses stable DOM under `/courses` and JSON API
 * endpoints where available (`/api/v1/...`).
 */
export class CanvasAdapter implements ILmsAdapter {
  readonly lmsType = LmsType.CANVAS;

  loginUrl(baseUrl: string): string {
    return new URL('/login/canvas', baseUrl).toString();
  }

  async validateSession(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector('#global_nav_profile_link, .ic-app-header', {
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async attemptCredentialLogin(
    page: Page,
    credentials: { username: string; password: string },
  ): Promise<boolean> {
    const base = page.url() || 'https://canvas.instructure.com';
    await page.goto(this.loginUrl(base), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const email = page.locator('#pseudonym_session_unique_id, input[name="pseudonym_session[unique_id]"]').first();
    const password = page.locator('#pseudonym_session_password, input[name="pseudonym_session[password]"]').first();
    const submit = page.locator('button[type="submit"], input[type="submit"]').first();

    if ((await email.count()) === 0 || (await password.count()) === 0) {
      return false;
    }

    await email.fill(credentials.username);
    await password.fill(credentials.password);
    await submit.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);

    const url = page.url().toLowerCase();
    if (url.includes('mfa') || url.includes('oauth') || url.includes('sso') || url.includes('challenge')) {
      return false;
    }
    return this.validateSession(page);
  }

  async listCourses(page: Page): Promise<LmsCourse[]> {
    const base = page.url();
    // Prefer Canvas JSON API when the session cookie grants access.
    try {
      const apiCourses = await page.evaluate(async () => {
        const res = await fetch('/api/v1/courses?enrollment_state=active&per_page=100', {
          credentials: 'include',
        });
        if (!res.ok) return null;
        return (await res.json()) as Array<{ id: number; name: string; course_code?: string }>;
      });
      if (Array.isArray(apiCourses) && apiCourses.length > 0) {
        return apiCourses.map((c) => ({
          externalId: String(c.id),
          title: c.name,
          code: c.course_code,
          url: new URL(`/courses/${c.id}`, base).toString(),
        }));
      }
    } catch {
      // fall through to DOM scrape
    }

    await page.goto(new URL('/courses', base).toString(), {
      waitUntil: 'domcontentloaded',
    });

    const links = await page
      .locator('a[href*="/courses/"]')
      .all()
      .catch(() => []);

    const seen = new Set<string>();
    const courses: LmsCourse[] = [];
    for (const link of links) {
      const href = await link.getAttribute('href');
      const match = href?.match(/\/courses\/(\d+)(?:$|[/?])/);
      if (!match) continue;
      const courseId = match[1];
      if (seen.has(courseId)) continue;
      seen.add(courseId);
      const title = (await link.textContent())?.trim();
      if (!title) continue;
      courses.push({
        externalId: courseId,
        title,
        url: new URL(`/courses/${courseId}`, base).toString(),
      });
    }
    return courses;
  }

  async listAssignments(page: Page): Promise<LmsAssignment[]> {
    const courses = await this.listCourses(page);
    const assignments: LmsAssignment[] = [];

    for (const course of courses.slice(0, 25)) {
      try {
        const apiAssignments = await page.evaluate(async (courseId) => {
          const res = await fetch(
            `/api/v1/courses/${courseId}/assignments?per_page=50&order_by=due_at`,
            { credentials: 'include' },
          );
          if (!res.ok) return null;
          return (await res.json()) as Array<{
            id: number;
            name: string;
            due_at?: string | null;
            html_url?: string;
          }>;
        }, course.externalId);

        if (Array.isArray(apiAssignments)) {
          for (const a of apiAssignments) {
            assignments.push({
              externalId: String(a.id),
              title: a.name,
              courseExternalId: course.externalId,
              courseTitle: course.title,
              dueAt: a.due_at ?? undefined,
              url: a.html_url,
              eventType: /exam|midterm|final/i.test(a.name) ? 'exam' : 'assignment',
            });
          }
          continue;
        }
      } catch {
        // DOM fallback per course
      }

      await page.goto(new URL(`/courses/${course.externalId}/assignments`, page.url()).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      }).catch(() => undefined);

      const rows = await page
        .locator('.ig-title, a[href*="/assignments/"]')
        .all()
        .catch(() => []);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const title = (await row.textContent())?.trim();
        const href = await row.getAttribute('href');
        if (!title) continue;
        assignments.push({
          externalId: href ?? `${course.externalId}-a-${i}`,
          title,
          courseExternalId: course.externalId,
          courseTitle: course.title,
          url: href
            ? href.startsWith('http')
              ? href
              : new URL(href, page.url()).toString()
            : undefined,
          eventType: 'assignment',
        });
      }
    }

    return assignments;
  }

  async listTimetable(page: Page): Promise<LmsTimetableSlot[]> {
    const base = page.url();
    try {
      const events = await page.evaluate(async () => {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 14);
        const res = await fetch(
          `/api/v1/calendar_events?start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}&per_page=100`,
          { credentials: 'include' },
        );
        if (!res.ok) return null;
        return (await res.json()) as Array<{
          id: number;
          title: string;
          start_at?: string;
          end_at?: string;
          location_name?: string;
        }>;
      });

      if (Array.isArray(events)) {
        return events
          .filter((e) => e.title && !/assignment|due/i.test(e.title))
          .map((e) => ({
            externalId: String(e.id),
            title: e.title,
            startsAt: e.start_at,
            endsAt: e.end_at,
            location: e.location_name,
            dayOfWeek: e.start_at ? ((new Date(e.start_at).getUTCDay() + 6) % 7) + 1 : undefined,
          }));
      }
    } catch {
      // fall through
    }

    await page.goto(new URL('/calendar', base).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    }).catch(() => undefined);

    return [];
  }

  async extractProfile(page: Page): Promise<LmsProfile | null> {
    try {
      const profile = await page.evaluate(async () => {
        const res = await fetch('/api/v1/users/self/profile', { credentials: 'include' });
        if (!res.ok) return null;
        return (await res.json()) as {
          name?: string;
          primary_email?: string;
          login_id?: string;
        };
      });
      if (!profile) return null;
      return {
        displayName: profile.name,
        email: profile.primary_email,
        studentId: profile.login_id,
      };
    } catch {
      return null;
    }
  }

  async listMaterials(page: Page, course: LmsCourse): Promise<LmsMaterial[]> {
    const filesUrl = new URL(`/courses/${course.externalId}/files`, page.url()).toString();
    await page.goto(filesUrl, { waitUntil: 'domcontentloaded' });

    const rows = await page
      .locator('[data-testid="files-table-row"], .ef-item-row, a[href*="/files/"]')
      .all()
      .catch(() => []);

    const materials: LmsMaterial[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const link = row.locator('a[href*="/files/"]').first();
      const href =
        (await link.count().catch(() => 0)) > 0
          ? await link.getAttribute('href')
          : await row.getAttribute('href');
      if (!href) continue;
      const title = (await row.textContent())?.trim() || `file-${i}`;
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
    const target = material.url
      ? `${material.url}${material.url.includes('?') ? '&' : '?'}download_frd=1`
      : null;
    if (!target) throw new Error('Material URL missing');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.goto(target),
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

export type CanvasConfig = GenericPortalConfig;
