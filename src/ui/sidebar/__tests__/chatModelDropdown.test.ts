import { describe, it, expect } from 'vitest';
import type { ProviderConfig } from '../../../types/settings';
import {
    buildChatModelDropdownOptions,
    resolveOverrideModel,
} from '../chatModelDropdown';

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
        id: 'anthropic-main',
        type: 'anthropic',
        enabled: true,
        discoveredModels: [
            { id: 'claude-opus-4-6', displayName: 'Opus 4.6', autoTier: 'flagship' },
            { id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', autoTier: 'mid' },
            { id: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', autoTier: 'fast' },
        ],
        lastRefreshAt: 0,
        tierMapping: {
            fast: 'claude-haiku-4-5-20251001',
            mid: 'claude-sonnet-4-6',
            flagship: 'claude-opus-4-6',
        },
        tierOverrides: {},
        ...overrides,
    };
}

describe('buildChatModelDropdownOptions (EPIC-26 / FEAT-26-05)', () => {
    it('returns only the Auto option when no provider is active', () => {
        const opts = buildChatModelDropdownOptions({
            provider: null,
            autoLabel: 'Auto',
            advisorDisabledLabel: 'advisor disabled',
        });
        expect(opts).toHaveLength(1);
        expect(opts[0]).toMatchObject({ id: 'auto', kind: 'auto', advisorDisabled: true });
        expect(opts[0].label).toContain('advisor disabled');
    });

    it('returns Auto + provider models when configured', () => {
        const opts = buildChatModelDropdownOptions({
            provider: makeProvider(),
            autoLabel: 'Auto',
            advisorDisabledLabel: 'advisor disabled',
        });
        expect(opts).toHaveLength(4);
        expect(opts[0]).toMatchObject({ id: 'auto', kind: 'auto', advisorDisabled: false });
        expect(opts[0].label).toBe('Auto');
        const overrideIds = opts.slice(1).map((o) => o.id);
        expect(overrideIds).toEqual(['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);
    });

    it('marks Auto as advisor-disabled when the flagship slot is empty', () => {
        const provider = makeProvider({
            tierMapping: { fast: 'claude-haiku-4-5-20251001', mid: 'claude-sonnet-4-6' },
            tierOverrides: {},
        });
        const opts = buildChatModelDropdownOptions({
            provider,
            autoLabel: 'Auto',
            advisorDisabledLabel: 'advisor disabled',
        });
        const autoOpt = opts[0];
        expect(autoOpt.kind).toBe('auto');
        if (autoOpt.kind === 'auto') {
            expect(autoOpt.advisorDisabled).toBe(true);
        }
        expect(autoOpt.label).toContain('advisor disabled');
    });

    it('honors tierOverrides.flagship for the advisor-disabled check', () => {
        const provider = makeProvider({
            tierMapping: { fast: 'claude-haiku-4-5-20251001', mid: 'claude-sonnet-4-6' },
            tierOverrides: { flagship: 'claude-opus-4-6' },
        });
        const opts = buildChatModelDropdownOptions({
            provider,
            autoLabel: 'Auto',
            advisorDisabledLabel: 'advisor disabled',
        });
        const autoOpt = opts[0];
        if (autoOpt.kind === 'auto') {
            expect(autoOpt.advisorDisabled).toBe(false);
        }
    });

    it('uses displayName when available, falls back to model id', () => {
        const provider = makeProvider({
            discoveredModels: [
                { id: 'claude-opus-4-6', displayName: 'Opus 4.6', autoTier: 'flagship' },
                { id: 'mystery-model' }, // no displayName
            ],
        });
        const opts = buildChatModelDropdownOptions({
            provider,
            autoLabel: 'Auto',
            advisorDisabledLabel: 'advisor disabled',
        });
        const overrideLabels = opts.slice(1).map((o) => o.label);
        expect(overrideLabels).toEqual(['Opus 4.6', 'mystery-model']);
    });
});

describe('resolveOverrideModel (EPIC-26 / FEAT-26-05)', () => {
    it('returns null for auto', () => {
        expect(resolveOverrideModel(makeProvider(), 'auto')).toBeNull();
    });

    it('returns null when override id is null', () => {
        expect(resolveOverrideModel(makeProvider(), null)).toBeNull();
    });

    it('returns null when provider is null', () => {
        expect(resolveOverrideModel(null, 'claude-opus-4-6')).toBeNull();
    });

    it('returns the matching discovered model entry', () => {
        const m = resolveOverrideModel(makeProvider(), 'claude-sonnet-4-6');
        expect(m?.displayName).toBe('Sonnet 4.6');
    });

    it('returns null for unknown id', () => {
        expect(resolveOverrideModel(makeProvider(), 'ghost')).toBeNull();
    });
});
