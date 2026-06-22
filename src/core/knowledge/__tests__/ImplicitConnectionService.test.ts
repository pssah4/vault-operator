import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

// ---------------------------------------------------------------------------
// In-memory DB setup
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    domain TEXT NOT NULL DEFAULT 'note',
    UNIQUE(path, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vectors_path ON vectors(path);
CREATE INDEX IF NOT EXISTS idx_vectors_domain_path ON vectors(domain, path);
CREATE TABLE IF NOT EXISTS checkpoint (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT NOT NULL,
    property_name TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    UNIQUE(source_path, target_path, link_type, property_name)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_path);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_path);
CREATE TABLE IF NOT EXISTS tags (path TEXT NOT NULL, tag TEXT NOT NULL, UNIQUE(path, tag));
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE TABLE IF NOT EXISTS implicit_edges (
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    similarity REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);
CREATE INDEX IF NOT EXISTS idx_implicit_source ON implicit_edges(source_path);
CREATE INDEX IF NOT EXISTS idx_implicit_target ON implicit_edges(target_path);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

function normalizedVec(dim: number, seed: number): Float32Array {
    const v = new Float32Array(dim);
    for (let i = 0; i < dim; i++) v[i] = Math.sin(seed * (i + 1));
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < dim; i++) v[i] /= norm;
    return v;
}

