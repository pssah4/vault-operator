/**
 * LocalKnowledgeAdapter -- Setup-A/B implementation of KnowledgeGraphAdapter.
 *
 * Direct SQL against `knowledge.db` plus JS-Layer-BFS for multi-hop walks.
 * Spike-1 measured 0.3 ms p95 for 2-hop walks on Sebastian's vault, well
 * below the 500 ms target from FEATURE-0317. See SPIKE-001 for the
 * verdict that ATTACH DATABASE is not production-ready.
 *
 * Constructor-Injection over KnowledgeDB + VectorStore. No obsidian
 * import, ADR-080 compliant.
 *
 * FEATURE-0317 / PLAN-006 task 4.
 */

import type { KnowledgeDB } from '../knowledge/KnowledgeDB';
import type { VectorStore } from '../knowledge/VectorStore';
import type {
    KnowledgeGraphAdapter,
    ImplicitNeighbor,
    NoteMetadata,
    SimilarSearchHit,
} from './KnowledgeGraphAdapter';

export class LocalKnowledgeAdapter implements KnowledgeGraphAdapter {
    constructor(
        private readonly knowledgeDB: KnowledgeDB,
        private readonly vectorStore: VectorStore,
    ) {}

    // eslint-disable-next-line @typescript-eslint/require-await -- KnowledgeAdapter interface contract: async signature shared with McpKnowledgeAdapter (HTTP) and CloudKnowledgeAdapter (network)
    async getImplicitNeighbors(
        notePath: string,
        opts: { hops?: number; limit?: number } = {},
    ): Promise<ImplicitNeighbor[]> {
        const hops = Math.max(1, Math.min(opts.hops ?? 1, 3));
        const limit = opts.limit ?? 20;
        if (!this.knowledgeDB.isOpen()) return [];

        const visited = new Set<string>([notePath]);
        let frontier: string[] = [notePath];
        const neighbours = new Map<string, number>();

        for (let hop = 0; hop < hops; hop++) {
            if (frontier.length === 0) break;
            const next = this.queryOneHop(frontier);
            const nextFrontier: string[] = [];
            for (const n of next) {
                if (visited.has(n.path)) continue;
                visited.add(n.path);
                const existing = neighbours.get(n.path);
                // Keep the highest similarity ever seen across the BFS.
                if (existing === undefined || n.similarity > existing) {
                    neighbours.set(n.path, n.similarity);
                }
                nextFrontier.push(n.path);
            }
            frontier = nextFrontier;
        }

        return [...neighbours.entries()]
            .map(([path, similarity]) => ({ path, similarity }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- KnowledgeAdapter interface contract (see getImplicitNeighbors)
    async getNoteMetadata(notePath: string): Promise<NoteMetadata | null> {
        if (!this.knowledgeDB.isOpen()) return null;
        const db = this.knowledgeDB.getDB();
        const tagsResult = db.exec(
            'SELECT tag FROM tags WHERE path = ? ORDER BY tag',
            [notePath],
        );
        /* eslint-disable no-restricted-syntax -- reason: ADR-137 exception, mtime lookup pre-dates VectorStore, refactor tracked separately */
        const mtimeResult = db.exec(
            'SELECT MAX(mtime) FROM vectors WHERE path = ?',
            [notePath],
        );
        /* eslint-enable no-restricted-syntax -- end of legacy ADR-136 vectors direct-access block */
        const tags = tagsResult.length > 0
            ? tagsResult[0].values.map(r => r[0] as string)
            : [];
        const mtimeRaw = mtimeResult[0]?.values?.[0]?.[0] as number | null;
        const lastIndexedAt = typeof mtimeRaw === 'number' && mtimeRaw > 0
            ? new Date(mtimeRaw).toISOString()
            : undefined;

        // Empty tags + no mtime usually means the path isn't in the
        // index at all. Surface that as null so the caller can react
        // (stale-edge detection in UnifiedGraphService).
        if (tags.length === 0 && !lastIndexedAt) return null;
        return { path: notePath, tags, lastIndexedAt };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- KnowledgeAdapter interface contract (see getImplicitNeighbors)
    async searchSimilar(
        queryVector: Float32Array,
        opts: { topK?: number } = {},
    ): Promise<SimilarSearchHit[]> {
        const topK = opts.topK ?? 10;
        if (!this.knowledgeDB.isOpen()) return [];
        const results = this.vectorStore.searchUniqueFiles(queryVector, topK);
        return results.map(r => ({
            path: r.path,
            score: r.score,
            excerpt: r.text,
        }));
    }

    private queryOneHop(seeds: readonly string[]): ImplicitNeighbor[] {
        if (seeds.length === 0) return [];
        const db = this.knowledgeDB.getDB();
        const placeholders = seeds.map(() => '?').join(', ');
        // implicit_edges is undirected -- the seed can be either source
        // or target. UNION ALL is fine here; the caller dedups by path.
        const result = db.exec(
            `SELECT target_path AS path, similarity
               FROM implicit_edges
              WHERE source_path IN (${placeholders})
            UNION ALL
             SELECT source_path AS path, similarity
               FROM implicit_edges
              WHERE target_path IN (${placeholders})`,
            [...seeds, ...seeds],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            path: row[0] as string,
            similarity: row[1] as number,
        }));
    }
}
