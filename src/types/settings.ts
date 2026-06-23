/**
 * Plugin Settings
 */

import type { EffortLevel } from './model-registry';

// ---------------------------------------------------------------------------
// CustomModel — single unified model entry (replaces per-provider LLMProvider)
// Adapted from Obsidian Copilot's CustomModel pattern
// ---------------------------------------------------------------------------

export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'openrouter' | 'azure' | 'custom' | 'github-copilot' | 'kilo-gateway' | 'bedrock' | 'chatgpt-oauth';

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
    /**
     * Enable prompt caching for providers that support it.
     * Default-on at runtime via modelToLLMProvider() (undefined !== false -> true).
     * UI-visibility is gated by the provider/model capability table
     * (see src/api/capabilities.ts). IMP-18-01-01.
     */
    promptCachingEnabled?: boolean;
    /** Enable extended thinking (Anthropic only). Forces temperature to 1. */
    thinkingEnabled?: boolean;
    /** Thinking budget in tokens (used when thinkingEnabled is true, default 10000) */
    thinkingBudgetTokens?: number;
    /** Native reasoning-effort level for effort-capable models; undefined sends no effort field. */
    reasoningEffort?: EffortLevel;
    /** AWS region (Bedrock only), e.g. "eu-central-1", "us-east-1" */
    awsRegion?: string;
    /** Auth mode for Bedrock: 'api-key' uses a single bearer token (new AWS Bedrock API Keys),
     * 'access-key' uses the classic IAM access key + secret key pair with SigV4 signing,
     * 'gateway' (FEAT-26-07) routes through an enterprise API-Gateway that proxies the
     * Bedrock ConverseStream API and replaces AWS-signing with a configurable header. */
    awsAuthMode?: 'api-key' | 'access-key' | 'gateway';
    /** AWS Bedrock API key (bearer token). Used when awsAuthMode === 'api-key'. */
    awsApiKey?: string;
    /** AWS IAM access key ID. Used when awsAuthMode === 'access-key'. */
    awsAccessKey?: string;
    /** AWS IAM secret access key. Used when awsAuthMode === 'access-key'. */
    awsSecretKey?: string;
    /** Optional AWS session token for temporary credentials from SSO/STS (access-key mode only) */
    awsSessionToken?: string;
    /** FEAT-26-07: header name carrying the gateway subscription key (e.g. 'Ocp-Apim-Subscription-Key').
     * Used when awsAuthMode === 'gateway' (Bedrock) or useGateway === true (Anthropic). */
    gatewayHeaderName?: string;
    /** FEAT-26-07: subscription-key value sent in `gatewayHeaderName`.
     * Treated as a credential -- encrypted at rest like the AWS credentials. */
    gatewayHeaderValue?: string;
    /** FEAT-26-07 follow-up: opt into the enterprise-gateway code path for
     * non-AWS providers (e.g. Anthropic via Azure APIM). When true, the
     * provider switches to Node-fetch (CORS bypass) and sends the configured
     * `gatewayHeaderName`/`gatewayHeaderValue` pair as the auth header. */
    useGateway?: boolean;
}

/**
 * Brand labels for provider types. Used by the settings UI and the
 * EPIC-26 migration so display names are consistently the human-readable
 * brand string, not the lowercase enum value.
 */
const PROVIDER_BRAND_LABELS: Record<ProviderType, string> = {
    anthropic:        'Anthropic',
    openai:           'OpenAI',
    gemini:           'Google Gemini',
    ollama:           'Ollama',
    lmstudio:         'LM Studio',
    openrouter:       'OpenRouter',
    azure:            'Azure OpenAI',
    'github-copilot': 'GitHub Copilot',
    'kilo-gateway':   'Kilo Gateway',
    bedrock:          'Amazon Bedrock',
    'chatgpt-oauth':  'ChatGPT (OAuth)',
    custom:           'Custom',
};

export function getProviderBrandLabel(provider: ProviderType): string {
    return PROVIDER_BRAND_LABELS[provider] ?? provider;
}

/**
 * EPIC-26 / FEAT-26-02 -- user-facing labels for the three model tiers.
 * The internal ids (`fast` / `mid` / `flagship`) stay because they are
 * keyed in settings, profiles, telemetry, and the consult_flagship tool
 * name -- renaming them would be a breaking change. Only the display
 * labels switch to a more product-y "Budget / Premium / Frontier" framing.
 */
const TIER_BADGE_LABELS: Record<'fast' | 'mid' | 'flagship', string> = {
    fast:     'Budget',
    mid:      'Main',
    flagship: 'Frontier',
};

