/**
 * Plugin Settings
 */

// ---------------------------------------------------------------------------
// CustomModel — single unified model entry (replaces per-provider LLMProvider)
// Adapted from Obsidian Copilot's CustomModel pattern
// ---------------------------------------------------------------------------

export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'openrouter' | 'azure' | 'custom' | 'github-copilot' | 'kilo-gateway';

export interface CustomModel {
    /** Model identifier used in API calls (e.g. "claude-sonnet-4-5-20250929") */
    name: string;
    /** LLM provider */
    provider: ProviderType;
    /** Human-readable name shown in UI */
    displayName?: string;
    /** API key for this model (stored per-model, not per-provider) */
    apiKey?: string;
    /** Custom base URL (required for ollama/custom/azure, optional for others) */
    baseUrl?: string;
    /** Whether the model appears in the chat model selector */
    enabled: boolean;
    /** True for pre-defined models shipped with the plugin */
    isBuiltIn?: boolean;
    maxTokens?: number;
    temperature?: number;
    /** API version string (required for Azure OpenAI and some enterprise gateways, e.g. "2024-10-21") */
    apiVersion?: string;
    /** Enable prompt caching (Anthropic only). Reduces costs on repeated conversations. */
    promptCachingEnabled?: boolean;
    /** Enable extended thinking (Anthropic only). Forces temperature to 1. */
    thinkingEnabled?: boolean;
    /** Thinking budget in tokens (used when thinkingEnabled is true, default 10000) */
    thinkingBudgetTokens?: number;
}

/** Provider-level default base URLs used for setup UX and built-in models. */
export function getDefaultBaseUrlForProvider(provider: ProviderType): string | undefined {
    switch (provider) {
        case 'anthropic':
            return 'https://api.anthropic.com';
        case 'ollama':
            return 'http://localhost:11434';
        case 'lmstudio':
            return 'http://localhost:1234';
        case 'gemini':
            return 'https://generativelanguage.googleapis.com/v1beta/openai';
        default:
            return undefined;
    }
}

/** Unique key for a model across all providers */
export function getModelKey(model: CustomModel): string {
    return `${model.name}|${model.provider}`;
}

/** Return the key of the first enabled model, or '' if none */
export function getFirstEnabledModelKey(models: CustomModel[]): string {
    const first = models.find((m) => m.enabled);
    return first ? getModelKey(first) : '';
}

