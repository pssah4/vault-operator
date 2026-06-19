import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

import { NoteFreshnessHistoryStore } from '../NoteFreshnessHistoryStore';

// Local Database shape just for the test fixture. The store itself uses a
// minimal SqlDb interface; the test needs the broader sql.js surface for
// arrange and assert calls.
interface Database {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

/**
 * Tests for IMP-20-06-01 Wave 1 task W1-T3.
 *
 * The store records one verifier run per call and enforces a retention
 * policy of 5 rows OR 90 days per note path, whichever shrinks the set
 * more, on every insert.
 */

const V11_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
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

async function makeDb(): Promise<Database> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(V11_DDL);
    return db;
}

function countRows(db: Database, path: string): number {
    const result = db.exec('SELECT COUNT(*) FROM note_freshness_history WHERE path = ?', [path]);
    return result[0].values[0][0] as number;
}

describe('NoteFreshnessHistoryStore (IMP-20-06-01 W1-T3)', () => {
    let db: Database;
    let store: NoteFreshnessHistoryStore;

    beforeEach(async () => {
        db = await makeDb();
        store = new NoteFreshnessHistoryStore(db);
    });

    it('records a run with verdict and confidence', () => {
        store.recordRun({
            path: 'Notes/A.md',
            runAt: '2026-06-19T00:00:00Z',
            verdict: 'deckt-sich',
            confidence: 0.92,
            verifierTier: 'mid',
            modelId: 'claude-haiku-4-5',
            tokensUsed: 5500,
        });

        expect(countRows(db, 'Notes/A.md')).toBe(1);
    });

    it('keeps only the newest 5 runs per path when more are inserted', () => {
        for (let i = 1; i <= 6; i++) {
            store.recordRun({
                path: 'Notes/A.md',
                runAt: `2026-06-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
                verdict: 'deckt-sich',
                confidence: 0.8,
                verifierTier: 'mid',
                modelId: 'm',
                tokensUsed: 100,
            });
        }

        expect(countRows(db, 'Notes/A.md')).toBe(5);
        const rows = db.exec('SELECT run_at FROM note_freshness_history WHERE path=? ORDER BY run_at ASC', ['Notes/A.md']);
        expect(rows[0].values[0][0]).toBe('2026-06-12T00:00:00Z');
    });

    it('drops rows older than 90 days on every insert', () => {
        // Pre-seed an old run directly (bypassing the retention sweep so it
        // exists when the next recordRun fires).
        db.run(
            `INSERT INTO note_freshness_history
             (path, run_at, verdict, confidence, verifier_tier, model_id, tokens_used)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['Notes/A.md', '2026-01-01T00:00:00Z', 'deckt-sich', 0.9, 'mid', 'm', 100],
        );
        expect(countRows(db, 'Notes/A.md')).toBe(1);

        // New run with current time -> the 169-day-old row above must be dropped
        store.recordRun({
            path: 'Notes/A.md',
            runAt: '2026-06-19T00:00:00Z',
            verdict: 'widerspricht',
            confidence: 0.6,
            verifierTier: 'mid',
            modelId: 'm',
            tokensUsed: 200,
            now: new Date('2026-06-19T00:00:00Z'),
        });

        expect(countRows(db, 'Notes/A.md')).toBe(1);
        const rows = db.exec('SELECT verdict FROM note_freshness_history WHERE path = ?', ['Notes/A.md']);
        expect(rows[0].values[0][0]).toBe('widerspricht');
    });

    it('retains rows isolated per path (Note B is unaffected by Note A retention)', () => {
        for (let i = 1; i <= 6; i++) {
            store.recordRun({
                path: 'Notes/A.md',
                runAt: `2026-06-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
                verdict: 'deckt-sich',
                confidence: 0.8,
                verifierTier: 'mid',
                modelId: 'm',
                tokensUsed: 100,
            });
        }
        store.recordRun({
            path: 'Notes/B.md',
            runAt: '2026-06-19T00:00:00Z',
            verdict: 'ergaenzt',
            confidence: 0.85,
            verifierTier: 'mid',
            modelId: 'm',
            tokensUsed: 100,
        });

        expect(countRows(db, 'Notes/A.md')).toBe(5);
        expect(countRows(db, 'Notes/B.md')).toBe(1);
    });

    it('accepts optional summary and sources without breaking retention', () => {
        store.recordRun({
            path: 'Notes/A.md',
            runAt: '2026-06-19T00:00:00Z',
            verdict: 'widerspricht',
            confidence: 0.75,
            verifierTier: 'frontier',
            modelId: 'claude-opus-4-7',
            tokensUsed: 12000,
            summary: 'Pricing widerspricht externer Quelle.',
            sources: ['https://example.com/pricing'],
        });

        const rows = db.exec(
            'SELECT summary, sources_json, verifier_tier FROM note_freshness_history WHERE path = ?',
            ['Notes/A.md'],
        );
        expect(rows[0].values[0][0]).toBe('Pricing widerspricht externer Quelle.');
        expect(JSON.parse(rows[0].values[0][1] as string)).toEqual(['https://example.com/pricing']);
        expect(rows[0].values[0][2]).toBe('frontier');
    });
});
