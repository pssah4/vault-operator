import { describe, it, expect, vi } from 'vitest';

import { FreshnessWebSearch } from '../FreshnessWebSearch';
import type { WebSearchResult } from '../../tools/web/WebSearchProvider';

/**
 * IMP-20-06-01 W2-T4. FreshnessWebSearch wraps the configured Brave/
 * Tavily provider and exposes a programmatic search() for the
 * verifier loop. It enforces the freshness.externalSources.enabled
 * Privacy-Toggle (default OFF, ADR-104 amendment).
 */

const STUB_RESULTS: WebSearchResult[] = [
    { title: 'OpenAI Pricing 2026', url: 'https://example.com/a', snippet: 'New pricing tier...' },
];

describe('FreshnessWebSearch (IMP-20-06-01 W2-T4)', () => {
    it('returns [] when externalSources are disabled, never calls the provider', async () => {
        const providerFn = vi.fn().mockResolvedValue(STUB_RESULTS);
        const sut = new FreshnessWebSearch({
            externalSourcesEnabled: false,
            provider: 'brave',
            apiKey: 'x',
            search: providerFn,
        });

        const results = await sut.search('OpenAI', 3);

        expect(results).toEqual([]);
        expect(providerFn).not.toHaveBeenCalled();
    });

    it('delegates to the configured provider when externalSources are enabled', async () => {
        const providerFn = vi.fn().mockResolvedValue(STUB_RESULTS);
        const sut = new FreshnessWebSearch({
            externalSourcesEnabled: true,
            provider: 'brave',
            apiKey: 'KEY',
            search: providerFn,
        });

        const results = await sut.search('OpenAI', 3);

        expect(results).toEqual(STUB_RESULTS);
        expect(providerFn).toHaveBeenCalledWith('brave', 'OpenAI', 3, 'KEY');
    });

    it('returns [] on an empty query without hitting the provider', async () => {
        const providerFn = vi.fn().mockResolvedValue(STUB_RESULTS);
        const sut = new FreshnessWebSearch({
            externalSourcesEnabled: true,
            provider: 'brave',
            apiKey: 'KEY',
            search: providerFn,
        });

        const results = await sut.search('  ', 3);

        expect(results).toEqual([]);
        expect(providerFn).not.toHaveBeenCalled();
    });

    it('returns [] when the provider throws (fail-closed)', async () => {
        const providerFn = vi.fn().mockRejectedValue(new Error('rate limit'));
        const sut = new FreshnessWebSearch({
            externalSourcesEnabled: true,
            provider: 'tavily',
            apiKey: 'KEY',
            search: providerFn,
        });

        const results = await sut.search('OpenAI', 3);

        expect(results).toEqual([]);
        expect(providerFn).toHaveBeenCalled();
    });

    it('clamps numResults into [1, 10]', async () => {
        const providerFn = vi.fn().mockResolvedValue(STUB_RESULTS);
        const sut = new FreshnessWebSearch({
            externalSourcesEnabled: true,
            provider: 'brave',
            apiKey: 'KEY',
            search: providerFn,
        });

        await sut.search('X', 50);
        expect(providerFn).toHaveBeenLastCalledWith('brave', 'X', 10, 'KEY');

        await sut.search('X', 0);
        expect(providerFn).toHaveBeenLastCalledWith('brave', 'X', 1, 'KEY');
    });
});