/** Built-in models — shown in settings by default, user can add API keys & enable */
export const BUILT_IN_MODELS: CustomModel[] = [
    // Anthropic
    {
        name: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
        displayName: 'Claude Sonnet 4.5',
        baseUrl: getDefaultBaseUrlForProvider('anthropic'),
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
        thinkingEnabled: true,
        thinkingBudgetTokens: 10000,
    },
    {
        name: 'claude-opus-4-6',
        provider: 'anthropic',
        displayName: 'Claude Opus 4.6',
        baseUrl: getDefaultBaseUrlForProvider('anthropic'),
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
        thinkingEnabled: true,
        thinkingBudgetTokens: 10000,
    },
    {
        name: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        displayName: 'Claude Haiku 4.5',
        baseUrl: getDefaultBaseUrlForProvider('anthropic'),
        enabled: false,
        isBuiltIn: true,
        maxTokens: 8192,
        thinkingEnabled: true,
        thinkingBudgetTokens: 5000,
    },
    // OpenAI
    {
        name: 'gpt-4o',
        provider: 'openai',
        displayName: 'GPT-4o',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
    },
    {
        name: 'gpt-4o-mini',
        provider: 'openai',
        displayName: 'GPT-4o mini',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
    },
    {
        name: 'gpt-4.1',
        provider: 'openai',
        displayName: 'GPT-4.1',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
    },
    // Ollama (local)
    {
        name: 'llama3.2',
        provider: 'ollama',
        displayName: 'Llama 3.2 (local)',
        baseUrl: 'http://localhost:11434',
        enabled: false,
        isBuiltIn: true,
    },
    {
        name: 'qwen2.5:7b',
        provider: 'ollama',
        displayName: 'Qwen 2.5 7B (local)',
        baseUrl: 'http://localhost:11434',
        enabled: false,
        isBuiltIn: true,
    },
    // OpenRouter (API key required, base URL pre-configured)
    {
        name: 'anthropic/claude-3.5-sonnet',
        provider: 'openrouter',
        displayName: 'Claude 3.5 Sonnet',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 8192,
    },
    {
        name: 'openai/gpt-4o',
        provider: 'openrouter',
        displayName: 'GPT-4o',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
    },
    {
        name: 'meta-llama/llama-3.2-3b-instruct:free',
        provider: 'openrouter',
        displayName: 'Llama 3.2 3B (free)',
        enabled: false,
        isBuiltIn: true,
    },
    // Google Gemini (OpenAI-compatible endpoint)
    {
        name: 'gemini-2.5-flash',
        provider: 'gemini',
        displayName: 'Gemini 2.5 Flash',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 8192,
    },
    {
        name: 'gemini-2.5-pro',
        provider: 'gemini',
        displayName: 'Gemini 2.5 Pro',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 8192,
    },
    // GitHub Copilot (unofficial API — requires active Copilot subscription)
    {
        name: 'gpt-4o',
        provider: 'github-copilot',
        displayName: 'GPT-4o (Copilot)',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 16384,
    },
    {
        name: 'claude-sonnet-4',
        provider: 'github-copilot',
        displayName: 'Claude Sonnet 4 (Copilot)',
        enabled: false,
        isBuiltIn: true,
        maxTokens: 64000,
    },
];

// ---------------------------------------------------------------------------
// LLMProvider — kept for backwards compatibility with API handler layer
// ---------------------------------------------------------------------------

export interface LLMProvider {
    type: ProviderType;
    apiKey?: string;
    /** For openrouter: pre-set to https://openrouter.ai/api/v1; for ollama: http://localhost:11434 */
    baseUrl?: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
    /** API version for Azure OpenAI and compatible enterprise gateways */
    apiVersion?: string;
    /** Enable prompt caching (Anthropic only) */
    promptCachingEnabled?: boolean;
    /** Enable extended thinking (Anthropic only) */
    thinkingEnabled?: boolean;
    /** Thinking budget in tokens */
    thinkingBudgetTokens?: number;
}

/** Convert a CustomModel to LLMProvider for the API handler layer */
export function modelToLLMProvider(model: CustomModel): LLMProvider {
    return {
        type: model.provider,
        model: model.name,
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        maxTokens: model.maxTokens,
        temperature: model.temperature,
        apiVersion: model.apiVersion,
        promptCachingEnabled: model.promptCachingEnabled,
        thinkingEnabled: model.thinkingEnabled,
        thinkingBudgetTokens: model.thinkingBudgetTokens,
    };
}

// ---------------------------------------------------------------------------
// Custom Prompts — user-defined slash-command prompt templates
// ---------------------------------------------------------------------------

export interface CustomPrompt {
    /** Unique identifier */
    id: string;
    /** Display name, e.g. "Tagesbericht" */
    name: string;
    /** Slash-command trigger, e.g. "daily-report" → /daily-report */
    slug: string;
    /** Template text — supports {{userInput}} and {{activeFile}} variables */
    content: string;
    /** Whether this prompt appears in autocomplete */
    enabled: boolean;
    /** Optional: restrict this prompt to a specific mode slug. If unset, appears in all modes. */
    mode?: string;
    /** True for prompts shipped with the plugin (cannot be deleted, only disabled) */
    isBuiltIn?: boolean;
}

// ---------------------------------------------------------------------------
// MCP Server configuration
// ---------------------------------------------------------------------------

export interface McpServerConfig {
    /** Transport type. Only HTTP-based transports are supported.
     * stdio is blocked — it spawns host processes outside the sandbox. */
    type: 'sse' | 'streamable-http';
    url?: string;
    headers?: Record<string, string>;
    disabled?: boolean;
    timeout?: number;
    alwaysAllow?: string[];
    /** True for servers shipped with the plugin (cannot be deleted, only disabled) */
    isBuiltIn?: boolean;
}

