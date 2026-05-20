/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * VaultDNAScanner — Discovers Obsidian plugins and generates skill files (PAS-1)
 *
 * Scans core + community plugins, classifies by command count,
 * generates .skill.md files at .obsidian-agent/plugin-skills/,
 * persists vault-dna.json, and polls for plugin enable/disable changes.
 *
 * ADR-102: Scans app.plugins.manifests (all installed, enabled + disabled).
 * ADR-103: Generates Stufe A skeletons only (no LLM, no network).
 */

import { type App, type Vault, requestUrl } from 'obsidian';
import type { VaultDNA, VaultDNAEntry, PluginClassification, PluginSkillMeta, PluginSource } from './types';
import { CORE_PLUGIN_DEFS, CORE_PLUGIN_IDS } from './CorePluginLibrary';
import {
    getPluginSkillsDir,
    getPluginSkillManifestPath,
    getPluginSkillFolderPath,
    getPluginSkillReadmePath,
    getPluginSkillCommandsRefPath,
    getVaultDnaPath,
} from '../utils/agentFolder';
import type { ObsidianAgentSettings } from '../../types/settings';
import { scheduleRecurring, type RecurringHandle } from '../../util/scheduleRecurring';

/** FEATURE-0507: subset of the plugin used to resolve the configurable agent folder.
 *  FEAT-29-02: also needs _layoutMigrationStatus so the folder helpers can pick
 *  between the legacy file layout and the new Anthropic folder layout. */
type AgentFolderHolder = {
    settings: Pick<ObsidianAgentSettings, 'agentFolderPath' | '_layoutMigrationStatus'>;
};

/** FEAT-29-02: curated set of plugins that get an eager-generated
 *  `references/commands.md` listing every command the plugin exposes. The
 *  set stays small on purpose -- only plugins where the command surface is
 *  large enough that browsing it as a separate reference helps the agent. */
const TOP_PLUGINS_WITH_COMMANDS_REF = new Set([
    'obsidian-excalidraw-plugin',
    'dataview',
    'templater-obsidian',
    'obsidian-tasks-plugin',
    'obsidian-kanban',
]);

/**
 * FEAT-29-02: lightweight isLayoutMigrated for VaultDNAScanner -- avoids a
 * direct import cycle with agentFolder.ts (which exports the canonical
 * helper) by reading the same setting field. Inline rather than imported
 * because the scanner's holder type is intentionally narrow.
 */
function isHolderMigrated(holder: AgentFolderHolder): boolean {
    return holder.settings._layoutMigrationStatus === 'complete';
}

/**
 * FEAT-29-02 / AUDIT-FEAT-29-02 M-1: collapse newlines and escape pipes so a
 * plugin-controlled command name cannot break a markdown table layout. Used
 * by writeCommandsReferenceIfTopPlugin and by any other markdown-table
 * renderer that takes plugin-controlled strings.
 */
