import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logCacheStat, resetCacheStatAggregation } from '../logCacheStat';

function call(overrides: Partial<Parameters<typeof logCacheStat>[0]> = {}): void {
    logCacheStat({
        provider: 'bedrock',
        model: 'eu.anthropic.claude-haiku-4-5-v1',
        caching: 'on',
        nonCachedInputTokens: 1063,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 120,
        ...overrides,
    });
}

describe('logCacheStat sub-minimum aggregation', () => {
    let debugSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetCacheStatAggregation();
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    });

    afterEach(() => {
        debugSpy.mockRestore();
    });

    it('suppresses the per-call line for a sub-minimum haiku call (read=0, create=0)', () => {
        call();
        expect(debugSpy).not.toHaveBeenCalled();
    });

    it('emits exactly one aggregate line on the 20th suppressed call', () => {
        for (let i = 0; i < 19; i++) call();
        expect(debugSpy).not.toHaveBeenCalled();
        call();
        expect(debugSpy).toHaveBeenCalledTimes(1);
        const line = String(debugSpy.mock.calls[0][0]);
        expect(line).toContain('[CacheStat:bedrock]');
        expect(line).toContain('20 sub-minimum calls aggregated');
        // Bucket reset: the next sub-minimum call is silent again.
        call();
        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the per-call line for a large haiku call with 0% hit rate (poisoned-prefix signal)', () => {
        call({ nonCachedInputTokens: 5000 });
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(String(debugSpy.mock.calls[0][0])).toContain('hitRate=0%');
    });

    it('always emits the per-call line when cacheRead > 0', () => {
        call({ cacheReadTokens: 500 });
        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('always emits the per-call line when cacheCreate > 0', () => {
        call({ cacheCreationTokens: 500 });
        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps caching=OFF small calls unchanged (per-call line)', () => {
        call({ caching: 'OFF' });
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(String(debugSpy.mock.calls[0][0])).toContain('caching=OFF');
    });

    it('uses the 1024 threshold for non-haiku models', () => {
        // 1100 tokens is below the haiku minimum (2048) but above the
        // general minimum (1024), so a sonnet call of this size logs normally.
        call({ model: 'claude-sonnet-4-5', nonCachedInputTokens: 1100 });
        expect(debugSpy).toHaveBeenCalledTimes(1);
        // 900 tokens is below 1024, so the same sonnet call is suppressed.
        call({ model: 'claude-sonnet-4-5', nonCachedInputTokens: 900 });
        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('aggregates per provider|model bucket', () => {
        for (let i = 0; i < 19; i++) call();
        // A different model goes into its own bucket and must not flush the first.
        call({ model: 'claude-sonnet-4-5', nonCachedInputTokens: 900 });
        expect(debugSpy).not.toHaveBeenCalled();
        call();
        expect(debugSpy).toHaveBeenCalledTimes(1);
        expect(String(debugSpy.mock.calls[0][0])).toContain('claude-haiku');
    });
});
