import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { ThreadDeltaStore } from '../ThreadDeltaStore';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

const SCHEMA = `
CREATE TABLE conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    session_count INTEGER NOT NULL DEFAULT 1,
    memory_eligible INTEGER NOT NULL DEFAULT 0,
    memory_eligible_at TEXT,
    metadata TEXT,
    last_extracted_message_index INTEGER,
    delta_summary TEXT
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

describe('ThreadDeltaStore (PLAN-007 task B.3)', () => {
    let rawDb: SqlJsDatabase;
    let store: ThreadDeltaStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        store = new ThreadDeltaStore(makeFakeMemoryDB(rawDb));
    });

    describe('get', () => {
        it('returns null for unknown threadId', () => {
            expect(store.get('nope')).toBeNull();
        });

        it('returns null state when thread exists but delta columns are unset', () => {
            rawDb.run(
                `INSERT INTO conversation_threads (thread_id, created_at, last_active_at)
                 VALUES ('t1', '2026-04-27', '2026-04-27')`,
            );
            const delta = store.get('t1');
            expect(delta).toEqual({
                threadId: 't1',
                lastExtractedMessageIndex: null,
                deltaSummary: null,
            });
        });

        it('returns persisted delta state', () => {
            rawDb.run(
                `INSERT INTO conversation_threads
                    (thread_id, created_at, last_active_at,
                     last_extracted_message_index, delta_summary)
                 VALUES ('t1', '2026-04-27', '2026-04-27', 8, 'so far summary')`,
            );
            expect(store.get('t1')).toEqual({
                threadId: 't1',
                lastExtractedMessageIndex: 8,
                deltaSummary: 'so far summary',
            });
        });

        it('returns null when threadId is empty', () => {
            expect(store.get('')).toBeNull();
        });
    });

    describe('save', () => {
        it('inserts a new thread row when none exists', () => {
            store.save({
                threadId: 't-new',
                lastExtractedMessageIndex: 5,
                deltaSummary: 'fresh summary',
            });
            const delta = store.get('t-new');
            expect(delta).toMatchObject({
                threadId: 't-new',
                lastExtractedMessageIndex: 5,
                deltaSummary: 'fresh summary',
            });
        });

        it('updates an existing thread row without overwriting unrelated fields', () => {
            rawDb.run(
                `INSERT INTO conversation_threads
                    (thread_id, title, created_at, last_active_at, session_count, memory_eligible)
                 VALUES ('t1', 'Title', '2026-04-27', '2026-04-27', 3, 1)`,
            );
            store.save({ threadId: 't1', lastExtractedMessageIndex: 12, deltaSummary: 'updated' });
            const result = rawDb.exec('SELECT title, session_count, memory_eligible FROM conversation_threads');
            expect(result[0].values[0]).toEqual(['Title', 3, 1]);
            expect(store.get('t1')).toMatchObject({
                lastExtractedMessageIndex: 12,
                deltaSummary: 'updated',
            });
        });

        it('accepts null index + null summary (e.g. when resetting)', () => {
            store.save({ threadId: 't1', lastExtractedMessageIndex: 4, deltaSummary: 'x' });
            store.save({ threadId: 't1', lastExtractedMessageIndex: null, deltaSummary: null });
            expect(store.get('t1')).toMatchObject({
                lastExtractedMessageIndex: null,
                deltaSummary: null,
            });
        });

        it('rejects negative indices', () => {
            expect(() =>
                store.save({ threadId: 't1', lastExtractedMessageIndex: -1, deltaSummary: null }),
            ).toThrow(/non-negative/);
        });

        it('rejects non-integer indices', () => {
            expect(() =>
                store.save({ threadId: 't1', lastExtractedMessageIndex: 1.5, deltaSummary: null }),
            ).toThrow(/integer/);
        });

        it('rejects empty threadId', () => {
            expect(() =>
                store.save({ threadId: '', lastExtractedMessageIndex: 0, deltaSummary: null }),
            ).toThrow(/threadId/);
        });
    });
});
