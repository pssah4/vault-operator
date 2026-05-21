/**
 * FEAT-29-11 follow-up: pins the user-skill source filter that keeps
 * plugin-managed entries out of the User Skills section of the SkillsTab.
 *
 * The regression we cover: after Welle-2 -> FEAT-29-11 layout
 * consolidation, plugin-managed skills live in the same
 * `data/skills/{name}/` folder as user/builtin skills. Two readers walk
 * that folder (SelfAuthoredSkillLoader + SkillsManager.discoverSkills,
 * the latter via GlobalFileService.useVaultLocalRoot pointing at the
 * data/ root). Without a shared source-filter, plugin entries would
 * appear twice: once in the User Skills list, once in the Plugin Skills
 * list. The predicate guards both loops in
 * SkillsTab.collectUnifiedSkills.
 */

import { describe, it, expect } from 'vitest';
import { isUserSkillSource, USER_SKILL_SOURCES } from '../userSkillSource';

describe('isUserSkillSource', () => {
    it('accepts the four built-in user-skill source values', () => {
        expect(isUserSkillSource('user')).toBe(true);
        expect(isUserSkillSource('learned')).toBe(true);
        expect(isUserSkillSource('builtin')).toBe(true);
        expect(isUserSkillSource('bundled')).toBe(true);
    });

    it('rejects plugin-id values that VaultDNAScanner stamps', () => {
        // Real-world plugin ids that landed in Sebastian's vault as
        // `source: <plugin-id>` after the Welle-2 -> FEAT-29-11
        // layout migration.
        expect(isUserSkillSource('dataview')).toBe(false);
        expect(isUserSkillSource('templater-obsidian')).toBe(false);
        expect(isUserSkillSource('obsidian-excalidraw-plugin')).toBe(false);
        expect(isUserSkillSource('app')).toBe(false);
        expect(isUserSkillSource('canvas')).toBe(false);
    });

    it('treats null and undefined as the default user source', () => {
        // Legacy SKILL.md files that predate the source-frontmatter
        // discriminator land with `source: undefined` from the parser
        // and must still show up as user skills, not get filtered out.
        expect(isUserSkillSource(null)).toBe(true);
        expect(isUserSkillSource(undefined)).toBe(true);
    });

    it('rejects an empty string source (defensive guard)', () => {
        // An empty `source:` line in frontmatter is malformed; surface
        // it as a non-user-skill to keep it out of the list until the
        // user fixes the file.
        expect(isUserSkillSource('')).toBe(false);
    });

    it('exposes the same whitelist via USER_SKILL_SOURCES for downstream callers', () => {
        // Pinning the contract so any caller that wants the raw set
        // does not drift from the predicate.
        expect([...USER_SKILL_SOURCES].sort()).toEqual(
            ['builtin', 'bundled', 'learned', 'user'],
        );
    });
});
