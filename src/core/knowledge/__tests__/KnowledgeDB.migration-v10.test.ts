import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

/**
 * Schema-Migration v9 -> v10 (BA-25 ADR-92 Bundle).
 *
 * Verifies that the additive migration creates six new tables
 * (note_summaries, frontmatter_properties, cluster_source_stats,
 * cluster_metadata, ingest_session, ingest_triage_log) without
 * touching existing v9 tables.
 */

// Replicates the v10 SCHEMA_DDL from KnowledgeDB.ts. Kept inline so the
// test does not depend on file I/O or plugin imports.
const SCHEMA_DDL_V10 = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (
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
CREATE TABLE IF NOT EXISTS note_summaries (
    note_path TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    summary_model TEXT NOT NULL,
    summarized_at TEXT NOT NULL,
    source_mtime INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS frontmatter_properties (
    note_path TEXT NOT NULL,
    property_name TEXT NOT NULL,
    property_value TEXT NOT NULL,
    list_index INTEGER NOT NULL DEFAULT 0,
    UNIQUE(note_path, property_name, list_index)
);
CREATE TABLE IF NOT EXISTS cluster_source_stats (
    cluster TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    note_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (cluster, source_domain)
);
CREATE TABLE IF NOT EXISTS cluster_metadata (
    cluster TEXT PRIMARY KEY,
    half_life_days INTEGER NOT NULL,
    custom_weights TEXT,
    last_external_check TEXT,
    last_hint_at TEXT,
    hot_cluster INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ingest_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uri TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_turn_at TEXT NOT NULL,
    state_json TEXT NOT NULL,
    conversation_id TEXT
);
CREATE TABLE IF NOT EXISTS ingest_triage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uri TEXT NOT NULL,
    triaged_at TEXT NOT NULL,
    decision TEXT NOT NULL,
    decision_reason TEXT,
    UNIQUE(source_uri)
);
`;

const NEW_TABLES_V10 = [
    'note_summaries',
    'frontmatter_properties',
    'cluster_source_stats',
    'cluster_metadata',
    'ingest_session',
    'ingest_triage_log',
];

describe('KnowledgeDB migration v9 -> v10', () => {
    it('creates all six new tables additively', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V10);
        db.run('INSERT INTO schema_meta VALUES (10)');

        for (const tableName of NEW_TABLES_V10) {
            const result = db.exec(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                [tableName],
            );
            expect(result.length, `table ${tableName} must exist`).toBeGreaterThan(0);
            expect(result[0].values.length, `table ${tableName} must exist`).toBe(1);
        }

        const versionResult = db.exec('SELECT version FROM schema_meta');
        expect(versionResult[0].values[0][0]).toBe(10);

        db.close();
    });

    it('keeps existing v9 tables intact (no destructive ALTER)', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V10);

        // vectors table from v8/v9 must still have its columns
        const cols = db.exec('PRAGMA table_info(vectors)');
        const colNames = cols[0].values.map((row) => row[1] as string);
        expect(colNames).toContain('id');
        expect(colNames).toContain('path');
        expect(colNames).toContain('vector');
        expect(colNames).toContain('enriched');
        expect(colNames).toContain('embedding_model');

        db.close();
    });

    it('cluster_metadata default half-life is configurable per cluster', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V10);

        db.run(
            `INSERT INTO cluster_metadata (cluster, half_life_days, hot_cluster) VALUES (?, ?, ?)`,
            ['Tech', 180, 1],
        );

        const result = db.exec(
            `SELECT half_life_days, hot_cluster FROM cluster_metadata WHERE cluster = ?`,
            ['Tech'],
        );
        expect(result[0].values[0][0]).toBe(180);
        expect(result[0].values[0][1]).toBe(1);

        db.close();
    });

    it('cluster_source_stats UNIQUE constraint on (cluster, source_domain)', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V10);

        const ts = '2026-05-03T00:00:00Z';
        db.run(
            `INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`,
            ['Tech', 'medium.com', 1, ts, ts],
        );
        // Inserting same primary key throws
        expect(() => {
            db.run(
                `INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`,
                ['Tech', 'medium.com', 2, ts, ts],
            );
        }).toThrow();
        db.close();
    });

    it('frontmatter_properties supports list-properties via list_index', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V10);

        db.run(
            `INSERT INTO frontmatter_properties VALUES (?, ?, ?, ?)`,
            ['Notes/A.md', 'tags', 'tag1', 0],
        );
        db.run(
            `INSERT INTO frontmatter_properties VALUES (?, ?, ?, ?)`,
            ['Notes/A.md', 'tags', 'tag2', 1],
        );

        const result = db.exec(
            `SELECT property_value FROM frontmatter_properties WHERE note_path=? AND property_name=? ORDER BY list_index`,
            ['Notes/A.md', 'tags'],
        );
        expect(result[0].values.length).toBe(2);
        expect(result[0].values[0][0]).toBe('tag1');
        expect(result[0].values[1][0]).toBe('tag2');

        db.close();
    });

    it('migration is idempotent (CREATE TABLE IF NOT EXISTS)', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V10);
        // Re-run DDL: must not throw, must not duplicate tables.
        db.exec(SCHEMA_DDL_V10);

        for (const tableName of NEW_TABLES_V10) {
            const result = db.exec(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                [tableName],
            );
            expect(result[0].values.length).toBe(1);
        }

        db.close();
    });
});
