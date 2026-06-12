/**
 * ModelTierClassifier (EPIC-26 / FEAT-26-02 / ADR-121).
 *
 * Pure function. Given a model id (and optionally its capability or
 * pricing metadata), returns the tier slot the model belongs in
 * (`fast`, `mid`, `flagship`). Strategy: pattern-first with capability
 * fallback and OpenRouter pricing as an extra signal for unknown ids.
 *
 * Local providers (ollama, lmstudio, custom) intentionally return null;
 * naming there is user-chosen and a regex guess does more harm than
 * good. Users assign tier slots manually via tierOverrides for those.
 */

import type { ModelInfo } from '../../types/model-registry';
import { normalizeModelId } from '../../types/model-registry';
import type {
    AutoTierSource,
    ModelTier,
    ProviderType,
} from '../../types/settings';

export interface ClassifyOptions {
    modelInfo?: ModelInfo;
    pricing?: {
        promptUsd?: number;
        completionUsd?: number;
    };
    providerType?: ProviderType;
}

export interface ClassifyResult {
    tier: ModelTier;
    source: AutoTierSource;
}

const FLAGSHIP_PATTERNS: RegExp[] = [
    /\bclaude.*opus\b/i,
    /\bclaude.*fable\b/i,
    /\bopus-[34](?:[-.]|$)/i,
    /\bgpt-5(?!.*(?:mini|nano))/i,
    /\bgpt-4\.5\b/i,
    /\bo1(?!-mini)\b/i,
    /\bo3(?!-mini)\b/i,
    /\bo4(?!-mini)\b/i,
    /\bgemini-(?:1\.5|2\.0|2\.5|3)-pro\b/i,
    /\bgemini-3(?:\.\d+)?-pro\b/i,
    /\bgemini-pro\b/i,
    /\bdeepseek-(?:reasoner|r1)\b/i,
    /\bgrok-4(?!-mini)\b/i,
    /\bllama[-_]?3.*405b\b/i,
    /\bqwen3(?:\.\d+)?-max\b/i,
];

const MID_PATTERNS: RegExp[] = [
    /\bclaude.*sonnet\b/i,
    /\bsonnet-[34](?:[-.]|$)/i,
    /\bgpt-4\.1(?!.*(?:mini|nano))/i,
    /\bgpt-4o(?!-mini)\b/i,
    /\bgpt-4(?!.*(?:o-?mini|\.1-?(?:mini|nano)|\.5))/i,
    /\bgpt-5\.\d+-mini\b/i,
    /\bo1-mini\b/i,
    /\bo3-mini\b/i,
    /\bo4-mini\b/i,
    /\bgemini-(?:2\.5|2\.0)-flash(?!-(?:lite|8b))/i,
    /\bdeepseek-(?:chat|v[234])\b(?!.*flash)/i,
    /\bgrok-3(?!-mini)\b/i,
    /\bllama[-_]?3.*70b\b/i,
    /\bllama[-_]?3.*120b\b/i,
    /\bllama[-_]?4\b/i,
    /\bglm-[45](?:\.\d+)?(?!.*flash)/i,
    /\bqwen3(?:\.\d+)?-plus\b/i,
    /\bminimax-m[23]\b/i,
    /\bkimi-k2\b/i,
    /\bnova(?:-\d+(?:\.\d+)?)?-(?:premier|pro)\b/i,
];

const FAST_PATTERNS: RegExp[] = [
    /\bclaude.*haiku\b/i,
    /\bhaiku-[34](?:[-.]|$)/i,
    /\bgpt-5-mini\b/i,
    /\bgpt-5(?:\.\d+)?-nano\b/i,
    /\bgpt-4o-mini\b/i,
    /\bgpt-4\.1-(?:mini|nano)\b/i,
    /\bgpt-3\.5\b/i,
    /\bgemini-(?:1\.5|2(?:\.0|\.5)?)-flash(?:-(?:lite|8b))\b/i,
    /\bgemini-3(?:\.\d+)?-flash(?:-lite)?\b/i,
    /\bgemini-flash-lite\b/i,
    /\bgemini-1\.5-flash\b/i,
    /\bgrok-3-mini\b/i,
    /\bgrok.*mini\b/i,
    /\bllama[-_]?3.*(?:8b|3b|1b)\b/i,
    /\bphi-3\b/i,
    /\bdeepseek-coder\b/i,
    /\bdeepseek-v\d+(?:\.\d+)?-flash\b/i,
    /\bglm-[45](?:\.\d+)?-flash\b/i,
    /\bqwen3(?:\.\d+)?-flash\b/i,
    /\bnova(?:-\d+(?:\.\d+)?)?-(?:lite|micro)\b/i,
];

/**
 * Ids that are not chat/completion models at all (embeddings, rerankers,
 * audio, image, moderation). Provider list endpoints (Bedrock
 * ListInferenceProfiles, Azure deployments, Copilot listModels) have no
 * modality filter, so these reach the classifier. They must neither get
 * a tier (a rerank model in a tier slot breaks routing) nor count as
 * "unclassified" in discovery logs.
 */
const NON_CHAT_PATTERNS: RegExp[] = [
    /\btext-embedding-/i,
    /(?:^|[./-])embed(?:ding)?s?(?:[.:-]|$)/i,
    /\brerank/i,
    /(?:^|-)(?:tts|audio|realtime|transcribe|whisper|moderation|image)(?:-|$)/i,
    /\bdall-e/i,
    /\btrajectory-compaction\b/i,
];

