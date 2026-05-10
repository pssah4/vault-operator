/**
 * Provider Cache Capabilities
 *
 * Single source of truth for prompt-caching capability per provider/model.
 * Both the settings UI (toggle visibility) and the provider implementations
 * (cache-style dispatch) read from getCacheCapability().
 *
 * Architecture: ADR-111 (Provider Capability-Flag und Bedrock cachePoint).
 * IMPs: IMP-18-01-01 (this module + UI wiring), IMP-18-01-02 (provider wiring).
 *
 * Wayfinder: src/ARCHITECTURE.map row "cache-capability".
 *
 * To extend: add an entry to CACHE_CAPABILITY_TABLE. Specific patterns first,
 * generic last. Conservative default for unknown patterns is none.
 */

import type { ProviderType } from '../types/settings';

/**
 * How a provider expects cache markers to be set:
 * - anthropic-ephemeral: explicit cache_control on system + last user message
 * - bedrock-cachepoint: explicit cachePoint ContentBlock (Bedrock + Anthropic model)
 * - openai-implicit: automatic cache for prompts >1024 tokens; cached_tokens tracking only
 * - passthrough: anthropic-style cache_control forwarded through a gateway
 * - none: provider does not support prompt caching (or not implemented yet)
 */
export type CacheStyle =
    | 'anthropic-ephemeral'
    | 'bedrock-cachepoint'
    | 'openai-implicit'
    | 'passthrough'
    | 'none';

export interface CacheCapabilityEntry {
    providerType: ProviderType;
    /** Glob-style pattern with `*` as wildcard. Matched against the model id (case-insensitive). */
    modelPattern: string;
    supportsPromptCache: boolean;
    cacheStyle: CacheStyle;
    /** Optional rationale; not consumed at runtime, helps maintainers. */
    notes?: string;
}

/**
 * Capability table. Order matters: the first matching entry wins.
 * Specific patterns must come before generic ones.
 */
export const CACHE_CAPABILITY_TABLE: ReadonlyArray<CacheCapabilityEntry> = [
    // --- Anthropic direct (existing behaviour, FEAT-18-01) ---
    { providerType: 'anthropic', modelPattern: 'claude-*', supportsPromptCache: true, cacheStyle: 'anthropic-ephemeral', notes: 'cache_control: ephemeral on system + last user message' },

    // --- GitHub Copilot ---
    { providerType: 'github-copilot', modelPattern: 'claude-*', supportsPromptCache: true, cacheStyle: 'anthropic-ephemeral', notes: 'Copilot/Claude path mirrors direct Anthropic' },
    { providerType: 'github-copilot', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'No documented caching for non-Claude Copilot models' },

    // --- Bedrock (Phase 2: explicit cachePoint markers) ---
    { providerType: 'bedrock', modelPattern: 'eu.anthropic.claude-*', supportsPromptCache: true, cacheStyle: 'bedrock-cachepoint', notes: 'Cross-region inference EU + Anthropic Claude' },
    { providerType: 'bedrock', modelPattern: 'us.anthropic.claude-*', supportsPromptCache: true, cacheStyle: 'bedrock-cachepoint', notes: 'Cross-region inference US + Anthropic Claude' },
    { providerType: 'bedrock', modelPattern: 'anthropic.claude-*', supportsPromptCache: true, cacheStyle: 'bedrock-cachepoint', notes: 'Direct region Anthropic Claude (rare)' },
    { providerType: 'bedrock', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'Amazon Nova and other Bedrock models: no cachePoint support yet' },

    // --- OpenAI (implicit cache for >1024 tokens, cached_tokens tracking in Phase 2) ---
    { providerType: 'openai', modelPattern: 'gpt-4o*', supportsPromptCache: true, cacheStyle: 'openai-implicit', notes: 'Implicit cache, 50% discount on cached prefix' },
    { providerType: 'openai', modelPattern: 'gpt-4.1*', supportsPromptCache: true, cacheStyle: 'openai-implicit' },
    { providerType: 'openai', modelPattern: 'o1*', supportsPromptCache: true, cacheStyle: 'openai-implicit' },
    { providerType: 'openai', modelPattern: 'o3*', supportsPromptCache: true, cacheStyle: 'openai-implicit' },
    { providerType: 'openai', modelPattern: 'o4*', supportsPromptCache: true, cacheStyle: 'openai-implicit' },
    { providerType: 'openai', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'gpt-3.5 and legacy gpt-4: no implicit cache' },

    // --- Kilo Gateway (Anthropic-format passthrough, Phase 2 verification) ---
    { providerType: 'kilo-gateway', modelPattern: '*', supportsPromptCache: true, cacheStyle: 'passthrough', notes: 'Gateway routes Anthropic-format requests; cache_control passthrough to be verified live' },

    // --- Out of scope for cache (kept explicit for clarity) ---
    { providerType: 'chatgpt-oauth', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'Unofficial backend API, no documented caching' },
    { providerType: 'gemini', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'Gemini Context Caching is TTL-based, separate mechanism, deferred (FEAT-18-01 out of scope)' },
    { providerType: 'ollama', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'Local inference, no API-level cache concept' },
    { providerType: 'lmstudio', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'Local inference' },
    { providerType: 'openrouter', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'No dedicated provider class today; cache support deferred' },
    { providerType: 'azure', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'OpenAI-compatible, but cached_tokens behaviour unverified' },
    { providerType: 'custom', modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none', notes: 'OpenAI-compatible adapter, capability cannot be assumed' },
];

/**
 * Conservative fallback when no entry matches. Same shape as a real entry,
 * always returns supportsPromptCache=false / cacheStyle=none.
 */
function fallback(providerType: ProviderType, modelId: string): CacheCapabilityEntry {
    return {
        providerType,
        modelPattern: '*',
        supportsPromptCache: false,
        cacheStyle: 'none',
        notes: `No capability entry matched provider=${providerType} model=${modelId}, defaulting to none`,
    };
}

/**
 * Lookup the cache capability for a given provider and model id.
 * Returns the first matching entry, or a conservative fallback if no
 * pattern matches.
 */
export function getCacheCapability(providerType: ProviderType, modelId: string): CacheCapabilityEntry {
    const id = (modelId ?? '').toLowerCase();
    for (const entry of CACHE_CAPABILITY_TABLE) {
        if (entry.providerType !== providerType) continue;
        if (matchesPattern(entry.modelPattern, id)) {
            return entry;
        }
    }
    return fallback(providerType, modelId);
}

/**
 * Simple glob match: only the `*` wildcard is supported (zero or more chars).
 * Pattern is lowercased; the model id is expected to be lowercased by the caller.
 */
function matchesPattern(pattern: string, modelId: string): boolean {
    const p = pattern.toLowerCase();
    if (p === '*') return true;
    if (!p.includes('*')) return p === modelId;
    // Convert glob to regex: escape regex specials except *, then * -> .*
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(modelId);
}
