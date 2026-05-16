/**
 * EPIC-26 / FEAT-26-04 -- migration helper tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CustomModel, ObsidianAgentSettings } from '../../../../types/settings';
import {
    migrateActiveModelsToProviders,
    SCHEMA_VERSION,
} from '../activeModelsToProviders';

function makeModel(overrides: Partial<CustomModel> = {}): CustomModel {
    return {
        name: 'claude-opus-4-6',
        provider: 'anthropic',
        enabled: true,
        apiKey: 'sk-test',
        ...overrides,
    };
}

function makeInputSettings(overrides: Partial<ObsidianAgentSettings> = {}): ObsidianAgentSettings {
    return {
        ...(overrides as ObsidianAgentSettings),
        activeModels: overrides.activeModels ?? [],
        activeModelKey: overrides.activeModelKey ?? '',
        providerConfigs: overrides.providerConfigs ?? [],
        schemaVersion: overrides.schemaVersion,
    } as ObsidianAgentSettings;
}

beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

describe('migrateActiveModelsToProviders -- happy path', () => {
    it('migrates a single-provider setup (Opus + Sonnet + Haiku) into one ProviderConfig with all tier slots filled', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6' }),
                makeModel({ name: 'claude-sonnet-4-6' }),
                makeModel({ name: 'claude-haiku-4-5-20251001' }),
            ],
            activeModelKey: 'claude-sonnet-4-6|anthropic',
        });

        const result = migrateActiveModelsToProviders(settings);

        expect(result.didMigrate).toBe(true);
        expect(result.providerConfigs).toHaveLength(1);
        const provider = result.providerConfigs[0];
        expect(provider.type).toBe('anthropic');
        expect(provider.apiKey).toBe('sk-test');
        expect(provider.tierMapping.flagship).toBe('claude-opus-4-6');
        expect(provider.tierMapping.mid).toBe('claude-sonnet-4-6');
        expect(provider.tierMapping.fast).toBe('claude-haiku-4-5-20251001');
        expect(provider.discoveredModels).toHaveLength(3);
        expect(result.activeProviderId).toBe(provider.id);
        expect(result.schemaVersion).toBe(SCHEMA_VERSION);
        expect(result.summary.providersCreated).toBe(1);
        expect(result.summary.modelsClassified).toBe(3);
        expect(result.summary.activeProviderResolved).toBe(true);
        expect(result.summary.anomalies).toEqual([]);
    });

    it('resolves activeProviderId from activeModelKey', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6' }),
                makeModel({ name: 'gpt-5', provider: 'openai', apiKey: 'sk-openai' }),
            ],
            activeModelKey: 'gpt-5|openai',
        });
        const result = migrateActiveModelsToProviders(settings);
        const openaiProvider = result.providerConfigs.find((p) => p.type === 'openai');
        expect(result.activeProviderId).toBe(openaiProvider?.id);
    });

    it('preserves the original activeModels[] in legacyBackup', () => {
        const original = [makeModel({ name: 'claude-opus-4-6' })];
        const settings = makeInputSettings({ activeModels: original });
        const result = migrateActiveModelsToProviders(settings);
        expect(result.legacyBackup).toEqual(original);
        // Not the same array reference -- snapshot
        expect(result.legacyBackup).not.toBe(original);
    });

    it('multi-provider setup creates one ProviderConfig per type', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6' }),
                makeModel({ name: 'gpt-5', provider: 'openai', apiKey: 'sk-openai' }),
                makeModel({ name: 'gemini-2.5-pro', provider: 'gemini', apiKey: 'sk-gemini' }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        expect(result.providerConfigs).toHaveLength(3);
        const types = result.providerConfigs.map((p) => p.type).sort();
        expect(types).toEqual(['anthropic', 'gemini', 'openai']);
    });
});

describe('migrateActiveModelsToProviders -- anomalies', () => {
    it('flags multi-auth when two CustomModels for the same provider have different API keys', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6', apiKey: 'sk-aaa' }),
                makeModel({ name: 'claude-sonnet-4-6', apiKey: 'sk-bbb' }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        const multiAuth = result.summary.anomalies.filter((a) => a.kind === 'multi-auth');
        expect(multiAuth).toHaveLength(1);
        expect(multiAuth[0].providerType).toBe('anthropic');
        // Both auth groups become separate ProviderConfigs
        expect(result.providerConfigs.filter((p) => p.type === 'anthropic')).toHaveLength(2);
    });

    it('flags missing-flagship when no model in the group classifies to flagship', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-sonnet-4-6' }),
                makeModel({ name: 'claude-haiku-4-5-20251001' }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        const missingFlag = result.summary.anomalies.filter((a) => a.kind === 'missing-flagship');
        expect(missingFlag).toHaveLength(1);
    });

    it('flags manual-tier-required for ollama (no auto-classification)', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'llama-3.1-70b', provider: 'ollama', apiKey: undefined, baseUrl: 'http://localhost:11434' }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        const manualTier = result.summary.anomalies.filter((a) => a.kind === 'manual-tier-required');
        expect(manualTier).toHaveLength(1);
        // Discovered model exists but autoTier is undefined
        const ollamaProvider = result.providerConfigs.find((p) => p.type === 'ollama');
        expect(ollamaProvider?.discoveredModels[0].autoTier).toBeUndefined();
        expect(ollamaProvider?.tierMapping).toEqual({});
    });

    it('ignores disabled models (they stay only in legacyBackup)', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6', enabled: true }),
                makeModel({ name: 'claude-sonnet-4-6', enabled: false }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        const anthropic = result.providerConfigs.find((p) => p.type === 'anthropic');
        expect(anthropic?.discoveredModels.map((m) => m.id)).toEqual(['claude-opus-4-6']);
        // legacyBackup keeps both
        expect(result.legacyBackup).toHaveLength(2);
    });
});

describe('migrateActiveModelsToProviders -- idempotence', () => {
    it('returns a no-op when schemaVersion is already set', () => {
        const settings = makeInputSettings({
            activeModels: [makeModel({ name: 'claude-opus-4-6' })],
            schemaVersion: SCHEMA_VERSION,
        });
        const result = migrateActiveModelsToProviders(settings);
        expect(result.didMigrate).toBe(false);
        expect(result.providerConfigs).toEqual([]);
        expect(result.activeProviderId).toBeNull();
        expect(result.legacyBackup).toEqual([]);
    });

    it('returns a no-op when providerConfigs[] is already populated', () => {
        const settings = makeInputSettings({
            activeModels: [makeModel({ name: 'claude-opus-4-6' })],
            providerConfigs: [
                {
                    id: 'anthropic-main',
                    type: 'anthropic',
                    enabled: true,
                    discoveredModels: [],
                    lastRefreshAt: 0,
                    tierMapping: {},
                    tierOverrides: {},
                },
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        expect(result.didMigrate).toBe(false);
    });

    it('returns a no-op when activeModels[] is empty', () => {
        const settings = makeInputSettings({ activeModels: [] });
        const result = migrateActiveModelsToProviders(settings);
        expect(result.didMigrate).toBe(false);
    });
});

describe('migrateActiveModelsToProviders -- non-mutation', () => {
    it('does not mutate the input settings or model objects', () => {
        const model = makeModel({ name: 'claude-opus-4-6' });
        const settings = makeInputSettings({ activeModels: [model] });
        const snapshot = JSON.parse(JSON.stringify(settings));
        migrateActiveModelsToProviders(settings);
        expect(settings).toEqual(snapshot);
    });
});

// EPIC-26 / FEAT-26-03 -- regression: early migrations set displayName to
// the lowercase enum value ("openrouter", "github-copilot"). The migration
// now writes the human-readable brand label instead.
describe('migrateActiveModelsToProviders -- displayName brand labels', () => {
    it('sets displayName to the brand label, not the lowercase type enum', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6', provider: 'anthropic' }),
                makeModel({ name: 'gpt-5', provider: 'openai', apiKey: 'sk-o' }),
                makeModel({ name: 'gemini-2.5-pro', provider: 'gemini', apiKey: 'sk-g' }),
                makeModel({ name: 'claude-3-opus-20240229', provider: 'openrouter', apiKey: 'sk-r' }),
                makeModel({ name: 'claude-sonnet-4', provider: 'github-copilot', apiKey: '' }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        const byType = new Map(result.providerConfigs.map((p) => [p.type, p.displayName]));
        expect(byType.get('anthropic')).toBe('Anthropic');
        expect(byType.get('openai')).toBe('OpenAI');
        expect(byType.get('gemini')).toBe('Google Gemini');
        expect(byType.get('openrouter')).toBe('OpenRouter');
        expect(byType.get('github-copilot')).toBe('GitHub Copilot');
    });

    it('never sets displayName to the bare type id (would defeat the UX rename)', () => {
        const settings = makeInputSettings({
            activeModels: [
                makeModel({ name: 'claude-opus-4-6', provider: 'anthropic' }),
                makeModel({ name: 'gpt-5', provider: 'openai', apiKey: 'sk-o' }),
            ],
        });
        const result = migrateActiveModelsToProviders(settings);
        for (const p of result.providerConfigs) {
            expect(p.displayName).not.toBe(p.type);
        }
    });
});
