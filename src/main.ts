import { Plugin, WorkspaceLeaf, Notice, TFile, requestUrl } from 'obsidian';
import { ObsidianAgentSettings, DEFAULT_SETTINGS, BUILTIN_MCP_SERVERS, getModelKey, modelToLLMProvider } from './types/settings';
import type { CustomModel } from './types/settings';
import { AgentSidebarView, VIEW_TYPE_AGENT_SIDEBAR } from './ui/AgentSidebarView';
import { AgentSettingsTab, type TabId } from './ui/AgentSettingsTab';
import { ToolRegistry } from './core/tools/ToolRegistry';
import { ToolExecutionPipeline } from './core/tool-execution/ToolExecutionPipeline';
import { IgnoreService } from './core/governance/IgnoreService';
import { OperationLogger } from './core/governance/OperationLogger';
import { GlobalFileService } from './core/storage/GlobalFileService';
import { GlobalSettingsService } from './core/storage/GlobalSettingsService';
import { GlobalMigrationService } from './core/storage/GlobalMigrationService';
// SyncBridge removed (FEATURE-1508: storage consolidated to vault-parent)
import { RulesLoader } from './core/context/RulesLoader';
import { WorkflowLoader } from './core/context/WorkflowLoader';
import { SkillsManager } from './core/context/SkillsManager';
import { GitCheckpointService } from './core/checkpoints/GitCheckpointService';
import { SemanticIndexService } from './core/semantic/SemanticIndexService';
import { KnowledgeDB } from './core/knowledge/KnowledgeDB';
import { VectorStore } from './core/knowledge/VectorStore';
import { GraphStore } from './core/knowledge/GraphStore';
import { OntologyStore } from './core/knowledge/OntologyStore';
import { CommunityDetectionService } from './core/knowledge/CommunityDetectionService';
import { VaultHealthService } from './core/knowledge/VaultHealthService';
import { GraphExtractor } from './core/knowledge/GraphExtractor';
import { ImplicitConnectionService } from './core/knowledge/ImplicitConnectionService';
import { MemoryDB } from './core/knowledge/MemoryDB';
import { RerankerService } from './core/knowledge/RerankerService';
import { ChatHistoryService } from './core/ChatHistoryService';
import { ConversationStore } from './core/history/ConversationStore';
import { MemoryService } from './core/memory/MemoryService';
import { ExtractionQueue } from './core/memory/ExtractionQueue';
import { SessionExtractor } from './core/memory/SessionExtractor';
import { LongTermExtractor } from './core/memory/LongTermExtractor';
import { McpClient } from './core/mcp/McpClient';
import { VaultDNAScanner } from './core/skills/VaultDNAScanner';
import { SkillRegistry } from './core/skills/SkillRegistry';
import { CapabilityGapResolver } from './core/skills/CapabilityGapResolver';
import { buildApiHandler } from './api/index';
import type { ApiHandler } from './api/types';
import type { ToolUse, ToolCallbacks } from './core/tools/types';
import { BUILT_IN_MODES } from './core/modes/builtinModes';
import { mergeDefaultPrompts } from './core/prompts/defaultPrompts';
import { t } from './i18n';
import { SafeStorageService } from './core/security/SafeStorageService';
import { GitHubCopilotAuthService } from './core/security/GitHubCopilotAuthService';
import { KiloAuthService } from './core/security/KiloAuthService';
import { setGlobalModeStoreFs } from './core/modes/GlobalModeStore';
import { RecipeStore } from './core/mastery/RecipeStore';
import { RecipeMatchingService } from './core/mastery/RecipeMatchingService';
import { EpisodicExtractor } from './core/mastery/EpisodicExtractor';
import { RecipePromotionService } from './core/mastery/RecipePromotionService';
import { ConsoleRingBuffer } from './core/observability/ConsoleRingBuffer';
import { SelfAuthoredSkillLoader } from './core/skills/SelfAuthoredSkillLoader';
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
export default class ObsidianAgentPlugin extends Plugin {
    settings: ObsidianAgentSettings;
    toolRegistry: ToolRegistry;
    apiHandler: ApiHandler | null = null;
    ignoreService: IgnoreService;
    operationLogger: OperationLogger;
    checkpointService: GitCheckpointService;
    rulesLoader: RulesLoader;
    workflowLoader: WorkflowLoader;
    skillsManager: SkillsManager;
    semanticIndex: SemanticIndexService | null = null;
    knowledgeDB: KnowledgeDB | null = null;
    vectorStore: VectorStore | null = null;
    graphStore: GraphStore | null = null;
    graphExtractor: GraphExtractor | null = null;
    implicitConnectionService: ImplicitConnectionService | null = null;
    ontologyStore: OntologyStore | null = null;
    communityDetectionService: CommunityDetectionService | null = null;
    vaultHealthService: VaultHealthService | null = null;
    memoryDB: MemoryDB | null = null;
    rerankerService: RerankerService | null = null;
    mcpBridge: { start(): Promise<void>; stop(): void; running: boolean; tunnelUrl: string | null; remoteConnected: boolean; remoteConnecting: boolean; startTunnel(onUrl?: (url: string | null) => void): void; stopTunnel(): void; connectRelay(): void; disconnectRelay(): void; getToolsWithContext(): unknown[]; buildResourceList(): unknown[] } | null = null;
    private autoIndexDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private warmupFired = false;
    /** Session flags for cross-tool coordination (e.g. plan_presentation → create_pptx gate). */
    sessionFlags = new Set<string>();
    private cloudProviderWarningShown = false;
    chatHistoryService: ChatHistoryService | null = null;
    conversationStore: ConversationStore | null = null;
    memoryService: MemoryService | null = null;
    extractionQueue: ExtractionQueue | null = null;
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
        const uri = `obsidian://obsilo-chat?id=${encodeURIComponent(conversationId)}`;
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
    onload(): void {
        // Register view SYNCHRONOUSLY so Obsidian can restore saved layout
        // immediately — before any async initialization runs.
        // ModeService uses lazy toolRegistry access, so the view is safe
        // to construct even before doLoad() finishes.
        this.registerView(
            VIEW_TYPE_AGENT_SIDEBAR,
            (leaf) => new AgentSidebarView(leaf, this)
        );
        void this.doLoad();
    }

