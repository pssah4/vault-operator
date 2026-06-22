import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

import { migrateVectorsToDomainsV12ToV13 } from '../KnowledgeDB';

/**
 * FEAT-03-27 (ADR-136) v12 -> v13 vectors.domain backfill migration.
 *
 * v12 stored every embedding in the vectors table without a layer
 * discriminator. v13 introduces vectors.domain ('note'|'session'|
 * 'episode'|'fact'|'mention'|'thread'|'entity') plus a backfill from
 * the colon-prefix of the path column. The backfill must be:
 *   - additive (ADD COLUMN ... DEFAULT 'note')
 *   - prefix-strict (the LIKE pattern uses 'prefix:%' so
 *     'session_intro.md' stays 'note', not 'session')
 *   - idempotent (a second run produces zero further updates)
 *   - schema_meta version bumped to 13
 *
 * The migration step is extracted as a pure helper so this test can
 * exercise it against an in-memory sql.js DB without instantiating
 * KnowledgeDB (which needs a Vault). The integration path through
 * migrateSchema() calls the same helper.
 */

interface Db {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const V12_DDL_SLICE = `
CREATE TABLE schema_meta (version INTEGER NOT NULL);
INSERT INTO schema_meta VALUES (12);

CREATE TABLE vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    embedding_model TEXT NOT NULL DEFAULT 'unknown',
    UNIQUE(path, chunk_index)
);
CREATE INDEX idx_vectors_path ON vectors(path);
`;

async function makeV12Db(): Promise<Db> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(V12_DDL_SLICE);
    return db;
}

function insertVector(db: Db, path: string, chunkIndex = 0): void {
    db.run(
        `INSERT INTO vectors (path, chunk_index, text, vector, mtime)
         VALUES (?, ?, ?, ?, ?)`,
        [path, chunkIndex, 'text-' + path, new Uint8Array(4), 0],
    );
}

function getDomain(db: Db, path: string): string {
    const r = db.exec('SELECT domain FROM vectors WHERE path = ? AND chunk_index = 0', [path]);
    return r[0]?.values[0]?.[0] as string;
}

function getVersion(db: Db): number {
    const r = db.exec('SELECT version FROM schema_meta');
    return r[0].values[0][0] as number;
}

describe('migrateVectorsToDomainsV12ToV13', () => {
    let db: Db;

    beforeEach(async () => {
        db = await makeV12Db();
    });

    it('backfills domain correctly for a mixed set of paths', () => {
        insertVector(db, 'Notes/Foo.md');
        insertVector(db, 'session:abc-123');
        insertVector(db, 'episode:ep-1');
        insertVector(db, 'fact:f-1');
        insertVector(db, 'mention:m-1');
        insertVector(db, 'thread:t-1');
        insertVector(db, 'entity:e-1');

        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);

        expect(getDomain(db, 'Notes/Foo.md')).toBe('note');
        expect(getDomain(db, 'session:abc-123')).toBe('session');
        expect(getDomain(db, 'episode:ep-1')).toBe('episode');
        expect(getDomain(db, 'fact:f-1')).toBe('fact');
        expect(getDomain(db, 'mention:m-1')).toBe('mention');
        expect(getDomain(db, 'thread:t-1')).toBe('thread');
        expect(getDomain(db, 'entity:e-1')).toBe('entity');
    });

    it('bumps schema_meta.version to 13', () => {
        expect(getVersion(db)).toBe(12);
        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);
        expect(getVersion(db)).toBe(13);
    });

    it('does not false-positive on note paths whose name starts with a domain keyword', () => {
        // ADR-136 risk: the pathological case is 'session_intro.md' which the
        // LIKE pattern must NOT touch. The pattern uses 'session:%' (colon),
        // not 'session%' (any starts-with), so the underscore-variant remains
        // a regular note.
        insertVector(db, 'session_intro.md');
        insertVector(db, 'episode_notes/recap.md');
        insertVector(db, 'fact_sheets/budget.md');
        insertVector(db, 'sessions/2026-06.md');

        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);

        expect(getDomain(db, 'session_intro.md')).toBe('note');
        expect(getDomain(db, 'episode_notes/recap.md')).toBe('note');
        expect(getDomain(db, 'fact_sheets/budget.md')).toBe('note');
        expect(getDomain(db, 'sessions/2026-06.md')).toBe('note');
    });

    it('is idempotent: a second run produces zero row updates', () => {
        insertVector(db, 'Notes/Foo.md');
        insertVector(db, 'session:abc');
        insertVector(db, 'episode:ep-1');

        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);

        // Capture state, then re-run. The helper updates schema_meta
        // unconditionally (1 row), so on the second pass the only modified
        // row count we expect from the UPDATEs themselves is zero.
        const before = db.exec('SELECT path, domain FROM vectors ORDER BY path');

        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);

        const after = db.exec('SELECT path, domain FROM vectors ORDER BY path');
        expect(after[0].values).toEqual(before[0].values);
        expect(getVersion(db)).toBe(13);
    });

    it('creates the idx_vectors_domain_path composite index', () => {
        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);
        const r = db.exec(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_vectors_domain_path'",
        );
        expect(r[0]?.values.length ?? 0).toBe(1);
    });

    it('survives a partial-migration replay where the domain column already exists', () => {
        // Simulate the case where a previous attempt landed the ALTER but
        // failed before the schema_meta bump. The helper must not throw.
        db.run("ALTER TABLE vectors ADD COLUMN domain TEXT NOT NULL DEFAULT 'note'");
        insertVector(db, 'session:abc');

        expect(() =>
            migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]),
        ).not.toThrow();
        expect(getDomain(db, 'session:abc')).toBe('session');
        expect(getVersion(db)).toBe(13);
    });
});
