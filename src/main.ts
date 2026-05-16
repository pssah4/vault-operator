/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
import { Plugin, WorkspaceLeaf, Notice, TFile, TFolder } from 'obsidian';
import { preWarmProviderConnection } from './api/warmup';
import { scheduleRecurring } from './util/scheduleRecurring';
import { ObsidianAgentSettings, DEFAULT_SETTINGS, BUILTIN_MCP_SERVERS, getModelKey, modelToLLMProvider } from './types/settings';
import type { CustomModel, ModelTier, ProviderConfig } from './types/settings';
import { resolveActiveProvider, resolveAdvisorModel, resolveTierModel } from './core/routing/tierResolution';
import { migrateActiveModelsToProviders, type MigrationSummary } from './core/settings/migrations/activeModelsToProviders';
import {
    encryptProviderCredentialsInPlace,
    decryptProviderCredentialsInPlace,
} from './core/security/providerCredentialCrypto';
import { ModelDiscoveryService, type RawDiscoveredModel } from './core/routing/ModelDiscoveryService';
import { fetchProviderModels } from './ui/settings/testModelConnection';
import { AgentSidebarView, VIEW_TYPE_AGENT_SIDEBAR } from './ui/AgentSidebarView';
import { AgentSettingsTab, type TabId } from './ui/AgentSettingsTab';
import { ToolRegistry } from './core/tools/ToolRegistry';
import { ToolExecutionPipeline } from './core/tool-execution/ToolExecutionPipeline';
import { IgnoreService } from './core/governance/IgnoreService';
import { OperationLogger } from './core/governance/OperationLogger';
import { GlobalFileService } from './core/storage/GlobalFileService';
import * as safeFs from './core/security/safeFs';
import { getPluginSkillsDir } from './core/utils/agentFolder';
import { GlobalSettingsService } from './core/storage/GlobalSettingsService';
import { GlobalMigrationService } from './core/storage/GlobalMigrationService';
// SyncBridge removed (FEATURE-1508: storage consolidated to vault-parent)
import { RulesLoader } from './core/context/RulesLoader';
import { WorkflowLoader } from './core/context/WorkflowLoader';
import { SkillsManager } from './core/context/SkillsManager';
import { GitCheckpointService } from './core/checkpoints/GitCheckpointService';
import { SemanticIndexService } from './core/semantic/SemanticIndexService';
import { EmbeddingService } from './core/memory/EmbeddingService';
import { VaultOperatorEmbeddingProvider } from './core/memory/VaultOperatorEmbeddingProvider';
import { KnowledgeDB, WriterLockHeldError } from './core/knowledge/KnowledgeDB';
import { VectorStore } from './core/knowledge/VectorStore';
import { GraphStore } from './core/knowledge/GraphStore';
import { VaultRenameHandler } from './core/knowledge/VaultRenameHandler';
import { SnapshotJob, type SnapshotTarget } from './core/persistence/SnapshotJob';
import { OntologyStore } from './core/knowledge/OntologyStore';
import { CommunityDetectionService } from './core/knowledge/CommunityDetectionService';
import { VaultHealthService } from './core/knowledge/VaultHealthService';
// BA-25 Karpathy-Wiki-Pattern (PLAN-10..14)
import { NoteSummaryStore } from './core/knowledge/NoteSummaryStore';
import { FrontmatterPropertyStore } from './core/knowledge/FrontmatterPropertyStore';
import { ClusterMetadataStore } from './core/knowledge/ClusterMetadataStore';
import { ClusterSourceStatsStore } from './core/knowledge/ClusterSourceStatsStore';
import { IngestSessionStore } from './core/ingest/IngestSessionStore';
import { IngestTriageLogStore } from './core/ingest/IngestTriageLogStore';
import { FrontmatterIndexer } from './core/ingest/FrontmatterIndexer';
import { sanitizeVaultContentForLLM } from './core/memory/sanitizeVaultContentForLLM';
import { AutoTriggerObserver } from './core/ingest/AutoTriggerObserver';
import { TopHubBlockGenerator, type TopHubBlockState } from './core/memory/TopHubBlockGenerator';
import { Stufe3PeriodicJob, ClusterMetadataStatePersistence } from './core/health/Stufe3PeriodicJob';
import { Stufe2ActivityTrigger } from './core/health/Stufe2ActivityTrigger';
import { FrontmatterBackfillJob } from './core/ingest/FrontmatterBackfillJob';
import { buildSummaryGenerator } from './core/ingest/SummaryGenerator';
import { DEFAULT_VAULT_INGEST_SETTINGS } from './types/settings';
import { GraphExtractor } from './core/knowledge/GraphExtractor';
import { ImplicitConnectionService } from './core/knowledge/ImplicitConnectionService';
import { MemoryDB } from './core/knowledge/MemoryDB';
import { RerankerService } from './core/knowledge/RerankerService';
import { ChatHistoryService } from './core/ChatHistoryService';
import { ConversationStore } from './core/history/ConversationStore';
import { MemoryService } from './core/memory/MemoryService';
import { ExtractionQueue } from './core/memory/ExtractionQueue';
import { SingleCallProcessor } from './core/memory/SingleCallProcessor';
import { MemoryV2Telemetry } from './core/memory/MemoryV2Telemetry';
import { DriftEventBus } from './core/memory/DriftEventBus';
import { TokenBudgetGuard } from './core/memory/TokenBudgetGuard';
import { generateSoakReport } from './core/memory/SoakReport';
import { McpClient } from './core/mcp/McpClient';
import { VaultDNAScanner } from './core/skills/VaultDNAScanner';
import { SkillRegistry } from './core/skills/SkillRegistry';
import { CapabilityGapResolver } from './core/skills/CapabilityGapResolver';
import { buildApiHandler, buildApiHandlerForModel } from './api/index';
import type { ApiHandler } from './api/types';
import type { ToolUse, ToolCallbacks } from './core/tools/types';
import { BUILT_IN_MODES } from './core/modes/builtinModes';
import { mergeDefaultPrompts } from './core/prompts/defaultPrompts';
import { t } from './i18n';
import { SafeStorageService } from './core/security/SafeStorageService';
import { GitHubCopilotAuthService } from './core/security/GitHubCopilotAuthService';
import { ChatGptOAuthService } from './core/auth/ChatGptOAuthService';
import { KiloAuthService } from './core/security/KiloAuthService';
import { setGlobalModeStoreFs } from './core/modes/GlobalModeStore';
import { RecipeStore } from './core/mastery/RecipeStore';
import { RecipeMatchingService } from './core/mastery/RecipeMatchingService';
import { EpisodicExtractor } from './core/mastery/EpisodicExtractor';
import { RecipePromotionService } from './core/mastery/RecipePromotionService';
import { ConsoleRingBuffer } from './core/observability/ConsoleRingBuffer';
import { SelfAuthoredSkillLoader } from './core/skills/SelfAuthoredSkillLoader';
import { migrateLegacySkillsIfNeeded } from './core/skills/SkillMigration';
import type { ISandboxExecutor } from './core/sandbox/ISandboxExecutor';
import { createSandboxExecutor } from './core/sandbox/createSandboxExecutor';
import { EsbuildWasmManager } from './core/sandbox/EsbuildWasmManager';
import { DynamicToolLoader } from './core/tools/dynamic/DynamicToolLoader';
import { EmbeddedSourceManager } from './core/self-development/EmbeddedSourceManager';
import { PluginBuilder } from './core/self-development/PluginBuilder';
import { PluginReloader } from './core/self-development/PluginReloader';

/**
 * Obsidian Agent Plugin
 *
 * An agentic operating layer for Obsidian that provides:
 * - Approval-based vault operations
 * - Local checkpoints with restore capability
 * - MCP (Model Context Protocol) support
 * - Semantic search and indexing
 * - Multiple agent modes
 *
 * Architecture:
 * - Tool Execution Pipeline: Central governance for all operations
 * - Shadow Checkpoint System: isomorphic-git based version control
 * - MCP Integration: External tool extensibility
 * - Semantic Index: Local vector search
 */

/** Extract HTTP(S) URLs from a free-form text. Used by Stufe-3 web-pass to count distinct sources. */
function extractUrlsFromText(text: string): string[] {
    const matches = text.match(/https?:\/\/[^\s)\]<>"']+/g) ?? [];
    return Array.from(new Set(matches));
}

export default class ObsidianAgentPlugin extends Plugin {
    settings: ObsidianAgentSettings;
    toolRegistry: ToolRegistry;
    apiHandler: ApiHandler | null = null;
    /**
     * EPIC-26 / FEAT-26-04: when a one-shot migration ran during onload
     * its summary lives here until the sidebar consumes it for the
     * notification modal. Cleared after first display.
     */
    pendingMigrationSummary: MigrationSummary | null = null;
    /**
     * EPIC-26 / FEAT-26-02: discovery service for provider model lists.
     * Wired in onload after settings load. ProvidersTab consumes it.
     */
    modelDiscovery: ModelDiscoveryService | null = null;
    ignoreService: IgnoreService;
    operationLogger: OperationLogger;
    checkpointService: GitCheckpointService;
    rulesLoader: RulesLoader;
    workflowLoader: WorkflowLoader;
    skillsManager: SkillsManager;
    semanticIndex: SemanticIndexService | null = null;
    embeddingService: EmbeddingService | null = null;
    knowledgeDB: KnowledgeDB | null = null;
    vectorStore: VectorStore | null = null;
    graphStore: GraphStore | null = null;
    vaultRenameHandler: VaultRenameHandler | null = null;
    snapshotJob: SnapshotJob | null = null;
    snapshotTargets: SnapshotTarget[] = [];
    graphExtractor: GraphExtractor | null = null;
    implicitConnectionService: ImplicitConnectionService | null = null;
    ontologyStore: OntologyStore | null = null;
    communityDetectionService: CommunityDetectionService | null = null;
    vaultHealthService: VaultHealthService | null = null;
    memoryDB: MemoryDB | null = null;
    // BA-25 Karpathy-Wiki-Pattern stores and services
    noteSummaryStore: NoteSummaryStore | null = null;
    frontmatterPropertyStore: FrontmatterPropertyStore | null = null;
    clusterMetadataStore: ClusterMetadataStore | null = null;
    clusterSourceStatsStore: ClusterSourceStatsStore | null = null;
    ingestSessionStore: IngestSessionStore | null = null;
    ingestTriageLogStore: IngestTriageLogStore | null = null;
    /** FEAT-03-25 / ADR-109: Vault-zu-Memory-Bruecke-Tabellenzugriff. */
    memorySourceStore: import('./core/knowledge/MemorySourceStore').MemorySourceStore | null = null;
    frontmatterIndexer: FrontmatterIndexer | null = null;
    autoTriggerObserver: AutoTriggerObserver | null = null;
    topHubBlockGenerator: TopHubBlockGenerator | null = null;
    stufe3PeriodicJob: Stufe3PeriodicJob | null = null;
    private stufe3IntervalHandle: import('./util/scheduleRecurring').RecurringHandle | null = null;
    /** FEAT-19-19: Stufe-2 Activity-Trigger fuer Light-Web-Search-Update-Hints. */
    stufe2ActivityTrigger: Stufe2ActivityTrigger | null = null;
    /** FEAT-03-26: cached state for cooldown-decision and ContextComposer-Hook. */
    topHubBlockState: TopHubBlockState | null = null;
    topHubBlockMarkdown: string = '';
    /** FEAT-19-09 wiring: indexer-event listener cleanup callbacks. */
    private frontmatterIndexerListeners: Array<() => void> = [];
    historyDB: import('./core/knowledge/HistoryDB').HistoryDB | null = null;
    historyIndexer: import('./core/memory/HistoryIndexer').HistoryIndexer | null = null;
    rerankerService: RerankerService | null = null;
    bundleLoader: import('./core/assets/BundleLoader').BundleLoader | null = null;
    mcpBridge: { start(): Promise<void>; stop(): void; running: boolean; tunnelUrl: string | null; remoteConnected: boolean; remoteConnecting: boolean; startTunnel(onUrl?: (url: string | null) => void): void; stopTunnel(): void; connectRelay(): void; disconnectRelay(): void; getToolsWithContext(): unknown[]; buildResourceList(): unknown[] } | null = null;
    private autoIndexDebounceTimers = new Map<string, number>();
    /** FEAT-03-26 Lifecycle: Debounce-Timer fuer Top-Hub-Block Regen bei Ontology-Changes. */
    private topHubBlockRegenTimer: number | null = null;
    private warmupFired = false;
    /** Session flags for cross-tool coordination (e.g. plan_presentation → create_pptx gate). */
    sessionFlags = new Set<string>();
    private cloudProviderWarningShown = false;
    chatHistoryService: ChatHistoryService | null = null;
    conversationStore: ConversationStore | null = null;
    memoryService: MemoryService | null = null;
    extractionQueue: ExtractionQueue | null = null;
    memoryV2Telemetry: MemoryV2Telemetry | null = null;
    /** IMP-03-18-01: Daily-Scheduler-Tick fuer AgingService. */
    private agingSchedulerHandle: import('./util/scheduleRecurring').RecurringHandle | null = null;
    /** FIX-23-01-01: Living-Document state for Cross-Surface MCP. */
    activeMcpSessions: import('./core/memory/ActiveMcpSessions').ActiveMcpSessions | null = null;
    private activeMcpSessionsEvictHandle: import('./util/scheduleRecurring').RecurringHandle | null = null;
    /** AUDIT-015 M-1: Sliding-window MCP Rate-Limiter. */
    mcpRateLimiter: import('./mcp/McpRateLimiter').McpRateLimiter | null = null;
    private mcpRateLimiterCleanupHandle: import('./util/scheduleRecurring').RecurringHandle | null = null;
    driftBus: DriftEventBus | null = null;
    tokenBudget: TokenBudgetGuard | null = null;
    mcpClient: McpClient;
    vaultDNAScanner: VaultDNAScanner | null = null;
    skillRegistry: SkillRegistry | null = null;
    capabilityGapResolver: CapabilityGapResolver | null = null;
    settingsTab: AgentSettingsTab | null = null;
    recipeStore: RecipeStore | null = null;
    recipeMatchingService: RecipeMatchingService | null = null;
    episodicExtractor: EpisodicExtractor | null = null;
    recipePromotionService: RecipePromotionService | null = null;
    safeStorage: SafeStorageService;
    globalFs: GlobalFileService;
    globalSettingsService: GlobalSettingsService | null = null;
    // syncBridge removed (FEATURE-1508)
    ringBuffer: ConsoleRingBuffer;
    selfAuthoredSkillLoader: SelfAuthoredSkillLoader | null = null;
    sandboxExecutor: ISandboxExecutor | null = null;
    esbuildWasmManager: EsbuildWasmManager | null = null;
    dynamicToolLoader: DynamicToolLoader | null = null;
    embeddedSourceManager: EmbeddedSourceManager | null = null;
    pluginBuilder: PluginBuilder | null = null;
    pluginReloader: PluginReloader | null = null;

    // ── Chat-Linking: deferred frontmatter stamping (ADR-022) ────────────
    /** Paths written by the agent, grouped by conversationId. Flushed on conversation end. */
    pendingChatLinks = new Map<string, Set<string>>();

    /** Track a written .md path for deferred chat-link stamping. */
    trackChatLinkPath(conversationId: string, path: string): void {
        if (!path.endsWith('.md')) return;
        let paths = this.pendingChatLinks.get(conversationId);
        if (!paths) {
            paths = new Set();
            this.pendingChatLinks.set(conversationId, paths);
        }
        paths.add(path);
    }