/** Built-in MCP servers shipped with the plugin.
 * Icons8: streamable-http, no auth needed (free PNG icons, 368K+ icons)
 */
export const BUILTIN_MCP_SERVERS: Record<string, McpServerConfig> = {
    'icons8': {
        type: 'streamable-http',
        url: 'https://mcp.icons8.com/mcp/',
        disabled: false,
        timeout: 60,
        isBuiltIn: true,
    },
};

// ---------------------------------------------------------------------------
// Agent Mode configuration
// ---------------------------------------------------------------------------

/** Logical tool groups — controls which tools are available in a mode */
export type ToolGroup = 'read' | 'vault' | 'edit' | 'web' | 'agent' | 'mcp' | 'skill';

export interface ModeConfig {
    /** URL-safe identifier (e.g. "researcher", "daily-writer") */
    slug: string;
    /** Display name shown in UI */
    name: string;
    /** Lucide icon name */
    icon: string;
    /** Short description shown in mode selector */
    description: string;
    /** Core role definition injected into system prompt */
    roleDefinition: string;
    /** Hint for the Orchestrator when deciding which mode to delegate to */
    whenToUse?: string;
    /** User-editable extra instructions appended after roleDefinition */
    customInstructions?: string;
    /** Which tool groups are available in this mode */
    toolGroups: ToolGroup[];
    /**
     * 'built-in'  — ships with the plugin (not user-editable)
     * 'global'    — user-created, stored in ~/.obsidian-agent/modes.json (all vaults)
     * 'vault'     — user-created, stored in this vault's plugin settings (this vault only)
     */
    source: 'built-in' | 'global' | 'vault';
}

// ---------------------------------------------------------------------------
// Auto-approval config (Sprint 1.3)
// ---------------------------------------------------------------------------

export interface AutoApprovalConfig {
    /** Master toggle: when false, all write operations require manual approval */
    enabled: boolean;
    /** Show the quick-toggle bar inside the chat view */
    showMenuInChat: boolean;
    /** Auto-approve read operations (read_file, list_files, search_files, ...) */
    read: boolean;
    /**
     * @deprecated — migrated to noteEdits + vaultChanges.
     * Kept as optional for the migration pass in loadSettings().
     */
    write?: boolean;
    /** Auto-approve note content changes (write_file, edit_file, append_to_file, update_frontmatter) */
    noteEdits: boolean;
    /** Auto-approve vault structural changes (create_folder, delete_file, move_file) */
    vaultChanges: boolean;
    /** Auto-approve web operations (web_fetch, web_search) */
    web: boolean;
    /** Auto-approve MCP tool calls */
    mcp: boolean;
    /** Auto-approve mode switching (switch_mode) */
    mode: boolean;
    /** Auto-approve spawning subtasks (new_task) */
    subtasks: boolean;
    /** Auto-approve ask_followup_question (skips approval card, shows question card directly) */
    question: boolean;
    /** Auto-approve update_todo_list */
    todo: boolean;
    /** Auto-approve skills injection into context (future) */
    skills: boolean;
    /** Auto-approve plugin API read calls (built-in allowlist, isWrite=false) */
    pluginApiRead: boolean;
    /** Auto-approve plugin API write calls (built-in allowlist, isWrite=true) */
    pluginApiWrite: boolean;
    /** Auto-approve recipe execution */
    recipes: boolean;
    /** Auto-approve sandbox code execution (evaluate_expression). Off by default — high risk. */
    sandbox: boolean;
}

/** Legacy — kept for backwards compat */
export interface AutoApprovalRules {
    readOperations: boolean;
    writeToTempFiles: boolean;
    maxRequestsPerSession?: number;
    whitelistedPaths?: string[];
}

// ---------------------------------------------------------------------------
// Web Tools Settings (Phase 1.1)
// ---------------------------------------------------------------------------

