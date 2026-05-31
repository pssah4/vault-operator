/**
 * Central Model Registry
 * Based on Kilo Code's model definitions structure
 * All model metadata including context windows are defined here
 */

export interface ModelInfo {
    contextWindow: number;
    maxTokens?: number;
    supportsTools?: boolean;
    supportsStreaming?: boolean;
    displayName?: string;
}

// Anthropic Models
// https://docs.anthropic.com/en/docs/about-claude/models
export const ANTHROPIC_MODELS: Record<string, ModelInfo> = {
    'claude-opus-4-6': {
        contextWindow: 200_000,
        maxTokens: 128_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Opus 4.6',
    },
    'claude-sonnet-4-6': {
        contextWindow: 200_000,
        maxTokens: 64_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Sonnet 4.6',
    },
    'claude-sonnet-4-5-20250929': {
        contextWindow: 200_000,
        maxTokens: 64_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Sonnet 4.5',
    },
    'claude-haiku-4-5-20251001': {
        contextWindow: 200_000,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Haiku 4.5',
    },
    // Legacy models
    'claude-3-5-sonnet-20241022': {
        contextWindow: 200_000,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
    },
    'claude-3-5-sonnet-20240620': {
        contextWindow: 200_000,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
    },
    'claude-3-opus-20240229': {
        contextWindow: 200_000,
        maxTokens: 4_096,
        supportsTools: true,
        supportsStreaming: true,
    },
};

// OpenAI Models
// https://platform.openai.com/docs/models
export const OPENAI_MODELS: Record<string, ModelInfo> = {
    'gpt-4o': {
        contextWindow: 128_000,
        maxTokens: 16_384,
        supportsTools: true,
        supportsStreaming: true,
    },
    'gpt-4o-mini': {
        contextWindow: 128_000,
        maxTokens: 16_384,
        supportsTools: true,
        supportsStreaming: true,
    },
    'o1': {
        contextWindow: 200_000,
        maxTokens: 100_000,
        supportsTools: false,
        supportsStreaming: false,
    },
    'o1-mini': {
        contextWindow: 128_000,
        maxTokens: 65_536,
        supportsTools: false,
        supportsStreaming: false,
    },
    'gpt-4-turbo': {
        contextWindow: 128_000,
        maxTokens: 4_096,
        supportsTools: true,
        supportsStreaming: true,
    },
    'gpt-4': {
        contextWindow: 8_192,
        maxTokens: 4_096,
        supportsTools: true,
        supportsStreaming: true,
    },
    'gpt-3.5-turbo': {
        contextWindow: 16_385,
        maxTokens: 4_096,
        supportsTools: true,
        supportsStreaming: true,
    },
};

// Gemini Models (via OpenAI-compatible API)
// https://ai.google.dev/gemini-api/docs/models/gemini
export const GEMINI_MODELS: Record<string, ModelInfo> = {
    'gemini-3-pro-preview': {
        contextWindow: 2_097_152, // 2M tokens
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 3 Pro Preview',
    },
    'gemini-2.5-flash': {
        contextWindow: 1_048_576, // 1M tokens
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 2.5 Flash',
    },
    'gemini-2.5-pro': {
        contextWindow: 1_048_576, // 1M tokens
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 2.5 Pro',
    },
    'gemini-2.0-flash-exp': {
        contextWindow: 1_048_576,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 2.0 Flash (Exp)',
    },
    'gemini-1.5-pro': {
        contextWindow: 2_097_152,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 1.5 Pro',
    },
    'gemini-1.5-pro-002': {
        contextWindow: 2_097_152,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 1.5 Pro 002',
    },
    'gemini-1.5-flash': {
        contextWindow: 1_048_576,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 1.5 Flash',
    },
    'gemini-1.5-flash-002': {
        contextWindow: 1_048_576,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 1.5 Flash 002',
    },
    'gemini-1.5-flash-8b': {
        contextWindow: 1_048_576,
        maxTokens: 8_192,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Gemini 1.5 Flash 8B',
    },
};

// Combined registry for all models
export const MODEL_REGISTRY: Record<string, ModelInfo> = {
    ...ANTHROPIC_MODELS,
    ...OPENAI_MODELS,
    ...GEMINI_MODELS,
};

/**
 * Get model info by model ID
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
    return MODEL_REGISTRY[modelId];
}

/**
 * Get context window for a model
 */
export function getModelContextWindow(modelId: string): number {
    const info = getModelInfo(modelId);
    return info?.contextWindow ?? 200_000; // Default fallback
}

