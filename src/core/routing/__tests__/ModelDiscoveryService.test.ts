import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ModelDiscoveryService,
    DISCOVERY_CACHE_TTL_MS,
    type ModelFetcher,
    type RawDiscoveredModel,
} from '../ModelDiscoveryService';
import type { ProviderConfig } from '../../../types/settings';

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
        id: 'anthropic-main',
        type: 'anthropic',
        enabled: true,
        discoveredModels: [],
        lastRefreshAt: 0,
        tierMapping: {},
        tierOverrides: {},
        ...overrides,
    };
}

function makeHost(initial: ProviderConfig[]) {
    let store = [...initial];
    return {
        host: {
            getProviderConfigs: () => store,
            saveProviderConfigs: async (next: ProviderConfig[]) => {
                store = next;
            },
        },
        get store() {
            return store;
        },
    };
}

describe('ModelDiscoveryService', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('returns empty array when provider id is unknown', () => {
        const { host } = makeHost([]);
        const svc = new ModelDiscoveryService(host, vi.fn());
        expect(svc.getDiscoveredModels('missing')).toEqual([]);
    });

    it('isStale returns true when cache is empty', () => {
        const { host } = makeHost([makeProvider()]);
        const svc = new ModelDiscoveryService(host, vi.fn());
        expect(svc.isStale('anthropic-main')).toBe(true);
    });

    it('isStale returns false when cache is younger than 24h', () => {
        const now = 1_000_000_000_000;
        const { host } = makeHost([
            makeProvider({
                discoveredModels: [{ id: 'claude-opus-4-6', autoTier: 'flagship' }],
                lastRefreshAt: now - 10 * 60 * 60 * 1000, // 10h ago
            }),
        ]);
        const svc = new ModelDiscoveryService(host, vi.fn(), () => now);
        expect(svc.isStale('anthropic-main')).toBe(false);
    });

    it('isStale returns true when cache is older than 24h', () => {
        const now = 1_000_000_000_000;
        const { host } = makeHost([
            makeProvider({
                discoveredModels: [{ id: 'claude-opus-4-6', autoTier: 'flagship' }],
                lastRefreshAt: now - (DISCOVERY_CACHE_TTL_MS + 1000),
            }),
        ]);
        const svc = new ModelDiscoveryService(host, vi.fn(), () => now);
        expect(svc.isStale('anthropic-main')).toBe(true);
    });

    it('refreshProvider classifies and persists results', async () => {
        const fetcher: ModelFetcher = vi.fn().mockResolvedValue([
            { id: 'claude-opus-4-6' },
            { id: 'claude-sonnet-4-6' },
            { id: 'claude-haiku-4-5-20251001' },
        ] as RawDiscoveredModel[]);

        const harness = makeHost([makeProvider()]);
        const svc = new ModelDiscoveryService(harness.host, fetcher, () => 12345);
        const result = await svc.refreshProvider('anthropic-main');

        expect(result).toHaveLength(3);
        expect(result.find((m) => m.id === 'claude-opus-4-6')?.autoTier).toBe('flagship');
        expect(result.find((m) => m.id === 'claude-sonnet-4-6')?.autoTier).toBe('mid');
        expect(result.find((m) => m.id === 'claude-haiku-4-5-20251001')?.autoTier).toBe('fast');

        const persisted = harness.store[0];
        expect(persisted.lastRefreshAt).toBe(12345);
        expect(persisted.tierMapping).toEqual({
            flagship: 'claude-opus-4-6',
            mid: 'claude-sonnet-4-6',
            fast: 'claude-haiku-4-5-20251001',
        });
        expect(persisted.discoveredModels).toHaveLength(3);
    });

    it('refreshProvider keeps existing cache on fetcher error', async () => {
        const existing = [{ id: 'claude-opus-4-6', autoTier: 'flagship' as const }];
        const fetcher: ModelFetcher = vi.fn().mockRejectedValue(new Error('network down'));
        const harness = makeHost([
            makeProvider({ discoveredModels: existing, lastRefreshAt: 99 }),
        ]);
        const svc = new ModelDiscoveryService(harness.host, fetcher);
        const result = await svc.refreshProvider('anthropic-main');
        expect(result).toEqual(existing);
        expect(harness.store[0].lastRefreshAt).toBe(99); // unchanged
    });

    it('refreshProvider preserves user tierOverrides', async () => {
        const fetcher: ModelFetcher = vi.fn().mockResolvedValue([
            { id: 'claude-opus-4-6' },
            { id: 'claude-sonnet-4-6' },
        ] as RawDiscoveredModel[]);
        const harness = makeHost([
            makeProvider({ tierOverrides: { mid: 'claude-opus-4-6' } }),
        ]);
        const svc = new ModelDiscoveryService(harness.host, fetcher);
        await svc.refreshProvider('anthropic-main');
        expect(harness.store[0].tierOverrides).toEqual({ mid: 'claude-opus-4-6' });
    });

    it('refreshOnStartup refreshes only enabled stale providers', async () => {
        const fetcher: ModelFetcher = vi.fn().mockResolvedValue([
            { id: 'claude-opus-4-6' },
        ] as RawDiscoveredModel[]);
        const harness = makeHost([
            makeProvider({ id: 'p1', enabled: true }),
            makeProvider({ id: 'p2', enabled: false }),
            makeProvider({
                id: 'p3',
                enabled: true,
                discoveredModels: [{ id: 'claude-opus-4-6', autoTier: 'flagship' }],
                lastRefreshAt: Date.now() - 60_000,
            }),
        ]);
        const svc = new ModelDiscoveryService(harness.host, fetcher);
        await svc.refreshOnStartup();

        // p1 stale + enabled -> fetched. p2 disabled -> skipped. p3 fresh -> skipped.
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe('p1');
    });

    it('uses openrouter pricing for classification when pattern misses', async () => {
        const fetcher: ModelFetcher = vi.fn().mockResolvedValue([
            { id: 'some-unknown-model', pricingCompletionUsd: 75 },
        ] as RawDiscoveredModel[]);
        const harness = makeHost([makeProvider({ type: 'openrouter' })]);
        const svc = new ModelDiscoveryService(harness.host, fetcher);
        const result = await svc.refreshProvider('anthropic-main');
        expect(result[0].autoTier).toBe('flagship');
        expect(result[0].autoTierSource).toBe('pricing');
    });

    it('skips classification for local providers', async () => {
        const fetcher: ModelFetcher = vi.fn().mockResolvedValue([
            { id: 'llama-3.1-70b' },
        ] as RawDiscoveredModel[]);
        const harness = makeHost([makeProvider({ type: 'ollama' })]);
        const svc = new ModelDiscoveryService(harness.host, fetcher);
        const result = await svc.refreshProvider('anthropic-main');
        expect(result[0].autoTier).toBeUndefined();
        expect(result[0].autoTierSource).toBeUndefined();
        expect(harness.store[0].tierMapping).toEqual({});
    });
});
