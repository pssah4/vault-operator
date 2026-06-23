import { describe, it, expect, vi } from 'vitest';
import { InlineWebLookup } from '../InlineWebLookup';

function settings(over: Partial<{
    enabled: boolean;
    provider: 'brave' | 'tavily' | 'none';
    braveApiKey: string;
    tavilyApiKey: string;
}> = {}) {
    return () => ({
        enabled: over.enabled ?? true,
        provider: over.provider ?? 'brave' as const,
        braveApiKey: over.braveApiKey ?? 'k',
        tavilyApiKey: over.tavilyApiKey ?? '',
    });
}

describe('InlineWebLookup', () => {
    it('returns [] when webTools is disabled', async () => {
        const fetchProvider = vi.fn();
        const lookup = new InlineWebLookup({ getWebSettings: settings({ enabled: false }), fetchProvider: fetchProvider as never });
        expect(await lookup.search('x')).toEqual([]);
        expect(fetchProvider).not.toHaveBeenCalled();
    });

    it('returns [] when provider is none', async () => {
        const fetchProvider = vi.fn();
        const lookup = new InlineWebLookup({ getWebSettings: settings({ provider: 'none' }), fetchProvider: fetchProvider as never });
        expect(await lookup.search('x')).toEqual([]);
        expect(fetchProvider).not.toHaveBeenCalled();
    });

    it('returns [] when API key for the picked provider is blank', async () => {
        const fetchProvider = vi.fn();
        const lookup = new InlineWebLookup({ getWebSettings: settings({ provider: 'brave', braveApiKey: '' }), fetchProvider: fetchProvider as never });
        expect(await lookup.search('x')).toEqual([]);
        expect(fetchProvider).not.toHaveBeenCalled();
    });

    it('calls the provider with the right query and maps results', async () => {
        const fetchProvider = vi.fn(async () => [
            { title: 'A', url: 'http://a', snippet: 'foo' },
            { title: 'B', url: 'http://b', snippet: 'bar' },
        ]);
        const lookup = new InlineWebLookup({ getWebSettings: settings(), fetchProvider: fetchProvider as never });
        const out = await lookup.search('lambda calculus', 2);
        expect(fetchProvider).toHaveBeenCalledWith('brave', 'lambda calculus', 2, 'k');
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ title: 'A', url: 'http://a', snippet: 'foo' });
        expect(out[0].score).toBe(1);
        expect(out[1].score).toBe(0.9);
    });

    it('returns [] when the provider call throws', async () => {
        const fetchProvider = vi.fn(async () => { throw new Error('net-fail'); });
        const lookup = new InlineWebLookup({ getWebSettings: settings(), fetchProvider: fetchProvider as never });
        expect(await lookup.search('x')).toEqual([]);
    });

    it('suffixes "definition" for short uppercase acronyms', async () => {
        const fetchProvider = vi.fn(async () => []);
        const lookup = new InlineWebLookup({ getWebSettings: settings(), fetchProvider: fetchProvider as never });
        await lookup.search('IPCC');
        expect(fetchProvider).toHaveBeenCalledWith('brave', 'IPCC definition', 3, 'k');
    });

    it('uses the tavily key when provider is tavily', async () => {
        const fetchProvider = vi.fn(async () => []);
        const lookup = new InlineWebLookup({ getWebSettings: settings({ provider: 'tavily', tavilyApiKey: 'tk' }), fetchProvider: fetchProvider as never });
        await lookup.search('x');
        expect(fetchProvider).toHaveBeenCalledWith('tavily', 'x', 3, 'tk');
    });

    it('returns [] for empty query', async () => {
        const fetchProvider = vi.fn();
        const lookup = new InlineWebLookup({ getWebSettings: settings(), fetchProvider: fetchProvider as never });
        expect(await lookup.search('   ')).toEqual([]);
        expect(fetchProvider).not.toHaveBeenCalled();
    });
});