/**
 * Reduce a provider-decorated model ID down to the bare model name so registry
 * lookups and pattern matching work regardless of how the ID is namespaced:
 *   - OpenRouter   "anthropic/claude-3.5-sonnet"              -> "claude-3.5-sonnet"
 *   - Bedrock      "eu.anthropic.claude-opus-4-6-v1"          -> "claude-opus-4-6"
 *   - Bedrock      "anthropic.claude-3-5-sonnet-20241022-v2:0" -> "claude-3-5-sonnet-20241022"
 *   - Bedrock ARN  ".../inference-profile/eu.anthropic.claude-opus-4-6-v1" -> "claude-opus-4-6"
 */
export function normalizeModelId(modelId: string): string {
    let id = modelId.trim();
    // OpenRouter "vendor/model"
    if (id.includes('/')) id = id.split('/').pop() ?? id;
    // Bedrock "[region.]vendor.model[...]" — take everything after the vendor segment
    const vendor = id.match(/(?:^|\.)(?:anthropic|amazon|meta|mistral|cohere|ai21|stability|deepseek|writer|qwen)\.(.+)$/i);
    if (vendor) id = vendor[1];
    // Bedrock version / provisioned-throughput suffix: "-v1", "-v2:0", ":0"
    id = id.replace(/-v\d+(?::\d+)?$/i, '').replace(/:\d+$/, '');
    return id;
}

/**
 * Get max tokens for a model
 */
export function getModelMaxTokens(modelId: string): number {
    const info = getModelInfo(normalizeModelId(modelId));
    return info?.maxTokens ?? 8_192; // Default fallback
}

/**
 * The model's real output ceiling, or undefined when we have no registry entry
 * for it (custom models, local models, gateway-routed models). Unlike
 * getModelMaxTokens this does NOT invent a fallback — callers that need a wide
 * range for unknown models should use that knowledge.
 */
export function getModelOutputCeiling(modelId: string): number | undefined {
    return getModelInfo(normalizeModelId(modelId))?.maxTokens;
}

/**
 * FIX-04-03-02: Some recent models reject any custom `temperature` value with
 * a 400 and require the parameter to be omitted entirely.
 *
 * - Anthropic Claude Opus 4.7 (April 2026 and later snapshots): replies
 *   `400 - 'temperature' is deprecated for this model`.
 * - OpenAI GPT-5.x family: replies `400 - Unsupported value: 'temperature'
 *   does not support 0.2 with this model. Only the default (1) value is
 *   supported.` Even sending `1.0` is risky and version-dependent, so it is
 *   safer to let the API use its default than to send anything explicitly.
 *
 * The check normalises the id first (so OpenRouter `anthropic/claude-opus-4-7`
 * and Bedrock `eu.anthropic.claude-opus-4-7-v1` map to the same answer as the
 * direct id `claude-opus-4-7`).
 */
export function modelSupportsTemperature(modelId: string): boolean {
    const normalized = normalizeModelId(modelId).toLowerCase();
    // Anthropic Opus 4.7 and later 4.x snapshots that drop temperature
    if (/^claude-opus-4-7\b/.test(normalized)) return false;
    // OpenAI GPT-5 family: default-only temperature
    if (/^gpt-5(\b|[.-])/.test(normalized)) return false;
    return true;
}

/** Output ceiling assumed for models we have no registry entry for (local models, gateways, ...). */
const UNKNOWN_MODEL_OUTPUT_CEILING = 64_000;
/** Generous-but-bounded default visible-output budget for known cloud models. */
const DEFAULT_VISIBLE_OUTPUT_BUDGET = 32_000;
/** Conservative fallback when we don't know the model and the user set no value (local models). */
const LEGACY_DEFAULT_OUTPUT_BUDGET = 8_192;
/** Tokens always kept available for the visible answer when extended thinking is on. */
const MIN_VISIBLE_OUTPUT_BUDGET = 1_024;
/** Tokens reserved between (estimated) input and the output budget — slack for the model to wrap up plus estimate error. */
const CONTEXT_SAFETY_MARGIN = 4_096;

