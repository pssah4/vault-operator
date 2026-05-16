/**
 * AUDIT-027 H-1 follow-up -- encrypt / decrypt the per-provider credential
 * fields inside `providerConfigs[]` and `legacy_active_models_backup`.
 *
 * Extracted from main.ts as pure functions so the round-trip behaviour
 * can be unit-tested without booting the full plugin (which pulls in the
 * Obsidian UI runtime).
 *
 * Both walkers mutate the passed settings object IN PLACE -- matching the
 * shape of the existing `decryptSettings` / `encryptSettingsForSave`
 * helpers in main.ts -- so the call sites stay one-line.
 */

import type {
    CustomModel,
    ObsidianAgentSettings,
    ProviderConfig,
} from '../../types/settings';

/**
 * Minimal interface main.ts implements via SafeStorageService.
 * Tests pass a fake that just wraps values with a known prefix.
 */
export interface SettingsCrypter {
    isEncrypted(value: string): boolean;
    encrypt(value: string): string;
    decrypt(value: string): string;
}

/** Credential fields on a ProviderConfig that must be encrypted at rest. */
const PROVIDER_CRED_KEYS: ReadonlyArray<keyof ProviderConfig> = [
    'apiKey',
    'awsApiKey',
    'awsAccessKey',
    'awsSecretKey',
    'awsSessionToken',
    'oauthToken',
];

/** Credential fields on a legacy CustomModel inside the backup array. */
const LEGACY_MODEL_CRED_KEYS: ReadonlyArray<keyof CustomModel> = [
    'apiKey',
    'awsApiKey',
    'awsAccessKey',
    'awsSecretKey',
    'awsSessionToken',
];

/**
 * Encrypt every per-provider credential string that is not already
 * encrypted. Skips empty / undefined fields. Idempotent.
 */
export function encryptProviderCredentialsInPlace(
    settings: ObsidianAgentSettings,
    crypter: SettingsCrypter,
): void {
    for (const provider of settings.providerConfigs ?? []) {
        for (const key of PROVIDER_CRED_KEYS) {
            const val = (provider as unknown as Record<string, unknown>)[key];
            if (typeof val === 'string' && val && !crypter.isEncrypted(val)) {
                (provider as unknown as Record<string, unknown>)[key] = crypter.encrypt(val);
            }
        }
    }
    for (const model of settings.legacy_active_models_backup ?? []) {
        for (const key of LEGACY_MODEL_CRED_KEYS) {
            const val = (model as unknown as Record<string, unknown>)[key];
            if (typeof val === 'string' && val && !crypter.isEncrypted(val)) {
                (model as unknown as Record<string, unknown>)[key] = crypter.encrypt(val);
            }
        }
    }
}

/**
 * Decrypt every per-provider credential string (inverse of the encrypt
 * pass). Tolerates already-plaintext values (caller's crypter should be
 * permissive on the decrypt side).
 */
export function decryptProviderCredentialsInPlace(
    settings: ObsidianAgentSettings,
    crypter: SettingsCrypter,
): void {
    for (const provider of settings.providerConfigs ?? []) {
        for (const key of PROVIDER_CRED_KEYS) {
            const val = (provider as unknown as Record<string, unknown>)[key];
            if (typeof val === 'string' && val) {
                (provider as unknown as Record<string, unknown>)[key] = crypter.decrypt(val);
            }
        }
    }
    for (const model of settings.legacy_active_models_backup ?? []) {
        for (const key of LEGACY_MODEL_CRED_KEYS) {
            const val = (model as unknown as Record<string, unknown>)[key];
            if (typeof val === 'string' && val) {
                (model as unknown as Record<string, unknown>)[key] = crypter.decrypt(val);
            }
        }
    }
}

/** Test-facing helpers so callers can reference the exact key sets without re-listing. */
export const __TEST_PROVIDER_CRED_KEYS = PROVIDER_CRED_KEYS;
export const __TEST_LEGACY_MODEL_CRED_KEYS = LEGACY_MODEL_CRED_KEYS;
