import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

/**
 * HistoryDB schema-skeleton tests (FEATURE-0315 / PLAN-004 task 9).
 *
 * Mirrors HistoryDB.initSchema directly against sql.js so we can verify
 * the v1 skeleton without going through the full Vault/KnowledgeDB
 * stack.
 */

const HISTORY_V1 = `
CREATE TABLE IF NOT EXISTS history_schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS history_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    tokens INTEGER,
    created_at TEXT NOT NULL,
    embedding BLOB,
    embedding_model TEXT,
    metadata TEXT,
    UNIQUE(session_id, chunk_index),
    CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function execDDL(db: ReturnType<typeof SQL.Database.prototype.constructor>, ddl: string) {
    for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }
}

function bumpVersion(db: ReturnType<typeof SQL.Database.prototype.constructor>, target: number) {
    const result = db.exec('SELECT version FROM history_schema_meta LIMIT 1');
    const existing = result[0]?.values?.[0]?.[0] as number | undefined;
    if (existing === target) return;
    if (existing === undefined) {
        db.run('INSERT INTO history_schema_meta (version) VALUES (?)', [target]);
    } else {
        db.run('UPDATE history_schema_meta SET version = ?', [target]);
    }
}

describe('HistoryDB schema skeleton (PLAN-004 task 9)', () => {
    it('creates history_schema_meta + history_chunks on a fresh DB', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, HISTORY_V1);
        bumpVersion(db, 1);

        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const names = tables[0].values.map(r => r[0] as string);
        expect(names).toContain('history_schema_meta');
        expect(names).toContain('history_chunks');

        expect(db.exec('SELECT version FROM history_schema_meta')[0].values[0][0]).toBe(1);
        db.close();
    });

    it('is idempotent on re-run', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, HISTORY_V1);
        bumpVersion(db, 1);

        db.run('INSERT INTO history_chunks (session_id, chunk_index, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
            ['sess-1', 0, 'user', 'hello', '2026-04-27']);

        // Re-run -- version row stays unique, existing data preserved
        execDDL(db, HISTORY_V1);
        bumpVersion(db, 1);

        expect(db.exec('SELECT COUNT(*) FROM history_schema_meta')[0].values[0][0]).toBe(1);
        expect(db.exec('SELECT text FROM history_chunks')[0].values[0][0]).toBe('hello');
        db.close();
    });

    it('UNIQUE(session_id, chunk_index) prevents duplicates', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, HISTORY_V1);

        db.run('INSERT INTO history_chunks (session_id, chunk_index, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
            ['sess-1', 0, 'user', 'first', '2026-04-27']);

        expect(() =>
            db.run('INSERT INTO history_chunks (session_id, chunk_index, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
                ['sess-1', 0, 'user', 'second', '2026-04-27']),
        ).toThrow();
        db.close();
    });

    it('CHECK enforces role enum', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, HISTORY_V1);

        expect(() =>
            db.run('INSERT INTO history_chunks (session_id, chunk_index, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
                ['sess-1', 0, 'narrator', 'oops', '2026-04-27']),
        ).toThrow();
        db.close();
    });
});
