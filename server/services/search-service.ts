import type { SearchResult } from '../types.js';
import { ApiError } from '../lib/errors.js';

export function isSearchConfigured(apiKey: string | undefined): boolean {
  return Boolean(apiKey && apiKey.trim().length > 0);
}

export async function searchWeb(query: string, apiKey: string): Promise<SearchResult[]> {
  let response: Response;
  try {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 400),
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new ApiError(504, 'SEARCH_FAILED', 'The web search request timed out.');
    }
    throw new ApiError(502, 'SEARCH_FAILED', 'The web search request failed.');
  }
  if (!response.ok) {
    throw new ApiError(502, 'SEARCH_FAILED', 'The web search provider rejected the request.');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(502, 'SEARCH_FAILED', 'The web search provider returned invalid data.');
  }
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        title: String(record.title ?? 'Untitled result').slice(0, 240),
        url: String(record.url ?? ''),
        snippet: String(record.content ?? '').replace(/\s+/g, ' ').slice(0, 700),
      };
    })
    .filter((item) => /^https?:\/\//i.test(item.url))
    .slice(0, 5);
}