export type WebSearchProvider = 'brave' | 'tavily' | 'none';

export interface WebToolsSettings {
    /** Master toggle — when false, web_fetch and web_search are disabled */
    enabled: boolean;
    /** Search provider (required for web_search) */
    provider: WebSearchProvider;
    /** Brave Search API key */
    braveApiKey: string;
    /** Tavily Search API key */
    tavilyApiKey: string;
}

// ---------------------------------------------------------------------------
// Advanced API Settings (Sprint 1.5)
// ---------------------------------------------------------------------------

export interface AdvancedApiSettings {
    /** Stop agent after N consecutive errors (0 = disabled) */
    consecutiveMistakeLimit: number;
    /** Minimum milliseconds between API requests (0 = no limit) */
    rateLimitMs: number;
    /** Automatically summarize conversation when estimated tokens exceed threshold */
    condensingEnabled: boolean;
    /** Percentage of model context window at which to trigger condensing (50–95) */
    condensingThreshold: number;
    /** Inject a mode-role reminder every N iterations to keep the model on track (0 = disabled) */
    powerSteeringFrequency: number;
    /** Maximum iterations per message before the agent stops (5–50, default 25) */
    maxIterations: number;
    /** Maximum sub-agent nesting depth (1 = no grandchildren, 2 = one level of grandchildren) */
    maxSubtaskDepth: number;
}

// ---------------------------------------------------------------------------
// Memory Settings
// ---------------------------------------------------------------------------

export interface MemorySettings {
    /** Master toggle — when false, no memory extraction happens */
    enabled: boolean;
    /** Automatically extract session summaries when a conversation ends */
    autoExtractSessions: boolean;
    /** Promote durable facts from session summaries to long-term memory files */
    autoUpdateLongTerm: boolean;
    /** Model key for extraction LLM calls (picks from activeModels[]) */
    memoryModelKey: string;
    /** Minimum total messages (user + assistant) before extraction triggers */
    extractionThreshold: number;
}

// ---------------------------------------------------------------------------
// Chat-Linking settings (ADR-022)
// ---------------------------------------------------------------------------

export interface ChatLinkingSettings {
    /** Master toggle: auto-link chats in frontmatter of edited notes + semantic titling */
    enabled: boolean;
    /** Model key for semantic title generation (picks from activeModels[]) */
    titlingModelKey: string;
}

// ---------------------------------------------------------------------------
// Main plugin settings
// ---------------------------------------------------------------------------

export interface ObsidianAgentSettings {
    /**
     * Configured LLM models. Cloud providers (anthropic, openai, openrouter, azure)
     * send vault content to external servers. For privacy-sensitive vaults, prefer
     * local providers (ollama, lmstudio).
     */
    activeModels: CustomModel[];
    activeModelKey: string;

    // Legacy provider settings (kept for backwards compat, not used in new UI)
    defaultProvider: string;
    providers: Record<string, LLMProvider>;

    // MCP Servers
    mcpServers: Record<string, McpServerConfig>;

    // Modes
    currentMode: string;
    customModes: ModeConfig[];
    /** Per-mode model override: maps mode slug → model key. Falls back to activeModelKey if not set. */
    modeModelKeys: Record<string, string>;
    /** Instructions appended to the system prompt for ALL modes */
    globalCustomInstructions: string;
    /**
     * Permanent per-mode tool overrides: maps mode slug → explicit list of enabled tool names.
     * When set, only the listed tools are available (intersection with mode's tool groups).
     * When absent, all tools in the mode's groups are available.
     */
    modeToolOverrides: Record<string, string[]>;
    /**
     * MCP server whitelist: which configured MCP servers are active.
     * Empty array = all configured servers are allowed (when use_mcp_tool is enabled).
     * Non-empty array = only listed server names are allowed.
     */
    activeMcpServers: string[];
    /**
     * @deprecated Use modeSkillAllowList instead.
     * Permanent per-mode forced skill names: maps mode slug → skill names to always inject.
     */
    forcedSkills: Record<string, string[]>;
    /**
     * Per-mode skill allow-list: maps mode slug → allowed skill names.
     * Missing entry or empty array = all skills allowed (default).
     * Non-empty array = only listed skills are available in that mode.
     */
    modeSkillAllowList: Record<string, string[]>;
    /**
     * Permanent per-mode forced workflow slug: maps mode slug → workflow slug.
     * When set, this workflow is applied to each message (unless message starts with /).
     */
    forcedWorkflow: Record<string, string>;
    /**
     * Per-mode MCP server whitelist: maps mode slug → allowed server names.
     * Missing entry or empty array = all configured servers allowed.
     */
    modeMcpServers: Record<string, string[]>;

