/**
 * agentFolder — single source of truth for the agent folder path.
 *
 * FEATURE-0507 / ADR-072 / ADR-119 amendment 2026-05-20: User-configurable
 * folder (default `.vault-operator`) for agent-managed artefacts. The setting
 * carries the plugin root; functional sub-folders are derived via the
 * getAgentDataDir() and getAgentCacheDir() helpers below.
 *
 * Sub-folder layout (ADR-119 third iteration, FEAT-29-01):
 *   - {root}/data/    persistent user state (knowledge.db, skills, history,
 *                     memory, rules, workflows, episodes, logs, plugin-skills,
 *                     vault-dna.json, telemetry)
 *   - {root}/cache/   regenerable assets (checkpoints, dev-env, asset bundles,
 *                     runtime workers, tmp externalisation, soak-reports)
 *
 * Cross-vault sharing is provided by a separate backup-export tool
 * (FEAT-29-12, EPIC-29 Welle 4), not by a vault-parent root anymore.
 *
 * Issue #26 follow-up: the path can be either **vault-relative**
 * (e.g. `.vault-operator`) or an **absolute filesystem path** picked
 * via the native OS folder dialog. Consumers that can only read/write
 * through Obsidian's vault API (tmp externalisation, vault-dna snapshot,
 * local knowledge DB) fall back to the vault-relative default when the
 * setting holds an absolute path — call `getInternalAgentFolderPath()`
 * for those. User-content consumers (plugin skills) can honour the
 * absolute path via Node `fs.promises`.
 *
 * Migration: see migrateAgentLayout.ts (FEAT-29-01) which moves data from
 * the legacy paths into the new sub-folder layout on plugin onload.
 */

import { normalizePath } from 'obsidian';
import type { ObsidianAgentSettings } from '../../types/settings';

/** Built-in default for the vault-local agent folder. Hidden (dot-prefix)
 *  so it doesn't clutter the Obsidian File Explorer. Migrated automatically
 *  from older defaults on plugin onload. */
export const DEFAULT_AGENT_FOLDER = '.vault-operator';

/**
 * Legacy folder names still used by existing installations. The plugin
 * never auto-migrates: if any of these exists in the user's vault, the
 * resolver below returns it instead of DEFAULT_AGENT_FOLDER so the user
 * keeps their data without renaming anything.
 */
export const LEGACY_AGENT_FOLDERS = ['.obsilo-vault', 'obsilo-vault', '.obsidian-agent'] as const;
/** Backwards-compatible alias for code that still references the old constant. */
export const LEGACY_AGENT_FOLDER = '.obsidian-agent';

/** Setting carrier — anything that exposes settings.agentFolderPath. The
 *  layout-migration status is included so the helpers below can flip between
 *  legacy flat layout ({root}/<sub>) and the new sub-folder layout
 *  ({root}/data/<sub>, {root}/cache/<sub>) without breaking existing
 *  consumers during the migration window. */
type SettingsHolder = {
    settings: Pick<ObsidianAgentSettings, 'agentFolderPath'> & {
        _layoutMigrationStatus?: ObsidianAgentSettings['_layoutMigrationStatus'];
    };
};

/** True iff FEAT-29-01 migration has completed. Helpers use this to choose
 *  between legacy flat layout and new sub-folder layout. */
function isLayoutMigrated(holder: SettingsHolder): boolean {
    return holder.settings._layoutMigrationStatus === 'complete';
}

/**
 * Detect whether a path is an absolute filesystem path. POSIX starts with "/",
 * Windows starts with a drive letter or UNC prefix. Vault-relative paths never
 * match either pattern, so the check is safe even without Node's `path` module.
 */
export function isAbsoluteAgentFolder(raw: string): boolean {
    if (!raw) return false;
    // POSIX absolute
    if (raw.startsWith('/')) return true;
    // Windows drive letter (C:\ or C:/), or UNC (\\server\share, //server/share)
    if (/^[a-zA-Z]:[\\/]/.test(raw)) return true;
    if (raw.startsWith('\\\\') || raw.startsWith('//')) return true;
    return false;
}

/**
 * Resolve the configured agent folder as the user sees it. May be absolute.
 * Use this for consumers that understand absolute paths (native Node `fs`).
 * For Obsidian-vault-only consumers, use `getInternalAgentFolderPath()`.
 */
export function getAgentFolderPath(holder: SettingsHolder): string {
    const raw = holder.settings.agentFolderPath?.trim();
    if (!raw) return DEFAULT_AGENT_FOLDER;
    if (isAbsoluteAgentFolder(raw)) return raw; // leave untouched
    return normalizePath(raw);
}