export function getTierBadgeLabel(tier: 'fast' | 'mid' | 'flagship'): string {
    return TIER_BADGE_LABELS[tier];
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
    },
    {
        name: 'gpt-4o-mini',
        provider: 'openai',
        displayName: 'GPT-4o mini',
        enabled: false,
        isBuiltIn: true,
    },
    {
        name: 'gpt-4.1',
        provider: 'openai',
        displayName: 'GPT-4.1',
        enabled: false,
        isBuiltIn: true,
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
    },
    {
        name: 'openai/gpt-4o',
        provider: 'openrouter',
        displayName: 'GPT-4o',
        enabled: false,
        isBuiltIn: true,
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
    },
    {
        name: 'gemini-2.5-pro',
        provider: 'gemini',
        displayName: 'Gemini 2.5 Pro',
        enabled: false,
        isBuiltIn: true,
    },
    // GitHub Copilot (unofficial API — requires active Copilot subscription)
    {
        name: 'gpt-4o',
        provider: 'github-copilot',
        displayName: 'GPT-4o (Copilot)',
        enabled: false,
        isBuiltIn: true,
    },
    {
        name: 'claude-sonnet-4',
        provider: 'github-copilot',
        displayName: 'Claude Sonnet 4 (Copilot)',
        enabled: false,
        isBuiltIn: true,
    },
    // Cohere (custom provider, OpenAI compatibility endpoint -- needs a Cohere API key)
    {
        name: 'command-a-03-2025',
        provider: 'custom',
        displayName: 'Cohere Command A',
        baseUrl: 'https://api.cohere.ai/compatibility/v1',
        enabled: false,
        isBuiltIn: true,
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
    /** Native reasoning-effort level for effort-capable models; undefined sends no effort field. */
    reasoningEffort?: EffortLevel;
    /** AWS region (Bedrock only) */
    awsRegion?: string;
    /** Bedrock auth mode (FEAT-26-07 adds 'gateway') */
    awsAuthMode?: 'api-key' | 'access-key' | 'gateway';
    /** Bedrock API key (bearer token) */
    awsApiKey?: string;
    /** AWS access key ID (Bedrock only) */
    awsAccessKey?: string;
    /** AWS secret access key (Bedrock only) */
    awsSecretKey?: string;
    /** AWS session token (Bedrock only, optional) */
    awsSessionToken?: string;
    /** FEAT-26-07: header name for enterprise gateway auth */
    gatewayHeaderName?: string;
    /** FEAT-26-07: subscription-key value sent in `gatewayHeaderName` */
    gatewayHeaderValue?: string;
    /** FEAT-26-07: enterprise gateway opt-in for non-AWS providers. */
    useGateway?: boolean;
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
        // Default-on: undefined acts as true. Explicit false stays false.
        // The actual UI-visibility and provider-side cache wiring is gated by
        // src/api/capabilities.ts; this only flips the user preference default.
        promptCachingEnabled: model.promptCachingEnabled !== false,
        thinkingEnabled: model.thinkingEnabled,
        thinkingBudgetTokens: model.thinkingBudgetTokens,
        reasoningEffort: model.reasoningEffort,
        awsRegion: model.awsRegion,
        awsAuthMode: model.awsAuthMode,
        awsApiKey: model.awsApiKey,
        awsAccessKey: model.awsAccessKey,
        awsSecretKey: model.awsSecretKey,
        awsSessionToken: model.awsSessionToken,
        gatewayHeaderName: model.gatewayHeaderName,
        gatewayHeaderValue: model.gatewayHeaderValue,
        useGateway: model.useGateway,
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
    /** AUDIT-034 M-14: opt out of the SSRF guard for this server (allow loopback / RFC 1918). */
    allowLocalUrls?: boolean;
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
    /** Percentage of model context window at which to trigger condensing (50-95) */
    condensingThreshold: number;
    /** Inject a mode-role reminder every N iterations to keep the model on track (0 = disabled) */
    powerSteeringFrequency: number;
    /** Maximum iterations per message before the agent stops (5-50, default 25) */
    maxIterations: number;
    /** Maximum sub-agent nesting depth (1 = no grandchildren, 2 = one level of grandchildren) */
    maxSubtaskDepth: number;
    /**
     * FEAT-24-04 / ADR-113: hard per-call token budget for the `new_task`
     * message payload. If the estimated tokens (chars / 4) of the spawn
     * message exceed this number, new_task returns a tool error with ist
     * and soll so the model can trim the message and retry. Prevents a
     * subagent from starting with an already overfull request. Default 8000.
     */
    subtaskTokenBudget: number;
    /**
     * FEAT-24-02 (ADR-12 amendment): prune old tool_result contents to skeletons
     * at turn boundaries. Stops the dominant history-growth driver (accumulating
     * read/search results). Additive to condensing. Default true.
     */
    microcompactionEnabled?: boolean;
    /**
     * FEAT-24-02: fold the oldest part of the conversation into a running summary
     * once estimated tokens exceed this % of the context window — earlier and
     * gentler than full condensing (`condensingThreshold`). Effective only below
     * `condensingThreshold`. Generous default (50) so short sessions are untouched.
     */
    rollingSummaryThreshold?: number;
    /**
     * FEAT-24-05: when a running task's (would-be) API cost reaches this many
     * EUR, the cost footer in the sidebar gets a visible warning style. 0
     * disables the warning. Default 0 (disabled) -- many users find the
     * orange warning more noisy than helpful for routine work; opt-in via
     * settings/update_settings if desired.
     */
    costWarnThresholdEur?: number;
    /**
     * Telemetry opt-in: persist a 200-char preview of the user's message
     * with each task's telemetry entry (.obsidian-agent/telemetry/tasks.jsonl).
     * AUDIT-013 M-2: defaults to false because the telemetry file lives
     * inside the vault and may be synced or shared. Tokens, cost, model id
     * and tool sequence are recorded regardless of this flag.
     */
    telemetryRecordPromptPreview?: boolean;
}

// ---------------------------------------------------------------------------
// Memory Settings
// ---------------------------------------------------------------------------

export interface MemorySettings {
    /** Master toggle — when false, no memory extraction happens */
    enabled: boolean;
    /** Automatically extract session summaries when a conversation ends */
    autoExtractSessions: boolean;
    /** Model key for extraction LLM calls (picks from activeModels[]) */
    memoryModelKey: string;
    /** Minimum total messages (user + assistant) before extraction triggers */
    extractionThreshold: number;
    /**
     * Memory v2 migration state (FEATURE-0316).
     * - `not-applicable`: fresh install, never had v1 memory MDs -> Memory v2 is the only path
     * - `pending`: v1 user upgraded but has not yet decided
     * - `completed`: migration ran successfully (timestamp + counts in v2MigrationReport)
     * - `skipped`: user chose "Later" in the upgrade modal
     */
    v2MigrationStatus: 'not-applicable' | 'pending' | 'completed' | 'skipped';
    /** ISO timestamp + counts of the last successful migration run (null if never). */
    v2MigrationReport: {
        completedAt: string;
        factsInserted: number;
        stylesInserted: number;
        backupFolder: string;
    } | null;
    /**
     * Persistent state for TokenBudgetGuard (FEATURE-0318). Holds the
     * current day's running tally of input + output tokens consumed by
     * the memory pipeline. Auto-resets at midnight via guard.snapshot().
     */
    tokenBudgetState?: {
        day: string;
        inputTokens: number;
        outputTokens: number;
    } | null;

    /**
     * Hash of the last-synced CapabilityManifest (FEATURE-0319b).
     * On each plugin onload the live manifest is hashed and compared;
     * mismatch triggers a soul-snapshot rebuild (deprecate old, insert new).
     */
    lastCapabilityHash?: string | null;

    /**
     * ISO timestamp of the last AgingService run (FEATURE-0319 Phase 5).
     * Aging short-circuits when called less than 24h after this stamp,
     * so a flurry of plugin reloads doesn't repeatedly decay facts.
     */
    lastAgingRunAt?: string | null;

    /**
     * Throttle window between automatic re-extracts of the same
     * conversation (FEATURE-0319 Phase 5). Manual saves (Star button,
     * mark_for_memory tool) bypass the throttle. Default 60_000 ms.
     */
    reExtractThrottleMs?: number;

