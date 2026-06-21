import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

import { KnowledgeReviewReader, mapSeverity } from '../KnowledgeReviewReader';

/**
 * IMP-20-06-01 W3-T1 (data layer).
 */

interface Db {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const DDL = `
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
    db.exec(DDL);
    return db;
}

describe('mapSeverity (ADR-106 amendment)', () => {
    it('outdated is always critical', () => {
        expect(mapSeverity('outdated', 0)).toBe('critical');
        expect(mapSeverity('outdated', 1)).toBe('critical');
    });

    it('contradicts critical at or above 0.7 confidence', () => {
        expect(mapSeverity('contradicts', 0.7)).toBe('critical');
        expect(mapSeverity('contradicts', 0.9)).toBe('critical');
    });

    it('contradicts moderate below 0.7 confidence', () => {
        expect(mapSeverity('contradicts', 0.69)).toBe('moderate');
        expect(mapSeverity('contradicts', 0.0)).toBe('moderate');
    });

    it('extends is moderate', () => {
        expect(mapSeverity('extends', 0.5)).toBe('moderate');
    });

    it('no_external_source is info', () => {
        expect(mapSeverity('no_external_source', 0.5)).toBe('info');
    });

    it('matches is ok', () => {
        expect(mapSeverity('matches', 0.99)).toBe('ok');
    });
});

describe('KnowledgeReviewReader.listAll', () => {
    let db: Db;
    let reader: KnowledgeReviewReader;

    beforeEach(async () => {
        db = await makeDb();
        reader = new KnowledgeReviewReader(db);
    });

    it('returns an empty list when no verdicts exist', () => {
        expect(reader.listAll()).toEqual([]);
    });

    it('lists rows sorted by last_checked_at desc, hides matches by default', () => {
        db.run(`INSERT INTO note_freshness (path, freshness_class, classified_at,
            last_verdict, last_confidence, last_summary, last_sources_json,
            last_checked_at, last_verifier_tier) VALUES
            ('A.md', 'stable', '2026-06-19', 'contradicts', 0.9, 'old facts', '["u1"]', '2026-06-19T10:00:00Z', 'mid'),
            ('B.md', 'stable', '2026-06-19', 'matches', 0.95, 'agrees', '[]', '2026-06-19T12:00:00Z', 'mid'),
            ('C.md', 'stable', '2026-06-19', 'outdated', 0.6, 'gone', '[]', '2026-06-19T11:00:00Z', 'mid')`);

        const rows = reader.listAll();
        expect(rows.map((r) => r.path)).toEqual(['C.md', 'A.md']);
        expect(rows[0].severity).toBe('critical');
        expect(rows[1].severity).toBe('critical');
    });

    it('includes matches rows when includeOk=true', () => {
        db.run(`INSERT INTO note_freshness (path, freshness_class, classified_at,
            last_verdict, last_confidence, last_summary, last_sources_json,
            last_checked_at, last_verifier_tier) VALUES
            ('B.md', 'stable', '2026-06-19', 'matches', 0.95, 'agrees', '[]', '2026-06-19T12:00:00Z', 'mid')`);

        const rows = reader.listAll(true);
        expect(rows).toHaveLength(1);
        expect(rows[0].severity).toBe('ok');
    });
});

describe('KnowledgeReviewReader.listHistory', () => {
    it('returns history rows for a single path desc', async () => {
        const db = await makeDb();
        const reader = new KnowledgeReviewReader(db);

        db.run(`INSERT INTO note_freshness_history
            (path, run_at, verdict, confidence, summary, sources_json, verifier_tier, model_id, tokens_used)
            VALUES
            ('A.md', '2026-06-01T00:00:00Z', 'matches', 0.9, 'old run', '[]', 'mid', 'haiku', 100),
            ('A.md', '2026-06-19T00:00:00Z', 'contradicts', 0.8, 'new run', '["u"]', 'mid', 'haiku', 120),
            ('B.md', '2026-06-19T00:00:00Z', 'outdated', 0.7, 'other note', '[]', 'mid', 'haiku', 90)`);

        const history = reader.listHistory('A.md');
        expect(history).toHaveLength(2);
        expect(history[0].runAt).toBe('2026-06-19T00:00:00Z');
        expect(history[0].verdict).toBe('contradicts');
    });
});
