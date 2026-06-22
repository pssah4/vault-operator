import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

// We test VectorStore logic directly against sql.js, bypassing KnowledgeDB's
// file I/O layer. This gives us fast, isolated tests for CRUD + cosine search.

// ---------------------------------------------------------------------------
// Minimal KnowledgeDB shim (in-memory only, no disk I/O)
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
CREATE TABLE IF NOT EXISTS checkpoint (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function createInMemoryDB() {
    if (!SQL) SQL = await initSqlJs();
    const db = new SQL.Database();
    for (const stmt of SCHEMA_DDL.split(';').map(s => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }
    db.run('INSERT INTO schema_meta VALUES (2)');
    // Minimal KnowledgeDB shim
    const shim = {
        getDB: () => db,
        isOpen: () => true,
        markDirty: () => {},
    };
    return { db, shim };
}

// Import VectorStore — it only depends on KnowledgeDB.getDB()
// We use dynamic import so the test-stub alias resolves 'obsidian' correctly.
async function createVectorStore() {
    const { VectorStore } = await import('../VectorStore');
    const { db, shim } = await createInMemoryDB();
    const store = new VectorStore(shim as never);
    return { store, db };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a simple Float32Array vector of given dimension. */
function vec(dimension: number, fill = 1.0): Float32Array {
    return new Float32Array(dimension).fill(fill);
}

/** Create a normalized vector pointing in a specific direction. */
function normalizedVec(dimension: number, seed: number): Float32Array {
    const v = new Float32Array(dimension);
    for (let i = 0; i < dimension; i++) {
        v[i] = Math.sin(seed * (i + 1));
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < dimension; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < dimension; i++) v[i] /= norm;
    return v;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VectorStore', () => {
    describe('insertChunks + basic queries', () => {
        it('should insert and retrieve chunks', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('note.md', ['Hello world', 'Second chunk'], [vec(4), vec(4, 2)], 1000);

            expect(store.getFileCount()).toBe(1);
            expect(store.getVectorCount()).toBe(2);
            expect(store.hasFile('note.md')).toBe(true);
            expect(store.hasFile('other.md')).toBe(false);
        });

        it('should replace chunks on re-insert for same path', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('note.md', ['v1'], [vec(4)], 1000);
            expect(store.getVectorCount()).toBe(1);

            store.insertChunks('note.md', ['v2a', 'v2b'], [vec(4), vec(4, 2)], 2000);
            expect(store.getVectorCount()).toBe(2);
            expect(store.getChunkTextsByPath('note.md')).toEqual(['v2a', 'v2b']);
        });

        it('should delete by path', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A'], [vec(4)], 1000);
            store.insertChunks('b.md', ['B'], [vec(4)], 1000);
            expect(store.getFileCount()).toBe(2);

            store.deleteByPath('a.md');
            expect(store.getFileCount()).toBe(1);
            expect(store.hasFile('a.md')).toBe(false);
            expect(store.hasFile('b.md')).toBe(true);
        });

        it('should delete all', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A'], [vec(4)], 1000);
            store.insertChunks('b.md', ['B'], [vec(4)], 1000);
            store.deleteAll();
            expect(store.getFileCount()).toBe(0);
            expect(store.getVectorCount()).toBe(0);
        });

        it('should return path mtimes', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A1', 'A2'], [vec(4), vec(4)], 1000);
            store.insertChunks('b.md', ['B1'], [vec(4)], 2000);

            const mtimes = store.getPathMtimes();
            expect(mtimes.get('a.md')).toBe(1000);
            expect(mtimes.get('b.md')).toBe(2000);
        });
    });

    describe('cosine similarity search', () => {
        it('should return results sorted by similarity', async () => {
            const { store } = await createVectorStore();
            const dim = 8;
            // Insert 3 files with distinct vector directions
            const v1 = normalizedVec(dim, 1);
            const v2 = normalizedVec(dim, 2);
            const v3 = normalizedVec(dim, 3);

            store.insertChunks('close.md', ['close'], [v1], 1000);
            store.insertChunks('medium.md', ['medium'], [v2], 1000);
            store.insertChunks('far.md', ['far'], [v3], 1000);

            // Query with v1 — closest should be close.md
            const results = store.search(v1, 3);
            expect(results.length).toBe(3);
            expect(results[0].path).toBe('close.md');
            expect(results[0].score).toBeCloseTo(1.0, 3); // self-similarity
        });

        it('should respect topK limit', async () => {
            const { store } = await createVectorStore();
            const dim = 4;
            store.insertChunks('a.md', ['A'], [normalizedVec(dim, 1)], 1000);
            store.insertChunks('b.md', ['B'], [normalizedVec(dim, 2)], 1000);
            store.insertChunks('c.md', ['C'], [normalizedVec(dim, 3)], 1000);

            const results = store.search(normalizedVec(dim, 1), 2);
            expect(results.length).toBe(2);
        });

        it('should exclude session: and episode: from default search', async () => {
            const { store } = await createVectorStore();
            const dim = 4;
            const v = normalizedVec(dim, 1);
            store.insertChunks('note.md', ['Note'], [v], 1000);
            store.insertChunks('session:abc', ['Session'], [v], 1000);
            store.insertChunks('episode:def', ['Episode'], [v], 1000);

            const results = store.search(v, 10);
            expect(results.length).toBe(1);
            expect(results[0].path).toBe('note.md');
        });

        it('should filter by pathPrefix', async () => {
            const { store } = await createVectorStore();
            const dim = 4;
            const v = normalizedVec(dim, 1);
            store.insertChunks('note.md', ['Note'], [v], 1000);
            store.insertChunks('session:abc', ['Session'], [v], 1000);

            const results = store.search(v, 10, 'session:');
            expect(results.length).toBe(1);
            expect(results[0].path).toBe('session:abc');
        });
    });

    describe('searchUniqueFiles', () => {
        it('should return best chunk per file', async () => {
            const { store } = await createVectorStore();
            const dim = 4;
            const query = normalizedVec(dim, 1);
            const close = normalizedVec(dim, 1.1);
            const far = normalizedVec(dim, 5);

            // Same file, two chunks with different similarity
            store.insertChunks('note.md', ['close', 'far'], [close, far], 1000);
            store.insertChunks('other.md', ['other'], [normalizedVec(dim, 2)], 1000);

            const results = store.searchUniqueFiles(query, 5);
            const notePaths = results.map(r => r.path);
            // Should have both files but only one result per file
            expect(new Set(notePaths).size).toBe(notePaths.length);
        });
    });

    describe('enrichment methods', () => {
        it('should insert with enriched=0 by default', async () => {
            const { store, db } = await createVectorStore();
            store.insertChunks('note.md', ['chunk'], [vec(4)], 1000);

            const rows = db.exec('SELECT enriched FROM vectors');
            expect(rows[0].values[0][0]).toBe(0);
        });

        it('should insert with enriched=1 when specified', async () => {
            const { store, db } = await createVectorStore();
            store.insertChunks('note.md', ['chunk'], [vec(4)], 1000, 1);

            const rows = db.exec('SELECT enriched FROM vectors');
            expect(rows[0].values[0][0]).toBe(1);
        });

        it('should count unenriched chunks (excluding session/episode)', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A'], [vec(4)], 1000, 0);
            store.insertChunks('b.md', ['B'], [vec(4)], 1000, 1);
            store.insertChunks('session:x', ['S'], [vec(4)], 1000, 0);

            expect(store.getUnenrichedCount()).toBe(1); // only a.md
        });

        it('should count total vault chunks (excluding session/episode)', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A1', 'A2'], [vec(4), vec(4)], 1000);
            store.insertChunks('session:x', ['S'], [vec(4)], 1000);

            expect(store.getTotalVaultChunkCount()).toBe(2); // only a.md chunks
        });

        it('should fetch unenriched chunks in batches', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A'], [vec(4)], 1000, 0);
            store.insertChunks('b.md', ['B'], [vec(4)], 1000, 1);
            store.insertChunks('c.md', ['C'], [vec(4)], 1000, 0);
            store.insertChunks('session:x', ['S'], [vec(4)], 1000, 0);

            const batch = store.getUnenrichedChunks(10);
            expect(batch.length).toBe(2); // a.md + c.md (not session:x)
            expect(batch.every(c => c.text.length > 0)).toBe(true);
        });

        it('should update chunk to enriched', async () => {
            const { store, db } = await createVectorStore();
            store.insertChunks('note.md', ['original'], [vec(4)], 1000, 0);

            const chunks = store.getUnenrichedChunks(10);
            expect(chunks.length).toBe(1);

            const newVec = vec(4, 2);
            store.updateChunkEnriched(chunks[0].id, 'prefix\n\noriginal', newVec);

            // Verify update
            const rows = db.exec('SELECT text, enriched FROM vectors WHERE id = ?', [chunks[0].id]);
            expect(rows[0].values[0][0]).toBe('prefix\n\noriginal');
            expect(rows[0].values[0][1]).toBe(1);

            // No more unenriched
            expect(store.getUnenrichedCount()).toBe(0);
        });

        it('should reset enrichment status', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A'], [vec(4)], 1000, 1);
            store.insertChunks('b.md', ['B'], [vec(4)], 1000, 1);
            store.insertChunks('session:x', ['S'], [vec(4)], 1000, 1);

            store.resetEnrichmentStatus();

            // Vault chunks reset, session untouched
            expect(store.getUnenrichedCount()).toBe(2);
            const batch = store.getUnenrichedChunks(10);
            expect(batch.map(c => c.path).sort()).toEqual(['a.md', 'b.md']);
        });
    });

    describe('searchWithContext (adjacent chunks + multi-per-file)', () => {
        it('should return multiple chunks per file', async () => {
            const { store } = await createVectorStore();
            const dim = 4;
            const v = normalizedVec(dim, 1);
            // 5 chunks in same file, all similar to query
            const chunks = ['c0', 'c1', 'c2', 'c3', 'c4'];
            const vectors = chunks.map(() => normalizedVec(dim, 1.05 + Math.random() * 0.1));

            store.insertChunks('note.md', chunks, vectors, 1000);

            const results = store.searchWithContext(v, 10, 0, 0.3, 3);
            // maxPerFile=3, so at most 3 results from note.md
            expect(results.length).toBeLessThanOrEqual(3);
            expect(results.every(r => r.path === 'note.md')).toBe(true);
        });

        it('should include adjacent text when window > 0', async () => {
            const { store } = await createVectorStore();
            const dim = 4;
            const query = normalizedVec(dim, 1);
            // 5 chunks: make chunk 2 the clear best match by using query vector
            const far = normalizedVec(dim, 50);
            store.insertChunks('note.md',
                ['c0', 'before', 'match', 'after', 'c4'],
                [far, query, query, query, far],
                1000,
            );

            // adjacentWindow=1, threshold=0 (include all adjacents), maxPerFile=1
            const results = store.searchWithContext(query, 1, 1, 0.0, 1);
            expect(results.length).toBe(1);
            // Best chunk is one of [1,2,3] (all identical to query).
            // With window=1 and threshold=0, adjacent chunks are included.
            // The result text should contain at least 2 chunks (match + adjacent).
            const text = results[0].text;
            const chunkCount = text.split('\n\n').length;
            expect(chunkCount).toBeGreaterThanOrEqual(2);
        });

        it('should gate adjacent chunks by similarity threshold', async () => {
            const { store } = await createVectorStore();
            const dim = 8;
            const query = normalizedVec(dim, 1);
            const similar = normalizedVec(dim, 1.01); // very close to query
            const different = normalizedVec(dim, 50);  // very different from query

            store.insertChunks('note.md', ['irrelevant', 'match', 'also-irrelevant'], [different, similar, different], 1000);

            // adjacentWindow=1, threshold=0.9 (high — should exclude distant adjacents)
            const results = store.searchWithContext(query, 1, 1, 0.9, 1);
            expect(results.length).toBe(1);
            // Only the match chunk should be included (adjacents are too dissimilar)
            expect(results[0].text).not.toContain('irrelevant');
            expect(results[0].text).toContain('match');
        });
    });

    describe('domain-aware writers and readers (FEAT-03-27 / ADR-136)', () => {
        it('insertNoteVector writes rows with domain = "note"', async () => {
            const { store, db } = await createVectorStore();
            store.insertNoteVector('Notes/Foo.md', ['hello'], [vec(4)], 1000);

            const rows = db.exec("SELECT path, domain FROM vectors WHERE path = 'Notes/Foo.md'");
            expect(rows[0].values[0][0]).toBe('Notes/Foo.md');
            expect(rows[0].values[0][1]).toBe('note');
        });

        it('insertSessionVector writes rows with domain = "session" and session:-prefixed path', async () => {
            const { store, db } = await createVectorStore();
            store.insertSessionVector('abc-123', ['session chunk'], [vec(4)], 1000);

            const rows = db.exec('SELECT path, domain FROM vectors');
            expect(rows[0].values[0][0]).toBe('session:abc-123');
            expect(rows[0].values[0][1]).toBe('session');
        });

        it('findNoteVectors({chunkIndex: 0}) ignores session and episode entries', async () => {
            const { store } = await createVectorStore();
            store.insertNoteVector('Notes/A.md', ['note-a-c0', 'note-a-c1'], [vec(4), vec(4)], 1000);
            store.insertNoteVector('Notes/B.md', ['note-b-c0'], [vec(4)], 1000);
            store.insertSessionVector('sess-1', ['session-c0'], [vec(4)], 1000);
            store.insertEpisodeVector('ep-1', ['episode-c0'], [vec(4)], 1000);

            const found = store.findNoteVectors({ chunkIndex: 0 });
            const paths = found.map(e => e.path).sort();
            expect(paths).toEqual(['Notes/A.md', 'Notes/B.md']);
        });

        it('findSessionVectors() ignores note and episode entries', async () => {
            const { store } = await createVectorStore();
            store.insertNoteVector('Notes/A.md', ['a'], [vec(4)], 1000);
            store.insertSessionVector('sess-1', ['s1'], [vec(4)], 1000);
            store.insertSessionVector('sess-2', ['s2'], [vec(4)], 1000);
            store.insertEpisodeVector('ep-1', ['e1'], [vec(4)], 1000);

            const found = store.findSessionVectors();
            const paths = found.map(e => e.path).sort();
            expect(paths).toEqual(['session:sess-1', 'session:sess-2']);
        });

        it('findVectors({}) without domain filter returns entries across all layers', async () => {
            const { store } = await createVectorStore();
            store.insertNoteVector('Notes/A.md', ['a'], [vec(4)], 1000);
            store.insertSessionVector('sess-1', ['s'], [vec(4)], 1000);
            store.insertEpisodeVector('ep-1', ['e'], [vec(4)], 1000);
            store.insertFactVector('fact-1', ['f'], [vec(4)], 1000);

            const all = store.findVectors({});
            const paths = all.map(e => e.path).sort();
            expect(paths).toEqual(['Notes/A.md', 'episode:ep-1', 'fact:fact-1', 'session:sess-1']);
        });

        it('intersects domain + chunkIndex + pathLike + excludePathPrefixes correctly', async () => {
            const { store } = await createVectorStore();
            // Seed: Notes/A.md (zwei Chunks), Notes/B.md (ein Chunk),
            // Inbox/C.md (ein Chunk, soll uber excludePathPrefixes rausfallen),
            // session:s1 (eigener Domain, soll uber domain='note' rausfallen).
            store.insertNoteVector('Notes/A.md', ['a0', 'a1'], [vec(4), vec(4)], 1000);
            store.insertNoteVector('Notes/B.md', ['b0'], [vec(4)], 1000);
            store.insertNoteVector('Inbox/C.md', ['c0'], [vec(4)], 1000);
            store.insertSessionVector('s1', ['s0'], [vec(4)], 1000);

            const found = store.findVectors({
                domain: 'note',
                chunkIndex: 0,
                pathLike: 'Notes/%',
                excludePathPrefixes: ['Inbox/'],
            });

            const paths = found.map(e => e.path).sort();
            expect(paths).toEqual(['Notes/A.md', 'Notes/B.md']);
            expect(found.every(e => e.chunkIndex === 0)).toBe(true);
        });

        it('intersects excludePathContains as a substring filter', async () => {
            const { store } = await createVectorStore();
            // Notes/Template-Note.md und Notes/Templates/Daily.md sollen rausfallen
            // (beide enthalten "Template" im Pfad). Notes/Real.md bleibt.
            store.insertNoteVector('Notes/Template-Note.md', ['t0'], [vec(4)], 1000);
            store.insertNoteVector('Notes/Real.md', ['r0'], [vec(4)], 1000);
            store.insertNoteVector('Notes/Templates/Daily.md', ['d0'], [vec(4)], 1000);

            const found = store.findVectors({
                domain: 'note',
                excludePathContains: ['Template'],
            });

            const paths = found.map(e => e.path).sort();
            expect(paths).toEqual(['Notes/Real.md']);
        });

        it('getStubCandidatePaths excludes session: and episode: paths via domain filter', async () => {
            const { store } = await createVectorStore();
            // Stub-Note (one chunk, short text)
            store.insertNoteVector('Notes/Stub.md', ['x'], [vec(4)], 1000);
            // Real note (two chunks -- not a stub by definition)
            store.insertNoteVector('Notes/Real.md', ['aa', 'bb'], [vec(4), vec(4)], 1000);
            // Session and episode with single short chunk (would be stubs by old text-only rule)
            store.insertSessionVector('sess-1', ['s'], [vec(4)], 1000);
            store.insertEpisodeVector('ep-1', ['e'], [vec(4)], 1000);

            const stubs = store.getStubCandidatePaths(40);
            expect(stubs.sort()).toEqual(['Notes/Stub.md']);
        });
    });

    describe('Cross-layer findVectors (Reranker compatibility)', () => {
        it('returns vectors across all seven domains when no domain filter is set', async () => {
            const { store } = await createVectorStore();
            // Je ein Vektor pro Domäne über die typisierten Insert-Helfer.
            store.insertNoteVector('Notes/A.md', ['note chunk'], [vec(4, 1)], 1000);
            store.insertSessionVector('sess-1', ['session chunk'], [vec(4, 2)], 1000);
            store.insertEpisodeVector('ep-1', ['episode chunk'], [vec(4, 3)], 1000);
            store.insertFactVector('fact-1', ['fact chunk'], [vec(4, 4)], 1000);
            store.insertMentionVector('men-1', ['mention chunk'], [vec(4, 5)], 1000);
            store.insertThreadVector('thr-1', ['thread chunk'], [vec(4, 6)], 1000);
            store.insertEntityVector('ent-1', ['entity chunk'], [vec(4, 7)], 1000);

            const all = store.findVectors({});
            expect(all.length).toBe(7);

            // Alle sieben Domänen-Präfixe müssen im Ergebnis vertreten sein.
            const paths = all.map(e => e.path).sort();
            const hasPrefix = (prefix: string) => paths.some(p => p.startsWith(prefix));
            expect(hasPrefix('Notes/')).toBe(true);
            expect(hasPrefix('session:')).toBe(true);
            expect(hasPrefix('episode:')).toBe(true);
            expect(hasPrefix('fact:')).toBe(true);
            expect(hasPrefix('mention:')).toBe(true);
            expect(hasPrefix('thread:')).toBe(true);
            expect(hasPrefix('entity:')).toBe(true);
        });

        it('still filters when an explicit domain is passed', async () => {
            const { store } = await createVectorStore();
            // Gleicher Seed wie oben, damit das Filter-Verhalten gegen ein
            // mehrlagiges Korpus geprüft wird.
            store.insertNoteVector('Notes/A.md', ['note chunk'], [vec(4, 1)], 1000);
            store.insertSessionVector('sess-1', ['session chunk'], [vec(4, 2)], 1000);
            store.insertEpisodeVector('ep-1', ['episode chunk'], [vec(4, 3)], 1000);
            store.insertFactVector('fact-1', ['fact chunk'], [vec(4, 4)], 1000);
            store.insertMentionVector('men-1', ['mention chunk'], [vec(4, 5)], 1000);
            store.insertThreadVector('thr-1', ['thread chunk'], [vec(4, 6)], 1000);
            store.insertEntityVector('ent-1', ['entity chunk'], [vec(4, 7)], 1000);

            const sessionOnly = store.findVectors({ domain: 'session' });
            expect(sessionOnly.length).toBe(1);
            expect(sessionOnly[0].path).toBe('session:sess-1');
            expect(sessionOnly[0].path.startsWith('session:')).toBe(true);
        });

        it('combines domain + chunkIndex + pathLike filters', async () => {
            const { store } = await createVectorStore();
            // Zwei Notizen mit je zwei Chunks und eine Session als Negativ-Probe.
            store.insertNoteVector('Notes/A.md', ['a0', 'a1'], [vec(4, 1), vec(4, 2)], 1000);
            store.insertNoteVector('Notes/B.md', ['b0', 'b1'], [vec(4, 3), vec(4, 4)], 1000);
            store.insertNoteVector('Other/C.md', ['c0', 'c1'], [vec(4, 5), vec(4, 6)], 1000);
            store.insertSessionVector('sess-1', ['s0'], [vec(4, 7)], 1000);

            const found = store.findVectors({
                domain: 'note',
                chunkIndex: 0,
                pathLike: 'Notes/%',
            });

            // Erwartet: Notes/A.md (chunk 0) und Notes/B.md (chunk 0).
            // Other/C.md fällt durch pathLike raus, Session durch domain,
            // Chunk 1 jeweils durch chunkIndex.
            const paths = found.map(e => e.path).sort();
            expect(paths).toEqual(['Notes/A.md', 'Notes/B.md']);
            expect(found.every(e => e.chunkIndex === 0)).toBe(true);
        });
    });

    describe('text-only queries', () => {
        it('should return all chunks for getAllChunks', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('a.md', ['A1', 'A2'], [vec(4), vec(4)], 1000);
            store.insertChunks('b.md', ['B1'], [vec(4)], 1000);

            const all = store.getAllChunks();
            expect(all.length).toBe(3);
        });

        it('should return chunks sorted by index for getChunkTextsByPath', async () => {
            const { store } = await createVectorStore();
            store.insertChunks('note.md', ['first', 'second', 'third'], [vec(4), vec(4), vec(4)], 1000);

            const texts = store.getChunkTextsByPath('note.md');
            expect(texts).toEqual(['first', 'second', 'third']);
        });
    });
});
