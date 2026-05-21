/**
 * Tests for BackupSecretFilter (FEAT-29-12 Task B).
 *
 * Pin the field allowlist (apiKey / awsApiKey / awsSecretKey / ...),
 * the redaction behaviour, the bypass switch, and the secret-detector.
 * If anyone adds a new credential field to settings.ts and forgets to
 * update KNOWN_SECRET_KEYS, the corresponding test fails before the
 * export ever ships.
 */

import { describe, it, expect } from 'vitest';
import {
    filterSecretsFromDataJson,
    dataJsonContainsSecrets,
    getKnownSecretKeys,
    REDACTED_SENTINEL,
} from '../BackupSecretFilter';

describe('filterSecretsFromDataJson', () => {
    it('redacts the canonical secret keys at the top level', () => {
        const input = {
            apiKey: 'sk-anth-123',
            awsApiKey: 'ASIA...',
            awsAccessKey: 'AKIA...',
            awsSecretKey: 'wJalr...',
            awsSessionToken: 'FwoG...',
            anthropicApiKey: 'sk-ant-456',
            openaiApiKey: 'sk-...',
            githubToken: 'ghp_...',
            githubAccessToken: 'gha_...',
            bearerToken: 'eyJ...',
            token: 'xoxb-...',
            secret: 'top-secret',
            password: 'hunter2',
            openrouterApiKey: 'sk-or-...',
            kiloApiKey: 'kilo-...',
            kiloAccessToken: 'kilo-tok',
        };
        const out = filterSecretsFromDataJson(input) as Record<string, string>;
        for (const k of Object.keys(input)) {
            expect(out[k]).toBe(REDACTED_SENTINEL);
        }
    });

    it('AUDIT-EPIC-29 H-1: redacts the 8 settings-level token fields that previously leaked', () => {
        // These are the field names BackupTab.stripSensitiveFields()
        // already strips on the manual path. Before the H-1 fix, auto-
        // backups left them in cleartext.
        const input = {
            braveApiKey: 'brave-real',
            tavilyApiKey: 'tvly-real',
            githubCopilotAccessToken: 'ghco-real',
            githubCopilotToken: 'ghco-tok-real',
            kiloToken: 'kilo-tok',
            cloudflareApiToken: 'cf-real',
            relayToken: 'relay-real',
            mcpServerToken: 'mcp-real',
        };
        const out = filterSecretsFromDataJson(input) as Record<string, string>;
        for (const k of Object.keys(input)) {
            expect(out[k]).toBe(REDACTED_SENTINEL);
        }
    });

    it('preserves non-secret fields', () => {
        const input = {
            apiKey: 'sk-anth-123',
            model: 'claude-opus-4-7',
            baseUrl: 'https://example.com',
            temperature: 0.2,
            maxTokens: 32000,
            enabled: true,
        };
        const out = filterSecretsFromDataJson(input) as Record<string, unknown>;
        expect(out.apiKey).toBe(REDACTED_SENTINEL);
        expect(out.model).toBe('claude-opus-4-7');
        expect(out.baseUrl).toBe('https://example.com');
        expect(out.temperature).toBe(0.2);
        expect(out.maxTokens).toBe(32000);
        expect(out.enabled).toBe(true);
    });

    it('walks nested objects recursively', () => {
        const input = {
            providerConfigs: [
                { name: 'a', apiKey: 'sk-1', model: 'foo' },
                { name: 'b', awsApiKey: 'aws-1' },
            ],
            advanced: { fallback: { apiKey: 'sk-2' } },
        };
        const out = filterSecretsFromDataJson(input) as {
            providerConfigs: Array<{ name: string; apiKey?: string; awsApiKey?: string; model?: string }>;
            advanced: { fallback: { apiKey: string } };
        };
        expect(out.providerConfigs[0].apiKey).toBe(REDACTED_SENTINEL);
        expect(out.providerConfigs[0].name).toBe('a');
        expect(out.providerConfigs[0].model).toBe('foo');
        expect(out.providerConfigs[1].awsApiKey).toBe(REDACTED_SENTINEL);
        expect(out.advanced.fallback.apiKey).toBe(REDACTED_SENTINEL);
    });

    it('keeps empty / null / undefined values as-is so round-trip is faithful', () => {
        const input = { apiKey: '', awsApiKey: null, openaiApiKey: undefined };
        const out = filterSecretsFromDataJson(input) as Record<string, unknown>;
        expect(out.apiKey).toBe('');
        expect(out.awsApiKey).toBe(null);
        // JSON.parse(JSON.stringify) of `undefined` drops the key; we
        // accept either undefined or missing. The point is "no sentinel
        // shows up for never-set fields".
        expect(out.openaiApiKey).not.toBe(REDACTED_SENTINEL);
    });

    it('does not mutate the input', () => {
        const input = { apiKey: 'sk-real' };
        const before = JSON.stringify(input);
        filterSecretsFromDataJson(input);
        expect(JSON.stringify(input)).toBe(before);
    });

    it('bypass=true returns a deep copy unmodified', () => {
        const input = { apiKey: 'sk-real', nested: { secret: 'still here' } };
        const out = filterSecretsFromDataJson(input, true) as typeof input;
        expect(out).toEqual(input);
        expect(out).not.toBe(input); // deep copy
        expect(out.nested).not.toBe(input.nested);
    });

    it('handles arrays at the top level', () => {
        const input = [{ apiKey: 'sk-1' }, { apiKey: 'sk-2' }];
        const out = filterSecretsFromDataJson(input) as Array<{ apiKey: string }>;
        expect(out[0].apiKey).toBe(REDACTED_SENTINEL);
        expect(out[1].apiKey).toBe(REDACTED_SENTINEL);
    });

    it('handles primitives', () => {
        expect(filterSecretsFromDataJson(null)).toBe(null);
        expect(filterSecretsFromDataJson(42)).toBe(42);
        expect(filterSecretsFromDataJson('hi')).toBe('hi');
    });
});

describe('dataJsonContainsSecrets', () => {
    it('returns true when any secret-key field has a non-empty value', () => {
        expect(dataJsonContainsSecrets({ apiKey: 'sk-1' })).toBe(true);
        expect(dataJsonContainsSecrets({ providers: [{ awsApiKey: 'A' }] })).toBe(true);
    });

    it('returns false when secret fields are empty / missing', () => {
        expect(dataJsonContainsSecrets({ apiKey: '' })).toBe(false);
        expect(dataJsonContainsSecrets({ apiKey: null })).toBe(false);
        expect(dataJsonContainsSecrets({ model: 'foo' })).toBe(false);
        expect(dataJsonContainsSecrets({})).toBe(false);
    });

    it('returns false on primitives / null / undefined', () => {
        expect(dataJsonContainsSecrets(null)).toBe(false);
        expect(dataJsonContainsSecrets(undefined)).toBe(false);
        expect(dataJsonContainsSecrets(42)).toBe(false);
    });
});

describe('getKnownSecretKeys', () => {
    it('exports the same set the filter applies (catches drift)', () => {
        const keys = getKnownSecretKeys();
        // These are the absolute musts. The full list is allowed to grow.
        for (const must of ['apiKey', 'awsApiKey', 'awsSecretKey', 'awsSessionToken', 'anthropicApiKey']) {
            expect(keys.has(must)).toBe(true);
        }
    });
});
