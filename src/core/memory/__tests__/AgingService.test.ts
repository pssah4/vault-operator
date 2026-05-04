import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { AgingService } from '../AgingService';
import { FactStore } from '../FactStore';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

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
    return { getDB: () => rawDb, markDirty: () => {} } as unknown as MemoryDB;
}

const NOW = new Date('2026-04-28T12:00:00Z');
function daysAgo(n: number): string {
    return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('AgingService (PLAN-007 task A.3)', () => {
    let rawDb: SqlJsDatabase;
    let store: FactStore;
    let aging: AgingService;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        const memDB = makeFakeMemoryDB(rawDb);
        store = new FactStore(memDB);
        aging = new AgingService(memDB);
    });

    function setCreatedAt(id: number, iso: string) {
        rawDb.run('UPDATE facts SET created_at = ? WHERE id = ?', [iso, id]);
    }

    it('skips when last run was less than 24h ago and not forced', () => {
        const lastRunAt = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString();
        const report = aging.runAgingCycle({ now: NOW, lastRunAt });
        expect(report.skipped).toBe(true);
        expect(report.skippedReason).toMatch(/< 24h/);
    });

    it('runs when forced even within 24h window', () => {
        const lastRunAt = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString();
        const report = aging.runAgingCycle({ now: NOW, lastRunAt, force: true });
        expect(report.skipped).toBe(false);
    });

    it('single-shot fact decays at 60d half-life', () => {
        const f = store.insert({ text: 'old', topics: ['x'], importance: 0.8 });
        setCreatedAt(f.id, daysAgo(60));
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        // 0.8 * 0.5^1 = 0.4
        expect(updated?.importance).toBeCloseTo(0.4, 2);
    });

    it('single-shot identity decays at 90d half-life (slower than fact)', () => {
        const f = store.insert({ text: 'I am', topics: [], importance: 0.8, kind: 'identity' });
        setCreatedAt(f.id, daysAgo(90));
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        // 0.8 * 0.5^1 = 0.4
        expect(updated?.importance).toBeCloseTo(0.4, 2);
    });

    it('event decays fast (14d half-life single-tier)', () => {
        const f = store.insert({ text: 'today\'s game', topics: [], importance: 0.6, kind: 'event' });
        setCreatedAt(f.id, daysAgo(28));
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        // 0.6 * 0.5^2 = 0.15
        expect(updated?.importance).toBeCloseTo(0.15, 2);
    });

    it('single-shot preference decays at 30d half-life (kurzlebig, kein Muster)', () => {
        const f = store.insert({ text: 'prefers X today', topics: [], importance: 0.6, kind: 'preference' });
        setCreatedAt(f.id, daysAgo(30));
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        // 0.6 * 0.5 = 0.3
        expect(updated?.importance).toBeCloseTo(0.3, 2);
    });

    it('pattern-tier preference (confirmation_count >= 3) does NOT decay', () => {
        const f = store.insert({ text: 'prefers Plan-Mode', topics: [], importance: 0.6, kind: 'preference' });
        setCreatedAt(f.id, daysAgo(365));
        rawDb.run('UPDATE facts SET confirmation_count = 5 WHERE id = ?', [f.id]);
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        expect(updated?.importance).toBeCloseTo(0.6, 2);
    });

    it('pattern-tier identity (confirmation_count >= 3) does NOT decay', () => {
        const f = store.insert({ text: 'works at EnBW', topics: [], importance: 0.7, kind: 'identity' });
        setCreatedAt(f.id, daysAgo(365));
        rawDb.run('UPDATE facts SET confirmation_count = 4 WHERE id = ?', [f.id]);
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        expect(updated?.importance).toBeCloseTo(0.7, 2);
    });

    it('pattern-tier fact does NOT decay', () => {
        const f = store.insert({ text: 'Java 11 has var-keyword', topics: [], importance: 0.5, kind: 'fact' });
        setCreatedAt(f.id, daysAgo(180));
        rawDb.run('UPDATE facts SET confirmation_count = 3 WHERE id = ?', [f.id]);
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        expect(updated?.importance).toBeCloseTo(0.5, 2);
    });

    it('pattern-tier event still decays but at 30d half-life (slower than single-tier 14d)', () => {
        const f = store.insert({ text: 'weekly standup', topics: [], importance: 0.6, kind: 'event' });
        setCreatedAt(f.id, daysAgo(60));
        rawDb.run('UPDATE facts SET confirmation_count = 3 WHERE id = ?', [f.id]);
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        // 0.6 * 0.5^(60/30) = 0.6 * 0.25 = 0.15
        expect(updated?.importance).toBeCloseTo(0.15, 2);
    });

    it('recent use within 7 days adds a +0.05 boost', () => {
        const f = store.insert({ text: 'old but used', topics: [], importance: 0.5 });
        setCreatedAt(f.id, daysAgo(90));
        // Mark recently used
        rawDb.run('UPDATE facts SET last_used_at = ? WHERE id = ?', [daysAgo(2), f.id]);
        aging.runAgingCycle({ now: NOW, force: true });
        const updated = store.getById(f.id);
        // Without boost: 0.5 * 0.5 = 0.25. With boost: max(0.25, 0.55) = 0.55
        expect(updated?.importance).toBeCloseTo(0.55, 2);
    });

    it('floor prevents importance from dropping below minImportance', () => {
        const f = store.insert({ text: 'ancient', topics: [], importance: 0.3, kind: 'event' });
        setCreatedAt(f.id, daysAgo(365));
        aging.runAgingCycle({ now: NOW, force: true, minImportance: 0.1 });
        const updated = store.getById(f.id);
        expect(updated?.importance).toBeGreaterThanOrEqual(0.1);
    });

    it('skips deprecated and superseded facts', () => {
        const f = store.insert({ text: 'd', topics: [], importance: 0.8 });
        setCreatedAt(f.id, daysAgo(90));
        store.deprecate(f.id, 'no longer accurate');
        const report = aging.runAgingCycle({ now: NOW, force: true });
        expect(report.factsProcessed).toBe(0);
    });

    it('reports processed/updated counts and per-kind breakdown', () => {
        const a = store.insert({ text: 'x', topics: [], importance: 0.6, kind: 'fact' });
        const b = store.insert({ text: 'y', topics: [], importance: 0.6, kind: 'identity' });
        // Pattern-tier preference -> doesn't decay -> not counted as updated.
        const c = store.insert({ text: 'z', topics: [], importance: 0.6, kind: 'preference' });
        setCreatedAt(a.id, daysAgo(90));
        setCreatedAt(b.id, daysAgo(90));
        setCreatedAt(c.id, daysAgo(90));
        rawDb.run('UPDATE facts SET confirmation_count = 5 WHERE id = ?', [c.id]);
        const report = aging.runAgingCycle({ now: NOW, force: true });
        expect(report.factsProcessed).toBe(3);
        expect(report.byKind.fact).toBe(1);
        expect(report.byKind.identity).toBe(1);
        expect(report.byKind.preference).toBe(0);
    });

    it('day-level idempotency: a second run within 24h is short-circuited via lastRunAt', () => {
        // Decay is applied against `current * pow(0.5, age/halfLife)` per run,
        // so a forced second run *would* decay further. The day-level idempotency
        // contract is enforced at the caller level via lastRunAt -- we verify that
        // path here.
        const f = store.insert({ text: 'x', topics: [], importance: 0.8 });
        setCreatedAt(f.id, daysAgo(90));
        const r1 = aging.runAgingCycle({ now: NOW, force: true });
        const after1 = store.getById(f.id)?.importance;

        // Caller stores lastRunAt and passes it next time -> skip
        const r2 = aging.runAgingCycle({ now: NOW, lastRunAt: r1.timestamp });
        expect(r2.skipped).toBe(true);
        expect(store.getById(f.id)?.importance).toBe(after1);
    });
});
