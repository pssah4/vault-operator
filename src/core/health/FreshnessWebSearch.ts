/**
 * FreshnessWebSearch -- programmatic Brave/Tavily wrapper for the
 * IMP-20-06-01 verifier loop.
 *
 * Honours the freshness.externalSources.enabled Privacy-Toggle
 * (default OFF, ADR-104 amendment 2026-06-19). On any provider
 * failure the call is fail-closed: the caller sees an empty list
 * and the verifier resolves with verdict=no_external_source.
 */

import type {
    WebSearchProviderName,
    WebSearchResult,
} from '../tools/web/WebSearchProvider';
import { searchByProvider } from '../tools/web/WebSearchProvider';

export type FreshnessWebSearchFn = (
    provider: WebSearchProviderName,
    query: string,
    count: number,
    apiKey: string,
) => Promise<WebSearchResult[]>;

export interface FreshnessWebSearchOptions {
    externalSourcesEnabled: boolean;
    provider: WebSearchProviderName;
    apiKey: string;
    search?: FreshnessWebSearchFn;
}

const MIN_RESULTS = 1;
const MAX_RESULTS = 10;

export class FreshnessWebSearch {
    private readonly searchFn: FreshnessWebSearchFn;

    constructor(private readonly opts: FreshnessWebSearchOptions) {
        this.searchFn = opts.search ?? searchByProvider;
    }

    async search(query: string, numResults: number): Promise<WebSearchResult[]> {
        if (!this.opts.externalSourcesEnabled) return [];
        if (!query.trim()) return [];

        const count = Math.min(Math.max(MIN_RESULTS, numResults), MAX_RESULTS);

        try {
            return await this.searchFn(this.opts.provider, query, count, this.opts.apiKey);
        } catch (error) {
            console.warn('[FreshnessWebSearch] provider failed', error);
            return [];
        }
    }
}
