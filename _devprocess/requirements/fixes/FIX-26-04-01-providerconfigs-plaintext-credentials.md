---
id: FIX-26-04-01
feature: FEAT-26-04
epic: EPIC-26
adr-refs: []
plan-refs: [PLAN-25]
audit-refs: [AUDIT-027]
depends-on: []
created: 2026-05-16
---

# FIX-26-04-01: AUDIT-027 H-1 -- providerConfigs[] + legacy_active_models_backup credentials persisted in plaintext

## Symptom

After the EPIC-26 migration ran on a user's setup, `data.json` carried plaintext API keys and AWS credentials in the new `providerConfigs[]` array and in the `legacy_active_models_backup` snapshot. The `_encrypted: true` flag at the top of the settings object was misleading: the encryption pass walked only `activeModels[]`, `embeddingModels[]`, and the per-token plugin-level fields (Copilot, ChatGPT-OAuth, Kilo, Cloudflare, MCP-Server). The new arrays were never added to the switchboard.

## Root cause

`encryptSettingsForSave` and `decryptSettings` in `src/main.ts` were hand-maintained iteration lists. When EPIC-26 introduced `providerConfigs[]` and `legacy_active_models_backup` (both populated by the auto-migration on first plugin load after the EPIC-26 upgrade), the encryption pass was not extended.

Causal chain:

1. Plugin loads. Migration helper copies the user's enabled `activeModels[]` entries into `providerConfigs[i]`, lifting `apiKey` (and Bedrock-specific fields) from the first enabled model per provider type. The same list also lands in `legacy_active_models_backup` as a 1:1 snapshot.
2. `saveSettings()` runs. `encryptSettingsForSave` walks the known field list, encrypts the entries it knows about, sets `_encrypted: true`.
3. The new `providerConfigs[].apiKey` (etc.) values are written to `data.json` in plaintext. The user has no visible cue that the SafeStorage encryption skipped these fields.

## Fix

1. Extracted the credential-walking logic into pure functions in `src/core/security/providerCredentialCrypto.ts`:

   - `encryptProviderCredentialsInPlace(settings, crypter)` walks every entry of `providerConfigs[]` (apiKey, awsApiKey, awsAccessKey, awsSecretKey, awsSessionToken, oauthToken) and `legacy_active_models_backup[]` (same set minus oauthToken). Skips empty / already-encrypted values for idempotence.
   - `decryptProviderCredentialsInPlace` mirrors the encrypt walk.
   - The field-set lives in a single constant per shape (PROVIDER_CRED_KEYS, LEGACY_MODEL_CRED_KEYS) so it cannot drift between the encrypt and decrypt paths.

2. `main.ts encryptSettingsForSave` and `decryptSettings` now delegate to those helpers; the inline credential-key list is gone.

3. The walker is exported as a pure function so it can be unit-tested without booting the full plugin (which is what tripped earlier attempts to test the in-place inline implementation).

## Regression test

`src/core/security/__tests__/providerCredentialCrypto.test.ts` (11 tests):

- per-field encryption coverage for ProviderConfig and the legacy model shape
- idempotence (already-encrypted values stay untouched)
- empty / undefined credential fields are skipped
- round-trip: encrypt then decrypt recovers the original credential set across all six fields
- missing-array tolerance (a settings object without `providerConfigs[]` does not throw)
- **contract test** that locks the credential-key constant: if anyone adds a new secret field to ProviderConfig or the legacy CustomModel shape and forgets to extend the walker, the test fails loudly

All 11 tests green on the first run after the fix. Full suite remains at 1623 / 1651 (28 pre-existing unrelated failures).

## Verification before close

After Sebastian's next plugin reload, `data.json` should show every `providerConfigs[i].apiKey` and every populated AWS / OAuth credential field carrying the SafeStorage encryption prefix. Manual inspection of the user's actual file is recommended as a final sign-off; the regression test covers the code-path, the user-data check covers the rollout.