function escapeMarkdownTableCell(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * FEAT-29-02 / AUDIT-FEAT-29-02 L-2: collapse newlines and escape backticks
 * so a plugin-controlled string stays on one markdown list-item line and
 * does not break adjacent inline code blocks.
 */
function escapeMarkdownInline(s: string): string {
    return s.replace(/`/g, '\\`').replace(/\r?\n/g, ' ');
}

/**
 * FEAT-29-02 / AUDIT-FEAT-29-02 L-2: escape backticks so a plugin id that
 * happens to contain a backtick does not break the surrounding inline code
 * span (`{id}`).
 */
function escapeInlineCode(s: string): string {
    return s.replace(/`/g, '\\`');
}

/** Patterns that indicate a command is UI-only (not agentifiable) */
const UI_ONLY_PATTERNS = [
    /^toggle/i, /toggle$/i, /^show-/i, /^focus/i,
    /settings$/i, /-panel$/i, /-sidebar$/i, /-pane$/i,
    /^open-settings/i, /^show-settings/i,
];

function isUIOnlyCommand(commandName: string): boolean {
    const lower = commandName.toLowerCase();
    return UI_ONLY_PATTERNS.some((p) => p.test(lower));
}

export class VaultDNAScanner {
    private readonly app: App;
    private readonly vault: Vault;
    /** FEATURE-0507: vault-relative dir, default ".obsidian-agent/plugin-skills". Mutable (FEATURE-0508).
     *  FEAT-29-02: post-Welle-1 this points at `{root}/data/skills/plugin/` (folder layout). */
    private skillsDir: string;
    /** FEATURE-0507: vault-relative path, default ".obsidian-agent/vault-dna.json". Mutable (FEATURE-0508). */
    private dnaPath: string;
    /** FEAT-29-02: settings holder kept so writeSkillFile can ask the
     *  layout-aware helpers whether to write file-form or folder-form. */
    private holder: AgentFolderHolder | undefined;
    private vaultDNA: VaultDNA | null = null;
    private pollIntervalId: RecurringHandle | null = null;
    private lastKnownEnabledSet = new Set<string>();
    /** Runtime skill metadata — built after scan */
    private pluginSkills: PluginSkillMeta[] = [];

    /**
     * @param holder Optional plugin/settings holder. Pass `undefined` only in
     *               tests; production calls should provide it so the
     *               configurable agent folder takes effect.
     */
    constructor(app: App, vault: Vault, holder?: AgentFolderHolder) {
        this.app = app;
        this.vault = vault;
        this.holder = holder;
        this.skillsDir = holder ? getPluginSkillsDir(holder) : '.obsidian-agent/plugin-skills';
        this.dnaPath = holder ? getVaultDnaPath(holder) : '.obsidian-agent/vault-dna.json';
    }

    /**
     * FEATURE-0508: re-target the scanner to a new agent folder. Updates
     * `skillsDir` and `dnaPath`; the next scan writes to the new location.
     * Callers usually follow up with `initialize()` to actually re-scan.
     *
     * FEAT-29-02: the new agent folder is taken literally as the root. The
     * scanner re-reads the holder to decide whether to use file-layout
     * (legacy) or folder-layout (post-Welle-1) underneath.
     */
    setAgentFolder(newAgentFolder: string): void {
        const root = newAgentFolder.replace(/\/+$/, '');
        if (this.holder && isHolderMigrated(this.holder)) {
            this.skillsDir = `${root}/data/skills/plugin`;
            this.dnaPath = `${root}/data/vault-dna.json`;
        } else {
            this.skillsDir = `${root}/plugin-skills`;
            this.dnaPath = `${root}/vault-dna.json`;
        }
    }

    /**
     * FEAT-29-02: vault.adapter.mkdir is NOT recursive. Walk the path and
     * create each segment from the top so that `data/skills/plugin/` works
     * on a fresh install without manual parent creation.
     */
    private async ensureDirRecursive(dir: string): Promise<void> {
        const segments = dir.split('/').filter((s) => s.length > 0);
        let current = '';
        for (const seg of segments) {
            current = current ? `${current}/${seg}` : seg;
            if (!(await this.vault.adapter.exists(current))) {
                await this.vault.adapter.mkdir(current);
            }
        }
    }

    async initialize(): Promise<void> {
        // Ensure directory exists. mkdir is not recursive on Obsidian's adapter,
        // so walk every parent segment first (FEAT-29-02 introduced a deeper
        // nested layout `data/skills/plugin/` that requires this).
        await this.ensureDirRecursive(this.skillsDir);

        // FEAT-29-02 Task 5: idempotent cleanup of the previous file layout.
        // When the holder reports post-Welle-1 status, any leftover
        // `{root}/data/plugin-skills/*.skill.md` files are stale (the new
        // location is `{root}/data/skills/plugin/{id}/SKILL.md`). Removing
        // them is non-fatal -- if the cleanup throws, the next scan retries.
        if (this.holder && isHolderMigrated(this.holder)) {
            await this.cleanupLegacyPluginSkillsLayout().catch((e) => {
                console.warn('[VaultDNA] Legacy plugin-skills cleanup failed (non-fatal):', e);
            });
        }

        // Load existing vault-dna.json (if any)
        try {
            const dnaExists = await this.vault.adapter.exists(this.dnaPath);
            if (dnaExists) {
                const raw = await this.vault.adapter.read(this.dnaPath);
                this.vaultDNA = JSON.parse(raw) as VaultDNA;
            }
        } catch {
            // Corrupted or missing — rescan
        }

        // Full scan
        await this.fullScan();

        // Delayed reclassification: some plugins register commands late.
        // Re-check NONE-classified enabled plugins after 3s.
        window.setTimeout(() => { void this.reclassifyNonePlugins(); }, 3000);

        // Start continuous sync polling
        this.startSync();
    }

    /**
     * FEAT-29-02 Task 5: remove stale `.skill.md` / `.readme.md` files from
     * the legacy `data/plugin-skills/` directory after Welle 1 migrated the
     * layout. Removes the (now empty) folder too. Idempotent: missing files
     * or already-deleted folders are non-fatal.
     */
    private async cleanupLegacyPluginSkillsLayout(): Promise<void> {
        if (!this.holder) return;
        const agentRoot = this.skillsDir.replace(/\/data\/skills\/plugin$/, '');
        const legacyDir = `${agentRoot}/data/plugin-skills`;
        const exists = await this.vault.adapter.exists(legacyDir);
        if (!exists) return;

        try {
            const listing = await this.vault.adapter.list(legacyDir);
            for (const f of listing.files) {
                if (f.endsWith('.skill.md') || f.endsWith('.readme.md')) {
                    try {
                        await this.vault.adapter.remove(f);
                    } catch {
                        // Concurrent edit or read-only -- skip, retry on next scan
                    }
                }
            }
            // Try to remove the now-empty folder. Fails non-fatally if there
            // are still other files (the user might have stashed something
            // there manually).
            const after = await this.vault.adapter.list(legacyDir);
            if (after.files.length === 0 && after.folders.length === 0) {
                await this.vault.adapter.rmdir(legacyDir, false);
            }
        } catch {
            // Folder listing failed -- treat as a no-op so init never blocks
            // on cleanup.
        }
    }

    /**
     * Re-check plugins that were classified as NONE during the initial scan.
     * Some plugins register their commands after a delay — this pass catches them.
     */
    private async reclassifyNonePlugins(): Promise<void> {
        if (!this.vaultDNA) return;
        let changed = false;

        for (const entry of this.vaultDNA.plugins) {
            if (entry.classification !== 'NONE' || entry.status !== 'enabled') continue;

            const newClass = this.classify(entry.id);
            if (newClass === 'NONE') continue;

            // Plugin now has commands — promote it
            console.debug(`[VaultDNA] Reclassified ${entry.id}: NONE -> ${newClass}`);
            entry.classification = newClass;
            entry.skillFile = `${entry.id}.skill.md`;
            delete entry.reason;

            const manifests = this.app.plugins?.manifests ?? {};
            const manifest = manifests[entry.id];
            const newSkill: PluginSkillMeta = {
                id: entry.id,
                name: manifest?.name ?? entry.id,
                source: 'vault-native',
                classification: newClass,
                enabled: true,
                commands: this.getPluginCommands(entry.id),
                description: manifest?.description ?? `Community plugin: ${manifest?.name ?? entry.id}`,
            };
            this.pluginSkills.push(newSkill);
            await this.writeSkillFile(newSkill);
            changed = true;
        }

        if (changed) {
            await this.vault.adapter.write(this.dnaPath, JSON.stringify(this.vaultDNA, null, 2));
            console.debug(`[VaultDNA] Reclassification complete: ${this.pluginSkills.length} total skills`);
        }
    }

    // ── Full Scan ────────────────────────────────────────────────────────

    async fullScan(): Promise<VaultDNA> {
        const plugins: VaultDNAEntry[] = [];
        const skills: PluginSkillMeta[] = [];

        // Phase 1: Core plugins
        const coreEntries = this.scanCorePlugins();
        for (const entry of coreEntries) {
            plugins.push(entry.dna);
            if (entry.skill) skills.push(entry.skill);
        }

        // Phase 2: Community plugins
        const communityEntries = this.scanCommunityPlugins();
        for (const entry of communityEntries) {
            plugins.push(entry.dna);
            if (entry.skill) skills.push(entry.skill);
        }

        // Phase 3: Fetch README docs (before writing skill files so docs ref is accurate)
        await this.fetchAllReadmes().catch((e) =>
            console.warn('[VaultDNA] README fetch during scan failed:', e),
        );

        // Phase 4: Write .skill.md files + core plugin docs
        for (const skill of skills) {
            await this.writeSkillFile(skill);
        }
        await this.writeCorePluginReadmes();

        // Phase 5: Persist vault-dna.json
        const archived = this.vaultDNA?.archived ?? [];
        this.vaultDNA = {
            scannedAt: new Date().toISOString(),
            agentVersion: '0.1.0',
            mode: 'local',
            plugins,
            archived,
        };
        await this.vault.adapter.write(this.dnaPath, JSON.stringify(this.vaultDNA, null, 2));

        this.pluginSkills = skills;

        console.debug(`[VaultDNA] Scanned ${plugins.length} plugins (${skills.length} with skills)`);
        return this.vaultDNA;
    }

    // ── Core Plugin Scan ─────────────────────────────────────────────────

    private scanCorePlugins(): Array<{ dna: VaultDNAEntry; skill?: PluginSkillMeta }> {
        const results: Array<{ dna: VaultDNAEntry; skill?: PluginSkillMeta }> = [];
        const internalPlugins = this.app.internalPlugins?.plugins;
        if (!internalPlugins) return results;

        for (const def of CORE_PLUGIN_DEFS) {
            const internal = internalPlugins[def.id];
            // If the plugin is not in internalPlugins, its commands are always
            // available (e.g. workspace, app, editor — core Obsidian functions).
            const isEnabled = internal === undefined ? true : internal.enabled === true;

            const entry: VaultDNAEntry = {
                id: def.id,
                name: def.name,
                type: 'core',
                classification: def.classification,
                status: isEnabled ? 'enabled' : 'disabled',
                source: 'core',
                skillFile: `${def.id}.skill.md`,
                description: def.description,
            };

            const skill: PluginSkillMeta = {
                id: def.id,
                name: def.name,
                source: 'core',
                classification: def.classification,
                enabled: isEnabled,
                commands: def.commands,
                description: def.description,
            };

            results.push({ dna: entry, skill });
        }

        return results;
    }

    // ── Community Plugin Scan ────────────────────────────────────────────

    private scanCommunityPlugins(): Array<{ dna: VaultDNAEntry; skill?: PluginSkillMeta }> {
        const results: Array<{ dna: VaultDNAEntry; skill?: PluginSkillMeta }> = [];
        const manifests = this.app.plugins?.manifests ?? {};
        const enabledPlugins: Set<string> = this.app.plugins?.enabledPlugins ?? new Set();

        for (const [id, manifest] of Object.entries(manifests)) {
            // Skip our own plugin
            if (id === 'obsidian-agent') continue;
            // Skip core plugins (handled separately)
            if (CORE_PLUGIN_IDS.has(id)) continue;

            const isEnabled = enabledPlugins.has(id);
            const classification = isEnabled ? this.classify(id) : 'PARTIAL';
            // Disabled plugins can't be classified (no commands loaded) — assume PARTIAL

            const pluginDesc = manifest.description ?? `Community plugin: ${manifest.name ?? id}`;
            const entry: VaultDNAEntry = {
                id,
                name: manifest.name ?? id,
                type: 'community',
                classification,
                status: isEnabled ? 'enabled' : 'disabled',
                version: manifest.version,
                source: 'vault-native',
                description: pluginDesc,
                ...(classification === 'NONE' ? { reason: 'No agentifiable commands' } : {}),
                ...(classification !== 'NONE' ? { skillFile: `${id}.skill.md` } : {}),
            };

            if (classification !== 'NONE') {
                const commands = isEnabled ? this.getPluginCommands(id) : [];
                const skill: PluginSkillMeta = {
                    id,
                    name: manifest.name ?? id,
                    source: 'vault-native',
                    classification,
                    enabled: isEnabled,
                    commands,
                    description: manifest.description ?? `Community plugin: ${manifest.name ?? id}`,
                };

                // API Discovery (PAS-1.5, ADR-108 Tier 2)
                if (isEnabled) {
                    const apiMethods = this.discoverPluginApi(id);
                    if (apiMethods) {
                        skill.hasApi = true;
                        skill.apiMethods = apiMethods;
                    }
                }

                results.push({ dna: entry, skill });
            } else {
                // Even NONE-classified plugins might have a JS API
                if (isEnabled) {
                    const apiMethods = this.discoverPluginApi(id);
                    if (apiMethods && apiMethods.length > 0) {
                        // Plugin has no commands but has an API — promote to PARTIAL
                        entry.classification = 'PARTIAL';
                        entry.skillFile = `${id}.skill.md`;
                        delete entry.reason;
                        const skill: PluginSkillMeta = {
                            id,
                            name: manifest.name ?? id,
                            source: 'vault-native',
                            classification: 'PARTIAL',
                            enabled: isEnabled,
                            commands: [],
                            description: manifest.description ?? `Community plugin: ${manifest.name ?? id}`,
                            hasApi: true,
                            apiMethods,
                        };
                        results.push({ dna: entry, skill });
                        continue;
                    }
                }
                results.push({ dna: entry });
            }
        }

        return results;
    }

    // ── Classification ───────────────────────────────────────────────────

    classify(pluginId: string): PluginClassification {
        const commands = this.getPluginCommands(pluginId);
        const meaningful = commands.filter((c) => !isUIOnlyCommand(c.name));

        if (meaningful.length === 0) return 'NONE';
        if (meaningful.length >= 3) return 'FULL';
        return 'PARTIAL';
    }

    private getPluginCommands(pluginId: string): { id: string; name: string }[] {
        const allCommands = this.app.commands?.commands ?? {};
        const result: { id: string; name: string }[] = [];

        for (const [cmdId, cmd] of Object.entries(allCommands)) {
            // Commands are prefixed with plugin ID (e.g. "dataview:refresh-views")
            if (cmdId.startsWith(pluginId + ':')) {
                result.push({ id: cmdId, name: cmd.name ?? cmdId });
            }
        }

        return result;
    }

    // ── API Discovery (PAS-1.5, ADR-108 Tier 2) ─────────────────────────

    /**
     * Methods that are ALWAYS blocked from API discovery.
     * These are lifecycle, DOM, or code-execution methods.
     */
    private static readonly BLOCKED_API_METHODS = new Set([
        'constructor', 'execute', 'executeJs', 'render',
        'register', 'unregister', 'onload', 'onunload', 'destroy', 'eval',
    ]);

    /**
     * Discover plugin JavaScript API methods via Reflection.
     * Returns method names if the plugin has an .api property, null otherwise.
     */
    private discoverPluginApi(pluginId: string): string[] | null {
        try {
            const plugins = this.app.plugins?.plugins;
            if (!plugins) return null;

            const instance = plugins[pluginId];
            if (!instance) return null;

            // Try plugin.api first, then the plugin instance itself
            const api = instance.api;
            if (!api || typeof api !== 'object') return null;

            // Get method names from the prototype chain
            const proto = Object.getPrototypeOf(api);
            if (!proto) return null;

            const methods = Object.getOwnPropertyNames(proto)
                .filter((m) =>
                    !VaultDNAScanner.BLOCKED_API_METHODS.has(m) &&
                    typeof api[m] === 'function' &&
                    !m.startsWith('_'), // skip private-by-convention methods
                );

            if (methods.length === 0) return null;

            console.debug(`[VaultDNA] API discovered for ${pluginId}: ${methods.length} methods (${methods.slice(0, 5).join(', ')}${methods.length > 5 ? '...' : ''})`);
            return methods;
        } catch (e) {
            console.warn(`[VaultDNA] API discovery failed for ${pluginId}:`, e);
            return null;
        }
    }

    // ── Plugin Settings ─────────────────────────────────────────────────

    /** Patterns indicating a sensitive field name — silently redacted */
    private static readonly SENSITIVE_PATTERNS = [
        /api[_-]?key/i,
        /apikey/i,
        /secret/i,
        /password/i,
        /passwd/i,
        /credential/i,
        /token(?!ize)/i,
        /license[_-]?key/i,
        /access[_-]?key/i,
        /private[_-]?key/i,
        /auth(?:orization)?[_-]?(?:key|header|bearer)/i,
        /^oauth/i,
        /client[_-]?secret/i,
        /webhook[_-]?(?:url|secret)/i,
    ];

    /** Keys that are internal state, not useful to the agent */
    private static readonly EXCLUDED_KEYS = [
        /^lastBatch/i,
        /^last(?:Sync|Run|Check|Update|Shown)/i,
        /^cache/i,
        /^__/,
        /^installed/i,
        /^version$/i,
        /once[_-]?off/i,
        /settings[_-]?converted/i,
    ];

    private static readonly MAX_VALUE_SIZE = 500;
    private static readonly MAX_SETTINGS_OUTPUT = 8000;
    private static readonly MAX_NESTING_DEPTH = 3;

    /**
     * Read plugin settings from disk.
     * Community: .obsidian/plugins/{id}/data.json
     * Core: .obsidian/{id}.json (fallback: instance.options)
     */
    private async readPluginSettings(
        pluginId: string,
        source: PluginSource,
    ): Promise<Record<string, unknown> | null> {
        try {
            const settingsPath = source === 'core'
                ? `${this.vault.configDir}/${pluginId}.json`
                : `${this.vault.configDir}/plugins/${pluginId}/data.json`;

            const exists = await this.vault.adapter.exists(settingsPath);
            if (!exists) return null;

            const raw = await this.vault.adapter.read(settingsPath);
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return null;
        }
    }

    /**
     * Sanitize plugin settings: remove secrets, trim large values,
     * enforce size budget. Returns a readable string for the .skill.md.
     */
    private sanitizeSettings(
        raw: Record<string, unknown>,
    ): { sanitized: string; redactedCount: number; isEmpty: boolean } {
        const result: Record<string, unknown> = {};
        let redactedCount = 0;

        const processObject = (
            obj: Record<string, unknown>,
            target: Record<string, unknown>,
            depth: number,
        ): void => {
            if (depth > VaultDNAScanner.MAX_NESTING_DEPTH) return;

            for (const [key, value] of Object.entries(obj)) {
                if (VaultDNAScanner.SENSITIVE_PATTERNS.some((p) => p.test(key))) {
                    redactedCount++;
                    continue;
                }
                if (VaultDNAScanner.EXCLUDED_KEYS.some((p) => p.test(key))) {
                    continue;
                }
                if (value === null || value === undefined) continue;

                if (typeof value === 'string') {
                    if (value.length > VaultDNAScanner.MAX_VALUE_SIZE) {
                        target[key] = `[string, ${value.length} chars]`;
                    } else if (value !== '') {
                        target[key] = value;
                    }
                } else if (typeof value === 'boolean' || typeof value === 'number') {
                    target[key] = value;
                } else if (Array.isArray(value)) {
                    if (value.length === 0) continue;
                    const serialized = JSON.stringify(value);
                    if (serialized.length > VaultDNAScanner.MAX_VALUE_SIZE) {
                        const preview = value.slice(0, 3).map((v) =>
                            typeof v === 'string' ? v :
                            typeof v === 'object' ? '{...}' : String(v),
                        );
                        target[key] = `[${value.length} items: ${preview.join(', ')}...]`;
                    } else if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
                        target[key] = value;
                    } else {
                        target[key] = `[${value.length} items]`;
                    }
                } else if (typeof value === 'object') {
                    const child: Record<string, unknown> = {};
                    processObject(value as Record<string, unknown>, child, depth + 1);
                    if (Object.keys(child).length > 0) {
                        target[key] = child;
                    }
                }
            }
        };

        processObject(raw, result, 0);

        let output = this.settingsToYamlString(result, 0);

        if (output.length > VaultDNAScanner.MAX_SETTINGS_OUTPUT) {
            output = output.substring(0, VaultDNAScanner.MAX_SETTINGS_OUTPUT)
                + '\n[...truncated -- full settings in data.json]';
        }

        return {
            sanitized: output,
            redactedCount,
            isEmpty: Object.keys(result).length === 0,
        };
    }

    /**
     * Convert a settings object to a readable indented key-value format.
     */
    private settingsToYamlString(
        obj: Record<string, unknown>,
        indent: number,
    ): string {
        const lines: string[] = [];
        const prefix = '  '.repeat(indent);

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                lines.push(`${prefix}${key}:`);
                lines.push(this.settingsToYamlString(
                    value as Record<string, unknown>, indent + 1,
                ));
            } else if (Array.isArray(value)) {
                lines.push(`${prefix}${key}: [${value.join(', ')}]`);
            } else {
                lines.push(`${prefix}${key}: ${String(value)}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Determine if a plugin needs setup based on its settings state.
     */
    private detectSetupStatus(
        settings: Record<string, unknown> | null,
        isEnabled: boolean,
    ): string | null {
        if (!isEnabled) {
            return 'Plugin is disabled. Use enable_plugin to activate it first.';
        }
        if (settings === null) {
            return 'No settings file found (data.json). Plugin may need initial setup via Obsidian Settings.';
        }
        if (Object.keys(settings).length === 0) {
            return 'Settings are empty. Plugin likely needs configuration via Obsidian Settings.';
        }
        return null;
    }

    // ── .skill.md Generation ─────────────────────────────────────────────

    private async writeSkillFile(skill: PluginSkillMeta): Promise<void> {
        const coreDef = CORE_PLUGIN_IDS.has(skill.id)
            ? CORE_PLUGIN_DEFS.find((d) => d.id === skill.id)
            : undefined;

        // Read and sanitize plugin settings
        const rawSettings = await this.readPluginSettings(skill.id, skill.source);
        const { sanitized, redactedCount, isEmpty } = rawSettings
            ? this.sanitizeSettings(rawSettings)
            : { sanitized: '', redactedCount: 0, isEmpty: true };
        const setupHint = this.detectSetupStatus(rawSettings, skill.enabled);

        // Update skill meta flags
        skill.hasSettings = !isEmpty;
        skill.needsSetup = setupHint !== null;

        const body = coreDef
            ? this.enrichCoreBody(skill.id, coreDef.instructions, sanitized, setupHint, redactedCount)
            : this.generateSkeletonBody(skill, sanitized, setupHint, redactedCount);

        const migrated = this.holder ? isHolderMigrated(this.holder) : false;
        if (migrated && this.holder) {
            await this.writeFolderFormat(skill, body);
            // Top-5 plugins also get a references/commands.md.
            await this.writeCommandsReferenceIfTopPlugin(skill);
        } else {
            await this.writeLegacyFileFormat(skill, body, isEmpty, setupHint);
        }
    }

    /**
     * FEAT-29-02: Anthropic-conformant folder layout. Frontmatter is strict
     * (only `name` and `description`); every other metadata field that the
     * legacy `.skill.md` carried (id, source, plugin-type, status, class,
     * has-settings, needs-setup, commands) moves into the body as a
     * `## Plugin metadata` section so no information is lost.
     */
    private async writeFolderFormat(skill: PluginSkillMeta, agentBody: string): Promise<void> {
        if (!this.holder) return;
        const folder = getPluginSkillFolderPath(this.holder, skill.id);
        if (!folder) return; // safety: helper returned null even though migrated, treat as no-op
        const manifestPath = getPluginSkillManifestPath(this.holder, skill.id);

        // The folder might be new on first migration. mkdir is non-recursive,
        // so walk it.
        await this.ensureDirRecursive(folder);

        const metadataBlock = this.renderPluginMetadataBlock(skill);
        const description = skill.description.replace(/"/g, '\\"').replace(/\n/g, ' ');

        const content = [
            '---',
            `name: ${skill.id}`,
            `description: "${description}"`,
            '---',
            '',
            `# ${skill.name}`,
            '',
            metadataBlock,
            '',
            agentBody,
            '',
        ].join('\n');

        await this.vault.adapter.write(manifestPath, content);
    }

    /**
     * Pre-FEAT-29-02 legacy file format. Kept for users who have not opted
     * into the Welle 1 layout migration. Frontmatter and path are unchanged
     * from the pre-existing implementation so nothing else breaks.
     */
    private async writeLegacyFileFormat(
        skill: PluginSkillMeta,
        body: string,
        isEmpty: boolean,
        setupHint: string | null,
    ): Promise<void> {
        const commandsYaml = skill.commands
            .map((c) => `  - id: "${c.id}"\n    name: "${c.name}"`)
            .join('\n');

        const content = [
            '---',
            `id: ${skill.id}`,
            `name: ${skill.name}`,
            `source: ${skill.source}`,
            `plugin-type: ${skill.source === 'core' ? 'core' : 'community'}`,
            `status: ${skill.enabled ? 'enabled' : 'disabled'}`,
            `class: ${skill.classification}`,
            `description: "${skill.description.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`,
            `has-settings: ${!isEmpty}`,
            ...(setupHint ? ['needs-setup: true'] : []),
            ...(commandsYaml ? [`commands:\n${commandsYaml}`] : []),
            '---',
            '',
            body,
            '',
        ].join('\n');

        const path = `${this.skillsDir}/${skill.id}.skill.md`;
        await this.vault.adapter.write(path, content);
    }

    /**
     * FEAT-29-02: Render the legacy frontmatter fields (id, source, status,
     * class, has-settings, commands, etc) as a Markdown section so the
     * agent can still read them when only `name` + `description` survive in
     * the frontmatter.
     */
    private renderPluginMetadataBlock(skill: PluginSkillMeta): string {
        const lines: string[] = ['## Plugin metadata', ''];
        lines.push(`- **id:** \`${escapeInlineCode(skill.id)}\``);
        lines.push(`- **source:** ${skill.source}`);
        lines.push(`- **plugin-type:** ${skill.source === 'core' ? 'core' : 'community'}`);
        lines.push(`- **status:** ${skill.enabled ? 'enabled' : 'disabled'}`);
        lines.push(`- **class:** ${skill.classification}`);
        lines.push(`- **has-settings:** ${skill.hasSettings ? 'true' : 'false'}`);
        if (skill.needsSetup) lines.push('- **needs-setup:** true');
        if (skill.commands.length > 0) {
            lines.push('');
            lines.push('### Commands');
            lines.push('');
            for (const c of skill.commands) {
                // L-2 from AUDIT-FEAT-29-02: plugin-controlled name may contain
                // newlines or backticks; escape so the list-item structure stays
                // intact regardless of plugin manifest quality.
                lines.push(`- \`${escapeInlineCode(c.id)}\` -- ${escapeMarkdownInline(c.name)}`);
            }
        }
        return lines.join('\n');
    }

    private generateSkeletonBody(
        skill: PluginSkillMeta,
        settingsBlock: string,
        setupHint: string | null,
        redactedCount: number,
    ): string {
        const lines: string[] = [];
        lines.push(`# ${skill.name}`);
        lines.push('');
        lines.push(`**Description:** ${skill.description}`);
        lines.push(`**Status:** ${skill.enabled ? 'Enabled' : 'Disabled'}`);
        lines.push(`**Plugin ID:** ${skill.id}`);

        if (setupHint) {
            lines.push('');
            lines.push('## Setup Required');
            lines.push('');
            lines.push(setupHint);
            lines.push('Guide the user to configure this plugin via Obsidian Settings if needed.');
        }

        if (skill.commands.length > 0) {
            lines.push('');
            lines.push('## Available Commands');
            lines.push('');
            lines.push('Available command IDs (use execute_command for Obsidian-native commands):');
            for (const cmd of skill.commands) {
                lines.push(`- \`${cmd.id}\` -- ${cmd.name}`);
            }
        }

        // Plugin API section (PAS-1.5)
        if (skill.hasApi && skill.apiMethods && skill.apiMethods.length > 0) {
            lines.push('');
            lines.push('## Plugin API');
            lines.push('');
            lines.push('This plugin exposes a JavaScript API. Use call_plugin_api to call these methods:');
            for (const method of skill.apiMethods) {
                lines.push(`- \`${method}\` -- call via call_plugin_api("${skill.id}", "${method}", [args])`);
            }
            lines.push('');
            lines.push('Note: Dynamically discovered methods require user approval for each call unless marked as safe in settings.');
        }

        // Configuration File section
        const configPath = skill.source === 'core'
            ? `${this.vault.configDir}/${skill.id}.json`
            : `${this.vault.configDir}/plugins/${skill.id}/data.json`;
        lines.push('');
        lines.push('## Configuration File');
        lines.push('');
        lines.push(`Settings path: \`${configPath}\``);
        lines.push('');
        lines.push('To configure this plugin programmatically:');
        lines.push(`1. Read the config: read_file("${configPath}")`);
        lines.push('2. Understand the settings structure and modify values as needed');
        lines.push(`3. Write changes: write_file("${configPath}", updatedJSON)`);
        lines.push('');
        lines.push('Do NOT ask the user to open Settings UI. Modify data.json directly.');

        if (settingsBlock) {
            lines.push('');
            lines.push('## Current Configuration');
            lines.push('');
            lines.push('These are the plugin\'s current settings (sensitive values redacted):');
            lines.push('');
            lines.push('```');
            lines.push(settingsBlock);
            lines.push('```');
            if (redactedCount > 0) {
                lines.push(`(${redactedCount} sensitive field(s) redacted)`);
            }
            lines.push('');
            lines.push(`For full settings, read: \`${configPath}\``);
        }

        // Documentation reference
        lines.push('');
        lines.push('## Documentation');
        lines.push('');
        lines.push(`For detailed plugin documentation (commands, options, dependencies):`);
        lines.push(`read_file("${this.skillsDir}/${skill.id}.readme.md")`);

        // Usage section
        lines.push('');
        lines.push('## Usage');
        lines.push('');
        if (skill.enabled) {
            lines.push(`When the user asks for functionality related to ${skill.name}:`);
            lines.push(`1. Read the plugin documentation (.readme.md) to understand capabilities and dependencies`);
            lines.push(`2. Read the config file (${configPath}). If it does not exist, that is normal -- create it with the required settings`);
            lines.push('3. Configure the plugin by writing data.json with the values needed for the task');
            lines.push('4. Execute the task using the appropriate tool:');
            lines.push('   - For Obsidian-native commands (including file export): use execute_command');
            lines.push('   - For CLI-based conversion needing Pandoc/LaTeX: use execute_recipe');
            lines.push('   - For data queries: use call_plugin_api');
            lines.push('5. If a command opens a UI dialog, tell the user what to click.');
            lines.push('');
            lines.push('CRITICAL RULES:');
            lines.push('- Prefer native Obsidian commands over external tools when both can accomplish the task.');
            lines.push('- NEVER create fake output files. If the user asks for a PDF/DOCX/image export, use execute_recipe -- do NOT write content to a .pdf file yourself.');
            lines.push('- If a dependency is missing (e.g. Pandoc), tell the user what to install.');
            lines.push('IMPORTANT: After reading this file, ALWAYS take action or respond. Never end silently.');
        } else {
            lines.push(`This plugin is currently disabled. Use enable_plugin("${skill.id}") to activate it first.`);
            lines.push('After enabling, the plugin\'s commands will become available for execute_command.');
        }

        return lines.join('\n');
    }

    /**
     * Enrich a core plugin's existing hand-written instructions with
     * configuration, settings, and usage sections (matching community format).
     */
    private enrichCoreBody(
        skillId: string,
        originalInstructions: string,
        settingsBlock: string,
        setupHint: string | null,
        redactedCount: number,
    ): string {
        const parts: string[] = [originalInstructions];

        if (setupHint) {
            parts.push('');
            parts.push('## Setup Required');
            parts.push('');
            parts.push(setupHint);
        }

        // Configuration File section
        const configPath = `${this.vault.configDir}/${skillId}.json`;
        parts.push('');
        parts.push('## Configuration File');
        parts.push('');
        parts.push(`Settings path: \`${configPath}\``);
        parts.push('');
        parts.push('To configure this plugin programmatically:');
        parts.push(`1. Read the config: read_file("${configPath}")`);
        parts.push('2. Understand the settings structure and modify values as needed');
        parts.push(`3. Write changes: write_file("${configPath}", updatedJSON)`);
        parts.push('');
        parts.push('Do NOT ask the user to open Settings UI. Modify config directly.');

        if (settingsBlock) {
            parts.push('');
            parts.push('## Current Configuration');
            parts.push('');
            parts.push('```');
            parts.push(settingsBlock);
            parts.push('```');
            if (redactedCount > 0) {
                parts.push(`(${redactedCount} sensitive field(s) redacted)`);
            }
            parts.push('');
            parts.push(`For full settings, read: \`${configPath}\``);
        }

        // Documentation reference
        parts.push('');
        parts.push('## Documentation');
        parts.push('');
        parts.push(`For detailed documentation:`);
        parts.push(`read_file("${this.skillsDir}/${skillId}.readme.md")`);

        parts.push('');
        parts.push('IMPORTANT: After reading this file, ALWAYS take action or respond. Never end silently.');

        return parts.join('\n');
    }

    /**
     * Generate .readme.md (legacy) or `references/readme.md` (FEAT-29-02) for
     * core plugins from CorePluginLibrary definitions. Core plugins have no
     * GitHub repo, so we create docs from our static defs. Layout-aware: post-
     * Welle-1 the file lands inside the per-plugin folder under references/.
     */
    private async writeCorePluginReadmes(): Promise<void> {
        for (const def of CORE_PLUGIN_DEFS) {
            const readmePath = this.holder
                ? getPluginSkillReadmePath(this.holder, def.id)
                : `${this.skillsDir}/${def.id}.readme.md`;
            const configPath = `${this.vault.configDir}/${def.id}.json`;

            const lines: string[] = [
                `# ${def.name}`,
                '',
                `${def.description}`,
                '',
                '## Overview',
                '',
                `${def.name} is an Obsidian core plugin. It is built into Obsidian and does not require separate installation.`,
                '',
                '## Commands',
                '',
            ];

            for (const cmd of def.commands) {
                lines.push(`- \`${cmd.id}\` -- ${cmd.name}`);
            }

            lines.push('');
            lines.push('## Configuration');
            lines.push('');
            lines.push(`Settings are stored at \`${configPath}\`.`);
            lines.push('');
            lines.push(`To read: \`read_file("${configPath}")\``);
            lines.push(`To write: \`write_file("${configPath}", updatedJSON)\``);
            lines.push('');
            lines.push('## Usage Notes');
            lines.push('');
            lines.push(def.instructions);

            // Ensure references/ folder exists (folder layout only); for the
            // legacy file layout the skillsDir already exists.
            const parent = readmePath.substring(0, readmePath.lastIndexOf('/'));
            if (parent) await this.ensureDirRecursive(parent);
            await this.vault.adapter.write(readmePath, lines.join('\n'));
        }
    }

    /**
     * FEAT-29-02 Task 3: eager-generate a `references/commands.md` for the
     * curated Top-5 plugins. Only fires post-Welle-1 (folder layout). Each
     * command lands as one table row with id + name; agents can read this
     * separately from the SKILL.md so the manifest stays slim.
     *
     * Idempotent: overwrites on every scan with the current command set.
     */
    private async writeCommandsReferenceIfTopPlugin(skill: PluginSkillMeta): Promise<void> {
        if (!this.holder) return;
        if (!isHolderMigrated(this.holder)) return;
        if (!TOP_PLUGINS_WITH_COMMANDS_REF.has(skill.id)) return;
        const refPath = getPluginSkillCommandsRefPath(this.holder, skill.id);
        if (!refPath) return;

        const parent = refPath.substring(0, refPath.lastIndexOf('/'));
        if (parent) await this.ensureDirRecursive(parent);

        const lines: string[] = [
            `# ${skill.name} -- commands reference`,
            '',
            `Auto-generated by VaultDNAScanner. Updated on each plugin scan.`,
            '',
        ];

        if (skill.commands.length === 0) {
            lines.push('No commands exposed by this plugin at scan time.');
        } else {
            lines.push('| Command ID | Name |');
            lines.push('|---|---|');
            for (const cmd of skill.commands) {
                // M-1 from AUDIT-FEAT-29-02: plugin-controlled name may contain
                // a pipe character that would otherwise break the markdown
                // table layout. Escape pipes and collapse newlines.
                lines.push(
                    `| \`${escapeInlineCode(cmd.id)}\` | ${escapeMarkdownTableCell(cmd.name)} |`,
                );
            }
        }
        lines.push('');

        await this.vault.adapter.write(refPath, lines.join('\n'));
    }

    // ── Continuous Sync (Polling) ────────────────────────────────────────

    startSync(): void {
        const enabledPlugins = this.app.plugins?.enabledPlugins;
        this.lastKnownEnabledSet = new Set(enabledPlugins ?? []);
        this.pollIntervalId = scheduleRecurring(() => { void this.checkForChanges(); }, 30_000);
    }

    stopSync(): void {
        if (this.pollIntervalId) {
            this.pollIntervalId.stop();
            this.pollIntervalId = null;
        }
    }

    private async checkForChanges(): Promise<void> {
        const currentEnabled = new Set<string>(this.app.plugins?.enabledPlugins ?? []);

        // Find newly enabled plugins
        for (const id of currentEnabled) {
            if (!this.lastKnownEnabledSet.has(id) && id !== 'obsidian-agent') {
                console.debug(`[VaultDNA] Plugin enabled: ${id}`);
                await this.handlePluginEnabled(id);
            }
        }

        // Find newly disabled plugins
        for (const id of this.lastKnownEnabledSet) {
            if (!currentEnabled.has(id) && id !== 'obsidian-agent') {
                console.debug(`[VaultDNA] Plugin disabled: ${id}`);
                await this.handlePluginDisabled(id);
            }
        }

        this.lastKnownEnabledSet = currentEnabled;
    }

    async handlePluginEnabled(pluginId: string): Promise<void> {
        if (!this.vaultDNA) return;

        // Reclassify — commands are now available
        const classification = this.classify(pluginId);

        // Update DNA entry
        const entry = this.vaultDNA.plugins.find((p) => p.id === pluginId);
        if (entry) {
            entry.status = 'enabled';
            entry.classification = classification;
            if (classification !== 'NONE') {
                entry.skillFile = `${pluginId}.skill.md`;
                delete entry.reason;
            }
        }

        // API Discovery for newly enabled plugin
        const apiMethods = this.discoverPluginApi(pluginId);

        // Find or create skill entry
        const skillIdx = this.pluginSkills.findIndex((s) => s.id === pluginId);
        if (skillIdx >= 0) {
            // Existing skill — update
            this.pluginSkills[skillIdx].enabled = true;
            this.pluginSkills[skillIdx].commands = this.getPluginCommands(pluginId);
            this.pluginSkills[skillIdx].classification = classification;
            if (apiMethods) {
                this.pluginSkills[skillIdx].hasApi = true;
                this.pluginSkills[skillIdx].apiMethods = apiMethods;
            }
            await this.writeSkillFile(this.pluginSkills[skillIdx]);
        } else if (classification !== 'NONE' || (apiMethods && apiMethods.length > 0)) {
            // Was NONE during initial scan — promote to skill now that commands or API exist
            const manifests = this.app.plugins?.manifests ?? {};
            const manifest = manifests[pluginId];
            const effectiveClass = classification !== 'NONE' ? classification : 'PARTIAL';
            const newSkill: PluginSkillMeta = {
                id: pluginId,
                name: manifest?.name ?? pluginId,
                source: 'vault-native',
                classification: effectiveClass,
                enabled: true,
                commands: this.getPluginCommands(pluginId),
                description: manifest?.description ?? `Community plugin: ${manifest?.name ?? pluginId}`,
                ...(apiMethods ? { hasApi: true, apiMethods } : {}),
            };
            if (entry && effectiveClass !== classification) {
                entry.classification = effectiveClass;
                entry.skillFile = `${pluginId}.skill.md`;
                delete entry.reason;
            }
            this.pluginSkills.push(newSkill);
            await this.writeSkillFile(newSkill);
        }

        await this.vault.adapter.write(this.dnaPath, JSON.stringify(this.vaultDNA, null, 2));

        // Background: fetch README for newly enabled plugin
        this.fetchPluginRegistry().then((registry) => {
            const repo = registry.get(pluginId);
            if (repo) this.fetchPluginReadme(pluginId, repo).catch(() => {});
        }).catch(() => {});
    }

    async handlePluginDisabled(pluginId: string): Promise<void> {
        if (!this.vaultDNA) return;
        const entry = this.vaultDNA.plugins.find((p) => p.id === pluginId);
        if (entry) {
            entry.status = 'disabled';
        }

        const skillIdx = this.pluginSkills.findIndex((s) => s.id === pluginId);
        if (skillIdx >= 0) {
            this.pluginSkills[skillIdx].enabled = false;
            await this.writeSkillFile(this.pluginSkills[skillIdx]);
        }

        await this.vault.adapter.write(this.dnaPath, JSON.stringify(this.vaultDNA, null, 2));
    }

    // ── Getters ──────────────────────────────────────────────────────────

    getVaultDNA(): VaultDNA | null {
        return this.vaultDNA;
    }

    getEnabledPluginSkills(): PluginSkillMeta[] {
        return this.pluginSkills.filter((s) => s.enabled);
    }

    getDisabledPluginSkills(): PluginSkillMeta[] {
        return this.pluginSkills.filter((s) => !s.enabled);
    }

    getAllPluginSkills(): PluginSkillMeta[] {
        return this.pluginSkills;
    }

    destroy(): void {
        this.stopSync();
    }

    // ── README Fetch (Background) ────────────────────────────────────────

    private static readonly README_MAX_LEN = 20000;
    private static readonly README_CACHE_DAYS = 7;

    /**
     * Build a map of plugin ID → GitHub "owner/repo" from the official
     * Obsidian community plugin registry. This is the only reliable
     * source — manifest.authorUrl is freeform and usually just a profile link.
     */
    private async fetchPluginRegistry(): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        try {
            const response = await requestUrl({
                url: 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json',
                method: 'GET',
                throw: false,
            });
            if (response.status === 200) {
                const entries: { id: string; repo: string }[] = JSON.parse(response.text);
                for (const entry of entries) {
                    if (entry.id && entry.repo) map.set(entry.id, entry.repo);
                }
                console.debug(`[VaultDNA] Loaded plugin registry: ${map.size} entries`);
            }
        } catch (e) {
            console.warn('[VaultDNA] Failed to fetch plugin registry:', e);
        }
        return map;
    }

    async fetchAllReadmes(force = false): Promise<void> {
        const registry = await this.fetchPluginRegistry();
        if (registry.size === 0) {
            console.warn('[VaultDNA] Plugin registry empty — skipping README fetch');
            return;
        }

        let fetched = 0;
        let skipped = 0;

        for (const skill of this.pluginSkills) {
            if (skill.source === 'core') continue; // core plugins have built-in docs

            const repo = registry.get(skill.id);
            if (!repo) { skipped++; continue; }

            const didFetch = await this.fetchPluginReadme(skill.id, repo, force);
            if (didFetch) fetched++;

            // Rate-limit: 1 request per second
            await new Promise<void>((r) => window.setTimeout(r, 1000));
        }

        console.debug(`[VaultDNA] README fetch complete: ${fetched} new/updated, ${skipped} skipped (not in registry)`);
    }

    async fetchPluginReadme(pluginId: string, repo: string, force = false): Promise<boolean> {
        const readmePath = `${this.skillsDir}/${pluginId}.readme.md`;

        // Cache check: skip if younger than 7 days (unless force)
        if (!force) {
            try {
                const stat = await this.vault.adapter.stat(readmePath);
                if (stat && (Date.now() - stat.mtime) < VaultDNAScanner.README_CACHE_DAYS * 24 * 60 * 60 * 1000) {
                    return false;
                }
            } catch { /* file doesn't exist — continue */ }
        }

        const rawUrl = `https://raw.githubusercontent.com/${repo}/HEAD/README.md`;

        try {
            const response = await requestUrl({
                url: rawUrl,
                method: 'GET',
                throw: false,
            });

            if (response.status === 200) {
                const readme = response.text.length > VaultDNAScanner.README_MAX_LEN
                    ? response.text.slice(0, VaultDNAScanner.README_MAX_LEN) + '\n\n...[truncated]'
                    : response.text;
                await this.vault.adapter.write(readmePath, readme);
                console.debug(`[VaultDNA] Fetched README: ${pluginId}`);
                return true;
            }
            console.warn(`[VaultDNA] README not found for ${pluginId} (${response.status})`);
        } catch (e) {
            console.warn(`[VaultDNA] README fetch failed for ${pluginId}:`, e);
        }
        return false;
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
