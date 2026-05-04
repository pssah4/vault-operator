/**
 * EmbeddingService -- single embedding entry point for the engine.
 *
 * Phase-1 strategy (PLAN-004 task 5): thin adapter. The class exposes
 * the canonical engine API but delegates the actual HTTP/model work to
 * a host-provided `EmbeddingProvider`. The three current callers
 * (SemanticIndexService for vault chunks, MemoryRetriever for fact
 * lookups, EpisodicExtractor for episode summaries) keep their existing
 * paths in Phase 1 -- migrating them is Phase 2 / FEATURE-0316 to keep
 * Phase 1 risk bounded.
 *
 * Why an adapter and not a re-implementation? The existing path in
 * SemanticIndexService.embedBatchViaApi has battle-tested retry,
 * backoff, batch-size handling, and provider quirks (Azure, OpenAI,
 * OpenRouter, Ollama, LMStudio). Re-deriving that is risk for no
 * Phase-1 benefit. The adapter shape we ship now is what Phase 2
 * will plug into.
 *
 * No `obsidian` import. Engine-extract-ready (ADR-080).
 *
 * FEATURE-0315 / PLAN-004 task 5.
 */

export interface ModelInfo {
    /** Model identifier, e.g. `text-embedding-3-small` or `qwen/qwen3-embedding-8b`. */
    model: string;
    /** Provider tag, e.g. `openai`, `openrouter`, `azure`, `ollama`, `lmstudio`, `mock`. */
    provider: string;
    /** Vector dimensionality, when known. */
    dimensions?: number;
}

/**
 * Adapter interface a host registers with the EmbeddingService. Hosts
 * decide how requests are issued (SDK, fetch, requestUrl) and how
 * retries / rate-limit backoff behave.
 */
export interface EmbeddingProvider {
    readonly info: ModelInfo;
    embed(texts: string[]): Promise<Float32Array[]>;
}

export class EmbeddingService {
    private provider: EmbeddingProvider | null;

    constructor(provider: EmbeddingProvider | null = null) {
        this.provider = provider;
    }

    setProvider(provider: EmbeddingProvider | null): void {
        this.provider = provider;
    }

    getProvider(): EmbeddingProvider | null {
        return this.provider;
    }

    /** Returns ModelInfo or null when no provider is configured. */
    getModelInfo(): ModelInfo | null {
        return this.provider?.info ?? null;
    }

    isReady(): boolean {
        return this.provider !== null;
    }

    /**
     * Embed an array of texts. Returns one Float32Array per input.
     * Throws when no provider is configured -- callers must check
     * isReady() or handle the error.
     */
    async embed(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        if (!this.provider) {
            throw new Error('EmbeddingService: no provider configured. Call setProvider() first.');
        }
        const result = await this.provider.embed(texts);
        if (!Array.isArray(result) || result.length !== texts.length) {
            throw new Error(
                `EmbeddingService: provider returned ${result?.length ?? 'no'} vectors for ${texts.length} inputs`,
            );
        }
        return result;
    }
}
