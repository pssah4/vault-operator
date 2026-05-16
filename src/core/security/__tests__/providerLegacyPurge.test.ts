/**
 * EPIC-26 / FEAT-26-04 follow-up -- regression test for purgeProviderLegacyState.
 *
 * Covers:
 *  - last-instance OAuth purge for github-copilot / chatgpt-oauth / kilo-gateway
 *  - multi-instance preservation (shared OAuth token must NOT be cleared
 *    when another instance of the same type still uses it)
 *  - legacy_active_models_backup filtering per provider type
 *  - API-key providers are no-op (their credentials live in the
 *    ProviderConfig that the caller already removed)
 */

import { describe, it, expect } from 'vitest';
import type { ObsidianAgentSettings, ProviderConfig } from '../../../types/settings';
import { purgeProviderLegacyState } from '../providerLegacyPurge';

function makeSettings(overrides: Partial<ObsidianAgentSettings> = {}): ObsidianAgentSettings {
    return {
        providerConfigs: overrides.providerConfigs ?? [],
        legacy_active_models_backup: overrides.legacy_active_models_backup ?? [],
        githubCopilotAccessToken: overrides.githubCopilotAccessToken ?? '',
        githubCopilotToken: overrides.githubCopilotToken ?? '',
        githubCopilotTokenExpiresAt: overrides.githubCopilotTokenExpiresAt ?? 0,
        githubCopilotCustomClientId: overrides.githubCopilotCustomClientId ?? '',
        chatgptOAuthAccessToken: overrides.chatgptOAuthAccessToken ?? '',
        chatgptOAuthRefreshToken: overrides.chatgptOAuthRefreshToken ?? '',
        chatgptOAuthIdToken: overrides.chatgptOAuthIdToken ?? '',
        chatgptOAuthAccountId: overrides.chatgptOAuthAccountId ?? '',
        chatgptOAuthEmail: overrides.chatgptOAuthEmail ?? '',
        chatgptOAuthPlanTier: overrides.chatgptOAuthPlanTier ?? '',
        chatgptOAuthExpiresAt: overrides.chatgptOAuthExpiresAt ?? 0,
        kiloToken: overrides.kiloToken ?? '',
        kiloAuthMode: overrides.kiloAuthMode ?? '',
        kiloOrganizationId: overrides.kiloOrganizationId ?? '',
        kiloAccountLabel: overrides.kiloAccountLabel ?? '',
        kiloLastValidatedAt: overrides.kiloLastValidatedAt ?? 0,
    } as ObsidianAgentSettings;
}

describe('purgeProviderLegacyState (EPIC-26 / FEAT-26-04)', () => {
    it('clears all github-copilot plugin-level tokens when the last copilot provider is removed', () => {
        const settings = makeSettings({
            providerConfigs: [],
            githubCopilotAccessToken: 'gho_aaa',
            githubCopilotToken: 'gho_bbb',
            githubCopilotTokenExpiresAt: 1700000000,
            githubCopilotCustomClientId: 'client-xyz',
        });
        purgeProviderLegacyState(settings, 'github-copilot');
        expect(settings.githubCopilotAccessToken).toBe('');
        expect(settings.githubCopilotToken).toBe('');
        expect(settings.githubCopilotTokenExpiresAt).toBe(0);
        // Custom client id is user-supplied escape hatch, preserved.
        expect(settings.githubCopilotCustomClientId).toBe('client-xyz');
    });

    it('keeps github-copilot tokens when another copilot instance still exists', () => {
        const stillThere: ProviderConfig = {
            id: 'github-copilot-2',
            type: 'github-copilot',
            enabled: true,
            discoveredModels: [],
            lastRefreshAt: 0,
            tierMapping: {},
            tierOverrides: {},
        };
        const settings = makeSettings({
            providerConfigs: [stillThere],
            githubCopilotAccessToken: 'gho_aaa',
        });
        purgeProviderLegacyState(settings, 'github-copilot');
        expect(settings.githubCopilotAccessToken).toBe('gho_aaa');
    });

    it('clears all chatgpt-oauth plugin-level fields on last-instance removal', () => {
        const settings = makeSettings({
            providerConfigs: [],
            chatgptOAuthAccessToken: 'oa-a',
            chatgptOAuthRefreshToken: 'oa-r',
            chatgptOAuthIdToken: 'jwt',
            chatgptOAuthAccountId: 'acc-1',
            chatgptOAuthEmail: 'me@example.com',
            chatgptOAuthPlanTier: 'pro',
            chatgptOAuthExpiresAt: 1700000000,
        });
        purgeProviderLegacyState(settings, 'chatgpt-oauth');
        expect(settings.chatgptOAuthAccessToken).toBe('');
        expect(settings.chatgptOAuthRefreshToken).toBe('');
        expect(settings.chatgptOAuthIdToken).toBe('');
        expect(settings.chatgptOAuthAccountId).toBe('');
        expect(settings.chatgptOAuthEmail).toBe('');
        expect(settings.chatgptOAuthPlanTier).toBe('');
        expect(settings.chatgptOAuthExpiresAt).toBe(0);
    });

    it('clears all kilo-gateway plugin-level fields on last-instance removal', () => {
        const settings = makeSettings({
            providerConfigs: [],
            kiloToken: 'kt-abc',
            kiloAuthMode: 'device-auth',
            kiloOrganizationId: 'org-1',
            kiloAccountLabel: 'Sebastian',
            kiloLastValidatedAt: 1700000000,
        });
        purgeProviderLegacyState(settings, 'kilo-gateway');
        expect(settings.kiloToken).toBe('');
        expect(settings.kiloAuthMode).toBe('');
        expect(settings.kiloOrganizationId).toBe('');
        expect(settings.kiloAccountLabel).toBe('');
        expect(settings.kiloLastValidatedAt).toBe(0);
    });

    it('removes legacy_active_models_backup entries of the purged type only', () => {
        const settings = makeSettings({
            providerConfigs: [],
            legacy_active_models_backup: [
                { name: 'gho-model', provider: 'github-copilot', enabled: true } as never,
                { name: 'gpt-4o', provider: 'openai', enabled: true } as never,
                { name: 'gho-model-2', provider: 'github-copilot', enabled: false } as never,
            ],
        });
        purgeProviderLegacyState(settings, 'github-copilot');
        expect(settings.legacy_active_models_backup).toHaveLength(1);
        expect(settings.legacy_active_models_backup![0].provider).toBe('openai');
    });

    it('is a no-op for API-key providers (anthropic, openai, ...) -- their creds live in ProviderConfig', () => {
        const settings = makeSettings({
            providerConfigs: [],
            githubCopilotAccessToken: 'should-stay',
            chatgptOAuthAccessToken: 'should-stay',
            kiloToken: 'should-stay',
        });
        purgeProviderLegacyState(settings, 'anthropic');
        expect(settings.githubCopilotAccessToken).toBe('should-stay');
        expect(settings.chatgptOAuthAccessToken).toBe('should-stay');
        expect(settings.kiloToken).toBe('should-stay');
    });
});
