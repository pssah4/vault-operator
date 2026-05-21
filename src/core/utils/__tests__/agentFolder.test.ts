/**
 * agentFolder.ts unit tests for FEAT-29-01 Task 1.
 *
 * Covers the sub-folder helpers introduced by ADR-119 third iteration:
 *  - getAgentDataDir returns {root}/data
 *  - getAgentCacheDir returns {root}/cache
 *  - both respect the configured agentFolderPath setting
 *  - both fall back to DEFAULT_AGENT_FOLDER when setting is empty
 *  - both fall back to DEFAULT_AGENT_FOLDER when setting is an absolute path
 *    (because data and cache go through the vault adapter, which cannot reach
 *    absolute paths)
 *  - existing helpers (getInternalAgentFolderPath, getTmpRoot, etc) keep
 *    their semantics for the migration window
 */

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_AGENT_FOLDER,
    getAgentDataDir,
    getAgentCacheDir,
    getInternalAgentFolderPath,
    getTmpRoot,
    getPluginSkillsDir,
    getPluginSkillsPath,
    getPluginSkillFolderPath,
    getPluginSkillManifestPath,
    getPluginSkillReadmePath,
    getPluginSkillCommandsRefPath,
    getVaultDnaPath,
    getSelfAuthoredSkillsDir,
    isAbsoluteAgentFolder,
} from '../agentFolder';
import type { ObsidianAgentSettings } from '../../../types/settings';

type Holder = {
    settings: {
        agentFolderPath?: string;
        _layoutMigrationStatus?: ObsidianAgentSettings['_layoutMigrationStatus'];
    };
};

describe('agentFolder sub-folder helpers (FEAT-29-01)', () => {
    // After FEAT-29-01 layout migration, getAgentDataDir/getAgentCacheDir
    // are layout-aware: they return {root}/data or {root}/cache only when
    // _layoutMigrationStatus === 'complete'. Before migration they return
    // the flat root so existing code paths keep finding their files.
    const migrated = (path: string): Holder => ({
        settings: { agentFolderPath: path, _layoutMigrationStatus: 'complete' },
    });

    it('getAgentDataDir returns {root}/data after migration', () => {
        expect(getAgentDataDir(migrated('.vault-operator'))).toBe('.vault-operator/data');
    });

    it('getAgentCacheDir returns {root}/cache after migration', () => {
        expect(getAgentCacheDir(migrated('.vault-operator'))).toBe('.vault-operator/cache');
    });

    it('getAgentDataDir falls back to DEFAULT_AGENT_FOLDER when setting is empty', () => {
        const holder: Holder = { settings: { agentFolderPath: '', _layoutMigrationStatus: 'complete' } };
        expect(getAgentDataDir(holder)).toBe(`${DEFAULT_AGENT_FOLDER}/data`);
    });

    it('getAgentCacheDir falls back to DEFAULT_AGENT_FOLDER when setting is empty', () => {
        const holder: Holder = { settings: { agentFolderPath: '', _layoutMigrationStatus: 'complete' } };
        expect(getAgentCacheDir(holder)).toBe(`${DEFAULT_AGENT_FOLDER}/cache`);
    });

    it('getAgentDataDir uses DEFAULT_AGENT_FOLDER when setting is absolute', () => {
        const holder: Holder = { settings: { agentFolderPath: '/Users/seb/external-folder', _layoutMigrationStatus: 'complete' } };
        expect(isAbsoluteAgentFolder('/Users/seb/external-folder')).toBe(true);
        expect(getAgentDataDir(holder)).toBe(`${DEFAULT_AGENT_FOLDER}/data`);
    });

    it('getAgentCacheDir uses DEFAULT_AGENT_FOLDER when setting is absolute', () => {
        const holder: Holder = { settings: { agentFolderPath: 'C:\\Users\\seb\\external-folder', _layoutMigrationStatus: 'complete' } };
        expect(isAbsoluteAgentFolder('C:\\Users\\seb\\external-folder')).toBe(true);
        expect(getAgentCacheDir(holder)).toBe(`${DEFAULT_AGENT_FOLDER}/cache`);
    });

    it('getAgentDataDir handles custom vault-relative agent folder', () => {
        expect(getAgentDataDir(migrated('CustomPlugin'))).toBe('CustomPlugin/data');
    });

    it('getAgentCacheDir handles custom vault-relative agent folder', () => {
        expect(getAgentCacheDir(migrated('CustomPlugin'))).toBe('CustomPlugin/cache');
    });

    it('getAgentDataDir returns flat root before migration (legacy path semantics)', () => {
        const holder: Holder = { settings: { agentFolderPath: '.obsilo-vault' } };
        expect(getAgentDataDir(holder)).toBe('.obsilo-vault');
    });

    it('getAgentCacheDir returns flat root before migration (legacy path semantics)', () => {
        const holder: Holder = { settings: { agentFolderPath: '.obsilo-vault' } };
        expect(getAgentCacheDir(holder)).toBe('.obsilo-vault');
    });

    it('does not break existing helpers (getInternalAgentFolderPath returns root unchanged)', () => {
        const holder: Holder = { settings: { agentFolderPath: '.vault-operator' } };
        expect(getInternalAgentFolderPath(holder)).toBe('.vault-operator');
    });

    it('does not break existing helpers (getTmpRoot legacy layout)', () => {
        const holder: Holder = { settings: { agentFolderPath: '.vault-operator' } };
        // Before migration: legacy flat layout
        expect(getTmpRoot(holder)).toBe('.vault-operator/tmp');
    });
});