    // Approval (Sprint 1.3)
    autoApproval: AutoApprovalConfig;
    /** @deprecated use autoApproval */
    autoApprovalRules: AutoApprovalRules;

    // Advanced API (Sprint 1.5)
    advancedApi: AdvancedApiSettings;

    // Semantic Index
    enableSemanticIndex: boolean;
    embeddingModel: string; // legacy — kept for backwards compat
    embeddingModels: CustomModel[];
    activeEmbeddingModelKey: string;
    semanticBatchSize: number;
    semanticAutoIndex: 'startup' | 'mode-switch' | 'never';
    semanticExcludedFolders: string[];
    semanticStorageLocation: 'obsidian-sync' | 'local' | 'global';
    semanticIndexPdfs: boolean;
    /** Chunk size in characters. Changing this invalidates and rebuilds the index. */
    semanticChunkSize: number;
    /** Contextual Retrieval: prepend LLM-generated context prefix to each chunk before embedding (ADR-051 Stufe 0). */
    enableContextualRetrieval: boolean;
    /** Model key for contextual prefix generation (picks from activeModels[]). */
    contextualModelKey: string;
    /** HyDE: generate a hypothetical document before embedding the query. Off by default (costs 1 extra LLM call per search). */
    hydeEnabled: boolean;
    /** Auto-index vault files as they change (modify/create/delete/rename). Off by default — can slow down Obsidian if using a local embedding model. */
    semanticAutoIndexOnChange: boolean;

    // Graph Expansion (FEATURE-1502)
    /** Enable graph-based search expansion via Wikilinks and MOC-Properties. */
    enableGraphExpansion: boolean;
    /** Number of hops to follow in the graph (1-3). Higher = more context but slower. */
    graphExpansionHops: number;
    /** Frontmatter property names to extract as MOC edges (e.g. Themen, Konzepte). */
    mocPropertyNames: string[];

    // Implicit Connections (FEATURE-1503)
    /** Enable implicit connection discovery (semantically similar notes without explicit links). */
    enableImplicitConnections: boolean;
    /** Minimum cosine similarity threshold for implicit connections (0.5-0.9). */
    implicitThreshold: number;
    /** Show implicit connection suggestions in the sidebar. */
    enableSuggestionBanner: boolean;

    // Local Reranking (FEATURE-1504)
    /** Enable local cross-encoder reranking of search results (requires ~23MB model download). */
    enableReranking: boolean;
    /** Number of candidates to rerank (more = better quality but slower). */
    rerankCandidates: number;

    // MCP Server (EPIC-014)
    /** Enable the MCP Server for Claude Desktop/Code integration. */
    enableMcpServer: boolean;
    /** Enable remote relay connection for claude.ai, ChatGPT, etc. */
    enableRemoteRelay: boolean;
    /** Cloudflare relay URL (e.g. https://obsilo-relay.xxx.workers.dev). */
    relayUrl: string;
    /** Shared secret token for relay authentication. */
    relayToken: string;
    /** Auth token for local MCP server (auto-generated, encrypted via SafeStorage). */
    mcpServerToken: string;
    /** Cloudflare API token for relay deployment. Encrypted via SafeStorage. */
    cloudflareApiToken: string;
    /** Cloudflare account ID (auto-detected during deploy). */
    cloudflareAccountId: string;

