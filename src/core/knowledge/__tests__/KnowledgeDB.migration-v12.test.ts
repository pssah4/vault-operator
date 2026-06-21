import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

import { migrateVerdictVocabularyV11ToV12 } from '../KnowledgeDB';

/**
 * IMP-20-06-01 v11 -> v12 verdict-vocabulary migration.
 *
 * v11 stored German verdict literals (`deckt-sich`, `ergaenzt`,
 * `widerspricht`). v12 rewrites those to the English canon
 * (`matches`, `extends`, `contradicts`). `outdated` and
 * `no_external_source` were English from the start and must pass
 * through untouched.
 *
 * The migration step is extracted as a pure helper so this test
 * can exercise it against a sql.js DB without instantiating
 * KnowledgeDB (which needs a Vault). The integration path through
 * `migrateSchema()` calls the same helper, so any bug here would
 * fire during the live migration too.
 */

interface Db {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const V11_DDL_SLICE = `
CREATE TABLE note_freshness (
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
CREATE TABLE note_freshness_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    run_at TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confidence REAL NOT NULL,
    summary TEXT,
    sources_json TEXT,
    verifier_tier TEXT NOT NULL,
    model_id TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0
);
`;

async function makeDb(): Promise<Db> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(V11_DDL_SLICE);
    return db;
}

describe('migrateVerdictVocabularyV11ToV12', () => {
    let db: Db;

    beforeEach(async () => {
        db = await makeDb();
    });

    it('rewrites the three German verdicts in note_freshness.last_verdict', () => {
        db.run(
            `INSERT INTO note_freshness (path, classified_at, last_verdict) VALUES
              ('A.md', '2026-06-19', 'deckt-sich'),
              ('B.md', '2026-06-19', 'ergaenzt'),
              ('C.md', '2026-06-19', 'widerspricht'),
              ('D.md', '2026-06-19', 'outdated'),
              ('E.md', '2026-06-19', 'no_external_source')`,
        );

        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);

        const rows = db.exec('SELECT path, last_verdict FROM note_freshness ORDER BY path');
        const mapped = Object.fromEntries(
            rows[0].values.map((r) => [r[0] as string, r[1] as string]),
        );
        expect(mapped['A.md']).toBe('matches');
        expect(mapped['B.md']).toBe('extends');
        expect(mapped['C.md']).toBe('contradicts');
        expect(mapped['D.md']).toBe('outdated');
        expect(mapped['E.md']).toBe('no_external_source');
    });

    it('rewrites the three German verdicts in note_freshness_history.verdict', () => {
        db.run(
            `INSERT INTO note_freshness_history
              (path, run_at, verdict, confidence, verifier_tier, model_id, tokens_used)
             VALUES
              ('A.md', '2026-06-01T00:00:00Z', 'deckt-sich',  0.8, 'mid', 'haiku', 100),
              ('A.md', '2026-06-10T00:00:00Z', 'widerspricht', 0.8, 'mid', 'haiku', 100),
              ('B.md', '2026-06-15T00:00:00Z', 'ergaenzt',     0.8, 'mid', 'haiku', 100),
              ('C.md', '2026-06-19T00:00:00Z', 'outdated',     0.8, 'mid', 'haiku', 100)`,
        );

        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);

        const rows = db.exec(
            'SELECT path, verdict FROM note_freshness_history ORDER BY path, run_at',
        );
        const got = rows[0].values.map((r) => [r[0] as string, r[1] as string]);
        expect(got).toEqual([
            ['A.md', 'matches'],
            ['A.md', 'contradicts'],
            ['B.md', 'extends'],
            ['C.md', 'outdated'],
        ]);
    });

    it('leaves NULL last_verdict columns untouched', () => {
        db.run(
            `INSERT INTO note_freshness (path, classified_at) VALUES ('A.md', '2026-06-19')`,
        );
        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);

        const r = db.exec('SELECT last_verdict FROM note_freshness WHERE path = ?', ['A.md']);
        expect(r[0].values[0][0]).toBeNull();
    });

    it('passes through outdated and no_external_source in note_freshness_history unchanged across a second run', () => {
        db.run(
            `INSERT INTO note_freshness_history
              (path, run_at, verdict, confidence, verifier_tier, model_id, tokens_used)
             VALUES
              ('A.md', '2026-06-19T00:00:00Z', 'outdated',           0.8, 'mid', 'haiku', 100),
              ('A.md', '2026-06-19T01:00:00Z', 'no_external_source', 0.0, 'mid', 'haiku',   0)`,
        );

        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);
        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);

        const r = db.exec('SELECT verdict FROM note_freshness_history ORDER BY run_at');
        expect(r[0].values.map((row) => row[0])).toEqual(['outdated', 'no_external_source']);
    });

    it('swallows the absent-history-table case without throwing (partial v11 install)', async () => {
        // Build a stripped DB that only carries note_freshness; the
        // helper's second try/catch covers the case where a partial
        // v11 install ended up without the history table.
        const SQL = await initSqlJs();
        const stripped = new SQL.Database();
        stripped.exec(`CREATE TABLE note_freshness (
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
        );`);
        stripped.run(
            `INSERT INTO note_freshness (path, classified_at, last_verdict)
             VALUES ('A.md', '2026-06-19', 'deckt-sich')`,
        );

        expect(() =>
            migrateVerdictVocabularyV11ToV12(stripped as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]),
        ).not.toThrow();

        const r = stripped.exec('SELECT last_verdict FROM note_freshness WHERE path = ?', ['A.md']);
        expect(r[0].values[0][0]).toBe('matches');
        stripped.close();
    });

    it('is idempotent: re-running on already-English values is a no-op', () => {
        db.run(
            `INSERT INTO note_freshness (path, classified_at, last_verdict) VALUES
              ('A.md', '2026-06-19', 'matches'),
              ('B.md', '2026-06-19', 'contradicts'),
              ('C.md', '2026-06-19', 'extends')`,
        );
        db.run(
            `INSERT INTO note_freshness_history
              (path, run_at, verdict, confidence, verifier_tier, model_id, tokens_used)
             VALUES ('A.md', '2026-06-19T00:00:00Z', 'matches', 0.8, 'mid', 'haiku', 100)`,
        );

        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);
        migrateVerdictVocabularyV11ToV12(db as unknown as Parameters<typeof migrateVerdictVocabularyV11ToV12>[0]);

        const f = db.exec('SELECT path, last_verdict FROM note_freshness ORDER BY path');
        const h = db.exec('SELECT verdict FROM note_freshness_history WHERE path = ?', ['A.md']);

        expect(f[0].values).toEqual([
            ['A.md', 'matches'],
            ['B.md', 'contradicts'],
            ['C.md', 'extends'],
        ]);
        expect(h[0].values[0][0]).toBe('matches');
    });
});