describe('agentFolder layout-aware helpers (FEAT-29-01 post-migration)', () => {
    it('getPluginSkillsDir uses unified data/skills when migration is complete (FEAT-29-11)', () => {
        // FEAT-29-11 layout consolidation: plugin-skills live in the same
        // root as user/builtin skills, distinguished by the `source:`
        // frontmatter, not by a sub-folder.
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillsDir(holder)).toBe('.vault-operator/data/skills');
    });

    it('getPluginSkillsDir keeps legacy flat layout when migration is pending', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.obsilo-vault', _layoutMigrationStatus: 'pending' },
        };
        expect(getPluginSkillsDir(holder)).toBe('.obsilo-vault/plugin-skills');
    });

    it('getPluginSkillsDir keeps legacy when status is undefined (fresh install)', () => {
        const holder: Holder = { settings: { agentFolderPath: '.vault-operator' } };
        expect(getPluginSkillsDir(holder)).toBe('.vault-operator/plugin-skills');
    });

    it('getPluginSkillsPath returns unified folder/SKILL.md when migrated (FEAT-29-11)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillsPath(holder, 'excalidraw')).toBe(
            '.vault-operator/data/skills/excalidraw/SKILL.md',
        );
    });

    it('getVaultDnaPath moves into data/ when migrated', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getVaultDnaPath(holder)).toBe('.vault-operator/data/vault-dna.json');
    });

    it('getTmpRoot moves into cache/ when migrated', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getTmpRoot(holder)).toBe('.vault-operator/cache/tmp');
    });

    it('getSelfAuthoredSkillsDir moves into data/ when migrated', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getSelfAuthoredSkillsDir(holder)).toBe('.vault-operator/data/skills');
    });

    it('mid-state status (e.g. data-vault-done) does NOT switch helpers yet', () => {
        // Only "complete" flips the layout. Mid-state means migration is still
        // running, so we use the legacy paths and let the migration finish.
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'data-vault-done' },
        };
        expect(getPluginSkillsDir(holder)).toBe('.vault-operator/plugin-skills');
        expect(getTmpRoot(holder)).toBe('.vault-operator/tmp');
    });
});