    /**
     * BA-26 / FEAT-23-04: Cross-Surface AI Workflow settings.
     * Controls Auto-Sync vs Manual-Sync per provider for MCP-saved
     * conversations. Privacy-sichere Defaults: chatgpt + perplexity
     * + unknown auf manual (Familien-Account-Use-Case Sebastian).
     * Optional: missing block reads as DEFAULT_CROSS_SURFACE_SETTINGS.
     */
    crossSurface?: import('../core/memory/SourceInterface').CrossSurfaceSettings;
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
// EPIC-26 / ADR-122: Provider-only settings schema
// ---------------------------------------------------------------------------

/** Tier slot a model is assigned to. */
export type ModelTier = 'fast' | 'mid' | 'flagship';

/** Source flag for an auto-classified DiscoveredModel.autoTier. */
export type AutoTierSource = 'pattern' | 'capability' | 'pricing' | 'manual';

/**
 * One model returned by a provider's discovery endpoint, enriched with
 * an auto-classified tier. Read-only for the user except when they
 * manually pin it to a slot via tierOverrides.
 */
export interface DiscoveredModel {
    /** Model id as returned by the provider API. */
    id: string;
    /** Optional human-readable label (provider-supplied or derived). */
    displayName?: string;
    /** Context window in tokens (if known from the provider response). */
    contextWindow?: number;
    /** Max output tokens (if known). */
    maxOutputTokens?: number;
    /** USD per 1M prompt tokens (OpenRouter pricing sonderpfad). */
    pricingPromptUsd?: number;
    /** USD per 1M completion tokens. */
    pricingCompletionUsd?: number;
    /** Auto-classified tier (set by ModelTierClassifier on refresh). */
    autoTier?: ModelTier;
    /** How the autoTier was derived (pattern / capability / pricing). */
    autoTierSource?: AutoTierSource;
}

/**
 * One configured provider instance. Different from the legacy
 * `LLMProvider` record because this is per-instance (a user can have
 * two openrouter accounts side by side), and it owns the tier
 * mapping plus the discovered-model cache.
 */
export interface ProviderConfig {
    /** Stable instance id (uuid or slug, e.g. "anthropic-main"). */
    id: string;
    /** Underlying provider type. */
    type: ProviderType;
    /** Human-readable label for the settings UI (optional). */
    displayName?: string;
    /** Master switch for the entire provider instance. */
    enabled: boolean;

    /** Auth: api-key based providers. */
    apiKey?: string;
    /** Auth: custom base URL (azure, custom, ollama, lmstudio). */
    baseUrl?: string;
    /** Auth: Azure / enterprise gateway api-version. */
    apiVersion?: string;
    /** Auth: AWS Bedrock auth mode + credentials. FEAT-26-07 adds 'gateway'. */
    awsAuthMode?: 'api-key' | 'access-key' | 'gateway';
    awsRegion?: string;
    awsApiKey?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    awsSessionToken?: string;
    /** FEAT-26-07: enterprise gateway auth header (name + key value). */
    gatewayHeaderName?: string;
    gatewayHeaderValue?: string;
    /** FEAT-26-07: enterprise gateway opt-in for non-AWS providers. */
    useGateway?: boolean;
    /** Auth: OAuth bearer token (chatgpt-oauth, github-copilot). */
    oauthToken?: string;

    /** Discovered models from the last refresh. Empty until first refresh. */
    discoveredModels: DiscoveredModel[];
    /** Epoch ms of the last successful refresh. 0 = never. */
    lastRefreshAt: number;

    /**
     * Auto-tier slot assignment: maps tier to a discovered-model id.
     * Filled by the DiscoveryService when classifying; user-readable.
     */
    tierMapping: {
        fast?: string;
        mid?: string;
        flagship?: string;
    };
    /**
     * Manual user override per tier. Wins over tierMapping.
     */
    tierOverrides: {
        fast?: string;
        mid?: string;
        flagship?: string;
    };

    /**
     * IMP-20-06-01 W4-T2 / ADR-135: per-provider Zero-Data-Retention
     * affirmation. Default undefined (treated as not-ZDR). When the
     * user flips this on, they confirm with the provider that prompts
     * and completions are NOT retained or used for training. Required
     * before the freshness verifier can escalate to the frontier tier
     * on this provider.
     */
    zdrCapable?: boolean;
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
    /**
     * FEAT-24-07 / ADR-115: optional helper-model key for agent-internal
     * LLM calls (context condensing, fast-path planner/presenter,
     * plan_presentation, recipe-promotion). Empty string means no helper
     * configured; all internal calls run on the main model. Mirrors the
     * per-feature pattern of memoryModelKey / titlingModelKey but as a
     * generic catch-all routed via getHelperApi() in src/core/helper-api.ts.
     */
    helperModelKey: string;

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
     * @deprecated Removed 2026-05-18. Per-mode skill filtering was redundant
     * with toolGroups (a skill cannot call tools its mode lacks) and added
     * UI surface without value. Field is kept for back-compat (loaded as
     * `{}` by the migration in main.ts loadSettings) so existing data.json
     * files do not error.
     */
    modeSkillAllowList: Record<string, string[]>;
    /**
     * Permanent per-mode forced workflow slug: maps mode slug → workflow slug.
     * When set, this workflow is applied to each message (unless message starts with /).
     */
    forcedWorkflow: Record<string, string>;
    /**
     * @deprecated Removed 2026-05-18. Per-agent MCP allow-listing was
     * replaced by the global `activeMcpServers` toggle in the chat-header
     * pocket knife. Field stays for back-compat with old data.json files;
     * loadSettings clears it to `{}` on every load.
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
    /**
     * IMP-06-01-01: post-fix flags so the EmbeddingsTab "Reindex PDFs
     * only" CTA + the post-fix hint modal know whether they need to be
     * shown. Both default false; flipped to true by the corresponding
     * user action (modal dismiss vs. reindex complete) and persisted
     * thereafter. Two flags because "modal dismissed" does NOT mean
     * "reindex done" -- the user may have closed the modal and never
     * actually run the cleanup.
     */
    _pdfReindexHintShown: boolean;
    _pdfReindexCompleted: boolean;
    /** Chunk size in characters. Changing this invalidates and rebuilds the index. */
    semanticChunkSize: number;
    /** Contextual Retrieval: prepend LLM-generated context prefix to each chunk before embedding (ADR-051 Stufe 0). */
    enableContextualRetrieval: boolean;
    /** Model key for contextual prefix generation (picks from activeModels[]). */
    contextualModelKey: string;
    /** HyDE: generate a hypothetical document before embedding the query. Off by default (costs 1 extra LLM call per search). */
    hydeEnabled: boolean;
    /** Weighted RRF fusion: downweight the tag arm (0.6) and blend dense cosine into the final ordering. Off reproduces plain RRF. */
    weightedFusionEnabled: boolean;
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

    // Knowledge Maintenance (FEATURE-1903)
    /** Frontmatter property name that defines the note category (e.g. "Kategorie"). */
    categoryProperty: string;
    /**
     * Frontmatter property name that holds the reciprocal backlink
     * wikilinks (e.g. "Notizen" or "Notes"). Used by the Vault Health
     * repair pass to write the reverse edge into the right key.
     * FIX-19-01-01: was hardcoded to 'Notizen' inside the repair path,
     * causing repairs to land on a different property than the
     * original edge and re-detection on the next health check.
     */
    backlinksProperty: string;
    /** Frontmatter property name for the short summary (e.g. "Zusammenfassung"). */
    summaryProperty: string;
    /** Naming convention for source files (e.g. "Autor-Jahr_Titel"). */
    sourceNamingConvention: string;

    // Synthese → Zettel (FEATURE-1904)
    /** Show "Synthese → Zettel" button on agent messages to save responses as Zettel notes. */
    enableSynthesisButton: boolean;

