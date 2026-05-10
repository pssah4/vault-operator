import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { VaultHealthService, type HealthCheckType } from '../VaultHealthService';
import type { KnowledgeDB } from '../KnowledgeDB';
import type { App } from 'obsidian';

/**
 * BA-25 PLAN-11 Lint-Foundation: Tests fuer cluster_freshness und
 * source_concentration Check-Types.
 */

type SqlJsDb = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, chunk_index INTEGER NOT NULL, text TEXT NOT NULL, vector BLOB NOT NULL, mtime INTEGER NOT NULL, enriched INTEGER NOT NULL DEFAULT 0, embedding_model TEXT NOT NULL DEFAULT 'unknown', UNIQUE(path, chunk_index));
CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source_path TEXT NOT NULL, target_path TEXT NOT NULL, link_type TEXT NOT NULL, property_name TEXT, confidence REAL NOT NULL DEFAULT 1.0, UNIQUE(source_path, target_path, link_type, property_name));
CREATE TABLE IF NOT EXISTS tags (path TEXT NOT NULL, tag TEXT NOT NULL, UNIQUE(path, tag));
CREATE TABLE IF NOT EXISTS implicit_edges (source_path TEXT NOT NULL, target_path TEXT NOT NULL, similarity REAL NOT NULL, computed_at TEXT NOT NULL, UNIQUE(source_path, target_path));
CREATE TABLE IF NOT EXISTS dismissed_pairs (path_a TEXT NOT NULL, path_b TEXT NOT NULL, dismissed_at TEXT NOT NULL, UNIQUE(path_a, path_b));
CREATE TABLE IF NOT EXISTS ontology (entity_path TEXT NOT NULL, cluster TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', confidence REAL NOT NULL DEFAULT 1.0, source TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(entity_path, cluster));
CREATE TABLE IF NOT EXISTS note_freshness (path TEXT PRIMARY KEY, freshness_class TEXT NOT NULL DEFAULT 'stable', temporal_marker_count INTEGER NOT NULL DEFAULT 0, classified_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dismissed_health_findings (check_type TEXT NOT NULL, path TEXT NOT NULL, dismissed_at TEXT NOT NULL, PRIMARY KEY (check_type, path));
CREATE TABLE IF NOT EXISTS cluster_source_stats (cluster TEXT NOT NULL, source_domain TEXT NOT NULL, note_count INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, PRIMARY KEY (cluster, source_domain));
CREATE TABLE IF NOT EXISTS cluster_metadata (cluster TEXT PRIMARY KEY, half_life_days INTEGER NOT NULL, custom_weights TEXT, last_external_check TEXT, last_hint_at TEXT, hot_cluster INTEGER NOT NULL DEFAULT 0);
`;

function makeMockKnowledgeDB(db: SqlJsDb): KnowledgeDB {
    return {
        isOpen: () => true,
        getDB: () => db as never,
        markDirty: () => {},
    } as unknown as KnowledgeDB;
}

function makeMockApp(): App {
    return { metadataCache: { getFileCache: () => null } } as never;
}

async function freshDB(): Promise<SqlJsDb> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(SCHEMA);
    return db;
}

describe('VaultHealthService BA-25 Checks', () => {
    let db: SqlJsDb;
    let svc: VaultHealthService;

    beforeEach(async () => {
        db = await freshDB();
        svc = new VaultHealthService(makeMockApp(), makeMockKnowledgeDB(db));
    });

    describe('cluster_freshness', () => {
        it('does not flag fresh cluster (recent mtime)', async () => {
            const now = Date.now();
            const recent = now - 10 * 86_400_000; // 10 days
            db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['Notes/A.md', 'Tech', 'member', 1.0, 'moc', new Date().toISOString()]);
            db.run(`INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)`, ['Notes/A.md', 0, 'x', new Uint8Array([1]), recent]);
            db.run(`INSERT INTO cluster_metadata (cluster, half_life_days) VALUES (?, ?)`, ['Tech', 180]);

            const findings = await svc.runChecks(['cluster_freshness']);
            expect(findings.length).toBe(0);
        });

        it('flags stale cluster (avg-age > halfLife)', async () => {
            const now = Date.now();
            const old = now - 400 * 86_400_000; // 400 days
            db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['Notes/A.md', 'Tech', 'member', 1.0, 'moc', new Date().toISOString()]);
            db.run(`INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)`, ['Notes/A.md', 0, 'x', new Uint8Array([1]), old]);
            db.run(`INSERT INTO cluster_metadata (cluster, half_life_days) VALUES (?, ?)`, ['Tech', 180]);

            const findings = await svc.runChecks(['cluster_freshness']);
            expect(findings.length).toBe(1);
            expect(findings[0].check).toBe('cluster_freshness');
            expect(findings[0].cluster).toBe('Tech');
            expect(findings[0].severity).toBe('high');
            expect(findings[0].metadata?.totalNotes).toBe(1);
        });

        it('uses 180-day default when cluster_metadata absent', async () => {
            const now = Date.now();
            const old = now - 200 * 86_400_000;
            db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['A.md', 'Unknown', 'member', 1.0, 'moc', new Date().toISOString()]);
            db.run(`INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)`, ['A.md', 0, 'x', new Uint8Array([1]), old]);

            const findings = await svc.runChecks(['cluster_freshness']);
            expect(findings.length).toBe(1);
            expect(findings[0].cluster).toBe('Unknown');
        });

        it('skips clusters with halfLife=0 (Personal)', async () => {
            const now = Date.now();
            const veryOld = now - 5000 * 86_400_000;
            db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['A.md', 'Personal', 'member', 1.0, 'moc', new Date().toISOString()]);
            db.run(`INSERT INTO vectors (path, chunk_index, text, vector, mtime) VALUES (?, ?, ?, ?, ?)`, ['A.md', 0, 'x', new Uint8Array([1]), veryOld]);
            db.run(`INSERT INTO cluster_metadata (cluster, half_life_days) VALUES (?, ?)`, ['Personal', 0]);

            const findings = await svc.runChecks(['cluster_freshness']);
            expect(findings.length).toBe(0);
        });
    });

    describe('source_concentration', () => {
        it('does not flag clusters below threshold', async () => {
            const ts = '2026-05-03T00:00:00Z';
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Tech', 'a.com', 3, ts, ts]);
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Tech', 'b.com', 3, ts, ts]);

            const findings = await svc.runChecks(['source_concentration']);
            expect(findings.length).toBe(0);
        });

        it('flags concentrated cluster (90% from one domain)', async () => {
            const ts = '2026-05-03T00:00:00Z';
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Tech', 'medium.com', 9, ts, ts]);
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Tech', 'github.com', 1, ts, ts]);

            const findings = await svc.runChecks(['source_concentration']);
            expect(findings.length).toBe(1);
            expect(findings[0].check).toBe('source_concentration');
            expect(findings[0].cluster).toBe('Tech');
            expect(findings[0].severity).toBe('high'); // 0.9 >= 0.85
            expect(findings[0].metadata?.dominantDomain).toBe('medium.com');
            expect(findings[0].metadata?.concentrationScore).toBe(0.9);
        });

        it('respects minimum-notes threshold (5)', async () => {
            const ts = '2026-05-03T00:00:00Z';
            // 3 notes alle aus medium.com -> Konzentration 1.0 aber unter min-notes 5
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Lit', 'medium.com', 3, ts, ts]);
            const findings = await svc.runChecks(['source_concentration']);
            expect(findings.length).toBe(0);
        });

        it('marks medium severity at 0.7-0.85', async () => {
            const ts = '2026-05-03T00:00:00Z';
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Tech', 'medium.com', 7, ts, ts]);
            db.run(`INSERT INTO cluster_source_stats VALUES (?, ?, ?, ?, ?)`, ['Tech', 'github.com', 3, ts, ts]);

            const findings = await svc.runChecks(['source_concentration']);
            expect(findings.length).toBe(1);
            expect(findings[0].severity).toBe('medium');
        });
    });

    it('runs both BA-25 checks together with existing checks', async () => {
        // No data -> no findings, but no errors
        const allChecks: HealthCheckType[] = ['cluster_freshness', 'source_concentration'];
        const findings = await svc.runChecks(allChecks);
        expect(findings).toEqual([]);
    });
});
