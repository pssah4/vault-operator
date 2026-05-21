/**
 * FEAT-29-11: source-discriminator predicate for the "User Skills" section
 * of the SkillsTab.
 *
 * Background: after Welle-2 -> FEAT-29-11 layout consolidation, plugin-managed
 * skills live in the same `data/skills/{name}/` folder as user-/builtin-skills.
 * Two readers walk that folder (SelfAuthoredSkillLoader and
 * SkillsManager.discoverSkills via GlobalFileService.useVaultLocalRoot pointing
 * at the data/ root). Without a shared source-filter, plugin entries would
 * surface twice: once in the User Skills list, once in the Plugin Skills list.
 *
 * This module is intentionally split from SkillsTab.ts so it stays
 * import-light (no obsidian types) and can be loaded in vitest without
 * pulling Modal / setIcon / friends.
 *
 * FEAT-29-13 follow-up: also owns the human-readable label mapping for
 * the Source column and the tooltip text. Both used to live as a private
 * method on SkillsTab — extracted so the contract can be pinned in tests
 * and so the badge-CSS class names stay in sync with the label set.
 */

/**
 * Source values that belong in the User Skills section. Anything outside
 * the set is a plugin-id from VaultDNAScanner and is rendered separately.
 *
 * `agent` (FEAT-29-13) is what `init_skill` from the skill-creator
 * workflow stamps on new skills; `learned` is the legacy
 * recipe-promotion discriminator and folds into the same Agent bucket.
 */
export const USER_SKILL_SOURCES: ReadonlySet<string> = new Set([
    'user', 'agent', 'learned', 'builtin', 'bundled',
]);

/**
 * Predicate counterpart to `USER_SKILL_SOURCES`. Returns true when the
 * skill's `source` value (or its default `'user'` fallback) belongs in
 * the User Skills list, false when it is a plugin-managed entry.
 *
 * `null` / `undefined` are treated as the default user source so legacy
 * SKILL.md files that predate the source-frontmatter discriminator do
 * not get filtered out.
 */
export function isUserSkillSource(source: string | null | undefined): boolean {
    if (source === null || source === undefined) return true;
    return USER_SKILL_SOURCES.has(source);
}

/**
 * Three top-level labels surfaced in the Source column of the
 * SkillsTab. Unknown values fall through unchanged so plugin-id badges
 * keep their raw discriminator.
 */
export function getSourceLabel(source: string): string {
    switch (source) {
        case 'bundled':
        case 'builtin':
            return 'Built-in';
        case 'agent':
        case 'learned':
            return 'Agent';
        case 'user':
            return 'User';
        default:
            return source;
    }
}

/**
 * Hover-tooltip for the "Source" column header. Single source of truth
 * so the UI and the test contract cannot drift.
 */
export const SOURCE_TOOLTIP =
    'Built-in: ships with the plugin. ' +
    'Agent: created via the skill-creator workflow (quality-gated). ' +
    'User: manually written, copied or imported by you.';
