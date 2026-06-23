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
import type { EmbeddingCache } from './EmbeddingCache';

export interface SemanticIndexHit {
    notePath: string;
    excerpt?: string;
    /** Cosine similarity 0..1. */
    cosineSimilarity: number;
}

/** Multi-chunk hit (EPIC-33 Lookup-Enhancement). */
export interface SemanticIndexChunkHit {
    notePath: string;
    chunkIndex: number;
    /** Full chunk text from the index (not truncated). */
    text: string;
    /** Cosine similarity 0..1. */
    cosineSimilarity: number;
}

export interface SemanticIndexProbe {
    /** Encode the text into an embedding vector. */
    embedText(text: string): Promise<number[]>;
    /**
     * Legacy single-chunk-per-file query. Kept for backwards compat;
     * the enhanced Lookup pipeline uses queryNoteChunks when available.
     */
    queryNoteVectors(args: { embedding: number[]; topN: number }): Promise<SemanticIndexHit[]>;
    /**
     * Wide multi-chunk query -- multiple chunks per file allowed.
     * Caller groups + deduplicates per file. Optional: probes that
     * cannot supply it fall back to queryNoteVectors.
     */
    queryNoteChunks?(args: { embedding: number[]; topK: number }): Promise<SemanticIndexChunkHit[]>;
}

/** Sufficiency-tier emitted by evaluateVaultSufficiency. */
export type VaultSufficiencyTier = 'strong' | 'weak' | 'empty';

/** Audit-derived tunables (no settings UI). */
export const VAULT_SUFFICIENT_MIN_CHARS_STRONG = 600;
export const VAULT_SUFFICIENT_MIN_CHARS_WEAK = 300;
/**
 * Minimum cosine similarity for a chunk to count as a "weak" match
 * that may still be injected into the prompt augmentation. Raised
 * from 0.5 to 0.6 per AUDIT-EPIC-33 L-01 -- 0.5-matches are weak
 * enough that injecting them poisons the LLM context more than it
 * informs the answer.
 */
export const VAULT_WEAK_THRESHOLD_FLOOR = 0.6;
export const VAULT_WEAK_TOP_MIN_SCORE = 0.6;
/** Per-file chunk cap (top + best neighbour). */
export const VAULT_MAX_CHUNKS_PER_FILE = 2;

export interface DefaultVaultRagPipelineOptions {
    probe: SemanticIndexProbe;
    /**
     * Maximum chars sent to the embedding model. The Lookup-Action
     * typically passes short selections, but guard against multi-page
     * embeddings.
     */
    maxSelectionChars?: number;
    /** Optional embedding cache (LRU per-panel). */
    embeddingCache?: EmbeddingCache;
}

export class DefaultVaultRagPipeline implements VaultRagPipeline {
    private readonly probe: SemanticIndexProbe;
    private readonly maxSelectionChars: number;
    private readonly embeddingCache?: EmbeddingCache;

    constructor(options: DefaultVaultRagPipelineOptions) {
        this.probe = options.probe;
        this.maxSelectionChars = options.maxSelectionChars ?? 2000;
        this.embeddingCache = options.embeddingCache;
    }

    async augment(args: {
        selectionText: string;
        confidenceThreshold: number;
        topN: number;
    }): Promise<LookupRagResult | null> {
        const query = args.selectionText.trim().slice(0, this.maxSelectionChars);
        if (query.length === 0) return null;

        const embedding = await this.getEmbedding(query);
        if (!Array.isArray(embedding) || embedding.length === 0) return null;

        // Prefer multi-chunk probe; fall back to legacy single-chunk path.
        const chunks = this.probe.queryNoteChunks !== undefined
            ? await this.probe.queryNoteChunks({ embedding, topK: args.topN * 3 })
            : await this.legacyToChunks({ embedding, topN: args.topN });

        if (chunks.length === 0) {
            return { sources: [], promptAugmentation: '', tier: 'empty' };
        }

        // Group by file, keep up to VAULT_MAX_CHUNKS_PER_FILE chunks per file.
        const grouped = groupChunksByFile(chunks);
        // Cap to topN files (best-score-per-file).
        const limitedFiles = grouped.slice(0, Math.max(1, args.topN));

        // Build candidate sources -- best chunk per file as primary,
        // additional chunks contribute to the prompt augmentation.
        const sources: LookupRagSource[] = limitedFiles.map(g => ({
            notePath: g.notePath,
            excerpt: g.chunks[0].text.length > 200 ? `${g.chunks[0].text.slice(0, 199)}…` : g.chunks[0].text,
            confidence: g.bestScore,
        }));

        const tier = evaluateVaultSufficiency(limitedFiles, args.confidenceThreshold);

        // Build a structured prompt augmentation. One block per file with
        // chunk text concatenated. The LLM can quote `[[note]]` precisely
        // because the path is on its own line.
        const promptAugmentation = limitedFiles.map(g => {
            const lines: string[] = [];
            lines.push(`### [[${g.notePath.replace(/\.md$/, '')}]] (score ${g.bestScore.toFixed(2)})`);
            for (const c of g.chunks) {
                lines.push(c.text);
            }
            return lines.join('\n');
        }).join('\n\n');

        return { sources, promptAugmentation, tier };
    }

