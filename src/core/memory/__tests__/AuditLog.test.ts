import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { AuditLog } from '../AuditLog';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

/**
 * Tests use a plain in-memory sql.js Database wrapped in a fake MemoryDB
 * adapter so we don't need the full Obsidian Vault layer. Schema is the
 * minimum needed for AuditLog to operate.
 */

const SCHEMA = `
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

function makeFakeMemoryDB(rawDb: SqlJsDatabase): { db: MemoryDB; dirtyCount: () => number } {
    let dirty = 0;
    const fake = {
        getDB: () => rawDb,
        markDirty: () => { dirty += 1; },
    } as unknown as MemoryDB;
    return { db: fake, dirtyCount: () => dirty };
}

describe('AuditLog (PLAN-004 task 8)', () => {
    let rawDb: SqlJsDatabase;
    let memoryDB: MemoryDB;
    let dirtyCount: () => number;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        rawDb.run(SCHEMA);
        ({ db: memoryDB, dirtyCount } = makeFakeMemoryDB(rawDb));
    });

    it('writes an insert audit row with timestamp + operation', () => {
        const log = new AuditLog(memoryDB);
        log.log({ operation: 'insert', factId: 42, sessionId: 'sess-1' });

        const rows = log.list();
        expect(rows).toHaveLength(1);
        expect(rows[0].operation).toBe('insert');
        expect(rows[0].factId).toBe(42);
        expect(rows[0].sessionId).toBe('sess-1');
        expect(rows[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    });

    it('serialises metadata as JSON and reads it back', () => {
        const log = new AuditLog(memoryDB);
        log.log({
            operation: 'supersede',
            factId: 100,
            relatedFactId: 99,
            metadata: { reason: 'newer evidence', confidence: 0.92 },
        });

        const [row] = log.list();
        expect(row.metadata).toEqual({ reason: 'newer evidence', confidence: 0.92 });
        expect(row.relatedFactId).toBe(99);
    });

    it('returns rows in newest-first order', () => {
        const log = new AuditLog(memoryDB);
        log.log({ operation: 'insert', factId: 1 });
        log.log({ operation: 'confirm', factId: 1 });
        log.log({ operation: 'deprecate', factId: 1, rationale: 'stale' });

        const rows = log.list();
        expect(rows.map(r => r.operation)).toEqual(['deprecate', 'confirm', 'insert']);
    });

    it('respects the limit argument', () => {
        const log = new AuditLog(memoryDB);
        for (let i = 0; i < 5; i++) log.log({ operation: 'insert', factId: i });
        expect(log.list(2)).toHaveLength(2);
    });

    it('marks the DB dirty on every write so the debounced save fires', () => {
        const log = new AuditLog(memoryDB);
        expect(dirtyCount()).toBe(0);
        log.log({ operation: 'insert', factId: 1 });
        log.log({ operation: 'confirm', factId: 1 });
        expect(dirtyCount()).toBe(2);
    });

    it('omits factId / metadata cleanly when not provided', () => {
        const log = new AuditLog(memoryDB);
        log.log({ operation: 'deprecate' });

        const [row] = log.list();
        expect(row.factId).toBeUndefined();
        expect(row.metadata).toBeUndefined();
    });

    it('survives malformed JSON in legacy metadata rows (defensive)', () => {
        rawDb.run(
            `INSERT INTO memory_audit (timestamp, operation, metadata) VALUES (?, ?, ?)`,
            ['2026-04-27', 'insert', '{not-json}'],
        );
        const log = new AuditLog(memoryDB);
        const [row] = log.list();
        expect(row.metadata).toBeUndefined();
    });
});