    /**
     * Stamp chat-links into frontmatter for all pending paths of a conversation.
     * Idempotent: can be called multiple times (e.g. after fallback title, then again after semantic title).
     * Does NOT clear pending paths — call clearPendingChatLinks() for that.
     */
    async flushPendingChatLinks(conversationId: string): Promise<void> {
        const paths = this.pendingChatLinks.get(conversationId);
        if (!paths || paths.size === 0 || !this.settings.chatLinking?.enabled) return;

        const store = this.conversationStore;
        const meta = store?.list().find((m: { id: string }) => m.id === conversationId);
        const title = meta?.title || 'Chat';
        const uri = `obsidian://vault-operator-chat?id=${encodeURIComponent(conversationId)}`;
        const link = `[${title}](${uri})`;

        for (const p of paths) {
            const file = this.app.vault.getAbstractFileByPath(p);
            if (!(file instanceof TFile) || file.extension !== 'md') continue;
            try {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    const links: string[] = fm['chats'] ?? [];
                    const idx = links.findIndex((l: string) => l.includes(conversationId));
                    if (idx >= 0) {
                        links[idx] = link;
                    } else {
                        links.push(link);
                    }
                    fm['chats'] = links;
                });
            } catch (e) {
                // FIX-11: YAML parse errors happen when agent writes frontmatter values
                // with unquoted special chars (colons, brackets). Log concisely and skip.
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('YAML') || msg.includes('mapping')) {
                    console.warn(`[ChatLink] Skipping ${p} — invalid frontmatter (YAML parse error)`);
                } else {
                    console.warn(`[ChatLink] Failed to stamp ${p}:`, e);
                }
            }
        }
    }

    /** Remove pending chat-link paths for a conversation (called on conversation clear/switch). */
    clearPendingChatLinks(conversationId: string): void {
        this.pendingChatLinks.delete(conversationId);
    }

    /**
     * Plugin initialization
     *
     * Lifecycle:
     * 1. Load settings
     * 2. Initialize core services
     * 3. Register UI views
     * 4. Register commands
     * 5. Initialize MCP connections
     * 6. Start semantic indexing
     */
    /**
     * Resolves when doLoad() has populated settings + ModeService. The view's
     * onOpen awaits this before reading any plugin state so it cannot race
     * with layout-restore (BUG-026, 2026-04-19).
     */
    readyPromise!: Promise<void>;

    onload(): void {
        // BUG-026 (2026-04-19): create the readiness promise BEFORE registerView.
        // Obsidian instantiates the view the moment registerView runs (to restore
        // saved layout), which in a BRAT hot reload is before doLoad() has loaded
        // settings or the mode service. Reading plugin.settings.currentMode at
        // that point threw and left the sidebar broken. The view awaits this
        // promise in its onOpen.
        let markReady: () => void = () => {};
        this.readyPromise = new Promise<void>((resolve) => { markReady = resolve; });

        // Register view SYNCHRONOUSLY so Obsidian can restore saved layout
        // immediately — before any async initialization runs.
        // ModeService uses lazy toolRegistry access, so the view is safe
        // to construct even before doLoad() finishes; the view waits on
        // readyPromise before reading any plugin state.
        this.registerView(
            VIEW_TYPE_AGENT_SIDEBAR,
            (leaf) => new AgentSidebarView(leaf, this)
        );

        void this.doLoad()
            .catch((err) => {
                console.error('[Boot] doLoad threw before completion:', err);
            })
            .finally(() => markReady());
    }

    private async doLoad(): Promise<void> {
        // 0. ConsoleRingBuffer — install FIRST so all subsequent logs are captured
        this.ringBuffer = new ConsoleRingBuffer(500);
        this.ringBuffer.install();

        console.debug('Loading Vault Operator plugin');

        // 0-pre-pre. safeFs allowlist. Every fs operation in the plugin goes
        // through src/core/security/safeFs.ts; this initialise call defines
        // the five categories of paths the plugin is allowed to touch. See
        // REVIEWER_NOTES.md for the threat model and FEAT-28-01 for the spec.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- one-time path/os import for safeFs allowlist construction; the rest of the plugin uses safeFs and not direct fs
        const nodePath = require('path') as typeof import('path');
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- one-time os import for safeFs allowlist construction
        const nodeOs = require('os') as typeof import('os');
        const safeFsVaultRoot = (this.app.vault.adapter as unknown as { getBasePath?(): string }).getBasePath?.() ?? '';
        const homeDir = nodeOs.homedir();
        const appData = process.env.APPDATA ?? '';
        const desktopConfigDirs = [
            nodePath.join(homeDir, '.config', 'Claude'),
            nodePath.join(homeDir, 'Library', 'Application Support', 'Claude'),
            appData ? nodePath.join(appData, 'Claude') : '',
            nodePath.join(homeDir, '.obsidian-agent'),
            nodePath.join(homeDir, 'vault-operator-shared'),
        ].filter((p): p is string => p.length > 0);
        // Fallback: when vaultBasePath is unavailable (mobile, headless,
        // FileSystemAdapter missing) the plugin still needs SOME root the
        // wrapper can validate against. Use the home dir as a coarse fallback;
        // the plugin is desktop-only so this path is rare.
        const effectiveVaultRoot = safeFsVaultRoot || homeDir;
        const vaultParent = safeFsVaultRoot ? nodePath.dirname(safeFsVaultRoot) : homeDir;
        safeFs.initialize({
            vaultRoot: effectiveVaultRoot,
            pluginDataDir: nodePath.join(effectiveVaultRoot, this.app.vault.configDir, 'plugins', this.manifest.id),
            agentConfigDir: nodePath.join(effectiveVaultRoot, '.obsilo-vault'),
            systemTempDir: nodeOs.tmpdir(),
            desktopConfigDirs,
            extraRoots: [
                // Cross-vault shared dir lives at {vault-parent}/<name>/ (FEATURE-1508).
                // Fresh installs use `vault-operator-shared`; legacy names are
                // detected at runtime by GlobalFileService and kept in place.
                nodePath.join(vaultParent, 'vault-operator-shared'),
                nodePath.join(vaultParent, 'obsilo-shared'),
                nodePath.join(vaultParent, '.obsidian-agent'),
            ],
        });

        // 0-pre. Rebrand migration: the plugin id changed from `obsilo-agent` to
        // `vault-operator` (the Obsidian community-plugin review bot rejects any
        // name that starts with "Obsi"). Obsidian loads the plugin from the new
        // `<configDir>/plugins/vault-operator/` folder, which has no data.json on
        // the first launch after the rename, so all settings/credentials would
        // reset. Copy the legacy data.json over once, before anything reads it.
        // The agent-data folder (`.obsilo-vault`, vault-parent `obsilo-shared`)
        // keeps its name — it is internal plumbing the user never sees and a
        // folder move carries real risk for no visible benefit.
        try {
            const cfg = this.app.vault.configDir;
            const adapter = this.app.vault.adapter;
            const newDataPath = `${this.manifest.dir ?? `${cfg}/plugins/${this.manifest.id}`}/data.json`;
            const legacyDataPath = `${cfg}/plugins/vault-operator/data.json`;
            if (!(await adapter.exists(newDataPath)) && (await adapter.exists(legacyDataPath))) {
                await adapter.write(newDataPath, await adapter.read(legacyDataPath));
                console.debug(`[Plugin] Rebrand migration: copied data.json from legacy plugin folder obsilo-agent -> ${this.manifest.id}`);
            }
        } catch (e) {
            console.warn('[Plugin] Rebrand data.json migration failed (non-fatal):', e);
        }

        // 0a. Initialize SafeStorageService (must happen before loadSettings)
        this.safeStorage = new SafeStorageService();

        // 0a-bis. BundleLoader for office / pdfjs Optional Assets. Has no
        // side effects on construction; first .load*Bundle() call goes to
        // OptionalAssetManager. Tools that need exceljs/docx/pptxgenjs/
        // pdfjs-dist read through this loader.
        const { BundleLoader } = await import('./core/assets/BundleLoader');
        this.bundleLoader = new BundleLoader(this);

        // 0b. Pre-init folder rename: legacy `.obsidian-agent` -> `obsilo-vault`
        //     (vault-local) and `.obsidian-agent` -> `obsilo-shared` (vault-parent).
        //     Must run BEFORE GlobalFileService points at the new global path,
        //     otherwise the service would create a fresh empty folder beside
        //     the unrenamed legacy data.
        const vaultBasePath = (this.app.vault.adapter as unknown as { getBasePath?(): string }).getBasePath?.() ?? '';
        try {
            const rawSaved = await this.loadData() as Record<string, unknown> | null;
            const savedFolderPath = typeof rawSaved?.agentFolderPath === 'string'
                ? rawSaved.agentFolderPath
                : undefined;
            const { migrateFolderRename } = await import('./core/utils/migrateFolderRename');
            const renameReport = await migrateFolderRename(this.app, vaultBasePath, savedFolderPath);
            if (renameReport.vaultLocalRenamed || renameReport.globalRenamed) {
                console.debug('[Plugin] Folder rename migrated:', renameReport);
            }
        } catch (e) {
            console.warn('[Plugin] Folder rename migration failed (non-fatal):', e);
        }

        // 0c. Global file service — shared storage at {vault-parent}/obsilo-shared/ (FEATURE-1508 + folder rename)
        this.globalFs = new GlobalFileService(vaultBasePath);
        this.globalSettingsService = new GlobalSettingsService(this.globalFs, this.safeStorage);
        // Share the GlobalFileService with GlobalModeStore (consolidates all global I/O)
        setGlobalModeStoreFs(this.globalFs);

        // 1. Load settings (merges global + vault-local)
        await this.loadSettings();

        // 1a. Settings consolidation after the folder rename: rewrite any
        //     known legacy default to the current default so VaultTab and
        //     consumers using getAgentFolderPath() pick it up. Custom paths
        //     are untouched.
        if (this.settings.agentFolderPath === '.obsidian-agent'
            || this.settings.agentFolderPath === 'obsilo-vault') {
            this.settings.agentFolderPath = '.obsilo-vault';
            await this.saveSettings();
        }

        // 1b. EPIC-26 / FEAT-26-04 / ADR-123 -- one-shot migration from
        //     legacy activeModels[] to providerConfigs[]. Idempotent (no-op
        //     when schemaVersion is already set or providerConfigs is non-empty).
        //     Anomalies are stashed for the MigrationNotificationModal which
        //     the sidebar opens on first display.
        try {
            const migration = migrateActiveModelsToProviders(this.settings);
            if (migration.didMigrate) {
                this.settings.providerConfigs = migration.providerConfigs;
                this.settings.activeProviderId = migration.activeProviderId;
                this.settings.legacy_active_models_backup = migration.legacyBackup;
                this.settings.schemaVersion = migration.schemaVersion;
                // EPIC-26 follow-up: after a successful migration, clear the
                // legacy `activeModels[]` and the per-mode model key map. The
                // new path reads from `providerConfigs[]` exclusively; leaving
                // the old arrays populated created duplicate state that the
                // user could not delete (delete a provider in the new tab,
                // legacy entry stayed, OAuth tokens stayed). Backup in
                // `legacy_active_models_backup` is the 30-day safety net.
                this.settings.activeModels = [];
                this.settings.activeModelKey = '';
                this.settings.modeModelKeys = {};
                // `helperModelKey` is now derived from the active provider's
                // fast tier (Stage 2 in getHelperModel). The legacy explicit
                // key would mask that fallback indefinitely.
                this.settings.helperModelKey = '';
                await this.saveSettings();
                this.pendingMigrationSummary = migration.summary;
                console.debug(
                    `[Plugin] EPIC-26 migration: ${migration.summary.providersCreated} providers, `
                    + `${migration.summary.modelsClassified} models, `
                    + `${migration.summary.anomalies.length} anomalies; `
                    + 'legacy activeModels + activeModelKey + modeModelKeys + helperModelKey cleared',
                );
            }
        } catch (e) {
            // Non-fatal: keep legacy setup functional, log the failure.
            console.warn('[Plugin] EPIC-26 migration failed (non-fatal):', e);
        }

        // 1b-fixup. EPIC-26 follow-up: early-migration users got the lowercase
        // provider type as displayName (e.g. "openrouter", "github-copilot").
        // Replace with the human-readable brand label when the displayName
        // matches the type string. Idempotent.
        {
            const { getProviderBrandLabel } = await import('./types/settings');
            let changed = false;
            for (const p of this.settings.providerConfigs ?? []) {
                if (!p.displayName || p.displayName === p.type) {
                    p.displayName = getProviderBrandLabel(p.type);
                    changed = true;
                }
            }
            if (changed) await this.saveSettings();
        }

        // 1b-orphan-purge. EPIC-26 follow-up #2: users who migrated under
        // earlier code and then removed an OAuth/gateway provider in the
        // new tab had no purge step, so their plugin-level OAuth tokens
        // lingered with no matching ProviderConfig. The next "Add
        // provider" flow then reported "Signed in" against the
        // orphan token. Idempotent: clears tokens whose provider type
        // is no longer represented in providerConfigs[]. Also clears
        // any leftover activeModels[] / activeModelKey / modeModelKeys
        // / helperModelKey if providerConfigs[] is already populated,
        // covering the case where migration ran under earlier code
        // that did not clear them.
        {
            const { purgeProviderLegacyState } = await import(
                './core/security/providerLegacyPurge'
            );
            const types: Array<'github-copilot' | 'chatgpt-oauth' | 'kilo-gateway'> = [
                'github-copilot', 'chatgpt-oauth', 'kilo-gateway',
            ];
            const before = JSON.stringify({
                gh: this.settings.githubCopilotAccessToken ?? '',
                cgpt: this.settings.chatgptOAuthAccessToken ?? '',
                kilo: this.settings.kiloToken ?? '',
                am: this.settings.activeModels?.length ?? 0,
            });
            for (const t of types) {
                purgeProviderLegacyState(this.settings, t);
            }
            if ((this.settings.providerConfigs ?? []).length > 0) {
                if ((this.settings.activeModels?.length ?? 0) > 0) {
                    this.settings.activeModels = [];
                }
                if (this.settings.activeModelKey) {
                    this.settings.activeModelKey = '';
                }
                if (Object.keys(this.settings.modeModelKeys ?? {}).length > 0) {
                    this.settings.modeModelKeys = {};
                }
                if (this.settings.helperModelKey) {
                    this.settings.helperModelKey = '';
                }
            }
            const after = JSON.stringify({
                gh: this.settings.githubCopilotAccessToken ?? '',
                cgpt: this.settings.chatgptOAuthAccessToken ?? '',
                kilo: this.settings.kiloToken ?? '',
                am: this.settings.activeModels?.length ?? 0,
            });
            if (before !== after) {
                await this.saveSettings();
                console.debug('[Plugin] EPIC-26 orphan-purge: cleared stale legacy state');
            }
        }

        // 1b-openai-cleanup. EPIC-26 follow-up: early refreshes of OpenAI
        //     captured non-chat-completion modalities (realtime, tts, audio,
        //     image, search-preview, deep-research, *-pro, *-codex) because
        //     fetchProviderModels filtered them only by prefix. The tier
        //     classifier then mapped flagship to gpt-5.5-pro-* (Responses-API
        //     only) and Test Connection 404'd. Strip the polluted entries
        //     from discoveredModels, drop any tierMapping/tierOverrides slot
        //     that referenced one, and zero lastRefreshAt so the background
        //     refresh re-discovers the cleaned list. Idempotent: a clean
        //     state produces no changes.
        {
            const { isOpenAIChatCompletionModel } = await import(
                './ui/settings/testModelConnection'
            );
            let changed = false;
            for (const p of this.settings.providerConfigs ?? []) {
                if (p.type !== 'openai') continue;
                const before = p.discoveredModels?.length ?? 0;
                const cleaned = (p.discoveredModels ?? []).filter(
                    (m) => isOpenAIChatCompletionModel(m.id),
                );
                if (cleaned.length !== before) {
                    p.discoveredModels = cleaned;
                    p.lastRefreshAt = 0;
                    changed = true;
                }
                const validIds = new Set(cleaned.map((m) => m.id));
                for (const tier of ['flagship', 'mid', 'fast'] as const) {
                    const mapId = p.tierMapping?.[tier];
                    if (mapId && !validIds.has(mapId)) {
                        delete p.tierMapping?.[tier];
                        changed = true;
                    }
                    const ovrId = p.tierOverrides?.[tier];
                    if (ovrId && !isOpenAIChatCompletionModel(ovrId)) {
                        delete p.tierOverrides?.[tier];
                        changed = true;
                    }
                }
            }
            if (changed) {
                await this.saveSettings();
                console.debug(
                    '[Plugin] EPIC-26 openai cleanup: stripped non-chat modalities '
                    + 'and stale tier slots; refreshOnStartup will re-discover',
                );
            }
        }

        // 1c. EPIC-26 / FEAT-26-02 -- ModelDiscoveryService for the new
        //     provider-only settings. Wraps fetchProviderModels with the
        //     classifier + 24h cache.
        this.modelDiscovery = new ModelDiscoveryService(
            {
                getProviderConfigs: () => this.settings.providerConfigs ?? [],
                saveProviderConfigs: async (next) => {
                    this.settings.providerConfigs = next;
                    await this.saveSettings();
                },
            },
            async (provider) => {
                // Build the bedrock-credentials object only for bedrock.
                const bedrockCreds = provider.type === 'bedrock' ? {
                    authMode: provider.awsAuthMode,
                    apiKey: provider.awsApiKey,
                    accessKey: provider.awsAccessKey,
                    secretKey: provider.awsSecretKey,
                    sessionToken: provider.awsSessionToken,
                    region: provider.awsRegion,
                } : undefined;
                const raw = await fetchProviderModels(
                    provider.type,
                    provider.apiKey ?? '',
                    provider.baseUrl,
                    provider.apiVersion,
                    bedrockCreds,
                );
                return raw.map((r): RawDiscoveredModel => ({
                    id: r.id,
                    displayName: r.label,
                }));
            },
        );
        // Refresh stale provider lists in the background -- non-blocking.
        if ((this.settings.providerConfigs ?? []).length > 0) {
            void this.modelDiscovery.refreshOnStartup().catch((e) =>
                console.warn('[Plugin] EPIC-26 startup discovery failed:', e),
            );
        }

        // 2. Initialize core services
        const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;

        // FEATURE-1508: One-time migration from ~/.obsidian-agent/ to {vault-parent}/.obsidian-agent/
        if (!this.settings._parentDirMigrated) {
            await this.migrateToParentDir(vaultBasePath).catch((e) =>
                console.warn('[Plugin] Storage migration failed (non-fatal):', e)
            );
            this.settings._parentDirMigrated = true;
            await this.saveData({ ...this.settings, _parentDirMigrated: true });
        }

        // Legacy in-vault folder cleanup. Pre-FEATURE-1508 the plugin
        // experimented with .obsilo / .obsilo-sync / .obsidian/.obsilo
        // names. cleanupLegacyVaultDirs() handled them but only ran via
        // the migrateToParentDir branch when ~/.obsidian-agent had already
        // disappeared. For users where the legacy ~/.obsidian-agent still
        // exists alongside, that branch never fired. Run it directly,
        // gated by an idempotent flag.
        if (!this.settings._legacyVaultDirsCleaned) {
            await this.cleanupLegacyVaultDirs().catch((e) =>
                console.warn('[Plugin] Legacy vault dir cleanup failed (non-fatal):', e)
            );
            this.settings._legacyVaultDirsCleaned = true;
            await this.saveSettings();
        }

        // Governance: ignore/protected path rules
        this.ignoreService = new IgnoreService(this.app.vault);
        await this.ignoreService.load();

        // Rules loader (Sprint 3.2) — now uses global storage
        this.rulesLoader = new RulesLoader(this.globalFs);
        await this.rulesLoader.initialize();

        // Workflow loader (Sprint 3.3) — now uses global storage
        this.workflowLoader = new WorkflowLoader(this.globalFs);
        await this.workflowLoader.initialize();

        // Skills manager (Sprint 3.4) — now uses global storage
        this.skillsManager = new SkillsManager(this.globalFs);
        await this.skillsManager.initialize();

        // VaultDNA: auto-discover plugins as skills (PAS-1)
        // Create scanner/registry immediately so references exist,
        // but defer the actual scan to onLayoutReady so all community
        // plugins have registered their commands in app.commands.
        if (this.settings.vaultDNA.enabled) {
            this.vaultDNAScanner = new VaultDNAScanner(this.app, this.app.vault, this);
            this.skillRegistry = new SkillRegistry(
                this.vaultDNAScanner,
                this.settings.vaultDNA.skillToggles,
                getPluginSkillsDir(this),
            );
            this.capabilityGapResolver = new CapabilityGapResolver(
                this.vaultDNAScanner,
            );
            this.app.workspace.onLayoutReady(async () => {
                await this.vaultDNAScanner!.initialize().catch((e) =>
                    console.warn('[Plugin] VaultDNA scanner init failed (non-fatal):', e)
                );
            });
        }

        // Governance: persistent operation log + checkpoints
        this.operationLogger = new OperationLogger(this.globalFs);
        await this.operationLogger.initialize();

        // Checkpoints (isomorphic-git shadow repo)
        this.checkpointService = new GitCheckpointService(
            this.app,
            this.app.vault,
            pluginDir,
            this.settings.checkpointTimeoutSeconds,
            this.settings.checkpointAutoCleanup,
        );
        if (this.settings.enableCheckpoints) {
            await this.checkpointService.initialize().catch((e) =>
                console.warn('[Plugin] Checkpoint service init failed (non-fatal):', e)
            );
        }

        // MCP Client — connect to all configured servers
        this.mcpClient = new McpClient();
        if (Object.keys(this.settings.mcpServers ?? {}).length > 0) {
            this.mcpClient.connectAll(this.settings.mcpServers).catch((e) =>
                console.warn('[Plugin] MCP connect failed (non-fatal):', e)
            );
        }

        // Sandbox + Dynamic Modules (Phase 3) — lazy initialization (ADR-021: OS-level isolation)
        this.sandboxExecutor = createSandboxExecutor(this, this.settings.sandboxMode);
        this.esbuildWasmManager = new EsbuildWasmManager(this);
        this.dynamicToolLoader = new DynamicToolLoader(this);

        // Self-Authored Skills (Phase 2+3: unified skills with optional code modules)
        this.selfAuthoredSkillLoader = new SelfAuthoredSkillLoader(
            this, this.esbuildWasmManager, this.sandboxExecutor,
        );

        // Core Self-Modification (Phase 4) -- source bundle is an
        // optional download (Phase 2.2). load() is fire-and-forget:
        // first manage_source call awaits it via ensureLoaded.
        this.embeddedSourceManager = new EmbeddedSourceManager(this);
        void this.embeddedSourceManager.load().catch((e) =>
            console.debug('[Plugin] Source bundle load deferred:', e),
        );
        this.pluginBuilder = new PluginBuilder(this.esbuildWasmManager, this.embeddedSourceManager);
        this.pluginReloader = new PluginReloader(this);

        // Tool registry (ToolExecutionPipeline created per-task)
        this.toolRegistry = new ToolRegistry(
            this, this.mcpClient, this.ringBuffer, this.selfAuthoredSkillLoader,
            this.sandboxExecutor, this.esbuildWasmManager, this.dynamicToolLoader,
            this.embeddedSourceManager, this.pluginBuilder, this.pluginReloader,
        );

        // Late-bind ToolRegistry to SelfAuthoredSkillLoader (circular dependency)
        this.selfAuthoredSkillLoader.setDependencies(
            this.esbuildWasmManager, this.sandboxExecutor, this.toolRegistry,
        );

        // FEATURE-2201: one-time migration from legacy `.obsilo-sync/skills/` to
        // the configurable agent-folder (ADR-072). Idempotent via `.migrated` marker.
        await migrateLegacySkillsIfNeeded(this).then((report) => {
            if (report && (report.migratedSlugs.length > 0 || report.errors.length > 0)) {
                console.debug('[Plugin] Skill migration:', report);
            }
        }).catch((e) =>
            console.warn('[Plugin] Skill migration failed (non-fatal):', e)
        );

        // Load skills (includes cached code module tools)
        await this.selfAuthoredSkillLoader.loadAll().catch((e) =>
            console.warn('[Plugin] SelfAuthoredSkillLoader init failed (non-fatal):', e)
        );
        this.selfAuthoredSkillLoader.setupWatcher();

        // Migrate legacy dynamic tools to unified skills
        if (this.dynamicToolLoader && this.selfAuthoredSkillLoader) {
            const migrated = await this.dynamicToolLoader.migrateToSkills(this.selfAuthoredSkillLoader).catch((e) => {
                console.warn('[Plugin] Dynamic tool migration failed (non-fatal):', e);
                return 0;
            });
            if (migrated > 0) {
                // Reload skills to pick up migrated tools
                await this.selfAuthoredSkillLoader.loadAll().catch((e) =>
                    console.warn('[Plugin] SelfAuthoredSkillLoader reload after migration failed (non-fatal):', e)
                );
            }
        }

        // Semantic index (Phase C2) — SQLite-backed via KnowledgeDB (ADR-050)
        if (this.settings.enableSemanticIndex) {
            // FEATURE-0507: pass the configurable agent folder so knowledge.db
            // lands under {agentFolderPath}/knowledge.db instead of the
            // hardcoded ".obsidian-agent/knowledge.db".
            const { getAgentFolderPath } = await import('./core/utils/agentFolder');
            this.knowledgeDB = new KnowledgeDB(
                this.app.vault,
                pluginDir,
                'local', // FEATURE-1508: knowledge.db is vault-local (syncs with vault)
                'knowledge.db',
                undefined, // globalRoot — not used in local mode
                getAgentFolderPath(this),
            );
            await this.knowledgeDB.open().catch((e) => {
                if (e instanceof WriterLockHeldError) {
                    new Notice(e.message, 10000);
                }
                console.warn('[Plugin] KnowledgeDB open failed (non-fatal):', e);
            });
            // FIX-18: If open() failed, null out to prevent cascading "not opened" errors
            if (!this.knowledgeDB.isOpen()) {
                console.warn('[Plugin] KnowledgeDB not available — semantic features disabled for this session');
                this.knowledgeDB = null;
            }
            // Only create downstream stores if DB is available
            if (!this.knowledgeDB) {
                this.semanticIndex = null;
            } else {
            this.vectorStore = new VectorStore(this.knowledgeDB);
            this.graphStore = new GraphStore(this.knowledgeDB);
            this.ontologyStore = new OntologyStore(this.knowledgeDB);
            this.vaultRenameHandler = new VaultRenameHandler(this.knowledgeDB);
            // BA-25 Stores (knowledge.db v10 tables)
            this.noteSummaryStore = new NoteSummaryStore(this.knowledgeDB);
            this.frontmatterPropertyStore = new FrontmatterPropertyStore(this.knowledgeDB);
            this.clusterMetadataStore = new ClusterMetadataStore(this.knowledgeDB);
            this.clusterSourceStatsStore = new ClusterSourceStatsStore(this.knowledgeDB);
            this.ingestSessionStore = new IngestSessionStore(this.knowledgeDB);
            this.ingestTriageLogStore = new IngestTriageLogStore(this.knowledgeDB);
            // FrontmatterIndexer wires the per-note read-and-mirror hook (FEAT-15-09/10, FEAT-19-09).
            // SummaryGeneratorFn stays null until autoSummary feature is enabled in settings; the
            // indexer then only mirrors properties from frontmatter and adopts existing summaries.
            // FEAT-19-09: Auto-Summary-Generator-Hook (LLM via Memory-Model).
            // SummaryGenerator wird nur registriert wenn autoSummary.enabled.
            const ingestCfg = this.settings.vaultIngest ?? DEFAULT_VAULT_INGEST_SETTINGS;
            const summaryGenerator = ingestCfg.autoSummary.enabled
                ? buildSummaryGenerator({
                    promptTemplate: ingestCfg.summaryPrompt.template,
                    apiHandlerFactory: () => {
                        const model = this.getMemoryModel();
                        if (!model) return null;
                        try {
                            return buildApiHandlerForModel(model);
                        } catch (e) {
                            console.warn('[Plugin] SummaryGenerator API handler failed:', e);
                            return null;
                        }
                    },
                })
                : undefined;
            // FEAT-03-25 / ADR-109: MemorySourceStore + Bridge-Hook
            // initialisieren. Der Hook liest die Note und triggert
            // ExtractionQueue.enqueueImmediate, damit der bereits
            // existierende SingleCallProcessor die Facts extrahiert.
            // Best-effort: alles in eigenem try/catch -- Hook-Fehler
            // blockieren den Vault-Indexer niemals.
            if (this.memoryDB?.isOpen()) {
                const { MemorySourceStore } = await import('./core/knowledge/MemorySourceStore');
                this.memorySourceStore = new MemorySourceStore(this.memoryDB);
            }
            const memorySourceStore = this.memorySourceStore;
            // AUDIT-015 M-2: Prompt-Injection-Resistance fuer Vault-Notes.
            // Vault-Inhalte koennen unkontrolliert sein (Web-Imports, Notes
            // mit "ignore previous instructions"-Pattern, etc.). Wir
            // wrappen sie in deutlich abgegrenzte Marker, kappen die
            // Laenge auf 16k Chars und entschaerfen typische Injection-
            // Patterns. SingleCallProcessor sieht nur 'user'-content,
            // also bleibt das Risiko Surface-orientiert.
            const memorySourceHook = memorySourceStore
                ? async (input: { file: TFile; fromFrontmatter: boolean }) => {
                    if (!this.extractionQueue) return;
                    try {
                        const raw = await this.app.vault.cachedRead(input.file);
                        const sanitized = sanitizeVaultContentForLLM(raw, input.file.path);
                        const conversationId = `vault://${input.file.path}`;
                        await this.extractionQueue.enqueueImmediate({
                            conversationId,
                            messages: [{ role: 'user', text: sanitized }],
                            title: `Vault note: ${input.file.basename}`,
                            queuedAt: new Date().toISOString(),
                        });
                        memorySourceStore.markDirty(input.file.path);
                    } catch (e) {
                        console.debug(`[memory-source-hook] failed for ${input.file.path}:`, e);
                    }
                }
                : undefined;

            this.frontmatterIndexer = new FrontmatterIndexer(
                this.app,
                this.noteSummaryStore,
                this.frontmatterPropertyStore,
                {
                    autoSummaryEnabled: ingestCfg.autoSummary.enabled,
                    summaryGenerator,
                    memorySourceStore: memorySourceStore ?? undefined,
                    memorySourceHook,
                },
            );

            // FEAT-19-09 / FEAT-15-09 / FEAT-15-10: vault-event-Hooks fuer
            // FrontmatterIndexer (per-note Spiegel von Frontmatter und
            // optional Auto-Summary). Idempotent ueber mtime im Indexer.
            const indexerOnCreate = this.app.vault.on('create', (file) => {
                if (file instanceof TFile && file.extension === 'md' && this.frontmatterIndexer) {
                    void this.frontmatterIndexer.indexNote(file).catch(() => {});
                }
            });
            const indexerOnModify = this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md' && this.frontmatterIndexer) {
                    void this.frontmatterIndexer.indexNote(file).catch(() => {});
                }
            });
            this.frontmatterIndexerListeners.push(
                () => this.app.vault.offref(indexerOnCreate),
                () => this.app.vault.offref(indexerOnModify),
            );
            // TopHubBlockGenerator (FEAT-03-26) ist als Read-Only-Helper verfuegbar.
            // ContextComposer-Wiring kommt mit explizitem Setting-Toggle.
            this.topHubBlockGenerator = new TopHubBlockGenerator(
                this.knowledgeDB,
                this.noteSummaryStore,
            );
            this.communityDetectionService = new CommunityDetectionService(
                this.knowledgeDB, this.graphStore, this.ontologyStore,
            );
            this.semanticIndex = new SemanticIndexService(this.app.vault, this.knowledgeDB, this.vectorStore, {
                batchSize: this.settings.semanticBatchSize,
                embeddingBatchSize: 16,  // texts per API call -- batch for performance
                excludedFolders: this.settings.semanticExcludedFolders,
                indexPdfs: this.settings.semanticIndexPdfs,
                chunkSize: this.settings.semanticChunkSize ?? 2000,
                enableContextualRetrieval: this.settings.enableContextualRetrieval,
                // AUDIT-013 follow-up: skip ignored notes at index build.
                isIgnored: (path: string) => this.ignoreService.isIgnored(path),
            });
            const embeddingModel = this.getActiveEmbeddingModel();
            if (embeddingModel) this.semanticIndex.setEmbeddingModel(embeddingModel);
            // Contextual Retrieval: set API handler for prefix generation (FEATURE-1501)
            if (this.settings.enableContextualRetrieval && this.settings.contextualModelKey) {
                const ctxModel = this.settings.activeModels.find(
                    (m) => getModelKey(m) === this.settings.contextualModelKey && m.enabled,
                );
                if (ctxModel) {
                    const { buildApiHandlerForModel } = await import('./api/index');
                    this.semanticIndex.setContextualApiHandler(buildApiHandlerForModel(ctxModel));
                }
            }
            await this.semanticIndex.initialize().catch((e) =>
                console.warn('[Plugin] Semantic index init failed (non-fatal):', e)
            );
            // Memory v2 / FEATURE-0316 task 6: shared EmbeddingService backed by
            // SemanticIndexService.embedTexts. Phase 2+ engine modules (FactStore
            // embeddings, future history embeddings, Hybrid-Search Cosine signal)
            // route through this single Service instead of growing parallel
            // embed paths.
            const semanticIndexRef = this.semanticIndex;
            this.embeddingService = new EmbeddingService(new VaultOperatorEmbeddingProvider(
                (texts) => semanticIndexRef.embedTexts(texts),
                () => semanticIndexRef.getEmbeddingModelInfo(),
            ));
            // Auto-index on startup if configured
            if (this.settings.semanticAutoIndex === 'startup') {
                // buildIndex() auto-triggers enrichment after completion
                this.semanticIndex.buildIndex().catch((e) =>
                    console.warn('[Plugin] Auto-index on startup failed:', e)
                );
            } else if (
                this.semanticIndex.isIndexed &&
                this.settings.enableContextualRetrieval &&
                this.settings.contextualModelKey &&
                this.vectorStore
            ) {
                // No build needed, but check for unenriched chunks from a previous session
                const unenriched = this.vectorStore.getUnenrichedCount();
                if (unenriched > 0) {
                    console.debug(`[Plugin] ${unenriched} unenriched chunks found — starting background enrichment`);
                    void this.semanticIndex.runBackgroundEnrichment();
                }
            }

            // Graph Extraction (FEATURE-1502): extract Wikilinks, MOC-Properties, Tags
            if (this.settings.enableGraphExpansion && this.graphStore) {
                this.graphExtractor = new GraphExtractor(
                    this.app,
                    this.graphStore,
                    this.settings.mocPropertyNames ?? [],
                );
                // Full extraction on startup (fast: reads metadataCache only, no file I/O)
                this.app.workspace.onLayoutReady(() => {
                    this.graphExtractor?.extractAll(this.app.vault);
                });
            }

            // Ontology Bootstrap (FEATURE-1902): build cluster mappings from MOC edges
            if (this.ontologyStore && this.graphStore) {
                this.app.workspace.onLayoutReady(() => {
                    // Build category map from metadataCache (Kategorie is a string, not a Wikilink)
                    const catProp = this.settings.categoryProperty ?? 'Kategorie';
                    const categoryMap = new Map<string, string>();
                    for (const file of this.app.vault.getMarkdownFiles()) {
                        const cache = this.app.metadataCache.getFileCache(file);
                        if (cache?.frontmatter?.[catProp]) {
                            const cat = Array.isArray(cache.frontmatter[catProp])
                                ? (cache.frontmatter[catProp][0] ?? '').toString().trim()
                                : cache.frontmatter[catProp].toString().trim();
                            if (cat) categoryMap.set(file.path, cat);
                        }
                    }
                    const result = this.ontologyStore?.bootstrapFromEdges(
                        this.settings.mocPropertyNames ?? [],
                        catProp,
                        categoryMap,
                    );
                    if (result) {
                        console.debug(`[Ontology] Bootstrap: ${result.clusters} clusters, ${result.entries} entries`);
                    }
                });
            }

            // BA-25 AutoTriggerObserver (FEAT-19-27, ADR-102): listen on vault create/modify
            // and trigger ingest_triage when a note carries the configured frontmatter property.
            const autoTriggerCfg = this.settings.vaultIngest?.autoTrigger;
            if (
                autoTriggerCfg?.enabled
                && autoTriggerCfg.propertyName
                && this.ingestTriageLogStore
            ) {
                this.autoTriggerObserver = new AutoTriggerObserver(
                    this.app,
                    this.ingestTriageLogStore,
                    async (file) => {
                        // FEAT-19-27 Wiring: ruft das ingest_triage Tool im
                        // Pending-Mode auf, damit Cluster-Match und Source-
                        // Domain-Stats automatisch festgehalten werden. Tool
                        // schreibt das Triage-Log selbst und vermeidet so
                        // doppelten Trigger; die User-Entscheidung kommt
                        // spaeter ueber UI oder Agent-Tool-Call.
                        const tool = this.toolRegistry?.getTool('ingest_triage');
                        if (tool) {
                            const captured: string[] = [];
                            const ctx = {
                                plugin: this,
                                callbacks: {
                                    pushToolResult: (r: string) => { captured.push(r); },
                                    say: () => Promise.resolve(),
                                    ask: () => Promise.resolve({ response: 'noButtonClicked' as const }),
                                    isParallelExecution: false,
                                    shouldUseImmediateApproval: () => false,
                                } as unknown as ToolCallbacks,
                            } as unknown as import('./core/tools/types').ToolExecutionContext;
                            try {
                                await tool.execute({
                                    source_uri: `vault://${file.path}`,
                                    decision: 'pending',
                                }, ctx);
                            } catch (e) {
                                console.debug(`[BA-25] auto-triage tool failed for ${file.path}:`, e);
                            }
                        }
                        if (autoTriggerCfg.notification) {
                            new Notice(`Auto-Triage candidate: ${file.path}`, 4000);
                        }
                        console.debug(`[BA-25] auto-trigger fired for ${file.path}`);
                    },
                    {
                        enabled: autoTriggerCfg.enabled,
                        propertyName: autoTriggerCfg.propertyName,
                        propertyValue: autoTriggerCfg.propertyValue,
                    },
                );
                this.autoTriggerObserver.start();
            }

            // FEAT-19-20 / IMP-19-20-01: Stufe-3 Periodischer Job mit
            // Persistenz und setInterval-Wrapper. Default OFF; Wrapper
            // checkt internal weeklyBudget plus 7d-Cooldown selbst.
            // Hooks: real LLM-Pre-Filter via apiHandler.classifyText (Haiku-
            // class quick yes/no), webUpdatePass nutzt das registrierte
            // web_search Tool (BYOK-Provider via FEAT-04-02). Wenn weder
            // apiHandler noch web_search verfuegbar ist, fallen die Hooks
            // auf no-op zurueck damit Tokenverbrauch null bleibt.
            if (this.knowledgeDB && this.clusterMetadataStore) {
                const persistence = new ClusterMetadataStatePersistence(this.knowledgeDB);
                const preFilter = async (cluster: import('./core/knowledge/ClusterMetadataStore').ClusterMetadataRecord) => {
                    if (!this.apiHandler?.classifyText) return { decision: 'no' as const, tokensUsed: 0 };
                    const prompt = `Cluster "${cluster.cluster}" wurde zuletzt am ${cluster.lastExternalCheck ?? 'nie'} extern verifiziert. `
                        + `Halbwertszeit: ${cluster.halfLifeDays} Tage. Lohnt sich JETZT eine Web-Suche `
                        + `nach Updates? Antworte ausschliesslich mit "yes", "no" oder "unsure".`;
                    try {
                        const reply = (await this.apiHandler.classifyText(prompt)).toLowerCase().trim();
                        const decision: 'yes' | 'no' | 'unsure' = reply.startsWith('yes') ? 'yes'
                            : reply.startsWith('unsure') ? 'unsure' : 'no';
                        return { decision, tokensUsed: prompt.length / 4 + 5 };
                    } catch (e) {
                        console.debug('[Stufe3] preFilter classify failed:', e);
                        return { decision: 'no' as const, tokensUsed: 0 };
                    }
                };
                const webUpdatePass = async (cluster: import('./core/knowledge/ClusterMetadataStore').ClusterMetadataRecord) => {
                    const tool = this.toolRegistry?.getTool('web_search');
                    if (!tool) return { findings: [], tokensUsed: 0 };
                    const captured: string[] = [];
                    const ctx = {
                        plugin: this,
                        callbacks: {
                            pushToolResult: (r: string) => { captured.push(r); },
                            say: () => Promise.resolve(),
                            ask: () => Promise.resolve({ response: 'noButtonClicked' as const }),
                            isParallelExecution: false,
                            shouldUseImmediateApproval: () => false,
                        } as unknown as import('./core/tools/types').ToolCallbacks,
                    } as unknown as import('./core/tools/types').ToolExecutionContext;
                    try {
                        await tool.execute({
                            query: `${cluster.cluster} latest update news`,
                            max_results: 5,
                        }, ctx);
                    } catch (e) {
                        console.debug('[Stufe3] webUpdatePass failed:', e);
                        return { findings: [], tokensUsed: 0 };
                    }
                    const text = captured.join('\n');
                    if (!text.trim()) return { findings: [], tokensUsed: 0 };
                    return {
                        findings: [{
                            cluster: cluster.cluster,
                            title: `Updates fuer ${cluster.cluster}`,
                            summary: text.slice(0, 600),
                            sources: extractUrlsFromText(text).slice(0, 5),
                            detectedAt: new Date().toISOString(),
                            strongSignal: extractUrlsFromText(text).length >= 2,
                        }],
                        tokensUsed: text.length / 4,
                    };
                };
                const notificationSink = (findings: import('./core/health/Stufe3PeriodicJob').UpdateFinding[]) => {
                    if (!findings.length) return;
                    new Notice(`Stufe-3: ${findings.length} Update-Hinweise gefunden (siehe Console).`, 6_000);
                    for (const f of findings) console.debug(`[Stufe3] ${f.cluster}: ${f.title}`);
                };
                const budgetExceededSink = (info: { spentUsd: number; budgetUsd: number }) => {
                    new Notice(`Stufe-3 Budget bei ${(info.spentUsd / info.budgetUsd * 100).toFixed(0)}%.`, 5_000);
                };
                this.stufe3PeriodicJob = new Stufe3PeriodicJob(
                    this.clusterMetadataStore,
                    preFilter,
                    webUpdatePass,
                    notificationSink,
                    { weeklyBudgetUsd: 2.0, notificationThreshold: 0.8 },
                    undefined,
                    budgetExceededSink,
                    persistence,
                );
                // Wrapper: stuendlich check, run weekly via job's internal
                // rolloverIfNewWeek + lastRun-Logik (vereinfacht via ClusterMeta-State).
                this.stufe3IntervalHandle = scheduleRecurring(() => {
                    if (!this.stufe3PeriodicJob) return;
                    this.stufe3PeriodicJob.rolloverIfNewWeek();
                    // Run heute nur wenn user explicitly enabled; aktuell
                    // gating nur ueber suppressRun-Flag aus Settings (no-op
                    // hooks oben verhindern Tokenverbrauch sowieso).
                    if (this.settings.vaultIngest?.autoTrigger?.enabled) {
                        void this.stufe3PeriodicJob.run().catch((e) => {
                            console.debug('[Stufe3] periodic run failed:', e);
                        });
                    }
                }, 3_600_000);
            }

            // FEAT-03-26: Top-Hub-Block initialer Build (cache-stabil).
            if (this.topHubBlockGenerator && ingestCfg.topHubBlock?.enabled) {
                const result = this.topHubBlockGenerator.generateIfNeeded(this.topHubBlockState);
                if (result) {
                    this.topHubBlockState = result.state;
                    this.topHubBlockMarkdown = result.block;
                }
            }

            // FEAT-19-19: Stufe-2 Activity-Trigger. Bei Note-Open/Modify in
            // einem reifen Cluster zeigt das Plugin dezent eine Notice.
            // Klick auf Notice startet anti_echo_search-Pass (UI-Hook).
            const stufe2Cfg = ingestCfg.stufe2Hint;
            if (
                stufe2Cfg?.enabled
                && this.knowledgeDB
                && this.clusterMetadataStore
            ) {
                this.stufe2ActivityTrigger = new Stufe2ActivityTrigger(
                    this.app,
                    this.knowledgeDB,
                    this.clusterMetadataStore,
                    (info) => {
                        const days = info.daysSinceLastCheck === null
                            ? 'nie'
                            : `${Math.round(info.daysSinceLastCheck)}d`;
                        const notice = new Notice(
                            `Cluster "${info.cluster}" wirkt veraltet (Score ${info.score}, letzter Check: ${days}). `
                                + `Klick fuer Anti-Echo-Suche.`,
                            10_000,
                        );
                        // Klick-Handler fuer dezenten Trigger; nur wenn Notice-API verfuegbar.
                        const el = notice.messageEl;
                        if (el) {
                            el.classList.add('agent-u-cursor-pointer');
                            el.addEventListener('click', () => {
                                notice.hide();
                                new Notice(
                                    `Tipp: "@anti_echo_search cluster:${info.cluster}" im Agent ausfuehren, `
                                        + `um Gegenpositionen zu suchen.`,
                                    8_000,
                                );
                            });
                        }
                    },
                    {
                        enabled: stufe2Cfg.enabled,
                        hintThresholdScore: stufe2Cfg.hintThresholdScore,
                        minDaysSinceCheck: stufe2Cfg.minDaysSinceCheck,
                        perClusterCooldownDays: stufe2Cfg.perClusterCooldownDays,
                        maxHintsPerDay: stufe2Cfg.maxHintsPerDay,
                    },
                );
                this.stufe2ActivityTrigger.start();
            }

            // Vault Health Check (FEATURE-1901): background lint on startup
            if ((this.settings.enableVaultHealthCheck ?? true) && this.knowledgeDB) {
                this.vaultHealthService = new VaultHealthService(this.app, this.knowledgeDB);
                this.app.workspace.onLayoutReady(() => {
                    void this.vaultHealthService?.runChecks().then(() => {
                        // Update badge in sidebar view after health check completes
                        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
                        if (leaves.length > 0 && this.vaultHealthService) {
                            const view = leaves[0].view as AgentSidebarView;
                            // Badge shows all findings (discuss is available for every type)
                            const findings = this.vaultHealthService.getFindings();
                            const highCount = findings.filter(f => f.severity === 'high').length;
                            view.updateHealthBadge(
                                findings.length,
                                highCount > 0 ? 'high' : (findings.length > 0 ? 'medium' : null),
                            );
                        }
                    });
                });
            }

            // Implicit Connections (FEATURE-1503): discover semantically similar notes
            if (this.settings.enableImplicitConnections && this.vectorStore && this.graphStore) {
                this.implicitConnectionService = new ImplicitConnectionService(
                    this.knowledgeDB,
                    this.vectorStore,
                    this.graphStore,
                );
                // Auto-compute after startup if index exists
                if (this.semanticIndex.isIndexed) {
                    this.app.workspace.onLayoutReady(() => {
                        void this.implicitConnectionService?.computeAll(this.settings.implicitThreshold);
                    });
                }
            }

            // Local Reranking (FEATURE-1504): cross-encoder via transformers.js (WASM)
            if (this.settings.enableReranking) {
                this.rerankerService = new RerankerService(this);
                // Pre-load model at startup so first search is fast.
                // If the ONNX asset isn't installed, loadModel marks the
                // service failed and returns -- semantic search keeps working
                // without the rerank step.
                this.app.workspace.onLayoutReady(() => {
                    void this.rerankerService?.loadModel();
                });
            }
            } // end FIX-18 else (knowledgeDB available)
        }

        // Vault file listeners. Two responsibilities are wired here:
        //
        //   (1) Path-cascade: rewrite path columns across knowledge.db on
        //       rename/move so no orphan rows survive. ALWAYS active when
        //       knowledge.db is open -- it just does UPDATEs, no embedding.
        //   (2) Auto-reindex: re-embed and re-extract on modify/create/rename.
        //       Gated on settings.semanticAutoIndexOnChange because users
        //       opt out for cost reasons.
        if (this.knowledgeDB && this.vaultRenameHandler) {
            const autoIndex = !!(
                this.settings.enableSemanticIndex
                && this.semanticIndex
                && this.settings.semanticAutoIndexOnChange
            );

            const DOCUMENT_EXTENSIONS = new Set(['pdf', 'pptx', 'xlsx', 'docx']);
            const isIndexable = (f: TFile): boolean =>
                f.extension === 'md' || (this.settings.semanticIndexPdfs && DOCUMENT_EXTENSIONS.has(f.extension));

            const applyFileRename = (oldPath: string, file: TFile) => {
                // Cascade always -- the 8 (table, column) pairs are content-
                // independent, so this is safe regardless of auto-index.
                this.vaultRenameHandler?.cascadeFileRename(oldPath, file.path);
                if (autoIndex && isIndexable(file)) {
                    void this.semanticIndex?.removeFile(oldPath);
                    this.graphExtractor?.removeFile(oldPath);
                    this.ontologyStore?.removeEntriesForPath(oldPath);
                    if (file.extension === 'md') {
                        this.graphExtractor?.extractFile(file);
                        this.implicitConnectionService?.recomputeForPath(file.path, this.settings.implicitThreshold);
                        this.ontologyStore?.updateForPath(file.path, this.settings.mocPropertyNames ?? []);
                        this.scheduleTopHubBlockRegen();
                    }
                    this.scheduleFileIndex(file.path);
                }
            };

            this.registerEvent(this.app.vault.on('modify', (file) => {
                if (!autoIndex || !(file instanceof TFile) || !isIndexable(file)) return;
                this.scheduleFileIndex(file.path);
                if (file.extension === 'md') {
                    this.graphExtractor?.extractFile(file);
                    this.implicitConnectionService?.recomputeForPath(file.path, this.settings.implicitThreshold);
                    this.ontologyStore?.updateForPath(file.path, this.settings.mocPropertyNames ?? []);
                    this.scheduleTopHubBlockRegen();
                }
            }));
            this.registerEvent(this.app.vault.on('create', (file) => {
                if (!autoIndex || !(file instanceof TFile) || !isIndexable(file)) return;
                this.scheduleFileIndex(file.path);
                if (file.extension === 'md') {
                    this.graphExtractor?.extractFile(file);
                    this.implicitConnectionService?.recomputeForPath(file.path, this.settings.implicitThreshold);
                    this.ontologyStore?.updateForPath(file.path, this.settings.mocPropertyNames ?? []);
                    this.scheduleTopHubBlockRegen();
                }
            }));
            this.registerEvent(this.app.vault.on('delete', (file) => {
                if (!autoIndex || !(file instanceof TFile)) return;
                void this.semanticIndex?.removeFile(file.path);
                this.graphExtractor?.removeFile(file.path);
                this.ontologyStore?.removeEntriesForPath(file.path);
                this.scheduleTopHubBlockRegen();
                // FEAT-03-25 / ADR-109: Cascade -- entferne MemorySourceStore-
                // Eintrag, abgeleitete Facts bleiben (FEAT-03-22 Forget-Right
                // ist separater Pfad, kein automatisches Hard-Delete).
                this.memorySourceStore?.remove(file.path);
            }));
            this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFolder) {
                    this.vaultRenameHandler?.cascadeFolderRename(oldPath, file.path);
                    return;
                }
                if (!(file instanceof TFile)) return;
                applyFileRename(oldPath, file);
                // FEAT-03-25: MemorySourceStore mitziehen.
                this.memorySourceStore?.rename(oldPath, file.path);
            }));
        }

        // Memory DB (FEATURE-1505/1508): SQLite storage at {vault-parent}/.obsidian-agent/memory.db
        {
            this.memoryDB = new MemoryDB(this.app.vault, pluginDir, this.globalFs.getRoot());
            await this.memoryDB.open().catch((e) =>
                console.warn('[Plugin] MemoryDB open failed (non-fatal):', e)
            );
            // FIX-18: null out if open failed to prevent cascading errors
            if (!this.memoryDB.isOpen()) {
                console.warn('[Plugin] MemoryDB not available — memory features degraded');
                this.memoryDB = null;
            }
            // FIX-24-06-02: ensure MemorySourceStore is initialised once memoryDB
            // is open. The earlier init attempt around the FrontmatterIndexer
            // setup runs BEFORE memoryDB opens (init-order is fixed by Obsidian
            // plugin onload), so memorySourceStore stays null otherwise.
            // Tools that read this.memorySourceStore (list_memory_source_notes,
            // mark/unmark_note_as_memory_source) silently failed with
            // "MemorySourceStore not available" until this second-pass init.
            if (this.memoryDB?.isOpen() && !this.memorySourceStore) {
                const { MemorySourceStore } = await import('./core/knowledge/MemorySourceStore');
                this.memorySourceStore = new MemorySourceStore(this.memoryDB);
            }
        }

        // History DB (FEATURE-0320 Phase 6): per-message keyword + future cosine
        // search across all conversation transcripts.
        try {
            const { HistoryDB } = await import('./core/knowledge/HistoryDB');
            this.historyDB = new HistoryDB(this.app.vault, pluginDir, this.globalFs.getRoot());
            await this.historyDB.open();
            if (!this.historyDB.isOpen()) {
                console.warn('[Plugin] HistoryDB not available — history search degraded');
                this.historyDB = null;
            }
        } catch (e) {
            console.warn('[Plugin] HistoryDB open failed (non-fatal):', e);
            this.historyDB = null;
        }

        // Daily snapshots (FEATURE-0314, ADR-079): copy live DBs into
        // .bak/<name>/<YYYY-MM-DD>.db so a 7-day rolling Undo exists on top
        // of the per-write .bak rotation. Only fires for filesystem-backed
        // storage modes; obsidian-sync DBs are excluded to avoid duplicating
        // bytes through the same sync provider.
        try {
            this.snapshotJob = new SnapshotJob();
            const targets: SnapshotTarget[] = [];
            if (this.knowledgeDB && this.knowledgeDB.getStorageLocation() !== 'obsidian-sync') {
                targets.push({ name: 'knowledge', sourcePath: this.knowledgeDB.getAbsolutePath() });
            }
            if (this.memoryDB && this.memoryDB.getStorageLocation() !== 'obsidian-sync') {
                targets.push({ name: 'memory', sourcePath: this.memoryDB.getAbsolutePath() });
            }
            if (targets.length > 0) {
                this.snapshotTargets = targets;
                // Run in background; never block plugin startup on snapshot I/O.
                void this.snapshotJob.runDailySnapshot(targets)
                    .then((results) => {
                        const created = results.filter((r) => r.action === 'created').length;
                        if (created > 0) console.debug(`[SnapshotJob] Created ${created} snapshot(s)`);
                    })
                    .then(() => this.snapshotJob?.cleanupOldSnapshots(targets))
                    .then((removed) => {
                        if (removed && removed > 0) console.debug(`[SnapshotJob] Removed ${removed} expired snapshot(s)`);
                    })
                    .catch((e) => console.warn('[SnapshotJob] Daily snapshot failed (non-fatal):', e));
            }
        } catch (e) {
            console.warn('[SnapshotJob] Setup failed (non-fatal):', e);
        }

        // Agent Skill Mastery — Procedural Recipes (ADR-017)
        if (this.settings.mastery.enabled) {
            const getLearnedEnabled = () => this.settings.mastery.learnedRecipesEnabled;

            this.recipeStore = new RecipeStore(this.globalFs, getLearnedEnabled, this.memoryDB);
            await this.recipeStore.initialize().catch((e) =>
                console.warn('[Plugin] RecipeStore init failed (non-fatal):', e)
            );
            this.recipeMatchingService = new RecipeMatchingService(this.recipeStore);

            // Episodic memory + recipe promotion (ADR-018)
            this.episodicExtractor = new EpisodicExtractor(
                this.globalFs,
                () => this.semanticIndex,
                this.memoryDB,
            );
            await this.episodicExtractor.initialize().catch((e) =>
                console.warn('[Plugin] EpisodicExtractor init failed (non-fatal):', e)
            );
            // ADR-058: Semantic Recipe Promotion (intent-based, not sequence-based).
            // FEAT-24-07 / ADR-115: helper-model has priority; falls back to
            // memory-model for backwards-compat with users who configured
            // only memoryModelKey before FEAT-24-07.
            this.recipePromotionService = new RecipePromotionService(
                this.recipeStore,
                () => {
                    const helper = this.getHelperModel();
                    if (helper) {
                        try {
                            return buildApiHandler(modelToLLMProvider(helper));
                        } catch (e) {
                            console.warn('[RecipePromotion] helper-model build failed, falling back to memory-model:', e);
                        }
                    }
                    const memModel = this.getMemoryModel();
                    if (!memModel) return null;
                    return buildApiHandler(modelToLLMProvider(memModel));
                },
                getLearnedEnabled,
                this.episodicExtractor,
            );
            await this.recipePromotionService.initialize().catch((e) =>
                console.warn('[Plugin] RecipePromotionService init failed (non-fatal):', e)
            );
        }

        // Chat history service (legacy — only when folder is configured)
        const s = this.settings as unknown as Record<string, unknown>;
        if (s['chatHistoryFolder']) {
            this.chatHistoryService = new ChatHistoryService(this.app.vault, s['chatHistoryFolder'] as string);
        }

        // Conversation store (new persistent history)
        if (this.settings.enableChatHistory) {
            this.conversationStore = new ConversationStore(this.globalFs);
            await this.conversationStore.initialize().catch((e) =>
                console.warn('[Plugin] ConversationStore init failed (non-fatal):', e)
            );
        }

        // History indexer (FEATURE-0320 Phase 6): backfill on first run,
        // incrementally re-index after every conversation save. Indexer
        // is a no-op when historyDB or conversationStore is unavailable.
        if (this.historyDB && this.conversationStore) {
            const { HistoryIndexer } = await import('./core/memory/HistoryIndexer');
            this.historyIndexer = new HistoryIndexer(this.historyDB, this.conversationStore);
            const backfillCtl = new AbortController();
            void this.historyIndexer.backfillAll(backfillCtl.signal).then((report) => {
                if (report.chunksInserted > 0) {
                    console.debug(
                        `[HistoryIndex] backfill: ${report.chunksInserted} new chunks ` +
                        `(skipped ${report.chunksSkipped}, ${report.conversationsScanned} conversations)`,
                    );
                }
            }).catch((e) => console.warn('[HistoryIndex] backfill failed (non-fatal):', e));
        }

        // Memory service + extraction queue
        if (this.settings.memory.enabled) {
            this.memoryService = new MemoryService(this.globalFs, this.memoryDB);
            await this.memoryService.initialize().catch((e) =>
                console.warn('[Plugin] MemoryService init failed (non-fatal):', e)
            );
            this.extractionQueue = new ExtractionQueue(this.globalFs);
            await this.extractionQueue.load().catch((e) =>
                console.warn('[Plugin] ExtractionQueue load failed (non-fatal):', e)
            );

            // FEATURE-0318 / PLAN-007 task C.2: telemetry + drift + budget wiring.
            this.memoryV2Telemetry = new MemoryV2Telemetry((path, line) => this.globalFs.append(path, line));
            this.driftBus = new DriftEventBus();
            this.driftBus.subscribe((event) => {
                void this.memoryV2Telemetry?.drift({
                    sessionId: event.sessionId,
                    previousTopic: event.previousTopic ?? '',
                    newTopic: event.newTopic,
                    score: event.score,
                });
            });
            // IMP-03-18-02: bei Drift den 60s-Throttle fuer diese
            // conversationId zuruecksetzen, damit die naechste
            // Auto-Extraction direkt durchgeht statt im Throttle-Window
            // zu sterben. Wir enqueuen nicht direkt, weil das DriftEvent
            // keine messages traegt; das naechste normale enqueue laeuft
            // dann ohne Throttle-Skip.
            this.driftBus.subscribe((event) => {
                this.extractionQueue?.clearThrottle(event.sessionId);
            });
            this.tokenBudget = new TokenBudgetGuard({
                loadState: () => this.settings.memory.tokenBudgetState ?? null,
                saveState: async (state) => {
                    this.settings.memory.tokenBudgetState = state;
                    await this.saveSettings();
                },
                thresholds: { dailyInputCap: 1_000_000, dailyOutputCap: 200_000 },
            });

            // FEATURE-0318 / PLAN-007 task C.1: Single-Call replaces both
            // SessionExtractor and LongTermExtractor. One tool-calling LLM
            // round produces session summary + atomic facts + mentions +
            // delta-window summary in a single pass.
            const memoryService = this.memoryService;
            const memoryDB = this.memoryDB;
            if (!memoryDB) {
                console.warn('[Plugin] memoryDB unavailable -- extraction queue will skip items.');
                this.extractionQueue.setProcessor(() => Promise.resolve());
            } else {
                const singleCallProcessor = new SingleCallProcessor({
                    memoryService,
                    memoryDB,
                    embeddingService: this.embeddingService,
                    getMemoryModel: () => this.getMemoryModel(),
                    getSemanticIndex: () => this.semanticIndex,
                    tokenBudget: this.tokenBudget,
                    telemetry: this.memoryV2Telemetry,
                });
                this.extractionQueue.setProcessor((item) => singleCallProcessor.process(item));
            }

            // Process any pending extractions from a previous session
            if (!this.extractionQueue.isEmpty()) {
                console.debug(`[Plugin] Processing ${this.extractionQueue.size()} pending extractions from previous session`);
                this.extractionQueue.processQueue().catch((e) =>
                    console.warn('[Plugin] Queue processing failed (non-fatal):', e)
                );
            }

            // FEATURE-0319b / PLAN-008 task C.7: sync CapabilityManifest into
            // Memory v2 under profile_id='_obsilo'. Detects manifest changes
            // via djb2 hash and replaces the snapshot atomically.
            this.syncCapabilitySnapshot().catch((e) =>
                console.warn('[Plugin] Capability snapshot sync failed (non-fatal):', e),
            );

            // FEATURE-0319 Phase 5: aging sweep on plugin onload.
            // AgingService short-circuits when lastAgingRunAt is < 24h old.
            this.runAgingSweep().catch((e) =>
                console.warn('[Plugin] Aging sweep failed (non-fatal):', e),
            );

            // IMP-03-18-01: 6h-Tick damit Aging auch laufen kann, wenn Obsidian
            // tagelang nicht neu gestartet wird. AgingService 24h-Cooldown
            // bleibt aktiv, der Tick prueft nur ob gerade etwas zu tun ist.
            this.agingSchedulerHandle = scheduleRecurring(() => {
                this.runAgingSweep().catch((e) =>
                    console.debug('[Plugin] Aging tick failed:', e),
                );
            }, 6 * 60 * 60 * 1000);

            // FEATURE-0319 Phase 5: configure re-extraction throttle from settings.
            this.extractionQueue.setThrottleMs(this.settings.memory.reExtractThrottleMs ?? 60_000);
        }

        // LLM provider (null if no API key configured)
        this.initApiHandler();

        // 3. Register UI views (registerView moved to synchronous onload())

        // Ribbon icon in left activity bar (using built-in lucide icon)
        this.addRibbonIcon('square-slash', 'Vault Operator', () => {
            void this.activateView();
        });

        // Protocol handler: deep-link into a specific conversation (ADR-022)
        // New canonical name is 'vault-operator-chat'. The legacy
        // 'obsilo-chat' protocol stays registered as an alias so that
        // existing frontmatter links keep working.
        const openChatFromParams = (params: Record<string, string>) => {
            const id = params.id;
            if (!id) return;
            void this.openChatById(id);
        };
        this.registerObsidianProtocolHandler('vault-operator-chat', openChatFromParams);
        this.registerObsidianProtocolHandler('obsilo-chat', openChatFromParams);

        // Register 'Chats' property as list type so Properties view shows individual items
        this.app.metadataTypeManager.setType('chats', 'multitext');

        // Auto-open sidebar when Obsidian starts.
        //
        // FEATURE-2208 (BRAT update fix, 2026-04-19): After a plugin hot-reload
        // (e.g. BRAT update) Obsidian keeps the old leaf in the workspace but
        // the view DOM is stale -- the input field disappears until the user
        // reloads Obsidian. Force a fresh onOpen by cycling each existing
        // leaf through the 'empty' view state, then reactivating normally.
        this.app.workspace.onLayoutReady(() => {
            void (async () => {
                const stale = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
                for (const leaf of stale) {
                    try {
                        await leaf.setViewState({ type: 'empty' });
                        await leaf.setViewState({ type: VIEW_TYPE_AGENT_SIDEBAR, active: true });
                    } catch (e) {
                        console.debug('[Plugin] Failed to rebuild stale sidebar leaf:', e);
                    }
                }
                if (stale.length === 0) {
                    await this.activateView();
                }
                // Memory v2 upgrade prompt -- BUG-031 follow-up. Fires only
                // when the detector finds legacy v1 MDs and no v2 facts yet.
                // Fresh installs are silent.
                this.detectAndPromptMemoryV2Upgrade().catch(e =>
                    console.warn('[Plugin] Memory v2 upgrade detection failed (non-fatal):', e),
                );
            })();
        });

        // 4. Register commands
        this.addCommand({
            id: 'open-agent-sidebar',
            name: 'Open agent sidebar',
            callback: () => this.activateView()
        });

        // FEATURE-0319 Phase 5: Save active conversation to memory.
        // No default hotkey -- user assigns via Settings -> Hotkeys.
        this.addCommand({
            id: 'save-conversation-to-memory',
            name: 'Save conversation to memory',
            callback: () => { void this.saveActiveConversationToMemory(); },
        });

        // FEATURE-0319 Phase 6/7 soak: daily health snapshot. User runs once a
        // day, copies JSON to chat for trend analysis. Plain navigator.clipboard
        // -- Notice fallback if the API is unavailable (rare in Electron).
        this.addCommand({
            id: 'generate-memory-soak-report',
            name: 'Generate memory soak report',
            callback: () => { void this.generateAndCopySoakReport(); },
        });

        // Development: Test tool execution
        this.addCommand({
            id: 'test-tool-execution',
            name: 'Test tool execution',
            callback: () => this.testToolExecution()
        });

        // BA-25 FEAT-19-10: Frontmatter-Backfill-Job Command
        this.addCommand({
            id: 'ba25-run-frontmatter-backfill',
            name: 'Run frontmatter backfill job',
            callback: () => { void this.runFrontmatterBackfill(); },
        });

        // BA-25 FEAT-19-15: Inbox-Workflow Triage-Pass
        this.addCommand({
            id: 'ba25-run-inbox-triage',
            name: 'Run inbox triage on the configured auto-trigger property',
            callback: () => { void this.runInboxTriage(); },
        });

        // BA-25 FEAT-19-11: MOC-Auto-Pflege manuell triggern
        this.addCommand({
            id: 'ba25-refresh-moc-pages',
            name: 'Refresh map-of-content pages now (marker block)',
            callback: () => { void this.refreshAllMOCs(); },
        });

        // BA-25 FEAT-19-11: Initial-Marker-Injection in MOC-Kandidaten.
        this.addCommand({
            id: 'ba25-inject-moc-markers',
            name: 'Inject initial map-of-content markers into cluster candidates',
            callback: () => { void this.injectInitialMOCMarkers(); },
        });

        // BA-25 FEAT-03-26: Top-Hub-Block manueller Refresh
        this.addCommand({
            id: 'ba25-refresh-top-hub-block',
            name: 'Regenerate top-hub block now',
            callback: () => {
                if (!this.topHubBlockGenerator) { new Notice('Top-hub generator not available.'); return; }
                const r = this.topHubBlockGenerator.generate();
                this.topHubBlockState = r.state;
                this.topHubBlockMarkdown = r.block;
                new Notice(`Top-Hub-Block regeneriert: ${r.hubs.length} Hubs.`);
            },
        });

        // 5. Register settings tab
        this.settingsTab = new AgentSettingsTab(this.app, this);
        this.addSettingTab(this.settingsTab);

        // 6. Register deep-link protocol handlers:
        //    obsidian://vault-operator-settings?tab=advanced&sub=backup (new canonical)
        //    obsidian://obsilo-settings?...                              (legacy alias)
        const openSettingsFromParams = (params: Record<string, string>) => {
            const tab = params.tab;
            const sub = params.sub;
            if (tab) this.openSettingsAt(tab, sub);
        };
        this.registerObsidianProtocolHandler('vault-operator-settings', openSettingsFromParams);
        this.registerObsidianProtocolHandler('obsilo-settings', openSettingsFromParams);

        // Phase 2.3: command to open the setup wizard manually
        this.addCommand({
            id: 'open-setup-wizard',
            name: 'Open setup wizard',
            callback: async () => {
                const { FirstRunWizardModal } = await import('./ui/modals/FirstRunWizardModal');
                new FirstRunWizardModal(this.app, this).open();
            },
        });

        // Phase 2.3: the FirstRun wizard is opened by the sidebar's
        // showWelcomeMessage when no chat is active. That guarantees the
        // wizard appears once the sidebar is visible, never double-fires
        // with the legacy welcome card, and gives the user a deterministic
        // single entry point. The maybeAutoOpenSetupWizard helper remains
        // available for the command-palette trigger and as a future hook.

        // MCP Server (EPIC-014): Expose Vault Operator as MCP Server for Claude Desktop/Code
        if (this.settings.enableMcpServer) {
            const { McpBridge } = await import('./mcp/McpBridge');
            // FIX-23-01-01: Living-Document state for save_conversation.
            const { ActiveMcpSessions } = await import('./core/memory/ActiveMcpSessions');
            this.activeMcpSessions = new ActiveMcpSessions();
            // Eviction-Tick alle 5 Minuten -- entfernt abgelaufene
            // Sessions auch wenn keine MCP-Calls reinkommen.
            this.activeMcpSessionsEvictHandle = scheduleRecurring(() => {
                const removed = this.activeMcpSessions?.evictExpired() ?? 0;
                if (removed > 0) {
                    console.debug(`[ActiveMcpSessions] evicted ${removed} expired session(s)`);
                }
            }, 5 * 60 * 1000);

            // AUDIT-015 M-1: MCP Rate-Limiter, sliding window pro
            // (token, source_interface, rate-class). Cleanup alle 5 min.
            const { McpRateLimiter } = await import('./mcp/McpRateLimiter');
            this.mcpRateLimiter = new McpRateLimiter();
            this.mcpRateLimiterCleanupHandle = scheduleRecurring(() => {
                this.mcpRateLimiter?.cleanup();
            }, 5 * 60 * 1000);

            this.mcpBridge = new McpBridge(this);
            await this.mcpBridge.start().catch((e: unknown) =>
                console.warn('[Plugin] MCP Server start failed (non-fatal):', e)
            );
            // Remote relay (if configured)
            if (this.settings.enableRemoteRelay && this.settings.relayUrl) {
                this.mcpBridge.connectRelay();
            }
        }

        // ADR-063: Clean up orphaned externalization temp files from crashed sessions.
        // BUG-014 / FEATURE-1803: tmp files now live inside the vault.
        // FEATURE-0507: orphan sweeper honors the configurable agentFolderPath.
        const { ResultExternalizer } = await import('./core/tool-execution/ResultExternalizer');
        const { VaultDataFileAdapter } = await import('./core/storage/VaultDataFileAdapter');
        const { getTmpRoot } = await import('./core/utils/agentFolder');
        const vaultFs = new VaultDataFileAdapter(this.app.vault.adapter);
        void ResultExternalizer.cleanupOrphaned(vaultFs, getTmpRoot(this));

        console.debug('Vault Operator plugin loaded successfully');

        // v2.10.0: surface a one-shot warning if the pricing table has not
        // been verified for > 90 days. Manual reminder; provider rate
        // cards are not machine-readable so a scraper would be brittle.
        const { getPricingAgeWarning } = await import('./core/pricing/ModelPricing');
        const pricingWarn = getPricingAgeWarning();
        if (pricingWarn) console.warn(pricingWarn);

        // EPIC-26 / FEAT-26-04: open the one-shot migration notification
        // modal after the workspace is ready. Cleared from
        // pendingMigrationSummary on first display so it never re-opens.
        if (this.pendingMigrationSummary) {
            this.app.workspace.onLayoutReady(() => {
                void this.showPendingMigrationModal();
            });
        }
    }

    /**
     * EPIC-26 / FEAT-26-04: show the migration notification modal once
     * after a successful migration. No-op when no summary is pending.
     */
    private async showPendingMigrationModal(): Promise<void> {
        const summary = this.pendingMigrationSummary;
        if (!summary) return;
        // Clear immediately so re-entrancy never opens a second modal.
        this.pendingMigrationSummary = null;
        const { MigrationNotificationModal } = await import('./ui/settings/MigrationNotificationModal');
        new MigrationNotificationModal(this.app, summary, {
            onOpenSettings: () => this.openSettingsAt('agent', 'providers'),
            onDismiss: () => { /* nothing to do */ },
        }).open();
    }

    /**
     * Plugin cleanup
     */
    onunload(): void {
        console.debug('Unloading Vault Operator plugin');
        // Fire-and-forget async cleanup (Plugin API expects synchronous return)
        void (async () => {
            // Flush any pending chat-links before shutdown
            for (const convId of [...this.pendingChatLinks.keys()]) {
                await this.flushPendingChatLinks(convId).catch(() => {});
            }
            await this.mcpClient?.disconnectAll();
            // Stop background processes before closing DB
            this.semanticIndex?.cancelEnrichment();
            this.implicitConnectionService?.cancel();
            this.vaultHealthService?.cancel();
            // BA-25 listener cleanup
            this.autoTriggerObserver?.stop();
            this.stufe2ActivityTrigger?.stop();
            for (const off of this.frontmatterIndexerListeners) {
                try { off(); } catch { /* noop */ }
            }
            this.frontmatterIndexerListeners = [];
            if (this.stufe3IntervalHandle) {
                this.stufe3IntervalHandle.stop();
                this.stufe3IntervalHandle = null;
            }
            if (this.topHubBlockRegenTimer) {
                window.clearTimeout(this.topHubBlockRegenTimer);
                this.topHubBlockRegenTimer = null;
            }
            this.rerankerService?.unload();
            this.bundleLoader?.reset();
            this.mcpBridge?.stop();
            // Close databases (final save + cleanup)
            await this.memoryDB?.close().catch((e) =>
                console.warn('[Plugin] MemoryDB close failed (non-fatal):', e)
            );
            await this.knowledgeDB?.close().catch((e) =>
                console.warn('[Plugin] KnowledgeDB close failed (non-fatal):', e)
            );
        })();
        // Synchronous cleanup stays outside the IIFE
        this.pendingChatLinks.clear();
        this.vaultDNAScanner?.destroy();
        for (const timer of this.autoIndexDebounceTimers.values()) window.clearTimeout(timer);
        this.autoIndexDebounceTimers.clear();
        if (this.agingSchedulerHandle) {
            this.agingSchedulerHandle.stop();
            this.agingSchedulerHandle = null;
        }
        if (this.activeMcpSessionsEvictHandle) {
            this.activeMcpSessionsEvictHandle.stop();
            this.activeMcpSessionsEvictHandle = null;
        }
        if (this.mcpRateLimiterCleanupHandle) {
            this.mcpRateLimiterCleanupHandle.stop();
            this.mcpRateLimiterCleanupHandle = null;
        }
        this.sandboxExecutor?.destroy();
        this.ringBuffer?.uninstall();
        console.debug('Vault Operator plugin unloaded');
    }

    /**
     * Load plugin settings from disk
     */
    async loadSettings() {
        const saved = (await this.loadData()) ?? {};
        // FIX (Live-Bug 2026-05-04): deep-merge fuer Settings damit
        // neue Sub-Objekte (vaultIngest.topHubBlock, vaultIngest.stufe2Hint,
        // memory.crossSurface.strictSourceIsolation, etc.) bei Upgrade
        // aus aelteren Plugin-Versionen automatisch mit Defaults
        // gefuellt werden. Vorher: shallow Object.assign machte Sub-
        // Toggles wie "Enable top-hub block" nicht-funktional, weil
        // .topHubBlock im persistenten data.json fehlte und der UI-
        // Click `cfg.topHubBlock.privacyAcknowledged = v` mit
        // TypeError stillschweigend abbrach.
        this.settings = deepMergeSettings(
            DEFAULT_SETTINGS as unknown as Record<string, unknown>,
            saved as Record<string, unknown>,
        ) as unknown as ObsidianAgentSettings;

        // One-time migration: copy per-vault data to global storage (ADR-020)
        if (!saved._globalStorageMigrated && this.globalFs) {
            const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
            const migration = new GlobalMigrationService(this.globalFs, this.app.vault, pluginDir);
            const didMigrate = await migration.migrateIfNeeded(saved._globalStorageMigrated).catch((e) => {
                console.warn('[Plugin] Global storage migration failed (non-fatal):', e);
                return false;
            });
            if (didMigrate) {
                this.settings._globalStorageMigrated = true;
                await this.saveData({ ...saved, _globalStorageMigrated: true });
                // Write global settings.json immediately after migration
                if (this.globalSettingsService) {
                    await this.globalSettingsService.saveGlobal(this.settings);
                }
            }
        }

        // Merge global settings (cross-vault) — global keys override vault-local data.json
        if (this.globalSettingsService) {
            const globalSettings = await this.globalSettingsService.loadGlobal();
            if (Object.keys(globalSettings).length > 0) {
                this.settings = this.globalSettingsService.mergeIntoVault(this.settings, globalSettings);
            }
        }

        this.settings.activeModels = this.settings.activeModels ?? [];
        // Migrate: Gemini models from provider 'custom' to dedicated 'gemini' provider (ADR-064)
        for (const m of this.settings.activeModels) {
            if (m.provider === 'custom' && /^gemini-/i.test(m.name) && isGeminiApiUrl(m.baseUrl)) {
                m.provider = 'gemini';
                m.baseUrl = undefined;
            }
        }
        this.settings.webTools = this.settings.webTools ?? DEFAULT_SETTINGS.webTools;

        // Decrypt API keys if they were stored encrypted (ADR-019)
        this.decryptSettings(this.settings);

        // Initialize GitHub Copilot auth service with persisted tokens (ADR-037)
        const copilotAuth = GitHubCopilotAuthService.getInstance();
        copilotAuth.loadFromSettings(this.settings);
        copilotAuth.setSaveCallback(async () => {
            copilotAuth.saveToSettings(this.settings);
            await this.saveData(this.encryptSettingsForSave(this.settings));
        });

        // Initialize Kilo Gateway auth service with persisted session (ADR-041)
        const kiloAuth = KiloAuthService.getInstance();
        kiloAuth.loadFromSettings(this.settings);
        kiloAuth.setSaveCallback(async () => {
            kiloAuth.saveToSettings(this.settings);
            await this.saveData(this.encryptSettingsForSave(this.settings));
        });

        // Initialize ChatGPT OAuth service with persisted tokens (ADR-088, ADR-089)
        const chatgptAuth = ChatGptOAuthService.getInstance();
        chatgptAuth.loadFromSettings(this.settings);
        chatgptAuth.setSaveCallback(async () => {
            chatgptAuth.saveToSettings(this.settings);
            await this.saveData(this.encryptSettingsForSave(this.settings));
        });

        // Migrate old mode slugs to new built-in mode slugs (Phase 3.1)
        const OLD_MODE_MAP: Record<string, string> = { librarian: 'ask', writer: 'agent', orchestrator: 'agent', researcher: 'ask', curator: 'agent', architect: 'agent' };
        if (OLD_MODE_MAP[this.settings.currentMode]) {
            this.settings.currentMode = OLD_MODE_MAP[this.settings.currentMode];
        }
        // Migrate source: 'custom' → 'vault' (introduced in Phase 3.1+)
        this.settings.globalCustomInstructions = this.settings.globalCustomInstructions ?? '';
        this.settings.modeModelKeys = this.settings.modeModelKeys ?? {};
        for (const mode of this.settings.customModes) {
            if ((mode.source as string) === 'custom') {
                mode.source = 'vault';
            }
        }
        // Migrate: global temperature override removed — temperature is now per-model on CustomModel
        const advApi = this.settings.advancedApi as unknown as Record<string, unknown>;
        if ('useCustomTemperature' in advApi) delete advApi['useCustomTemperature'];
        if ('temperature' in advApi) delete advApi['temperature'];
        // Migrate: autoApproval.write split into noteEdits + vaultChanges
        const ap = this.settings.autoApproval as unknown as Record<string, unknown>;
        if (ap['write'] !== undefined) {
            const writeVal = ap['write'] as boolean;
            if (ap['noteEdits'] === undefined || ap['noteEdits'] === false) ap['noteEdits'] = writeVal;
            if (ap['vaultChanges'] === undefined || ap['vaultChanges'] === false) ap['vaultChanges'] = writeVal;
            delete ap['write'];
        }
        // Ensure new fields exist for users upgrading from older versions
        ap.noteEdits = ap.noteEdits ?? false;
        ap.vaultChanges = ap.vaultChanges ?? false;
        ap.skills = ap.skills ?? false;
        // Deep-merge autoApproval: new keys from DEFAULT_SETTINGS are applied
        // so the UI always reflects the actual effective value (WYSIWYG).
        const apDefaults = DEFAULT_SETTINGS.autoApproval;
        for (const key of Object.keys(apDefaults) as Array<keyof typeof apDefaults>) {
            if (ap[key] === undefined) {
                ap[key] = apDefaults[key];
            }
        }
        // Migrate: chatHistoryFolder → enableChatHistory
        const sMigrate = this.settings as unknown as Record<string, unknown>;
        if (sMigrate['chatHistoryFolder'] && this.settings.enableChatHistory === undefined) {
            this.settings.enableChatHistory = true;
        }
        this.settings.enableChatHistory = this.settings.enableChatHistory ?? true;
        // Deep-merge memory settings so upgrading users get new fields with defaults
        const memDefaults = DEFAULT_SETTINGS.memory;
        this.settings.memory = this.settings.memory ?? memDefaults;
        this.settings.memory.enabled = this.settings.memory.enabled ?? memDefaults.enabled;
        this.settings.memory.autoExtractSessions = this.settings.memory.autoExtractSessions ?? memDefaults.autoExtractSessions;
        this.settings.memory.memoryModelKey = this.settings.memory.memoryModelKey ?? memDefaults.memoryModelKey;
        this.settings.memory.extractionThreshold = this.settings.memory.extractionThreshold ?? memDefaults.extractionThreshold;

        // Deep-merge chat-linking settings (ADR-022)
        const clDefaults = DEFAULT_SETTINGS.chatLinking;
        this.settings.chatLinking = this.settings.chatLinking ?? clDefaults;
        this.settings.chatLinking.enabled = this.settings.chatLinking.enabled ?? clDefaults.enabled;
        this.settings.chatLinking.titlingModelKey = this.settings.chatLinking.titlingModelKey ?? clDefaults.titlingModelKey;

        // Seed / update built-in default prompts (preserves user enabled state)
        this.settings.customPrompts = mergeDefaultPrompts(this.settings.customPrompts ?? []);

        // Sync vault mode overrides with current built-in definitions.
        // Vault modes that share a slug with a built-in get their roleDefinition,
        // toolGroups, description, and whenToUse updated — customInstructions preserved.
        this.migrateBuiltInModeOverrides();

        // Deep-merge onboarding settings
        const obDefaults = DEFAULT_SETTINGS.onboarding;
        this.settings.onboarding = this.settings.onboarding ?? obDefaults;
        this.settings.onboarding.completed = this.settings.onboarding.completed ?? obDefaults.completed;
        this.settings.onboarding.currentStep = this.settings.onboarding.currentStep ?? obDefaults.currentStep;
        this.settings.onboarding.skippedSteps = this.settings.onboarding.skippedSteps ?? obDefaults.skippedSteps;
        this.settings.onboarding.startedAt = this.settings.onboarding.startedAt ?? obDefaults.startedAt;

        // Deep-merge VaultDNA settings (PAS-1)
        const dnaDefaults = DEFAULT_SETTINGS.vaultDNA;
        this.settings.vaultDNA = this.settings.vaultDNA ?? dnaDefaults;
        this.settings.vaultDNA.enabled = this.settings.vaultDNA.enabled ?? dnaDefaults.enabled;
        this.settings.vaultDNA.skillToggles = this.settings.vaultDNA.skillToggles ?? dnaDefaults.skillToggles;
        this.settings.vaultDNA.lastScanAt = this.settings.vaultDNA.lastScanAt ?? dnaDefaults.lastScanAt;

        // Deep-merge Mastery settings (ADR-016/017/018)
        const masteryDefaults = DEFAULT_SETTINGS.mastery;
        this.settings.mastery = this.settings.mastery ?? masteryDefaults;
        this.settings.mastery.enabled = this.settings.mastery.enabled ?? masteryDefaults.enabled;
        this.settings.mastery.recipeBudget = this.settings.mastery.recipeBudget ?? masteryDefaults.recipeBudget;
        // Force-enable learned recipes — no UI toggle exists yet (FIX-10), early installs had false
        this.settings.mastery.learnedRecipesEnabled = true;
        this.settings.mastery.recipeToggles = this.settings.mastery.recipeToggles ?? masteryDefaults.recipeToggles;

        // Enable recipes for existing users — 6 other security layers remain active.
        if (this.settings.recipes && !this.settings.recipes.enabled) {
            this.settings.recipes.enabled = true;
            void this.saveData(this.encryptSettingsForSave(this.settings));
        }

        // Seed built-in MCP servers (EPIC-011: design asset integration)
        this.settings.mcpServers = this.settings.mcpServers ?? {};
        for (const [name, config] of Object.entries(BUILTIN_MCP_SERVERS)) {
            const existing = this.settings.mcpServers[name];
            if (!existing) {
                this.settings.mcpServers[name] = { ...config };
            } else if (existing.isBuiltIn && existing.type !== config.type) {
                // Update transport type if it changed (e.g. SSE -> streamable-http)
                existing.type = config.type;
                existing.url = config.url;
            }
        }
        // Remove stale built-in servers no longer shipped with the plugin
        for (const [name, config] of Object.entries(this.settings.mcpServers)) {
            if (config.isBuiltIn && !BUILTIN_MCP_SERVERS[name]) {
                delete this.settings.mcpServers[name];
            }
        }

        // Migrate auto-approval: ensure newer keys have sensible defaults
        {
            const ap = this.settings.autoApproval;
            let changed = false;
            // pluginApiRead: may be missing in older data.json — default true
            if (ap.pluginApiRead === undefined) {
                ap.pluginApiRead = true;
                changed = true;
            }
            if (changed) void this.saveData(this.encryptSettingsForSave(this.settings));
        }

        // Migration: remove old hardcoded modeToolOverrides.agent default.
        // Empty object means "use all tools from mode's toolGroups" (new default).
        if (this.settings.modeToolOverrides?.agent && this.settings.modeToolOverrides.agent.length > 20) {
            delete this.settings.modeToolOverrides.agent;
            void this.saveData(this.encryptSettingsForSave(this.settings));
        }

        // One-time migration: encrypt existing plaintext API keys (ADR-019)
        if (this.safeStorage.isAvailable() && !saved._encrypted) {
            const hasKeys = (this.settings.activeModels ?? []).some(m => !!m.apiKey) ||
                (this.settings.embeddingModels ?? []).some(m => !!m.apiKey) ||
                !!this.settings.webTools?.braveApiKey ||
                !!this.settings.webTools?.tavilyApiKey;
            if (hasKeys) {
                console.debug('[Plugin] Migrating API keys to encrypted storage (safeStorage)');
            }
            await this.saveData(this.encryptSettingsForSave(this.settings));
        }
    }

    /**
     * Sync vault custom modes that override a built-in slug.
     * Copies roleDefinition, toolGroups, description, whenToUse from built-in;
     * preserves user customInstructions.
     */
    private migrateBuiltInModeOverrides(): void {
        const builtInBySlug = new Map(BUILT_IN_MODES.map(m => [m.slug, m]));
        let changed = false;

        for (const vm of this.settings.customModes) {
            const bi = builtInBySlug.get(vm.slug);
            if (!bi) continue;

            const needsSync =
                vm.roleDefinition !== bi.roleDefinition ||
                JSON.stringify(vm.toolGroups) !== JSON.stringify(bi.toolGroups);

            if (needsSync) {
                vm.roleDefinition = bi.roleDefinition;
                vm.toolGroups = [...bi.toolGroups];
                vm.description = bi.description;
                vm.whenToUse = bi.whenToUse;
                changed = true;
            }
        }

        if (changed) {
            console.debug('[Plugin] Synced vault mode overrides with built-in definitions');
            void this.saveData(this.encryptSettingsForSave(this.settings));
        }
    }

    /** Return the currently active CustomModel, or null if none configured or disabled */
    getActiveModel(): CustomModel | null {
        const key = this.settings.activeModelKey;
        if (!key) return null;
        const model = this.settings.activeModels.find((m) => getModelKey(m) === key);
        if (!model || !model.enabled) return null;

        // M-6: One-time privacy notice when using a cloud provider
        if (!this.cloudProviderWarningShown) {
            const cloudProviders = ['anthropic', 'openai', 'openrouter', 'azure'];
            if (cloudProviders.includes(model.provider)) {
                this.cloudProviderWarningShown = true;
                console.debug(
                    `[Agent] Cloud provider "${model.provider}" selected. ` +
                    'Vault content sent to the agent will be transmitted to external servers. ' +
                    'For privacy-sensitive vaults, consider using a local provider (ollama, lmstudio).',
                );
            }
        }

        return model;
    }

    /** Return the memory extraction CustomModel, or null if none configured or disabled */
    getMemoryModel(): CustomModel | null {
        const key = this.settings.memory.memoryModelKey;
        if (!key) return null;
        const model = this.settings.activeModels.find((m) => getModelKey(m) === key);
        if (!model || !model.enabled) return null;
        return model;
    }

    /**
     * FEAT-24-07 / ADR-115 (extended by EPIC-26 / ADR-120):
     * return the helper-model CustomModel for agent-internal LLM
     * calls (condensing, fast-path planner/presenter, plan_presentation,
     * recipe-promotion), or null if none.
     *
     * Resolution order:
     *  1. Explicit `helperModelKey` setting (legacy, wins for backwards
     *     compatibility).
     *  2. Active provider's `tierMapping.fast` slot (EPIC-26 path).
     *  3. null (caller falls back to main model).
     */
    getHelperModel(): CustomModel | null {
        const key = this.settings.helperModelKey;
        if (key) {
            const model = this.settings.activeModels.find((m) => getModelKey(m) === key);
            if (model && model.enabled) return model;
        }
        // EPIC-26 fallback: active provider's fast tier.
        return this.getTierModel('fast');
    }

    /**
     * EPIC-26 / ADR-122: return the currently active provider config,
     * or null when no provider was selected yet (pre-migration / fresh
     * install). Pure logic lives in
     * `src/core/routing/tierResolution.ts` so it stays unit-testable
     * without booting the full plugin shell.
     */
    getActiveProvider(): ProviderConfig | null {
        return resolveActiveProvider(this.settings);
    }

    /**
     * EPIC-26 / ADR-120: resolve a tier slot (fast / mid / flagship) on
     * the active provider into a concrete CustomModel ready to feed the
     * API handler layer. Cascade: tierOverrides[tier] -> tierMapping[tier]
     * -> next lower tier. Returns null when nothing in the cascade is
     * populated.
     */
    getTierModel(tier: ModelTier): CustomModel | null {
        return resolveTierModel(this.settings, tier);
    }

    /**
     * EPIC-26 / ADR-120: convenience wrapper for the consult_flagship
     * tool. Returns the flagship-tier model on the active provider, or
     * null when no flagship slot is filled (does NOT cascade down).
     */
    getAdvisorModel(): CustomModel | null {
        return resolveAdvisorModel(this.settings);
    }

    /** Return the active embedding CustomModel, or null if none configured or disabled */
    getActiveEmbeddingModel(): CustomModel | null {
        const key = this.settings.activeEmbeddingModelKey;
        if (!key) return null;
        const model = this.settings.embeddingModels.find((m) => getModelKey(m) === key);
        if (!model || !model.enabled) return null;
        return model;
    }

    /**
     * Decrypt all API keys in settings after loading from disk (ADR-019).
     * Only operates when `_encrypted` is true. Modifies settings in place.
     */
    private decryptSettings(settings: ObsidianAgentSettings): void {
        if (!settings._encrypted) return;
        for (const model of settings.activeModels ?? []) {
            if (model.apiKey) model.apiKey = this.safeStorage.decrypt(model.apiKey);
        }
        for (const model of settings.embeddingModels ?? []) {
            if (model.apiKey) model.apiKey = this.safeStorage.decrypt(model.apiKey);
        }
        // AUDIT-027 H-1 mirror: decrypt per-provider credentials so the
        // in-memory settings carry plaintext for the API handler layer.
        decryptProviderCredentialsInPlace(settings, this.safeStorage);
        if (settings.webTools) {
            if (settings.webTools.braveApiKey) {
                settings.webTools.braveApiKey = this.safeStorage.decrypt(settings.webTools.braveApiKey);
            }
            if (settings.webTools.tavilyApiKey) {
                settings.webTools.tavilyApiKey = this.safeStorage.decrypt(settings.webTools.tavilyApiKey);
            }
        }
        // GitHub Copilot tokens (ADR-038)
        if (settings.githubCopilotAccessToken) {
            settings.githubCopilotAccessToken = this.safeStorage.decrypt(settings.githubCopilotAccessToken);
        }
        if (settings.githubCopilotToken) {
            settings.githubCopilotToken = this.safeStorage.decrypt(settings.githubCopilotToken);
        }
        // Kilo Gateway token (ADR-041)
        if (settings.kiloToken) {
            settings.kiloToken = this.safeStorage.decrypt(settings.kiloToken);
        }
        // ChatGPT OAuth tokens (ADR-088)
        if (settings.chatgptOAuthAccessToken) {
            settings.chatgptOAuthAccessToken = this.safeStorage.decrypt(settings.chatgptOAuthAccessToken);
        }
        if (settings.chatgptOAuthRefreshToken) {
            settings.chatgptOAuthRefreshToken = this.safeStorage.decrypt(settings.chatgptOAuthRefreshToken);
        }
        if (settings.chatgptOAuthIdToken) {
            settings.chatgptOAuthIdToken = this.safeStorage.decrypt(settings.chatgptOAuthIdToken);
        }
        // Remote relay tokens (AUDIT-005 M-2)
        if (settings.cloudflareApiToken) {
            settings.cloudflareApiToken = this.safeStorage.decrypt(settings.cloudflareApiToken);
        }
        if (settings.relayToken) {
            settings.relayToken = this.safeStorage.decrypt(settings.relayToken);
        }
        // Local MCP server token (AUDIT-006 H-1)
        if (settings.mcpServerToken) {
            settings.mcpServerToken = this.safeStorage.decrypt(settings.mcpServerToken);
        }
    }

    /**
     * Return a deep copy of settings with all API keys encrypted (ADR-019).
     * The original settings object is NOT modified (in-memory stays plaintext).
     * When safeStorage is unavailable, returns unencrypted copy with `_encrypted = false`.
     */
    private encryptSettingsForSave(settings: ObsidianAgentSettings): ObsidianAgentSettings {
        const copy = JSON.parse(JSON.stringify(settings)) as ObsidianAgentSettings;
        if (!this.safeStorage.isAvailable()) {
            copy._encrypted = false;
            return copy;
        }
        for (const model of copy.activeModels ?? []) {
            if (model.apiKey && !this.safeStorage.isEncrypted(model.apiKey)) {
                model.apiKey = this.safeStorage.encrypt(model.apiKey);
            }
        }
        for (const model of copy.embeddingModels ?? []) {
            if (model.apiKey && !this.safeStorage.isEncrypted(model.apiKey)) {
                model.apiKey = this.safeStorage.encrypt(model.apiKey);
            }
        }
        // AUDIT-027 H-1: per-provider credentials in the EPIC-26
        // providerConfigs[] array + the legacy_active_models_backup
        // snapshot must be encrypted on the same pass; otherwise the
        // migration would write plaintext API keys + AWS credentials
        // into data.json (CWE-312). Pure walker lives in
        // src/core/security/providerCredentialCrypto.ts.
        encryptProviderCredentialsInPlace(copy, this.safeStorage);
        if (copy.webTools) {
            if (copy.webTools.braveApiKey && !this.safeStorage.isEncrypted(copy.webTools.braveApiKey)) {
                copy.webTools.braveApiKey = this.safeStorage.encrypt(copy.webTools.braveApiKey);
            }
            if (copy.webTools.tavilyApiKey && !this.safeStorage.isEncrypted(copy.webTools.tavilyApiKey)) {
                copy.webTools.tavilyApiKey = this.safeStorage.encrypt(copy.webTools.tavilyApiKey);
            }
        }
        // GitHub Copilot tokens (ADR-038)
        if (copy.githubCopilotAccessToken && !this.safeStorage.isEncrypted(copy.githubCopilotAccessToken)) {
            copy.githubCopilotAccessToken = this.safeStorage.encrypt(copy.githubCopilotAccessToken);
        }
        if (copy.githubCopilotToken && !this.safeStorage.isEncrypted(copy.githubCopilotToken)) {
            copy.githubCopilotToken = this.safeStorage.encrypt(copy.githubCopilotToken);
        }
        // Kilo Gateway token (ADR-041)
        if (copy.kiloToken && !this.safeStorage.isEncrypted(copy.kiloToken)) {
            copy.kiloToken = this.safeStorage.encrypt(copy.kiloToken);
        }
        // ChatGPT OAuth tokens (ADR-088)
        if (copy.chatgptOAuthAccessToken && !this.safeStorage.isEncrypted(copy.chatgptOAuthAccessToken)) {
            copy.chatgptOAuthAccessToken = this.safeStorage.encrypt(copy.chatgptOAuthAccessToken);
        }
        if (copy.chatgptOAuthRefreshToken && !this.safeStorage.isEncrypted(copy.chatgptOAuthRefreshToken)) {
            copy.chatgptOAuthRefreshToken = this.safeStorage.encrypt(copy.chatgptOAuthRefreshToken);
        }
        if (copy.chatgptOAuthIdToken && !this.safeStorage.isEncrypted(copy.chatgptOAuthIdToken)) {
            copy.chatgptOAuthIdToken = this.safeStorage.encrypt(copy.chatgptOAuthIdToken);
        }
        // Remote relay tokens (AUDIT-005 M-2)
        if (copy.cloudflareApiToken && !this.safeStorage.isEncrypted(copy.cloudflareApiToken)) {
            copy.cloudflareApiToken = this.safeStorage.encrypt(copy.cloudflareApiToken);
        }
        if (copy.relayToken && !this.safeStorage.isEncrypted(copy.relayToken)) {
            copy.relayToken = this.safeStorage.encrypt(copy.relayToken);
        }
        // Local MCP server token (AUDIT-006 H-1)
        if (copy.mcpServerToken && !this.safeStorage.isEncrypted(copy.mcpServerToken)) {
            copy.mcpServerToken = this.safeStorage.encrypt(copy.mcpServerToken);
        }
        copy._encrypted = true;
        return copy;
    }

    /**
     * Save plugin settings to disk and reinitialize API handler
     */
    async saveSettings() {
        await this.saveData(this.encryptSettingsForSave(this.settings));
        // Dual-write: persist global keys to ~/.obsidian-agent/settings.json
        if (this.globalSettingsService) {
            await this.globalSettingsService.saveGlobal(this.settings);
        }
        this.initApiHandler();
    }

    /** Reconnect all MCP servers from current settings. Called when MCP config changes. */
    async reconnectMcp(): Promise<void> {
        await this.mcpClient.disconnectAll();
        if (Object.keys(this.settings.mcpServers ?? {}).length > 0) {
            await this.mcpClient.connectAll(this.settings.mcpServers);
        }
    }

    /**
     * Initialize the API handler from current settings.
     * Called on load and whenever settings change.
     */
    initApiHandler(): void {
        // EPIC-26 / ADR-115 amendment / ADR-120: try the active provider's
        // configured tier slot first. The default tier is `mid` (Advisor-
        // Pattern Hauptloop), with `flagship` as the rollback escape hatch
        // for H-01 validation. Pre-migration installs (`activeProviderId`
        // null or no provider config) fall back to the legacy
        // `getActiveModel()` path so nothing breaks before Welle 2 runs.
        const defaultTier = this.settings.defaultMainModelTier ?? 'mid';
        const tierModel = this.getTierModel(defaultTier);
        const model = tierModel ?? this.getActiveModel();

        if (!model) {
            if (this.settings.debugMode) {
                console.debug('[Plugin] No active model configured');
            }
            this.apiHandler = null;
            return;
        }

        // Require API key for cloud providers
        if ((model.provider === 'anthropic' || model.provider === 'openai' || model.provider === 'openrouter' || model.provider === 'azure') && !model.apiKey) {
            if (this.settings.debugMode) {
                console.debug('[Plugin] API key not set for active model:', getModelKey(model));
            }
            this.apiHandler = null;
            return;
        }

        try {
            this.apiHandler = buildApiHandler(modelToLLMProvider(model));
            console.debug(`[Plugin] API handler initialized: ${model.displayName ?? model.name} (${model.provider})`);

            // Pre-warm the DNS + TLS connection so the FIRST user message isn't
            // delayed by cold-start network setup (~5-18 s on some systems /
            // networks). One-shot; helper lives in src/api/warmup.ts.
            if (!this.warmupFired) {
                this.warmupFired = true;
                preWarmProviderConnection(model.provider, model.baseUrl);
            }
        } catch (error) {
            console.error('[Plugin] Failed to initialize API handler:', error);
            this.apiHandler = null;
        }
    }

    /**
     * Activate the agent sidebar view
     */
    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);

        // Cleanup: detach duplicate leaves (keep only the first one in the right sidebar)
        if (leaves.length > 1) {
            for (let i = 1; i < leaves.length; i++) {
                leaves[i].detach();
            }
        }

        if (leaves.length > 0) {
            const existing = leaves[0];
            // If the leaf ended up in the wrong sidebar (e.g. left), migrate it to the right
            const rightSplit = workspace.rightSplit;
            const isInRight = rightSplit && existing.getRoot() === rightSplit;
            if (isInRight) {
                leaf = existing;
            } else {
                // Detach from wrong location and recreate in right sidebar
                existing.detach();
                leaf = workspace.getRightLeaf(false);
                if (leaf) {
                    await leaf.setViewState({
                        type: VIEW_TYPE_AGENT_SIDEBAR,
                        active: true,
                    });
                }
            }
        } else {
            // Create new leaf in right sidebar
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE_AGENT_SIDEBAR,
                    active: true,
                });
            }
        }

        // Reveal the view and set sidebar width to 30% of window
        if (leaf) {
            void workspace.revealLeaf(leaf);

            const rightSplit = workspace.rightSplit;
            if (rightSplit && typeof rightSplit.setSize === 'function') {
                const targetWidth = Math.round(window.innerWidth * 0.30);
                rightSplit.setSize(targetWidth);
            }
        }
    }

    /**
     * Snapshot the active sidebar conversation for the memory pipeline.
     * Manual extraction paths (mark_for_memory tool, Star button) call this
     * to find out what to enqueue. Returns null when no sidebar leaf exists
     * or the active conversation has no messages.
     */
    snapshotActiveConversationForMemory(): ReturnType<AgentSidebarView['snapshotForMemory']> | null {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
        if (leaves.length === 0) return null;
        const view = leaves[0].view as AgentSidebarView;
        return view.snapshotForMemory?.() ?? null;
    }

    /**
     * Command-palette / hotkey entry for the manual save-to-memory flow.
     * Same pipeline as the Star button + chat input "..." menu, just
     * reachable via Cmd+Shift+M (when the user binds it).
     */
    async saveActiveConversationToMemory(): Promise<void> {
        if (!this.settings.memory.enabled) {
            new Notice('Memory is disabled. Enable it in settings.');
            return;
        }
        const queue = this.extractionQueue;
        const snapshot = this.snapshotActiveConversationForMemory();
        if (!queue || !snapshot) {
            new Notice('No active conversation to save.');
            return;
        }
        try {
            await queue.enqueueImmediate(snapshot);
            new Notice('Conversation queued for memory extraction.');
        } catch (e) {
            console.warn('[Memory] Hotkey save failed:', e);
            new Notice('Saving the conversation failed. See console for details.');
        }
    }

    /**
     * Daily aging sweep (FEATURE-0319 Phase 5). Idempotent within 24h
     * via settings.memory.lastAgingRunAt. Records a telemetry event on
     * each non-skipped run.
     */
    async runAgingSweep(force = false): Promise<void> {
        if (!this.memoryDB?.isOpen()) return;
        const { AgingService } = await import('./core/memory/AgingService');
        const service = new AgingService(this.memoryDB);
        const report = service.runAgingCycle({
            force,
            lastRunAt: this.settings.memory.lastAgingRunAt ?? null,
        });
        if (report.skipped) {
            console.debug(`[Plugin] Aging skipped: ${report.skippedReason}`);
            return;
        }
        this.settings.memory.lastAgingRunAt = report.timestamp;
        await this.saveSettings();
        await this.memoryDB.save().catch(() => undefined);
        console.debug(
            `[Plugin] Aging sweep: ${report.factsUpdated}/${report.factsProcessed} facts updated ` +
            `(by kind: identity=${report.byKind.identity}, fact=${report.byKind.fact}, ` +
            `event=${report.byKind.event}, preference=${report.byKind.preference})`,
        );
        await this.memoryV2Telemetry?.aging({
            factsProcessed: report.factsProcessed,
            factsUpdated: report.factsUpdated,
            skipped: false,
        });
    }

    /**
     * Phase 6 -> 7 soak: build a SoakReport and show it in a modal where
     * the user can copy/save. The previous "copy on command" path failed
     * silently when the active leaf wasn't focused (clipboard API rejects
     * but we'd already shown the success Notice). Modal-based copy uses
     * a real user gesture, with a save-to-vault fallback.
     */
    /**
     * FEAT-19-10: One-Shot Backfill-Job ueber den Vault. Default folder
     * = ganzer Vault, optional via Settings.vaultIngest.autoTrigger.propertyName
     * begrenzbar. Progress als Notice alle 50 Notes.
     */
    async runFrontmatterBackfill(): Promise<void> {
        if (!this.noteSummaryStore || !this.frontmatterPropertyStore) {
            new Notice('Stores not initialized. Reload the plugin?');
            return;
        }
        const cfg = this.settings.vaultIngest ?? DEFAULT_VAULT_INGEST_SETTINGS;
        const summaryGenerator = cfg.autoSummary.enabled
            ? buildSummaryGenerator({
                promptTemplate: cfg.summaryPrompt.template,
                apiHandlerFactory: () => {
                    const m = this.getMemoryModel();
                    return m ? buildApiHandlerForModel(m) : null;
                },
            })
            : null;
        // semanticStorageLocation ist die kanonische Storage-Mode-Setting fuer
        // knowledge.db (siehe FEATURE-1508). Map fuer FrontmatterWriter.
        const storageMode = (this.settings.semanticStorageLocation ?? 'global');
        const job = new FrontmatterBackfillJob(
            this.app,
            this.noteSummaryStore,
            this.frontmatterPropertyStore,
            { storageMode },
            summaryGenerator,
        );
        new Notice('Backfill started. See progress in the console.', 5000);
        const result = await job.run({}, (progress) => {
            if (progress.processed % 50 === 0 && progress.processed > 0) {
                new Notice(`Backfill: ${progress.processed}/${progress.total} (${progress.summariesWritten} Summaries, ${progress.errors} Fehler)`, 4000);
            }
        });
        new Notice(`Backfill fertig: ${result.processed} Notes, ${result.summariesWritten} Summaries, ${result.propertiesWritten} Property-Mirrors, ${result.errors} Fehler.`, 10000);
    }

    /**
     * FEAT-19-15: Inbox-Workflow. Iteriert ueber alle Markdown-Dateien
     * mit konfigurierter Auto-Trigger-Property und ruft das ingest_triage-Tool
     * fuer jede neu (idempotent ueber Triage-Log).
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- async kept for symmetry with future LLM-backed triage decision flow
    async runInboxTriage(): Promise<void> {
        const cfg = this.settings.vaultIngest ?? DEFAULT_VAULT_INGEST_SETTINGS;
        if (!cfg.autoTrigger.propertyName) {
            new Notice('Inbox triage: configure an auto-trigger property in settings first.');
            return;
        }
        const expectedValues = Array.isArray(cfg.autoTrigger.propertyValue)
            ? cfg.autoTrigger.propertyValue
            : [cfg.autoTrigger.propertyValue];

        const candidates: TFile[] = [];
        for (const f of this.app.vault.getMarkdownFiles()) {
            const cache = this.app.metadataCache.getFileCache(f);
            const v = cache?.frontmatter?.[cfg.autoTrigger.propertyName];
            if (v === null || v === undefined) continue;
            const valueStrs = Array.isArray(v) ? v.map(String) : [String(v)];
            if (valueStrs.some((vs) => expectedValues.includes(vs))) {
                candidates.push(f);
            }
        }
        if (candidates.length === 0) {
            const valueStr = Array.isArray(cfg.autoTrigger.propertyValue) ? cfg.autoTrigger.propertyValue.join(',') : cfg.autoTrigger.propertyValue;
            new Notice(`Inbox-Triage: keine Notes mit ${cfg.autoTrigger.propertyName}=${valueStr} gefunden.`);
            return;
        }
        new Notice(`Inbox-Triage: ${candidates.length} Kandidaten, log via Konsole.`, 6000);
        let triaged = 0;
        for (const file of candidates) {
            const sourceUri = `vault://${file.path}`;
            if (this.ingestTriageLogStore?.exists(sourceUri)) continue;
            this.ingestTriageLogStore?.record(sourceUri, 'pending');
            triaged++;
            console.debug(`[BA-25 Inbox-Triage] queued ${file.path}`);
        }
        new Notice(`Inbox-Triage: ${triaged} neue Pending-Eintraege erfasst.`);
    }

    /**
     * FEAT-19-11: MOC-Auto-Pflege manuell triggern. Ueber alle Notes mit
     * dem Marker-Block iterieren und Body neu generieren (Hub-Status,
     * Implicit-Connection-Vorschlaege, Cluster-Statistik). Helper-API
     * via MOCMaintainer.findAutoBlock/replaceOrInsertAutoBlock.
     */
    async refreshAllMOCs(): Promise<void> {
        const { findAutoBlock, replaceOrInsertAutoBlock } = await import('./core/ingest/MOCMaintainer');
        const allFiles = this.app.vault.getMarkdownFiles();
        let touched = 0;
        let skippedUserModified = 0;
        for (const file of allFiles) {
            const content = await this.app.vault.read(file);
            const block = findAutoBlock(content, 'moc-header');
            if (!block) continue; // No marker = not a MOC under management
            const newBody = await this.buildMOCAutoBody(file.path);
            const result = replaceOrInsertAutoBlock(content, newBody, { blockId: 'moc-header' });
            if (result.skippedReason === 'user-modified') { skippedUserModified++; continue; }
            if (result.written && result.newContent) {
                await this.app.vault.modify(file, result.newContent);
                touched++;
            }
        }
        new Notice(`MOC-Pflege: ${touched} aktualisiert, ${skippedUserModified} wegen User-Edit uebersprungen.`);
    }

    /**
     * FEAT-03-26 Lifecycle: regen Top-Hub-Block nach Ontology-Change.
     * Debounced auf 60s damit Burst-Edits einen einzigen Regen-Pass
     * ergeben. generateIfNeeded vergleicht Hash und respektiert
     * Cooldown (24h Default), neue Hubs schlagen aber sofort durch.
     */
    scheduleTopHubBlockRegen(): void {
        if (!this.settings.vaultIngest?.topHubBlock?.enabled) return;
        if (!this.topHubBlockGenerator) return;
        if (this.topHubBlockRegenTimer) window.clearTimeout(this.topHubBlockRegenTimer);
        this.topHubBlockRegenTimer = window.setTimeout(() => {
            this.topHubBlockRegenTimer = null;
            if (!this.topHubBlockGenerator) return;
            const result = this.topHubBlockGenerator.generateIfNeeded(this.topHubBlockState);
            if (result) {
                this.topHubBlockState = result.state;
                this.topHubBlockMarkdown = result.block;
                console.debug('[BA-25] TopHubBlock regenerated after ontology change');
            }
        }, 60_000);
    }

    /**
     * FEAT-19-11: Injects the obsilo:auto-start/end Marker into MOC-Kandidaten,
     * die noch keinen Marker-Block tragen. Kandidat = Markdown-File dessen
     * Basename als Cluster im ClusterMetadataStore oder in der Ontologie
     * auftaucht. Idempotent: Files mit bereits vorhandenem Marker werden
     * uebersprungen.
     */
    async injectInitialMOCMarkers(): Promise<void> {
        const { findAutoBlock, replaceOrInsertAutoBlock } = await import('./core/ingest/MOCMaintainer');
        if (!this.knowledgeDB?.isOpen()) {
            new Notice('Knowledge database not available.');
            return;
        }
        const knownClusters = new Set<string>();
        if (this.clusterMetadataStore) {
            for (const m of this.clusterMetadataStore.getAll()) knownClusters.add(m.cluster);
        }
        try {
            const db = this.knowledgeDB.getDB();
            const r = db.exec('SELECT DISTINCT cluster FROM ontology WHERE cluster IS NOT NULL');
            if (r.length && r[0].values.length) {
                for (const row of r[0].values) {
                    const c = row[0] as string | null;
                    if (c) knownClusters.add(c);
                }
            }
        } catch (e) {
            console.debug('[BA-25] ontology cluster lookup failed:', e);
        }
        if (knownClusters.size === 0) {
            new Notice('No clusters known. Build the ontology first.');
            return;
        }

        const allFiles = this.app.vault.getMarkdownFiles();
        let injected = 0;
        let skipped = 0;
        for (const file of allFiles) {
            const basename = file.basename;
            if (!knownClusters.has(basename)) continue;
            const content = await this.app.vault.read(file);
            if (findAutoBlock(content, 'moc-header')) { skipped++; continue; }
            const newBody = await this.buildMOCAutoBody(file.path);
            const result = replaceOrInsertAutoBlock(content, newBody, {
                blockId: 'moc-header',
                position: 'after-frontmatter',
            });
            if (result.written && result.newContent) {
                await this.app.vault.modify(file, result.newContent);
                injected++;
            }
        }
        new Notice(`MOC-Marker-Injection: ${injected} eingefuegt, ${skipped} bereits markiert.`);
    }

    /** Hilfs-Renderer fuer MOC-Auto-Body (Hub-Status + Cluster-Statistik). */
    // eslint-disable-next-line @typescript-eslint/require-await -- async kept for future LLM-backed body composition
    private async buildMOCAutoBody(mocPath: string): Promise<string> {
        const lines: string[] = [];
        const meta = this.clusterMetadataStore;
        const cluster = mocPath.replace(/\.md$/, '').split('/').pop() ?? mocPath;
        const halfLife = meta?.get(cluster)?.halfLifeDays;
        const stats = this.clusterSourceStatsStore?.getStatsForCluster(cluster) ?? [];
        const conc = this.clusterSourceStatsStore?.concentrationScore(cluster) ?? 0;
        lines.push(`_BA-25 MOC-Pflege ${new Date().toISOString().split('T')[0]}_`);
        lines.push('');
        if (halfLife !== undefined && halfLife > 0) lines.push(`- Halbwertszeit: ${halfLife} Tage`);
        if (stats.length > 0) {
            lines.push(`- Source-Domains: ${stats.length} distinct, top: ${stats[0].sourceDomain} (${stats[0].noteCount}x)`);
            lines.push(`- Concentration-Score: ${(conc * 100).toFixed(0)}%${conc >= 0.7 ? ' Bias-Warnung' : ''}`);
        }
        return lines.join('\n');
    }

    async generateAndCopySoakReport(): Promise<void> {
        try {
            const report = generateSoakReport({
                memoryDB: this.memoryDB,
                historyDB: this.historyDB,
                conversationStore: this.conversationStore,
                extractionQueue: this.extractionQueue,
                settings: { memory: this.settings.memory },
            });
            const json = JSON.stringify(report, null, 2);
            const { SoakReportModal } = await import('./ui/modals/SoakReportModal');
            const modal = new SoakReportModal(this.app, json, async () => {
                const day = new Date().toISOString().slice(0, 10);
                const path = `${this.settings.agentFolderPath}/soak-reports/${day}.json`;
                const adapter = this.app.vault.adapter;
                const dir = `${this.settings.agentFolderPath}/soak-reports`;
                if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
                await adapter.write(path, json);
                return path;
            });
            modal.open();
        } catch (e) {
            console.warn('[Plugin] Soak report generation failed:', e);
            new Notice('Soak report failed -- check console for details.');
        }
    }

    /**
     * Sync the curated CapabilityManifest into Memory v2 (FEATURE-0319b).
     * On every plugin onload the live manifest is hashed (djb2 sync). If
     * the hash differs from settings.memory.lastCapabilityHash, the old
     * capability snapshot is deprecated and the new one is inserted as
     * facts under profile_id='_obsilo'. Idempotent on identical runs.
     */
    async syncCapabilitySnapshot(): Promise<void> {
        if (!this.memoryDB?.isOpen()) {
            console.debug('[Plugin] Capability snapshot sync skipped: memoryDB not open');
            return;
        }
        const { CAPABILITIES, manifestHash } = await import('./core/memory/CapabilityManifest');
        const { FactStore } = await import('./core/memory/FactStore');
        const { OBSILO_PROFILE } = await import('./core/memory/SoulView');

        const newHash = manifestHash();
        if (this.settings.memory.lastCapabilityHash === newHash) {
            console.debug(`[Plugin] Capability snapshot up-to-date (hash=${newHash}, ${CAPABILITIES.length} entries)`);
            return;
        }

        const factStore = new FactStore(this.memoryDB);
        const existing = factStore.listLatest({ profileId: OBSILO_PROFILE, limit: 500 })
            .filter(f => f.topics.includes('capability'));
        for (const fact of existing) {
            factStore.deprecate(fact.id, 'superseded by new capability snapshot');
        }
        for (const cap of CAPABILITIES) {
            factStore.insert({
                text: `${cap.summary}${cap.notes ? ' ' + cap.notes : ''}`,
                topics: ['capability', cap.area, cap.key],
                kind: 'identity',
                importance: 0.6,
                profileId: OBSILO_PROFILE,
                sourceInterface: 'obsilo-self',
                metadata: { area: cap.area, key: cap.key },
            });
        }
        await this.memoryDB.save().catch(() => undefined);
        this.settings.memory.lastCapabilityHash = newHash;
        await this.saveSettings();
        console.debug(`[Plugin] Capability snapshot synced: ${CAPABILITIES.length} entries (hash=${newHash}, replaced ${existing.length} stale)`);
    }

    /**
     * Returns the count of latest, non-deprecated Memory v2 facts that
     * came from this conversation. Used by the Star button in HistoryPanel
     * to render the toggle state (filled = has facts, empty = doesn't).
     */
    countMemoryFactsForConversation(conversationId: string): number {
        if (!this.memoryDB?.isOpen() || !conversationId) return 0;
        try {
            const result = this.memoryDB.getDB().exec(
                `SELECT COUNT(*) FROM facts
                  WHERE source_session_id = ?
                    AND is_latest = 1
                    AND deprecated_at IS NULL`,
                [conversationId],
            );
            if (result.length === 0 || result[0].values.length === 0) return 0;
            return Number(result[0].values[0][0]);
        } catch (e) {
            console.warn('[Memory] Fact count lookup failed:', e);
            return 0;
        }
    }

    /**
     * Soft-delete all Memory v2 facts that came from this conversation
     * and reset the thread-delta state so a future Save-to-Memory starts
     * fresh. Returns the number of facts deprecated.
     *
     * Soft-delete (not hard-delete) per ADR-085: the audit trail keeps
     * the original insert + the deprecate event so we can recover or
     * inspect later.
     */
    /**
     * Cascade delete: when a conversation is removed from history, also
     * remove the derived memory artefacts (session summary, thread-delta
     * state) and deprecate every fact that came from this conversation.
     *
     * Returns the number of facts deprecated. Audit trail of those facts
     * stays in `memory_audit` so the user can see what was removed; a
     * full nuke is reachable via "Delete all memory".
     */
    async deleteMemoryForConversationCascade(conversationId: string): Promise<number> {
        if (!this.memoryDB?.isOpen() || !conversationId) return 0;
        const deprecated = await this.unpinMemoryFactsForConversation(conversationId);
        try {
            const db = this.memoryDB.getDB();
            db.run('DELETE FROM sessions WHERE id = ?', [conversationId]);
            db.run('DELETE FROM conversation_threads WHERE thread_id = ?', [conversationId]);
            await this.memoryDB.save().catch(() => undefined);
        } catch (e) {
            console.warn('[Memory] Cascade delete (sessions/threads) failed:', e);
        }
        return deprecated;
    }

    async unpinMemoryFactsForConversation(conversationId: string): Promise<number> {
        if (!this.memoryDB?.isOpen() || !conversationId) return 0;
        try {
            const { FactStore } = await import('./core/memory/FactStore');
            const { ThreadDeltaStore } = await import('./core/memory/ThreadDeltaStore');
            const factStore = new FactStore(this.memoryDB);
            const result = this.memoryDB.getDB().exec(
                `SELECT id FROM facts
                  WHERE source_session_id = ?
                    AND is_latest = 1
                    AND deprecated_at IS NULL`,
                [conversationId],
            );
            const ids = result.length > 0
                ? result[0].values.map(r => r[0] as number)
                : [];
            for (const id of ids) {
                factStore.deprecate(id, 'unpinned by user', conversationId);
            }
            // Reset thread delta so a re-Star starts from message 0 again.
            const deltas = new ThreadDeltaStore(this.memoryDB);
            const existing = deltas.get(conversationId);
            if (existing) {
                deltas.save({ threadId: conversationId, lastExtractedMessageIndex: null, deltaSummary: null });
            }
            await this.memoryDB.save().catch(() => undefined);
            return ids.length;
        } catch (e) {
            console.warn('[Memory] Unpin failed:', e);
            return 0;
        }
    }

    /**
     * Open a conversation by ID via deep-link (ADR-022, FEATURE-300).
     * Activates the sidebar and loads the conversation if it exists.
     */
    async openChatById(id: string): Promise<void> {
        await this.activateView();
        const store = this.conversationStore;
        if (!store) return;
        const meta = store.list().find((m) => m.id === id);
        if (!meta) {
            new Notice(t('notice.conversationNotFound'));
            return;
        }
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
        if (leaves.length > 0) {
            const view = leaves[0].view as AgentSidebarView;
            void view.loadConversationById(id);
        }
    }

    /**
     * Open Obsidian settings and navigate to a specific tab/subtab.
     * Used by protocol handler and agent deep-links.
     */
    /**
     * Memory v2 upgrade detection (FEATURE-0316 / BUG-031 follow-up).
     *
     * Fresh installs ship with `v2MigrationStatus = 'not-applicable'` so this
     * method is a no-op for them (the v1 MD files never existed). Existing
     * users from earlier obsilo releases land here on first plugin load
     * after the update -- if they have the legacy memory MDs but no v2
     * facts yet, status flips to 'pending' and the upgrade modal opens.
     *
     * Idempotent: status stays 'completed'/'skipped' once decided.
     */
    async detectAndPromptMemoryV2Upgrade(): Promise<void> {
        if (!this.memoryDB?.isOpen() || !this.globalFs) return;
        const mem = this.settings.memory;

        // First detection pass: bump 'not-applicable' to a real verdict for
        // existing users. Fresh installs without v1 MDs stay 'not-applicable'.
        if (mem.v2MigrationStatus === 'not-applicable') {
            const hasV1 = await this.hasLegacyMemoryFiles();
            if (!hasV1) return; // truly fresh, nothing to migrate
            const factsCount = this.countV2Facts();
            mem.v2MigrationStatus = factsCount === 0 ? 'pending' : 'completed';
            await this.saveSettings();
        }

        if (mem.v2MigrationStatus !== 'pending') return;

        const { memoryV2UpgradeModal } = await import('./ui/modals/MemoryV2UpgradeModal');
        const choice = await memoryV2UpgradeModal(this.app, { reason: 'auto-on-load' });
        if (choice === 'migrate') {
            this.openSettingsAt('agent', 'memory');
        } else {
            mem.v2MigrationStatus = 'skipped';
            await this.saveSettings();
        }
    }

    private async hasLegacyMemoryFiles(): Promise<boolean> {
        if (!this.globalFs) return false;
        const candidates = [
            'memory/user-profile.md', 'memory/projects.md', 'memory/patterns.md',
            'memory/errors.md', 'memory/custom-tools.md', 'memory/soul.md',
        ];
        for (const path of candidates) {
            try {
                if (await this.globalFs.exists(path)) {
                    const content = await this.globalFs.read(path).catch(() => '');
                    // Non-empty content = real legacy data, not just the auto-created template
                    if (content.trim().length > 50) return true;
                }
            } catch { /* try next */ }
        }
        return false;
    }

    private countV2Facts(): number {
        if (!this.memoryDB?.isOpen()) return 0;
        try {
            const result = this.memoryDB.getDB().exec('SELECT COUNT(*) FROM facts');
            return (result[0]?.values?.[0]?.[0] as number) ?? 0;
        } catch {
            return 0;
        }
    }

    openSettingsAt(tab: string, subTab?: string): void {
        // Open the Obsidian settings modal
        const setting = this.app.setting;
        if (setting) {
            setting.open();
            // Navigate to our plugin's settings tab
            setting.openTabById(this.manifest.id);
            // Then navigate to the specific tab/subtab within our settings
            window.setTimeout(() => {
                if (this.settingsTab) {
                    this.settingsTab.openAt(tab as TabId, subTab);
                }
            }, 50);
        }
    }

    /**
     * Open the sidebar and programmatically send a message.
     * Used by Settings buttons to trigger agent actions (e.g. "Start setup").
     */
    async sendMessageToAgent(text: string, hidden = false): Promise<void> {
        await this.activateView();
        // Small delay to ensure the view is rendered
        window.setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
            if (leaves.length > 0) {
                const view = leaves[0].view as AgentSidebarView;
                view.sendProgrammaticMessage(text, hidden);
            }
        }, 200);
    }

    /**
     * Phase 2.3: open the FirstRunWizard the first three times the
     * plugin starts unless the user has finished it or said "don't show
     * again". The shown-count is incremented up-front so the user gets
     * a deterministic three exposures.
     */
    async maybeAutoOpenSetupWizard(): Promise<void> {
        const ob = this.settings.onboarding;
        if (ob.modalCompleted) return;
        if (ob.dontShowFirstRunAgain) return;
        const shown = ob.firstRunModalShownCount ?? 0;
        if (shown >= 3) return;

        ob.firstRunModalShownCount = shown + 1;
        await this.saveSettings();

        const { FirstRunWizardModal } = await import('./ui/modals/FirstRunWizardModal');
        new FirstRunWizardModal(this.app, this).open();
    }

    /**
     * Open the sidebar and start the LLM-driven onboarding conversation.
     * Used by Settings buttons (Start/Restart setup).
     */
    async startOnboarding(): Promise<void> {
        // Close the settings modal so the user sees the chat
        this.app.setting?.close();
        await this.activateView();
        window.setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
            if (leaves.length > 0) {
                const view = leaves[0].view as AgentSidebarView;
                view.startOnboardingChat();
            }
        }, 200);
    }

    /**
     * Schedule a single file for re-indexing after a 2s debounce.
     * Fires on vault modify/create events — debounce prevents thrashing
     * while the user is actively typing in a note.
     */
    /**
     * One-time cleanup: remove old sync data from the plugin directory.
     * Called after migration to .obsilo-sync/ to free ~600 MB from the vault.
     * Preserves: skills/ (bundled), checkpoints/, dev-env/, main.js, manifest.json, etc.
     */
    /**
     * FEATURE-1508: Migrate data from ~/.obsidian-agent/ to {vault-parent}/.obsidian-agent/
     * and knowledge.db to {vault}/.obsidian-agent/. One-time, idempotent.
     */
    private async migrateToParentDir(vaultBasePath: string): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- path/os are pure helpers, no fs surface
        const path = require('path') as typeof import('path');
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- path/os are pure helpers
        const os = require('os') as typeof import('os');

        const oldRoot = path.join(os.homedir(), '.obsidian-agent');
        const newRoot = this.globalFs.getRoot();

        // Skip if old and new are the same (shouldn't happen, but safety check)
        if (oldRoot === newRoot) return;

        // Skip if old root doesn't exist
        try {
            await safeFs.promises.access(oldRoot);
        } catch {
            console.debug('[Plugin] No legacy ~/.obsidian-agent/ found — skip migration');
            // Still clean up legacy vault dirs
            await this.cleanupLegacyVaultDirs();
            return;
        }

        console.debug(`[Plugin] Migrating storage: ${oldRoot} -> ${newRoot}`);
        await safeFs.promises.mkdir(newRoot, { recursive: true });

        // Copy directories
        const dirsToMigrate = ['memory', 'history', 'logs', 'rules', 'skills', 'workflows'];
        let migrated = 0;
        for (const dir of dirsToMigrate) {
            const src = path.join(oldRoot, dir);
            const dst = path.join(newRoot, dir);
            try {
                await safeFs.promises.access(src);
                // Only copy if destination doesn't exist (don't overwrite)
                try { await safeFs.promises.access(dst); } catch {
                    await safeFs.promises.cp(src, dst, { recursive: true });
                    migrated++;
                }
            } catch { /* source dir doesn't exist — skip */ }
        }

        // Copy individual files
        const filesToMigrate = ['settings.json', 'pending-extractions.json'];
        for (const file of filesToMigrate) {
            const src = path.join(oldRoot, file);
            const dst = path.join(newRoot, file);
            try {
                await safeFs.promises.access(src);
                try { await safeFs.promises.access(dst); } catch {
                    await safeFs.promises.copyFile(src, dst);
                    migrated++;
                }
            } catch { /* skip */ }
        }

        // Migrate knowledge.db to vault-local
        const oldKnowledgeDb = path.join(oldRoot, 'knowledge.db');
        const newKnowledgeDb = path.join(vaultBasePath, '.obsilo-vault', 'knowledge.db');
        try {
            await safeFs.promises.access(oldKnowledgeDb);
            await safeFs.promises.mkdir(path.dirname(newKnowledgeDb), { recursive: true });
            try { await safeFs.promises.access(newKnowledgeDb); } catch {
                await safeFs.promises.copyFile(oldKnowledgeDb, newKnowledgeDb);
                migrated++;
                console.debug('[Plugin] Migrated knowledge.db to vault-local');
            }
        } catch { /* skip */ }

        // Migrate memory.db to new global root (legacy vault-local name was '.obsidian-agent')
        const oldMemoryDb = path.join(vaultBasePath, '.obsidian-agent', 'memory.db');
        // (Note: my pre-init migration may have already renamed this to 'obsilo-vault'.
        //  We fall through with whichever path actually exists.)
        const newMemoryDb = path.join(newRoot, 'memory.db');
        try {
            await safeFs.promises.access(oldMemoryDb);
            try { await safeFs.promises.access(newMemoryDb); } catch {
                await safeFs.promises.copyFile(oldMemoryDb, newMemoryDb);
                migrated++;
                console.debug('[Plugin] Migrated memory.db to vault-parent');
            }
        } catch { /* skip */ }

        console.debug(`[Plugin] Storage migration complete: ${migrated} items migrated`);

        // Clean up legacy vault directories
        await this.cleanupLegacyVaultDirs();
    }

    /** Remove legacy vault directories (.obsilo-sync, .obsilo, .obsidian/.obsilo, semantic-index). */
    private async cleanupLegacyVaultDirs(): Promise<void> {
        const adapter = this.app.vault.adapter;
        const legacyDirs = ['.obsilo-sync', '.obsilo'];
        for (const dir of legacyDirs) {
            try {
                if (await adapter.exists(dir)) {
                    await adapter.rmdir(dir, true);
                    console.debug(`[Plugin] Removed legacy ${dir}/`);
                }
            } catch (e) {
                console.warn(`[Plugin] Failed to remove ${dir} (non-fatal):`, e);
            }
        }
        // .obsidian/.obsilo
        const dotObsilo = `${this.app.vault.configDir}/.obsilo`;
        try {
            if (await adapter.exists(dotObsilo)) {
                await adapter.rmdir(dotObsilo, true);
                console.debug('[Plugin] Removed legacy config-dir/.obsilo/');
            }
        } catch { /* non-fatal */ }
    }

    private scheduleFileIndex(filePath: string): void {
        if (!this.semanticIndex?.isIndexed) return;
        if (this.settings.semanticExcludedFolders?.some((f) => filePath.startsWith(f + '/'))) return;
        const existing = this.autoIndexDebounceTimers.get(filePath);
        if (existing) window.clearTimeout(existing);
        const timer = window.setTimeout(() => {
            this.autoIndexDebounceTimers.delete(filePath);
            // Use queue (concurrency=1) instead of direct updateFile to prevent
            // concurrent embedding calls from freezing Obsidian's main thread.
            this.semanticIndex?.queueAutoUpdate(filePath);
        }, 2000);
        this.autoIndexDebounceTimers.set(filePath, timer);
    }

    /**
     * Test tool execution (Development only)
     * M-4: Gated behind debugMode — bypasses approval pipeline.
     */
    async testToolExecution() {
        if (!this.settings.debugMode) {
            console.warn('[testToolExecution] Blocked — enable debugMode in settings first.');
            new Notice('Test execution blocked. Enable debug mode in settings first.');
            return;
        }
        console.debug('=== Testing Tool Execution ===');
        new Notice('Testing tool execution...');

        // Create a pipeline instance for testing
        const pipeline = new ToolExecutionPipeline(
            this,
            this.toolRegistry,
            'test-task-001',
            'ask'
        );

        // Create callbacks to collect results
        const results: string[] = [];
        const callbacks: ToolCallbacks = {
            pushToolResult: (content: string) => {
                results.push(content);
                console.debug('Tool result:', content);
            },
            handleError: (toolName: string, error: unknown) => {
                console.error(`Error in ${toolName}:`, error);
            },
            log: (message: string) => {
                console.debug('Tool log:', message);
            }
        };

        try {
            // Test 1: Write then read to test roundtrip
            console.debug('\n--- Test 1: Write test file ---');
            const writeTool: ToolUse = {
                type: 'tool_use',
                id: 'test-write-001',
                name: 'write_file',
                input: {
                    path: 'obsidian-agent-test.md',
                    content: `# Tool Execution Test\n\nTimestamp: ${new Date().toISOString()}\n\nAll systems operational!`
                }
            };
            await pipeline.executeTool(writeTool, callbacks);

            // Then read it back
            console.debug('\n--- Test 2: Read back the test file ---');
            const readTool: ToolUse = {
                type: 'tool_use',
                id: 'test-read-001',
                name: 'read_file',
                input: { path: 'obsidian-agent-test.md' }
            };

            const readResult = await pipeline.executeTool(readTool, callbacks);
            const readContentText = typeof readResult.content === 'string' ? readResult.content : '[multimodal]';
            console.debug('Read result (content populated):', readContentText.substring(0, 100) + '...');

            console.debug('\n=== Tool Execution Test Complete ===');
            console.debug('Results collected:', results.length);

            new Notice('Tool execution test complete! Check console and vault.');
        } catch (error) {
            console.error('Tool execution test failed:', error);
            new Notice('Tool execution test failed! Check console.');
        }
    }
}

