/**
 * AUDIT-027 H-1 regression -- providerConfigs[] + legacy_active_models_backup
 * credentials must be encrypted on save and decrypted on load. Round-trip
 * test against a fake crypter so a future refactor cannot silently drop a
 * field from the credential-walker.
 */

import { describe, it, expect } from 'vitest';
import type { ObsidianAgentSettings, ProviderConfig, CustomModel } from '../../../types/settings';
import {
    encryptProviderCredentialsInPlace,
    decryptProviderCredentialsInPlace,
    __TEST_PROVIDER_CRED_KEYS,
    __TEST_LEGACY_MODEL_CRED_KEYS,
} from '../providerCredentialCrypto';

const ENC_PREFIX = 'enc:test:';
const fakeCrypter = {
    isEncrypted: (v: string) => v.startsWith(ENC_PREFIX),
    encrypt: (v: string) => ENC_PREFIX + v,
    decrypt: (v: string) => v.startsWith(ENC_PREFIX) ? v.slice(ENC_PREFIX.length) : v,
};

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
        id: 'anthropic-main',
        type: 'anthropic',
        enabled: true,
        apiKey: 'sk-cleartext',
        discoveredModels: [],
        lastRefreshAt: 0,
        tierMapping: {},
        tierOverrides: {},
        ...overrides,
    };
}

function makeSettings(overrides: Partial<ObsidianAgentSettings> = {}): ObsidianAgentSettings {
    return {
        providerConfigs: [],
        legacy_active_models_backup: [],
        ...overrides,
    } as ObsidianAgentSettings;
}

describe('encryptProviderCredentialsInPlace (AUDIT-027 H-1)', () => {
    it('encrypts apiKey on every ProviderConfig', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({ apiKey: 'sk-anthropic-key' })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        expect(settings.providerConfigs[0].apiKey).toBe('enc:test:sk-anthropic-key');
    });

    it('encrypts all bedrock credential fields', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({
                type: 'bedrock',
                apiKey: undefined,
                awsApiKey: 'aws-bearer-token',
                awsAccessKey: 'AKIA12345',
                awsSecretKey: 'secret/value',
                awsSessionToken: 'session-tok-xyz',
            })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        const p = settings.providerConfigs[0];
        expect(p.awsApiKey).toBe('enc:test:aws-bearer-token');
        expect(p.awsAccessKey).toBe('enc:test:AKIA12345');
        expect(p.awsSecretKey).toBe('enc:test:secret/value');
        expect(p.awsSessionToken).toBe('enc:test:session-tok-xyz');
    });

    it('encrypts oauthToken when present', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({
                type: 'github-copilot',
                apiKey: undefined,
                oauthToken: 'gho_xyz',
            })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        expect(settings.providerConfigs[0].oauthToken).toBe('enc:test:gho_xyz');
    });

    it('is idempotent (already-encrypted values stay untouched)', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({ apiKey: 'enc:test:sk-anthropic-key' })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        // Should NOT be double-encrypted
        expect(settings.providerConfigs[0].apiKey).toBe('enc:test:sk-anthropic-key');
    });

    it('skips empty / undefined credential fields', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({ apiKey: '', awsApiKey: undefined })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        expect(settings.providerConfigs[0].apiKey).toBe('');
        expect(settings.providerConfigs[0].awsApiKey).toBeUndefined();
    });

    it('encrypts credentials inside legacy_active_models_backup', () => {
        const legacyModel: CustomModel = {
            name: 'claude-opus-4-6',
            provider: 'anthropic',
            enabled: true,
            apiKey: 'sk-legacy-key',
            awsApiKey: 'aws-legacy-key',
            awsAccessKey: 'AKIA-legacy',
            awsSecretKey: 'sec-legacy',
            awsSessionToken: 'sess-legacy',
        };
        const settings = makeSettings({ legacy_active_models_backup: [legacyModel] });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        const m = settings.legacy_active_models_backup![0];
        expect(m.apiKey).toBe('enc:test:sk-legacy-key');
        expect(m.awsApiKey).toBe('enc:test:aws-legacy-key');
        expect(m.awsAccessKey).toBe('enc:test:AKIA-legacy');
        expect(m.awsSecretKey).toBe('enc:test:sec-legacy');
        expect(m.awsSessionToken).toBe('enc:test:sess-legacy');
    });

    it('survives missing providerConfigs[] / legacy_active_models_backup fields', () => {
        const settings = { } as ObsidianAgentSettings;
        expect(() => encryptProviderCredentialsInPlace(settings, fakeCrypter)).not.toThrow();
    });
});

