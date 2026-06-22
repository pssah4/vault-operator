/**
 * VaultRagPipeline -- production RAG pipeline for Lookup (FEAT-33-09, EPIC-33).
 *
 * Wraps the existing SemanticIndex/VectorStore behind a Probe so the
 * pipeline can be unit-tested without sql.js / WASM. The plugin
 * entry-point builds the Probe over plugin.semanticIndexService and
 * plugin.knowledgeDB.
 *
 * Pipeline:
 *   1. Embed selection text via the active embedding model.
 *   2. Vector-search the note-domain (ADR-137 vectors.domain='note').
 *   3. Filter by confidenceThreshold (cosine similarity).
 *   4. Return prompt augmentation + source list, or null when no
 *      hit crosses the threshold (caller falls back to LLM-only).
 *
 * Related: ADR-142 (pipeline architecture), ADR-136/137 (domain
 * vector store), FEAT-33-02 (Lookup), FEAT-33-09 (this).
 */

import type { LookupRagResult, LookupRagSource, VaultRagPipeline } from '../actions/LookupAction';

export interface SemanticIndexHit {
    notePath: string;
    excerpt?: string;
    /** Cosine similarity 0..1. */
    cosineSimilarity: number;
}

export interface SemanticIndexProbe {
    /** Encode the text into an embedding vector. */
    embedText(text: string): Promise<number[]>;
    /**
     * Query the note-domain semantic index. Implementation typically
     * wraps VectorStore.findNoteVectors({query, limit, domain: 'note'}).
     */
    queryNoteVectors(args: { embedding: number[]; topN: number }): Promise<SemanticIndexHit[]>;
}

export interface DefaultVaultRagPipelineOptions {
    probe: SemanticIndexProbe;
    /**
     * Maximum chars sent to the embedding model. The Lookup-Action
     * typically passes short selections, but guard against multi-page
     * embeddings.
     */
    maxSelectionChars?: number;
}

export class DefaultVaultRagPipeline implements VaultRagPipeline {
    private readonly probe: SemanticIndexProbe;
    private readonly maxSelectionChars: number;

    constructor(options: DefaultVaultRagPipelineOptions) {
        this.probe = options.probe;
        this.maxSelectionChars = options.maxSelectionChars ?? 2000;
    }

    async augment(args: {
        selectionText: string;
        confidenceThreshold: number;
        topN: number;
    }): Promise<LookupRagResult | null> {
        const query = args.selectionText.trim().slice(0, this.maxSelectionChars);
        if (query.length === 0) return null;

        const embedding = await this.probe.embedText(query);
        if (!Array.isArray(embedding) || embedding.length === 0) return null;

        const hits = await this.probe.queryNoteVectors({ embedding, topN: args.topN });
        const filtered = hits.filter(h => h.cosineSimilarity >= args.confidenceThreshold);
        if (filtered.length === 0) return null;

        const sources: LookupRagSource[] = filtered.map(h => ({
            notePath: h.notePath,
            excerpt: h.excerpt,
            confidence: h.cosineSimilarity,
        }));

        const promptAugmentation = filtered
            .map(h => `- ${h.notePath}: ${h.excerpt ?? ''}`)
            .join('\n');

        return { sources, promptAugmentation };
    }
}
