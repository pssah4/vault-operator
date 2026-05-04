import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { MemorySourceStore } from '../MemorySourceStore';
import type { MemoryDB } from '../MemoryDB';
import type { SqlJsDatabase } from '../KnowledgeDB';

const SCHEMA = `
CREATE TABLE memory_source_notes (
    note_path TEXT PRIMARY KEY,
    last_extracted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0,
    fact_count INTEGER NOT NULL DEFAULT 0,
    marker_source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (dirty IN (0, 1)),
    CHECK (marker_source IN ('agent-tool', 'frontmatter', 'settings-list'))
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        isOpen: () => true,
        markDirty: () => undefined,
    } as unknown as MemoryDB;
}

describe('MemorySourceStore (FEAT-03-25 / ADR-109)', () => {
    let rawDb: SqlJsDatabase;
    let store: MemorySourceStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        rawDb.run(SCHEMA);
        store = new MemorySourceStore(makeFakeDB(rawDb));
    });

    it('upsert + isMemorySource + get', () => {
        expect(store.isMemorySource('Notes/A.md')).toBe(false);
        store.upsert('Notes/A.md', 'frontmatter');
        expect(store.isMemorySource('Notes/A.md')).toBe(true);

        const rec = store.get('Notes/A.md');
        expect(rec).not.toBeNull();
        expect(rec?.markerSource).toBe('frontmatter');
        expect(rec?.dirty).toBe(true);
        expect(rec?.factCount).toBe(0);
    });

    it('upsert is idempotent: only updates marker source if changed', () => {
        store.upsert('Notes/A.md', 'frontmatter');
        const before = store.get('Notes/A.md');
        store.upsert('Notes/A.md', 'agent-tool');
        const after = store.get('Notes/A.md');
        expect(after?.markerSource).toBe('agent-tool');
        // createdAt preserved
        expect(after?.createdAt).toBe(before?.createdAt);
    });

    it('remove returns true on first call, false on subsequent', () => {
        store.upsert('Notes/A.md', 'frontmatter');
        expect(store.remove('Notes/A.md')).toBe(true);
        expect(store.remove('Notes/A.md')).toBe(false);
        expect(store.isMemorySource('Notes/A.md')).toBe(false);
    });

    it('list returns DESC by created_at', () => {
        store.upsert('Notes/A.md', 'frontmatter');
        // brief timestamp gap not strictly needed since order is independent of equal ms
        store.upsert('Notes/B.md', 'agent-tool');
        const list = store.list();
        expect(list).toHaveLength(2);
        expect(list.map((r) => r.notePath).sort()).toEqual(['Notes/A.md', 'Notes/B.md']);
    });

    it('listDirty filters to dirty=1 only', () => {
        store.upsert('Notes/A.md', 'frontmatter');
        store.upsert('Notes/B.md', 'frontmatter');
        store.recordExtraction('Notes/A.md', 5);
        const dirty = store.listDirty();
        expect(dirty.map((r) => r.notePath)).toEqual(['Notes/B.md']);
    });

    it('recordExtraction updates lastExtractedAt + factCount + clears dirty', () => {
        store.upsert('Notes/A.md', 'frontmatter');
        store.recordExtraction('Notes/A.md', 3);
        const rec = store.get('Notes/A.md');
        expect(rec?.dirty).toBe(false);
        expect(rec?.factCount).toBe(3);
        expect(rec?.lastExtractedAt).not.toBeNull();
    });

    it('markDirty after extraction sets dirty=1 again (modify-Hook)', () => {
        store.upsert('Notes/A.md', 'frontmatter');
        store.recordExtraction('Notes/A.md', 2);
        expect(store.get('Notes/A.md')?.dirty).toBe(false);
        store.markDirty('Notes/A.md');
        expect(store.get('Notes/A.md')?.dirty).toBe(true);
    });

    it('rename moves the row to the new path (vault.on rename hook)', () => {
        store.upsert('Notes/Old.md', 'frontmatter');
        store.rename('Notes/Old.md', 'Notes/New.md');
        expect(store.get('Notes/Old.md')).toBeNull();
        expect(store.get('Notes/New.md')).not.toBeNull();
    });

    it('count returns total', () => {
        expect(store.count()).toBe(0);
        store.upsert('Notes/A.md', 'frontmatter');
        store.upsert('Notes/B.md', 'frontmatter');
        expect(store.count()).toBe(2);
    });
});