describe('decryptProviderCredentialsInPlace (AUDIT-027 H-1)', () => {
    it('decrypts apiKey on every ProviderConfig', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({ apiKey: 'enc:test:sk-anthropic-key' })],
        });
        decryptProviderCredentialsInPlace(settings, fakeCrypter);
        expect(settings.providerConfigs[0].apiKey).toBe('sk-anthropic-key');
    });

    it('round-trip: encrypt then decrypt returns the original credential set', () => {
        const original = {
            apiKey: 'sk-a',
            awsApiKey: 'aws-b',
            awsAccessKey: 'AKIA-c',
            awsSecretKey: 'sec-d',
            awsSessionToken: 'sess-e',
            oauthToken: 'oauth-f',
        };
        const settings = makeSettings({
            providerConfigs: [makeProvider({ ...original, type: 'bedrock' })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        decryptProviderCredentialsInPlace(settings, fakeCrypter);
        const p = settings.providerConfigs[0];
        expect(p.apiKey).toBe(original.apiKey);
        expect(p.awsApiKey).toBe(original.awsApiKey);
        expect(p.awsAccessKey).toBe(original.awsAccessKey);
        expect(p.awsSecretKey).toBe(original.awsSecretKey);
        expect(p.awsSessionToken).toBe(original.awsSessionToken);
        expect(p.oauthToken).toBe(original.oauthToken);
    });
});

describe('credential key set contract (AUDIT-027 H-1)', () => {
    // Anti-regression: if anyone ADDS a credential field to ProviderConfig
    // or CustomModel and forgets to update the walker, this test catches
    // it by reminding the maintainer to extend the constant.
    it('PROVIDER_CRED_KEYS lists every secret-bearing field on ProviderConfig', () => {
        expect([...__TEST_PROVIDER_CRED_KEYS].sort()).toEqual([
            'apiKey', 'awsAccessKey', 'awsApiKey', 'awsSecretKey',
            'awsSessionToken', 'gatewayHeaderValue', 'oauthToken',
        ].sort());
    });

    it('LEGACY_MODEL_CRED_KEYS lists every secret-bearing field on the legacy backup model', () => {
        expect([...__TEST_LEGACY_MODEL_CRED_KEYS].sort()).toEqual([
            'apiKey', 'awsAccessKey', 'awsApiKey', 'awsSecretKey',
            'awsSessionToken', 'gatewayHeaderValue',
        ].sort());
    });
});

describe('Bedrock gateway credential round-trip (FEAT-26-07)', () => {
    it('encrypts gatewayHeaderValue on a ProviderConfig and decrypts it on load', () => {
        const settings = makeSettings({
            providerConfigs: [makeProvider({
                type: 'bedrock',
                apiKey: undefined,
                awsAuthMode: 'gateway',
                awsRegion: 'eu-central-1',
                baseUrl: 'https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock',
                gatewayHeaderName: 'Ocp-Apim-Subscription-Key',
                gatewayHeaderValue: 'sub-key-cleartext',
            })],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        expect(settings.providerConfigs[0].gatewayHeaderValue).toBe(ENC_PREFIX + 'sub-key-cleartext');
        // Header NAME is not a credential -- must stay plaintext for the UI.
        expect(settings.providerConfigs[0].gatewayHeaderName).toBe('Ocp-Apim-Subscription-Key');

        decryptProviderCredentialsInPlace(settings, fakeCrypter);
        expect(settings.providerConfigs[0].gatewayHeaderValue).toBe('sub-key-cleartext');
    });

    it('encrypts gatewayHeaderValue on a legacy backup CustomModel', () => {
        const settings = makeSettings({
            legacy_active_models_backup: [{
                name: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
                provider: 'bedrock',
                enabled: true,
                awsAuthMode: 'gateway',
                awsRegion: 'eu-central-1',
                gatewayHeaderName: 'Ocp-Apim-Subscription-Key',
                gatewayHeaderValue: 'sub-key-cleartext',
            } as CustomModel],
        });
        encryptProviderCredentialsInPlace(settings, fakeCrypter);
        const m = (settings.legacy_active_models_backup ?? [])[0];
        expect(m?.gatewayHeaderValue).toBe(ENC_PREFIX + 'sub-key-cleartext');
    });
});