    // Vault Health Check (FEATURE-1901)
    /** Enable automatic vault health check on startup (orphaned notes, missing links, inconsistencies). */
    enableVaultHealthCheck: boolean;

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
    /**
     * Add the current time-of-day to the system prompt. The calendar date is
     * always included (daily granularity, KV-cache-safe); this opt-in adds the
     * exact time, which changes every call and defeats prompt caching. Default false.
     */
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

    // FEAT-29-09: per-skill versioning (snapshot + restore).
    skillVersioning?: { retentionCount: number };

    // FEAT-29-12: backup/export-tool. Selective ZIP export of plugin
    // state, opt-in auto-daily backup, conflict-aware import.
    backup?: BackupSettings;

    // Plugin API (PAS-1.5)
    pluginApi: PluginApiSettings;

    // Recipes (PAS-1.5)
    recipes: RecipeSettings;

    // Agent Skill Mastery (ADR-016/017/018)
    mastery: MasterySettings;

    // Onboarding
    onboarding: OnboardingSettings;

    // Optional assets (Phase 2)
    optionalAssets?: OptionalAssetsSettings;

    // Security
    /** Sandbox execution backend: auto (Desktop=process, Mobile=iframe), process, iframe (ADR-021) */
    sandboxMode: 'auto' | 'process' | 'iframe';
    /** Whether API keys in data.json are encrypted via Electron safeStorage (ADR-019) */
    _encrypted?: boolean;
    /**
     * AUDIT-034 M-5 / M-15: persistent ack flag for the plaintext-fallback
     * warning. Set to true when the user dismisses the warning banner in
     * ProvidersTab. Suppresses the one-time toast Notice on subsequent
     * plugin loads so the user is not nagged after acknowledging. The
     * persistent banner stays visible regardless so the degraded state is
     * never hidden.
     */
    safeStoragePlaintextFallbackAcknowledged?: boolean;
    /** Whether data has been migrated to global storage (~/.obsidian-agent/) — ADR-020 */
    _globalStorageMigrated?: boolean;
    /** Whether sync data has been migrated from plugin-dir to .obsilo-sync/ */
    _syncDirMigrated?: boolean;
    /** Whether data has been migrated from ~/.obsidian-agent/ to {vault-parent}/.obsidian-agent/ (FEATURE-1508) */
    _parentDirMigrated?: boolean;
    /** Whether the legacy in-vault folders (.obsilo, .obsilo-sync, .obsidian/.obsilo) have been cleaned up. */
    _legacyVaultDirsCleaned?: boolean;
    /** Whether checkpoints/ and dev-env/ have been migrated out of the vault
     *  into the cross-vault GlobalFileService root (2026-05-19 fix for iCloud
     *  sync stalls on mobile). */
    _pluginDataDirsMigrated?: boolean;

    /** FEAT-29-01: layout migration progress. Resumable across plugin reloads.
     *  Phase order: pending -> backup-done -> data-vault-done -> cache-vault-done
     *  -> data-shared-done -> cache-shared-done -> skills-resolved -> cleanup-done
     *  -> settings-done -> complete. */
    _layoutMigrationStatus?:
        | 'pending'
        | 'backup-done'
        | 'data-vault-done'
        | 'cache-vault-done'
        | 'data-shared-done'
        | 'cache-shared-done'
        | 'skills-resolved'
        | 'cleanup-done'
        | 'settings-done'
        | 'complete';

    /** FEAT-29-01: snapshot of chatHistoryFolder before the setting was removed.
     *  Used by the post-migration notice modal so the user can locate their old
     *  vault-folder copy of conversations if they want to clean it up. Cleared
     *  once the notice has been acknowledged. */
    _chatHistoryFolderLegacy?: string;

    /** FEAT-29-01: opt-in flag for the layout migration. The migration is
     *  destructive (moves files across roots, removes legacy folders) and
     *  must not run silently on plugin reload until the dependent services
     *  (GlobalFileService, rulesLoader, workflowLoader, skillsManager, etc.)
     *  have been migrated to the new sub-folder layout in a follow-up commit.
     *  Default false; user must explicitly enable in Settings before the
     *  trigger in plugin.onload picks it up. */
    _layoutMigrationOptIn?: boolean;

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

    // ChatGPT OAuth (EPIC-021, ADR-088, ADR-089)
    /** OAuth access token, encrypted via SafeStorageService (enc:v1:<base64>) */
    chatgptOAuthAccessToken: string;
    /** OAuth refresh token, encrypted */
    chatgptOAuthRefreshToken: string;
    /** ID token (JWT) for account info, encrypted */
    chatgptOAuthIdToken: string;
    /** chatgpt-account-id from id_token claim, sent as request header. Not encrypted. */
    chatgptOAuthAccountId: string;
    /** Email address from id_token claim, shown in settings UI. Not encrypted. */
    chatgptOAuthEmail: string;
    /** Subscription plan tier. Not encrypted. */
    chatgptOAuthPlanTier: 'plus' | 'pro' | 'unknown' | '';
    /** Unix timestamp in milliseconds when access_token expires. Not encrypted. */
    chatgptOAuthExpiresAt: number;
    /** Active model id, default 'gpt-5-codex'. */
    chatgptOAuthModel: string;
    /** Unix milliseconds when user acknowledged the third-party-endpoint disclaimer. 0 = not yet. */
    chatgptOAuthDisclaimerAcknowledgedAt: number;

    // Advanced
    debugMode: boolean;
    /**
     * Vault-relative folder for agent-managed artefacts (plugin skills,
     * vault-dna.json, externalised tmp results, future user skills).
     * Default: ".obsidian-agent". Hidden folder, ignored by Obsidian's index.
     * Existing files are NOT auto-migrated when this changes — see ADR-072.
     * FEATURE-0507 / Issue #26.
     */
    agentFolderPath?: string;

    /**
     * v2.10.0: Default folder for files the agent creates (xlsx, docx, pptx,
     * drawio, excalidraw). When a tool's output_path is just a filename
     * (no slash), the helper resolveOutputPath() prepends this folder.
     * When the model provides a path with a slash, it's used as-is.
     * Default: "Inbox/" so generated files land in a known place.
     */
    defaultOutputFolder: string;

    /**
     * v2.10.0: Auto-route simple tool tasks to the helper model.
     *
     * When enabled (and a helperModel is configured), the TaskRouter
     * classifies the first user prompt of each task via regex heuristic;
     * "simple" tasks (office-file creation, single-file read/write) run
     * on the helper model. "Complex" tasks (research, multi-step
     * synthesis) and unclassifiable prompts stay on the main model.
     *
     * The router escalates back to the main model after two consecutive
     * tool errors so a weaker model never gets stuck.
     *
     * Default: true. When the user has no helperModel set, the router
     * silently does nothing.
     */
    autoTaskRouter: {
        enabled: boolean;
    };

    /**
     * Always use the compact system-prompt variants (EPIC-26 lean cost
     * heuristics + lean plugin-skill catalogue) to save tokens. When false,
     * the lean variants are chosen by routing heuristics only.
     *
     * Default: false (current behaviour preserved).
     */
    leanSystemPrompt: boolean;

