/**
 * VectorStore -- Vector CRUD and Cosine-Similarity search on the Knowledge DB.
 *
 * Stores embedding vectors as Float32Array BLOBs in SQLite.
 * Search uses bulk-loaded vectors with in-JS cosine similarity (10-50x faster
 * than SQL custom functions due to JS→WASM overhead per row).
 *
 * ADR-050: SQLite Knowledge DB
 * FEATURE-1500: SQLite Knowledge DB
 * ADR-137: Domain-aware layered access. Direkter Zugriff auf die vectors-Tabelle ist nur über diesen Store erlaubt; Aufrufer wählen die Domäne (siehe KNOWLEDGE_DOMAINS in knowledgeDomains.ts), nicht die Tabelle.
 */

import type { KnowledgeDB, SqlJsDatabase } from './KnowledgeDB';
import { KNOWLEDGE_DOMAINS, type KnowledgeDomain, pathPrefixToDomain } from './knowledgeDomains';

// Re-export so callers can use `import { KnowledgeDomain } from '.../VectorStore'`
// without a separate import of the domain module.
export { KNOWLEDGE_DOMAINS, pathPrefixToDomain };
export type { KnowledgeDomain };

// ---------------------------------------------------------------------------
// Domain-aware find filter
// ---------------------------------------------------------------------------

/**
 * Filter for {@link VectorStore.findVectors} and the per-domain wrappers.
 *
 * `pathLike` is forwarded as the right-hand side of a SQLite `LIKE` clause
 * (caller-supplied wildcards like `%` are respected). `excludePathPrefixes`
 * and `excludePathContains` are translated to chained `path NOT LIKE` clauses
 * and are matched literally (no wildcard escaping on the caller side).
 */
export interface FindVectorsFilter {
    domain?: KnowledgeDomain;
    chunkIndex?: number;
    pathLike?: string;
    excludePathPrefixes?: string[];
    excludePathContains?: string[];
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VectorEntry {
    id: number;
    path: string;
    chunkIndex: number;
    text: string;
    vector: Float32Array;
    mtime: number;
}

export interface VectorSearchResult {
    path: string;
    text: string;
    chunkIndex: number;
    score: number;
}

// ---------------------------------------------------------------------------
// Cached vector data for fast search
// ---------------------------------------------------------------------------

interface CachedVector {
    id: number;
    path: string;
    chunkIndex: number;
    text: string;
    vector: Float32Array;
}

// ---------------------------------------------------------------------------
// VectorStore
// ---------------------------------------------------------------------------

export class VectorStore {
    private knowledgeDB: KnowledgeDB;
    private vectorCache: CachedVector[] | null = null;

    constructor(knowledgeDB: KnowledgeDB) {
        this.knowledgeDB = knowledgeDB;
    }

    // -----------------------------------------------------------------------
    // Write operations
    // -----------------------------------------------------------------------

    /**
     * Insert chunks for a file. Replaces any existing chunks for that path.
     * Vectors are stored as Float32Array BLOBs.
     *
     * The `domain` column (FEAT-03-27 / ADR-136) is inferred from the path
     * prefix when not provided, so legacy callers that still pass a
     * `session:`/`episode:`/`fact:` path land in the correct layer. New
     * callers should use the per-domain helpers (`insertNoteVector`,
     * `insertSessionVector`, ...) which set the discriminator explicitly.
     *
     * @param enriched - 0 = raw chunks (Pass 1), 1 = enriched with context prefix (Pass 2)
     * @param domain - Override the auto-inferred domain. Defaults to `pathPrefixToDomain(filePath)`.
     */
    insertChunks(
        filePath: string,
        chunks: string[],
        vectors: Float32Array[],
        mtime: number,
        enriched = 0,
        domain?: KnowledgeDomain,
    ): void {
        const db = this.getDB();
        const resolvedDomain: KnowledgeDomain = domain ?? pathPrefixToDomain(filePath);

        // Delete existing chunks for this path
        db.run('DELETE FROM vectors WHERE path = ?', [filePath]);

        // Insert new chunks
        const stmt = db.prepare(
            'INSERT INTO vectors (path, chunk_index, text, vector, mtime, enriched, domain) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        for (let i = 0; i < chunks.length; i++) {
            const vecBytes = new Uint8Array(vectors[i].buffer, vectors[i].byteOffset, vectors[i].byteLength);
            stmt.run([filePath, i, chunks[i], vecBytes, mtime, enriched, resolvedDomain]);
        }
        stmt.free();

        this.invalidateCache();
        this.knowledgeDB.markDirty();
    }