    // Checkpoints (Sprint 1.4)
    enableCheckpoints: boolean;
    checkpointTimeoutSeconds: number;
    checkpointAutoCleanup: boolean;

    // Web Tools (Phase 1.1)
    webTools: WebToolsSettings;

    // Chat History & Memory
    /** Enable persistent chat history (conversations saved in plugin directory) */
    enableChatHistory: boolean;
    /** Memory system settings (session extraction, long-term memory, etc.) */
    memory: MemorySettings;
    /** Chat-Linking: auto-stamp frontmatter + semantic titling (ADR-022) */
    chatLinking: ChatLinkingSettings;
    /** @deprecated — migrated to enableChatHistory. Kept for migration. */
    chatHistoryFolder: string;

    // UI
    autoAddActiveFileContext: boolean;
    /** Press Enter to send (Shift+Enter for newline). When false, Ctrl/Cmd+Enter sends. */
    sendWithEnter: boolean;
    /** Inject current date and time into the system prompt */
    includeCurrentTimeInContext: boolean;
    /** Display context window usage progress bar in sidebar (restart sidebar to apply) */
    showContextProgress: boolean;

    // Rules (Sprint 3.2) — per-file enabled/disabled toggles
    // key: vault-relative path, value: true=enabled (default), false=disabled
    rulesToggles: Record<string, boolean>;

    // Workflows (Sprint 3.3) — per-file enabled/disabled toggles
    workflowToggles: Record<string, boolean>;

    // Manual Skills — per-path enabled/disabled toggles
    manualSkillToggles: Record<string, boolean>;

    // Custom Prompts — user-defined slash-command templates
    customPrompts: CustomPrompt[];

    // VaultDNA — Plugin-as-Skill (PAS-1)
    vaultDNA: VaultDNASettings;

    // Plugin API (PAS-1.5)
    pluginApi: PluginApiSettings;

    // Recipes (PAS-1.5)
    recipes: RecipeSettings;

    // Visual Intelligence (FEATURE-1115)
    visualIntelligence: VisualIntelligenceSettings;

    // Agent Skill Mastery (ADR-016/017/018)
    mastery: MasterySettings;

    // Onboarding
    onboarding: OnboardingSettings;

    // Language (i18n)
    language: import('../i18n/types').Language;

    // Security
    /** Sandbox execution backend: auto (Desktop=process, Mobile=iframe), process, iframe (ADR-021) */
    sandboxMode: 'auto' | 'process' | 'iframe';
    /** Whether API keys in data.json are encrypted via Electron safeStorage (ADR-019) */
    _encrypted?: boolean;
    /** Whether data has been migrated to global storage (~/.obsidian-agent/) — ADR-020 */
    _globalStorageMigrated?: boolean;
    /** Whether sync data has been migrated from plugin-dir to .obsilo-sync/ */
    _syncDirMigrated?: boolean;
    /** Whether data has been migrated from ~/.obsidian-agent/ to {vault-parent}/.obsidian-agent/ (FEATURE-1508) */
    _parentDirMigrated?: boolean;

    // Task Extraction (FEATURE-100, ADR-026/027/028)
    taskExtraction: import('../core/tasks/types').TaskExtractionSettings;

    // GitHub Copilot (ADR-038)
    /** GitHub OAuth access token (long-lived, encrypted via SafeStorageService) */
    githubCopilotAccessToken: string;
    /** Copilot API token (short-lived, ~1h, encrypted via SafeStorageService) */
    githubCopilotToken: string;
    /** Copilot token expiry as epoch seconds (not encrypted) */
    githubCopilotTokenExpiresAt: number;
    /** Custom OAuth Client ID — escape hatch if the default stops working */
    githubCopilotCustomClientId: string;