    /** BA-25: Vault-Ingest-Pflege (Note-Summary, Frontmatter, Auto-Trigger, PDF). */
    vaultIngest: VaultIngestSettings;

    /** IMP-20-06-01: FEAT-20-06 Stage 4+5 verifier settings. */
    freshness: FreshnessSettings;

    /** IMP-19-01-01: FEAT-19-01 Vault Health auto-apply rule-based repairs. */
    vaultHealth: VaultHealthSettings;

    // ----------------------------------------------------------------------
    // EPIC-26: Advisor-Pattern + Provider-only setup (ADR-120 .. ADR-123)
    // ----------------------------------------------------------------------

    /**
     * EPIC-26 / ADR-122: configured providers in the new provider-only
     * schema. Each entry is a per-instance ProviderConfig with discovered
     * models and tier mapping. PLAN-25 fills this via auto-migration from
     * `activeModels[]`. Until the migration runs (or for fresh installs
     * pre-Welle-2), the array stays empty and tier-resolution falls back
     * to `getActiveModel()`.
     *
     * Naming note: this is `providerConfigs[]` (not `providers[]`) because
     * the legacy field `providers: Record<string, LLMProvider>` already
     * owns the key (PLAN-24 F-4).
     */
    providerConfigs: ProviderConfig[];

    /**
     * EPIC-26 / ADR-122: id of the currently selected provider for the
     * main chat. null = no provider chosen yet (pre-migration state or
     * fresh install).
     */
    activeProviderId: string | null;

    /**
     * EPIC-26 / ADR-122: schema version for the provider-only settings
     * shape. Once a user's data.json has this version, the plugin reads
     * tier-resolution exclusively from `providerConfigs[]`. Missing or
     * older versions stay on the legacy `activeModels[]` path until the
     * Welle-2 migration runs.
     */
    schemaVersion?: string;

    /**
     * EPIC-26 / ADR-115 amendment / ADR-120: default tier for the main
     * agent loop. `'mid'` is the cost-efficient default; setting this to
     * `'flagship'` is the rollback escape hatch when the Advisor-Pattern
     * regresses real-world tasks (H-01 validation).
     */
    defaultMainModelTier?: ModelTier;

    /**
     * EPIC-26 / ADR-123: pre-migration backup of `activeModels[]` so the
     * Welle-2 auto-migration is reversible. Populated by the migration
     * step in PLAN-25; the schema only reserves the field shape here so
     * data.json stays type-stable across the upgrade window.
     */
    legacy_active_models_backup?: CustomModel[];

    /**
     * EPIC-33 / FEAT-33-01: Inline-Editor-AI-Actions settings.
     * All fields are optional with sensible defaults so existing
     * data.json stays compatible. Defaults are applied via
     * resolveInlineActionsSettings() in src/core/inline/inlineSettings.ts.
     */
    inlineActions?: InlineActionsSettings;
}

/**
 * EPIC-33: Inline-Editor-AI-Actions settings. Each Inline-Action
 * trigger UX (Floating-Menu, Hotkey, Command-Palette) and per-action
 * model-pin live here. The struct is intentionally flat so the
 * settings UI in InlineActionsTab can render every option without
 * deep nesting.
 */
export interface InlineActionsSettings {
    /** Master kill-switch. Default true. */
    enabled?: boolean;
    /** Show the Floating-Menu automatically on selection. Default true. */
    floatingMenuEnabled?: boolean;
    /**
     * FEAT-33-09: Use Vault-Knowledge-RAG in Lookup. Default true.
     * A/B-test toggle for Critical Hypothesis H-07.
     */
    vaultRagInLookup?: boolean;
    /**
     * FEAT-33-09: Confidence threshold for Vault-RAG hits (0.0..1.0).
     * Hits below the threshold fall back to LLM-only lookup. Default 0.7.
     */
    vaultRagConfidenceThreshold?: number;
    /**
     * FEAT-33-09: Show Vault source links in the Lookup tooltip.
     * Default true. User-opt-out for sensitive vault forks.
     */
    showVaultSourcesInTooltip?: boolean;
    /**
     * FEAT-33-10: Per-Action-Model-Pin overrides. Key is the
     * InlineAction id (e.g. 'lookup'), value is a model id from
     * activeModels[] or null for "use main-chat default".
     */
    actionPins?: Record<string, string | null>;
    /**
     * Cap on how many Skills appear in the floating menu's
     * skill-actions group. Default 10. Set to 0 to hide skills entirely.
     */
    skillsTopN?: number;
    /**
     * FEAT-33-08: per-skill inline capability. Key is the skill name
     * (matches SelfAuthoredSkill.name). Value carries the same shape
     * as InlineActionCapability. Skills without an entry are silently
     * excluded from the Floating-Menu.
     *
     * This mapping lives in settings (NOT in skill frontmatter) so
     * (a) the existing skill schema is untouched, and (b) the user
     * explicitly opts a skill in as an inline action via the Settings
     * UI rather than the skill author dictating it.
     */
    skillCapabilities?: Record<string, {
        eligible: boolean;
        output_mode: 'preview-block' | 'inline-diff' | 'side-panel' | 'tooltip';
        input_format: 'markdown' | 'plain';
        max_selection_chars?: number;
    }>;
}

// ---------------------------------------------------------------------------
// Vault Ingest Settings (BA-25, PLAN-10 ff)
// ---------------------------------------------------------------------------

/**
 * Settings fuer den Karpathy-Wiki-Pattern (BA-25): Note-Summary-
 * Generierung, Frontmatter-Pflege, optionaler Auto-Trigger,
 * PDF-Strategie. Alle Toggles default OFF (User-Trust per
 * ADR-95). Standard-Prompt aus BA-25 Anhang B (Sebastians Wortlaut).
 */
export interface VaultIngestSettings {
    /** FEAT-19-08: konfigurierbarer Standard-Prompt fuer Auto-Summary. */
    summaryPrompt: {
        /** Multi-Line String. Default = Sebastians Standard-Prompt-Wortlaut. */
        template: string;
        /** Optional: anderes Modell als der Default-LLM (zB Haiku statt Sonnet). */
        modelOverride?: string;
    };
    /** FEAT-19-09: Auto-Generierung beim Indexing. */
    autoSummary: {
        enabled: boolean;
        /**
         * Wenn true und Frontmatter "Zusammenfassung" fehlt: System
         * darf Property in der Vault-Note ergaenzen (FEAT-19-10,
         * ADR-95). Default false. Bei Aktivierung steht ein einmaliger
         * Backfill-Job an.
         */
        writeFrontmatter: boolean;
    };
    /** FEAT-19-27 (PLAN-12, Schema additiv vorbereitet). */
    autoTrigger: {
        enabled: boolean;
        propertyName: string;
        propertyValue: string | string[];
        notification: boolean;
    };
    /** FEAT-19-29 (PLAN-13). */
    pdfStrategy: 'page-refs' | 'markdown-mirror';

