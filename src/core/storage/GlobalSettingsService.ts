/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * GlobalSettingsService
 *
 * Manages the global settings file at ~/.obsidian-agent/settings.json.
 * Provides load/save/merge operations for cross-vault settings sharing.
 *
 * Settings split:
 * - GLOBAL: API keys, models, modes, auto-approval, memory, language, UI prefs,
 *   mastery, recipes, onboarding, customPrompts, pluginApi, rules/workflow/skill toggles,
 *   webTools, advancedApi, mcpServers, debugMode
 * - VAULT-LOCAL: semantic*, checkpoint*, vaultDNA, chatHistoryFolder, _encrypted,
 *   _globalStorageMigrated
 */

import type { GlobalFileService } from './GlobalFileService';
import type { ObsidianAgentSettings } from '../../types/settings';
import type { SafeStorageService } from '../security/SafeStorageService';

// ---------------------------------------------------------------------------
// Vault-local keys — everything NOT in this set is considered global
// ---------------------------------------------------------------------------

const VAULT_LOCAL_KEYS = new Set<string>([
    'enableSemanticIndex',
    'embeddingModel',
    'embeddingModels',
    'activeEmbeddingModelKey',
    'semanticBatchSize',
    'semanticAutoIndex',
    'semanticExcludedFolders',
    'semanticStorageLocation',
    'semanticIndexPdfs',
    'semanticChunkSize',
    'hydeEnabled',
    'semanticAutoIndexOnChange',
    'enableCheckpoints',
    'checkpointTimeoutSeconds',
    'checkpointAutoCleanup',
    'vaultDNA',
    'chatHistoryFolder',
    'modeToolOverrides',
    'modeSkillAllowList',
    'forcedSkills',
    '_encrypted',
    '_globalStorageMigrated',
    '_syncDirMigrated',
]);

// ---------------------------------------------------------------------------
// GlobalSettingsService
// ---------------------------------------------------------------------------

const SETTINGS_FILE = 'settings.json';

export class GlobalSettingsService {
    constructor(
        private globalFs: GlobalFileService,
        private safeStorage: SafeStorageService,
    ) {}

    /**
     * Load global settings from ~/.obsidian-agent/settings.json.
     * Returns partial settings (only the global keys that were persisted).
     */
    async loadGlobal(): Promise<Partial<ObsidianAgentSettings>> {
        try {
            const exists = await this.globalFs.exists(SETTINGS_FILE);
            if (!exists) return {};
            const raw = await this.globalFs.read(SETTINGS_FILE);
            const parsed = JSON.parse(raw);
            // Decrypt API keys in global settings
            this.decryptGlobal(parsed);
            return parsed as Partial<ObsidianAgentSettings>;
        } catch (e) {
            console.warn('[GlobalSettingsService] Failed to load global settings:', e);
            return {};
        }
    }

