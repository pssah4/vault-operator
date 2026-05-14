/**
 * ImplicitConnectionService -- Discover semantically similar notes without explicit links.
 *
 * Computes pairwise cosine similarity between note-level vectors (averaged chunks)
 * and stores pairs above a threshold in the implicit_edges table. Pairs that already
 * have an explicit edge (Wikilink/MOC) are excluded — only truly "hidden" connections
 * are surfaced.
 *
 * ADR-051: Retrieval Pipeline Stufe 3
 * FEATURE-1503: Implicit Connection Discovery
 */

import type { KnowledgeDB, SqlJsDatabase } from './KnowledgeDB';
import type { VectorStore } from './VectorStore';
import type { GraphStore } from './GraphStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImplicitNeighbor {
    path: string;
    similarity: number;
}

// ---------------------------------------------------------------------------
// ImplicitConnectionService
// ---------------------------------------------------------------------------

export class ImplicitConnectionService {
    private knowledgeDB: KnowledgeDB;
    private vectorStore: VectorStore;
    private graphStore: GraphStore;
    private cancelled = false;
    private running = false;

    constructor(knowledgeDB: KnowledgeDB, vectorStore: VectorStore, graphStore: GraphStore) {
        this.knowledgeDB = knowledgeDB;
        this.vectorStore = vectorStore;
        this.graphStore = graphStore;
    }

    /** Whether computation is currently running. */
    get computing(): boolean { return this.running; }

    /** Cancel an in-progress computation. */
    cancel(): void {
        this.cancelled = true;
    }

    // -----------------------------------------------------------------------
    // Full computation
    // -----------------------------------------------------------------------