    // -----------------------------------------------------------------------
    // Domain-typed insert helpers (FEAT-03-27 / ADR-136)
    // -----------------------------------------------------------------------

    /** Insert vault-note chunks (domain = 'note'). */
    insertNoteVector(
        filePath: string,
        chunks: string[],
        vectors: Float32Array[],
        mtime: number,
        enriched = 0,
    ): void {
        this.insertChunks(filePath, chunks, vectors, mtime, enriched, 'note');
    }

    /** Insert session-transcript chunks (domain = 'session'). Path is forced to `session:<id>`. */
    insertSessionVector(sessionId: string, chunks: string[], vectors: Float32Array[], mtime: number): void {
        this.insertChunks(`session:${sessionId}`, chunks, vectors, mtime, 0, 'session');
    }

    /** Insert episode chunks (domain = 'episode'). Path is forced to `episode:<id>`. */
    insertEpisodeVector(episodeId: string, chunks: string[], vectors: Float32Array[], mtime: number): void {
        this.insertChunks(`episode:${episodeId}`, chunks, vectors, mtime, 0, 'episode');
    }

    /** Insert fact chunks (domain = 'fact'). Path is forced to `fact:<id>`. */
    insertFactVector(factId: string, chunks: string[], vectors: Float32Array[], mtime: number): void {
        this.insertChunks(`fact:${factId}`, chunks, vectors, mtime, 0, 'fact');
    }

    /** Insert mention chunks (domain = 'mention'). Path is forced to `mention:<id>`. */
    insertMentionVector(mentionId: string, chunks: string[], vectors: Float32Array[], mtime: number): void {
        this.insertChunks(`mention:${mentionId}`, chunks, vectors, mtime, 0, 'mention');
    }

    /** Insert thread chunks (domain = 'thread'). Path is forced to `thread:<id>`. */
    insertThreadVector(threadId: string, chunks: string[], vectors: Float32Array[], mtime: number): void {
        this.insertChunks(`thread:${threadId}`, chunks, vectors, mtime, 0, 'thread');
    }

    /** Insert entity chunks (domain = 'entity'). Path is forced to `entity:<id>`. */
    insertEntityVector(entityId: string, chunks: string[], vectors: Float32Array[], mtime: number): void {
        this.insertChunks(`entity:${entityId}`, chunks, vectors, mtime, 0, 'entity');
    }

    /** Delete all chunks for a file path. */
    deleteByPath(filePath: string): void {
        const db = this.getDB();
        db.run('DELETE FROM vectors WHERE path = ?', [filePath]);
        this.invalidateCache();
        this.knowledgeDB.markDirty();
    }

    /** Delete all vectors (full reset). */
    deleteAll(): void {
        const db = this.getDB();
        db.run('DELETE FROM vectors');
        this.invalidateCache();
        this.knowledgeDB.markDirty();
    }

    // -----------------------------------------------------------------------
    // Read operations
    // -----------------------------------------------------------------------

    /** Get all unique file paths with their max mtime. Used for checkpoint/delta logic. */
    getPathMtimes(): Map<string, number> {
        const db = this.getDB();
        const result = db.exec('SELECT path, MAX(mtime) as mtime FROM vectors GROUP BY path');
        const map = new Map<string, number>();
        if (result.length > 0) {
            for (const row of result[0].values) {
                map.set(row[0] as string, row[1] as number);
            }
        }
        return map;
    }

    /**
     * Paths that look like stub entries: exactly one chunk whose stored text
     * (including the title and frontmatter prefix) is shorter than maxLen.
     * Used by the one-time body-gate cleanup sweep (ISSUE-E). Legit notes
     * that slip in are re-read by the caller and kept.
     */
    getStubCandidatePaths(maxLen: number): string[] {
        const db = this.getDB();
        const result = db.exec(
            "SELECT path FROM vectors WHERE domain = 'note' GROUP BY path HAVING COUNT(*) = 1 AND MAX(LENGTH(text)) < ?",
            [maxLen],
        );
        if (result.length === 0) return [];
        return result[0].values.map((row) => row[0] as string);
    }

    // -----------------------------------------------------------------------
    // Domain-typed find helpers (FEAT-03-27 / ADR-136)
    // -----------------------------------------------------------------------

