import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

/**
 * Schema-Migration v10 -> v11 (IMP-20-06-01 Stage 4+5 freshness verifier).
 *
 * Verifies that the additive migration:
 * - Extends note_freshness with six verdict columns (all nullable)
 * - Adds note_freshness_history table (1:N to note_freshness.path)
 * - Adds an index on note_freshness_history(path, run_at DESC)
 * - Does not break existing v10 reads on freshness_class
 */

// Replicates the v11 SCHEMA_DDL from KnowledgeDB.ts. Kept inline so the
// test does not depend on file I/O or plugin imports.
const SCHEMA_DDL_V11 = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS note_freshness (
    path TEXT PRIMARY KEY,
    freshness_class TEXT NOT NULL DEFAULT 'stable',
    temporal_marker_count INTEGER NOT NULL DEFAULT 0,
    classified_at TEXT NOT NULL,
    last_verdict TEXT,
    last_confidence REAL,
    last_summary TEXT,
    last_sources_json TEXT,
    last_checked_at TEXT,
    last_verifier_tier TEXT
);
CREATE TABLE IF NOT EXISTS note_freshness_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    run_at TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confidence REAL NOT NULL,
    summary TEXT,
    sources_json TEXT,
    verifier_tier TEXT NOT NULL,
    model_id TEXT,
    tokens_used INTEGER
);
CREATE INDEX IF NOT EXISTS idx_note_freshness_history_path_run
    ON note_freshness_history(path, run_at DESC);
INSERT INTO schema_meta VALUES (11);
`;

describe('KnowledgeDB schema migration v10 -> v11 (IMP-20-06-01)', () => {
    it('note_freshness retains its v10 columns plus the six new verdict columns', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V11);

        const cols = db.exec('PRAGMA table_info(note_freshness)');
        const colNames = cols[0].values.map((row) => row[1] as string);

        // v10 columns must survive
        expect(colNames).toContain('path');
        expect(colNames).toContain('freshness_class');
        expect(colNames).toContain('temporal_marker_count');
        expect(colNames).toContain('classified_at');

        // v11 additive columns
        expect(colNames).toContain('last_verdict');
        expect(colNames).toContain('last_confidence');
        expect(colNames).toContain('last_summary');
        expect(colNames).toContain('last_sources_json');
        expect(colNames).toContain('last_checked_at');
        expect(colNames).toContain('last_verifier_tier');

        db.close();
    });

    it('the six new verdict columns are nullable (no default-not-null)', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V11);

        // Insert with only the v10 mandatory columns -> v11 nullables must accept null
        db.run(
            'INSERT INTO note_freshness (path, freshness_class, temporal_marker_count, classified_at) VALUES (?, ?, ?, ?)',
            ['Notes/A.md', 'volatile', 0, '2026-06-19T00:00:00Z'],
        );

        const result = db.exec('SELECT last_verdict, last_confidence FROM note_freshness WHERE path = ?', ['Notes/A.md']);
        expect(result[0].values[0][0]).toBe(null);
        expect(result[0].values[0][1]).toBe(null);

        db.close();
    });

    it('note_freshness_history exists with the documented columns', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V11);

        const cols = db.exec('PRAGMA table_info(note_freshness_history)');
        const colNames = cols[0].values.map((row) => row[1] as string);

        expect(colNames).toContain('id');
        expect(colNames).toContain('path');
        expect(colNames).toContain('run_at');
        expect(colNames).toContain('verdict');
        expect(colNames).toContain('confidence');
        expect(colNames).toContain('summary');
        expect(colNames).toContain('sources_json');
        expect(colNames).toContain('verifier_tier');
        expect(colNames).toContain('model_id');
        expect(colNames).toContain('tokens_used');

        db.close();
    });

    it('idx_note_freshness_history_path_run exists for fast retention queries', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V11);

        const result = db.exec(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_note_freshness_history_path_run'",
        );
        expect(result[0].values.length).toBe(1);

        db.close();
    });

    it('note_freshness_history accepts a row with optional summary and sources_json null', async () => {
        // Historical fixture: v11 stored German verdict literals
        // (`deckt-sich` / `ergaenzt` / `widerspricht`). The v12
        // migration rewrites them to the English canon; see
        // `KnowledgeDB.migration-v12.test.ts`. The German literal
        // below documents what v11 PERSISTED, not what current code
        // emits.
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V11);

        db.run(
            `INSERT INTO note_freshness_history
             (path, run_at, verdict, confidence, verifier_tier, model_id, tokens_used)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['Notes/B.md', '2026-06-19T00:00:00Z', 'deckt-sich', 0.92, 'mid', 'claude-haiku-4-5', 5500],
        );

        const result = db.exec(
            'SELECT verdict, confidence, summary FROM note_freshness_history WHERE path = ?',
            ['Notes/B.md'],
        );
        expect(result[0].values[0][0]).toBe('deckt-sich');
        expect(result[0].values[0][1]).toBeCloseTo(0.92, 2);
        expect(result[0].values[0][2]).toBe(null);

        db.close();
    });

    it('schema_meta version reads 11 after v11 DDL applied', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        db.exec(SCHEMA_DDL_V11);

        const result = db.exec('SELECT version FROM schema_meta');
        expect(result[0].values[0][0]).toBe(11);

        db.close();
    });
});
