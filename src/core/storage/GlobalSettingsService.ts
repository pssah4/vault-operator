/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
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
import {
    encryptProviderCredentialsInPlace,
    encryptGeminiOAuthCredentialsInPlace,
    decryptProviderCredentialsInPlace,
} from '../security/providerCredentialCrypto';
import {
    encryptMcpOAuthInPlace,
    decryptMcpOAuthInPlace,
} from '../security/mcpOAuthCrypto';

// ---------------------------------------------------------------------------
// Vault-local keys — everything NOT in this set is considered global
// ---------------------------------------------------------------------------

const VAULT_LOCAL_KEYS = new Set<string>([
    // AUDIT 2026-07-26 M-8: which Obsidian commands the agent may run is a
    // per-vault decision. This list is an OPT-OUT list -- anything not named
    // here is written to the cross-vault global file -- so without this entry
    // enrolling a command in one vault would enable it in every vault on the
    // machine, and the permissions surface would say "this vault" while meaning
    // something wider.
    'executeCommandAllowedIds',
    'enableSemanticIndex',
    'embeddingModel',
    'embeddingModels',
    'activeEmbeddingModelKey',
    'semanticBatchSize',
    'semanticAutoIndex',
    'semanticExcludedFolders',
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
    'forcedWorkflow',
    'modeMcpOverrides',
    '_encrypted',
    '_globalStorageMigrated',
    '_syncDirMigrated',
    '_forcedWorkflowVaultMigrated',
    '_mcpPerModeMigrated',
    // Side finding (2026-08-14): "this vault has seen the PDF reindex
    // hint" is per-vault state -- each vault has its own PDF index and
    // its own stale embeddings. Without this entry the flag was written
    // to the cross-vault global file, so dismissing the hint in one vault
    // silently suppressed it in every other vault on the machine, and the
    // users who most needed it (several vaults, older PDF embeddings)
    // were exactly the ones who never saw it again.
    // FEAT-29-01-02: the layout is a property of THIS vault, so the
    // answer to "migrate it?" belongs to this vault too.
    '_layoutUpgradePromptShown',
    '_pdfReindexHintShown',
    '_pdfReindexCompleted',
]);

/**
 * ADR-160: forcedWorkflow moved from global to vault-local. Decide the
 * vault-local value on load. Pre-ADR-160 the GLOBAL file won on load
 * (mergeIntoVault), so data.json only mirrors a possibly-stale copy: whenever
 * the global file has the key -- including an explicitly cleared map -- that IS
 * the state the user last saw, and the vault adopts it. The vault mirror is
 * only the fallback for installs whose global file never carried the key.
 * Pure so the one-time migration can be asserted directly.
 */
export function resolveVaultForcedWorkflow(
    vaultForced: Record<string, string> | undefined,
    legacyGlobal: Record<string, string> | undefined,
): Record<string, string> {
    if (legacyGlobal !== undefined) {
        return { ...legacyGlobal };
    }
    return { ...(vaultForced ?? {}) };
}

/**
 * ADR-161 (FEAT-04-12): decide the vault-local per-mode MCP overrides on the
 * one-time migration from the legacy GLOBAL activation. Only a legacy state
 * that deviates from the all-active default is adopted, stamped into every
 * mode known at migration time (disabled -> empty list per mode = none;
 * explicit subset -> that subset per mode). A vault map that already has
 * entries wins untouched. Pure so the migration can be asserted directly.
 */
