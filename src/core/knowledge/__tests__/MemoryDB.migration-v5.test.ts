import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';

// sql.js does not export a stable `Database` type at runtime; alias to the
// instance type so the helpers below stay typed without depending on an
// internal namespace.
type SqlJsDb = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>;

/**
 * Schema migration v4 -> v5 for the MemoryDB `episodes` table (FEAT-32-02 / ADR-133).
 *
 * Adds a single TEXT column `stigmergy_json` to persist the Stigmergy decision
 * snapshot per episode (mode, pinnedPath, guidanceTextSuppressed, recipeWinner).
 * Old rows keep `stigmergy_json = NULL`; new rows write a JSON-encoded snapshot.
 *
 * The migration must be idempotent: running it twice over the same DB must
 * succeed without error, and running it against a fresh v5 DB must be a no-op.
 *
 * The test replicates the migration logic inline so it does not depend on
 * the plugin's KnowledgeDB / Vault adapter and can run in node-only vitest.
 */

const V1_EPISODES_DDL = `
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    user_message TEXT,
    mode TEXT,
    tool_sequence TEXT,
    tool_ledger TEXT,
    success INTEGER NOT NULL,
    result_summary TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_schema_meta (version INTEGER NOT NULL);
`;

function applyV5StigmergyColumn(db: SqlJsDb): void {
    const cols = db.exec('PRAGMA table_info(episodes)');
    if (cols.length === 0) return;
    const names = cols[0].values.map((row: unknown[]) => row[1] as string);
    if (!names.includes('stigmergy_json')) {
        db.run('ALTER TABLE episodes ADD COLUMN stigmergy_json TEXT');
    }
}

function columnNames(db: SqlJsDb, table: string): string[] {
    const cols = db.exec(`PRAGMA table_info(${table})`);
    if (cols.length === 0) return [];
    return cols[0].values.map((row: unknown[]) => row[1] as string);
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs();
});

describe('MemoryDB migration v4 -> v5 (FEAT-32-02 / ADR-133)', () => {
    it('adds the `stigmergy_json` column to an existing v4 episodes table', () => {
        const db = new SQL.Database();
        for (const stmt of V1_EPISODES_DDL.split(';').map((s) => s.trim()).filter(Boolean)) {
            db.run(stmt + ';');
        }
        db.run('INSERT INTO memory_schema_meta (version) VALUES (4)');
        db.run(
            'INSERT INTO episodes (id, user_message, mode, tool_sequence, tool_ledger, success, result_summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['ep-1', 'hi', 'agent', '[]', '', 1, 'ok', '2026-06-07T00:00:00Z'],
        );

        expect(columnNames(db, 'episodes')).not.toContain('stigmergy_json');
        applyV5StigmergyColumn(db);
        expect(columnNames(db, 'episodes')).toContain('stigmergy_json');

        // Existing row stays intact; stigmergy_json is NULL.
        const result = db.exec('SELECT id, stigmergy_json FROM episodes WHERE id = ?', ['ep-1']);
        expect(result[0].values[0][0]).toBe('ep-1');
        expect(result[0].values[0][1]).toBeNull();

        db.close();
    });

    it('is idempotent when run twice', () => {
        const db = new SQL.Database();
        for (const stmt of V1_EPISODES_DDL.split(';').map((s) => s.trim()).filter(Boolean)) {
            db.run(stmt + ';');
        }
        applyV5StigmergyColumn(db);
        // Second invocation must not throw "duplicate column name".
        expect(() => applyV5StigmergyColumn(db)).not.toThrow();
        expect(columnNames(db, 'episodes')).toContain('stigmergy_json');
        db.close();
    });

    it('persists and round-trips a JSON-encoded stigmergy snapshot on a new row', () => {
        const db = new SQL.Database();
        for (const stmt of V1_EPISODES_DDL.split(';').map((s) => s.trim()).filter(Boolean)) {
            db.run(stmt + ';');
        }
        applyV5StigmergyColumn(db);

        const snapshot = {
            enabled: true,
            mode: 'sequence',
            pinnedPath: ['search_files', 'read_file', 'attempt_completion'],
            guidanceTextSuppressed: true,
            recipeWinner: 'rcp-42',
        };
        db.run(
            'INSERT INTO episodes (id, user_message, mode, tool_sequence, tool_ledger, success, result_summary, created_at, stigmergy_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['ep-2', 'do thing', 'agent', '[]', '', 1, 'ok', '2026-06-07T00:00:00Z', JSON.stringify(snapshot)],
        );

        const result = db.exec('SELECT stigmergy_json FROM episodes WHERE id = ?', ['ep-2']);
        const stored = JSON.parse(result[0].values[0][0] as string);
        expect(stored).toEqual(snapshot);

        db.close();
    });
});
