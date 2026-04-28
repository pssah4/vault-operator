/**
 * agentFolder — single source of truth for the agent folder path.
 *
 * FEATURE-0507 / ADR-072: User-configurable folder (default `.obsidian-agent`)
 * for agent-managed artefacts. The setting controls the root for:
 *   - Plugin skills        ({root}/plugin-skills/{plugin-id}.skill.md)
 *   - VaultDNA snapshot    ({root}/vault-dna.json)
 *   - Externalised tmp     ({root}/tmp/{task-id}/...)
 *
 * Issue #26 follow-up: the path can be either **vault-relative**
 * (e.g. `.obsidian-agent`) or an **absolute filesystem path** picked
 * via the native OS folder dialog. Consumers that can only read/write
 * through Obsidian's vault API (tmp externalisation, vault-dna snapshot,
 * local knowledge DB) fall back to the vault-relative default when the
 * setting holds an absolute path — call `getInternalAgentFolderPath()`
 * for those. User-content consumers (plugin skills) can honour the
 * absolute path via Node `fs.promises`.
 *
 * NOT controlled here:
 *   - Cross-vault data (modes, rules, workflows, recipes, memory) lives in
 *     {vault-parent}/.obsidian-agent/ via GlobalFileService. That root is
 *     intentionally separate so a per-vault setting can never break shared
 *     data — see ADR-072.
 *
 * Migration: changing the setting does NOT auto-move existing files. Users
 * must move them manually.
 */

import { normalizePath } from 'obsidian';
import type { ObsidianAgentSettings } from '../../types/settings';

/** Built-in default for the vault-local agent folder. Renamed from
 *  `.obsidian-agent` to `obsilo-vault` for distribution clarity. The
 *  legacy name is migrated automatically on plugin onload. */
export const DEFAULT_AGENT_FOLDER = 'obsilo-vault';
/** Legacy default. Used by the onload migration to detect old installs. */
export const LEGACY_AGENT_FOLDER = '.obsidian-agent';

/** Setting carrier — anything that exposes settings.agentFolderPath. */
type SettingsHolder = { settings: Pick<ObsidianAgentSettings, 'agentFolderPath'> };

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
 * Path to a plugin-skill file. For the v2.5.1 UX step, plugin-skill files
 * also live inside the vault even if the user picked an absolute agent
 * folder. A later release will add real filesystem-native plugin-skill
 * loading so FolderBridge-style versioned setups can live outside the vault.
 */
export function getPluginSkillsPath(holder: SettingsHolder, pluginId: string): string {
    return normalizePath(`${getInternalAgentFolderPath(holder)}/plugin-skills/${pluginId}.skill.md`);
}

/** Directory containing all plugin-skill files. See getPluginSkillsPath for the vault-residency note. */
export function getPluginSkillsDir(holder: SettingsHolder): string {
    return normalizePath(`${getInternalAgentFolderPath(holder)}/plugin-skills`);
}

/** Path to the VaultDNA snapshot. Always vault-resident. */
export function getVaultDnaPath(holder: SettingsHolder): string {
    return normalizePath(`${getInternalAgentFolderPath(holder)}/vault-dna.json`);
}

/**
 * Root directory for externalised tmp tool results (BUG-014 / FEATURE-1803).
 * Always vault-resident so the agent's `read_file` tool can reach the files
 * back through the vault adapter.
 */
export function getTmpRoot(holder: SettingsHolder): string {
    return normalizePath(`${getInternalAgentFolderPath(holder)}/tmp`);
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
    return normalizePath(`${getInternalAgentFolderPath(holder)}/skills`);
}
