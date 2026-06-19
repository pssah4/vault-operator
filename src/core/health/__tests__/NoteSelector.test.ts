import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

import { NoteSelector, type NoteSelectorSettings } from '../NoteSelector';

/**
 * Tests for IMP-20-06-01 Wave 2 task W2-T2.
 *
 * NoteSelector picks candidate notes per cluster using:
 * - note_freshness.freshness_class as priority signal
 * - last_checked_at as cooldown filter
 * - dismissed_freshness with hint_type='verdict' as user-override filter
 * - settings.excludePaths as conservative path-prefix exclusion
 *
 * Per-cluster cap defaults to 5 (top-N).
 */

interface Database {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const V11_DDL = `
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
CREATE TABLE IF NOT EXISTS dismissed_freshness (
    note_path TEXT NOT NULL,
    hint_type TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(note_path, hint_type)
);
CREATE TABLE IF NOT EXISTS ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL,
    role TEXT,
    confidence REAL DEFAULT 1.0,
    source TEXT
);
INSERT INTO schema_meta VALUES (11);
`;

async function makeDb(): Promise<Database> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(V11_DDL);
    return db;
}

function seedNote(
    db: Database,
    path: string,
    cluster: string,
    freshnessClass: 'volatile' | 'evolving' | 'stable',
    lastCheckedAt: string | null = null,
): void {
    db.run(
        'INSERT INTO ontology (entity_path, cluster) VALUES (?, ?)',
        [path, cluster],
    );
    db.run(
        `INSERT INTO note_freshness (path, freshness_class, classified_at, last_checked_at)
         VALUES (?, ?, ?, ?)`,
        [path, freshnessClass, '2026-06-19T00:00:00Z', lastCheckedAt],
    );
}

function seedDismissal(db: Database, notePath: string): void {
    db.run(
        `INSERT INTO dismissed_freshness (note_path, hint_type, dismissed_at)
         VALUES (?, ?, ?)`,
        [notePath, 'verdict', '2026-06-19T00:00:00Z'],
    );
}

const DEFAULT_SETTINGS: NoteSelectorSettings = {
    topN: 5,
    excludePaths: ['Private/', 'Personal/', 'Medical/', 'Clients/'],
    volatileRecheckDays: 7,
    evolvingRecheckDays: 30,
    stableRecheckDays: 90,
};

describe('NoteSelector (IMP-20-06-01 W2-T2)', () => {
    let db: Database;
    let selector: NoteSelector;

    beforeEach(async () => {
        db = await makeDb();
        selector = new NoteSelector(db, DEFAULT_SETTINGS);
    });

    it('prioritises volatile over evolving over stable within the same cluster', () => {
        seedNote(db, 'Notes/v1.md', 'pricing', 'volatile');
        seedNote(db, 'Notes/v2.md', 'pricing', 'volatile');
        seedNote(db, 'Notes/e1.md', 'pricing', 'evolving');
        seedNote(db, 'Notes/s1.md', 'pricing', 'stable');

        const picked = selector.pickCandidates('pricing', new Date('2026-06-19T00:00:00Z'));

        expect(picked.map((n) => n.path)).toEqual(['Notes/v1.md', 'Notes/v2.md', 'Notes/e1.md', 'Notes/s1.md']);
        expect(picked[0].freshnessClass).toBe('volatile');
    });

    it('respects topN cap', () => {
        for (let i = 1; i <= 10; i++) {
            seedNote(db, `Notes/v${i}.md`, 'pricing', 'volatile');
        }

        const picked = selector.pickCandidates('pricing', new Date('2026-06-19T00:00:00Z'));

        expect(picked).toHaveLength(5);
    });

    it('skips notes that were recently checked (volatile recheck after 7 days)', () => {
        seedNote(db, 'Notes/recent.md', 'pricing', 'volatile', '2026-06-15T00:00:00Z'); // 4 days ago
        seedNote(db, 'Notes/stale.md', 'pricing', 'volatile', '2026-06-01T00:00:00Z'); // 18 days ago

        const picked = selector.pickCandidates('pricing', new Date('2026-06-19T00:00:00Z'));

        expect(picked.map((n) => n.path)).toEqual(['Notes/stale.md']);
    });

    it('filters out paths in dismissed_freshness with hint_type=verdict', () => {
        seedNote(db, 'Notes/keep.md', 'pricing', 'volatile');
        seedNote(db, 'Notes/dismissed.md', 'pricing', 'volatile');
        seedDismissal(db, 'Notes/dismissed.md');

        const picked = selector.pickCandidates('pricing', new Date('2026-06-19T00:00:00Z'));

        expect(picked.map((n) => n.path)).toEqual(['Notes/keep.md']);
    });

    it('excludes paths matching settings.excludePaths prefixes', () => {
        seedNote(db, 'Notes/public.md', 'pricing', 'volatile');
        seedNote(db, 'Private/secret.md', 'pricing', 'volatile');
        seedNote(db, 'Medical/labs.md', 'pricing', 'volatile');

        const picked = selector.pickCandidates('pricing', new Date('2026-06-19T00:00:00Z'));

        expect(picked.map((n) => n.path)).toEqual(['Notes/public.md']);
    });

    it('returns empty list when no candidates exist in cluster', () => {
        seedNote(db, 'Notes/x.md', 'other-cluster', 'volatile');

        const picked = selector.pickCandidates('pricing', new Date('2026-06-19T00:00:00Z'));

        expect(picked).toEqual([]);
    });
});
