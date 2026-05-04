import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { FactIntegrator } from '../FactIntegrator';
import { FactStore } from '../FactStore';
import { EdgeStore } from '../EdgeStore';
import { EmbeddingService, type EmbeddingProvider } from '../EmbeddingService';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { FactCandidate } from '../SingleCallExtractor';

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
CREATE TABLE fact_embeddings (
    fact_id INTEGER PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT NOT NULL
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
           (to_fact_id IS NULL AND to_external_ref IS NOT NULL))
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
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        markDirty: () => undefined,
    } as unknown as MemoryDB;
}

/**
 * Deterministic 4-dim embedding provider used for cosine math in
 * tests. Maps single-word keys onto fixed unit vectors so we can
 * craft "very similar" / "barely similar" pairs without flake.
 */
class StubEmbeddingProvider implements EmbeddingProvider {
    readonly info = { model: 'stub-4d', provider: 'mock', dimensions: 4 };
    private map = new Map<string, Float32Array>();

    set(key: string, vec: number[]): void {
        const f = new Float32Array(vec);
        this.map.set(key, f);
    }

    embed(texts: string[]): Promise<Float32Array[]> {
        return Promise.resolve(texts.map(t => {
            for (const [key, vec] of this.map) {
                if (t.includes(key)) return vec;
            }
            return new Float32Array([1, 0, 0, 0]);
        }));
    }
}

function newCandidate(over: Partial<FactCandidate>): FactCandidate {
    return {
        text: 'baseline',
        topics: ['tools'],
        importance: 0.6,
        kind: 'fact',
        relation: 'new',
        ...over,
    };
}

function seedFactWithEmbedding(
    factStore: FactStore,
    rawDb: SqlJsDatabase,
    text: string,
    topics: string[],
    vec: number[],
): number {
    const fact = factStore.insert({ text, topics, importance: 0.5, kind: 'fact' });
    const f = new Float32Array(vec);
    const bytes = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
    rawDb.run(
        `INSERT INTO fact_embeddings (fact_id, embedding, embedding_model, created_at)
         VALUES (?, ?, 'stub-4d', '2026-04-27')`,
        [fact.id, bytes],
    );
    return fact.id;
}

