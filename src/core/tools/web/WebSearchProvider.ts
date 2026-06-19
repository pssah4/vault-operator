/**
 * WebSearchProvider -- provider-level Brave/Tavily search helpers.
 *
 * Extracted from WebSearchTool so non-tool callers (e.g. the
 * IMP-20-06-01 FreshnessVerifier web pass) can reuse the same
 * provider plumbing without going through the agent tool loop.
 */

import { requestUrl } from 'obsidian';

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export type WebSearchProviderName = 'brave' | 'tavily';

const TIMEOUT_MS = 15_000;

export async function searchBrave(
    query: string,
    count: number,
    apiKey: string,
): Promise<WebSearchResult[]> {
    if (!apiKey) {
        throw new Error(
            'Brave API key missing. The user needs to add their Brave Search API key. Setup guide: https://obsilo.app/settings-reference#web-search-settings',
        );
    }

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

    const response = await Promise.race([
        requestUrl({
            url,
            method: 'GET',
            headers: {
                'X-Subscription-Token': apiKey,
                Accept: 'application/json',
            },
            throw: false,
        }),
        new Promise<never>((_, reject) =>
            window.setTimeout(
                () => reject(new Error(`Brave search timed out after ${TIMEOUT_MS / 1000}s`)),
                TIMEOUT_MS,
            ),
        ),
    ]);

    if (response.status >= 400) {
        throw new Error(`Brave API error: HTTP ${response.status}`);
    }

    const data = response.json as Record<string, unknown>;
    const web = data?.web as Record<string, unknown> | undefined;
    const webResults = (web?.results ?? []) as Array<Record<string, unknown>>;

    return webResults.map((r) => ({
        title: (r.title as string) ?? '',
        url: (r.url as string) ?? '',
        snippet: (r.description as string) ?? '',
    }));
}

export async function searchTavily(
    query: string,
    count: number,
    apiKey: string,
): Promise<WebSearchResult[]> {
    if (!apiKey) {
        throw new Error(
            'Tavily API key missing. The user needs to add their Tavily API key. Setup guide: https://obsilo.app/settings-reference#web-search-settings',
        );
    }

    const response = await Promise.race([
        requestUrl({
            url: 'https://api.tavily.com/search',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                num_results: count,
                search_depth: 'basic',
                include_answer: false,
                include_raw_content: false,
            }),
            throw: false,
        }),
        new Promise<never>((_, reject) =>
            window.setTimeout(
                () => reject(new Error(`Tavily search timed out after ${TIMEOUT_MS / 1000}s`)),
                TIMEOUT_MS,
            ),
        ),
    ]);

    if (response.status >= 400) {
        throw new Error(`Tavily API error: HTTP ${response.status}`);
    }

    const data = response.json as Record<string, unknown>;
    const tavilyResults = (data?.results ?? []) as Array<Record<string, unknown>>;

    return tavilyResults.map((r) => ({
        title: (r.title as string) ?? '',
        url: (r.url as string) ?? '',
        snippet: (r.content as string) ?? '',
    }));
}

export async function searchByProvider(
    provider: WebSearchProviderName,
    query: string,
    count: number,
    apiKey: string,
): Promise<WebSearchResult[]> {
    if (provider === 'brave') return searchBrave(query, count, apiKey);
    return searchTavily(query, count, apiKey);
}
