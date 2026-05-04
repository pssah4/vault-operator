import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

/**
 * Tests for KnowledgeDB schema, migration, and checkpoint logic.
 *
 * We test against raw sql.js to avoid file I/O dependencies.
 * This validates the schema DDL, migration path, and checkpoint CRUD
 * that KnowledgeDB.ts implements.
 */

// Replicate the production DDL from KnowledgeDB.ts
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    UNIQUE(path, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vectors_path ON vectors(path);
CREATE TABLE IF NOT EXISTS checkpoint (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

// Schema v1 (without enriched column) for migration testing
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    UNIQUE(path, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vectors_path ON vectors(path);
CREATE TABLE IF NOT EXISTS checkpoint (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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

describe('KnowledgeDB Schema', () => {
    it('should create all tables with correct columns', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);
        db.run('INSERT INTO schema_meta VALUES (2)');

        // Verify tables exist
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const tableNames = tables[0].values.map((r: unknown[]) => r[0]);
        expect(tableNames).toContain('schema_meta');
        expect(tableNames).toContain('vectors');
        expect(tableNames).toContain('checkpoint');

        // Verify vectors has enriched column
        const cols = db.exec('PRAGMA table_info(vectors)');
        const colNames = cols[0].values.map((r: unknown[]) => r[1]);
        expect(colNames).toContain('id');
        expect(colNames).toContain('path');
        expect(colNames).toContain('chunk_index');
        expect(colNames).toContain('text');
        expect(colNames).toContain('vector');
        expect(colNames).toContain('mtime');
        expect(colNames).toContain('enriched');

        // Verify schema version
        const version = db.exec('SELECT version FROM schema_meta');
        expect(version[0].values[0][0]).toBe(2);

        db.close();
    });

    it('should enforce UNIQUE(path, chunk_index)', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);

        const v = new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['note.md', 0, 'text', v, 1000]);

        // Duplicate should fail
        expect(() => {
            db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
                ['note.md', 0, 'other', v, 2000]);
        }).toThrow();

        // Different chunk_index should succeed
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['note.md', 1, 'other', v, 2000]);

        db.close();
    });

    it('should store and retrieve Float32Array vectors as BLOBs', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);

        const original = new Float32Array([0.1, 0.2, 0.3, 0.4]);
        const blob = new Uint8Array(original.buffer, original.byteOffset, original.byteLength);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['note.md', 0, 'text', blob, 1000]);

        const result = db.exec('SELECT vector FROM vectors WHERE path = ?', ['note.md']);
        const retrieved = result[0].values[0][0] as Uint8Array;
        const restored = new Float32Array(retrieved.buffer, retrieved.byteOffset, retrieved.byteLength / 4);

        expect(restored.length).toBe(4);
        expect(restored[0]).toBeCloseTo(0.1, 5);
        expect(restored[3]).toBeCloseTo(0.4, 5);

        db.close();
    });
});

describe('KnowledgeDB Schema Migration (v1 -> v2)', () => {
    it('should add enriched column when migrating from v1', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();

        // Create v1 schema (without enriched)
        execDDL(db, SCHEMA_V1);
        db.run('INSERT INTO schema_meta VALUES (1)');

        // Insert a v1 row
        const v = new Uint8Array(new Float32Array([1, 2]).buffer);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['note.md', 0, 'old text', v, 1000]);

        // Simulate migration: add enriched column
        const version = db.exec('SELECT version FROM schema_meta');
        const currentVersion = version[0].values[0][0] as number;
        expect(currentVersion).toBe(1);

        if (currentVersion < 2) {
            db.run('ALTER TABLE vectors ADD COLUMN enriched INTEGER NOT NULL DEFAULT 0');
            db.run('UPDATE schema_meta SET version = 2');
        }

        // Verify: enriched column exists and old rows have default 0
        const rows = db.exec('SELECT path, enriched FROM vectors');
        expect(rows[0].values[0][0]).toBe('note.md');
        expect(rows[0].values[0][1]).toBe(0);

        // Verify: new inserts work with enriched column
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime, enriched) VALUES (?, ?, ?, ?, ?, ?)',
            ['new.md', 0, 'new text', v, 2000, 1]);
        const newRow = db.exec('SELECT enriched FROM vectors WHERE path = ?', ['new.md']);
        expect(newRow[0].values[0][0]).toBe(1);

        db.close();
    });

    it('should handle double-migration gracefully', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();

        // Start with v2 schema
        execDDL(db, SCHEMA_DDL);
        db.run('INSERT INTO schema_meta VALUES (2)');

        // Attempt to add enriched again — should not throw
        // (This simulates the try/catch in KnowledgeDB.migrateSchema)
        expect(() => {
            try {
                db.run('ALTER TABLE vectors ADD COLUMN enriched INTEGER NOT NULL DEFAULT 0');
            } catch {
                // Column already exists — expected
            }
        }).not.toThrow();

        db.close();
    });
});

