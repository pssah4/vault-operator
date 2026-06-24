/**
 * Resolves Inline-Actions settings with defaults (EPIC-33).
 *
 * The settings.inlineActions field is fully optional so existing
 * data.json files do not need migration. resolveInlineActionsSettings
 * returns a fully-populated struct with the canonical defaults applied
 * for every missing field.
 *
 * Related: FEAT-33-01 (Settings-Surface), FEAT-33-09 (Vault-RAG).
 */

import type { InlineActionsSettings } from '../../types/settings';

export interface ResolvedInlineActionsSettings {
    enabled: boolean;
    floatingMenuEnabled: boolean;
    vaultRagInLookup: boolean;
    vaultRagConfidenceThreshold: number;
    showVaultSourcesInTooltip: boolean;
    skillsTopN: number;
    /** FEAT-33-12: 'cm-block-widget' (default) or 'popover-overlay'. */
    inlineChatDisplay: 'cm-block-widget' | 'popover-overlay';
}

export const INLINE_ACTIONS_DEFAULTS: ResolvedInlineActionsSettings = {
    enabled: true,
    floatingMenuEnabled: false,
    vaultRagInLookup: true,
    vaultRagConfidenceThreshold: 0.7,
    showVaultSourcesInTooltip: true,
    skillsTopN: 10,
    inlineChatDisplay: 'cm-block-widget',
};

export function resolveInlineActionsSettings(
    raw: InlineActionsSettings | undefined,
): ResolvedInlineActionsSettings {
    if (raw === undefined || raw === null) {
        return { ...INLINE_ACTIONS_DEFAULTS };
    }
    const threshold = typeof raw.vaultRagConfidenceThreshold === 'number'
        ? Math.min(1, Math.max(0, raw.vaultRagConfidenceThreshold))
        : INLINE_ACTIONS_DEFAULTS.vaultRagConfidenceThreshold;
    const topN = typeof raw.skillsTopN === 'number' && Number.isFinite(raw.skillsTopN)
        ? Math.max(0, Math.floor(raw.skillsTopN))
        : INLINE_ACTIONS_DEFAULTS.skillsTopN;
    const display: 'cm-block-widget' | 'popover-overlay' =
        raw.inlineChatDisplay === 'popover-overlay'
            ? 'popover-overlay'
            : raw.inlineChatDisplay === 'cm-block-widget'
                ? 'cm-block-widget'
                : INLINE_ACTIONS_DEFAULTS.inlineChatDisplay;
    return {
        enabled: raw.enabled ?? INLINE_ACTIONS_DEFAULTS.enabled,
        floatingMenuEnabled: raw.floatingMenuEnabled ?? INLINE_ACTIONS_DEFAULTS.floatingMenuEnabled,
        vaultRagInLookup: raw.vaultRagInLookup ?? INLINE_ACTIONS_DEFAULTS.vaultRagInLookup,
        vaultRagConfidenceThreshold: threshold,
        showVaultSourcesInTooltip: raw.showVaultSourcesInTooltip ?? INLINE_ACTIONS_DEFAULTS.showVaultSourcesInTooltip,
        skillsTopN: topN,
        inlineChatDisplay: display,
    };
}
