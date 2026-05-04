import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { FactStore } from '../FactStore';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

/**
 * In-memory sql.js setup that mirrors the v2 portions of memory.db
 * relevant to FactStore. Avoids importing Obsidian's Vault.
 */

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
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        markDirty: () => { /* no-op for tests */ },
    } as unknown as MemoryDB;
}

function auditRows(db: SqlJsDatabase): Array<{ operation: string; factId: number | null; relatedFactId: number | null }> {
    const result = db.exec('SELECT operation, fact_id, related_fact_id FROM memory_audit ORDER BY id');
    if (result.length === 0) return [];
    return result[0].values.map(r => ({
        operation: r[0] as string,
        factId: r[1] as number | null,
        relatedFactId: r[2] as number | null,
    }));
}

describe('FactStore (PLAN-004 task 2)', () => {
    let rawDb: SqlJsDatabase;
    let store: FactStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        store = new FactStore(makeFakeMemoryDB(rawDb));
    });

    describe('insert', () => {
        it('persists a fact with defaults applied', () => {
            const f = store.insert({ text: 'Sebastian uses Obsidian', topics: ['tools', 'editor'] });
            expect(f.id).toBeGreaterThan(0);
            expect(f.text).toBe('Sebastian uses Obsidian');
            expect(f.topics).toEqual(['tools', 'editor']);
            expect(f.importance).toBe(0.5);
            expect(f.kind).toBe('fact');
            expect(f.sourceInterface).toBe('obsilo');
            expect(f.isLatest).toBe(true);
            expect(f.confirmationCount).toBe(1);
            expect(f.useCount).toBe(0);
        });

        it('respects all optional fields', () => {
            const f = store.insert({
                text: 'User is Sebastian',
                topics: ['identity'],
                importance: 0.95,
                kind: 'identity',
                sourceSessionId: 'sess-1',
                sourceThreadId: 'thread-1',
                sourceInterface: 'ucm',
                sourceUri: 'vault://Notes/Profile.md',
                metadata: { confidence: 1.0 },
            });
            expect(f.kind).toBe('identity');
            expect(f.importance).toBeCloseTo(0.95, 5);
            expect(f.sourceInterface).toBe('ucm');
            expect(f.sourceUri).toBe('vault://Notes/Profile.md');
            expect(f.metadata).toEqual({ confidence: 1.0 });
        });

        it('writes one insert audit row', () => {
            const f = store.insert({ text: 'x', topics: [] });
            expect(auditRows(rawDb)).toEqual([
                { operation: 'insert', factId: f.id, relatedFactId: null },
            ]);
        });

        it('rejects empty text', () => {
            expect(() => store.insert({ text: '', topics: [] })).toThrow(/non-empty/);
            expect(() => store.insert({ text: '   ', topics: [] })).toThrow(/non-empty/);
        });

        it('rejects non-array topics', () => {
            expect(() => store.insert({ text: 'x', topics: 'oops' as unknown as string[] })).toThrow(/array/);
        });

        it('rejects importance out of [0, 1]', () => {
            expect(() => store.insert({ text: 'x', topics: [], importance: 1.5 })).toThrow(/\[0, 1\]/);
            expect(() => store.insert({ text: 'x', topics: [], importance: -0.1 })).toThrow(/\[0, 1\]/);
        });

        it('rejects kind outside the allowed enum', () => {
            expect(() => store.insert({
                text: 'x', topics: [], kind: 'belief' as unknown as 'fact',
            })).toThrow(/kind must be one of/);
        });
    });

    describe('getById + listLatest', () => {
        it('returns undefined for a missing id', () => {
            expect(store.getById(99999)).toBeUndefined();
        });

        it('lists only latest active facts by default', () => {
            const a = store.insert({ text: 'A', topics: [] });
            store.insert({ text: 'B', topics: [] });
            store.deprecate(a.id, 'old');
            const latest = store.listLatest();
            expect(latest).toHaveLength(1);
            expect(latest[0].text).toBe('B');
        });

        it('orders by importance desc by default', () => {
            store.insert({ text: 'low', topics: [], importance: 0.1 });
            store.insert({ text: 'high', topics: [], importance: 0.9 });
            store.insert({ text: 'mid', topics: [], importance: 0.5 });
            const list = store.listLatest();
            expect(list.map(f => f.text)).toEqual(['high', 'mid', 'low']);
        });

        it('filters by kind', () => {
            store.insert({ text: 'fact-1', topics: [], kind: 'fact' });
            store.insert({ text: 'pref-1', topics: [], kind: 'preference' });
            const prefs = store.listLatest({ kind: 'preference' });
            expect(prefs).toHaveLength(1);
            expect(prefs[0].text).toBe('pref-1');
        });
    });

    describe('confirm', () => {
        it('bumps confirmation_count and writes a confirm audit row', () => {
            const f = store.insert({ text: 'x', topics: [] });
            store.confirm(f.id);
            const updated = store.getById(f.id);
            expect(updated?.confirmationCount).toBe(2);
            const audit = auditRows(rawDb);
            expect(audit.map(r => r.operation)).toEqual(['insert', 'confirm']);
        });
    });

    describe('supersede', () => {
        it('marks old fact is_latest=0 + superseded_by, inserts new latest', () => {
            const oldFact = store.insert({ text: 'old text', topics: ['x'] });
            const { newFact, supersededId } = store.supersede(oldFact.id, {
                text: 'new text',
                topics: ['x'],
            });
            expect(supersededId).toBe(oldFact.id);

            const old = store.getById(oldFact.id);
            expect(old?.isLatest).toBe(false);
            expect(old?.supersededBy).toBe(newFact.id);

            const fresh = store.getById(newFact.id);
            expect(fresh?.isLatest).toBe(true);
        });

        it('writes both insert and supersede audit rows', () => {
            const oldFact = store.insert({ text: 'old', topics: [] });
            const { newFact } = store.supersede(oldFact.id, { text: 'new', topics: [] });
            const ops = auditRows(rawDb);
            // first insert (old), then second insert (new), then supersede
            expect(ops.map(r => r.operation)).toEqual(['insert', 'insert', 'supersede']);
            expect(ops[2]).toEqual({ operation: 'supersede', factId: newFact.id, relatedFactId: oldFact.id });
        });

        it('throws when the old fact does not exist', () => {
            expect(() => store.supersede(99999, { text: 'x', topics: [] })).toThrow(/not found/);
        });
    });

    describe('deprecate', () => {
        it('sets deprecated_at + reason, drops is_latest, writes audit', () => {
            const f = store.insert({ text: 'x', topics: [] });
            store.deprecate(f.id, 'no longer accurate');
            const updated = store.getById(f.id);
            expect(updated?.deprecatedAt).toBeTruthy();
            expect(updated?.deprecationReason).toBe('no longer accurate');
            expect(updated?.isLatest).toBe(false);

            const ops = auditRows(rawDb);
            expect(ops.map(r => r.operation)).toEqual(['insert', 'deprecate']);
        });
    });

    describe('profileId (UCM-readiness)', () => {
        it('defaults to "default" when not specified', () => {
            const f = store.insert({ text: 'x', topics: [] });
            expect(f.profileId).toBe('default');
        });

        it('round-trips a custom profileId', () => {
            const f = store.insert({ text: 'work fact', topics: [], profileId: 'work' });
            expect(f.profileId).toBe('work');
            const loaded = store.getById(f.id);
            expect(loaded?.profileId).toBe('work');
        });

        it('listLatest filters by profileId when supplied', () => {
            store.insert({ text: 'A', topics: [] }); // default
            store.insert({ text: 'B', topics: [], profileId: 'work' });
            store.insert({ text: 'C', topics: [], profileId: 'personal' });

            expect(store.listLatest({ profileId: 'work' }).map(f => f.text)).toEqual(['B']);
            expect(store.listLatest({ profileId: 'personal' }).map(f => f.text)).toEqual(['C']);
            expect(store.listLatest({ profileId: 'default' }).map(f => f.text)).toEqual(['A']);
        });

        it('listLatest without profileId returns all profiles', () => {
            store.insert({ text: 'A', topics: [] });
            store.insert({ text: 'B', topics: [], profileId: 'work' });
            const all = store.listLatest();
            expect(all.map(f => f.text).sort()).toEqual(['A', 'B']);
        });

        it('supersede inherits the old fact profile by default', () => {
            const old = store.insert({ text: 'old', topics: [], profileId: 'work' });
            const { newFact } = store.supersede(old.id, { text: 'new', topics: [] });
            expect(newFact.profileId).toBe('work');
        });

        it('supersede honours explicit profileId override', () => {
            const old = store.insert({ text: 'old', topics: [], profileId: 'work' });
            const { newFact } = store.supersede(old.id, {
                text: 'new', topics: [], profileId: 'personal',
            });
            expect(newFact.profileId).toBe('personal');
        });
    });

    describe('recordUsage', () => {
        it('bumps use_count and last_used_at WITHOUT writing an audit row', () => {
            const f = store.insert({ text: 'x', topics: [] });
            store.recordUsage(f.id);
            store.recordUsage(f.id);
            const updated = store.getById(f.id);
            expect(updated?.useCount).toBe(2);
            expect(updated?.lastUsedAt).toBeTruthy();

            const ops = auditRows(rawDb);
            // only the original insert -- recordUsage stays inline (R15)
            expect(ops.map(r => r.operation)).toEqual(['insert']);
        });
    });
});
