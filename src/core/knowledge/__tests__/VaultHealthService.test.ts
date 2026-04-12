import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

// ---------------------------------------------------------------------------
// In-memory DB setup
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL, vector BLOB NOT NULL,
    mtime INTEGER NOT NULL, enriched INTEGER NOT NULL DEFAULT 0,
    UNIQUE(path, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vectors_path ON vectors(path);
CREATE TABLE IF NOT EXISTS checkpoint (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL, target_path TEXT NOT NULL,
    link_type TEXT NOT NULL, property_name TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    UNIQUE(source_path, target_path, link_type, property_name)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_path);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_path);
CREATE TABLE IF NOT EXISTS tags (path TEXT NOT NULL, tag TEXT NOT NULL, UNIQUE(path, tag));
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE TABLE IF NOT EXISTS implicit_edges (
    source_path TEXT NOT NULL, target_path TEXT NOT NULL,
    similarity REAL NOT NULL, computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);
CREATE INDEX IF NOT EXISTS idx_implicit_source ON implicit_edges(source_path);
CREATE INDEX IF NOT EXISTS idx_implicit_target ON implicit_edges(target_path);
CREATE TABLE IF NOT EXISTS dismissed_pairs (
    path_a TEXT NOT NULL, path_b TEXT NOT NULL, dismissed_at TEXT NOT NULL,
    UNIQUE(path_a, path_b)
);
CREATE TABLE IF NOT EXISTS ontology (
    entity_path TEXT NOT NULL, cluster TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(entity_path, cluster)
);
CREATE TABLE IF NOT EXISTS note_freshness (
    path TEXT PRIMARY KEY, freshness_class TEXT NOT NULL DEFAULT 'stable',
    temporal_marker_count INTEGER NOT NULL DEFAULT 0, classified_at TEXT NOT NULL
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

function insertEdge(db: InstanceType<typeof SQL.Database>, source: string, target: string) {
    db.run(
        'INSERT OR IGNORE INTO edges (source_path, target_path, link_type, property_name, confidence) VALUES (?, ?, ?, ?, ?)',
        [source, target, 'body', null, 1.0],
    );
}

async function createHealthService(godNodeThreshold = 5) {
    if (!SQL) SQL = await initSqlJs();
    const db = new SQL.Database();
    for (const stmt of SCHEMA_DDL.split(';').map(s => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }
    db.run('INSERT INTO schema_meta VALUES (7)');

    const shim = {
        getDB: () => db,
        isOpen: () => true,
        markDirty: () => {},
    };

    const { VaultHealthService } = await import('../VaultHealthService');

    // Minimal App shim (vault.getMarkdownFiles not needed for god_nodes check)
    const appShim = { vault: { getMarkdownFiles: () => [] }, metadataCache: {} };
    const service = new VaultHealthService(appShim as never, shim as never);
    service.godNodeThreshold = godNodeThreshold;

    return { service, db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultHealthService', () => {
    describe('checkGodNodes', () => {
        it('should flag notes with connections above threshold', async () => {
            const { service, db } = await createHealthService(3);

            // hub.md gets 5 incoming edges (above threshold 3)
            insertEdge(db, 'a.md', 'hub.md');
            insertEdge(db, 'b.md', 'hub.md');
            insertEdge(db, 'c.md', 'hub.md');
            insertEdge(db, 'd.md', 'hub.md');
            insertEdge(db, 'e.md', 'hub.md');

            const findings = await service.runChecks(['god_nodes']);
            expect(findings.length).toBe(1);
            expect(findings[0].check).toBe('god_nodes');
            expect(findings[0].paths).toContain('hub.md');
            expect(findings[0].description).toContain('5');
        });

        it('should not flag notes below threshold', async () => {
            const { service, db } = await createHealthService(10);

            // hub.md gets 3 incoming edges (below threshold 10)
            insertEdge(db, 'a.md', 'hub.md');
            insertEdge(db, 'b.md', 'hub.md');
            insertEdge(db, 'c.md', 'hub.md');

            const findings = await service.runChecks(['god_nodes']);
            expect(findings.length).toBe(0);
        });

        it('should flag multiple god nodes sorted by degree', async () => {
            const { service, db } = await createHealthService(2);

            // hub1 gets 4, hub2 gets 3
            insertEdge(db, 'a.md', 'hub1.md');
            insertEdge(db, 'b.md', 'hub1.md');
            insertEdge(db, 'c.md', 'hub1.md');
            insertEdge(db, 'd.md', 'hub1.md');

            insertEdge(db, 'e.md', 'hub2.md');
            insertEdge(db, 'f.md', 'hub2.md');
            insertEdge(db, 'g.md', 'hub2.md');

            const findings = await service.runChecks(['god_nodes']);
            expect(findings.length).toBe(2);
            // Higher degree first (SQL ORDER BY in_degree DESC)
            expect(findings[0].paths[0]).toBe('hub1.md');
            expect(findings[1].paths[0]).toBe('hub2.md');
        });

        it('should return empty for graph with no edges', async () => {
            const { service } = await createHealthService(5);
            const findings = await service.runChecks(['god_nodes']);
            expect(findings.length).toBe(0);
        });
    });
});
