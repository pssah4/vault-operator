/**
 * KnowledgeGraphAdapter -- abstraction over cross-DB knowledge access.
 *
 * The engine asks "what notes are similar to this?", "who links to that
 * note?", "what's the metadata for this path?" without caring whether
 * the answer comes from an in-process knowledge.db (Setup A/B) or via
 * RPC to a Plugin-MCP (Setup C standalone-service).
 *
 * Spike-1 verdict: ATTACH DATABASE in sql.js is not production-ready
 * (FS API not public). LocalKnowledgeAdapter therefore queries the
 * knowledge.db instance directly and joins results in JavaScript --
 * 0.3 ms p95 for 2-hop walks on Sebastian's vault, well below the
 * 500 ms target.
 *
 * FEATURE-0317 / PLAN-006 task 4.
 */

export interface ImplicitNeighbor {
    /** Vault-relative path of the neighbour note. */
    path: string;
    /** Cosine similarity from `implicit_edges.similarity`, range [-1, 1]. */
    similarity: number;
}

export interface NoteMetadata {
    path: string;
    /** Tags from the `tags` table (frontmatter + inline #tag). */
    tags: string[];
    /** When the note was last semantically (re)indexed, if known. */
    lastIndexedAt?: string;
}

export interface SimilarSearchHit {
    path: string;
    /** Cosine similarity to the query vector. */
    score: number;
    /** Best chunk text for the hit. */
    excerpt?: string;
}

export interface KnowledgeGraphAdapter {
    /**
     * 1-hop or N-hop neighbour walk in `implicit_edges`. Defaults to
     * 1-hop because deeper walks blow up fast on dense vaults; the
     * engine usually wants the immediate cosine neighbours.
     */
    getImplicitNeighbors(
        notePath: string,
        opts?: { hops?: number; limit?: number },
    ): Promise<ImplicitNeighbor[]>;

    getNoteMetadata(notePath: string): Promise<NoteMetadata | null>;

    /**
     * Semantic similar-search via the Vault embedding index. Used by
     * UnifiedGraphService when the engine wants vault-side hits in the
     * fused result list.
     */
    searchSimilar(
        queryVector: Float32Array,
        opts?: { topK?: number },
    ): Promise<SimilarSearchHit[]>;
}