    /**
     * Cross-layer reader. Returns VectorEntry rows that match the filter.
     *
     * Pass `domain` to scope to a single layer; omit it to read across all
     * layers (used by the cross-layer Reranker). `pathLike`, `excludePathPrefixes`
     * and `excludePathContains` are AND-combined with the domain clause.
     */
    findVectors(filter: FindVectorsFilter = {}): VectorEntry[] {
        const db = this.getDB();

        const where: string[] = [];
        const params: Array<string | number> = [];

        if (filter.domain !== undefined) {
            where.push('domain = ?');
            params.push(filter.domain);
        }
        if (filter.chunkIndex !== undefined) {
            where.push('chunk_index = ?');
            params.push(filter.chunkIndex);
        }
        if (filter.pathLike !== undefined) {
            where.push('path LIKE ?');
            params.push(filter.pathLike);
        }
        if (filter.excludePathPrefixes && filter.excludePathPrefixes.length > 0) {
            for (const prefix of filter.excludePathPrefixes) {
                where.push('path NOT LIKE ?');
                params.push(`${prefix}%`);
            }
        }
        if (filter.excludePathContains && filter.excludePathContains.length > 0) {
            for (const needle of filter.excludePathContains) {
                where.push('path NOT LIKE ?');
                params.push(`%${needle}%`);
            }
        }

        const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
        const sql = `SELECT id, path, chunk_index, text, vector, mtime FROM vectors${whereClause}`;
        const result = db.exec(sql, params);
        if (result.length === 0) return [];

        return result[0].values.map((row) => {
            const vecBlob = row[4] as Uint8Array;
            return {
                id: row[0] as number,
                path: row[1] as string,
                chunkIndex: row[2] as number,
                text: row[3] as string,
                vector: new Float32Array(vecBlob.buffer, vecBlob.byteOffset, vecBlob.byteLength / 4),
                mtime: row[5] as number,
            };
        });
    }

