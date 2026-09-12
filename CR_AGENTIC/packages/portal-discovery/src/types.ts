import { LmsType } from '@cr-agentic/shared';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface PageMetadata {
  url: string;
  finalUrl: string;
  title?: string;
  hasLoginForm: boolean;
  htmlSample: string;
}

export interface PortalCandidateResult {
  loginUrl: string;
  portalName?: string;
  lmsType: LmsType;
  confidence: number;
  evidence: string[];
}

export interface DiscoverPortalInput {
  universityName: string;
  country?: string;
  website?: string;
  /** Promoted known-good portal after enough successful logins. */
  knownPortalUrl?: string;
}

/** Minimal completion contract so the package stays provider-agnostic. */
export interface LlmCompletionClient {
  completeJson(systemPrompt: string, userPrompt: string): Promise<string>;
}

/** Pluggable web search backend (Serper, Tavily, Bing, etc.). */
export interface WebSearchClient {
  search(query: string, limit?: number): Promise<WebSearchResult[]>;
}
