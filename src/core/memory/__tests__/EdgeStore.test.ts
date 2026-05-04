import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { EdgeStore } from '../EdgeStore';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

const SCHEMA = `
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    topics TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_confirmed_at TEXT NOT NULL
);
CREATE TABLE fact_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    to_fact_id INTEGER REFERENCES facts(id) ON DELETE CASCADE,
    to_external_ref TEXT,
    edge_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    metadata TEXT,
    CHECK ((to_fact_id IS NOT NULL AND to_external_ref IS NULL) OR
           (to_fact_id IS NULL AND to_external_ref IS NOT NULL)),
    UNIQUE(from_fact_id, to_fact_id, edge_type),
    UNIQUE(from_fact_id, to_external_ref, edge_type)
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        markDirty: () => { /* no-op */ },
    } as unknown as MemoryDB;
}

function seedFact(rawDb: SqlJsDatabase, id: number) {
    rawDb.run(
        'INSERT INTO facts (id, text, topics, created_at, last_confirmed_at) VALUES (?, ?, ?, ?, ?)',
        [id, `fact-${id}`, '[]', '2026-04-27', '2026-04-27'],
    );
}

describe('EdgeStore (PLAN-004 task 3)', () => {
    let rawDb: SqlJsDatabase;
    let store: EdgeStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        seedFact(rawDb, 1);
        seedFact(rawDb, 2);
        seedFact(rawDb, 3);
        store = new EdgeStore(makeFakeMemoryDB(rawDb));
    });

    describe('addFactEdge', () => {
        it('persists a fact-to-fact edge with defaults', () => {
            const e = store.addFactEdge(1, 2, 'co_occurrence');
            expect(e.id).toBeGreaterThan(0);
            expect(e.fromFactId).toBe(1);
            expect(e.toFactId).toBe(2);
            expect(e.toExternalRef).toBeUndefined();
            expect(e.weight).toBe(1.0);
            expect(e.sourceInterface).toBe('obsilo');
        });

        it('respects optional weight + sourceInterface + metadata', () => {
            const e = store.addFactEdge(1, 2, 'refines', {
                weight: 0.85,
                sourceInterface: 'ucm',
                metadata: { similarity: 0.91 },
            });
            expect(e.weight).toBeCloseTo(0.85, 5);
            expect(e.sourceInterface).toBe('ucm');
            expect(e.metadata).toEqual({ similarity: 0.91 });
        });

        it('rejects self-edges', () => {
            expect(() => store.addFactEdge(1, 1, 'co_occurrence')).toThrow(/self-edges/);
        });

        it('rejects non-positive ids', () => {
            expect(() => store.addFactEdge(0, 1, 'x')).toThrow(/positive/);
            expect(() => store.addFactEdge(1, 0, 'x')).toThrow(/positive/);
        });

        it('rejects empty edgeType', () => {
            expect(() => store.addFactEdge(1, 2, '')).toThrow(/non-empty/);
        });

        it('lets the DB UNIQUE constraint reject duplicates', () => {
            store.addFactEdge(1, 2, 'co_occurrence');
            expect(() => store.addFactEdge(1, 2, 'co_occurrence')).toThrow();
        });
    });

    describe('addExternalEdge', () => {
        it('persists a fact-to-URI edge', () => {
            const e = store.addExternalEdge(1, 'vault://Notes/X.md', 'mentions_note');
            expect(e.toFactId).toBeUndefined();
            expect(e.toExternalRef).toBe('vault://Notes/X.md');
        });

        it('rejects empty external ref', () => {
            expect(() => store.addExternalEdge(1, '   ', 'x')).toThrow(/non-empty/);
        });

        it('lets the DB UNIQUE constraint reject duplicates', () => {
            store.addExternalEdge(1, 'entity:UniCredit', 'mentions_entity');
            expect(() => store.addExternalEdge(1, 'entity:UniCredit', 'mentions_entity')).toThrow();
        });

        it('CHECK enforces XOR -- impossible to set both targets via the API', () => {
            // The store API offers no way to set both, but we sanity-check the
            // raw DB still rejects a hand-crafted INSERT to keep the
            // Phase-1 contract explicit for future refactors.
            expect(() =>
                rawDb.run(
                    'INSERT INTO fact_edges (from_fact_id, to_fact_id, to_external_ref, edge_type, created_at) VALUES (?, ?, ?, ?, ?)',
                    [1, 2, 'vault://x.md', 'bad', '2026-04-27'],
                ),
            ).toThrow();
        });
    });

    describe('queries', () => {
        it('getEdgesFrom returns both fact-edges and external-edges from one fact', () => {
            store.addFactEdge(1, 2, 'co_occurrence');
            store.addExternalEdge(1, 'vault://N.md', 'mentions_note');
            const edges = store.getEdgesFrom(1);
            expect(edges).toHaveLength(2);
        });

        it('getEdgesByType filters', () => {
            store.addFactEdge(1, 2, 'co_occurrence');
            store.addFactEdge(1, 3, 'refines');
            const refines = store.getEdgesByType(1, 'refines');
            expect(refines).toHaveLength(1);
            expect(refines[0].toFactId).toBe(3);
        });

        it('getEdgesToFact returns inbound fact-edges', () => {
            store.addFactEdge(1, 2, 'refines');
            store.addFactEdge(3, 2, 'co_occurrence');
            const inbound = store.getEdgesToFact(2);
            expect(inbound.map(e => e.fromFactId).sort()).toEqual([1, 3]);
        });

        it('getEdgesToRef returns all facts pointing at a URI', () => {
            store.addExternalEdge(1, 'vault://N.md', 'mentions_note');
            store.addExternalEdge(2, 'vault://N.md', 'mentions_note');
            const inbound = store.getEdgesToRef('vault://N.md');
            expect(inbound.map(e => e.fromFactId).sort()).toEqual([1, 2]);
        });
    });

    describe('removeEdge', () => {
        it('hard-deletes by id', () => {
            const e = store.addFactEdge(1, 2, 'co_occurrence');
            store.removeEdge(e.id);
            expect(store.getEdgesFrom(1)).toHaveLength(0);
        });
    });

    describe('provisional edges (PLAN-007 task A.2)', () => {
        it('addProvisionalEdge appends _provisional suffix and confidence flag', () => {
            const e = store.addProvisionalEdge(1, 'vault://Notes/X.md', 'mentions_note');
            expect(e.edgeType).toBe('mentions_note_provisional');
            expect(e.metadata).toEqual({ confidence: 'parser' });
        });

        it('addProvisionalEdge does not double-suffix already-suffixed types', () => {
            const e = store.addProvisionalEdge(1, 'vault://X.md', 'mentions_note_provisional');
            expect(e.edgeType).toBe('mentions_note_provisional');
        });

        it('confirmProvisional strips suffix + confidence metadata', () => {
            const e = store.addProvisionalEdge(1, 'vault://X.md', 'mentions_note', {
                metadata: { extra: 'info' },
            });
            store.confirmProvisional(e.id);
            const fetched = store.getEdgesFrom(1)[0];
            expect(fetched.edgeType).toBe('mentions_note');
            expect(fetched.metadata).toEqual({ extra: 'info' });
        });

        it('confirmProvisional is no-op on already-confirmed edges', () => {
            const e = store.addExternalEdge(1, 'vault://X.md', 'mentions_note');
            store.confirmProvisional(e.id);
            const fetched = store.getEdgesFrom(1)[0];
            expect(fetched.edgeType).toBe('mentions_note');
        });

        it('discardProvisional marks the edge stale without deleting it', () => {
            const e = store.addProvisionalEdge(1, 'vault://X.md', 'mentions_note');
            store.discardProvisional(e.id);
            const fetched = store.getEdgesFrom(1)[0];
            expect(fetched.metadata?.stale).toBe(true);
            expect(fetched.metadata?.staleReason).toBe('discarded-by-single-call');
        });
    });
});