describe('FactIntegrator (PLAN-007 task B.2)', () => {
    let rawDb: SqlJsDatabase;
    let memoryDB: MemoryDB;
    let factStore: FactStore;
    let edgeStore: EdgeStore;
    let provider: StubEmbeddingProvider;
    let embeddings: EmbeddingService;
    let integrator: FactIntegrator;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memoryDB = makeFakeMemoryDB(rawDb);
        factStore = new FactStore(memoryDB);
        edgeStore = new EdgeStore(memoryDB);
        provider = new StubEmbeddingProvider();
        embeddings = new EmbeddingService(provider);
        integrator = new FactIntegrator(factStore, edgeStore, memoryDB, embeddings);
    });

    describe('relation: new', () => {
        it('inserts each new candidate and writes embeddings', async () => {
            provider.set('Sebastian', [1, 0, 0, 0]);
            provider.set('Plugin', [0, 1, 0, 0]);
            const result = await integrator.integrate({
                facts: [
                    newCandidate({ text: 'Sebastian uses Obsidian', topics: ['tools'] }),
                    newCandidate({ text: 'Plugin uses TypeScript', topics: ['lang'] }),
                ],
                mentions: [],
            });
            expect(result.stats.inserted).toBe(2);
            expect(result.stats.superseded).toBe(0);
            expect(result.integrated).toHaveLength(2);
            const embRows = rawDb.exec('SELECT fact_id FROM fact_embeddings ORDER BY fact_id');
            expect(embRows[0].values).toHaveLength(2);
        });

        it('returns empty stats when no facts to integrate', async () => {
            const result = await integrator.integrate({ facts: [], mentions: [] });
            expect(result.stats).toMatchObject({ inserted: 0, superseded: 0 });
            expect(result.integrated).toEqual([]);
        });

        it('passes session/thread/profile metadata through to FactStore', async () => {
            provider.set('Sebastian', [1, 0, 0, 0]);
            await integrator.integrate({
                facts: [newCandidate({ text: 'Sebastian uses Obsidian', topics: ['tools'] })],
                mentions: [],
                sessionId: 'sess-42',
                threadId: 'thr-7',
                profileId: 'work',
                sourceInterface: 'ucm',
            });
            const rows = rawDb.exec('SELECT source_session_id, source_thread_id, profile_id, source_interface FROM facts');
            expect(rows[0].values[0]).toEqual(['sess-42', 'thr-7', 'work', 'ucm']);
        });
    });

    describe('relation: update', () => {
        it('supersedes when cosine over topic[0] candidates >= 0.9', async () => {
            // Existing fact embedding aligned with the candidate's stub vector.
            seedFactWithEmbedding(factStore, rawDb, 'Sebastian uses Java 8', ['tools'], [1, 0, 0, 0]);
            provider.set('Java 11', [1, 0, 0, 0]); // identical -> cosine 1.0

            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'Sebastian uses Java 11',
                    topics: ['tools'],
                    relation: 'update',
                })],
                mentions: [],
            });
            expect(result.stats.superseded).toBe(1);
            expect(result.stats.inserted).toBe(0);
            expect(result.integrated[0].supersededId).toBeGreaterThan(0);

            const latestRows = rawDb.exec('SELECT text FROM facts WHERE is_latest = 1');
            expect(latestRows[0].values[0][0]).toBe('Sebastian uses Java 11');
        });

        it('falls back to insert when cosine is below threshold', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'Sebastian uses Java 8', ['tools'], [1, 0, 0, 0]);
            // Orthogonal candidate vector -> cosine 0
            provider.set('cooking', [0, 1, 0, 0]);

            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'Sebastian likes cooking',
                    topics: ['tools'],
                    relation: 'update',
                })],
                mentions: [],
            });
            expect(result.stats.superseded).toBe(0);
            expect(result.stats.inserted).toBe(1);
            expect(result.stats.updateFallbacks).toBe(1);
        });

        it('falls back when no facts share topic[0]', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'Existing', ['tools'], [1, 0, 0, 0]);
            provider.set('Sebastian', [1, 0, 0, 0]);
            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'Sebastian likes coffee',
                    topics: ['preferences'], // different topic
                    relation: 'update',
                })],
                mentions: [],
            });
            expect(result.stats.superseded).toBe(0);
            expect(result.stats.inserted).toBe(1);
            expect(result.stats.updateFallbacks).toBe(1);
        });

        it('inserts as new when embeddings service is missing', async () => {
            integrator = new FactIntegrator(factStore, edgeStore, memoryDB, null);
            seedFactWithEmbedding(factStore, rawDb, 'Existing', ['tools'], [1, 0, 0, 0]);
            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'Sebastian uses Java 11', topics: ['tools'], relation: 'update',
                })],
                mentions: [],
            });
            expect(result.stats.inserted).toBe(1);
            expect(result.stats.updateFallbacks).toBe(1);
        });
    });

    describe('relation: extend', () => {
        it('inserts and adds a refines edge to the most similar existing fact', async () => {
            const targetId = seedFactWithEmbedding(factStore, rawDb, 'Java is typed', ['tools'], [1, 0, 0, 0]);
            seedFactWithEmbedding(factStore, rawDb, 'Python is duck-typed', ['tools'], [0, 1, 0, 0]);
            provider.set('Java 11', [0.9, 0.1, 0, 0]);

            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'Java 11 introduces var-keyword',
                    topics: ['tools'],
                    relation: 'extend',
                })],
                mentions: [],
            });
            expect(result.stats.refines).toBe(1);
            expect(result.stats.inserted).toBe(1);
            const newId = result.integrated[0].fact.id;
            const edges = edgeStore.getEdgesFrom(newId);
            expect(edges).toHaveLength(1);
            expect(edges[0].edgeType).toBe('refines');
            expect(edges[0].toFactId).toBe(targetId);
        });

        it('skips edge when no candidate exists in the same topic', async () => {
            provider.set('isolated', [1, 0, 0, 0]);
            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'isolated fact',
                    topics: ['lonely'],
                    relation: 'extend',
                })],
                mentions: [],
            });
            expect(result.stats.refines).toBe(0);
            expect(result.stats.edgeFallbacks).toBe(1);
            expect(result.stats.inserted).toBe(1);
        });

        it('skips edge when embeddings service is missing', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'existing', ['tools'], [1, 0, 0, 0]);
            integrator = new FactIntegrator(factStore, edgeStore, memoryDB, null);
            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'extension fact', topics: ['tools'], relation: 'extend',
                })],
                mentions: [],
            });
            expect(result.stats.refines).toBe(0);
            expect(result.stats.edgeFallbacks).toBe(1);
            expect(result.stats.inserted).toBe(1);
        });
    });

    describe('relation: derive', () => {
        it('inserts and adds a derived_from edge', async () => {
            const targetId = seedFactWithEmbedding(factStore, rawDb, 'Source claim', ['tools'], [1, 0, 0, 0]);
            provider.set('Derived', [0.95, 0.05, 0, 0]);
            const result = await integrator.integrate({
                facts: [newCandidate({
                    text: 'Derived conclusion',
                    topics: ['tools'],
                    relation: 'derive',
                })],
                mentions: [],
            });
            expect(result.stats.derives).toBe(1);
            expect(result.stats.inserted).toBe(1);
            const edges = edgeStore.getEdgesFrom(result.integrated[0].fact.id);
            expect(edges[0].edgeType).toBe('derived_from');
            expect(edges[0].toFactId).toBe(targetId);
        });
    });

    describe('dedup pre-check on relation=new', () => {
        it('treats a near-identical new fact as a confirmation when cosine >= 0.95', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'User dislikes emojis', ['preferences'], [1, 0, 0, 0]);
            provider.set('User prefers no emojis', [1, 0, 0, 0]);
            const result = await integrator.integrate({
                facts: [newCandidate({ text: 'User prefers no emojis', topics: ['preferences'], relation: 'new' })],
                mentions: [],
            });
            expect(result.stats.dedupedAsConfirm).toBe(1);
            expect(result.stats.inserted).toBe(0);
            const rows = rawDb.exec('SELECT confirmation_count FROM facts WHERE is_latest = 1');
            expect(rows[0].values[0][0]).toBe(2);
        });

        it('promotes a similar-but-not-identical new fact to update when cosine in [0.85, 0.95)', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'old phrasing', ['preferences'], [1, 0, 0, 0]);
            provider.set('refined wording', [0.93, 0.37, 0, 0]); // cosine ~0.93
            const result = await integrator.integrate({
                facts: [newCandidate({ text: 'refined wording', topics: ['preferences'], relation: 'new' })],
                mentions: [],
            });
            expect(result.stats.dedupedAsUpdate).toBe(1);
            expect(result.stats.inserted).toBe(0);
            const latest = rawDb.exec('SELECT text FROM facts WHERE is_latest = 1');
            expect(latest[0].values[0][0]).toBe('refined wording');
        });

        it('inserts as new when no existing fact passes the 0.85 threshold', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'unrelated', ['preferences'], [0, 1, 0, 0]);
            provider.set('completely different', [1, 0, 0, 0]); // cosine 0 with seed
            const result = await integrator.integrate({
                facts: [newCandidate({ text: 'completely different', topics: ['preferences'], relation: 'new' })],
                mentions: [],
            });
            expect(result.stats.inserted).toBe(1);
            expect(result.stats.dedupedAsConfirm).toBe(0);
            expect(result.stats.dedupedAsUpdate).toBe(0);
        });
    });

    describe('error handling', () => {
        it('captures FactStore errors per candidate without aborting the run', async () => {
            // Use orthogonal embeddings so the dedup pre-check doesn't
            // collapse the two valid candidates into a confirm/update.
            provider.set('valid one', [1, 0, 0, 0]);
            provider.set('valid two', [0, 1, 0, 0]);
            provider.set('bad one', [0, 0, 1, 0]);
            const result = await integrator.integrate({
                // FactStore validates topics; bad candidate has non-string topic.
                facts: [
                    newCandidate({ text: 'valid one', topics: ['tools'] }),
                    newCandidate({ text: 'bad one', topics: [42 as unknown as string] }),
                    newCandidate({ text: 'valid two', topics: ['tools'] }),
                ],
                mentions: [],
            });
            expect(result.stats.inserted).toBe(2);
            expect(result.stats.errors).toHaveLength(1);
            expect(result.stats.errors[0].text).toBe('bad one');
        });

        it('keeps integrating when embedding service throws', async () => {
            const flakyProvider: EmbeddingProvider = {
                info: { model: 'flaky', provider: 'mock' },
                embed: () => Promise.reject(new Error('rate limit')),
            };
            integrator = new FactIntegrator(
                factStore,
                edgeStore,
                memoryDB,
                new EmbeddingService(flakyProvider),
            );
            const result = await integrator.integrate({
                facts: [newCandidate({ text: 'a', topics: ['x'] })],
                mentions: [],
            });
            expect(result.stats.inserted).toBe(1);
            const embRows = rawDb.exec('SELECT 1 FROM fact_embeddings');
            expect(embRows.length === 0 || embRows[0].values.length === 0).toBe(true);
        });
    });

    describe('mixed relations in one run', () => {
        it('handles a heterogeneous batch with correct stat tallies', async () => {
            seedFactWithEmbedding(factStore, rawDb, 'Old Java fact', ['tools'], [1, 0, 0, 0]);
            seedFactWithEmbedding(factStore, rawDb, 'Source for derivation', ['tools'], [0.5, 0.5, 0, 0]);
            provider.set('NEW', [0, 1, 0, 0]);
            provider.set('UPDATE', [1, 0, 0, 0]);
            provider.set('EXTEND', [0.95, 0.05, 0, 0]);
            provider.set('DERIVE', [0.45, 0.55, 0, 0]);

            const result = await integrator.integrate({
                facts: [
                    newCandidate({ text: 'NEW thing', topics: ['lang'], relation: 'new' }),
                    newCandidate({ text: 'UPDATE Java info', topics: ['tools'], relation: 'update' }),
                    newCandidate({ text: 'EXTEND Java info', topics: ['tools'], relation: 'extend' }),
                    newCandidate({ text: 'DERIVE Java conclusion', topics: ['tools'], relation: 'derive' }),
                ],
                mentions: [],
            });
            expect(result.stats.inserted).toBe(3); // new + extend + derive
            expect(result.stats.superseded).toBe(1); // update found target
            expect(result.stats.refines).toBe(1);
            expect(result.stats.derives).toBe(1);
        });
    });
});