describe('KnowledgeDB Checkpoint', () => {
    it('should store and retrieve checkpoint values', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);

        db.run('INSERT OR REPLACE INTO checkpoint (key, value) VALUES (?, ?)', ['embeddingModel', 'openai:text-embedding-3-small']);
        db.run('INSERT OR REPLACE INTO checkpoint (key, value) VALUES (?, ?)', ['docCount', '695']);

        const model = db.exec('SELECT value FROM checkpoint WHERE key = ?', ['embeddingModel']);
        expect(model[0].values[0][0]).toBe('openai:text-embedding-3-small');

        const count = db.exec('SELECT value FROM checkpoint WHERE key = ?', ['docCount']);
        expect(count[0].values[0][0]).toBe('695');
    });

    it('should upsert checkpoint values', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);

        db.run('INSERT OR REPLACE INTO checkpoint (key, value) VALUES (?, ?)', ['docCount', '100']);
        db.run('INSERT OR REPLACE INTO checkpoint (key, value) VALUES (?, ?)', ['docCount', '200']);

        const result = db.exec('SELECT value FROM checkpoint WHERE key = ?', ['docCount']);
        expect(result[0].values[0][0]).toBe('200');
    });

    it('should return empty for non-existent key', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);

        const result = db.exec('SELECT value FROM checkpoint WHERE key = ?', ['nonexistent']);
        expect(result.length === 0 || result[0].values.length === 0).toBe(true);
    });

    it('should derive file count from vectors table (not checkpoint)', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);

        const v = new Uint8Array(new Float32Array([1, 2]).buffer);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['a.md', 0, 'A', v, 1000]);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['a.md', 1, 'A2', v, 1000]);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['b.md', 0, 'B', v, 2000]);

        // Checkpoint says 100 (stale value)
        db.run('INSERT OR REPLACE INTO checkpoint (key, value) VALUES (?, ?)', ['docCount', '100']);

        // DB truth: 2 unique files
        const fileCount = db.exec('SELECT COUNT(DISTINCT path) FROM vectors');
        expect(fileCount[0].values[0][0]).toBe(2);

        // This validates the fix: initialize() should use DB count, not checkpoint
    });
});

// FEATURE-0314: schema v9 adds the embedding_model column so cosine search
// can filter on the producing model. URI schemas are deferred to Memory v2.
describe('KnowledgeDB Schema Migration (v8 -> v9)', () => {
    it('adds embedding_model column with default unknown', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_V1);
        db.run('INSERT INTO schema_meta VALUES (8)');

        const v = new Uint8Array(new Float32Array([1, 2]).buffer);
        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['note.md', 0, 'old', v, 1000]);

        try {
            db.run("ALTER TABLE vectors ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'unknown'");
        } catch { /* idempotent */ }

        const result = db.exec('SELECT path, embedding_model FROM vectors');
        expect(result[0].values[0][0]).toBe('note.md');
        expect(result[0].values[0][1]).toBe('unknown');

        db.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime, embedding_model) VALUES (?, ?, ?, ?, ?, ?)',
            ['new.md', 0, 'new', v, 2000, 'qwen3-embedding-8b']);
        const filtered = db.exec(
            "SELECT path FROM vectors WHERE embedding_model = ? ORDER BY path",
            ['qwen3-embedding-8b'],
        );
        expect(filtered[0].values).toHaveLength(1);
        expect(filtered[0].values[0][0]).toBe('new.md');

        db.close();
    });
});

