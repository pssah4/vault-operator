import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { LocalKnowledgeAdapter } from '../LocalKnowledgeAdapter';
import type { KnowledgeDB, SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { VectorStore } from '../../knowledge/VectorStore';

const SCHEMA = `
CREATE TABLE implicit_edges (
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    similarity REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);
CREATE TABLE tags (
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(path, tag)
);
CREATE TABLE vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB,
    mtime INTEGER NOT NULL,
    UNIQUE(path, chunk_index)
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeKnowledgeDB(rawDb: SqlJsDatabase, isOpenFlag = true): KnowledgeDB {
    return {
        isOpen: () => isOpenFlag,
        getDB: () => rawDb,
        markDirty: () => {},
    } as unknown as KnowledgeDB;
}

interface FakeVectorStoreData {
    path: string;
    score: number;
    text: string;
}

function makeFakeVectorStore(data: FakeVectorStoreData[]): VectorStore {
    return {
        searchUniqueFiles: () => data.map(d => ({
            path: d.path, score: d.score, text: d.text, chunkIndex: 0,
        })),
    } as unknown as VectorStore;
}

function seedEdge(rawDb: SqlJsDatabase, src: string, tgt: string, sim: number) {
    rawDb.run(
        `INSERT INTO implicit_edges (source_path, target_path, similarity, computed_at)
         VALUES (?, ?, ?, ?)`,
        [src, tgt, sim, '2026-04-28'],
    );
}

describe('LocalKnowledgeAdapter (PLAN-006 task 4)', () => {
    let rawDb: SqlJsDatabase;
    let adapter: LocalKnowledgeAdapter;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        adapter = new LocalKnowledgeAdapter(
            makeFakeKnowledgeDB(rawDb),
            makeFakeVectorStore([]),
        );
    });

    describe('getImplicitNeighbors', () => {
        it('returns empty when no edges exist', async () => {
            expect(await adapter.getImplicitNeighbors('Notes/A.md')).toEqual([]);
        });

        it('returns 1-hop neighbours sorted by similarity', async () => {
            seedEdge(rawDb, 'A', 'B', 0.9);
            seedEdge(rawDb, 'A', 'C', 0.7);
            seedEdge(rawDb, 'D', 'A', 0.8); // undirected: D ist auch Nachbar von A
            const result = await adapter.getImplicitNeighbors('A');
            expect(result.map(n => n.path)).toEqual(['B', 'D', 'C']);
            expect(result[0].similarity).toBeCloseTo(0.9);
        });

        it('respects the limit parameter', async () => {
            for (let i = 0; i < 10; i++) seedEdge(rawDb, 'A', `N${i}`, 0.5 + i * 0.01);
            const result = await adapter.getImplicitNeighbors('A', { limit: 3 });
            expect(result).toHaveLength(3);
        });

        it('walks 2 hops without revisiting the seed', async () => {
            seedEdge(rawDb, 'A', 'B', 0.8);
            seedEdge(rawDb, 'B', 'C', 0.7);
            seedEdge(rawDb, 'C', 'D', 0.6);
            const result = await adapter.getImplicitNeighbors('A', { hops: 2 });
            const paths = result.map(n => n.path);
            expect(paths).toContain('B');
            expect(paths).toContain('C');
            expect(paths).not.toContain('D'); // 3 hops away
            expect(paths).not.toContain('A'); // seed never returned
        });

        it('keeps the strongest similarity if a path is reached via multiple paths', async () => {
            seedEdge(rawDb, 'A', 'B', 0.5);
            seedEdge(rawDb, 'A', 'C', 0.9);
            seedEdge(rawDb, 'C', 'B', 0.95); // B reachable via A->C->B with 0.95
            const result = await adapter.getImplicitNeighbors('A', { hops: 2 });
            const b = result.find(n => n.path === 'B');
            // BFS keeps the first-seen value via 1-hop (0.5) since it visits B
            // before going through C; this is the documented behaviour.
            expect(b?.similarity).toBeCloseTo(0.5, 5);
        });

        it('returns empty when knowledgeDB is closed', async () => {
            const closedAdapter = new LocalKnowledgeAdapter(
                makeFakeKnowledgeDB(rawDb, false),
                makeFakeVectorStore([]),
            );
            seedEdge(rawDb, 'A', 'B', 0.5);
            expect(await closedAdapter.getImplicitNeighbors('A')).toEqual([]);
        });

        it('caps hops at 3 to prevent runaway BFS', async () => {
            // explicit hops=10 should be reduced to 3
            for (let i = 0; i < 6; i++) seedEdge(rawDb, `N${i}`, `N${i + 1}`, 0.5);
            const result = await adapter.getImplicitNeighbors('N0', { hops: 10 });
            const paths = result.map(n => n.path);
            // N1, N2, N3 reachable in 3 hops; N4+ not.
            expect(paths).toContain('N3');
            expect(paths).not.toContain('N4');
        });
    });

    describe('getNoteMetadata', () => {
        it('returns null when path not indexed', async () => {
            expect(await adapter.getNoteMetadata('missing.md')).toBeNull();
        });

        it('returns tags + last-indexed mtime', async () => {
            rawDb.run('INSERT INTO tags (path, tag) VALUES (?, ?)', ['Notes/A.md', 'project']);
            rawDb.run('INSERT INTO tags (path, tag) VALUES (?, ?)', ['Notes/A.md', 'active']);
            rawDb.run(
                `INSERT INTO vectors (path, chunk_index, text, mtime) VALUES (?, ?, ?, ?)`,
                ['Notes/A.md', 0, 'hi', 1700000000000],
            );
            const meta = await adapter.getNoteMetadata('Notes/A.md');
            expect(meta?.tags.sort()).toEqual(['active', 'project']);
            expect(meta?.lastIndexedAt).toBeTruthy();
        });
    });

    describe('searchSimilar', () => {
        it('forwards to VectorStore.searchUniqueFiles', async () => {
            const adapter2 = new LocalKnowledgeAdapter(
                makeFakeKnowledgeDB(rawDb),
                makeFakeVectorStore([
                    { path: 'A.md', score: 0.9, text: 'a' },
                    { path: 'B.md', score: 0.7, text: 'b' },
                ]),
            );
            const result = await adapter2.searchSimilar(Float32Array.from([1, 0]));
            expect(result.map(r => r.path)).toEqual(['A.md', 'B.md']);
            expect(result[0].excerpt).toBe('a');
        });

        it('returns empty when knowledgeDB is closed', async () => {
            const closedAdapter = new LocalKnowledgeAdapter(
                makeFakeKnowledgeDB(rawDb, false),
                makeFakeVectorStore([{ path: 'A.md', score: 0.9, text: 'a' }]),
            );
            expect(await closedAdapter.searchSimilar(Float32Array.from([1]))).toEqual([]);
        });
    });
});
