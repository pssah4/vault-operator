/**
 * Manual model-id entry support for the provider tier slots.
 *
 * Some providers cannot enumerate their models. The ChatGPT OAuth (Codex)
 * backend has no `/v1/models` listing, so the tier dropdowns only ever show
 * the hardcoded Codex lineup. When OpenAI ships a newer Codex id we cannot
 * verify from the plugin, a power user still needs a way to pin it without us
 * inventing ids. This module owns the small pure decision logic that the
 * provider modal uses to switch a tier slot between the dropdown and a
 * free-text input. Kept free of any Obsidian import so it stays unit-testable.
 */

import type { ProviderType } from '../../types/settings';

/** Sentinel option value used in the tier dropdown to request manual entry. */
export const MANUAL_TIER_OPTION_VALUE = '__manual__';

/**
 * Provider types whose tier slots accept a manually typed model id.
 *
 * Only the ChatGPT OAuth Codex backend qualifies today: it has no model
 * listing endpoint, so the discovered list is the static known lineup and a
 * never-listed-but-valid future Codex id would otherwise be unreachable.
 * Every other provider can refresh a real `/v1/models` list, so free-text
 * there would only invite typos.
 */
export function providerSupportsManualModelId(type: ProviderType): boolean {
    return type === 'chatgpt-oauth';
}

export interface TierSlotViewInput {
    /** The current per-tier override value (manual or a discovered id). */
    override: string | undefined;
    /** Ids present in the discovered-model list for this provider. */
    discoveredIds: readonly string[];
    /** Whether this provider allows a manually typed id at all. */
    manualAllowed: boolean;
    /** True once the user explicitly picked the manual option this render. */
    manualRequested?: boolean;
}

export interface TierSlotView {
    /** Render mode for the slot control. */
    mode: 'select' | 'manual';
    /** The value the manual text input should show (empty in select mode). */
    manualValue: string;
}

/**
 * Decide whether a tier slot renders as a dropdown or as a free-text input.
 *
 * Manual mode activates when manual entry is allowed AND either the user just
 * asked for it OR the persisted override is a non-empty id that is not in the
 * discovered list (a previously typed custom id). An override that matches a
 * discovered id stays in dropdown mode so the normal selection keeps working.
 */
export function resolveTierSlotView(input: TierSlotViewInput): TierSlotView {
    const override = (input.override ?? '').trim();
    if (!input.manualAllowed) {
        return { mode: 'select', manualValue: '' };
    }
    const isCustomOverride = override.length > 0 && !input.discoveredIds.includes(override);
    if (input.manualRequested || isCustomOverride) {
        return { mode: 'manual', manualValue: override };
    }
    return { mode: 'select', manualValue: '' };
}