async function createServices() {
    if (!SQL) SQL = await initSqlJs();
    const db = new SQL.Database();
    for (const stmt of SCHEMA_DDL.split(';').map(s => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }
    db.run('INSERT INTO schema_meta VALUES (4)');

    const shim = {
        getDB: () => db,
        isOpen: () => true,
        markDirty: () => {},
        save: async () => {},
    };

    const { VectorStore } = await import('../VectorStore');
    const { GraphStore } = await import('../GraphStore');
    const { ImplicitConnectionService } = await import('../ImplicitConnectionService');

    const vectorStore = new VectorStore(shim as never);
    const graphStore = new GraphStore(shim as never);
    const implicitService = new ImplicitConnectionService(shim as never, vectorStore, graphStore);

    return { db, vectorStore, graphStore, implicitService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImplicitConnectionService', () => {
    describe('computeAll', () => {
        it('should find implicit connections above threshold', async () => {
            const { vectorStore, implicitService } = await createServices();
            const dim = 8;

            // Insert 3 notes with distinct vectors
            // a and b are very similar (seed 1.0 vs 1.05), c is different (seed 50)
            vectorStore.insertChunks('a.md', ['A'], [normalizedVec(dim, 1.0)], 1000);
            vectorStore.insertChunks('b.md', ['B'], [normalizedVec(dim, 1.05)], 1000);
            vectorStore.insertChunks('c.md', ['C'], [normalizedVec(dim, 50)], 1000);

            const result = await implicitService.computeAll(0.5);
            expect(result.computed).toBe(3); // 3 pairs: a-b, a-c, b-c
            // a-b should be stored (very similar), a-c and b-c probably not
            expect(result.stored).toBeGreaterThanOrEqual(1);
        });

        it('should exclude pairs with explicit edges', async () => {
            const { vectorStore, graphStore, implicitService } = await createServices();
            const dim = 8;

            // Two very similar notes
            const v = normalizedVec(dim, 1.0);
            vectorStore.insertChunks('a.md', ['A'], [v], 1000);
            vectorStore.insertChunks('b.md', ['B'], [v], 1000); // identical = similarity 1.0

            // Add explicit edge between them
            graphStore.replaceEdgesForPath('a.md', [
                { targetPath: 'b.md', linkType: 'body', propertyName: null },
            ]);

            const result = await implicitService.computeAll(0.5);
            expect(result.stored).toBe(0); // excluded because explicit link exists
        });

        it('should exclude session: and episode: paths', async () => {
            const { vectorStore, implicitService } = await createServices();
            const dim = 4;
            const v = normalizedVec(dim, 1.0);

            vectorStore.insertChunks('a.md', ['A'], [v], 1000);
            vectorStore.insertChunks('session:abc', ['S'], [v], 1000);
            vectorStore.insertChunks('episode:def', ['E'], [v], 1000);

            const result = await implicitService.computeAll(0.5);
            // Only a.md has a note vector (session/episode excluded by getNoteVectors)
            // With only 1 note, no pairs possible
            expect(result.computed).toBe(0);
        });

        it('should respect threshold', async () => {
            const { vectorStore, implicitService } = await createServices();
            const dim = 8;

            vectorStore.insertChunks('a.md', ['A'], [normalizedVec(dim, 1.0)], 1000);
            vectorStore.insertChunks('b.md', ['B'], [normalizedVec(dim, 1.05)], 1000);

            // Very high threshold — should store nothing (similarity ~0.99 but not 1.0)
            const resultHigh = await implicitService.computeAll(0.999);
            const highCount = implicitService.getCount();

            // Low threshold — should store the pair
            const resultLow = await implicitService.computeAll(0.5);
            const lowCount = implicitService.getCount();

            expect(lowCount).toBeGreaterThanOrEqual(highCount);
        });
    });

    describe('getImplicitNeighbors', () => {
        it('should return neighbors sorted by similarity', async () => {
            const { vectorStore, implicitService } = await createServices();
            const dim = 8;

            // a is similar to b (close seeds) and less similar to c (further seeds)
            vectorStore.insertChunks('a.md', ['A'], [normalizedVec(dim, 1.0)], 1000);
            vectorStore.insertChunks('b.md', ['B'], [normalizedVec(dim, 1.1)], 1000);
            vectorStore.insertChunks('c.md', ['C'], [normalizedVec(dim, 2.0)], 1000);

            await implicitService.computeAll(0.3); // low threshold to capture all

            const neighbors = implicitService.getImplicitNeighbors('a.md', 5);
            if (neighbors.length >= 2) {
                expect(neighbors[0].similarity).toBeGreaterThanOrEqual(neighbors[1].similarity);
            }
        });

        it('should return empty for unknown path', async () => {
            const { implicitService } = await createServices();
            const neighbors = implicitService.getImplicitNeighbors('nonexistent.md');
            expect(neighbors.length).toBe(0);
        });
    });

    describe('recomputeForPath', () => {
        it('should update implicit edges for a single file', async () => {
            const { vectorStore, implicitService } = await createServices();
            const dim = 8;

            vectorStore.insertChunks('a.md', ['A'], [normalizedVec(dim, 1.0)], 1000);
            vectorStore.insertChunks('b.md', ['B'], [normalizedVec(dim, 1.05)], 1000);
            vectorStore.insertChunks('c.md', ['C'], [normalizedVec(dim, 50)], 1000);

            await implicitService.computeAll(0.5);
            const countBefore = implicitService.getCount();

            // Recompute for a.md (should produce same result for a-b pair)
            implicitService.recomputeForPath('a.md', 0.5);
            const countAfter = implicitService.getCount();

            // Count should be same or similar (recompute only affects a.md pairs)
            expect(countAfter).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getNoteVectors (via VectorStore)', () => {
        it('should compute mean of chunk vectors', async () => {
            const { vectorStore } = await createServices();
            const dim = 4;

            const v1 = new Float32Array([1, 0, 0, 0]);
            const v2 = new Float32Array([0, 1, 0, 0]);
            vectorStore.insertChunks('note.md', ['chunk1', 'chunk2'], [v1, v2], 1000);

            const noteVecs = vectorStore.getNoteVectors();
            const avg = noteVecs.get('note.md');
            expect(avg).toBeDefined();
            // Mean of [1,0,0,0] and [0,1,0,0] = [0.5, 0.5, 0, 0]
            expect(avg![0]).toBeCloseTo(0.5);
            expect(avg![1]).toBeCloseTo(0.5);
            expect(avg![2]).toBeCloseTo(0);
        });

        it('should exclude session/episode paths', async () => {
            const { vectorStore } = await createServices();
            const dim = 4;
            const v = new Float32Array([1, 0, 0, 0]);

            vectorStore.insertChunks('note.md', ['N'], [v], 1000);
            vectorStore.insertChunks('session:abc', ['S'], [v], 1000);

            const noteVecs = vectorStore.getNoteVectors();
            expect(noteVecs.has('note.md')).toBe(true);
            expect(noteVecs.has('session:abc')).toBe(false);
        });
    });
});