export function resolveModeMcpOverrides(
    vaultMap: Record<string, string[]> | undefined,
    legacyActive: string[] | undefined,
    legacyDisabled: boolean | undefined,
    knownModeSlugs: string[],
): Record<string, string[]> {
    if (vaultMap && Object.keys(vaultMap).length > 0) return vaultMap;
    if (legacyDisabled === true) {
        return Object.fromEntries(knownModeSlugs.map((slug) => [slug, []]));
    }
    if (legacyActive && legacyActive.length > 0) {
        return Object.fromEntries(knownModeSlugs.map((slug) => [slug, [...legacyActive]]));
    }
    return {};
}

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
        return (await this.loadGlobalOrNull()) ?? {};
    }

    /**
     * Like loadGlobal, but distinguishes "file does not exist" ({}) from
     * "file exists and cannot be read" (null). One-time migrations must NOT
     * burn their flag on null: the data is still on disk, only this read
     * failed, and the next boot can retry (ADR-160 review fix).
     */
    async loadGlobalOrNull(): Promise<Partial<ObsidianAgentSettings> | null> {
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
            return null;
        }
    }

    /**
     * Save global-scoped settings to ~/.obsidian-agent/settings.json.
     * Only writes keys that are NOT vault-local.
     *
     * FIX-44-36: returns whether the write succeeded. The global file WINS over
     * data.json on load (mergeIntoVault), so a silently-swallowed failure meant a
     * permission change looked saved but reverted on the next restart. The caller
     * surfaces the failure instead.
     */
    async saveGlobal(settings: ObsidianAgentSettings): Promise<boolean> {
        try {
            const globalSubset: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(settings)) {
                if (!VAULT_LOCAL_KEYS.has(key)) {
                    globalSubset[key] = value;
                }
            }
            // ADR-160 review fix: forcedWorkflow is vault-local now, but OTHER
            // vaults may not have run their one-time adoption yet. Preserve a
            // legacy value already in the file instead of stripping it on the
            // first save from any vault. The key is inert at runtime
            // (mergeIntoVault skips vault-local keys); it only serves as the
            // migration source for not-yet-migrated vaults. On a failed read
            // (null) there is nothing we can do -- the subsequent write would
            // likely fail too, and saveGlobal returns false on that path.
            const existing = await this.loadGlobalOrNull();
            if (existing?.forcedWorkflow !== undefined) {
                globalSubset.forcedWorkflow = existing.forcedWorkflow;
            }
            // Encrypt API keys before writing
            const encrypted = this.encryptGlobal(globalSubset);
            await this.globalFs.write(SETTINGS_FILE, JSON.stringify(encrypted, null, 2));
            return true;
        } catch (e) {
            console.error('[GlobalSettingsService] Failed to save global settings:', e);
            return false;
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
        // AUDIT-034 H-3 / H-4: decrypt per-provider credentials inside
        // providerConfigs[] and legacy_active_models_backup. Walker is
        // shared with main.ts decryptSettings so the two paths cannot
        // desync on the credential keys.
        decryptProviderCredentialsInPlace(
            settings as unknown as ObsidianAgentSettings,
            this.safeStorage,
        );
        // AUDIT-2026-07-17 H-1: mcpServers is a GLOBAL key, so the OAuth
        // tokens / client_secret / header credentials it carries are dual-
        // written here. Mirror the data.json decrypt pass (main.ts) with the
        // shared walker so the two paths cannot desync (CWE-312).
        decryptMcpOAuthInPlace(
            settings as unknown as ObsidianAgentSettings,
            this.safeStorage,
        );
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
        // AUDIT-034 H-2 / H-4: ChatGPT OAuth tokens (ADR-088) must be
        // decrypted on load to match main.ts decryptSettings. Refresh
        // token is long-lived, id_token carries email + accountId.
        if (settings.chatgptOAuthAccessToken) {
            settings.chatgptOAuthAccessToken = this.safeStorage.decrypt(settings.chatgptOAuthAccessToken as string);
        }
        if (settings.chatgptOAuthRefreshToken) {
            settings.chatgptOAuthRefreshToken = this.safeStorage.decrypt(settings.chatgptOAuthRefreshToken as string);
        }
        if (settings.chatgptOAuthIdToken) {
            settings.chatgptOAuthIdToken = this.safeStorage.decrypt(settings.chatgptOAuthIdToken as string);
        }
        // AUDIT 2026-07-26 (P3): the identity fields were plaintext HERE while
        // main.ts encrypts the very same two in the vault file. The global file
        // sits in a sync-prone directory, so it is the copy that travels -- the
        // asymmetry protected the less exposed of the two.
        if (settings.chatgptOAuthEmail) {
            settings.chatgptOAuthEmail = this.safeStorage.decrypt(settings.chatgptOAuthEmail as string);
        }
        if (settings.chatgptOAuthAccountId) {
            settings.chatgptOAuthAccountId = this.safeStorage.decrypt(settings.chatgptOAuthAccountId as string);
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
        // FIX-PERF-04: structuredClone replaces the JSON.parse(JSON.stringify)
        // roundtrip. Deep-clones the full settings object faster and without
        // the JSON-only-types restriction. Falls back to the legacy roundtrip
        // when structuredClone is unavailable (older Electron) so behaviour
        // stays identical.
        const copy = (typeof structuredClone === 'function'
            ? structuredClone(settings)
            : JSON.parse(JSON.stringify(settings))) as Record<string, unknown>;
        encryptGeminiOAuthCredentialsInPlace(copy as unknown as ObsidianAgentSettings, this.safeStorage);
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
        // AUDIT-034 H-3 / H-4: per-provider credentials in providerConfigs[]
        // and legacy_active_models_backup must be encrypted on the same
        // pass, otherwise the dual-write writes plaintext AWS secret
        // keys + provider api keys into vault-operator-shared/settings.json
        // (CWE-256 / CWE-312). Walker is shared with main.ts so the two
        // paths cannot desync on the credential keys.
        encryptProviderCredentialsInPlace(
            copy as unknown as ObsidianAgentSettings,
            this.safeStorage,
        );
        // AUDIT-2026-07-17 H-1: encrypt the FEAT-04-10/04-11 MCP connector
        // secrets (oauth access/refresh token, client_secret, header-borne
        // tokens like a GitHub PAT) before they reach the sync-prone global
        // file. Without this the dual-write leaked them in plaintext while
        // data.json held ciphertext (CWE-312). Shared walker keeps them in sync.
        encryptMcpOAuthInPlace(
            copy as unknown as ObsidianAgentSettings,
            this.safeStorage,
        );
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
        // AUDIT-034 H-2 / H-4: ChatGPT OAuth tokens (ADR-088) must be
        // encrypted before they touch ~/vault-operator-shared/settings.json.
        // Refresh token is long-lived (~30d), id_token carries email and
        // accountId. The global file sits in a sync-prone directory.
        if (copy.chatgptOAuthAccessToken && !this.safeStorage.isEncrypted(copy.chatgptOAuthAccessToken as string)) {
            copy.chatgptOAuthAccessToken = this.safeStorage.encrypt(copy.chatgptOAuthAccessToken as string);
        }
        if (copy.chatgptOAuthRefreshToken && !this.safeStorage.isEncrypted(copy.chatgptOAuthRefreshToken as string)) {
            copy.chatgptOAuthRefreshToken = this.safeStorage.encrypt(copy.chatgptOAuthRefreshToken as string);
        }
        if (copy.chatgptOAuthIdToken && !this.safeStorage.isEncrypted(copy.chatgptOAuthIdToken as string)) {
            copy.chatgptOAuthIdToken = this.safeStorage.encrypt(copy.chatgptOAuthIdToken as string);
        }
        // AUDIT 2026-07-26 (P3): mirror main.ts, which already encrypts these
        // two in the vault file. An email address and an account id are PII in a
        // directory the user may well be syncing.
        if (copy.chatgptOAuthEmail && !this.safeStorage.isEncrypted(copy.chatgptOAuthEmail as string)) {
            copy.chatgptOAuthEmail = this.safeStorage.encrypt(copy.chatgptOAuthEmail as string);
        }
        if (copy.chatgptOAuthAccountId && !this.safeStorage.isEncrypted(copy.chatgptOAuthAccountId as string)) {
            copy.chatgptOAuthAccountId = this.safeStorage.encrypt(copy.chatgptOAuthAccountId as string);
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

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