/**
 * Vault-relative agent folder, always. For consumers that go through
 * Obsidian's vault API (tmp externalisation, vault-dna snapshot, local
 * KnowledgeDB). If the user picked an absolute path, this returns the
 * default `.obsidian-agent` so those consumers keep working inside the vault.
 */
export function getInternalAgentFolderPath(holder: SettingsHolder): string {
    const raw = holder.settings.agentFolderPath?.trim();
    if (!raw || isAbsoluteAgentFolder(raw)) return DEFAULT_AGENT_FOLDER;
    return normalizePath(raw);
}

/**
 * FEAT-29-02 / AUDIT-FEAT-29-02 L-1: Defense-in-depth pluginId validation.
 *
 * AUDIT-FEAT-29-06 L-1 update (2026-05-20): delegates to the shared
 * `assertSafePathSegment` helper to eliminate the duplicated regex that
 * used to live both here and in RunSkillScriptTool. Behaviour unchanged
 * (same whitelist, same 200-char cap, same throw-on-violation).
 */
import { assertSafePathSegment } from './safePathName';

function assertSafePluginId(pluginId: string): void {
    assertSafePathSegment(pluginId, 'plugin id');
}

/**
 * Path to a plugin-skill file or its manifest. Layout-aware across two
 * dimensions:
 *
 *   - Pre-FEAT-29-01: legacy file format `{root}/plugin-skills/{id}.skill.md`.
 *   - Post-FEAT-29-01, Pre-FEAT-29-02: still file format, just under
 *     `{root}/data/plugin-skills/{id}.skill.md` (Welle 1 just moved the
 *     parent into the data/ sub-folder, no format change).
 *   - Post-FEAT-29-02: Anthropic-conformant folder format
 *     `{root}/data/skills/plugin/{id}/SKILL.md`. FEAT-29-02 activation gates
 *     on `_layoutMigrationStatus === 'complete'` (Welle 2 depends on Welle 1).
 *
 * For new code prefer `getPluginSkillFolderPath` and
 * `getPluginSkillManifestPath`. `getPluginSkillsPath` is retained for the
 * pre-Welle-2 file layout used during the transition window; callers must
 * decide via `isLayoutMigrated` whether they reach the legacy file or the
 * new folder.
 */
export function getPluginSkillsPath(holder: SettingsHolder, pluginId: string): string {
    assertSafePluginId(pluginId);
    if (isLayoutMigrated(holder)) {
        return getPluginSkillManifestPath(holder, pluginId);
    }
    return normalizePath(`${getInternalAgentFolderPath(holder)}/plugin-skills/${pluginId}.skill.md`);
}

/**
 * Directory containing all plugin-skill manifests. Post-FEAT-29-02 each
 * plugin lives in its own sub-folder, so this dir is the *root* of those
 * folders (`{root}/data/skills/plugin/`), not a flat container.
 *
 *   - Pre-FEAT-29-01: legacy `{root}/plugin-skills/` (file layout).
 *   - Post-FEAT-29-02 (= post-FEAT-29-01 by dependency):
 *     `{root}/data/skills/plugin/` (folder layout).
 */
export function getPluginSkillsDir(holder: SettingsHolder): string {
    if (isLayoutMigrated(holder)) {
        return normalizePath(`${getInternalAgentFolderPath(holder)}/data/skills/plugin`);
    }
    return normalizePath(`${getInternalAgentFolderPath(holder)}/plugin-skills`);
}

/**
 * FEAT-29-02: Per-plugin folder under `{root}/data/skills/plugin/{id}/`.
 * Returns null when called pre-migration (the legacy file layout has no
 * per-plugin folder concept; callers should use `getPluginSkillsPath`).
 */
export function getPluginSkillFolderPath(holder: SettingsHolder, pluginId: string): string | null {
    assertSafePluginId(pluginId);
    if (!isLayoutMigrated(holder)) return null;
    return normalizePath(`${getInternalAgentFolderPath(holder)}/data/skills/plugin/${pluginId}`);
}

/**
 * FEAT-29-02: Anthropic-conformant `SKILL.md` manifest path inside the
 * per-plugin folder. Returns the legacy file path when called pre-migration,
 * so direct call-sites stay agnostic of the migration state.
 */
