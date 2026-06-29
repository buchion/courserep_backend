import type { Page } from 'playwright-core';
import { LmsType } from '@cr-agentic/shared';
import {
  GenericPortalConfig,
  ILmsAdapter,
  LmsCourse,
  LmsMaterial,
} from '../core/lms-adapter.interface';

/**
 * Canvas (Instructure) adapter v1. Canvas exposes a stable, near-API DOM under
 * `/courses` and `/courses/:id/files`, so selectors are reliable without a
 * per-university config. Falls back gracefully when markup shifts.
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

  async listCourses(page: Page): Promise<LmsCourse[]> {
    const base = page.url();
    await page.goto(new URL('/courses', base).toString(), {
      waitUntil: 'domcontentloaded',
    });

    // Canvas course list table links to /courses/:id; dashboard cards are a fallback.
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

// `GenericPortalConfig` is part of the shared interface signature; Canvas v1
// relies on stable selectors and ignores it, but accepts it for compatibility.
export type CanvasConfig = GenericPortalConfig;
