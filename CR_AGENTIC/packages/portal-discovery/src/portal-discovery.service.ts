import { LmsType } from '@cr-agentic/shared';
import type {
  DiscoverPortalInput,
  LlmCompletionClient,
  PageMetadata,
  PortalCandidateResult,
  WebSearchClient,
} from './types';
import { fetchPageMetadata } from './tools/page-metadata';
import { classifyLms } from './tools/classify-lms';

const SYSTEM_PROMPT = `You are an assistant that identifies the official student login portal for a university.
You are given web search results and fetched page metadata.
Return STRICT JSON of the form:
{"candidates":[{"loginUrl":"https://...","portalName":"...","lmsType":"CANVAS|MOODLE|BLACKBOARD|BRIGHTSPACE|GOOGLE_CLASSROOM|GENERIC","confidence":0.0,"evidence":["..."]}]}
Rank by likelihood the URL is the real student academic login portal.
Strongly prefer: studentportal.*, portal.*, students.*, LMS hosts (lms/canvas/moodle/blackboard), and paths like /portal/login.
Strongly avoid: WordPress/CMS auth (wp-login.php, /wp-admin), marketing/news/seminar pages, and bare homepages.
Prefer official university domains (.edu, .ac.*, .edu.ng). confidence is between 0 and 1.
Return at most 5 candidates, highest confidence first.`;

const ACADEMIC_TLD_RE = /\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})(\/|$)/i;
const CMS_AUTH_RE =
  /\/wp-login\.php(?:$|\?)|\/wp-admin(?:\/|$)|\/xmlrpc\.php(?:$|\?)|\/user\/login(?:$|\?).*drupal/i;
const PORTAL_HOST_RE =
  /^(studentportal|students|student|portal|myportal|sis|erp)\./i;
const LMS_HOST_RE = /^(lms|canvas|moodle|blackboard|brightspace|elearning|e-learning)\./i;
const CONTENT_PATH_RE =
  /\/(blog|news|seminar|events?|about|admission|wp-content|category|tag)(\/|$)/i;

export class PortalDiscoveryService {
  constructor(
    private readonly search: WebSearchClient,
    private readonly llm: LlmCompletionClient,
    /** Fetch enough seeds that studentportal.* is not dropped when homepage probes expand. */
    private readonly maxPagesToFetch = 12,
  ) {}

  async discover(input: DiscoverPortalInput): Promise<PortalCandidateResult[]> {
    const query = `${input.universityName} student portal login${input.country ? ' ' + input.country : ''}`;
    const results = await this.search.search(query, 8);

    // Priority seeds first so slice(0, maxPagesToFetch) keeps studentportal.* URLs.
    const seeds = new Set<string>();
    for (const url of this.websiteSeedUrls(input.website)) seeds.add(url);
    for (const r of results) seeds.add(r.url);

    const metas = await Promise.all(
      Array.from(seeds)
        .slice(0, this.maxPagesToFetch)
        .map((url) => fetchPageMetadata(url)),
    );

    const enriched = metas.map((meta) => ({
      meta,
      lms: classifyLms(meta),
      heuristic: this.heuristicScore(meta),
    }));

    try {
      const llmCandidates = await this.rankWithLlm(input, enriched);
      const reranked = this.rerankCandidates(llmCandidates, enriched);
      if (reranked.length > 0) return reranked;
    } catch {
      // Fall through to heuristic ranking if the LLM call/parse fails.
    }

    return this.heuristicRanking(enriched);
  }

  /**
   * Probe common student-portal hosts first (e.g. studentportal.unilag.edu.ng/login),
   * then LMS hosts, then weaker same-origin paths that often redirect to WordPress.
   */
  private websiteSeedUrls(website?: string): string[] {
    if (!website) return [];
    try {
      const base = new URL(website);
      const host = base.hostname.replace(/^www\./i, '');
      const origin = base.origin;
      return [
        `https://studentportal.${host}/login`,
        `https://studentportal.${host}`,
        `https://students.${host}/login`,
        `https://students.${host}`,
        `https://student.${host}/login`,
        `https://student.${host}`,
        `https://portal.${host}/login`,
        `https://portal.${host}`,
        `https://myportal.${host}/login`,
        `https://myportal.${host}`,
        `${origin}/portal/login`,
        `${origin}/portal`,
        `${origin}/studentportal`,
        `https://lms.${host}`,
        `https://elearning.${host}`,
        `https://canvas.${host}`,
        `https://moodle.${host}`,
        `https://blackboard.${host}`,
        // Weaker: often CMS login on the marketing site.
        `${origin}/login`,
        `${origin}/student`,
        website,
      ];
    } catch {
      return [website];
    }
  }

  private heuristicScore(meta: PageMetadata): number {
    const url = meta.finalUrl;
    if (CMS_AUTH_RE.test(url)) return 0.05;

    // Failed fetch / empty body — do not promote invented DNS seeds.
    if (!meta.htmlSample && !meta.hasLoginForm && !meta.title) return 0.02;

    let host = '';
    let path = '/';
    try {
      const u = new URL(url);
      host = u.hostname.replace(/^www\./i, '');
      path = u.pathname || '/';
    } catch {
      return 0;
    }

    const title = meta.title ?? '';
    if (/404|403|forbidden|not found|bad gateway|error/i.test(title)) {
      return 0.08;
    }

    let score = 0;
    if (ACADEMIC_TLD_RE.test(url)) score += 0.15;

    if (PORTAL_HOST_RE.test(host)) score += 0.35;
    else if (LMS_HOST_RE.test(host)) score += 0.35;

    if (/\/login\/?$/i.test(path) && (PORTAL_HOST_RE.test(host) || LMS_HOST_RE.test(host))) {
      score += 0.15;
    } else if (/\/(portal|studentportal|students)(\/|$)/i.test(path)) {
      score += 0.12;
    } else if (/login|signin|sso|auth/i.test(path)) {
      score += 0.06;
    }

    // Live login form is the strongest signal that the seed is real.
    if (meta.hasLoginForm) score += 0.4;
    else score -= 0.25;

    if (CONTENT_PATH_RE.test(path)) score -= 0.35;
    if (path === '/' || path === '') score -= 0.15;

    return Math.max(0, Math.min(1, score));
  }

