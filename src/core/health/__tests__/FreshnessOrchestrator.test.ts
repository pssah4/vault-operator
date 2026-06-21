import { describe, it, expect, vi } from 'vitest';
import initSqlJs from 'sql.js';

import { FreshnessOrchestrator } from '../FreshnessOrchestrator';
import { FreshnessQueryBuilder } from '../FreshnessQueryBuilder';
import { FreshnessVerifier } from '../FreshnessVerifier';
import { FreshnessWebSearch } from '../FreshnessWebSearch';
import { NoteFreshnessHistoryStore } from '../NoteFreshnessHistoryStore';
import { NoteSelector } from '../NoteSelector';
import type { VerifierProvider } from '../FreshnessVerifier';

/**
 * IMP-20-06-01 W2-T5 end-to-end (in-memory).
 *
 * Verifies the per-cluster pipeline: selector → query → web search →
 * verifier → history + note_freshness mirror. Uses an in-memory
 * sql.js DB with the v11 schema slice.
 */

interface Db {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const V11_DDL = `
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
CREATE TABLE dismissed_freshness (
    note_path TEXT NOT NULL,
    hint_type TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(note_path, hint_type)
);
CREATE TABLE ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL
);
`;

async function makeDb(): Promise<Db> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(V11_DDL);
    return db;
}

const FAKE_VERDICT_PROVIDER: VerifierProvider = {
    midModelId: 'haiku-test',
    frontierModelId: 'opus-test',
    hasZdrCapability: () => false,
    callMidTier: async () => ({
        verdict: 'matches',
        confidence: 0.9,
        summary: 'agrees with sources',
        sources: ['https://example.com/a'],
        tokensUsed: 120,
    }),
    callFrontier: async () => ({
        verdict: 'contradicts',
        confidence: 0.95,
        summary: 'contradicts',
        sources: ['https://example.com/b'],
        tokensUsed: 300,
    }),
};

