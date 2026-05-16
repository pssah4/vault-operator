/**
 * EPIC-26 / FEAT-26-04 follow-up -- legacy-state purge when a provider
 * is removed from `providerConfigs[]`.
 *
 * Plugin-level OAuth / gateway tokens (githubCopilotAccessToken,
 * chatgptOAuthAccessToken, kiloToken etc.) live OUTSIDE the
 * ProviderConfig entry because the underlying auth services predate
 * EPIC-26. When the user removes a provider in the new settings tab
 * and there is no other instance of the same provider type, those
 * tokens become orphaned -- they linger in `data.json`, the next
 * "Add provider" flow sees them and reports `Signed in` immediately,
 * and the user cannot re-authenticate fresh.
 *
 * This helper clears the orphaned tokens after the ProviderConfig is
 * removed. It is type-aware: removing one of two github-copilot
 * instances leaves the OAuth token alone (still in use by the other
 * instance); removing the last one clears it.
 *
 * Pure function -- mutates the passed settings in place but does NOT
 * call saveSettings. Caller owns persistence.
 */

import type { ObsidianAgentSettings, ProviderType } from '../../types/settings';

/**
 * Clear plugin-level legacy state for `providerType` when the last
 * ProviderConfig of that type has just been removed.
 *
 * Caller invariant: `settings.providerConfigs` already excludes the
 * removed entry when this is called.
 */
export function purgeProviderLegacyState(
    settings: ObsidianAgentSettings,
    providerType: ProviderType,
): void {
    const remaining = (settings.providerConfigs ?? []).filter((p) => p.type === providerType);
    if (remaining.length > 0) return; // other instances still need the shared token

    // Drop legacy_active_models_backup entries of this provider type so
    // the user gets a clean slate. Backup of OTHER types stays.
    if (settings.legacy_active_models_backup) {
        settings.legacy_active_models_backup = settings.legacy_active_models_backup.filter(
            (m) => m.provider !== providerType,
        );
    }

    // Clear plugin-level auth tokens that the now-removed provider
    // relied on. Each branch covers the type's own credential set.
    switch (providerType) {
        case 'github-copilot':
            settings.githubCopilotAccessToken = '';
            settings.githubCopilotToken = '';
            settings.githubCopilotTokenExpiresAt = 0;
            // githubCopilotCustomClientId is a user-supplied escape hatch
            // ID, not a token -- keep it; the user may want to re-use it
            // when re-adding the provider.
            break;
        case 'chatgpt-oauth':
            settings.chatgptOAuthAccessToken = '';
            settings.chatgptOAuthRefreshToken = '';
            settings.chatgptOAuthIdToken = '';
            settings.chatgptOAuthAccountId = '';
            settings.chatgptOAuthEmail = '';
            settings.chatgptOAuthPlanTier = '';
            settings.chatgptOAuthExpiresAt = 0;
            break;
        case 'kilo-gateway':
            settings.kiloToken = '';
            settings.kiloAuthMode = '';
            settings.kiloOrganizationId = '';
            settings.kiloAccountLabel = '';
            settings.kiloLastValidatedAt = 0;
            break;
        default:
            // API-key-based providers (anthropic, openai, gemini, openrouter,
            // azure, ollama, lmstudio, custom, bedrock) carry their
            // credentials inside the ProviderConfig itself -- removing the
            // ProviderConfig already removes the auth.
            break;
    }
}