export function getPluginSkillManifestPath(holder: SettingsHolder, pluginId: string): string {
    assertSafePluginId(pluginId);
    if (!isLayoutMigrated(holder)) {
        return normalizePath(`${getInternalAgentFolderPath(holder)}/plugin-skills/${pluginId}.skill.md`);
    }
    return normalizePath(
        `${getInternalAgentFolderPath(holder)}/data/skills/plugin/${pluginId}/SKILL.md`,
    );
}

/**
 * FEAT-29-02: Path to `references/readme.md` for core-plugin descriptions
 * that used to live as `{id}.readme.md` next to `{id}.skill.md`. Pre-Welle-2
 * returns the legacy flat path.
 */
export function getPluginSkillReadmePath(holder: SettingsHolder, pluginId: string): string {
    assertSafePluginId(pluginId);
    if (!isLayoutMigrated(holder)) {
        return normalizePath(`${getInternalAgentFolderPath(holder)}/plugin-skills/${pluginId}.readme.md`);
    }
    return normalizePath(
        `${getInternalAgentFolderPath(holder)}/data/skills/plugin/${pluginId}/references/readme.md`,
    );
}

/**
 * FEAT-29-02: Path to `references/commands.md` (eager-generated for the
 * curated Top-5 plugins -- Excalidraw, Dataview, Templater, Tasks, Kanban).
 * Pre-Welle-2 returns null because the legacy file layout has no place for
 * a separate command reference; the data lives inline in the `.skill.md`.
 */
export function getPluginSkillCommandsRefPath(holder: SettingsHolder, pluginId: string): string | null {
    assertSafePluginId(pluginId);
    if (!isLayoutMigrated(holder)) return null;
    return normalizePath(
        `${getInternalAgentFolderPath(holder)}/data/skills/plugin/${pluginId}/references/commands.md`,
    );
}

/** Path to the VaultDNA snapshot. Always vault-resident. FEAT-29-01: moves
 *  into data/ after migration. */
export function getVaultDnaPath(holder: SettingsHolder): string {
    const sub = isLayoutMigrated(holder) ? 'data/vault-dna.json' : 'vault-dna.json';
    return normalizePath(`${getInternalAgentFolderPath(holder)}/${sub}`);
}

/**
 * Root directory for externalised tmp tool results (BUG-014 / FEATURE-1803).
 * Always vault-resident so the agent's `read_file` tool can reach the files
 * back through the vault adapter. FEAT-29-01: moves into cache/ after
 * migration (tmp is regenerable, belongs in cache).
 */
export function getTmpRoot(holder: SettingsHolder): string {
    const sub = isLayoutMigrated(holder) ? 'cache/tmp' : 'tmp';
    return normalizePath(`${getInternalAgentFolderPath(holder)}/${sub}`);
}

/**
 * Directory holding self-authored and user-imported skills
 * (`<agent-folder>/skills/<slug>/SKILL.md[+ subfolders]`).
 *
 * EPIC-022 / ADR-075: unifies the old hard-wired `.obsilo-sync/skills/`
 * with the configurable agent-folder root from ADR-072. A one-time
 * migration at plugin start moves the legacy tree on first v2.6 launch.
 */
export const LEGACY_SELF_AUTHORED_SKILLS_DIR = '.obsilo-sync/skills';

export function getSelfAuthoredSkillsDir(holder: SettingsHolder): string {
    const sub = isLayoutMigrated(holder) ? 'data/skills' : 'skills';
    return normalizePath(`${getInternalAgentFolderPath(holder)}/${sub}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-folder helpers (FEAT-29-01, ADR-119 third iteration)
//
// data/ holds persistent user state. cache/ holds regenerable artefacts that
// can be deleted without data loss. Consumers should prefer these helpers
// over the legacy flat helpers above, which keep their existing semantics
// during the migration window.
// ─────────────────────────────────────────────────────────────────────────

/** Persistent user data directory: {root}/data after layout migration,
 *  {root} (flat) before migration. Layout-aware so consumers like
 *  KnowledgeDB resolve to the right path in both states. */
export function getAgentDataDir(holder: SettingsHolder): string {
    const root = getInternalAgentFolderPath(holder);
    return isLayoutMigrated(holder) ? normalizePath(`${root}/data`) : normalizePath(root);
}

/** Regenerable cache directory: {root}/cache after layout migration,
 *  {root} (flat) before migration. Safe to delete. */
export function getAgentCacheDir(holder: SettingsHolder): string {
    const root = getInternalAgentFolderPath(holder);
    return isLayoutMigrated(holder) ? normalizePath(`${root}/cache`) : normalizePath(root);
}
