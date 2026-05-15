/**
 * Tier-resolution helpers (EPIC-26 / FEAT-26-01 / FEAT-26-02 / ADR-120).
 *
 * Pure functions that resolve `providerConfigs[]` entries into the
 * `CustomModel` shape the rest of the plugin expects. Extracted out of
 * `src/main.ts` so the logic is unit-testable without instantiating the
 * full Obsidian plugin shell.
 *
 * The plugin's class methods (`getActiveProvider`, `getTierModel`,
 * `getAdvisorModel`, `providerConfigToCustomModel`) delegate here.
 */

import type {
    CustomModel,
    DiscoveredModel,
    ModelTier,
    ObsidianAgentSettings,
    ProviderConfig,
} from '../../types/settings';

/** Return the currently active provider config, or null when none is selected / enabled. */
export function resolveActiveProvider(
    settings: Pick<ObsidianAgentSettings, 'activeProviderId' | 'providerConfigs'>,
): ProviderConfig | null {
    const id = settings.activeProviderId;
    if (!id) return null;
    const provider = (settings.providerConfigs ?? []).find((p) => p.id === id);
    return provider && provider.enabled ? provider : null;
}

/**
 * Resolve a tier slot on the active provider into a CustomModel.
 * Cascade: `tierOverrides[tier]` -> `tierMapping[tier]` -> next lower tier.
 * Returns null when nothing in the cascade is populated.
 */
export function resolveTierModel(
    settings: Pick<ObsidianAgentSettings, 'activeProviderId' | 'providerConfigs'>,
    tier: ModelTier,
): CustomModel | null {
    const provider = resolveActiveProvider(settings);
    if (!provider) return null;

    const cascade: ModelTier[] =
        tier === 'flagship' ? ['flagship', 'mid', 'fast']
        : tier === 'mid' ? ['mid', 'fast']
        : ['fast'];

    for (const t of cascade) {
        const modelId = provider.tierOverrides?.[t] ?? provider.tierMapping?.[t];
        if (!modelId) continue;
        const discovered = (provider.discoveredModels ?? []).find((m) => m.id === modelId);
        return providerConfigToCustomModel(provider, modelId, discovered);
    }
    return null;
}

/**
 * Return the flagship-tier model on the active provider, or null when
 * the flagship slot is empty. Unlike `resolveTierModel('flagship')`,
 * this does NOT cascade down -- the advisor pattern needs the actual
 * flagship or nothing.
 */
export function resolveAdvisorModel(
    settings: Pick<ObsidianAgentSettings, 'activeProviderId' | 'providerConfigs'>,
): CustomModel | null {
    const provider = resolveActiveProvider(settings);
    if (!provider) return null;
    const modelId = provider.tierOverrides?.flagship ?? provider.tierMapping?.flagship;
    if (!modelId) return null;
    const discovered = (provider.discoveredModels ?? []).find((m) => m.id === modelId);
    return providerConfigToCustomModel(provider, modelId, discovered);
}

/**
 * Build a CustomModel from a ProviderConfig + model id, pulling auth
 * credentials from the provider entry. Keeps the rest of the plugin on
 * the existing CustomModel-shaped API surface.
 */
export function providerConfigToCustomModel(
    provider: ProviderConfig,
    modelId: string,
    discovered?: DiscoveredModel,
): CustomModel {
    return {
        name: modelId,
        provider: provider.type,
        displayName: discovered?.displayName ?? modelId,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        apiVersion: provider.apiVersion,
        enabled: true,
        maxTokens: discovered?.maxOutputTokens,
        awsRegion: provider.awsRegion,
        awsAuthMode: provider.awsAuthMode,
        awsApiKey: provider.awsApiKey,
        awsAccessKey: provider.awsAccessKey,
        awsSecretKey: provider.awsSecretKey,
        awsSessionToken: provider.awsSessionToken,
    };
}
