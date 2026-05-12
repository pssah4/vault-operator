/**
 * VaultOperatorEmbeddingProvider -- concrete EmbeddingProvider for the Vault Operator plugin.
 *
 * Phase-2 thin adapter (PLAN-005 task 6). Wraps a callback that does the
 * actual API work, so we keep the battle-tested batch / retry / provider-
 * quirk logic in `SemanticIndexService.embedBatchViaApi` instead of
 * re-deriving it. The callback shape lets tests inject mocks without
 * pulling in SemanticIndexService.
 *
 * Discovery during PLAN-005 task 6: Vault Operator today has only one real
 * embedding caller (SemanticIndexService). The two services PLAN-005
 * originally listed (MemoryRetriever, EpisodicExtractor) call into
 * `semanticIndex.searchSessions / searchEpisodes / indexSessionSummary`
 * and never run their own embed loops. The provider therefore wraps a
 * single delegate and is shared by every Phase-2+ caller that wants the
 * EmbeddingService surface.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals (ADR-080).
 *
 * FEATURE-0316 / PLAN-005 task 6.
 */

import type { EmbeddingProvider, ModelInfo } from './EmbeddingService';

/** Callback that performs the actual embedding work for a batch of texts. */
export type EmbedCallback = (texts: string[]) => Promise<Float32Array[]>;

/** Lazy info supplier so the provider can pick up live model swaps. */
export type ModelInfoSupplier = () => ModelInfo | null;

export interface VaultOperatorEmbeddingProviderOptions {
    /** Lower-cased provider tag, e.g. 'openrouter'. Falls back to `'unknown'`. */
    fallbackInfo?: ModelInfo;
}

export class VaultOperatorEmbeddingProvider implements EmbeddingProvider {
    constructor(
        private readonly embedFn: EmbedCallback,
        private readonly infoSupplier: ModelInfoSupplier,
        private readonly opts: VaultOperatorEmbeddingProviderOptions = {},
    ) {}

    /** Live ModelInfo from the supplier (may change at runtime when user swaps models). */
    get info(): ModelInfo {
        return this.infoSupplier()
            ?? this.opts.fallbackInfo
            ?? { model: 'unknown', provider: 'unknown' };
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        return this.embedFn(texts);
    }
}