/**
 * True when the id names a non-chat model (embedding, reranker, audio,
 * image, moderation). Checked against the raw id AND the normalized id
 * because Bedrock decoration can hide the marker (eu.cohere.embed-v4
 * normalizes to "embed", cohere.rerank-v3-5 to "rerank-v3-5").
 */
export function isNonChatModelId(modelId: string): boolean {
    if (!modelId) return false;
    const normalized = normalizeModelId(modelId);
    return (
        matchPatternList(modelId, NON_CHAT_PATTERNS) ||
        matchPatternList(normalized, NON_CHAT_PATTERNS)
    );
}

const LOCAL_PROVIDER_TYPES = new Set<ProviderType>([
    'ollama',
    'lmstudio',
    'custom',
]);

/**
 * True for providers whose models are never auto-classified (naming is
 * user-chosen there; tiers come from tierOverrides). Exported so the
 * discovery service can skip its unclassified summary log for them.
 */
export function isLocalProviderType(providerType: ProviderType): boolean {
    return LOCAL_PROVIDER_TYPES.has(providerType);
}

// Capability fallback thresholds (ADR-121 documented heuristics).
const CAPABILITY_THRESHOLDS = {
    flagshipContext: 200_000,
    flagshipMaxOutput: 32_000,
    midContext: 128_000,
    midMaxOutput: 8_000,
} as const;

// OpenRouter completion pricing thresholds (USD per million tokens).
const PRICING_THRESHOLDS = {
    flagshipUsdPerMillion: 50,
    midUsdPerMillion: 5,
} as const;

function matchPatternList(id: string, patterns: RegExp[]): boolean {
    for (const re of patterns) {
        if (re.test(id)) return true;
    }
    return false;
}

function classifyByPattern(normalizedId: string): ModelTier | null {
    if (matchPatternList(normalizedId, FLAGSHIP_PATTERNS)) return 'flagship';
    if (matchPatternList(normalizedId, MID_PATTERNS)) return 'mid';
    if (matchPatternList(normalizedId, FAST_PATTERNS)) return 'fast';
    return null;
}

function classifyByPricing(completionUsd?: number): ModelTier | null {
    if (completionUsd === undefined || Number.isNaN(completionUsd)) return null;
    // OpenRouter quotes pricing as USD per token in their /v1/models API;
    // callers multiply by 1_000_000 before handing the number in so this
    // function speaks the same unit as the documented thresholds.
    if (completionUsd >= PRICING_THRESHOLDS.flagshipUsdPerMillion) return 'flagship';
    if (completionUsd >= PRICING_THRESHOLDS.midUsdPerMillion) return 'mid';
    if (completionUsd >= 0) return 'fast';
    return null;
}

function classifyByCapability(info?: ModelInfo): ModelTier | null {
    if (!info) return null;
    const ctx = info.contextWindow ?? 0;
    const out = info.maxTokens ?? 0;
    if (
        ctx >= CAPABILITY_THRESHOLDS.flagshipContext &&
        out >= CAPABILITY_THRESHOLDS.flagshipMaxOutput
    ) {
        return 'flagship';
    }
    if (
        ctx >= CAPABILITY_THRESHOLDS.midContext &&
        out >= CAPABILITY_THRESHOLDS.midMaxOutput
    ) {
        return 'mid';
    }
    if (ctx > 0) return 'fast';
    return null;
}

/**
 * Classify a model id into a tier slot.
 * Returns null when the model belongs to a local provider, or when
 * none of pattern / pricing / capability produces a verdict (user has
 * to assign the tier manually via tierOverrides).
 */
export function classifyModelTier(
    modelId: string,
    opts: ClassifyOptions = {},
): ClassifyResult | null {
    if (!modelId) return null;

    if (opts.providerType && LOCAL_PROVIDER_TYPES.has(opts.providerType)) {
        return null;
    }

    // Non-chat models (embeddings, rerankers, audio, ...) never get a
    // tier, regardless of pricing or capability signals. Silent: callers
    // aggregate discovery stats themselves.
    if (isNonChatModelId(modelId)) {
        return null;
    }

    const normalized = normalizeModelId(modelId);

    // Raw-id fallback: normalizeModelId strips a trailing "-v<digits>"
    // as a Bedrock version suffix, which eats real version markers like
    // deepseek-v4 (normalizes to bare "deepseek"). When the normalized
    // id yields no verdict, retry the patterns on the raw id.
    const patternTier =
        classifyByPattern(normalized) ?? classifyByPattern(modelId);
    if (patternTier) {
        return { tier: patternTier, source: 'pattern' };
    }

    const pricingTier = classifyByPricing(opts.pricing?.completionUsd);
    if (pricingTier) {
        // Outlier signal: pricing-only classification means our pattern table
        // doesn't know this id. Surface it so we can extend the table later.
        console.debug(
            `[ModelTierClassifier] outlier (pricing-only): id=${modelId} normalized=${normalized} -> ${pricingTier}`,
        );
        return { tier: pricingTier, source: 'pricing' };
    }

    const capTier = classifyByCapability(opts.modelInfo);
    if (capTier) {
        console.debug(
            `[ModelTierClassifier] outlier (capability-only): id=${modelId} normalized=${normalized} -> ${capTier}`,
        );
        return { tier: capTier, source: 'capability' };
    }

    // No per-id log here: ModelDiscoveryService aggregates unclassified
    // ids into a single summary line per refresh (ISSUE-C, ~200 lines of
    // console noise on startup with large OpenRouter model lists).
    return null;
}
