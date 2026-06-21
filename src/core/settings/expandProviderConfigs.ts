/**
 * REF-08: expand providerConfigs[] into a CustomModel[]-shaped enumeration
 * for legacy UI surfaces (MemoryTab atomiser picker, FirstRunWizardModal
 * "has any model" check).
 *
 * EPIC-26 moved the canonical store from `settings.activeModels[]` to
 * `settings.providerConfigs[]`. Several UI screens were not migrated and
 * read the legacy array directly -- after the data migration they always
 * see an empty list. This helper bridges the two shapes for read-only
 * surfaces so we do not have to thread provider-aware logic through every
 * settings panel.
 *
 * The expansion is intentionally lossy: only fields the UI needs are
 * forwarded. Anyone building a write path against an expanded model would
 * lose provider-level context (tier overrides, ZDR flag, etc.) -- write
 * paths must go through ProviderDetailModal directly.
 */

import type { ProviderConfig, CustomModel } from '../../types/settings';

export function expandProviderConfigsToCustomModels(providerConfigs: readonly ProviderConfig[]): CustomModel[] {
    const out: CustomModel[] = [];
    for (const p of providerConfigs) {
        if (!p.enabled) continue;
        for (const dm of p.discoveredModels ?? []) {
            out.push({
                name: dm.id,
                displayName: dm.displayName ?? dm.id,
                provider: p.type,
                enabled: true,
                apiKey: p.apiKey,
                baseUrl: p.baseUrl,
            } as unknown as CustomModel);
        }
    }
    return out;
}

/**
 * Returns true when at least one enabled provider has at least one
 * discovered model. Used by FirstRunWizardModal to decide whether the
 * "has any model" gate should pass.
 */
export function hasAnyProviderModel(providerConfigs: readonly ProviderConfig[]): boolean {
    for (const p of providerConfigs) {
        if (!p.enabled) continue;
        if ((p.discoveredModels ?? []).length > 0) return true;
    }
    return false;
}