    private async getEmbedding(query: string): Promise<number[]> {
        if (this.embeddingCache !== undefined) {
            const cached = this.embeddingCache.get(query);
            if (cached !== undefined) return cached;
        }
        const fresh = await this.probe.embedText(query);
        if (Array.isArray(fresh) && fresh.length > 0 && this.embeddingCache !== undefined) {
            this.embeddingCache.set(query, fresh);
        }
        return fresh;
    }

    private async legacyToChunks(args: { embedding: number[]; topN: number }): Promise<SemanticIndexChunkHit[]> {
        const hits = await this.probe.queryNoteVectors({ embedding: args.embedding, topN: args.topN });
        return hits.map((h, idx) => ({
            notePath: h.notePath,
            chunkIndex: idx,
            text: h.excerpt ?? '',
            cosineSimilarity: h.cosineSimilarity,
        }));
    }
}

/** Per-file grouping output. */
export interface GroupedChunks {
    notePath: string;
    bestScore: number;
    chunks: SemanticIndexChunkHit[];
    excerptChars: number;
}

export function groupChunksByFile(hits: SemanticIndexChunkHit[]): GroupedChunks[] {
    const byPath = new Map<string, SemanticIndexChunkHit[]>();
    for (const h of hits) {
        const arr = byPath.get(h.notePath) ?? [];
        arr.push(h);
        byPath.set(h.notePath, arr);
    }
    const groups: GroupedChunks[] = [];
    for (const [notePath, arr] of byPath.entries()) {
        // Sort chunks by score desc, keep top-N per file.
        arr.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);
        const kept = arr.slice(0, VAULT_MAX_CHUNKS_PER_FILE);
        const totalChars = kept.reduce((s, c) => s + c.text.length, 0);
        groups.push({
            notePath,
            bestScore: kept[0].cosineSimilarity,
            chunks: kept,
            excerptChars: totalChars,
        });
    }
    // Order groups by their best chunk's score desc.
    groups.sort((a, b) => b.bestScore - a.bestScore);
    return groups;
}

/**
 * Three-tier decision: strong / weak / empty.
 *  - strong: >=1 hit clears threshold AND >=MIN_CHARS_STRONG total kept chars.
 *  - weak:   either a strong hit or 2+ weak hits with top>=0.6, AND >=MIN_CHARS_WEAK chars.
 *  - empty:  otherwise.
 */
export function evaluateVaultSufficiency(grouped: GroupedChunks[], threshold: number): VaultSufficiencyTier {
    if (grouped.length === 0) return 'empty';
    const strong = grouped.filter(g => g.bestScore >= threshold);
    const weak = grouped.filter(g => g.bestScore >= VAULT_WEAK_THRESHOLD_FLOOR && g.bestScore < threshold);
    const totalChars = grouped.reduce((s, g) => s + g.excerptChars, 0);
    if (strong.length >= 1 && totalChars >= VAULT_SUFFICIENT_MIN_CHARS_STRONG) return 'strong';
    const weakOk = strong.length >= 1 || (weak.length >= 2 && weak[0].bestScore >= VAULT_WEAK_TOP_MIN_SCORE);
    if (weakOk && totalChars >= VAULT_SUFFICIENT_MIN_CHARS_WEAK) return 'weak';
    return 'empty';
}
