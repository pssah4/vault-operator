/**
 * Lean system-prompt flag resolution (issue #44).
 *
 * Two stable system-prompt sections have a compact EPIC-26 variant:
 *   - cost-aware heuristics  (~500 vs ~1435 tokens)
 *   - plugin-skill catalogue (~30 vs ~5000 tokens)
 *
 * By default the lean variants are chosen by routing heuristics only:
 *   costHeuristicsLean = !modelOverrideActive
 *     (full cost rules when the user manually pinned a model)
 *   pluginSkillsLean   = !recentPluginSkillUsage
 *     (full catalogue once a plugin skill has actually been invoked)
 *
 * The global "Lean system prompt" setting ORs into both decisions to force
 * the compact variants. Forcing lean only ever REDUCES tokens and reuses the
 * production-validated variants: the lean cost-aware variant keeps
 * Plan-First + Tool-Tiers + Stop-Condition, and pluginSkillsLean only
 * collapses the plugin-skill catalogue, which re-expands on @-mention or
 * usage. The setting defaults to false so existing users see no change.
 */
export interface LeanFlags {
    costHeuristicsLean: boolean;
    pluginSkillsLean: boolean;
}

export function resolveLeanFlags(
    leanSystemPrompt: boolean,
    modelOverrideActive: boolean,
    recentPluginSkillUsage: boolean,
): LeanFlags {
    return {
        costHeuristicsLean: leanSystemPrompt || !modelOverrideActive,
        pluginSkillsLean: leanSystemPrompt || !recentPluginSkillUsage,
    };
}
