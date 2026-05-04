/**
 * TopicInference -- local, LLM-free topic classification for Memory v2.
 *
 * Reads centroid embeddings stored alongside `known_topics` rows
 * (memory.db, FEATURE-0315 schema) and ranks them by cosine similarity
 * against a query embedding. The conversation-start path uses this to
 * pick the topic-lock without burning a model call on every new chat.
 *
 * ADR-082: centroid-based local inference. Sub-50ms target for
 * O(1000) topics; we pre-load all centroids into a JS array on first
 * call (lazy) and refresh that cache when `refreshCentroidFor()` is
 * invoked.
 *
 * Stale centroids are an accepted trade-off: a topic whose centroid
 * was last computed days ago still matches the rough cluster well
 * enough for a soft-topic-lock. Phase-4's FactExtractor will trigger
 * `refreshCentroidFor` on insert; Phase 3 ships the inference path
 * with a manual refresh hook only.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals.
 *
 * FEATURE-0317 / PLAN-006 task 1.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';

export interface TopicMatch {
    topic: string;
    /** Cosine similarity in [-1, 1]; usually [0, 1] for embedding models. */
    score: number;
}

export interface InferenceOptions {
    /** Reject matches below this score; null returned if nothing qualifies. */
    minScore?: number;
    /** Limit number of returned matches (default 1 = top topic only). */
    topK?: number;
}

interface CachedCentroid {
    topic: string;
    vector: Float32Array;
}

export class TopicInference {
    private cache: CachedCentroid[] | null = null;

    constructor(private readonly memoryDB: MemoryDB) {}

    /**
     * Pick the best-matching topic for a query embedding. Returns null
     * when no centroids exist or none beat `minScore` (default 0.6 to
     * match the Soft-Topic-Lock drift threshold from FEATURE-0317).
     */
    inferTopic(queryEmbedding: Float32Array, opts: InferenceOptions = {}): TopicMatch | null {
        const top = this.inferTopK(queryEmbedding, { ...opts, topK: 1 });
        return top[0] ?? null;
    }

    /** Top-K topic matches, sorted by score descending. */
    inferTopK(queryEmbedding: Float32Array, opts: InferenceOptions = {}): TopicMatch[] {
        const minScore = opts.minScore ?? 0.6;
        const topK = opts.topK ?? 5;
        if (queryEmbedding.length === 0) return [];

        const centroids = this.ensureCache();
        if (centroids.length === 0) return [];

        const matches: TopicMatch[] = [];
        for (const c of centroids) {
            if (c.vector.length !== queryEmbedding.length) continue;
            const score = cosine(queryEmbedding, c.vector);
            if (score >= minScore) matches.push({ topic: c.topic, score });
        }
        matches.sort((a, b) => b.score - a.score);
        return matches.slice(0, topK);
    }

    /**
     * Recompute the centroid for a single topic by averaging the
     * embeddings of all facts tagged with it. Called when a topic gets
     * a new fact (FactExtractor in Phase 4) or manually for repair.
     *
     * `getFactEmbeddingsForTopic` is injected so tests can supply a
     * deterministic source without a full FactStore / fact_embeddings
     * setup.
     */
    refreshCentroidFor(
        topic: string,
        getFactEmbeddingsForTopic: (topic: string) => Float32Array[],
    ): void {
        const embeddings = getFactEmbeddingsForTopic(topic);
        if (embeddings.length === 0) return;
        const dim = embeddings[0].length;
        const avg = new Float32Array(dim);
        for (const v of embeddings) {
            if (v.length !== dim) continue;
            for (let i = 0; i < dim; i++) avg[i] += v[i];
        }
        for (let i = 0; i < dim; i++) avg[i] /= embeddings.length;

        const db = this.memoryDB.getDB();
        const blob = new Uint8Array(avg.buffer, avg.byteOffset, avg.byteLength);
        const now = new Date().toISOString();
        db.run(
            `UPDATE known_topics
                SET centroid_embedding = ?, centroid_computed_at = ?
              WHERE topic = ?`,
            [blob, now, topic],
        );
        this.memoryDB.markDirty();
        this.cache = null; // force reload on next inference
    }

    /** Drop the in-memory centroid cache. Called after bulk topic changes. */
    invalidateCache(): void {
        this.cache = null;
    }

    private ensureCache(): CachedCentroid[] {
        if (this.cache) return this.cache;
        const db = this.memoryDB.getDB();
        const result = db.exec(
            `SELECT topic, centroid_embedding
               FROM known_topics
              WHERE centroid_embedding IS NOT NULL`,
        );
        if (result.length === 0) {
            this.cache = [];
            return this.cache;
        }
        this.cache = result[0].values.map(row => {
            const blob = row[1] as Uint8Array;
            return {
                topic: row[0] as string,
                vector: new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4),
            };
        });
        return this.cache;
    }
}

function cosine(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}
