import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { UnifiedGraphService } from '../UnifiedGraphService';
import { FactStore } from '../FactStore';
import { EdgeStore } from '../EdgeStore';
import { AdapterRegistry } from '../AdapterRegistry';
import type { KnowledgeGraphAdapter } from '../KnowledgeGraphAdapter';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { SourceAdapter, ResolvedSource } from '../SourceAdapter';

const SCHEMA = `
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    topics TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    kind TEXT NOT NULL DEFAULT 'fact',
    created_at TEXT NOT NULL,
    last_confirmed_at TEXT NOT NULL,
    confirmation_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    source_session_id TEXT,
    source_thread_id TEXT,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    source_uri TEXT,
    profile_id TEXT NOT NULL DEFAULT 'default',
    superseded_by INTEGER REFERENCES facts(id),
    is_latest INTEGER NOT NULL DEFAULT 1,
    deprecated_at TEXT,
    deprecation_reason TEXT,
    metadata TEXT,
    CHECK (importance >= 0.0 AND importance <= 1.0),
    CHECK (kind IN ('fact', 'preference', 'identity', 'event')),
    CHECK (is_latest IN (0, 1))
);
CREATE TABLE memory_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    operation TEXT NOT NULL,
    fact_id INTEGER,
    related_fact_id INTEGER,
    session_id TEXT,
    rationale TEXT,
    metadata TEXT
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
    return { getDB: () => rawDb, markDirty: () => {} } as unknown as MemoryDB;
}

class StubAdapter implements SourceAdapter {
    constructor(
        public readonly scheme: string,
        private readonly resolveMap: Record<string, ResolvedSource | null> = {},
    ) {}
    canHandle(_uri: string): boolean { return true; }
    async resolve(uri: string): Promise<ResolvedSource | null> {
        return this.resolveMap[uri] ?? null;
    }
}

const MOCK_KNOWLEDGE: KnowledgeGraphAdapter = {
    async getImplicitNeighbors() { return []; },
    async getNoteMetadata() { return null; },
    async searchSimilar() { return []; },
};

describe('UnifiedGraphService (PLAN-006 tasks 5 + 7)', () => {
    let rawDb: SqlJsDatabase;
    let factStore: FactStore;
    let edgeStore: EdgeStore;
    let registry: AdapterRegistry;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        const memDB = makeFakeMemoryDB(rawDb);
        factStore = new FactStore(memDB);
        edgeStore = new EdgeStore(memDB);
        registry = new AdapterRegistry();
    });

    function svc(custom?: { resolveMap?: Record<string, ResolvedSource | null> }) {
        if (custom?.resolveMap) {
            registry.register(new StubAdapter('vault', custom.resolveMap));
        }
        return new UnifiedGraphService(factStore, edgeStore, MOCK_KNOWLEDGE, registry);
    }

    it('returns empty when seed fact does not exist', async () => {
        const out = await svc().walkFromFact(99999);
        expect(out).toEqual([]);
    });

    it('returns 1-hop fact neighbours', async () => {
        const a = factStore.insert({ text: 'A', topics: ['x'], importance: 0.5 });
        const b = factStore.insert({ text: 'B', topics: ['y'], importance: 0.6 });
        edgeStore.addFactEdge(a.id, b.id, 'related', { weight: 1.0 });

        const out = await svc().walkFromFact(a.id);
        expect(out).toHaveLength(1);
        expect(out[0].uri).toBe(`fact:${b.id}`);
        expect(out[0].topics).toEqual(['y']);
    });

    it('walks 2 hops and dedups the seed', async () => {
        const a = factStore.insert({ text: 'A', topics: [], importance: 0.5 });
        const b = factStore.insert({ text: 'B', topics: [], importance: 0.5 });
        const c = factStore.insert({ text: 'C', topics: [], importance: 0.5 });
        edgeStore.addFactEdge(a.id, b.id, 'related');
        edgeStore.addFactEdge(b.id, c.id, 'related');

        const out = await svc().walkFromFact(a.id, { hops: 2 });
        const uris = out.map(h => h.uri);
        expect(uris).toContain(`fact:${b.id}`);
        expect(uris).toContain(`fact:${c.id}`);
        expect(uris).not.toContain(`fact:${a.id}`);
    });

    it('marks unresolved external edges as stale and includes them', async () => {
        const a = factStore.insert({ text: 'A', topics: [], importance: 0.5 });
        const edge = edgeStore.addExternalEdge(a.id, 'vault://Missing.md', 'mentions');
        // No adapter registered: resolution returns null
        const out = await svc().walkFromFact(a.id);
        expect(out).toHaveLength(1);
        expect(out[0].uri).toBe('vault://Missing.md');
        expect(out[0].stale).toBe(true);

        // metadata.stale should be persisted by markStale
        const result = rawDb.exec('SELECT metadata FROM fact_edges WHERE id = ?', [edge.id]);
        const meta = JSON.parse(result[0].values[0][0] as string);
        expect(meta.stale).toBe(true);
        expect(meta.staleReason).toBe('unresolved');
    });

    it('does NOT mark stale when detectStaleEdges=false (dry-walk mode)', async () => {
        const a = factStore.insert({ text: 'A', topics: [], importance: 0.5 });
        const edge = edgeStore.addExternalEdge(a.id, 'vault://Missing.md', 'mentions');
        await svc().walkFromFact(a.id, { detectStaleEdges: false });
        const result = rawDb.exec('SELECT metadata FROM fact_edges WHERE id = ?', [edge.id]);
        // metadata stays NULL because we never wrote to it
        expect(result[0].values[0][0]).toBeNull();
    });

    it('successful resolution does NOT mark stale', async () => {
        const a = factStore.insert({ text: 'A', topics: [], importance: 0.5 });
        const edge = edgeStore.addExternalEdge(a.id, 'vault://Notes/X.md', 'mentions');
        const out = await svc({
            resolveMap: { 'vault://Notes/X.md': { uri: 'vault://Notes/X.md', scheme: 'vault', content: 'hello' } },
        }).walkFromFact(a.id);
        expect(out[0].stale).toBeUndefined();
        expect(out[0].text).toBe('hello');
        const meta = rawDb.exec('SELECT metadata FROM fact_edges WHERE id = ?', [edge.id]);
        expect(meta[0].values[0][0]).toBeNull();
    });

    it('respects the type allow-list', async () => {
        const a = factStore.insert({ text: 'A', topics: [], importance: 0.5 });
        const b = factStore.insert({ text: 'B', topics: [], importance: 0.5 });
        const c = factStore.insert({ text: 'C', topics: [], importance: 0.5 });
        edgeStore.addFactEdge(a.id, b.id, 'related');
        edgeStore.addFactEdge(a.id, c.id, 'derived_from');

        const out = await svc().walkFromFact(a.id, { types: ['related'] });
        expect(out.map(h => h.uri)).toEqual([`fact:${b.id}`]);
    });

    it('respects limit', async () => {
        const a = factStore.insert({ text: 'A', topics: [], importance: 0.5 });
        for (let i = 0; i < 10; i++) {
            const n = factStore.insert({ text: `N${i}`, topics: [], importance: 0.5 });
            edgeStore.addFactEdge(a.id, n.id, 'related', { weight: i / 10 });
        }
        const out = await svc().walkFromFact(a.id, { limit: 3 });
        expect(out.length).toBeLessThanOrEqual(3);
    });
});
