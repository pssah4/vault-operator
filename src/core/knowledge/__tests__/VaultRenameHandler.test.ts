import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';
import { VaultRenameHandler } from '../VaultRenameHandler';
import type { KnowledgeDB } from '../KnowledgeDB';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

/**
 * Build the v9-shape tables that the cascade touches. We cover the union of
 * column names so each branch of VaultRenameHandler is exercised once.
 */
async function freshDB() {
    const SQL = await getSQL();
    const db = new SQL.Database();
    db.run('CREATE TABLE vectors (id INTEGER PRIMARY KEY, path TEXT, chunk_index INTEGER, UNIQUE(path, chunk_index))');
    db.run('CREATE TABLE edges (source_path TEXT, target_path TEXT, link_type TEXT)');
    db.run('CREATE TABLE implicit_edges (source_path TEXT, target_path TEXT, similarity REAL, computed_at TEXT)');
    db.run('CREATE TABLE tags (path TEXT, tag TEXT)');
    db.run('CREATE TABLE ontology (entity_path TEXT, cluster TEXT, role TEXT, confidence REAL, source TEXT, updated_at TEXT)');
    db.run('CREATE TABLE note_freshness (path TEXT PRIMARY KEY, freshness_class TEXT, temporal_marker_count INTEGER, classified_at TEXT)');
    return db;
}

function fakeKnowledgeDB(db: ReturnType<typeof SQL.Database.prototype.constructor>): KnowledgeDB {
    let dirty = false;
    return {
        isOpen: () => true,
        getDB: () => db,
        markDirty: () => { dirty = true; },
        // Test-only hook: verify dirty was set
        wasDirty: () => dirty,
    } as unknown as KnowledgeDB;
}

describe('VaultRenameHandler.cascadeFileRename', () => {
    it('updates raw vault paths across every path-bearing table', async () => {
        const db = await freshDB();
        const handler = new VaultRenameHandler(fakeKnowledgeDB(db));

        const old = 'notes/old.md';
        const next = 'notes/new.md';
        db.run('INSERT INTO vectors (path, chunk_index) VALUES (?, ?)', [old, 0]);
        db.run('INSERT INTO edges (source_path, target_path, link_type) VALUES (?, ?, ?)', [old, 'other.md', 'link']);
        db.run('INSERT INTO edges (source_path, target_path, link_type) VALUES (?, ?, ?)', ['other.md', old, 'link']);
        db.run('INSERT INTO implicit_edges (source_path, target_path, similarity, computed_at) VALUES (?, ?, ?, ?)', [old, 'x.md', 0.5, '2025-01-01']);
        db.run('INSERT INTO tags (path, tag) VALUES (?, ?)', [old, 'idea']);
        db.run('INSERT INTO ontology (entity_path, cluster, role, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [old, 'C', 'member', 1.0, 'auto', '2025-01-01']);
        db.run('INSERT INTO note_freshness (path, freshness_class, temporal_marker_count, classified_at) VALUES (?, ?, ?, ?)', [old, 'stable', 0, '2025-01-01']);

        const results = handler.cascadeFileRename(old, next);

        const oldRefs = db.exec(`
            SELECT 'vectors' AS t FROM vectors WHERE path = '${old}'
            UNION ALL SELECT 'edges-src' FROM edges WHERE source_path = '${old}'
            UNION ALL SELECT 'edges-tgt' FROM edges WHERE target_path = '${old}'
            UNION ALL SELECT 'implicit' FROM implicit_edges WHERE source_path = '${old}'
            UNION ALL SELECT 'tags' FROM tags WHERE path = '${old}'
            UNION ALL SELECT 'onto' FROM ontology WHERE entity_path = '${old}'
            UNION ALL SELECT 'fresh' FROM note_freshness WHERE path = '${old}'
        `);
        expect(oldRefs.length === 0 || oldRefs[0].values.length === 0).toBe(true);

        expect(db.exec('SELECT path FROM vectors')[0].values[0][0]).toBe(next);
        expect(db.exec('SELECT tag FROM tags WHERE path = ?', [next])[0].values[0][0]).toBe('idea');

        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(r.rowsAffected).toBeGreaterThan(0);
        }

        db.close();
    });

    it('is a no-op when oldPath equals newPath', async () => {
        const db = await freshDB();
        const handler = new VaultRenameHandler(fakeKnowledgeDB(db));
        const results = handler.cascadeFileRename('foo.md', 'foo.md');
        expect(results).toEqual([]);
        db.close();
    });
});

describe('VaultRenameHandler.cascadeFolderRename', () => {
    it('rewrites every descendant via a single LIKE-prefix UPDATE per table', async () => {
        const db = await freshDB();
        const handler = new VaultRenameHandler(fakeKnowledgeDB(db));

        for (let i = 0; i < 100; i++) {
            db.run('INSERT INTO vectors (path, chunk_index) VALUES (?, ?)', [`projects/old/n${i}.md`, 0]);
        }
        db.run('INSERT INTO vectors (path, chunk_index) VALUES (?, ?)', ['other/keep.md', 0]);

        const start = Date.now();
        const results = handler.cascadeFolderRename('projects/old', 'projects/new');
        const elapsed = Date.now() - start;

        const moved = db.exec("SELECT COUNT(*) FROM vectors WHERE path LIKE 'projects/new/%'");
        expect(moved[0].values[0][0]).toBe(100);
        const stayed = db.exec("SELECT path FROM vectors WHERE path = 'other/keep.md'");
        expect(stayed[0].values).toHaveLength(1);
        const oldRefs = db.exec("SELECT COUNT(*) FROM vectors WHERE path LIKE 'projects/old/%'");
        expect(oldRefs[0].values[0][0]).toBe(0);

        const vectorsResult = results.find((r) => r.table === 'vectors');
        expect(vectorsResult?.rowsAffected).toBe(100);

        expect(elapsed).toBeLessThan(500);

        db.close();
    });

    it('handles trailing slashes gracefully', async () => {
        const db = await freshDB();
        const handler = new VaultRenameHandler(fakeKnowledgeDB(db));
        db.run('INSERT INTO vectors (path, chunk_index) VALUES (?, ?)', ['a/b/c.md', 0]);

        handler.cascadeFolderRename('a/', 'z/');

        const moved = db.exec("SELECT path FROM vectors");
        expect(moved[0].values[0][0]).toBe('z/b/c.md');
        db.close();
    });
});
