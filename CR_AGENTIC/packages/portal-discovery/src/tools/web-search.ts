import type { WebSearchClient, WebSearchResult } from '../types';

/**
 * Serper.dev Google Search wrapper. Serper returns a stable JSON shape and is a
 * common low-cost choice; swap this implementation for Tavily/Bing by providing
 * a different {@link WebSearchClient} to the discovery service.
 */
export class SerperSearchClient implements WebSearchClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly endpoint = 'https://google.serper.dev/search',
  ) {}

  async search(query: string, limit = 8): Promise<WebSearchResult[]> {
    if (!this.apiKey) {
      // Allow heuristic discovery from university website seeds when Serper is unset.
      return [];
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: limit }),
    });
    if (!res.ok) {
      throw new Error(`Web search failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    return (data.organic ?? [])
      .filter((r) => r.link)
      .slice(0, limit)
      .map((r) => ({
        title: r.title ?? r.link!,
        url: r.link!,
        snippet: r.snippet,
      }));
  }
}
