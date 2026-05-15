/**
 * EPIC-26 / FEAT-26-01 / FEAT-26-02 -- tier-resolution helpers.
 *
 * Exercises `resolveActiveProvider`, `resolveTierModel`,
 * `resolveAdvisorModel`, and `providerConfigToCustomModel` against
 * realistic ProviderConfig fixtures. Pure functions, no plugin
 * instantiation, no main.ts import.
 */

import { describe, it, expect } from 'vitest';
import type {
    DiscoveredModel,
    ObsidianAgentSettings,
    ProviderConfig,
} from '../../../types/settings';
import {
    providerConfigToCustomModel,
    resolveActiveProvider,
    resolveAdvisorModel,
    resolveTierModel,
} from '../tierResolution';

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
        id: 'anthropic-main',
        type: 'anthropic',
        enabled: true,
        apiKey: 'sk-test',
        discoveredModels: [
            { id: 'claude-opus-4-6', displayName: 'Opus 4.6', maxOutputTokens: 128_000, autoTier: 'flagship', autoTierSource: 'pattern' },
            { id: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', maxOutputTokens: 64_000, autoTier: 'mid', autoTierSource: 'pattern' },
            { id: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', maxOutputTokens: 8_192, autoTier: 'fast', autoTierSource: 'pattern' },
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

function makeSettings(overrides: Partial<ObsidianAgentSettings> = {}): Pick<ObsidianAgentSettings, 'activeProviderId' | 'providerConfigs'> {
    return {
        activeProviderId: 'anthropic-main',
        providerConfigs: [makeProvider()],
        ...overrides,
    };
}

describe('resolveActiveProvider (EPIC-26 / FEAT-26-02)', () => {
    it('returns null when no provider is active', () => {
        expect(resolveActiveProvider({ activeProviderId: null, providerConfigs: [] })).toBeNull();
    });

    it('returns null when activeProviderId points at a missing entry', () => {
        const settings = makeSettings({ activeProviderId: 'ghost', providerConfigs: [makeProvider()] });
        expect(resolveActiveProvider(settings)).toBeNull();
    });

    it('returns null when the active provider is disabled', () => {
        const settings = makeSettings({ providerConfigs: [makeProvider({ enabled: false })] });
        expect(resolveActiveProvider(settings)).toBeNull();
    });

    it('returns the matching enabled provider', () => {
        const settings = makeSettings();
        expect(resolveActiveProvider(settings)?.id).toBe('anthropic-main');
    });

    it('survives a missing providerConfigs[] field (pre-migration data.json)', () => {
        const settings = {
            activeProviderId: 'anthropic-main',
            providerConfigs: undefined as unknown as ProviderConfig[],
        };
        expect(resolveActiveProvider(settings)).toBeNull();
    });
});

describe('resolveTierModel cascade (EPIC-26 / FEAT-26-01)', () => {
    it('resolves flagship from tierMapping', () => {
        const result = resolveTierModel(makeSettings(), 'flagship');
        expect(result?.name).toBe('claude-opus-4-6');
        expect(result?.apiKey).toBe('sk-test');
    });

    it('prefers tierOverrides over tierMapping', () => {
        const provider = makeProvider({ tierOverrides: { mid: 'claude-opus-4-6' } });
        const result = resolveTierModel(makeSettings({ providerConfigs: [provider] }), 'mid');
        expect(result?.name).toBe('claude-opus-4-6');
    });

    it('cascades flagship -> mid -> fast when higher tiers are empty', () => {
        const provider = makeProvider({ tierMapping: { fast: 'claude-haiku-4-5-20251001' } });
        const result = resolveTierModel(makeSettings({ providerConfigs: [provider] }), 'flagship');
        expect(result?.name).toBe('claude-haiku-4-5-20251001');
    });

    it('cascades mid -> fast when mid is empty', () => {
        const provider = makeProvider({ tierMapping: { fast: 'claude-haiku-4-5-20251001' } });
        const result = resolveTierModel(makeSettings({ providerConfigs: [provider] }), 'mid');
        expect(result?.name).toBe('claude-haiku-4-5-20251001');
    });

    it('does NOT cascade upward (fast tier asks for fast only)', () => {
        const provider = makeProvider({ tierMapping: { mid: 'claude-sonnet-4-6', flagship: 'claude-opus-4-6' } });
        const result = resolveTierModel(makeSettings({ providerConfigs: [provider] }), 'fast');
        expect(result).toBeNull();
    });

    it('returns null when no provider is active (pre-migration fallback signal)', () => {
        expect(resolveTierModel({ activeProviderId: null, providerConfigs: [] }, 'mid')).toBeNull();
    });

    it('returns null when nothing in the cascade is populated', () => {
        const provider = makeProvider({ tierMapping: {}, tierOverrides: {} });
        expect(resolveTierModel(makeSettings({ providerConfigs: [provider] }), 'flagship')).toBeNull();
    });

    it('pulls credentials from the provider config', () => {
        const provider = makeProvider({ apiKey: 'provider-key', baseUrl: 'https://example.api' });
        const result = resolveTierModel(makeSettings({ providerConfigs: [provider] }), 'mid');
        expect(result?.apiKey).toBe('provider-key');
        expect(result?.baseUrl).toBe('https://example.api');
    });

    it('threads maxTokens from the discovered-model entry for the resolved id', () => {
        const result = resolveTierModel(makeSettings(), 'mid');
        expect(result?.maxTokens).toBe(64_000);
    });
});

describe('resolveAdvisorModel (EPIC-26 / FEAT-26-01 / ADR-120)', () => {
    it('returns the flagship model when configured', () => {
        const result = resolveAdvisorModel(makeSettings());
        expect(result?.name).toBe('claude-opus-4-6');
    });

    it('does NOT cascade down', () => {
        const provider = makeProvider({
            tierMapping: { fast: 'claude-haiku-4-5-20251001', mid: 'claude-sonnet-4-6' },
            tierOverrides: {},
        });
        const result = resolveAdvisorModel(makeSettings({ providerConfigs: [provider] }));
        expect(result).toBeNull();
    });

    it('returns null when no provider is active', () => {
        expect(resolveAdvisorModel({ activeProviderId: null, providerConfigs: [] })).toBeNull();
    });

    it('honors tierOverrides.flagship', () => {
        const provider = makeProvider({
            tierMapping: {},
            tierOverrides: { flagship: 'claude-opus-4-6' },
        });
        const result = resolveAdvisorModel(makeSettings({ providerConfigs: [provider] }));
        expect(result?.name).toBe('claude-opus-4-6');
    });

    it('prefers tierOverrides.flagship over tierMapping.flagship', () => {
        const provider = makeProvider({
            tierMapping: { flagship: 'claude-opus-4-6' },
            tierOverrides: { flagship: 'claude-3-5-sonnet-20241022' },
            discoveredModels: [
                ...makeProvider().discoveredModels,
                { id: 'claude-3-5-sonnet-20241022', displayName: 'Sonnet 3.5', autoTier: 'mid' } as DiscoveredModel,
            ],
        });
        const result = resolveAdvisorModel(makeSettings({ providerConfigs: [provider] }));
        expect(result?.name).toBe('claude-3-5-sonnet-20241022');
    });
});

describe('providerConfigToCustomModel (EPIC-26)', () => {
    it('copies apiKey + baseUrl + apiVersion from the provider', () => {
        const provider = makeProvider({
            apiKey: 'sk-abc',
            baseUrl: 'https://example.api',
            apiVersion: '2024-10-21',
        });
        const result = providerConfigToCustomModel(provider, 'claude-opus-4-6');
        expect(result.apiKey).toBe('sk-abc');
        expect(result.baseUrl).toBe('https://example.api');
        expect(result.apiVersion).toBe('2024-10-21');
        expect(result.name).toBe('claude-opus-4-6');
        expect(result.provider).toBe('anthropic');
        expect(result.enabled).toBe(true);
    });

    it('threads AWS Bedrock credentials when present', () => {
        const provider = makeProvider({
            type: 'bedrock',
            awsAuthMode: 'access-key',
            awsRegion: 'eu-central-1',
            awsAccessKey: 'AKIA',
            awsSecretKey: 'sec',
            awsSessionToken: 'tok',
        });
        const result = providerConfigToCustomModel(provider, 'eu.anthropic.claude-opus-4-6-v1');
        expect(result.provider).toBe('bedrock');
        expect(result.awsAuthMode).toBe('access-key');
        expect(result.awsRegion).toBe('eu-central-1');
        expect(result.awsAccessKey).toBe('AKIA');
        expect(result.awsSecretKey).toBe('sec');
        expect(result.awsSessionToken).toBe('tok');
    });

    it('uses the discovered displayName + maxOutputTokens when provided', () => {
        const provider = makeProvider();
        const discovered = provider.discoveredModels.find((m) => m.id === 'claude-opus-4-6');
        const result = providerConfigToCustomModel(provider, 'claude-opus-4-6', discovered);
        expect(result.displayName).toBe('Opus 4.6');
        expect(result.maxTokens).toBe(128_000);
    });

    it('falls back to the bare modelId for displayName when no discovered entry is passed', () => {
        const provider = makeProvider();
        const result = providerConfigToCustomModel(provider, 'unknown-model-x');
        expect(result.displayName).toBe('unknown-model-x');
        expect(result.maxTokens).toBeUndefined();
    });
});
