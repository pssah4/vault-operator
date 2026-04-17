/**
 * agentFolder — single source of truth for the vault-relative agent folder.
 *
 * FEATURE-0507 / ADR-072: User-configurable folder (default `.obsidian-agent`)
 * for agent-managed artefacts. The setting controls the **vault-relative** root
 * for:
 *   - Plugin skills        ({root}/plugin-skills/{plugin-id}.skill.md)
 *   - VaultDNA snapshot    ({root}/vault-dna.json)
 *   - Externalised tmp     ({root}/tmp/{task-id}/...)
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

/** Built-in default. Kept stable to preserve the legacy on-disk layout. */
export const DEFAULT_AGENT_FOLDER = '.obsidian-agent';

/** Setting carrier — anything that exposes settings.agentFolderPath. */
type SettingsHolder = { settings: Pick<ObsidianAgentSettings, 'agentFolderPath'> };

/**
 * Resolve the configured agent folder, normalised. Falls back to the legacy
 * default if the setting is missing, empty, or whitespace.
 */
export function getAgentFolderPath(holder: SettingsHolder): string {
    const raw = holder.settings.agentFolderPath?.trim();
    return normalizePath(raw && raw.length > 0 ? raw : DEFAULT_AGENT_FOLDER);
}

/** Path to a plugin-skill file inside the agent folder. */
export function getPluginSkillsPath(holder: SettingsHolder, pluginId: string): string {
    return normalizePath(`${getAgentFolderPath(holder)}/plugin-skills/${pluginId}.skill.md`);
}

/** Directory containing all plugin-skill files. */
export function getPluginSkillsDir(holder: SettingsHolder): string {
    return normalizePath(`${getAgentFolderPath(holder)}/plugin-skills`);
}

/** Path to the VaultDNA snapshot. */
export function getVaultDnaPath(holder: SettingsHolder): string {
    return normalizePath(`${getAgentFolderPath(holder)}/vault-dna.json`);
}

/** Root directory for externalised tmp tool results (BUG-014 / FEATURE-1803). */
export function getTmpRoot(holder: SettingsHolder): string {
    return normalizePath(`${getAgentFolderPath(holder)}/tmp`);
}