    /**
     * FEAT-03-26 Top-Hub-Block im KV-Cache.
     *
     * AUDIT-014 M-2 (FIX-03-26-01): Privacy-Trade-Off ist im Settings-UI
     * explizit ausgewiesen, weil Note-Summaries der Top-30 Hubs bei
     * jeder LLM-Conversation an den Provider gehen. Default OFF.
     */
    topHubBlock: {
        enabled: boolean;
        /** User hat Privacy-Hint gelesen und bestaetigt. Toggle deaktiviert wenn false. */
        privacyAcknowledged: boolean;
    };
    /**
     * FEAT-19-19: Stufe-2 Activity-Trigger.
     *
     * Bei Note-Open/Modify in einem reifen Cluster zeigt das Plugin
     * dezent eine Notice mit Klick-Trigger fuer einen Light-Web-Search-
     * Update-Pass. Default OFF damit das User-Erlebnis nicht stoert.
     */
    stufe2Hint: {
        enabled: boolean;
        /** Score-Schwelle (0..100). Default 70. Niedriger Score loest Hint aus. */
        hintThresholdScore: number;
        /** Default 30: keine Hints wenn letzter externer Check juenger. */
        minDaysSinceCheck: number;
        /** Default 7: pro-Cluster Cooldown in Tagen. */
        perClusterCooldownDays: number;
        /** Default 5: globale Hints pro Tag (Cap). */
        maxHintsPerDay: number;
    };
    /**
     * FEAT-19-20 / FIX-19-20-01: Stufe-3 Periodic-Job dediziertes Gating.
     *
     * Vor dem Audit lief Stufe-3 an `autoTrigger.enabled` mit (stuendlicher
     * Check, woechentlicher Run). Audit fand: das war Co-Trigger fuer
     * mehrere unverwandte Auto-Trigger und damit unklar dokumentiert.
     * Eigenes Flag macht die Opt-in-Semantik explizit; `lastRunIso`
     * persistiert den letzten erfolgreichen Lauf (statt nur an
     * `rolloverIfNewWeek` zu haengen, das beim Plugin-Restart neu
     * berechnet wurde).
     */
    stufe3PeriodicJob: {
        /** Default false: User muss Stufe-3-Job explizit aktivieren (kostet LLM-Tokens). */
        enabled: boolean;
        /** ISO-Timestamp des letzten erfolgreichen Runs. Leer = nie gelaufen. */
        lastRunIso: string;
    };
    /**
     * FEAT-19-31 / IMP-19-31-01: vom User konfigurierbare Frontmatter-
     * Templates pro Ingest-Skill. Skill liest das angegebene File aus
     * dem Vault und nutzt das Frontmatter als Basis fuer die generierte
     * Quellen-Note. Bei leerem Pfad faellt der Skill auf die mit dem
     * Plugin gebuendelten Defaults zurueck (siehe
     * `bundled-templates/notes/`).
     */
    templates: {
        /** Vault-relativer Pfad. Default leer -> bundled `quelle-template.md`. Genutzt von /ingest. */
        ingestNoteTemplate: string;
        /** Vault-relativer Pfad. Default leer -> bundled `quelle-template.md`. Genutzt von /ingest-deep. */
        ingestDeepNoteTemplate: string;
        /** Vault-relativer Pfad. Default leer -> bundled `meeting-notiz-template.md`. Genutzt von /meeting-summary. */
        meetingSummaryTemplate: string;
        /**
         * FEAT-29-14: Sense-Making-Note- / Zettel-Template fuer die
         * sekundaeren Output-Notes von /ingest und /ingest-deep
         * (Default-Kategorie "Quellen-Notiz"). Vault-relativer Pfad,
         * default leer -> bundled `Notiz Template.md`.
         */
        quellenNotizTemplate: string;
        /**
         * FEAT-29-14: Sprache des materialisierten Template-Sets.
         * Wird im FirstRunWizardModal abgefragt und steuert welche
         * Variante aus `BUNDLED_NOTE_TEMPLATES` gezogen wird. Werte
         * ausserhalb von 'de'/'en' triggern LLM-Uebersetzung bei
         * der Materialisierung. Default leer = noch nicht entschieden.
         */
        templatesLanguage: string;
    };
}

/**
 * BA-25 Anhang B: Sebastians vorgegebener Standard-Prompt-Wortlaut.
 * Bleibt 1:1 als Default in Settings hinterlegt, vom User editierbar.
 */
export const DEFAULT_SUMMARY_PROMPT_TEMPLATE = `Write a single one-sentence summary of the active note.

The output must not exceed 25 words. Return only the sentence, no explanations.
If the summary would be longer, shorten it aggressively.

Also produce 5-10 keywords in hyphenated style ("word1-word2", max two joined words). Prefer the English form for technical terms (e.g. "AI-agent" not "KI-Agent"). Mixed-language vaults: stick to the language of the note for the keywords.

Suggest 2-3 entries for "Themen" (topics) and 2-3 entries for "Konzepte" (concepts) matching the note. Search the vault first for matching existing topics and concepts; only create a new entry if none fits.`;

/**
 * AUDIT-024 L-2: single source of truth for the ingest-templates sub-shape.
 * VaultTab onChange handlers reuse this via spread to keep the migration
 * fallback consistent when a new template-field is added.
 */
export function DEFAULT_INGEST_TEMPLATES(): VaultIngestSettings['templates'] {
    return {
        ingestNoteTemplate: '',
        ingestDeepNoteTemplate: '',
        meetingSummaryTemplate: '',
        quellenNotizTemplate: '',
        templatesLanguage: '',
    };
}

export const DEFAULT_VAULT_INGEST_SETTINGS: VaultIngestSettings = {
    summaryPrompt: {
        template: DEFAULT_SUMMARY_PROMPT_TEMPLATE,
    },
    autoSummary: {
        enabled: false,
        writeFrontmatter: false,
    },
    autoTrigger: {
        enabled: false,
        // 2026-05-18: english defaults for new installs. Existing
        // installs keep whatever the user persisted; the saved
        // settings overwrite these defaults on load.
        propertyName: 'category',
        propertyValue: 'source',
        notification: false,
    },
    pdfStrategy: 'page-refs',
    topHubBlock: {
        enabled: false,
        privacyAcknowledged: false,
    },
    templates: DEFAULT_INGEST_TEMPLATES(),
    stufe2Hint: {
        enabled: false,
        hintThresholdScore: 70,
        minDaysSinceCheck: 30,
        perClusterCooldownDays: 7,
        maxHintsPerDay: 5,
    },
    stufe3PeriodicJob: {
        enabled: false,
        lastRunIso: '',
    },
};

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
    /**
     * FEAT-29-07: default timeout in ms for plugin API calls. Falls back
     * to 10000 when unset. Hard-capped at 300000 (5 min) by the resolver
     * to prevent endless hangs.
     */
    defaultTimeoutMs?: number;
    /**
     * FEAT-29-07: per-plugin timeout override in ms. Wins over default
     * when set. Same 5-min hard cap.
     * Key: pluginId (e.g. "dataview"), value: timeout in ms.
     */
    pluginTimeoutMs?: Record<string, number>;
    /**
     * FEAT-29-07: when true, every successful user-approval of a Tier-2
     * (dynamically discovered) method increments approvalCounts; once
     * the threshold is reached AND the method name matches the read
     * heuristic (get/list/find/query/..), the method is promoted into
     * safeMethodOverrides so subsequent calls no longer prompt.
     */
    autoPromotionEnabled?: boolean;
    /** FEAT-29-07: number of approvals before auto-promotion. Default 3. */
    autoPromotionThreshold?: number;
    /**
     * FEAT-29-07: per-method approval counter for auto-promotion.
     * Key: "pluginId:methodName", value: integer approval count.
     */
    approvalCounts?: Record<string, number>;
}

