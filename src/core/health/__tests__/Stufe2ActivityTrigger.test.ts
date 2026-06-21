/**
 * Regression-tests for FIX-19-19-01 (Stufe2 SQL crash).
 *
 * The audit confirmed `AVG(MAX(mtime))` in computeAvgAge is invalid
 * SQL (sql.js: "misuse of aggregate function MAX()"). The outer aggregate
 * crashes synchronously and the bug surfaces only when the user has activity
 * in a cluster that triggers maybeHint. This test pins:
 *
 *   1. computeAvgAge returns a finite age value when called against a real
 *      sql.js DB with a populated vectors table (no crash).
 *   2. maybeHint catches DB errors and returns false instead of leaking
 *      an unhandled rejection into the Obsidian event loop.
 *
 * Both invariants were violated before the fix.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import { TFile, type App } from 'obsidian';
import type { ClusterMetadataStore } from '../../knowledge/ClusterMetadataStore';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';
import { Stufe2ActivityTrigger } from '../Stufe2ActivityTrigger';

interface SqlDb {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const DDL = `
CREATE TABLE vectors (path TEXT, mtime INTEGER);
CREATE TABLE ontology (entity_path TEXT, cluster TEXT, confidence REAL);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs();
});

function makeKnowledgeDB(db: SqlDb): KnowledgeDB {
    return {
        isOpen: () => true,
        getDB: () => db as unknown as ReturnType<KnowledgeDB['getDB']>,
    } as unknown as KnowledgeDB;
}

function makeMetadataStore(meta: { halfLifeDays: number; lastHintAt?: string; lastExternalCheck?: string } | null): ClusterMetadataStore {
    return {
        get: () => meta,
        setLastHintAt: vi.fn(),
    } as unknown as ClusterMetadataStore;
}

function makeFile(path: string): TFile {
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- test factory
    const f = Object.create(TFile.prototype) as TFile;
    Object.assign(f, { path, basename: path.replace(/\.md$/, ''), extension: 'md' });
    return f;
}

function makeApp(): App {
    return { workspace: { on: vi.fn(), offref: vi.fn() }, vault: { on: vi.fn(), offref: vi.fn() } } as unknown as App;
}

describe('Stufe2ActivityTrigger (FIX-19-19-01)', () => {
    it('computeAvgAge does NOT crash against a real sql.js vectors table', () => {
        const db = new SQL.Database() as unknown as SqlDb;
        db.run(DDL);
        const now = Date.now();
        db.run(`INSERT INTO vectors VALUES ('Notes/a.md', ${now - 5 * 86_400_000})`);
        db.run(`INSERT INTO vectors VALUES ('Notes/a.md', ${now - 3 * 86_400_000})`);
        db.run(`INSERT INTO vectors VALUES ('Notes/b.md', ${now - 7 * 86_400_000})`);
        db.run(`INSERT INTO ontology (entity_path, cluster, confidence) VALUES ('Notes/source.md', 'Tech', 1.0)`);

        const knowledgeDB = makeKnowledgeDB(db);
        const meta = { halfLifeDays: 14, lastExternalCheck: new Date(now - 60 * 86_400_000).toISOString() };
        const metaStore = makeMetadataStore(meta);
        const onHint = vi.fn();

        const trigger = new Stufe2ActivityTrigger(makeApp(), knowledgeDB, metaStore, onHint, { enabled: true });

        // Direct access via cast keeps the test focused on computeAvgAge
        const avg = (trigger as unknown as { computeAvgAge(paths: string[]): number })
            .computeAvgAge(['Notes/a.md', 'Notes/b.md']);

        // Age is a positive day-count (days since the average max-mtime).
        // Pre-fix, this call threw `misuse of aggregate function MAX()`.
        expect(Number.isFinite(avg)).toBe(true);
        expect(avg).toBeGreaterThan(0);
        expect(avg).toBeLessThan(100);

        db.close();
    });

    it('maybeHint returns false (not throws) when the underlying DB call fails', async () => {
        // KnowledgeDB whose exec always throws -- simulates corrupt or closed-mid-call DB.
        const throwingDB: KnowledgeDB = {
            isOpen: () => true,
            getDB: () => ({
                exec: () => {
                    throw new Error('simulated SQL crash');
                },
            }),
        } as unknown as KnowledgeDB;
        const meta = { halfLifeDays: 14, lastExternalCheck: new Date(Date.now() - 60 * 86_400_000).toISOString() };
        const trigger = new Stufe2ActivityTrigger(
            makeApp(),
            throwingDB,
            makeMetadataStore(meta),
            vi.fn(),
            { enabled: true },
        );

        // Pre-fix, the throw inside computeAvgAge / fetchClusterMembers propagates
        // out of maybeHint as an unhandled promise rejection. Post-fix, the function
        // logs and returns false.
        const result = await trigger.maybeHint(makeFile('Notes/x.md'));
        expect(result).toBe(false);
    });
});