  private heuristicRanking(
    enriched: Array<{
      meta: PageMetadata;
      lms: ReturnType<typeof classifyLms>;
      heuristic: number;
    }>,
  ): PortalCandidateResult[] {
    return enriched
      .filter((e) => e.heuristic >= 0.2 && !CMS_AUTH_RE.test(e.meta.finalUrl))
      .sort((a, b) => b.heuristic - a.heuristic)
      .slice(0, 5)
      .map((e) => ({
        loginUrl: e.meta.finalUrl,
        portalName: e.meta.title,
        lmsType: e.lms.lmsType,
        confidence: Number(e.heuristic.toFixed(2)),
        evidence: this.buildEvidence(e.meta, e.lms),
      }));
  }

  /** Blend LLM order with heuristics so CMS auth never stays on top. */
  private rerankCandidates(
    llmCandidates: PortalCandidateResult[],
    enriched: Array<{ meta: PageMetadata; heuristic: number }>,
  ): PortalCandidateResult[] {
    const heuristicByUrl = new Map(
      enriched.map((e) => [e.meta.finalUrl, e.heuristic] as const),
    );

    return llmCandidates
      .map((c, index) => {
        const heuristic = heuristicByUrl.get(c.loginUrl) ?? this.scoreUrlOnly(c.loginUrl);
        const llmBoost = Math.max(0, 0.2 - index * 0.03);
        let confidence = Math.max(c.confidence * 0.5 + heuristic * 0.5 + llmBoost, heuristic);
        if (CMS_AUTH_RE.test(c.loginUrl)) confidence = Math.min(confidence, 0.05);
        return {
          ...c,
          confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(2)))),
          evidence: CMS_AUTH_RE.test(c.loginUrl)
            ? [...c.evidence, 'demoted cms auth']
            : c.evidence,
        };
      })
      .filter((c) => c.confidence >= 0.2 && !CMS_AUTH_RE.test(c.loginUrl))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  private scoreUrlOnly(url: string): number {
    return this.heuristicScore({
      url,
      finalUrl: url,
      hasLoginForm: false,
      htmlSample: '',
    });
  }

  private buildEvidence(
    meta: PageMetadata,
    lms: ReturnType<typeof classifyLms>,
  ): string[] {
    const evidence: string[] = [];
    if (ACADEMIC_TLD_RE.test(meta.finalUrl)) evidence.push('academic domain');
    try {
      const host = new URL(meta.finalUrl).hostname.replace(/^www\./i, '');
      if (PORTAL_HOST_RE.test(host)) evidence.push('student portal host');
      if (LMS_HOST_RE.test(host)) evidence.push('lms host');
    } catch {
      // ignore
    }
    if (/login|portal|sso|student|signin|auth/i.test(meta.finalUrl)) {
      evidence.push('login keyword in URL');
    }
    if (meta.hasLoginForm) evidence.push('login form detected');
    if (CMS_AUTH_RE.test(meta.finalUrl)) evidence.push('cms auth url');
    if (lms.matchedSignal) evidence.push(`lms signal: ${lms.matchedSignal}`);
    return evidence;
  }

  private async rankWithLlm(
    input: DiscoverPortalInput,
    enriched: Array<{
      meta: PageMetadata;
      lms: ReturnType<typeof classifyLms>;
      heuristic: number;
    }>,
  ): Promise<PortalCandidateResult[]> {
    const context = enriched.map((e) => ({
      url: e.meta.finalUrl,
      title: e.meta.title,
      hasLoginForm: e.meta.hasLoginForm,
      detectedLms: e.lms.lmsType,
      heuristicScore: e.heuristic,
    }));

    const userPrompt = JSON.stringify({
      university: input.universityName,
      country: input.country,
      website: input.website,
      pages: context,
    });

    const raw = await this.llm.completeJson(SYSTEM_PROMPT, userPrompt);
    const parsed = this.parseJson(raw);
    const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];

    return candidates
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
      .map((c) => this.normalizeCandidate(c))
      .filter((c): c is PortalCandidateResult => c !== null)
      .slice(0, 5);
  }

  private normalizeCandidate(
    c: Record<string, unknown>,
  ): PortalCandidateResult | null {
    const loginUrl = typeof c.loginUrl === 'string' ? c.loginUrl : null;
    if (!loginUrl) return null;
    const lmsType = this.coerceLmsType(c.lmsType);
    const confidence = typeof c.confidence === 'number' ? c.confidence : 0.5;
    return {
      loginUrl,
      portalName: typeof c.portalName === 'string' ? c.portalName : undefined,
      lmsType,
      confidence: Math.max(0, Math.min(1, confidence)),
      evidence: Array.isArray(c.evidence)
        ? c.evidence.filter((e): e is string => typeof e === 'string')
        : [],
    };
  }

  private coerceLmsType(value: unknown): LmsType {
    if (typeof value === 'string' && value.toUpperCase() in LmsType) {
      return LmsType[value.toUpperCase() as keyof typeof LmsType];
    }
    return LmsType.GENERIC;
  }

  private parseJson(raw: string): { candidates?: unknown[] } | null {
    try {
      return JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
