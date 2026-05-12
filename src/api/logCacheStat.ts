/**
 * logCacheStat -- RESEARCH-36 diagnostic. One debug line per API call showing
 * prompt-cache effectiveness, emitted by every provider so the cache picture
 * is provider-agnostic.
 *
 * `nonCachedInputTokens` = input tokens billed at full price this call.
 * `cacheReadTokens`       = input tokens served from the cache (~10% price).
 * `cacheCreationTokens`   = input tokens just written to the cache (Anthropic/
 *                           Bedrock only; OpenAI-compatible APIs don't report it).
 *
 * hitRate close to 0 across repeated calls of one session => the cached prefix
 * is unstable/poisoned (see RESEARCH-36 section 3). hitRate > ~50% => caching
 * works and the cost driver lies elsewhere (history re-send / tool output).
 *
 * `caching` is 'on'/'OFF' where the provider has an explicit toggle, 'auto'
 * where the provider caches automatically without a flag (OpenAI-compatible).
 */
export function logCacheStat(opts: {
    provider: string;
    model: string;
    caching: 'on' | 'OFF' | 'auto';
    nonCachedInputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens?: number;
    outputTokens: number;
}): void {
    const create = opts.cacheCreationTokens ?? 0;
    const total = opts.nonCachedInputTokens + opts.cacheReadTokens + create;
    const hitRate = total > 0 ? Math.round((opts.cacheReadTokens / total) * 100) : 0;
    console.debug(
        `[CacheStat:${opts.provider}] model=${opts.model} caching=${opts.caching} ` +
        `nonCachedIn=${opts.nonCachedInputTokens}t cacheRead=${opts.cacheReadTokens}t ` +
        `cacheCreate=${create}t out=${opts.outputTokens}t totalIn=${total}t hitRate=${hitRate}%`,
    );
}
