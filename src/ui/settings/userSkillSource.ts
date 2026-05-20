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
 */

/**
 * Source values that belong in the User Skills section. Anything outside
 * the set is a plugin-id from VaultDNAScanner and is rendered separately.
 */
export const USER_SKILL_SOURCES: ReadonlySet<string> = new Set([
    'user', 'learned', 'builtin', 'bundled',
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