    // Kilo Gateway (ADR-041)
    /** Kilo session token (encrypted via SafeStorageService) */
    kiloToken: string;
    /** Auth mode used to obtain the token */
    kiloAuthMode: 'device-auth' | 'manual-token' | '';
    /** Organization ID for X-KiloCode-OrganizationId header (optional) */
    kiloOrganizationId: string;
    /** Display label from Kilo profile (not sensitive, not encrypted) */
    kiloAccountLabel: string;
    /** Epoch seconds of last successful token validation */
    kiloLastValidatedAt: number;

    // Advanced
    debugMode: boolean;
}

// ---------------------------------------------------------------------------
// Plugin API Settings (PAS-1.5, ADR-108)
// ---------------------------------------------------------------------------

export interface PluginApiSettings {
    /** Master toggle for plugin API calls (default: true — runs in JS sandbox) */
    enabled: boolean;
    /**
     * Per-method safe overrides for dynamically discovered methods.
     * Key: "pluginId:methodName", value: true = treat as read (auto-approvable).
     * Only relevant for methods NOT in the built-in allowlist.
     */
    safeMethodOverrides: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Visual Intelligence Settings (FEATURE-1115)
// ---------------------------------------------------------------------------

export interface VisualIntelligenceSettings {
    /** Master toggle — when true, render_presentation tool is available */
    enabled: boolean;
    /** Custom LibreOffice path override (for non-standard installations) */
    libreOfficePath?: string;
    /** User has approved multimodal template analysis (LibreOffice rendering + Claude Vision API calls) */
    multimodalAnalysisApproved: boolean;
}

// ---------------------------------------------------------------------------
// Recipe Settings (PAS-1.5, ADR-109)
// ---------------------------------------------------------------------------

export interface RecipeSettings {
    /** Master toggle — default false (opt-in) */
    enabled: boolean;
    /** Per-recipe toggle: maps recipe id → boolean. Missing = enabled by default. */
    recipeToggles: Record<string, boolean>;
    /** User-defined custom recipes (validated on load) */
    customRecipes: import('../core/tools/agent/recipeRegistry').Recipe[];
}

// ---------------------------------------------------------------------------
// Onboarding Settings
// ---------------------------------------------------------------------------

export type OnboardingStep = 'backup' | 'profile' | 'model' | 'permissions' | 'done';

export interface OnboardingSettings {
    /** true when setup has been fully completed */
    completed: boolean;
    /** Current step in the setup flow */
    currentStep: OnboardingStep;
    /** Steps the user chose to skip */
    skippedSteps: OnboardingStep[];
    /** ISO timestamp when setup was started */
    startedAt: string;
}

// ---------------------------------------------------------------------------
// Mastery Settings (ADR-016/017/018 — Agent Skill Mastery)
// ---------------------------------------------------------------------------

export interface MasterySettings {
    /** Master toggle for the procedural recipe system */
    enabled: boolean;
    /** Maximum chars for recipe section in system prompt (default: 2000) */
    recipeBudget: number;
    /** Enable learned recipes from episodic memory */
    learnedRecipesEnabled: boolean;
    /** Per-recipe toggle: maps recipe id -> boolean. Missing = enabled by default. */
    recipeToggles: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// VaultDNA Settings (PAS-1)
// ---------------------------------------------------------------------------

export interface VaultDNASettings {
    /** Master toggle for plugin-as-skill discovery */
    enabled: boolean;
    /** Per-plugin agent-side toggle: maps plugin-id -> boolean (default: true) */
    skillToggles: Record<string, boolean>;
    /** ISO timestamp of last full scan */
    lastScanAt: string;
}

export const DEFAULT_SETTINGS: ObsidianAgentSettings = {
    activeModels: [],
    activeModelKey: '',

    defaultProvider: 'anthropic',
    providers: {},

    mcpServers: {},
    currentMode: 'agent',
    customModes: [],
    modeModelKeys: {},
    globalCustomInstructions: '',
    modeToolOverrides: {},
    activeMcpServers: [],
    forcedSkills: {},
    modeSkillAllowList: {},
    forcedWorkflow: {},
    modeMcpServers: {},

    autoApproval: {
        enabled: false,
        showMenuInChat: true,
        read: true,         // reads are always safe
        noteEdits: false,
        vaultChanges: false,
        web: false,
        mcp: false,
        mode: false,
        subtasks: false,
        question: true,
        todo: true,
        skills: false,
        pluginApiRead: true,
        pluginApiWrite: false,
        recipes: false,
        sandbox: false,
    },
    autoApprovalRules: {
        readOperations: true,
        writeToTempFiles: false,
        maxRequestsPerSession: undefined,
        whitelistedPaths: [],
    },

    advancedApi: {
        consecutiveMistakeLimit: 3,
        rateLimitMs: 0,
        condensingEnabled: true,
        condensingThreshold: 80,
        powerSteeringFrequency: 0,
        maxIterations: 25,
        maxSubtaskDepth: 2,
    },

    enableSemanticIndex: false,
    embeddingModel: '',
    embeddingModels: [],
    activeEmbeddingModelKey: '',
    semanticBatchSize: 20,
    semanticAutoIndex: 'never',
    semanticExcludedFolders: [],
    semanticStorageLocation: 'global',
    semanticIndexPdfs: false,
    semanticChunkSize: 2000,
    enableContextualRetrieval: true,
    contextualModelKey: '',
    hydeEnabled: false,
    semanticAutoIndexOnChange: false,
    enableGraphExpansion: true,
    graphExpansionHops: 1,
    mocPropertyNames: ['Themen', 'Konzepte', 'Personen', 'Notizen', 'Meeting-Notes', 'Quellen'],
    enableImplicitConnections: true,
    implicitThreshold: 0.7,
    enableSuggestionBanner: true,
    enableReranking: true,
    rerankCandidates: 20,
    enableMcpServer: false,
    enableRemoteRelay: false,
    relayUrl: '',
    relayToken: '',
    mcpServerToken: '',
    cloudflareApiToken: '',
    cloudflareAccountId: '',

    enableCheckpoints: true,
    checkpointTimeoutSeconds: 30,
    checkpointAutoCleanup: true,

    webTools: {
        enabled: false,
        provider: 'none',
        braveApiKey: '',
        tavilyApiKey: '',
    },

    enableChatHistory: true,
    memory: {
        enabled: true,
        autoExtractSessions: true,
        autoUpdateLongTerm: true,
        memoryModelKey: '',
        extractionThreshold: 6,
    },
    chatLinking: {
        enabled: true,
        titlingModelKey: '',
    },
    chatHistoryFolder: '',

    autoAddActiveFileContext: true,
    sendWithEnter: true,
    includeCurrentTimeInContext: true,
    showContextProgress: false,
    rulesToggles: {},
    workflowToggles: {},
    manualSkillToggles: {},
    customPrompts: [],
    vaultDNA: {
        enabled: true,
        skillToggles: {},
        lastScanAt: '',
    },
    pluginApi: {
        enabled: true,
        safeMethodOverrides: {},
    },
    recipes: {
        enabled: true,
        recipeToggles: {},
        customRecipes: [],
    },
    visualIntelligence: {
        enabled: true,
        multimodalAnalysisApproved: false,
    },
    mastery: {
        enabled: true,
        recipeBudget: 2000,
        learnedRecipesEnabled: true,
        recipeToggles: {},
    },
    onboarding: {
        completed: false,
        currentStep: 'backup',
        skippedSteps: [],
        startedAt: '',
    },
    language: 'en',
    sandboxMode: 'auto',
    taskExtraction: {
        enabled: true,
        taskFolder: 'Tasks',
        preferTaskNotesPlugin: true,
        taskNotesHintDismissed: false,
    },
    githubCopilotAccessToken: '',
    githubCopilotToken: '',
    githubCopilotTokenExpiresAt: 0,
    githubCopilotCustomClientId: '',
    kiloToken: '',
    kiloAuthMode: '',
    kiloOrganizationId: '',
    kiloAccountLabel: '',
    kiloLastValidatedAt: 0,
    debugMode: false,
};
