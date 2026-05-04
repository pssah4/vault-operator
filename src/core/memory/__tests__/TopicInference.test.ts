import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { TopicInference } from '../TopicInference';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

const SCHEMA = `
CREATE TABLE known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    description TEXT,
    centroid_embedding BLOB,
    centroid_computed_at TEXT
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return { getDB: () => rawDb, markDirty: () => { /* */ } } as unknown as MemoryDB;
}

function seedCentroid(rawDb: SqlJsDatabase, topic: string, vector: Float32Array): void {
    const blob = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
    rawDb.run(
        `INSERT INTO known_topics (topic, first_seen_at, last_seen_at, centroid_embedding, centroid_computed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [topic, '2026-04-28', '2026-04-28', blob, '2026-04-28'],
    );
}

describe('TopicInference (PLAN-006 task 1)', () => {
    let rawDb: SqlJsDatabase;
    let inf: TopicInference;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        inf = new TopicInference(makeFakeMemoryDB(rawDb));
    });

    it('returns null when no centroids exist', () => {
        const q = Float32Array.from([1, 0, 0]);
        expect(inf.inferTopic(q)).toBeNull();
    });

    it('returns null for empty query embedding', () => {
        seedCentroid(rawDb, 'tools', Float32Array.from([1, 0, 0]));
        expect(inf.inferTopic(new Float32Array())).toBeNull();
    });

    it('picks the closest centroid by cosine', () => {
        seedCentroid(rawDb, 'tools', Float32Array.from([1, 0, 0]));
        seedCentroid(rawDb, 'cooking', Float32Array.from([0, 1, 0]));
        seedCentroid(rawDb, 'travel', Float32Array.from([0, 0, 1]));
        const result = inf.inferTopic(Float32Array.from([0.9, 0.1, 0]));
        expect(result?.topic).toBe('tools');
        expect(result?.score).toBeGreaterThan(0.9);
    });

    it('respects the minScore threshold', () => {
        seedCentroid(rawDb, 'tools', Float32Array.from([1, 0, 0]));
        // query is orthogonal -> cosine = 0
        const result = inf.inferTopic(Float32Array.from([0, 1, 0]), { minScore: 0.6 });
        expect(result).toBeNull();
    });

    it('inferTopK returns sorted matches up to topK', () => {
        // Centroid 'b' = (0.7, 0.7, 0) actually beats 'a' = (1, 0, 0) for the
        // query (1, 0.5, 0) -- the diagonal direction of b matches the query
        // angle better than the pure-x of a. cos(b, q)=0.949, cos(a, q)=0.894.
        seedCentroid(rawDb, 'a', Float32Array.from([1, 0, 0]));
        seedCentroid(rawDb, 'b', Float32Array.from([0.7, 0.7, 0]));
        seedCentroid(rawDb, 'c', Float32Array.from([0, 1, 0]));
        const top2 = inf.inferTopK(Float32Array.from([1, 0.5, 0]), { topK: 2, minScore: 0 });
        expect(top2.map(t => t.topic)).toEqual(['b', 'a']);
        expect(top2[0].score).toBeGreaterThan(top2[1].score);
    });

    it('skips centroids with mismatched dimensionality (defensive)', () => {
        seedCentroid(rawDb, 'short', Float32Array.from([1, 0]));
        seedCentroid(rawDb, 'matched', Float32Array.from([1, 0, 0]));
        const result = inf.inferTopic(Float32Array.from([1, 0, 0]), { minScore: 0 });
        expect(result?.topic).toBe('matched');
    });

    it('topics without centroid_embedding are ignored', () => {
        rawDb.run(
            `INSERT INTO known_topics (topic, first_seen_at, last_seen_at) VALUES (?, ?, ?)`,
            ['no-centroid', '2026-04-28', '2026-04-28'],
        );
        seedCentroid(rawDb, 'with-centroid', Float32Array.from([1, 0, 0]));
        const result = inf.inferTopic(Float32Array.from([1, 0, 0]), { minScore: 0 });
        expect(result?.topic).toBe('with-centroid');
    });

    describe('refreshCentroidFor', () => {
        it('averages a single fact correctly (centroid == fact)', () => {
            rawDb.run(
                `INSERT INTO known_topics (topic, first_seen_at, last_seen_at) VALUES (?, ?, ?)`,
                ['cooking', '2026-04-28', '2026-04-28'],
            );
            inf.refreshCentroidFor('cooking', () => [Float32Array.from([0.5, 0.5, 0])]);
            const result = inf.inferTopic(Float32Array.from([0.5, 0.5, 0]), { minScore: 0.99 });
            expect(result?.topic).toBe('cooking');
        });

        it('averages multiple facts and stores the result', () => {
            rawDb.run(
                `INSERT INTO known_topics (topic, first_seen_at, last_seen_at) VALUES (?, ?, ?)`,
                ['mixed', '2026-04-28', '2026-04-28'],
            );
            inf.refreshCentroidFor('mixed', () => [
                Float32Array.from([1, 0, 0]),
                Float32Array.from([0, 1, 0]),
            ]);
            // Centroid should be (0.5, 0.5, 0)
            const persisted = rawDb.exec(`SELECT centroid_embedding FROM known_topics WHERE topic='mixed'`);
            const blob = persisted[0].values[0][0] as Uint8Array;
            const restored = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
            expect(restored[0]).toBeCloseTo(0.5, 5);
            expect(restored[1]).toBeCloseTo(0.5, 5);
        });

        it('does nothing when the topic has zero embeddings', () => {
            rawDb.run(
                `INSERT INTO known_topics (topic, first_seen_at, last_seen_at) VALUES (?, ?, ?)`,
                ['empty', '2026-04-28', '2026-04-28'],
            );
            inf.refreshCentroidFor('empty', () => []);
            const result = rawDb.exec(`SELECT centroid_embedding FROM known_topics WHERE topic='empty'`);
            expect(result[0].values[0][0]).toBeNull();
        });

        it('drops the inference cache so the next call sees the new centroid', () => {
            // Pre-warm cache via inferTopic
            seedCentroid(rawDb, 'a', Float32Array.from([1, 0, 0]));
            inf.inferTopic(Float32Array.from([1, 0, 0]), { minScore: 0 });
            // Refresh with a different centroid
            inf.refreshCentroidFor('a', () => [Float32Array.from([0, 1, 0])]);
            const result = inf.inferTopic(Float32Array.from([0, 1, 0]), { minScore: 0.99 });
            expect(result?.topic).toBe('a');
        });
    });

    it('invalidateCache forces reload on next call', () => {
        seedCentroid(rawDb, 'a', Float32Array.from([1, 0, 0]));
        // cold call seeds the cache
        inf.inferTopic(Float32Array.from([1, 0, 0]), { minScore: 0 });
        // mutate the DB directly behind the cache's back
        rawDb.run(`DELETE FROM known_topics WHERE topic='a'`);
        // without invalidation the cache still returns the stale centroid
        expect(inf.inferTopic(Float32Array.from([1, 0, 0]), { minScore: 0 })?.topic).toBe('a');
        inf.invalidateCache();
        expect(inf.inferTopic(Float32Array.from([1, 0, 0]), { minScore: 0 })).toBeNull();
    });
});
