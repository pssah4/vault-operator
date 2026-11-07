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
    // BUG-2: the post-4.6 lineup must be registered so resolveOutputBudget
    // gives them the generous output budget instead of the 8192 legacy cap
    // used for unknown models (the silent long-write truncation). 1M context
    // window, 128K output ceiling. These also drop the sampling parameters --
    // see modelSupportsTemperature below.
    'claude-fable-5': {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Fable 5',
    },
    'claude-opus-4-8': {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Opus 4.8',
    },
    'claude-opus-4-7': {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Opus 4.7',
    },
    'claude-opus-4-6': {
        contextWindow: 200_000,
        maxTokens: 128_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Opus 4.6',
    },
    'claude-sonnet-5': {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        supportsTools: true,
        supportsStreaming: true,
        displayName: 'Claude Sonnet 5',
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
 * ADR-148 layer 3: output caps learned at runtime from provider 400s
 * ("max_tokens: X > Y"). Injected by LearnedCapsStore on boot and after each
 * learn event — same module-setter pattern as setLivePriceCatalog. Keys are
 * normalized model ids. resolveOutputBudget treats a learned cap as an
 * additional ceiling clamp; caps only ever lower the budget.
 */
let learnedOutputCaps: Record<string, number> = {};

export function setLearnedOutputCaps(caps: Record<string, number>): void {
    learnedOutputCaps = caps;
}

function getLearnedOutputCap(normalizedId: string): number | undefined {
    return learnedOutputCaps[normalizedId];
}

/**
 * FIX-54-10 (ADR-148 layer 3): capability RESTRICTIONS learned at runtime
 * from provider 400s, keyed by normalized model id. Injected by
 * LearnedCapsStore on boot and after each learn event, same module-setter
 * pattern as setLearnedOutputCaps. Flags only ever ADD restrictions (the
 * mirror of "caps only lower"): a set flag reflects a provider rejection and
 * there is no unlearn path.
 *
 * effortWithToolsUnsupported: the model rejects function tools combined with
 * reasoning_effort on /v1/chat/completions (gpt-5.6 platform generation:
 * gpt-5.6-sol/-terra/-luna). The request builder then forces
 * reasoning_effort 'none' whenever tools are present.
 */
export interface LearnedModelFlags {
    effortWithToolsUnsupported?: boolean;
}

let learnedModelFlags: Record<string, LearnedModelFlags> = {};

export function setLearnedModelFlags(flags: Record<string, LearnedModelFlags>): void {
    learnedModelFlags = flags;
}

export function isEffortWithToolsUnsupported(modelId: string): boolean {
    return learnedModelFlags[normalizeModelId(modelId)]?.effortWithToolsUnsupported === true;
}

/**
 * ADR-148 layer 1: generation-based size inference for ids without an exact
 * registry entry. FIX-04-03-12 made the capability layer pattern-based; the
 * size layer kept exact keys, so every new model silently dropped onto the
 * 8192 legacy budget (BUG-2: Opus 4.7/4.8/Fable; FIX-04-03-14: Sonnet 5).
 * Patterns encode documented FAMILY FLOORS — a new generation has never
 * shipped with less window/output than its family floor — never invented
 * per-model numbers. Exact registry entries always win.
 */
function inferModelInfo(normalizedId: string): ModelInfo | undefined {
    const id = normalizedId.toLowerCase();
    if (!id.startsWith('claude-')) return undefined;
    const floor = (contextWindow: number, maxTokens: number): ModelInfo => ({
        contextWindow,
        maxTokens,
        supportsTools: true,
        supportsStreaming: true,
        displayName: normalizedId,
    });
    // Opus 4.7+, all 5+ generations of opus/sonnet, Fable/Mythos: 1M / 128k.
    if (/^claude-opus-(?:4-(?:[7-9]|\d\d+)|[5-9]|\d\d+)\b/.test(id)
        || /^claude-sonnet-(?:[5-9]|\d\d+)\b/.test(id)
        || /^claude-(?:fable|mythos)-/.test(id)) {
        return floor(1_000_000, 128_000);
    }
    // Haiku 5+ and any other unknown 4.x member (undated aliases, future
    // snapshots): 200k window, 64k output.
    if (/^claude-haiku-(?:[5-9]|\d\d+)\b/.test(id) || /^claude-[a-z]+-4\b/.test(id)) {
        return floor(200_000, 64_000);
    }
    // Any other claude id (future families, 3.x variants): safe floor.
    return floor(200_000, 32_000);
}

/**
 * Get model info by model ID. Lookup chain (ADR-148):
 *   1. exact key as given, 2. exact key after normalization,
 *   3. generation-based inference (Claude family floors).
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
    const exact = MODEL_REGISTRY[modelId];
    if (exact) return exact;
    const normalized = normalizeModelId(modelId);
    return MODEL_REGISTRY[normalized] ?? inferModelInfo(normalized);
}

/**
 * Get context window for a model
 */
export function getModelContextWindow(modelId: string): number {
    const info = getModelInfo(modelId);
    return info?.contextWindow ?? 200_000; // Default fallback
}

/**
 * IMP-01-04-03: per-call read budget for read_file, derived from the serving
 * model's context window instead of a fixed 50k cap. The old flat cap forced
 * a large note into 3 sequential chunk-reads even on a 1M-context model
 * (117k-char transcript = 50k + 50k + 17k = 3 turns), and each chunk then
 * became prunable microcompact fodder that got re-read -- the dominant turn
 * multiplier for /meeting-summary. A window-proportional budget lets a 1M
 * model read the whole file in one call while a 128k model keeps a safe cap.
 *
 * Outputs: unknown/absent -> 50k (preserves prior behaviour), 128k -> ~51k,
 * 200k -> 80k, 1M -> 400k (a 117k note is one call).
 */
export const READ_BUDGET_WINDOW_FRACTION = 0.10;
export const READ_BUDGET_CHARS_PER_TOKEN = 4;
export const READ_BUDGET_FLOOR_CHARS = 50_000;
export const READ_BUDGET_CEIL_CHARS = 400_000;

export function computeReadBudgetChars(windowTokens?: number): number {
    if (!windowTokens || !Number.isFinite(windowTokens) || windowTokens <= 0) {
        return READ_BUDGET_FLOOR_CHARS;
    }
    const raw = Math.round(windowTokens * READ_BUDGET_WINDOW_FRACTION * READ_BUDGET_CHARS_PER_TOKEN);
    return Math.min(Math.max(raw, READ_BUDGET_FLOOR_CHARS), READ_BUDGET_CEIL_CHARS);
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
 * FIX-04-03-02 / BUG-1: Some recent models removed the sampling parameters
 * (`temperature`, `top_p`, `top_k`) from their request surface and reject any
 * value with a 400 (on Bedrock the Converse API surfaces this as a
 * `ValidationException`). The parameter has to be omitted entirely.
 *
 * - Anthropic Claude Opus 4.7 and Opus 4.8 (and any later 4.x snapshot):
 *   sampling parameters are removed and 400. Opus 4.8 inherits the same
 *   request surface as 4.7.
 * - Anthropic Claude Fable 5 and Mythos 5 (incl. the `mythos-preview` id):
 *   same removal, sampling parameters 400.
 * - OpenAI GPT-5.x family: replies `400 - Unsupported value: 'temperature'
 *   does not support 0.2 with this model. Only the default (1) value is
 *   supported.` Even sending `1.0` is risky and version-dependent, so it is
 *   safer to let the API use its default than to send anything explicitly.
 *
 * Opus 4.6 and Sonnet 4.6 (and older 4.x) still accept temperature, so the
 * minor version digit is pinned (4-7 and up, never 4-6).
 *
 * The check normalises the id first (so OpenRouter `anthropic/claude-opus-4-8`
 * and Bedrock `eu.anthropic.claude-opus-4-8-v1` map to the same answer as the
 * direct id `claude-opus-4-8`).
 */
export function modelSupportsTemperature(modelId: string): boolean {
    const normalized = normalizeModelId(modelId).toLowerCase();
    // Anthropic Opus 4.7+ snapshots that drop the sampling parameters. The
    // minor version is matched as 7/8/9 or any two-or-more digit minor
    // (a future 4-10, 4-11) so later snapshots stay covered, while 4-6 and
    // earlier single-digit minors keep temperature.
    if (/^claude-opus-4-(?:[7-9]|\d\d+)\b/.test(normalized)) return false;
    // FIX-04-03-12: Claude 5+ generation (sonnet-5, opus-5, haiku-5, future 6)
    // dropped sampling parameters entirely. Live incident 2026-07-02: Bedrock
    // global.anthropic.claude-sonnet-5 400s with "temperature is deprecated".
    // Matches "claude-<family>-<major>=5..9 or two-digit major" but NOT
    // dotted minors like claude-haiku-4-5 (major there is 4).
    if (/^claude-[a-z]+-(?:[5-9]|\d\d+)\b/.test(normalized)) return false;
    // Anthropic Fable / Mythos families: sampling parameters removed
    if (/^claude-(fable|mythos)-/.test(normalized)) return false;
    // OpenAI GPT-5 family: default-only temperature
    if (/^gpt-5(\b|[.-])/.test(normalized)) return false;
    return true;
}

/**
 * Whether a Claude model still accepts the legacy extended-thinking request
 * shape `thinking: { type: 'enabled', budget_tokens: N }`.
 *
 * The adaptive-thinking lineup (Opus 4.7+, Fable, Mythos) removed budget_tokens
 * and returns a 400 if it is sent -- those models only accept
 * `thinking: { type: 'adaptive' }`. Older Claude (Opus 4.6 and earlier, Sonnet
 * 4.6, the 3.x snapshots) still take budget_tokens.
 *
 * Returns false ONLY for the adaptive-thinking Claude families; everything else
 * (older Claude, non-Claude, unknown ids) returns true so the existing
 * budget_tokens path stays the default. The id is normalized first so
 * OpenRouter `anthropic/claude-*` and Bedrock `eu.anthropic.claude-*-v1` map to
 * the same answer as the direct id.
 */
export function modelUsesBudgetTokensThinking(modelId: string): boolean {
    const normalized = normalizeModelId(modelId).toLowerCase();
    // Opus 4.7/4.8/4.9 and later snapshots: adaptive only, budget_tokens 400s.
    // Mirrors the minor-version matching in modelSupportsTemperature so a future
    // 4-10/4-11 stays covered while 4-6 and earlier keep budget_tokens.
    if (/^claude-opus-4-(?:[7-9]|\d\d+)\b/.test(normalized)) return false;
    // FIX-04-03-12: Claude 5+ generation is adaptive-only (same lineup rule
    // as modelSupportsTemperature).
    if (/^claude-[a-z]+-(?:[5-9]|\d\d+)\b/.test(normalized)) return false;
    // Fable / Mythos families: adaptive only.
    if (/^claude-(fable|mythos)-/.test(normalized)) return false;
    return true;
}

/**
 * Native reasoning-effort level. The full union spans both families:
 *  - Claude (anthropic, bedrock, openrouter): low, medium, high, xhigh, max.
 *    output_config.effort, GA, no beta header. Default is high; xhigh sits
 *    between high and max and is the Claude Code default for agentic work.
 *  - GPT-5 / o-series (openai, github-copilot, chatgpt-oauth, openrouter):
 *    minimal, low, medium, high. reasoning_effort / reasoning.effort,
 *    default medium.
 */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** The five Claude-native effort levels, in ascending order. */
const CLAUDE_EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
/** The four GPT-5 / o-series effort levels, in ascending order. */
const OPENAI_EFFORT_LEVELS: EffortLevel[] = ['minimal', 'low', 'medium', 'high'];

/**
 * The native reasoning-effort levels a (model, provider) pair accepts, in
 * ascending order. An empty array means the pair has no native effort surface,
 * so the per-conversation effort selector stays hidden and no field is sent.
 *
 * - The effort-capable Claude lineup (Opus 4.7/4.8, Fable, Mythos) on anthropic
 *   / bedrock / openrouter: low, medium, high, xhigh, max (output_config.effort
 *   on Anthropic and OpenRouter, reasoning_config on Bedrock). Budget-tokens
 *   Claude (Sonnet 4.6, Opus 4.6 and older, Haiku, 3.x) returns [] because it
 *   takes a thinking budget, not an effort enum, and 400s on one.
 * - GPT-5 and the o-series (o1, o3, o4, ...) on openai / github-copilot /
 *   chatgpt-oauth / openrouter: minimal, low, medium, high (reasoning.effort /
 *   reasoning_effort).
 *
 * Everything else (Gemini, Ollama, LM Studio, custom, GPT-4 lineage, any
 * unknown id, a cross-provider mismatch like Claude under openai) returns [].
 * The id is normalized first so OpenRouter `anthropic/claude-*` and Bedrock
 * `eu.anthropic.claude-*-v1` map to the same answer as the direct id.
 */
export function getModelEffortLevels(modelId: string, providerType: string): EffortLevel[] {
    // FEAT-04-14: native Gemini OAuth uses ThinkingLevel, never reasoning_effort.
    if (providerType === 'gemini-oauth' && /^gemini-3(?:[.-])/.test(modelId)) {
        if (/flash/.test(modelId)) return ['minimal', 'low', 'medium', 'high'];
        return /^gemini-3\.1-/.test(modelId) ? ['low', 'medium', 'high'] : ['low', 'high'];
    }
    const provider = providerType.toLowerCase();
    const normalized = normalizeModelId(modelId).toLowerCase();

    // Only the adaptive-thinking Claude lineup (Opus 4.7/4.8, Fable, Mythos)
    // accepts output_config.effort. The budget-tokens models (Sonnet 4.6,
    // Opus 4.6 and earlier, Haiku, the 3.x snapshots) take a thinking budget
    // instead and 400 on an effort enum, so they are NOT effort-capable.
    // modelUsesBudgetTokensThinking is the single source of truth for that
    // split (false == adaptive == effort-capable). On Bedrock the adaptive
    // surface is shipped via additionalModelRequestFields as the
    // Anthropic-native `thinking` + `output_config` pair; the older
    // `reasoning_config { type: 'enabled', effort }` shape returned
    // "thinking.enabled.budget_tokens: Field required" because Bedrock
    // partially translated type=enabled into the legacy thinking shape and
    // then required budget_tokens.
    const isEffortCapableClaude = /^claude-/.test(normalized)
        && !modelUsesBudgetTokensThinking(modelId);
    // GPT-5 family and the reasoning o-series (o1..o9 plus o-mini variants).
    const isOpenAiReasoning = /^gpt-5(\b|[.-])/.test(normalized) || /^o[1-9](\b|[.-])/.test(normalized);
    // Explicit current capabilities, never infer capabilities for unknown future families.
    const isModernOpenAiReasoning = /^gpt-(?:6-astra|5\.6(?:-(?:luna|sol|terra))?)(?:$|-20\d\d-)/.test(normalized);

    // Claude-capable providers send the effort via the native Anthropic surface.
    if (isEffortCapableClaude && (provider === 'anthropic' || provider === 'bedrock' || provider === 'openrouter')) {
        return [...CLAUDE_EFFORT_LEVELS];
    }

    // OpenAI-style reasoning providers send reasoning.effort / reasoning_effort.
    if (
        (isOpenAiReasoning || isModernOpenAiReasoning) &&
        (provider === 'openai' ||
            provider === 'github-copilot' ||
            provider === 'chatgpt-oauth' ||
            provider === 'openrouter')
    ) {
        return isModernOpenAiReasoning ? [...OPENAI_EFFORT_LEVELS, 'xhigh', 'max'] : [...OPENAI_EFFORT_LEVELS];
    }

    return [];
}

/**
 * Whether a (model, provider) pair can SEND a native reasoning-effort field.
 *
 * This gates the per-conversation effort selector: the control is only rendered
 * and a native effort field is only sent for combinations we know how to wire.
 * Kept as a thin wrapper over getModelEffortLevels so existing boolean callers
 * (provider request bodies, the picker capability gate) stay unchanged.
 */
export function getModelEffortSupport(modelId: string, providerType: string): boolean {
    return getModelEffortLevels(modelId, providerType).length > 0;
}

/**
 * IMP-54-05b (issue #54): provider types whose requests go through the
 * OpenAI-compatible chat-completions wire path (OpenAiProvider). Only these
 * can carry a reasoning_effort / reasoning.effort field for models the static
 * registry does not know, so the per-model effort opt-in is restricted to
 * them. anthropic / bedrock / github-copilot / chatgpt-oauth / kilo-gateway
 * have their own wire paths and their reasoning models are covered by the
 * static families above.
 */
const EFFORT_OPT_IN_PROVIDER_TYPES = new Set([
    'openai', 'azure', 'custom', 'gemini', 'ollama', 'lmstudio', 'openrouter',
]);

/** Whether the per-model effort opt-in is honoured for this provider type. */
export function providerSupportsEffortOptIn(providerType: string): boolean {
    return EFFORT_OPT_IN_PROVIDER_TYPES.has(providerType.toLowerCase());
}

/**
 * Read a model's opt-in flag from a provider-level opt-in map
 * (ProviderConfig.effortOptIn). Only an explicit `true` counts.
 */
export function isEffortOptedIn(
    effortOptIn: Record<string, boolean> | undefined,
    modelId: string,
): boolean {
    return effortOptIn?.[modelId] === true;
}

/**
 * IMP-54-05b: the single choke point for "which effort levels does this
 * (model, provider) pair accept". Resolution order: the per-model opt-in
 * first (custom / OpenAI-compatible endpoints serving reasoning models the
 * static registry cannot know, e.g. GLM-5.2 or DeepSeek-R1 -- they get the
 * OpenAI-style set), then the static families of getModelEffortLevels.
 *
 * Both the picker capability gate AND the openai.ts request-body validation
 * call this function, so an opted-in model that shows a slider also sends
 * the field, and vice versa. An opt-in on a provider type outside the
 * OpenAI-compatible wire path (hand-edited data.json) stays inert on both
 * sides for the same reason.
 */
export function resolveEffortLevels(
    modelId: string,
    providerType: string,
    effortOptedIn?: boolean,
): EffortLevel[] {
    if (effortOptedIn === true && providerSupportsEffortOptIn(providerType)) {
        return [...OPENAI_EFFORT_LEVELS];
    }
    return getModelEffortLevels(modelId, providerType);
}

/** Output ceiling assumed for models we have no registry entry for (local models, gateways, ...). */
const UNKNOWN_MODEL_OUTPUT_CEILING = 64_000;
/** Generous-but-bounded default visible-output budget for known cloud models. */
const DEFAULT_VISIBLE_OUTPUT_BUDGET = 32_000;
/** Conservative fallback when we don't know the model and the user set no value (local models). */
/**
 * ADR-148: auto budget for ids that neither the registry nor the generation
 * inference recognizes (local/gateway/OpenAI-compatible models). Raised from
 * the 8192 legacy value: a too-high guess now triggers the output-cap
 * corrective retry (layer 3) which learns the real limit, whereas a too-low
 * value silently truncates long turns — the more expensive failure mode.
 */
const UNKNOWN_DEFAULT_OUTPUT_BUDGET = 16_384;
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
    const normalized = normalizeModelId(modelId);
    const known = getModelInfo(normalized);
    let modelCeiling = known?.maxTokens ?? UNKNOWN_MODEL_OUTPUT_CEILING;

    // ADR-148 layer 3: a cap learned from a provider "max_tokens > limit" 400
    // overrides everything above it — it reflects the provider's real limit.
    const learnedCap = getLearnedOutputCap(normalized);
    if (learnedCap && learnedCap > 0) {
        modelCeiling = Math.min(modelCeiling, Math.max(MIN_VISIBLE_OUTPUT_BUDGET, learnedCap));
    }

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
        : Math.min(ceiling, UNKNOWN_DEFAULT_OUTPUT_BUDGET);
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