    /**
     * Save global-scoped settings to ~/.obsidian-agent/settings.json.
     * Only writes keys that are NOT vault-local.
     */
    async saveGlobal(settings: ObsidianAgentSettings): Promise<void> {
        try {
            const globalSubset: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(settings)) {
                if (!VAULT_LOCAL_KEYS.has(key)) {
                    globalSubset[key] = value;
                }
            }
            // Encrypt API keys before writing
            const encrypted = this.encryptGlobal(globalSubset);
            await this.globalFs.write(SETTINGS_FILE, JSON.stringify(encrypted, null, 2));
        } catch (e) {
            console.warn('[GlobalSettingsService] Failed to save global settings:', e);
        }
    }

    /**
     * Merge global settings into vault-local settings.
     * Global keys from global file override vault-local data.json values.
     * Vault-local keys are preserved from data.json.
     */
    mergeIntoVault(
        vaultSettings: ObsidianAgentSettings,
        globalSettings: Partial<ObsidianAgentSettings>,
    ): ObsidianAgentSettings {
        const merged = { ...vaultSettings };
        for (const [key, value] of Object.entries(globalSettings)) {
            if (!VAULT_LOCAL_KEYS.has(key) && value !== undefined) {
                (merged as Record<string, unknown>)[key] = value;
            }
        }
        return merged;
    }

    // -----------------------------------------------------------------------
    // Encryption helpers (mirrors main.ts pattern for global file)
    // -----------------------------------------------------------------------

    private decryptGlobal(settings: Record<string, unknown>): void {
        if (!settings._encrypted) return;
        const models = settings.activeModels as Array<{ apiKey?: string }> | undefined;
        for (const model of models ?? []) {
            if (model.apiKey) model.apiKey = this.safeStorage.decrypt(model.apiKey);
        }
        const webTools = settings.webTools as { braveApiKey?: string; tavilyApiKey?: string } | undefined;
        if (webTools) {
            if (webTools.braveApiKey) webTools.braveApiKey = this.safeStorage.decrypt(webTools.braveApiKey);
            if (webTools.tavilyApiKey) webTools.tavilyApiKey = this.safeStorage.decrypt(webTools.tavilyApiKey);
        }
        // AUDIT-007 H-1: Decrypt all token fields (aligned with main.ts)
        if (settings.githubCopilotAccessToken) {
            settings.githubCopilotAccessToken = this.safeStorage.decrypt(settings.githubCopilotAccessToken as string);
        }
        if (settings.githubCopilotToken) {
            settings.githubCopilotToken = this.safeStorage.decrypt(settings.githubCopilotToken as string);
        }
        if (settings.kiloToken) {
            settings.kiloToken = this.safeStorage.decrypt(settings.kiloToken as string);
        }
        if (settings.cloudflareApiToken) {
            settings.cloudflareApiToken = this.safeStorage.decrypt(settings.cloudflareApiToken as string);
        }
        if (settings.relayToken) {
            settings.relayToken = this.safeStorage.decrypt(settings.relayToken as string);
        }
        if (settings.mcpServerToken) {
            settings.mcpServerToken = this.safeStorage.decrypt(settings.mcpServerToken as string);
        }
    }

    private encryptGlobal(settings: Record<string, unknown>): Record<string, unknown> {
        const copy = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
        if (!this.safeStorage.isAvailable()) {
            copy._encrypted = false;
            return copy;
        }
        const models = copy.activeModels as Array<{ apiKey?: string }> | undefined;
        for (const model of models ?? []) {
            if (model.apiKey && !this.safeStorage.isEncrypted(model.apiKey)) {
                model.apiKey = this.safeStorage.encrypt(model.apiKey);
            }
        }
        const webTools = copy.webTools as { braveApiKey?: string; tavilyApiKey?: string } | undefined;
        if (webTools) {
            if (webTools.braveApiKey && !this.safeStorage.isEncrypted(webTools.braveApiKey)) {
                webTools.braveApiKey = this.safeStorage.encrypt(webTools.braveApiKey);
            }
            if (webTools.tavilyApiKey && !this.safeStorage.isEncrypted(webTools.tavilyApiKey)) {
                webTools.tavilyApiKey = this.safeStorage.encrypt(webTools.tavilyApiKey);
            }
        }
        // AUDIT-007 H-1: Encrypt all token fields (aligned with main.ts)
        if (copy.githubCopilotAccessToken && !this.safeStorage.isEncrypted(copy.githubCopilotAccessToken as string)) {
            copy.githubCopilotAccessToken = this.safeStorage.encrypt(copy.githubCopilotAccessToken as string);
        }
        if (copy.githubCopilotToken && !this.safeStorage.isEncrypted(copy.githubCopilotToken as string)) {
            copy.githubCopilotToken = this.safeStorage.encrypt(copy.githubCopilotToken as string);
        }
        if (copy.kiloToken && !this.safeStorage.isEncrypted(copy.kiloToken as string)) {
            copy.kiloToken = this.safeStorage.encrypt(copy.kiloToken as string);
        }
        if (copy.cloudflareApiToken && !this.safeStorage.isEncrypted(copy.cloudflareApiToken as string)) {
            copy.cloudflareApiToken = this.safeStorage.encrypt(copy.cloudflareApiToken as string);
        }
        if (copy.relayToken && !this.safeStorage.isEncrypted(copy.relayToken as string)) {
            copy.relayToken = this.safeStorage.encrypt(copy.relayToken as string);
        }
        if (copy.mcpServerToken && !this.safeStorage.isEncrypted(copy.mcpServerToken as string)) {
            copy.mcpServerToken = this.safeStorage.encrypt(copy.mcpServerToken as string);
        }
        copy._encrypted = true;
        return copy;
    }
}