    /**
     * Compute all implicit connections between vault notes.
     * Background-safe: yields to UI thread every 1000 pairs.
     *
     * @param threshold - Minimum cosine similarity to store (default 0.7)
     */
    async computeAll(threshold = 0.7): Promise<{ computed: number; stored: number }> {
        if (this.running) return { computed: 0, stored: 0 };
        if (!this.knowledgeDB.isOpen()) {
            console.debug('[ImplicitConnections] DB not ready, skipping startup computation');
            return { computed: 0, stored: 0 };
        }
        this.running = true;
        this.cancelled = false;

        try {
            const db = this.getDB();

            // 1. Compute note-level vectors
            const noteVecs = this.vectorStore.getNoteVectors();
            const paths = Array.from(noteVecs.keys());
            const n = paths.length;

            if (n < 2) {
                this.running = false;
                return { computed: 0, stored: 0 };
            }

            // 2. Build set of explicit edges for filtering
            const explicitEdges = this.buildExplicitEdgeSet(db);

            // 3. Clear old implicit edges
            db.run('DELETE FROM implicit_edges');

            // 4. Pairwise comparison
            const now = new Date().toISOString();
            const stmt = db.prepare(
                'INSERT OR IGNORE INTO implicit_edges (source_path, target_path, similarity, computed_at) VALUES (?, ?, ?, ?)',
            );

            let computed = 0;
            let stored = 0;
            // M-2: Timeout to prevent UI freezing on large vaults
            const MAX_COMPUTATION_MS = 60_000; // 60s max
            const computeStart = Date.now();

            for (let i = 0; i < n && !this.cancelled; i++) {
                const vecA = noteVecs.get(paths[i])!;
                for (let j = i + 1; j < n && !this.cancelled; j++) {
                    computed++;
                    const vecB = noteVecs.get(paths[j])!;
                    const sim = cosineSimilarity(vecA, vecB);

                    if (sim >= threshold) {
                        // Check no explicit link exists
                        const key = paths[i] < paths[j]
                            ? `${paths[i]}|${paths[j]}`
                            : `${paths[j]}|${paths[i]}`;
                        if (!explicitEdges.has(key)) {
                            stmt.run([paths[i], paths[j], sim, now]);
                            stored++;
                        }
                    }

                    // Yield every 1000 pairs + check timeout + DB still open
                    if (computed % 1000 === 0) {
                        if (!this.knowledgeDB.isOpen()) {
                            console.debug('[ImplicitConnections] DB closed during computation, aborting');
                            this.cancelled = true;
                            break;
                        }
                        if (Date.now() - computeStart > MAX_COMPUTATION_MS) {
                            console.warn(`[ImplicitConnections] Timeout after ${computed} pairs (${MAX_COMPUTATION_MS}ms)`);
                            this.cancelled = true;
                            break;
                        }
                        await new Promise<void>(r => window.setTimeout(r, 0));
                    }
                }
            }

            try { stmt.free(); } catch { /* statement may already be freed if DB closed */ }
            if (this.knowledgeDB.isOpen()) {
                this.knowledgeDB.markDirty();
                await this.knowledgeDB.save();
            }

            if (!this.cancelled) {
                console.debug(
                    `[ImplicitConnections] Computed ${computed} pairs, stored ${stored} above threshold ${threshold}`,
                );
            }

            return { computed, stored };
        } catch (e) {
            // DB can close during async computation (plugin reload/unload) — expected, not an error
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('Statement closed') || msg.includes('database is closed')) {
                console.debug('[ImplicitConnections] DB closed during computation, aborting gracefully');
            } else {
                console.warn('[ImplicitConnections] Computation failed:', e);
            }
            return { computed: 0, stored: 0 };
        } finally {
            this.running = false;
        }
    }

    // -----------------------------------------------------------------------
    // Incremental computation
    // -----------------------------------------------------------------------

    /**
     * Recompute implicit connections for a single file.
     * Removes old pairs for this path and computes against all other notes.
     */
    recomputeForPath(path: string, threshold = 0.7): void {
        if (!this.knowledgeDB.isOpen()) return;

        try {
            const db = this.getDB();

            // Remove old pairs for this path
            db.run('DELETE FROM implicit_edges WHERE source_path = ? OR target_path = ?', [path, path]);

            // Compute note-level vectors
            const noteVecs = this.vectorStore.getNoteVectors();
            const thisVec = noteVecs.get(path);
            if (!thisVec) return;

            const explicitEdges = this.buildExplicitEdgeSet(db);
            const now = new Date().toISOString();
            const stmt = db.prepare(
                'INSERT OR IGNORE INTO implicit_edges (source_path, target_path, similarity, computed_at) VALUES (?, ?, ?, ?)',
            );

            for (const [otherPath, otherVec] of noteVecs) {
                if (otherPath === path) continue;
                const sim = cosineSimilarity(thisVec, otherVec);
                if (sim < threshold) continue;

                const key = path < otherPath ? `${path}|${otherPath}` : `${otherPath}|${path}`;
                if (explicitEdges.has(key)) continue;

                const [a, b] = path < otherPath ? [path, otherPath] : [otherPath, path];
                stmt.run([a, b, sim, now]);
            }

            stmt.free();
            this.knowledgeDB.markDirty();
        } catch (e) {
            console.warn(`[ImplicitConnections] recomputeForPath failed for ${path}:`, e);
        }
    }

    // -----------------------------------------------------------------------
    // Lookup
    // -----------------------------------------------------------------------

    /** Get implicit neighbors for a note, sorted by similarity (descending). */
    getImplicitNeighbors(path: string, limit = 5): ImplicitNeighbor[] {
        const db = this.getDB();
        const result = db.exec(
            `SELECT target_path AS path, similarity FROM implicit_edges WHERE source_path = ?
             UNION
             SELECT source_path AS path, similarity FROM implicit_edges WHERE target_path = ?
             ORDER BY similarity DESC LIMIT ?`,
            [path, path, limit],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            path: row[0] as string,
            similarity: row[1] as number,
        }));
    }

    /** Total number of implicit edges stored. */
    getCount(): number {
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(*) FROM implicit_edges');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    // -----------------------------------------------------------------------
    // Suggestion UI (FEATURE-1506)
    // -----------------------------------------------------------------------

    /**
     * Get top implicit connection suggestions that haven't been dismissed.
     * Returns pairs sorted by similarity, excluding dismissed ones.
     */
    getSuggestions(limit = 3): Array<{ pathA: string; pathB: string; similarity: number }> {
        const db = this.getDB();
        const result = db.exec(
            `SELECT ie.source_path, ie.target_path, ie.similarity
             FROM implicit_edges ie
             LEFT JOIN dismissed_pairs dp
               ON ((ie.source_path = dp.path_a AND ie.target_path = dp.path_b)
                OR (ie.source_path = dp.path_b AND ie.target_path = dp.path_a))
             WHERE dp.path_a IS NULL
             ORDER BY ie.similarity DESC
             LIMIT ?`,
            [limit],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            pathA: row[0] as string,
            pathB: row[1] as string,
            similarity: row[2] as number,
        }));
    }

    /** Dismiss a pair permanently (won't be suggested again). */
    dismissPair(pathA: string, pathB: string): void {
        const db = this.getDB();
        const [a, b] = pathA < pathB ? [pathA, pathB] : [pathB, pathA];
        db.run(
            'INSERT OR IGNORE INTO dismissed_pairs (path_a, path_b, dismissed_at) VALUES (?, ?, ?)',
            [a, b, new Date().toISOString()],
        );
        this.knowledgeDB.markDirty();
    }

    /** Number of dismissed pairs. */
    getDismissedCount(): number {
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(*) FROM dismissed_pairs');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /** Build a Set of "pathA|pathB" for all explicit edges (sorted key for dedup). */
    private buildExplicitEdgeSet(db: SqlJsDatabase): Set<string> {
        const result = db.exec('SELECT source_path, target_path FROM edges');
        const set = new Set<string>();
        if (result.length > 0) {
            for (const row of result[0].values) {
                const a = row[0] as string;
                const b = row[1] as string;
                set.add(a < b ? `${a}|${b}` : `${b}|${a}`);
            }
        }
        return set;
    }

    private getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }
}

// ---------------------------------------------------------------------------
// Cosine similarity (same as VectorStore — duplicated to avoid circular deps)
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