/**
 * Resolve the effective output budget to send to a chat-completion API.
 *
 * `maxTokens` is the value for `max_tokens` / `max_completion_tokens`. It starts
 * from the user-configured value (or, when none is set, a model-scaled default)
 * and is clamped two ways:
 *   1. to the model's real output ceiling — so an over-eager Settings value
 *      cannot trigger an API 400;
 *   2. to whatever room is left in the context window after the (estimated)
 *      input — many OpenAI-compatible providers reject `input + max_tokens >
 *      context_window` with a 400, and even Anthropic can't actually generate
 *      more than the remaining room. Pass `opts.estimatedInputTokens` to enable
 *      this; omit it and only clamp (1) applies.
 *
 * When extended thinking is enabled, the thinking budget is added *on top* of
 * the visible-output budget: Anthropic's `max_tokens` covers thinking + answer,
 * so without this a config like `maxTokens=8192` + `thinkingBudget=10000` leaves
 * ~0 tokens for the actual answer and truncates tool calls mid-JSON.
 * `thinkingBudgetTokens` in the result is the clamped budget, always strictly
 * below `maxTokens`.
 *
 * Note: `max_tokens` is an upper bound, not a cost lever. Billing is per
 * generated token, so a high ceiling is free; a low ceiling truncates long
 * outputs and causes retry loops that cost more.
 */
export function resolveOutputBudget(
    modelId: string,
    configuredMaxTokens: number | undefined,
    opts?: { enabled?: boolean; budgetTokens?: number; estimatedInputTokens?: number },
): { maxTokens: number; thinkingBudgetTokens: number } {
    const known = getModelInfo(normalizeModelId(modelId));
    const modelCeiling = known?.maxTokens ?? UNKNOWN_MODEL_OUTPUT_CEILING;

    // Dynamic ceiling: shrink to the room left after the input so we never send
    // input + max_tokens > context_window.
    let ceiling = modelCeiling;
    if (opts?.estimatedInputTokens && opts.estimatedInputTokens > 0) {
        const contextWindow = known?.contextWindow ?? 200_000;
        const roomForOutput = contextWindow - opts.estimatedInputTokens - CONTEXT_SAFETY_MARGIN;
        ceiling = Math.max(MIN_VISIBLE_OUTPUT_BUDGET, Math.min(modelCeiling, roomForOutput));
    }

    const defaultVisible = known
        ? Math.min(ceiling, DEFAULT_VISIBLE_OUTPUT_BUDGET)
        : Math.min(ceiling, LEGACY_DEFAULT_OUTPUT_BUDGET);
    const requestedVisible = configuredMaxTokens && configuredMaxTokens > 0
        ? configuredMaxTokens
        : defaultVisible;

    if (!opts?.enabled) {
        return { maxTokens: Math.min(ceiling, requestedVisible), thinkingBudgetTokens: 0 };
    }

    // budget_tokens must stay >= 1024 and strictly below max_tokens.
    let budget = Math.max(MIN_VISIBLE_OUTPUT_BUDGET, opts.budgetTokens ?? 10_000);
    budget = Math.min(budget, Math.max(MIN_VISIBLE_OUTPUT_BUDGET, ceiling - MIN_VISIBLE_OUTPUT_BUDGET));
    const visible = Math.max(MIN_VISIBLE_OUTPUT_BUDGET, Math.min(requestedVisible, ceiling - budget));
    return { maxTokens: budget + visible, thinkingBudgetTokens: budget };
}

/**
 * Cheap pre-request estimate of how many input tokens a system prompt + message
 * history + tool definitions will cost. Char-count / 4 is the usual rule of
 * thumb for English/markdown; good enough to size the output budget against
 * the context window. Image blocks are counted as a flat estimate (their token
 * cost is resolution-based, not byte-based).
 *
 * FIX-18-04-02: `tools` was added because vault-operator ships ~60 tool
 * definitions (~20-30k tokens of JSON Schema) that every OpenAI-compatible
 * API counts toward the input window. Without verifying them here
 * `resolveOutputBudget` would leave a max_tokens value that pushed
 * `input + max_tokens` past the context window and triggered a provider 400.
 */
export function estimatePromptTokens(
    systemPrompt: string,
    messages: Array<{ content: string | Array<unknown> }>,
    tools?: Array<unknown>,
): number {
    let chars = systemPrompt.length;
    let imageBlocks = 0;
    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            chars += msg.content.length;
            continue;
        }
        for (const block of msg.content) {
            const b = block as { type?: string; text?: string; content?: unknown };
            if (b?.type === 'image') { imageBlocks++; continue; }
            if (typeof b?.text === 'string') chars += b.text.length;
            else chars += JSON.stringify(block).length;
        }
    }
    if (tools && tools.length > 0) {
        // JSON-stringify the whole array once: handles strings, plain
        // objects, and nested schemas in one pass.
        chars += JSON.stringify(tools).length;
    }
    return Math.ceil(chars / 4) + imageBlocks * 1_500;
}
