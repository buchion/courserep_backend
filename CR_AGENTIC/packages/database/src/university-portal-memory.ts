import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './index';

/** Successful portal logins required before promoting a URL to studentPortalUrl. */
export const PORTAL_LOGIN_SUCCESS_THRESHOLD = 5;

type PortalSuccessEntry = {
  count: number;
  lastSuccessAt: string;
  lmsType?: string;
};

type PortalHints = {
  portalLoginSuccesses?: Record<string, PortalSuccessEntry>;
  [key: string]: unknown;
};

export function normalizePortalLoginUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase();
    let path = u.pathname || '/';
    if (path.length > 1) path = path.replace(/\/+$/, '');
    u.pathname = path || '/';
    return u.toString().replace(/\/$/, '') || u.origin;
  } catch {
    return url.trim();
  }
}

function normalizeUniversityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Stable cache key: real universityId when present, else name-derived UUID. */
export function universityCacheIdFor(opts: {
  universityId?: string | null;
  universityName: string;
}): string {
  if (opts.universityId) return opts.universityId;
  const h = createHash('sha256')
    .update(`university-cache:name:${normalizeUniversityName(opts.universityName)}`)
    .digest();
  const bytes = Buffer.from(h.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function findUniversityCache(opts: {
  universityId?: string | null;
  universityName: string;
}) {
  if (opts.universityId) {
    const byId = await prisma.universityCache.findUnique({
      where: { universityId: opts.universityId },
    });
    if (byId) return byId;
  }
  const derivedId = universityCacheIdFor({ universityName: opts.universityName });
  const byDerived = await prisma.universityCache.findUnique({
    where: { universityId: derivedId },
  });
  if (byDerived) return byDerived;
  return prisma.universityCache.findFirst({
    where: { name: { equals: opts.universityName, mode: 'insensitive' } },
  });
}

export async function getKnownStudentPortalUrl(opts: {
  universityId?: string | null;
  universityName: string;
}): Promise<string | null> {
  const cache = await findUniversityCache(opts);
  return cache?.studentPortalUrl ?? null;
}

/**
 * Record a successful student portal login. After
 * PORTAL_LOGIN_SUCCESS_THRESHOLD successes for the same URL for a school,
 * sets university_cache.studentPortalUrl so later onboardings can seed it first.
 * Never stores credentials.
 */
export async function recordSuccessfulPortalLogin(opts: {
  universityId?: string | null;
  universityName: string;
  loginUrl: string;
  lmsType?: string | null;
}): Promise<{ count: number; promoted: boolean; studentPortalUrl: string | null }> {
  const url = normalizePortalLoginUrl(opts.loginUrl);
  if (!url || !opts.universityName?.trim()) {
    return { count: 0, promoted: false, studentPortalUrl: null };
  }

  const existing = await findUniversityCache(opts);
  const universityId =
    existing?.universityId ??
    universityCacheIdFor({
      universityId: opts.universityId,
      universityName: opts.universityName,
    });

  const hints = ((existing?.hints ?? {}) as PortalHints) || {};
  const successes: Record<string, PortalSuccessEntry> = {
    ...(hints.portalLoginSuccesses ?? {}),
  };
  const prev = successes[url] ?? { count: 0, lastSuccessAt: '' };
  const next: PortalSuccessEntry = {
    count: prev.count + 1,
    lastSuccessAt: new Date().toISOString(),
    lmsType: opts.lmsType ?? prev.lmsType,
  };
  successes[url] = next;

  let studentPortalUrl = existing?.studentPortalUrl ?? null;
  let promoted = false;
  if (next.count >= PORTAL_LOGIN_SUCCESS_THRESHOLD) {
    const currentKey = studentPortalUrl
      ? normalizePortalLoginUrl(studentPortalUrl)
      : null;
    const currentCount = currentKey ? (successes[currentKey]?.count ?? 0) : 0;
    if (!currentKey || currentKey === url || next.count >= currentCount) {
      studentPortalUrl = url;
      promoted = true;
    }
  }

  const newHints: PortalHints = {
    ...hints,
    portalLoginSuccesses: successes,
  };

  await prisma.universityCache.upsert({
    where: { universityId },
    create: {
      universityId,
      name: opts.universityName,
      studentPortalUrl: promoted ? studentPortalUrl : null,
      lmsType: (opts.lmsType as never) ?? undefined,
      portalDiscoveredAt: promoted ? new Date() : undefined,
      hints: newHints as Prisma.InputJsonValue,
    },
    update: {
      name: opts.universityName,
      hints: newHints as Prisma.InputJsonValue,
      ...(promoted
        ? {
            studentPortalUrl,
            portalDiscoveredAt: new Date(),
            ...(opts.lmsType ? { lmsType: opts.lmsType as never } : {}),
          }
        : {}),
    },
  });

  return {
    count: next.count,
    promoted,
    studentPortalUrl: promoted
      ? studentPortalUrl
      : (existing?.studentPortalUrl ?? null),
  };
}
