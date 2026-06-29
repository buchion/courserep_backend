import { LmsType } from '@cr-agentic/shared';
import type { PageMetadata } from '../types';

interface Fingerprint {
  lmsType: LmsType;
  patterns: RegExp[];
}

// Ordered by specificity; the first matching fingerprint wins.
const FINGERPRINTS: Fingerprint[] = [
  {
    lmsType: LmsType.CANVAS,
    patterns: [/instructure/i, /canvas-lms/i, /\/login\/canvas/i],
  },
  {
    lmsType: LmsType.MOODLE,
    patterns: [/moodle/i, /\/login\/index\.php/i, /MoodleSession/i],
  },
  {
    lmsType: LmsType.BLACKBOARD,
    patterns: [/blackboard/i, /bb-data/i, /\/webapps\/login/i],
  },
  {
    lmsType: LmsType.BRIGHTSPACE,
    patterns: [/brightspace/i, /d2l\.com/i, /desire2learn/i],
  },
  {
    lmsType: LmsType.GOOGLE_CLASSROOM,
    patterns: [/classroom\.google\.com/i],
  },
];

export interface LmsClassification {
  lmsType: LmsType;
  matchedSignal?: string;
}

/** Detects the LMS platform from a page's URL + HTML fingerprints. */
export function classifyLms(meta: PageMetadata): LmsClassification {
  const haystack = `${meta.finalUrl}\n${meta.htmlSample}`;
  for (const fp of FINGERPRINTS) {
    for (const pattern of fp.patterns) {
      const match = pattern.exec(haystack);
      if (match) {
        return { lmsType: fp.lmsType, matchedSignal: match[0] };
      }
    }
  }
  return { lmsType: LmsType.GENERIC };
}
