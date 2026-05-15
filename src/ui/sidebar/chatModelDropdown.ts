/**
 * EPIC-26 / FEAT-26-05 -- chat-header model dropdown options.
 *
 * Pure function: given a ProviderConfig (the active provider) and the
 * current override state, returns the list of options the dropdown
 * should render. Extracted from AgentSidebarView so the option-shaping
 * rules stay unit-testable.
 *
 * Option shape:
 *   { id: 'auto', label: 'Auto', kind: 'auto', advisorDisabled?: boolean }
 *   { id: <modelId>, label: <displayName>, kind: 'override' }
 *
 * The auto option may carry `advisorDisabled: true` when the flagship
 * tier slot is empty. The caller renders that as a subtitle hint.
 */

import type { DiscoveredModel, ProviderConfig } from '../../types/settings';

export type ChatModelDropdownOption =
    | { id: 'auto'; label: string; kind: 'auto'; advisorDisabled: boolean }
    | { id: string; label: string; kind: 'override' };

export interface BuildOptionsInput {
    /** Active provider (null when no provider is configured / migration pending). */
    provider: ProviderConfig | null;
    /** Localised "Auto" label, e.g. "Auto". */
    autoLabel: string;
    /** Localised "advisor disabled" suffix, e.g. "advisor pattern disabled". */
    advisorDisabledLabel: string;
}

/**
 * Build the option list for the chat-header model dropdown. Always
 * returns at least the Auto option; provider-models follow if the
 * provider has discoveredModels populated.
 */
export function buildChatModelDropdownOptions(input: BuildOptionsInput): ChatModelDropdownOption[] {
    const { provider, autoLabel, advisorDisabledLabel } = input;
    const advisorDisabled = !provider
        || !(provider.tierOverrides?.flagship ?? provider.tierMapping?.flagship);

    const autoOption: ChatModelDropdownOption = {
        id: 'auto',
        label: advisorDisabled ? `${autoLabel} (${advisorDisabledLabel})` : autoLabel,
        kind: 'auto',
        advisorDisabled,
    };

    if (!provider) return [autoOption];

    const overrides: ChatModelDropdownOption[] = (provider.discoveredModels ?? []).map((m: DiscoveredModel) => ({
        id: m.id,
        label: m.displayName ?? m.id,
        kind: 'override',
    }));

    return [autoOption, ...overrides];
}

/**
 * Helper: locate the discovered model entry for the current override id.
 * Returns null when override is 'auto' or the id is unknown.
 */
export function resolveOverrideModel(
    provider: ProviderConfig | null,
    overrideId: string | null,
): DiscoveredModel | null {
    if (!provider || !overrideId || overrideId === 'auto') return null;
    return (provider.discoveredModels ?? []).find((m) => m.id === overrideId) ?? null;
}