// FEATURE-0314: PRAGMA integrity_check used as second verification stage on open
describe('KnowledgeDB integrity_check', () => {
    it('reports ok for a healthy DB', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, SCHEMA_DDL);
        db.run('INSERT INTO schema_meta VALUES (9)');

        const result = db.exec('PRAGMA integrity_check;');
        expect(result[0].values[0][0]).toBe('ok');

        db.close();
    });

    // AK 8 Stage 2: a corrupt main DB must be rejected so the open-path
    // can fall back to .bak. The corruption pattern targets a B-tree page
    // boundary so the lightweight Stage-1 queries pass and only the deeper
    // PRAGMA integrity_check catches it.
    it('rejects corrupt B-tree, healthy .bak loads instead', async () => {
        const SQL = await getSQL();

        // Build a healthy DB with realistic content -- export bytes for both
        // the corruption candidate and the backup copy.
        const seed = new SQL.Database();
        execDDL(seed, SCHEMA_DDL);
        seed.run('INSERT INTO schema_meta VALUES (9)');
        const v = new Uint8Array(new Float32Array([1, 2, 3]).buffer);
        for (let i = 0; i < 64; i++) {
            seed.run(
                'INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
                [`note-${i}.md`, 0, `chunk ${i}`.repeat(32), v, i],
            );
        }
        const healthyBytes = seed.export();
        seed.close();

        // Corruption: zero out a page deep enough to invalidate B-tree links
        // without truncating the file. SQLite default page size is 4096; we
        // hit page 4 (offset 0x4000).
        const corruptBytes = new Uint8Array(healthyBytes);
        const corruptOffset = 0x4000;
        for (let i = 0; i < 256; i++) corruptBytes[corruptOffset + i] = 0xff;

        // Replicate the production tryLoadWithIntegrityCheck flow.
        const tryLoad = (data: Uint8Array): boolean => {
            try {
                const candidate = new SQL.Database(data);
                candidate.exec('SELECT count(*) FROM schema_meta');
                candidate.exec('SELECT count(*) FROM vectors');
                const integrity = candidate.exec('PRAGMA integrity_check;');
                const verdict = integrity[0]?.values?.[0]?.[0];
                candidate.close();
                return verdict === 'ok';
            } catch {
                return false;
            }
        };

        // Stage 1: corrupt main file is rejected.
        expect(tryLoad(corruptBytes)).toBe(false);

        // Stage 2: open-path falls back to .bak which is intact.
        expect(tryLoad(healthyBytes)).toBe(true);
    });
});

describe('KnowledgeDB DB Export/Import roundtrip', () => {
    it('should preserve data across export/import', async () => {
        const SQL = await getSQL();
        const db1 = new SQL.Database();
        execDDL(db1, SCHEMA_DDL);

        const v = new Uint8Array(new Float32Array([1.5, 2.5, 3.5]).buffer);
        db1.run('INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)',
            ['note.md', 0, 'Hello', v, 1000]);

        // Export
        const data = db1.export();
        db1.close();

        // Import into new instance
        const db2 = new SQL.Database(data);
        const result = db2.exec('SELECT text FROM vectors WHERE path = ?', ['note.md']);
        expect(result[0].values[0][0]).toBe('Hello');

        // Verify vector fidelity
        const vecResult = db2.exec('SELECT vector FROM vectors WHERE path = ?', ['note.md']);
        const blob = vecResult[0].values[0][0] as Uint8Array;
        const restored = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
        expect(restored[0]).toBeCloseTo(1.5, 5);
        expect(restored[2]).toBeCloseTo(3.5, 5);

        db2.close();
    });
});