    private async doLoad(): Promise<void> {
        // 0. ConsoleRingBuffer — install FIRST so all subsequent logs are captured
        this.ringBuffer = new ConsoleRingBuffer(500);
        this.ringBuffer.install();

        console.debug('Loading Obsilo Agent plugin');

        // 0a. Initialize SafeStorageService (must happen before loadSettings)
        this.safeStorage = new SafeStorageService();

        // 0b. Global file service — shared storage at {vault-parent}/.obsidian-agent/ (FEATURE-1508)
        const vaultBasePath = (this.app.vault.adapter as unknown as { getBasePath?(): string }).getBasePath?.() ?? '';
        this.globalFs = new GlobalFileService(vaultBasePath);
        this.globalSettingsService = new GlobalSettingsService(this.globalFs, this.safeStorage);
        // Share the GlobalFileService with GlobalModeStore (consolidates all global I/O)
        setGlobalModeStoreFs(this.globalFs);

        // 1. Load settings (merges global + vault-local)
        await this.loadSettings();

        // 2. Initialize core services
        const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;

        // FIX-19: Ensure runtime assets exist on disk (BRAT self-provisioning)
        const { ensureRuntimeAssets } = await import('./core/AssetProvisioner');
        await ensureRuntimeAssets(this).catch((e) =>
            console.warn('[Plugin] Asset provisioning failed (non-fatal):', e)
        );

        // FEATURE-1508: One-time migration from ~/.obsidian-agent/ to {vault-parent}/.obsidian-agent/
        if (!this.settings._parentDirMigrated) {
            await this.migrateToParentDir(vaultBasePath).catch((e) =>
                console.warn('[Plugin] Storage migration failed (non-fatal):', e)
            );
            this.settings._parentDirMigrated = true;
            await this.saveData({ ...this.settings, _parentDirMigrated: true });
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
            this.vaultDNAScanner = new VaultDNAScanner(this.app, this.app.vault);
            this.skillRegistry = new SkillRegistry(
                this.vaultDNAScanner,
                this.settings.vaultDNA.skillToggles,
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

        // Core Self-Modification (Phase 4) — load embedded source if available
        this.embeddedSourceManager = new EmbeddedSourceManager();
        this.embeddedSourceManager.load(); // Non-fatal if not available (dev builds)
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
            this.knowledgeDB = new KnowledgeDB(
                this.app.vault,
                pluginDir,
                'local', // FEATURE-1508: knowledge.db is vault-local (syncs with vault)
            );
            await this.knowledgeDB.open().catch((e) =>
                console.warn('[Plugin] KnowledgeDB open failed (non-fatal):', e)
            );
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
            this.communityDetectionService = new CommunityDetectionService(
                this.knowledgeDB, this.graphStore, this.ontologyStore,
            );
            this.semanticIndex = new SemanticIndexService(this.app.vault, this.knowledgeDB, this.vectorStore, {
                batchSize: this.settings.semanticBatchSize,
                embeddingBatchSize: 16,  // texts per API call — batch for performance
                excludedFolders: this.settings.semanticExcludedFolders,
                indexPdfs: this.settings.semanticIndexPdfs,
                chunkSize: this.settings.semanticChunkSize ?? 2000,
                enableContextualRetrieval: this.settings.enableContextualRetrieval,
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
                const pluginAbsDir = `${vaultBasePath}/${pluginDir}`;
                this.rerankerService = new RerankerService(pluginAbsDir);
                // Pre-load model at startup so first search is fast
                this.app.workspace.onLayoutReady(() => {
                    void this.rerankerService?.loadModel();
                });
            }
            } // end FIX-18 else (knowledgeDB available)
        }

        // Auto-index: keep semantic index current as vault files change.
        // Only enabled when semanticAutoIndexOnChange is explicitly set.
        if (this.settings.enableSemanticIndex && this.semanticIndex && this.settings.semanticAutoIndexOnChange) {
            const DOCUMENT_EXTENSIONS = new Set(['pdf', 'pptx', 'xlsx', 'docx']);
            const isIndexable = (f: TFile): boolean =>
                f.extension === 'md' || (this.settings.semanticIndexPdfs && DOCUMENT_EXTENSIONS.has(f.extension));
            this.registerEvent(this.app.vault.on('modify', (file) => {
                if (!(file instanceof TFile) || !isIndexable(file)) return;
                this.scheduleFileIndex(file.path);
                // Graph + implicit + ontology: update edges/tags and recompute
                if (file.extension === 'md') {
                    this.graphExtractor?.extractFile(file);
                    this.implicitConnectionService?.recomputeForPath(file.path, this.settings.implicitThreshold);
                    this.ontologyStore?.updateForPath(file.path, this.settings.mocPropertyNames ?? []);
                }
            }));
            this.registerEvent(this.app.vault.on('create', (file) => {
                if (!(file instanceof TFile) || !isIndexable(file)) return;
                this.scheduleFileIndex(file.path);
                if (file.extension === 'md') {
                    this.graphExtractor?.extractFile(file);
                    this.implicitConnectionService?.recomputeForPath(file.path, this.settings.implicitThreshold);
                    this.ontologyStore?.updateForPath(file.path, this.settings.mocPropertyNames ?? []);
                }
            }));
            this.registerEvent(this.app.vault.on('delete', (file) => {
                if (!(file instanceof TFile) || !isIndexable(file)) return;
                void this.semanticIndex?.removeFile(file.path);
                this.graphExtractor?.removeFile(file.path);
                this.ontologyStore?.removeEntriesForPath(file.path);
            }));
            this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
                if (!(file instanceof TFile) || !isIndexable(file)) return;
                void this.semanticIndex?.removeFile(oldPath);
                this.graphExtractor?.removeFile(oldPath);
                this.ontologyStore?.removeEntriesForPath(oldPath);
                if (file instanceof TFile && file.extension === 'md') {
                    this.graphExtractor?.extractFile(file);
                    this.implicitConnectionService?.recomputeForPath(file.path, this.settings.implicitThreshold);
                    this.ontologyStore?.updateForPath(file.path, this.settings.mocPropertyNames ?? []);
                }
                this.scheduleFileIndex(file.path);
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
            // ADR-058: Semantic Recipe Promotion (intent-based, not sequence-based)
            this.recipePromotionService = new RecipePromotionService(
                this.recipeStore,
                () => {
                    const model = this.getMemoryModel();
                    if (!model) return null;
                    return buildApiHandler(modelToLLMProvider(model));
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

            // Wire SessionExtractor as the queue processor
            const sessionExtractor = new SessionExtractor(
                this.memoryService,
                () => this.getMemoryModel(),
                () => this.settings.memory.autoUpdateLongTerm,
                this.extractionQueue,
                () => this.semanticIndex,
            );
            const longTermExtractor = new LongTermExtractor(
                this.memoryService,
                () => this.getMemoryModel(),
            );
            this.extractionQueue.setProcessor(async (item) => {
                if (item.type === 'session') {
                    await sessionExtractor.process(item);
                } else if (item.type === 'long-term') {
                    await longTermExtractor.process(item);
                }
            });

            // Process any pending extractions from a previous session
            if (!this.extractionQueue.isEmpty()) {
                console.debug(`[Plugin] Processing ${this.extractionQueue.size()} pending extractions from previous session`);
                this.extractionQueue.processQueue().catch((e) =>
                    console.warn('[Plugin] Queue processing failed (non-fatal):', e)
                );
            }
        }

        // LLM provider (null if no API key configured)
        this.initApiHandler();

        // 3. Register UI views (registerView moved to synchronous onload())

        // Ribbon icon in left activity bar (using built-in lucide icon)
        this.addRibbonIcon('bot', 'Obsilo agent', () => {
            void this.activateView();
        });

        // Protocol handler: deep-link into a specific conversation (ADR-022)
        this.registerObsidianProtocolHandler('obsilo-chat', (params) => {
            const id = params.id;
            if (!id || typeof id !== 'string') return;
            void this.openChatById(id);
        });

        // Register 'Chats' property as list type so Properties view shows individual items
        this.app.metadataTypeManager.setType('chats', 'multitext');

        // Auto-open sidebar when Obsidian starts
        this.app.workspace.onLayoutReady(() => {
            void this.activateView();
        });

        // 4. Register commands
        this.addCommand({
            id: 'open-agent-sidebar',
            name: 'Open agent sidebar',
            callback: () => this.activateView()
        });

        // Development: Test tool execution
        this.addCommand({
            id: 'test-tool-execution',
            name: 'Test tool execution',
            callback: () => this.testToolExecution()
        });

        // 5. Register settings tab
        this.settingsTab = new AgentSettingsTab(this.app, this);
        this.addSettingTab(this.settingsTab);

        // 6. Register deep-link protocol handler: obsidian://obsilo-settings?tab=advanced&sub=backup
        this.registerObsidianProtocolHandler('obsilo-settings', (params) => {
            const tab = params.tab;
            const sub = params.sub;
            if (tab) this.openSettingsAt(tab, sub);
        });

        // MCP Server (EPIC-014): Expose Obsilo as MCP Server for Claude Desktop/Code
        if (this.settings.enableMcpServer) {
            const { McpBridge } = await import('./mcp/McpBridge');
            this.mcpBridge = new McpBridge(this);
            await this.mcpBridge.start().catch((e: unknown) =>
                console.warn('[Plugin] MCP Server start failed (non-fatal):', e)
            );
            // Remote relay (if configured)
            if (this.settings.enableRemoteRelay && this.settings.relayUrl) {
                this.mcpBridge.connectRelay();
            }
        }

        // ADR-063: Clean up orphaned externalization temp files from crashed sessions
        if (this.globalFs) {
            const { ResultExternalizer } = await import('./core/tool-execution/ResultExternalizer');
            void ResultExternalizer.cleanupOrphaned(this.globalFs);
        }

        console.debug('Obsilo Agent plugin loaded successfully');
    }

    /**
     * Plugin cleanup
     */
    onunload(): void {
        console.debug('Unloading Obsilo Agent plugin');
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
            this.rerankerService?.unload();
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
        for (const timer of this.autoIndexDebounceTimers.values()) clearTimeout(timer);
        this.autoIndexDebounceTimers.clear();
        this.sandboxExecutor?.destroy();
        this.ringBuffer?.uninstall();
        console.debug('Obsilo Agent plugin unloaded');
    }

    /**
     * Load plugin settings from disk
     */
    async loadSettings() {
        const saved = (await this.loadData()) ?? {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

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
        this.settings.memory.autoUpdateLongTerm = this.settings.memory.autoUpdateLongTerm ?? memDefaults.autoUpdateLongTerm;
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
        const model = this.getActiveModel();

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

            // Pre-warm the DNS + TLS connection so the FIRST user message isn't delayed
            // by cold-start network setup (~5-18 s on some systems / networks).
            // We fire a lightweight HEAD to the provider base URL immediately after the
            // handler is created.  The server will return an error (no valid payload),
            // but the TCP/TLS connection is established and Chromium caches it for reuse.
            // Local providers (ollama, lmstudio) are intentionally skipped.
            const CLOUD_BASE_URLS: Partial<Record<string, string>> = {
                anthropic:  'https://api.anthropic.com',
                openai:     'https://api.openai.com',
                openrouter: 'https://openrouter.ai',
                azure:      model.baseUrl ?? '',
                custom:     model.baseUrl ?? '',
            };
            const warmupUrl = CLOUD_BASE_URLS[model.provider];
            if (warmupUrl && !this.warmupFired) {
                this.warmupFired = true;
                requestUrl({ url: warmupUrl, method: 'HEAD', throw: false })
                    .catch(() => { /* expected — we only want the TCP/TLS handshake */ });
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
    openSettingsAt(tab: string, subTab?: string): void {
        // Open the Obsidian settings modal
        const setting = this.app.setting;
        if (setting) {
            setting.open();
            // Navigate to our plugin's settings tab
            setting.openTabById(this.manifest.id);
            // Then navigate to the specific tab/subtab within our settings
            setTimeout(() => {
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
        setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
            if (leaves.length > 0) {
                const view = leaves[0].view as AgentSidebarView;
                view.sendProgrammaticMessage(text, hidden);
            }
        }, 200);
    }

    /**
     * Open the sidebar and start the LLM-driven onboarding conversation.
     * Used by Settings buttons (Start/Restart setup).
     */
    async startOnboarding(): Promise<void> {
        // Close the settings modal so the user sees the chat
        this.app.setting?.close();
        await this.activateView();
        setTimeout(() => {
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import('fs') fails in Electron ("Failed to resolve module specifier 'fs'"), FIX-17
        const fs = require('fs') as typeof import('fs');
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- FIX-17
        const path = require('path') as typeof import('path');
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- FIX-17
        const os = require('os') as typeof import('os');

        const oldRoot = path.join(os.homedir(), '.obsidian-agent');
        const newRoot = this.globalFs.getRoot();

        // Skip if old and new are the same (shouldn't happen, but safety check)
        if (oldRoot === newRoot) return;

        // Skip if old root doesn't exist
        try {
            await fs.promises.access(oldRoot);
        } catch {
            console.debug('[Plugin] No legacy ~/.obsidian-agent/ found — skip migration');
            // Still clean up legacy vault dirs
            await this.cleanupLegacyVaultDirs();
            return;
        }

        console.debug(`[Plugin] Migrating storage: ${oldRoot} -> ${newRoot}`);
        await fs.promises.mkdir(newRoot, { recursive: true });

        // Copy directories
        const dirsToMigrate = ['memory', 'history', 'logs', 'rules', 'skills', 'workflows'];
        let migrated = 0;
        for (const dir of dirsToMigrate) {
            const src = path.join(oldRoot, dir);
            const dst = path.join(newRoot, dir);
            try {
                await fs.promises.access(src);
                // Only copy if destination doesn't exist (don't overwrite)
                try { await fs.promises.access(dst); } catch {
                    await fs.promises.cp(src, dst, { recursive: true });
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
                await fs.promises.access(src);
                try { await fs.promises.access(dst); } catch {
                    await fs.promises.copyFile(src, dst);
                    migrated++;
                }
            } catch { /* skip */ }
        }

        // Migrate knowledge.db to vault-local
        const oldKnowledgeDb = path.join(oldRoot, 'knowledge.db');
        const newKnowledgeDb = path.join(vaultBasePath, '.obsidian-agent', 'knowledge.db');
        try {
            await fs.promises.access(oldKnowledgeDb);
            await fs.promises.mkdir(path.dirname(newKnowledgeDb), { recursive: true });
            try { await fs.promises.access(newKnowledgeDb); } catch {
                await fs.promises.copyFile(oldKnowledgeDb, newKnowledgeDb);
                migrated++;
                console.debug('[Plugin] Migrated knowledge.db to vault-local');
            }
        } catch { /* skip */ }

        // Migrate memory.db to new global root
        const oldMemoryDb = path.join(vaultBasePath, '.obsidian-agent', 'memory.db');
        const newMemoryDb = path.join(newRoot, 'memory.db');
        try {
            await fs.promises.access(oldMemoryDb);
            try { await fs.promises.access(newMemoryDb); } catch {
                await fs.promises.copyFile(oldMemoryDb, newMemoryDb);
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
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
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