describe('FEAT-29-02 plugin-skill folder helpers', () => {
    it('getPluginSkillFolderPath returns unified skill folder when migrated (FEAT-29-11)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillFolderPath(holder, 'excalidraw')).toBe(
            '.vault-operator/data/skills/excalidraw',
        );
    });

    it('getPluginSkillFolderPath returns null pre-migration (legacy has no per-plugin folder)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.obsilo-vault', _layoutMigrationStatus: 'pending' },
        };
        expect(getPluginSkillFolderPath(holder, 'excalidraw')).toBeNull();
    });

    it('getPluginSkillManifestPath returns SKILL.md in unified skill folder when migrated (FEAT-29-11)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillManifestPath(holder, 'dataview')).toBe(
            '.vault-operator/data/skills/dataview/SKILL.md',
        );
    });

    it('getPluginSkillManifestPath returns legacy .skill.md path pre-migration', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.obsilo-vault', _layoutMigrationStatus: 'pending' },
        };
        expect(getPluginSkillManifestPath(holder, 'dataview')).toBe(
            '.obsilo-vault/plugin-skills/dataview.skill.md',
        );
    });

    it('getPluginSkillReadmePath returns references/readme.md in unified folder when migrated (FEAT-29-11)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillReadmePath(holder, 'templater-obsidian')).toBe(
            '.vault-operator/data/skills/templater-obsidian/references/readme.md',
        );
    });

    it('getPluginSkillReadmePath returns legacy .readme.md path pre-migration', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.obsilo-vault', _layoutMigrationStatus: 'pending' },
        };
        expect(getPluginSkillReadmePath(holder, 'templater-obsidian')).toBe(
            '.obsilo-vault/plugin-skills/templater-obsidian.readme.md',
        );
    });

    it('getPluginSkillCommandsRefPath returns references/commands.md in unified folder when migrated (FEAT-29-11)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillCommandsRefPath(holder, 'obsidian-tasks-plugin')).toBe(
            '.vault-operator/data/skills/obsidian-tasks-plugin/references/commands.md',
        );
    });

    it('getPluginSkillCommandsRefPath returns null pre-migration (legacy has no separate ref)', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.obsilo-vault', _layoutMigrationStatus: 'pending' },
        };
        expect(getPluginSkillCommandsRefPath(holder, 'obsidian-tasks-plugin')).toBeNull();
    });

    it('respects custom agentFolderPath in all FEAT-29-11 unified-folder helpers', () => {
        const holder: Holder = {
            settings: { agentFolderPath: '.custom-agent', _layoutMigrationStatus: 'complete' },
        };
        expect(getPluginSkillFolderPath(holder, 'kanban')).toBe(
            '.custom-agent/data/skills/kanban',
        );
        expect(getPluginSkillManifestPath(holder, 'kanban')).toBe(
            '.custom-agent/data/skills/kanban/SKILL.md',
        );
    });
});

describe('FEAT-29-02 / AUDIT-FEAT-29-02 L-1: pluginId path-traversal guard', () => {
    const holder: Holder = {
        settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' },
    };

    it('rejects ../ in plugin id', () => {
        expect(() => getPluginSkillFolderPath(holder, '../malicious')).toThrow(
            /path-traversal guard/i,
        );
    });

    it('rejects absolute path as plugin id', () => {
        expect(() => getPluginSkillManifestPath(holder, '/etc/passwd')).toThrow(
            /path-traversal guard/i,
        );
    });

    it('rejects backslash separator (windows-style traversal)', () => {
        expect(() => getPluginSkillReadmePath(holder, 'foo\\bar')).toThrow(
            /path-traversal guard/i,
        );
    });

    it('rejects empty plugin id', () => {
        expect(() => getPluginSkillsPath(holder, '')).toThrow(/path-traversal guard/i);
    });

    it('rejects pathological id with slash mid-string', () => {
        expect(() => getPluginSkillCommandsRefPath(holder, 'a/b')).toThrow(
            /path-traversal guard/i,
        );
    });

    it('accepts normal plugin ids (alphanumeric + dash + underscore + dot)', () => {
        expect(() => getPluginSkillFolderPath(holder, 'obsidian-excalidraw-plugin')).not.toThrow();
        expect(() => getPluginSkillFolderPath(holder, 'dataview')).not.toThrow();
        expect(() => getPluginSkillFolderPath(holder, 'foo_bar-123')).not.toThrow();
        expect(() => getPluginSkillFolderPath(holder, 'plugin.with.dots')).not.toThrow();
    });

    it('rejects id starting with non-alphanumeric (defence against leading-dot tricks)', () => {
        expect(() => getPluginSkillFolderPath(holder, '.hidden-plugin')).toThrow(
            /path-traversal guard/i,
        );
        expect(() => getPluginSkillFolderPath(holder, '-leading-dash')).toThrow(
            /path-traversal guard/i,
        );
    });

    it('rejects overly long plugin id (>200 chars)', () => {
        const longId = 'a'.repeat(201);
        expect(() => getPluginSkillFolderPath(holder, longId)).toThrow(
            /path-traversal guard/i,
        );
    });
});