/** Parse URL and check hostname instead of substring match (CodeQL: js/incomplete-url-substring-sanitization) */
function isGeminiApiUrl(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const hostname = new URL(url).hostname;
        return hostname === 'generativelanguage.googleapis.com'
            || hostname.endsWith('.generativelanguage.googleapis.com');
    } catch {
        return false;
    }
}

/**
 * FIX 2026-05-04: deep-merge fuer Settings. Sub-Objekte (z.B.
 * vaultIngest.topHubBlock, memory.crossSurface) werden aus den
 * Defaults rekursiv gefuellt wenn sie im persistenten data.json
 * fehlen. Arrays + null-Werte aus saved werden nicht gemergt
 * sondern uebernommen wie sie sind. Plain-Objects werden rekursiv
 * gemergt. Vermeidet die "neuer Toggle reagiert nicht"-Falle bei
 * Plugin-Upgrades.
 */
function deepMergeSettings<T extends Record<string, unknown>>(defaults: T, saved: Partial<T>): T {
    if (!saved || typeof saved !== 'object') return { ...defaults };
    const merged = { ...defaults } as Record<string, unknown>;
    for (const [key, savedValue] of Object.entries(saved)) {
        const defaultValue = (defaults as Record<string, unknown>)[key];
        if (
            savedValue !== null
            && typeof savedValue === 'object'
            && !Array.isArray(savedValue)
            && defaultValue !== null
            && typeof defaultValue === 'object'
            && !Array.isArray(defaultValue)
        ) {
            merged[key] = deepMergeSettings(
                defaultValue as Record<string, unknown>,
                savedValue as Record<string, unknown>,
            );
        } else {
            merged[key] = savedValue;
        }
    }
    return merged as T;
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