describe('FreshnessOrchestrator (IMP-20-06-01 W2-T5)', () => {
    it('runs the full pipeline and writes mirror + history', async () => {
        const db = await makeDb();

        db.run('INSERT INTO ontology (entity_path, cluster) VALUES (?, ?)', ['Notes/x.md', 'pricing']);
        db.run(
            'INSERT INTO note_freshness (path, freshness_class, classified_at) VALUES (?, ?, ?)',
            ['Notes/x.md', 'volatile', '2026-06-19T00:00:00Z'],
        );

        const verifier = new FreshnessVerifier(FAKE_VERDICT_PROVIDER, {
            allowFrontierEscalation: false,
            frontierConfidenceThreshold: 0.7,
            frontierSeverityFilter: [],
        });
        const orchestrator = new FreshnessOrchestrator({
            selector: new NoteSelector(db, {
                topN: 5,
                excludePaths: [],
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
            }),
            queryBuilder: new FreshnessQueryBuilder(),
            webSearch: new FreshnessWebSearch({
                externalSourcesEnabled: true,
                provider: 'brave',
                apiKey: 'k',
                search: vi.fn().mockResolvedValue([{ title: 't', url: 'https://example.com/a', snippet: 's' }]),
            }),
            verifier,
            history: new NoteFreshnessHistoryStore(db),
            db,
            readNoteBody: async () => '# OpenAI Pricing\n\nNote body.',
            now: () => new Date('2026-06-19T10:00:00Z'),
        });

        const result = await orchestrator.runForCluster('pricing');

        expect(result.verdicts).toHaveLength(1);
        expect(result.verdicts[0].verdict).toBe('matches');
        expect(result.tokensUsed).toBe(120);

        const mirror = db.exec('SELECT last_verdict, last_confidence, last_verifier_tier FROM note_freshness WHERE path = ?', ['Notes/x.md']);
        expect(mirror[0].values[0]).toEqual(['matches', 0.9, 'mid']);

        const history = db.exec('SELECT verdict, confidence FROM note_freshness_history WHERE path = ?', ['Notes/x.md']);
        expect(history[0].values).toHaveLength(1);
        expect(history[0].values[0]).toEqual(['matches', 0.9]);
    });

    it('audit M-3: returns empty result when enabled() returns false, never touches the DB', async () => {
        const db = await makeDb();
        db.run('INSERT INTO ontology (entity_path, cluster) VALUES (?, ?)', ['Notes/x.md', 'p']);
        db.run(
            'INSERT INTO note_freshness (path, freshness_class, classified_at) VALUES (?, ?, ?)',
            ['Notes/x.md', 'volatile', '2026-06-19T00:00:00Z'],
        );
        const searchSpy = vi.fn();
        const readSpy = vi.fn();

        const orchestrator = new FreshnessOrchestrator({
            selector: new NoteSelector(db, {
                topN: 5,
                excludePaths: [],
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
            }),
            queryBuilder: new FreshnessQueryBuilder(),
            webSearch: new FreshnessWebSearch({
                externalSourcesEnabled: true,
                provider: 'brave',
                apiKey: 'k',
                search: searchSpy,
            }),
            verifier: new FreshnessVerifier(FAKE_VERDICT_PROVIDER, {
                allowFrontierEscalation: false,
                frontierConfidenceThreshold: 0.7,
                frontierSeverityFilter: [],
            }),
            history: new NoteFreshnessHistoryStore(db),
            db,
            readNoteBody: readSpy,
            enabled: () => false,
            now: () => new Date('2026-06-19T10:00:00Z'),
        });

        const result = await orchestrator.runForCluster('p');
        expect(result).toEqual({ verdicts: [], tokensUsed: 0 });
        expect(searchSpy).not.toHaveBeenCalled();
        expect(readSpy).not.toHaveBeenCalled();

        const mirror = db.exec('SELECT last_verdict FROM note_freshness WHERE path = ?', ['Notes/x.md']);
        expect(mirror[0].values[0][0]).toBeNull();
        const history = db.exec('SELECT COUNT(*) FROM note_freshness_history');
        expect(history[0].values[0][0]).toBe(0);
    });

    it('returns empty result when the cluster has no candidates', async () => {
        const db = await makeDb();
        const orchestrator = new FreshnessOrchestrator({
            selector: new NoteSelector(db, {
                topN: 5,
                excludePaths: [],
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
            }),
            queryBuilder: new FreshnessQueryBuilder(),
            webSearch: new FreshnessWebSearch({
                externalSourcesEnabled: true,
                provider: 'brave',
                apiKey: 'k',
                search: vi.fn(),
            }),
            verifier: new FreshnessVerifier(FAKE_VERDICT_PROVIDER, {
                allowFrontierEscalation: false,
                frontierConfidenceThreshold: 0.7,
                frontierSeverityFilter: [],
            }),
            history: new NoteFreshnessHistoryStore(db),
            db,
            readNoteBody: async () => '',
            now: () => new Date('2026-06-19T10:00:00Z'),
        });

        const result = await orchestrator.runForCluster('empty');
        expect(result).toEqual({ verdicts: [], tokensUsed: 0 });
    });

    it('persists each verdict in the same run (multi-row mirror + history)', async () => {
        const db = await makeDb();
        for (const p of ['Notes/a.md', 'Notes/b.md', 'Notes/c.md']) {
            db.run('INSERT INTO ontology (entity_path, cluster) VALUES (?, ?)', [p, 'multi']);
            db.run(
                'INSERT INTO note_freshness (path, freshness_class, classified_at) VALUES (?, ?, ?)',
                [p, 'volatile', '2026-06-19T00:00:00Z'],
            );
        }

        const verifier = new FreshnessVerifier(FAKE_VERDICT_PROVIDER, {
            allowFrontierEscalation: false,
            frontierConfidenceThreshold: 0.7,
            frontierSeverityFilter: [],
        });
        const orchestrator = new FreshnessOrchestrator({
            selector: new NoteSelector(db, {
                topN: 5,
                excludePaths: [],
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
            }),
            queryBuilder: new FreshnessQueryBuilder(),
            webSearch: new FreshnessWebSearch({
                externalSourcesEnabled: true,
                provider: 'brave',
                apiKey: 'k',
                search: vi.fn().mockResolvedValue([]),
            }),
            verifier,
            history: new NoteFreshnessHistoryStore(db),
            db,
            readNoteBody: async (p) => `# Body ${p}`,
            now: () => new Date('2026-06-19T10:00:00Z'),
        });

        const result = await orchestrator.runForCluster('multi');

        expect(result.verdicts.map((v) => v.path)).toEqual(['Notes/a.md', 'Notes/b.md', 'Notes/c.md']);

        const mirror = db.exec('SELECT COUNT(*) FROM note_freshness WHERE last_verdict IS NOT NULL');
        expect(mirror[0].values[0][0]).toBe(3);

        const history = db.exec('SELECT COUNT(*) FROM note_freshness_history');
        expect(history[0].values[0][0]).toBe(3);
    });

    it('escalates to frontier when verifier settings allow it under ZDR', async () => {
        const db = await makeDb();
        db.run('INSERT INTO ontology (entity_path, cluster) VALUES (?, ?)', ['Notes/x.md', 'pricing']);
        db.run(
            'INSERT INTO note_freshness (path, freshness_class, classified_at) VALUES (?, ?, ?)',
            ['Notes/x.md', 'volatile', '2026-06-19T00:00:00Z'],
        );

        const escalatingProvider: VerifierProvider = {
            midModelId: 'haiku-test',
            frontierModelId: 'opus-test',
            hasZdrCapability: () => true,
            callMidTier: async () => ({
                verdict: 'contradicts',
                confidence: 0.4,
                summary: 'unsure',
                sources: [],
                tokensUsed: 100,
            }),
            callFrontier: async () => ({
                verdict: 'contradicts',
                confidence: 0.92,
                summary: 'confirmed contradiction',
                sources: ['https://example.com/x'],
                tokensUsed: 500,
            }),
        };

        const orchestrator = new FreshnessOrchestrator({
            selector: new NoteSelector(db, {
                topN: 5,
                excludePaths: [],
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
            }),
            queryBuilder: new FreshnessQueryBuilder(),
            webSearch: new FreshnessWebSearch({
                externalSourcesEnabled: true,
                provider: 'brave',
                apiKey: 'k',
                search: vi.fn().mockResolvedValue([{ title: 't', url: 'https://example.com/x', snippet: 's' }]),
            }),
            verifier: new FreshnessVerifier(escalatingProvider, {
                allowFrontierEscalation: true,
                frontierConfidenceThreshold: 0.7,
                frontierSeverityFilter: ['contradicts'],
            }),
            history: new NoteFreshnessHistoryStore(db),
            db,
            readNoteBody: async () => '# OpenAI Pricing',
            now: () => new Date('2026-06-19T10:00:00Z'),
        });

        const result = await orchestrator.runForCluster('pricing');

        expect(result.verdicts).toHaveLength(1);
        expect(result.verdicts[0].verifierTier).toBe('frontier');
        expect(result.verdicts[0].confidence).toBe(0.92);
        expect(result.tokensUsed).toBe(600);

        const mirror = db.exec(
            'SELECT last_verifier_tier, last_confidence FROM note_freshness WHERE path = ?',
            ['Notes/x.md'],
        );
        expect(mirror[0].values[0]).toEqual(['frontier', 0.92]);
    });

    it('skips notes whose body cannot be read', async () => {
        const db = await makeDb();
        db.run('INSERT INTO ontology (entity_path, cluster) VALUES (?, ?)', ['Notes/missing.md', 'c']);
        db.run(
            'INSERT INTO note_freshness (path, freshness_class, classified_at) VALUES (?, ?, ?)',
            ['Notes/missing.md', 'volatile', '2026-06-19T00:00:00Z'],
        );

        const orchestrator = new FreshnessOrchestrator({
            selector: new NoteSelector(db, {
                topN: 5,
                excludePaths: [],
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
            }),
            queryBuilder: new FreshnessQueryBuilder(),
            webSearch: new FreshnessWebSearch({
                externalSourcesEnabled: true,
                provider: 'brave',
                apiKey: 'k',
                search: vi.fn(),
            }),
            verifier: new FreshnessVerifier(FAKE_VERDICT_PROVIDER, {
                allowFrontierEscalation: false,
                frontierConfidenceThreshold: 0.7,
                frontierSeverityFilter: [],
            }),
            history: new NoteFreshnessHistoryStore(db),
            db,
            readNoteBody: async () => null,
            now: () => new Date('2026-06-19T10:00:00Z'),
        });

        const result = await orchestrator.runForCluster('c');
        expect(result.verdicts).toEqual([]);
    });
});
