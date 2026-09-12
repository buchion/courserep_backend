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
Rank by likelihood the URL is the real student login. Prefer official university domains (.edu, .ac.*),
pages that contain a login form, and URLs containing "login", "portal", "sso", or "student".
Return at most 5 candidates, highest confidence first. confidence is between 0 and 1.`;

const ACADEMIC_TLD_RE = /\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})(\/|$)/i;
const LOGIN_HINT_RE = /(login|portal|sso|student|signin|auth)/i;

export class PortalDiscoveryService {
  constructor(
    private readonly search: WebSearchClient,
    private readonly llm: LlmCompletionClient,
    private readonly maxPagesToFetch = 6,
  ) {}

  async discover(input: DiscoverPortalInput): Promise<PortalCandidateResult[]> {
    const query = `${input.universityName} student portal login${input.country ? ' ' + input.country : ''}`;
    const results = await this.search.search(query, 8);

    const seeds = new Set<string>();
    for (const r of results) seeds.add(r.url);
    for (const url of this.websiteSeedUrls(input.website)) seeds.add(url);

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
      if (llmCandidates.length > 0) return llmCandidates;
    } catch {
      // Fall through to heuristic ranking if the LLM call/parse fails.
    }

    return this.heuristicRanking(enriched);
  }

  /** When web search is unavailable, still probe the school site + common portal hosts. */
  private websiteSeedUrls(website?: string): string[] {
    if (!website) return [];
    const seeds = [website];
    try {
      const base = new URL(website);
      const host = base.hostname.replace(/^www\./i, '');
      const origin = base.origin;
      seeds.push(
        `${origin}/login`,
        `${origin}/student`,
        `${origin}/portal`,
        `https://portal.${host}`,
        `https://lms.${host}`,
        `https://canvas.${host}`,
        `https://moodle.${host}`,
        `https://blackboard.${host}`,
      );
    } catch {
      // Ignore invalid website URLs.
    }
    return seeds;
  }

  private heuristicScore(meta: PageMetadata): number {
    let score = 0;
    if (ACADEMIC_TLD_RE.test(meta.finalUrl)) score += 0.4;
    if (LOGIN_HINT_RE.test(meta.finalUrl)) score += 0.3;
    if (meta.hasLoginForm) score += 0.3;
    return Math.min(1, score);
  }

  private heuristicRanking(
    enriched: Array<{
      meta: PageMetadata;
      lms: ReturnType<typeof classifyLms>;
      heuristic: number;
    }>,
  ): PortalCandidateResult[] {
    return enriched
      .filter((e) => e.heuristic > 0)
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

  private buildEvidence(
    meta: PageMetadata,
    lms: ReturnType<typeof classifyLms>,
  ): string[] {
    const evidence: string[] = [];
    if (ACADEMIC_TLD_RE.test(meta.finalUrl)) evidence.push('academic domain');
    if (LOGIN_HINT_RE.test(meta.finalUrl)) evidence.push('login keyword in URL');
    if (meta.hasLoginForm) evidence.push('login form detected');
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
