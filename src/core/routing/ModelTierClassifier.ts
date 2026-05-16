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
    /\bopus-[34](?:[-.]|$)/i,
    /\bgpt-5(?!.*(?:mini|nano))/i,
    /\bgpt-4\.5\b/i,
    /\bo1(?!-mini)\b/i,
    /\bo3(?!-mini)\b/i,
    /\bo4(?!-mini)\b/i,
    /\bgemini-(?:2\.5|2\.0|3)-pro\b/i,
    /\bgemini-pro\b/i,
    /\bdeepseek-(?:reasoner|r1)\b/i,
    /\bgrok-4(?!-mini)\b/i,
    /\bllama[-_]?3.*405b\b/i,
];

const MID_PATTERNS: RegExp[] = [
    /\bclaude.*sonnet\b/i,
    /\bsonnet-[34](?:[-.]|$)/i,
    /\bgpt-4\.1(?!.*(?:mini|nano))/i,
    /\bgpt-4o(?!-mini)\b/i,
    /\bgpt-4(?!.*(?:o-?mini|\.1-?(?:mini|nano)|\.5))/i,
    /\bo1-mini\b/i,
    /\bo3-mini\b/i,
    /\bo4-mini\b/i,
    /\bgemini-(?:2\.5|2\.0)-flash(?!-(?:lite|8b))/i,
    /\bdeepseek-(?:chat|v[23])\b/i,
    /\bgrok-3(?!-mini)\b/i,
    /\bllama[-_]?3.*70b\b/i,
    /\bllama[-_]?3.*120b\b/i,
];

const FAST_PATTERNS: RegExp[] = [
    /\bclaude.*haiku\b/i,
    /\bhaiku-[34](?:[-.]|$)/i,
    /\bgpt-4o-mini\b/i,
    /\bgpt-4\.1-(?:mini|nano)\b/i,
    /\bgpt-3\.5\b/i,
    /\bgemini-(?:1\.5|2(?:\.0|\.5)?)-flash(?:-(?:lite|8b))\b/i,
    /\bgemini-flash-lite\b/i,
    /\bgemini-1\.5-flash\b/i,
    /\bgrok-3-mini\b/i,
    /\bgrok.*mini\b/i,
    /\bllama[-_]?3.*(?:8b|3b|1b)\b/i,
    /\bphi-3\b/i,
    /\bdeepseek-coder\b/i,
];

const LOCAL_PROVIDER_TYPES = new Set<ProviderType>([
    'ollama',
    'lmstudio',
    'custom',
]);

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

    const normalized = normalizeModelId(modelId);

    const patternTier = classifyByPattern(normalized);
    if (patternTier) {
        return { tier: patternTier, source: 'pattern' };
    }

    const pricingTier = classifyByPricing(opts.pricing?.completionUsd);
    if (pricingTier) {
        // Outlier signal: pricing-only classification means our pattern table
        // doesn't know this id. Surface it so we can extend the table later.
        // eslint-disable-next-line no-console -- review-bot allows .debug
        console.debug(
            `[ModelTierClassifier] outlier (pricing-only): id=${modelId} normalized=${normalized} -> ${pricingTier}`,
        );
        return { tier: pricingTier, source: 'pricing' };
    }

    const capTier = classifyByCapability(opts.modelInfo);
    if (capTier) {
        // eslint-disable-next-line no-console -- review-bot allows .debug
        console.debug(
            `[ModelTierClassifier] outlier (capability-only): id=${modelId} normalized=${normalized} -> ${capTier}`,
        );
        return { tier: capTier, source: 'capability' };
    }

    // eslint-disable-next-line no-console -- review-bot allows .debug
    console.debug(
        `[ModelTierClassifier] unclassified: id=${modelId} normalized=${normalized} providerType=${opts.providerType ?? 'unknown'}`,
    );
    return null;
}