/**
 * FEAT-29-12 Backup/Export-Tool settings.
 *   exportSecretsAllowed -- opt-in: when true, manual exports may include
 *     API keys. Default false. Auto-daily backups ALWAYS strip secrets
 *     regardless of this flag (a backup that the user did not explicitly
 *     trigger must not carry credentials).
 *   autoDailyEnabled -- when true, the plugin runs one selective backup
 *     per 24h on plugin boot.
 *   autoDailyTargetPath -- vault-relative folder for auto-daily ZIPs.
 *     Defaults to .vault-operator/cache/backups so it stays out of
 *     Obsidian's vault view by default.
 *   retentionCount -- keep at most N auto-daily backups; older ones are
 *     pruned on the next auto-daily run.
 *   lastAutoBackupAt -- timestamp (ms epoch) of the last successful
 *     auto-daily backup. Used to gate the 24h interval.
 */
export interface BackupSettings {
    exportSecretsAllowed: boolean;
    autoDailyEnabled: boolean;
    autoDailyTargetPath: string;
    retentionCount: number;
    lastAutoBackupAt: number;
}

// ---------------------------------------------------------------------------
// IMP-20-06-01: Note-Verifier settings (FEAT-20-06 Stage 4+5)
// ---------------------------------------------------------------------------

/**
 * Settings for the note-level claim-check pipeline. All defaults are
 * privacy-conservative per ADR-135 and the IMP body:
 * - `writeFrontmatter` is off so the vault stays clean by default
 * - `externalSources.enabled` is off so no third-party search runs in the
 *   background without explicit opt-in
 * - `allowFrontierEscalation` is off so verdicts stay mid-tier-only
 *   until the user actively turns it on AND the provider exposes ZDR
 */
export interface FreshnessSettings {
    writeFrontmatter: boolean;
    externalSources: {
        enabled: boolean;
    };
    allowFrontierEscalation: boolean;
    frontierConfidenceThreshold: number;
    frontierSeverityFilter: ('matches' | 'extends' | 'contradicts' | 'outdated' | 'no_external_source')[];
    excludePaths: string[];
}

export const DEFAULT_FRESHNESS_SETTINGS: FreshnessSettings = {
    writeFrontmatter: false,
    externalSources: { enabled: false },
    allowFrontierEscalation: false,
    frontierConfidenceThreshold: 0.7,
    frontierSeverityFilter: ['contradicts', 'outdated'],
    excludePaths: ['Private/', 'Personal/', 'Medical/', 'Clients/'],
};

// ---------------------------------------------------------------------------
// IMP-19-01-01: Vault Health auto-apply for deterministic rule-based repairs.
// ---------------------------------------------------------------------------

export interface VaultHealthSettings {
    /**
     * IMP-19-01-01 AC-05. When true, opening the Vault Health modal
     * via the sidebar badge auto-runs `runRepair()` over the three
     * deterministic rule checks (missing_backlinks, category_mismatch,
     * inconsistent_tags) before the modal renders. Findings that need
     * a real decision still surface in the modal as before. Default
     * off so existing users see no behaviour change until they opt in.
     */
    autoApplyRuleRepairs: boolean;

    /**
     * IMP-19-01-02: target folder for orphan-note auto-fix. When the
     * user selects an `orphans` finding and applies repairs, the note
     * is moved here via `app.fileManager.renameFile()`. Folder is
     * auto-created. Default keeps the existing flat-vault convention
     * (Inbox/Orphans/).
     */
    orphansTargetFolder: string;

    /**
     * FIX-19-01-05: silently drop the `with_context` orphan branch
     * when true. A `with_context` orphan is a note that has outgoing
     * MOC-property edges (Themen, Konzepte, ...) but no incoming
     * wikilink. Users who use embedded Bases in the hub notes (which
     * surface every note that points to the hub) do NOT need a
     * Findings entry telling them to add a reciprocal backlink — the
     * Base IS the backlink. Default true so the modal stays quiet
     * for that workflow; users who rely on property-reciprocity can
     * flip this off.
     */
    silenceWithContextOrphans: boolean;

    /**
     * FIX-19-01-05: extra path-prefix patterns to exclude from the
     * orphan check. The hardcoded excludes are Templates, Daily
     * Notes, Attachements (typo intentional, matches the user's
     * existing folder). This setting layers user-specific
     * exclusions on top — e.g. TaskNotes/ for the TaskNotes plugin,
     * or any folder that holds notes which intentionally do not
     * participate in the knowledge graph.
     */
    orphanExcludePathPrefixes: string[];

    /**
     * FIX-19-99-02 (cross-property reciprocity): pairs of frontmatter
     * properties that count as semantically equivalent backlink
     * relationships even though they have different names. Example:
     * `[['Notizen', 'Quellen']]` declares that a `Quelle.Notizen ->
     * Konzept` edge is satisfied when the `Konzept` has a reverse edge
     * under either `Notizen` OR `Quellen` pointing back at the source.
     *
     * Default `[['Notizen', 'Quellen']]` reflects the common
     * source-note-to-concept-note pattern (Quelle erwaehnt Konzept via
     * `Notizen:`, Konzept zitiert Quelle via `Quellen:`). Set to `[]`
     * to enforce strict same-property reciprocity.
     */
    reciprocalProperties: Array<[string, string]>;
}

export const DEFAULT_VAULT_HEALTH_SETTINGS: VaultHealthSettings = {
    autoApplyRuleRepairs: false,
    orphansTargetFolder: 'Inbox/Orphans',
    silenceWithContextOrphans: true,
    orphanExcludePathPrefixes: ['TaskNotes/', 'Inbox/Orphans/'],
    reciprocalProperties: [['Notizen', 'Quellen']],
};

// ---------------------------------------------------------------------------
// Visual Intelligence Settings (FEATURE-1115)
// ---------------------------------------------------------------------------

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

export type OnboardingStep = 'backup' | 'profile' | 'model' | 'permissions' | 'memory' | 'done';