    /** Note-layer find. Forces `domain = 'note'` regardless of caller input. */
    findNoteVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'note' });
    }

    /** Session-layer find. */
    findSessionVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'session' });
    }

    /** Episode-layer find. */
    findEpisodeVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'episode' });
    }

    /** Fact-layer find. */
    findFactVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'fact' });
    }

    /** Mention-layer find. */
    findMentionVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'mention' });
    }

    /** Thread-layer find. */
    findThreadVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'thread' });
    }

    /** Entity-layer find. */
    findEntityVectors(filter: Omit<FindVectorsFilter, 'domain'> = {}): VectorEntry[] {
        return this.findVectors({ ...filter, domain: 'entity' });
    }

    /** Get total number of unique indexed files. */
    getFileCount(): number {
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(DISTINCT path) FROM vectors');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    /** Get total number of vectors. */
    getVectorCount(): number {
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(*) FROM vectors');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    /** Check if a file path has any chunks in the index. */
    hasFile(filePath: string): boolean {
        const db = this.getDB();
        const result = db.exec('SELECT 1 FROM vectors WHERE path = ? LIMIT 1', [filePath]);
        return result.length > 0 && result[0].values.length > 0;
    }

    // -----------------------------------------------------------------------
    // Vector search
    // -----------------------------------------------------------------------

    /**
     * Search for the top-K most similar chunks to the query vector.
     * Uses bulk-loaded cached vectors + JS cosine similarity.
     *
     * @param pathPrefix - Optional path prefix filter (e.g. 'session:' for session vectors)
     */
    search(queryVector: Float32Array, topK = 5, pathPrefix?: string): VectorSearchResult[] {
        const cache = this.ensureCache();

        // Filter by prefix if needed (e.g. 'session:', 'episode:')
        const candidates = pathPrefix
            ? cache.filter(c => c.path.startsWith(pathPrefix))
            : cache.filter(c => !c.path.startsWith('session:') && !c.path.startsWith('episode:'));

        if (candidates.length === 0) return [];

        // Compute cosine similarity for all candidates
        const scored = candidates.map(c => ({
            path: c.path,
            text: c.text,
            chunkIndex: c.chunkIndex,
            score: cosineSimilarity(queryVector, c.vector),
        }));

        // Sort by score descending and return top-K
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }

    /**
     * Search with per-file deduplication: returns the best chunk per unique file.
     * This matches the behavior of the old vectra-based search.
     */
    searchUniqueFiles(queryVector: Float32Array, topK = 5, pathPrefix?: string): VectorSearchResult[] {
        // Request more candidates to ensure enough unique files after dedup
        const rawResults = this.search(queryVector, topK * 3, pathPrefix);

        const byPath = new Map<string, VectorSearchResult>();
        for (const r of rawResults) {
            if (!byPath.has(r.path)) {
                byPath.set(r.path, r);
                if (byPath.size >= topK) break;
            }
        }
        return Array.from(byPath.values());
    }

    // -----------------------------------------------------------------------
    // Cache management
    // -----------------------------------------------------------------------

    /** Invalidate the in-memory vector cache. Next search() will reload from DB. */
    invalidateCache(): void {
        this.vectorCache = null;
    }

    // M-3: Maximum cache size to prevent OOM on very large vaults
    private static readonly MAX_CACHE_VECTORS = 200_000;

    private ensureCache(): CachedVector[] {
        if (this.vectorCache) return this.vectorCache;

        const db = this.getDB();
        const result = db.exec('SELECT id, path, chunk_index, text, vector FROM vectors');

        if (result.length === 0) {
            this.vectorCache = [];
            return this.vectorCache;
        }

        const rows = result[0].values;
        if (rows.length > VectorStore.MAX_CACHE_VECTORS) {
            console.warn(`[VectorStore] ${rows.length} vectors exceed cache limit (${VectorStore.MAX_CACHE_VECTORS}). Loading subset.`);
        }
        const limited = rows.slice(0, VectorStore.MAX_CACHE_VECTORS);

        this.vectorCache = limited.map(row => {
            const vecBlob = row[4] as Uint8Array;
            return {
                id: row[0] as number,
                path: row[1] as string,
                chunkIndex: row[2] as number,
                text: row[3] as string,
                vector: new Float32Array(vecBlob.buffer, vecBlob.byteOffset, vecBlob.byteLength / 4),
            };
        });

        console.debug(`[VectorStore] Loaded ${this.vectorCache.length} vectors into cache`);
        return this.vectorCache;
    }

    // -----------------------------------------------------------------------
    // Text-only queries (no vectors loaded)
    // -----------------------------------------------------------------------

    /** All chunks (text only, no vectors) for TF-IDF keyword search. */
    getAllChunks(): Array<{ path: string; chunkIndex: number; text: string }> {
        const db = this.getDB();
        const result = db.exec('SELECT path, chunk_index, text FROM vectors');
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            path: row[0] as string,
            chunkIndex: row[1] as number,
            text: row[2] as string,
        }));
    }

    /** Chunk texts for a specific file, sorted by chunk_index. */
    getChunkTextsByPath(filePath: string): string[] {
        const db = this.getDB();
        const result = db.exec('SELECT text FROM vectors WHERE path = ? ORDER BY chunk_index', [filePath]);
        if (result.length === 0) return [];
        return result[0].values.map(row => row[0] as string);
    }

    // -----------------------------------------------------------------------
    // Score-gated adjacent chunk retrieval (FEATURE-1501)
    // -----------------------------------------------------------------------

    /**
     * Get merged text of a chunk + adjacent chunks, filtered by similarity threshold.
     * Only adjacent chunks with cosine similarity >= threshold to the query vector are included.
     * This prevents irrelevant context when topics change within a file.
     */
    getAdjacentText(
        filePath: string,
        chunkIndex: number,
        queryVector: Float32Array,
        window = 1,
        threshold = 0.3,
    ): string {
        const cache = this.ensureCache();
        const fileChunks = cache.filter(c => c.path === filePath);
        if (fileChunks.length === 0) return '';

        const minIdx = Math.max(0, chunkIndex - window);
        const maxIdx = chunkIndex + window;

        const parts: string[] = [];
        for (const c of fileChunks) {
            if (c.chunkIndex < minIdx || c.chunkIndex > maxIdx) continue;
            if (c.chunkIndex === chunkIndex) {
                // Always include the matched chunk itself
                parts.push(c.text);
            } else {
                // Adjacent: only include if similarity >= threshold
                const sim = cosineSimilarity(queryVector, c.vector);
                if (sim >= threshold) {
                    parts.push(c.text);
                }
            }
        }
        // Sort by chunkIndex to maintain document order
        return parts.join('\n\n');
    }

    /**
     * Search with score-gated adjacent context and multi-chunk per file.
     * Returns enriched results where each hit includes adjacent context (if relevant)
     * and multiple hits per file are allowed.
     */
    searchWithContext(
        queryVector: Float32Array,
        topK = 5,
        adjacentWindow = 1,
        adjacentThreshold = 0.3,
        maxPerFile = 2,
        pathPrefix?: string,
    ): VectorSearchResult[] {
        const cache = this.ensureCache();

        // Filter by prefix if needed
        const candidates = pathPrefix
            ? cache.filter(c => c.path.startsWith(pathPrefix))
            : cache.filter(c => !c.path.startsWith('session:') && !c.path.startsWith('episode:'));

        if (candidates.length === 0) return [];

        // Score all candidates
        const scored = candidates.map(c => ({
            path: c.path,
            text: c.text,
            chunkIndex: c.chunkIndex,
            score: cosineSimilarity(queryVector, c.vector),
        }));
        scored.sort((a, b) => b.score - a.score);

        // Group by file, keep top maxPerFile per file
        const perFileCount = new Map<string, number>();
        const selected: typeof scored = [];
        for (const s of scored) {
            const count = perFileCount.get(s.path) ?? 0;
            if (count >= maxPerFile) continue;
            perFileCount.set(s.path, count + 1);
            selected.push(s);
            if (selected.length >= topK * 2) break; // enough candidates
        }

        // Enrich with adjacent context
        const results: VectorSearchResult[] = selected.slice(0, topK).map(s => ({
            path: s.path,
            text: this.getAdjacentText(s.path, s.chunkIndex, queryVector, adjacentWindow, adjacentThreshold),
            chunkIndex: s.chunkIndex,
            score: s.score,
        }));

        return results;
    }

    // -----------------------------------------------------------------------
    // Note-level vectors (for implicit connection computation)
    // -----------------------------------------------------------------------

    /**
     * Compute note-level vectors by averaging all chunk vectors per file path.
     * Excludes session:/episode: entries. Returns Map<path, avgVector>.
     */
    getNoteVectors(): Map<string, Float32Array> {
        const cache = this.ensureCache();
        const byPath = new Map<string, Float32Array[]>();

        for (const c of cache) {
            if (c.path.startsWith('session:') || c.path.startsWith('episode:')) continue;
            const list = byPath.get(c.path) ?? [];
            list.push(c.vector);
            byPath.set(c.path, list);
        }

        const result = new Map<string, Float32Array>();
        for (const [path, vectors] of byPath) {
            if (vectors.length === 0) continue;
            const dim = vectors[0].length;
            const avg = new Float32Array(dim);
            for (const v of vectors) {
                for (let i = 0; i < dim; i++) avg[i] += v[i];
            }
            for (let i = 0; i < dim; i++) avg[i] /= vectors.length;
            result.set(path, avg);
        }

        return result;
    }

    // -----------------------------------------------------------------------
    // Background enrichment helpers (Pass 2)
    // -----------------------------------------------------------------------

    /** Fetch a batch of unenriched vault chunks (excludes session:/episode: entries). */
    getUnenrichedChunks(limit = 50): Array<{ id: number; path: string; chunkIndex: number; text: string }> {
        const db = this.getDB();
        const result = db.exec(
            "SELECT id, path, chunk_index, text FROM vectors WHERE enriched = 0 AND path NOT LIKE 'session:%' AND path NOT LIKE 'episode:%' LIMIT ?",
            [limit],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            id: row[0] as number,
            path: row[1] as string,
            chunkIndex: row[2] as number,
            text: row[3] as string,
        }));
    }

    /** Update a single chunk with enriched text + re-embedded vector. */
    updateChunkEnriched(id: number, text: string, vector: Float32Array): void {
        const db = this.getDB();
        const vecBytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
        db.run('UPDATE vectors SET text = ?, vector = ?, enriched = 1 WHERE id = ?', [text, vecBytes, id]);
        this.invalidateCache();
        this.knowledgeDB.markDirty();
    }

    /** Count unenriched vault chunks (for progress tracking). */
    getUnenrichedCount(): number {
        const db = this.getDB();
        const result = db.exec(
            "SELECT COUNT(*) FROM vectors WHERE enriched = 0 AND path NOT LIKE 'session:%' AND path NOT LIKE 'episode:%'",
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    /** Count all vault chunks (for progress denominator). */
    getTotalVaultChunkCount(): number {
        const db = this.getDB();
        const result = db.exec(
            "SELECT COUNT(*) FROM vectors WHERE path NOT LIKE 'session:%' AND path NOT LIKE 'episode:%'",
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    /** Reset all vault chunks to unenriched (e.g. after contextual model change). */
    resetEnrichmentStatus(): void {
        const db = this.getDB();
        db.run("UPDATE vectors SET enriched = 0 WHERE path NOT LIKE 'session:%' AND path NOT LIKE 'episode:%'");
        this.invalidateCache();
        this.knowledgeDB.markDirty();
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }
}

// ---------------------------------------------------------------------------
// Cosine similarity (optimized for Float32Array)
// ---------------------------------------------------------------------------

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
