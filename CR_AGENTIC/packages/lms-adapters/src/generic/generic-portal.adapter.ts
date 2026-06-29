import type { Page } from 'playwright-core';
import { LmsType } from '@cr-agentic/shared';
import {
  GenericPortalConfig,
  ILmsAdapter,
  LmsCourse,
  LmsMaterial,
} from '../core/lms-adapter.interface';

const DEFAULT_CONFIG: GenericPortalConfig = {
  selectors: {
    authMarker: '[data-user-profile], .user-menu, #profile-dropdown',
    courseList: '.course-list, [data-course-list], .courses',
    courseLink: 'a.course-link, [data-course-link]',
    courseTitle: '.course-title, [data-course-title]',
    materialList: '.material-list, [data-materials], .files-list',
    materialLink: 'a.material-link, [data-file-link], a[href*="download"]',
    materialTitle: '.material-title, [data-file-name]',
    downloadLink: 'a[download], a[href*="download"]',
  },
  paths: {
    courses: '/courses',
    dashboard: '/dashboard',
  },
};

export class GenericPortalAdapter implements ILmsAdapter {
  readonly lmsType = LmsType.GENERIC;

  loginUrl(baseUrl: string): string {
    return new URL('/login', baseUrl).toString();
  }

  async validateSession(
    page: Page,
    config: GenericPortalConfig = DEFAULT_CONFIG,
  ): Promise<boolean> {
    const selector = config.selectors?.authMarker ?? DEFAULT_CONFIG.selectors!.authMarker!;
    try {
      await page.waitForSelector(selector, { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  async listCourses(
    page: Page,
    config: GenericPortalConfig = DEFAULT_CONFIG,
  ): Promise<LmsCourse[]> {
    const coursesPath = config.paths?.courses ?? DEFAULT_CONFIG.paths!.courses!;
    const base = page.url();
    const coursesUrl = new URL(coursesPath, base).toString();
    await page.goto(coursesUrl, { waitUntil: 'domcontentloaded' });

    const courseSelector = config.selectors?.courseLink ?? DEFAULT_CONFIG.selectors!.courseLink!;
    const titleSelector = config.selectors?.courseTitle ?? DEFAULT_CONFIG.selectors!.courseTitle!;

    const elements = await page.locator(courseSelector).all();
    const courses: LmsCourse[] = [];

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const href = (await el.getAttribute('href')) ?? `course-${i}`;
      const titleEl = el.locator(titleSelector).first();
      const title =
        (await titleEl.count()) > 0
          ? (await titleEl.textContent())?.trim()
          : (await el.textContent())?.trim();
      if (!title) continue;
      courses.push({
        externalId: href,
        title,
        url: new URL(href, base).toString(),
      });
    }

    return courses;
  }

  async listMaterials(
    page: Page,
    course: LmsCourse,
    config: GenericPortalConfig = DEFAULT_CONFIG,
  ): Promise<LmsMaterial[]> {
    if (course.url) {
      await page.goto(course.url, { waitUntil: 'domcontentloaded' });
    }

    const materialSelector =
      config.selectors?.materialLink ?? DEFAULT_CONFIG.selectors!.materialLink!;
    const titleSelector =
      config.selectors?.materialTitle ?? DEFAULT_CONFIG.selectors!.materialTitle!;

    const elements = await page.locator(materialSelector).all();
    const materials: LmsMaterial[] = [];

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const href = (await el.getAttribute('href')) ?? `material-${i}`;
      const titleEl = el.locator(titleSelector).first();
      const title =
        (await titleEl.count()) > 0
          ? (await titleEl.textContent())?.trim()
          : (await el.textContent())?.trim();
      if (!title) continue;
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

  async downloadMaterial(
    page: Page,
    material: LmsMaterial,
    config: GenericPortalConfig = DEFAULT_CONFIG,
  ): Promise<Buffer> {
    const downloadSelector =
      config.selectors?.downloadLink ?? DEFAULT_CONFIG.selectors!.downloadLink!;

    if (material.url) {
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

    const link = page.locator(downloadSelector).first();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      link.click(),
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

export function createDefaultLmsRegistry(): import('../core/lms-adapter.registry').LmsAdapterRegistry {
  const { LmsAdapterRegistry } = require('../core/lms-adapter.registry');
  const { CanvasAdapter } = require('../canvas/canvas.adapter');
  const registry = new LmsAdapterRegistry();
  registry.register(new GenericPortalAdapter());
  registry.register(new CanvasAdapter());
  return registry;
}
