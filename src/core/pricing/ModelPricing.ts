/**
 * ModelPricing -- USD/EUR cost calculation per model (ADR-090, Lever 5 + 10)
 *
 * Pricing is per-million tokens. Numbers are best-effort published rates,
 * may drift over time -- update when models change. Falls back to Sonnet
 * pricing for unknown models so we always show *something*.
 *
 * USD->EUR uses a static rate (configurable). The point is order-of-magnitude
 * cost awareness for the user, not financial accuracy.
 */

export interface ModelPrice {
    /** USD per 1M input tokens (uncached) */
    inputPerMillionUsd: number;
    /** USD per 1M output tokens */
    outputPerMillionUsd: number;
    /** USD per 1M tokens read from prompt cache (typically 10% of input) */
    cacheReadPerMillionUsd?: number;
    /** USD per 1M tokens written to prompt cache (typically 125% of input) */
    cacheWritePerMillionUsd?: number;
}

export interface CostBreakdown {
    inputCost: number;
    outputCost: number;
    cacheReadCost: number;
    cacheWriteCost: number;
    totalUsd: number;
    totalEur: number;
}

const USD_TO_EUR = 0.93;

/**
 * Pricing table. Keys are matched by:
 *   1. Exact model id (case-insensitive)
 *   2. Substring fallback (e.g. "claude-sonnet" matches any sonnet variant)
 * If nothing matches, FALLBACK is used so the UI never shows blank.
 */
const PRICING: Record<string, ModelPrice> = {
    // Anthropic Claude
    'claude-opus-4-7': { inputPerMillionUsd: 15, outputPerMillionUsd: 75, cacheReadPerMillionUsd: 1.5, cacheWritePerMillionUsd: 18.75 },
    'claude-opus-4-6': { inputPerMillionUsd: 15, outputPerMillionUsd: 75, cacheReadPerMillionUsd: 1.5, cacheWritePerMillionUsd: 18.75 },
    'claude-opus-4': { inputPerMillionUsd: 15, outputPerMillionUsd: 75, cacheReadPerMillionUsd: 1.5, cacheWritePerMillionUsd: 18.75 },
    'claude-sonnet-4-6': { inputPerMillionUsd: 3, outputPerMillionUsd: 15, cacheReadPerMillionUsd: 0.3, cacheWritePerMillionUsd: 3.75 },
    'claude-sonnet-4-5': { inputPerMillionUsd: 3, outputPerMillionUsd: 15, cacheReadPerMillionUsd: 0.3, cacheWritePerMillionUsd: 3.75 },
    'claude-sonnet-4': { inputPerMillionUsd: 3, outputPerMillionUsd: 15, cacheReadPerMillionUsd: 0.3, cacheWritePerMillionUsd: 3.75 },
    'claude-haiku-4-5': { inputPerMillionUsd: 1, outputPerMillionUsd: 5, cacheReadPerMillionUsd: 0.1, cacheWritePerMillionUsd: 1.25 },

    // OpenAI
    'gpt-5': { inputPerMillionUsd: 5, outputPerMillionUsd: 20 },
    'gpt-4.1': { inputPerMillionUsd: 2, outputPerMillionUsd: 8 },
    'gpt-4o': { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
    'gpt-4o-mini': { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
    'o3': { inputPerMillionUsd: 60, outputPerMillionUsd: 240 },
    'o4-mini': { inputPerMillionUsd: 1.1, outputPerMillionUsd: 4.4 },

    // Google
    'gemini-2.5-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 },
    'gemini-2.5-flash': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },

    // Meta (free tiers approximated)
    'llama-3': { inputPerMillionUsd: 0.2, outputPerMillionUsd: 0.6 },
};

/** Used when nothing matches -- midrange Sonnet pricing so UI never blanks. */
const FALLBACK: ModelPrice = { inputPerMillionUsd: 3, outputPerMillionUsd: 15, cacheReadPerMillionUsd: 0.3, cacheWritePerMillionUsd: 3.75 };

/** Look up pricing for a model id. Falls back gracefully. */
export function getModelPrice(modelId: string | undefined | null): ModelPrice {
    if (!modelId) return FALLBACK;
    const lower = modelId.toLowerCase();

    // Exact match first
    if (PRICING[lower]) return PRICING[lower];

    // Substring fallback (longest key first so claude-sonnet-4-6 wins over claude-sonnet-4)
    const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (lower.includes(key)) return PRICING[key];
    }
    return FALLBACK;
}

/**
 * Compute cost for a usage report.
 * cacheReadTokens are billed at the cache-read rate (much cheaper).
 * cacheCreationTokens are billed at the cache-write rate (slightly more than input).
 * Regular inputTokens already exclude cache hits in most providers' usage reports.
 */
export function computeCost(
    modelId: string | undefined | null,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number = 0,
    cacheCreationTokens: number = 0,
): CostBreakdown {
    const price = getModelPrice(modelId);

    const inputCost = (inputTokens / 1_000_000) * price.inputPerMillionUsd;
    const outputCost = (outputTokens / 1_000_000) * price.outputPerMillionUsd;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * (price.cacheReadPerMillionUsd ?? price.inputPerMillionUsd);
    const cacheWriteCost = (cacheCreationTokens / 1_000_000) * (price.cacheWritePerMillionUsd ?? price.inputPerMillionUsd);

    const totalUsd = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    const totalEur = totalUsd * USD_TO_EUR;

    return { inputCost, outputCost, cacheReadCost, cacheWriteCost, totalUsd, totalEur };
}

/**
 * Format an EUR amount for compact display in the UI footer.
 *  < 1¢   -> "<1¢"
 *  < 1€   -> "4.2¢"
 *  >= 1€  -> "1.23€"
 */
export function formatEur(eur: number): string {
    if (eur < 0.01) return '<1¢';
    if (eur < 1) return `${(eur * 100).toFixed(1)}¢`;
    return `${eur.toFixed(2)}€`;
}
