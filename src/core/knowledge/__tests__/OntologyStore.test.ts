import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

// ---------------------------------------------------------------------------
// In-memory DB setup (same pattern as GraphStore.test.ts)
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    UNIQUE(path, chunk_index)
);
CREATE TABLE IF NOT EXISTS checkpoint (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT NOT NULL,
    property_name TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    UNIQUE(source_path, target_path, link_type, property_name)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_path);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_path);
CREATE TABLE IF NOT EXISTS tags (path TEXT NOT NULL, tag TEXT NOT NULL, UNIQUE(path, tag));
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE TABLE IF NOT EXISTS ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_path, cluster)
);
CREATE INDEX IF NOT EXISTS idx_ontology_cluster ON ontology(cluster);
CREATE INDEX IF NOT EXISTS idx_ontology_entity ON ontology(entity_path);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function createOntologyStore() {
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
    const { OntologyStore } = await import('../OntologyStore');
    const store = new OntologyStore(shim as never);
    return { store, db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OntologyStore', () => {
    describe('replaceLouvainClusters', () => {
        it('should store louvain cluster entries', async () => {
            const { store } = await createOntologyStore();
            store.replaceLouvainClusters([
                { entityPath: 'a.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'b.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'c.md', cluster: 'louvain-1', role: 'member', confidence: 1.0, source: 'louvain' },
            ]);

            expect(store.getEntryCount()).toBe(3);
            expect(store.getClusterCount()).toBe(2);
        });

        it('should replace previous louvain entries on re-run', async () => {
            const { store } = await createOntologyStore();
            store.replaceLouvainClusters([
                { entityPath: 'a.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'b.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
            ]);
            expect(store.getEntryCount()).toBe(2);

            // Re-run with different data
            store.replaceLouvainClusters([
                { entityPath: 'x.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
            ]);
            expect(store.getEntryCount()).toBe(1);
        });

        it('should not affect MOC-sourced entries', async () => {
            const { store } = await createOntologyStore();
            // Add MOC entry first
            store.addEntry({
                entityPath: 'topic.md', cluster: 'topic.md', role: 'hub', confidence: 1.0, source: 'moc',
            });
            expect(store.getEntryCount()).toBe(1);

            // Add louvain entries
            store.replaceLouvainClusters([
                { entityPath: 'a.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
            ]);
            expect(store.getEntryCount()).toBe(2); // 1 moc + 1 louvain

            // Replace louvain -- MOC should survive
            store.replaceLouvainClusters([]);
            expect(store.getEntryCount()).toBe(1); // only MOC remains
        });

        it('should handle empty input gracefully', async () => {
            const { store } = await createOntologyStore();
            store.replaceLouvainClusters([]);
            expect(store.getEntryCount()).toBe(0);
        });
    });

    describe('getRelatedEntities', () => {
        it('should find entities in the same cluster', async () => {
            const { store } = await createOntologyStore();
            store.replaceLouvainClusters([
                { entityPath: 'a.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'b.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'c.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'd.md', cluster: 'louvain-1', role: 'member', confidence: 1.0, source: 'louvain' },
            ]);

            const related = store.getRelatedEntities('a.md');
            expect(related.length).toBe(2); // b.md and c.md (not a.md, not d.md)
            expect(related.map(r => r.entityPath).sort()).toEqual(['b.md', 'c.md']);
        });
    });

    describe('getAllClusters', () => {
        it('should return cluster summaries', async () => {
            const { store } = await createOntologyStore();
            store.replaceLouvainClusters([
                { entityPath: 'a.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'b.md', cluster: 'louvain-0', role: 'member', confidence: 1.0, source: 'louvain' },
                { entityPath: 'c.md', cluster: 'louvain-1', role: 'member', confidence: 1.0, source: 'louvain' },
            ]);

            const clusters = store.getAllClusters();
            expect(clusters.length).toBe(2);
            const big = clusters.find(c => c.memberCount === 2);
            expect(big).toBeDefined();
        });
    });
});
