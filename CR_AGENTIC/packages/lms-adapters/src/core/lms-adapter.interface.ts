import type { Page } from 'playwright-core';
import { LmsType } from '@cr-agentic/shared';

export interface LmsCourse {
  externalId: string;
  title: string;
  url?: string;
}

export interface LmsMaterial {
  externalId: string;
  title: string;
  url?: string;
  mimeType?: string;
  courseExternalId?: string;
  courseTitle?: string;
}

export interface LmsAnnouncement {
  externalId: string;
  title: string;
  body?: string;
  publishedAt?: string;
}

export interface ILmsAdapter {
  readonly lmsType: LmsType;
  loginUrl(baseUrl: string): string;
  validateSession(page: Page, config?: GenericPortalConfig): Promise<boolean>;
  listCourses(page: Page, config?: GenericPortalConfig): Promise<LmsCourse[]>;
  listMaterials(
    page: Page,
    course: LmsCourse,
    config?: GenericPortalConfig,
  ): Promise<LmsMaterial[]>;
  downloadMaterial(
    page: Page,
    material: LmsMaterial,
    config?: GenericPortalConfig,
  ): Promise<Buffer>;
  parseAnnouncements?(
    page: Page,
    config?: GenericPortalConfig,
  ): Promise<LmsAnnouncement[]>;
}

export interface GenericPortalConfig {
  selectors?: {
    authMarker?: string;
    courseList?: string;
    courseLink?: string;
    courseTitle?: string;
    materialList?: string;
    materialLink?: string;
    materialTitle?: string;
    downloadLink?: string;
  };
  paths?: {
    courses?: string;
    dashboard?: string;
  };
}