export interface OnboardingSettings {
    /** true when setup has been fully completed */
    completed: boolean;
    /** Current step in the setup flow */
    currentStep: OnboardingStep;
    /** Steps the user chose to skip */
    skippedSteps: OnboardingStep[];
    /** ISO timestamp when setup was started */
    startedAt: string;
    /** Phase 2: how many times the first-run modal has been auto-opened
     *  (capped at 3 by the auto-open logic). Default 0. */
    firstRunModalShownCount?: number;
    /** Phase 2: user clicked "Don't show again" -- modal will not auto-open. */
    dontShowFirstRunAgain?: boolean;
    /** Phase 2: true after the wizard's final step finished. Distinct from
     *  `completed`, which is reserved for the post-modal Memory + Soul fill. */
    modalCompleted?: boolean;
}

// ---------------------------------------------------------------------------
// Optional Asset Settings (Phase 2 -- main.js diet)
// ---------------------------------------------------------------------------

/**
 * Status of each optional asset the user can choose to install. Assets
 * live in `<vault>/.vault-operator/assets/`; the plugin never writes to
 * its own pluginDir. Each entry tracks installed version + SHA256 so the
 * plugin can detect when a newer release ships a fresh binary.
 */
export interface OptionalAssetState {
    /** Version stamp of the installed asset (matches the plugin release tag). */
    installedVersion?: string;
    /** SHA256 of the installed asset, verified at install time. */
    sha256?: string;
    /** ISO timestamp of last successful install. */
    installedAt?: string;
}

export interface OptionalAssetsSettings {
    /** Semantic Reranker -- ONNX cross-encoder model (~12 MB). */
    reranker: OptionalAssetState;
    /** Self-Development source bundle (~5 MB) -- enables manage_source tool. */
    selfDevelopmentSource: OptionalAssetState;
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
    helperModelKey: '',           // FEAT-24-07 / ADR-115

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
        subtaskTokenBudget: 8000,           // FEAT-24-04 / ADR-113
        microcompactionEnabled: true,       // FEAT-24-02
        rollingSummaryThreshold: 50,        // FEAT-24-02
        costWarnThresholdEur: 0,            // FEAT-24-05 -- default disabled; opt-in
        telemetryRecordPromptPreview: false, // AUDIT-013 M-2: opt-in
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
    _pdfReindexHintShown: false,
    _pdfReindexCompleted: false,
    semanticChunkSize: 2000,
    enableContextualRetrieval: true,
    contextualModelKey: '',
    hydeEnabled: false,
    weightedFusionEnabled: true,
    semanticAutoIndexOnChange: false,
    enableGraphExpansion: true,
    graphExpansionHops: 1,
    mocPropertyNames: ['Themen', 'Konzepte', 'Personen', 'Notizen', 'Meeting-Notes', 'Quellen'],
    enableImplicitConnections: true,
    implicitThreshold: 0.7,
    enableSuggestionBanner: true,
    categoryProperty: 'Kategorie',
    backlinksProperty: 'Notizen',
    summaryProperty: 'Zusammenfassung',
    sourceNamingConvention: 'Autor-Jahr_Titel',
    enableSynthesisButton: true,
    enableVaultHealthCheck: true,
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
        memoryModelKey: '',
        extractionThreshold: 6,
        // Default for FRESH installs. Existing v1 users get bumped to 'pending'
        // by the detector in main.ts when memory/{file}.md is found and no
        // facts row exists yet. See `detectMemoryV2MigrationStatus`.
        v2MigrationStatus: 'not-applicable',
        v2MigrationReport: null,
        // BA-26 / FEAT-23-04: privacy-sichere Defaults fuer Cross-Surface MCP.
        // chatgpt + perplexity stehen auf manual, weil sie haeufig in
        // Familien-Accounts genutzt werden (Sebastian-Use-Case).
        crossSurface: {
            defaultSyncMode: 'auto',
            perProvider: {
                'obsilo': 'global',
                'claude-ai': 'global',
                'claude-code': 'global',
                'chatgpt': 'manual',
                'perplexity': 'manual',
                'unknown': 'manual',
            },
            // FIX-23-01-01: Living-Document-Default. true = Auto-Continuation.
            livingDocumentByDefault: true,
            // AUDIT-015 M-3: Cross-Source-ACL. Default OFF -- Sebastian
            // kann das ON setzen wenn ChatGPT/Perplexity strikt von
            // claude-ai/claude-code getrennt sein muessen.
            strictSourceIsolation: false,
        },
    },
    chatLinking: {
        enabled: true,
        titlingModelKey: '',
    },
    chatHistoryFolder: '',

    autoAddActiveFileContext: true,
    sendWithEnter: true,
    includeCurrentTimeInContext: false, // ADR-62 amendment: date is always present; time-of-day is opt-in (defeats caching)
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
    skillVersioning: { retentionCount: 20 },
    backup: {
        exportSecretsAllowed: false,
        autoDailyEnabled: false,
        autoDailyTargetPath: '.vault-operator/cache/backups',
        retentionCount: 7,
        lastAutoBackupAt: 0,
    },
    pluginApi: {
        enabled: true,
        safeMethodOverrides: {},
        defaultTimeoutMs: 10_000,
        pluginTimeoutMs: {},
        autoPromotionEnabled: true,
        autoPromotionThreshold: 3,
        approvalCounts: {},
    },
    recipes: {
        enabled: true,
        recipeToggles: {},
        customRecipes: [],
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
        firstRunModalShownCount: 0,
        dontShowFirstRunAgain: false,
        modalCompleted: false,
    },
    optionalAssets: {
        reranker: {},
        selfDevelopmentSource: {},
    },
    sandboxMode: 'auto',
    safeStoragePlaintextFallbackAcknowledged: false,
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
    chatgptOAuthAccessToken: '',
    chatgptOAuthRefreshToken: '',
    chatgptOAuthIdToken: '',
    chatgptOAuthAccountId: '',
    chatgptOAuthEmail: '',
    chatgptOAuthPlanTier: '',
    chatgptOAuthExpiresAt: 0,
    chatgptOAuthModel: 'gpt-5-codex',
    chatgptOAuthDisclaimerAcknowledgedAt: 0,
    debugMode: false,
    agentFolderPath: '.vault-operator',
    defaultOutputFolder: 'Inbox/',
    autoTaskRouter: { enabled: true },
    leanSystemPrompt: false,
    vaultIngest: DEFAULT_VAULT_INGEST_SETTINGS,
    freshness: DEFAULT_FRESHNESS_SETTINGS,
    vaultHealth: DEFAULT_VAULT_HEALTH_SETTINGS,

    // EPIC-26 / ADR-122: provider-only setup. Pre-migration defaults
    // (PLAN-25 will fill providerConfigs + flip schemaVersion).
    providerConfigs: [],
    activeProviderId: null,
    defaultMainModelTier: 'mid',
    // schemaVersion intentionally undefined — only the Welle-2 migration sets it.
};
