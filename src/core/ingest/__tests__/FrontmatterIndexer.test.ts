import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { FrontmatterIndexer, readFrontmatterSummary, readMemorySourceMarker } from '../FrontmatterIndexer';
import { NoteSummaryStore } from '../../knowledge/NoteSummaryStore';
import { FrontmatterPropertyStore } from '../../knowledge/FrontmatterPropertyStore';
import { MemorySourceStore } from '../../knowledge/MemorySourceStore';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';
import type { MemoryDB } from '../../knowledge/MemoryDB';

type SqlJsDb = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS note_summaries (note_path TEXT PRIMARY KEY, summary TEXT NOT NULL, summary_model TEXT NOT NULL, summarized_at TEXT NOT NULL, source_mtime INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS frontmatter_properties (note_path TEXT NOT NULL, property_name TEXT NOT NULL, property_value TEXT NOT NULL, list_index INTEGER NOT NULL DEFAULT 0, UNIQUE(note_path, property_name, list_index));
`;

function makeMockKnowledgeDB(db: SqlJsDb): KnowledgeDB {
    return {
        isOpen: () => true,
        getDB: () => db as never,
        markDirty: () => {},
    } as unknown as KnowledgeDB;
}

function makeMockApp(metadata: Record<string, { frontmatter?: Record<string, unknown> }>, vaultContent: Record<string, string> = {}) {
    return {
        metadataCache: {
            getFileCache: (file: { path: string }) => metadata[file.path] ?? null,
        },
        vault: {
            cachedRead: async (file: { path: string }) => vaultContent[file.path] ?? '',
        },
    } as never;
}

function makeFile(path: string, mtime: number) {
    return { path, stat: { mtime } } as never;
}

async function freshStores() {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(SCHEMA);
    const knowledgeDB = makeMockKnowledgeDB(db);
    return {
        knowledgeDB,
        noteSummaryStore: new NoteSummaryStore(knowledgeDB),
        frontmatterPropertyStore: new FrontmatterPropertyStore(knowledgeDB),
        db,
    };
}

describe('readFrontmatterSummary', () => {
    it('reads Zusammenfassung property', () => {
        expect(readFrontmatterSummary({ Zusammenfassung: 'Eine Zusammenfassung.' })).toBe('Eine Zusammenfassung.');
    });
    it('falls back to summary property', () => {
        expect(readFrontmatterSummary({ summary: 'A summary.' })).toBe('A summary.');
    });
    it('returns null on empty / missing', () => {
        expect(readFrontmatterSummary({})).toBeNull();
        expect(readFrontmatterSummary({ Zusammenfassung: '' })).toBeNull();
        expect(readFrontmatterSummary({ Zusammenfassung: '   ' })).toBeNull();
    });
});

describe('FrontmatterIndexer', () => {
    let stores: Awaited<ReturnType<typeof freshStores>>;
    beforeEach(async () => {
        stores = await freshStores();
    });

    it('mirrors properties and adopts existing Frontmatter-Summary', async () => {
        const app = makeMockApp({
            'A.md': { frontmatter: { Zusammenfassung: 'Eine kurze Note.', tags: ['a', 'b'], Themen: ['AI'] } },
        });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore);
        const result = await indexer.indexNote(makeFile('A.md', 1000));

        expect(result.summaryUpdated).toBe(true);
        expect(result.summaryGenerated).toBe(false);
        expect(result.propertiesMirrored).toBe(true);

        expect(stores.noteSummaryStore.get('A.md')?.summary).toBe('Eine kurze Note.');
        expect(stores.noteSummaryStore.get('A.md')?.summaryModel).toBe('frontmatter');
        const props = stores.frontmatterPropertyStore.getForNote('A.md');
        expect(props.tags).toEqual(['a', 'b']);
        expect(props.Themen).toEqual(['AI']);
    });

    it('skips re-index when mtime unchanged and summary already in cache', async () => {
        const app = makeMockApp({
            'A.md': { frontmatter: { Zusammenfassung: 'Bestand.' } },
        });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore);
        await indexer.indexNote(makeFile('A.md', 5000));
        const result = await indexer.indexNote(makeFile('A.md', 5000));
        expect(result.skipped).toBe(true);
    });

    it('re-indexes when mtime changes (source updated)', async () => {
        const fm = { Zusammenfassung: 'V1.' };
        const app = makeMockApp({ 'A.md': { frontmatter: fm } });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore);
        await indexer.indexNote(makeFile('A.md', 1000));

        fm.Zusammenfassung = 'V2.';
        const result = await indexer.indexNote(makeFile('A.md', 2000));
        expect(result.summaryUpdated).toBe(true);
        expect(stores.noteSummaryStore.get('A.md')?.summary).toBe('V2.');
        expect(stores.noteSummaryStore.get('A.md')?.sourceMtime).toBe(2000);
    });

    it('triggers SummaryGenerator only when autoSummary enabled and no Frontmatter-Summary', async () => {
        const generator = vi.fn(async () => ({ summary: 'Auto-generierte Zusammenfassung.', modelUsed: 'haiku' }));
        const app = makeMockApp(
            { 'A.md': { frontmatter: { tags: ['only-tags'] } } },
            { 'A.md': 'Body content of note.' },
        );
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            autoSummaryEnabled: true,
            summaryGenerator: generator,
        });
        const result = await indexer.indexNote(makeFile('A.md', 100));

        expect(generator).toHaveBeenCalledOnce();
        expect(result.summaryGenerated).toBe(true);
        expect(stores.noteSummaryStore.get('A.md')?.summary).toBe('Auto-generierte Zusammenfassung.');
        expect(stores.noteSummaryStore.get('A.md')?.summaryModel).toBe('haiku');
    });

    it('does NOT call SummaryGenerator when autoSummary disabled', async () => {
        const generator = vi.fn();
        const app = makeMockApp({ 'A.md': { frontmatter: {} } });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            autoSummaryEnabled: false,
            summaryGenerator: generator,
        });
        await indexer.indexNote(makeFile('A.md', 100));
        expect(generator).not.toHaveBeenCalled();
    });

    it('respects folderAllowList', async () => {
        const app = makeMockApp({ 'OutOfScope/A.md': { frontmatter: { Zusammenfassung: 'X.' } } });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            folderAllowList: ['Sources/'],
        });
        const result = await indexer.indexNote(makeFile('OutOfScope/A.md', 100));
        expect(result.skipped).toBe(true);
        expect(stores.noteSummaryStore.get('OutOfScope/A.md')).toBeNull();
    });

    it('indexNotes aggregates results', async () => {
        const app = makeMockApp({
            'A.md': { frontmatter: { Zusammenfassung: 'A.' } },
            'B.md': { frontmatter: { Zusammenfassung: 'B.' } },
        });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore);
        const result = await indexer.indexNotes([makeFile('A.md', 1), makeFile('B.md', 1)]);
        expect(result.noteIndexed).toBe(2);
        expect(result.summariesUpdated).toBe(2);
        expect(result.errors).toBe(0);
    });
});

// ----------------------------------------------------------------------
// AUDIT-015 Eval-Coverage: maybeRouteMemorySource Bridge-Hook
// (FEAT-03-25 / ADR-109)
// ----------------------------------------------------------------------

const MEMORY_SCHEMA = `
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

async function freshMemoryStore() {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(MEMORY_SCHEMA);
    const memDB = {
        isOpen: () => true,
        getDB: () => db,
        markDirty: () => undefined,
    } as unknown as MemoryDB;
    return new MemorySourceStore(memDB);
}

describe('readMemorySourceMarker (FEAT-03-25)', () => {
    it('accepts true / "true" / "yes" / 1', () => {
        expect(readMemorySourceMarker({ 'memory-source': true })).toBe(true);
        expect(readMemorySourceMarker({ 'memory-source': 'true' })).toBe(true);
        expect(readMemorySourceMarker({ 'memory-source': 'yes' })).toBe(true);
        expect(readMemorySourceMarker({ 'memory-source': 1 })).toBe(true);
        expect(readMemorySourceMarker({ memory_source: true })).toBe(true);
        expect(readMemorySourceMarker({ memorySource: true })).toBe(true);
    });
    it('rejects false / missing / other values', () => {
        expect(readMemorySourceMarker({})).toBe(false);
        expect(readMemorySourceMarker({ 'memory-source': false })).toBe(false);
        expect(readMemorySourceMarker({ 'memory-source': 'no' })).toBe(false);
        expect(readMemorySourceMarker({ 'memory-source': 0 })).toBe(false);
    });
});

describe('FrontmatterIndexer.maybeRouteMemorySource (Bridge-Hook)', () => {
    let stores: Awaited<ReturnType<typeof freshStores>>;
    beforeEach(async () => { stores = await freshStores(); });

    it('triggers hook when frontmatter has memory-source: true', async () => {
        const app = makeMockApp({ 'X.md': { frontmatter: { 'memory-source': true } } });
        const memStore = await freshMemoryStore();
        const hook = vi.fn(async () => undefined);
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            memorySourceStore: memStore,
            memorySourceHook: hook,
        });
        await indexer.indexNote(makeFile('X.md', 100));
        // give microtask queue a chance
        await new Promise(r => setTimeout(r, 0));
        expect(memStore.isMemorySource('X.md')).toBe(true);
        expect(memStore.get('X.md')?.markerSource).toBe('frontmatter');
        expect(hook).toHaveBeenCalled();
    });

    it('does NOT trigger hook when frontmatter is missing the marker', async () => {
        const app = makeMockApp({ 'X.md': { frontmatter: {} } });
        const memStore = await freshMemoryStore();
        const hook = vi.fn();
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            memorySourceStore: memStore,
            memorySourceHook: hook,
        });
        await indexer.indexNote(makeFile('X.md', 100));
        expect(memStore.isMemorySource('X.md')).toBe(false);
        expect(hook).not.toHaveBeenCalled();
    });

    it('triggers hook when note is registered via tool/settings (no frontmatter marker)', async () => {
        const app = makeMockApp({ 'X.md': { frontmatter: {} } });
        const memStore = await freshMemoryStore();
        memStore.upsert('X.md', 'agent-tool');
        const hook = vi.fn(async () => undefined);
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            memorySourceStore: memStore,
            memorySourceHook: hook,
        });
        await indexer.indexNote(makeFile('X.md', 100));
        await new Promise(r => setTimeout(r, 0));
        expect(hook).toHaveBeenCalled();
        // markerSource bleibt 'agent-tool', wird nicht ueberschrieben
        expect(memStore.get('X.md')?.markerSource).toBe('agent-tool');
    });

    it('hook errors do not break the indexer pass (best-effort)', async () => {
        const app = makeMockApp({ 'X.md': { frontmatter: { 'memory-source': true } } });
        const memStore = await freshMemoryStore();
        const hook = vi.fn(async () => { throw new Error('boom'); });
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            memorySourceStore: memStore,
            memorySourceHook: hook,
        });
        // Indexer-Aufruf darf nicht throw'en
        const r = await indexer.indexNote(makeFile('X.md', 100));
        expect(r.error).toBeUndefined();  // indexer didn't fail
        await new Promise(r => setTimeout(r, 0));
        expect(memStore.isMemorySource('X.md')).toBe(true);  // upsert lief vor hook
    });

    it('marks dirty on second indexNote of an already-registered note', async () => {
        const app = makeMockApp({ 'X.md': { frontmatter: { 'memory-source': true } } });
        const memStore = await freshMemoryStore();
        const hook = vi.fn(async () => undefined);
        const indexer = new FrontmatterIndexer(app, stores.noteSummaryStore, stores.frontmatterPropertyStore, {
            memorySourceStore: memStore,
            memorySourceHook: hook,
        });
        await indexer.indexNote(makeFile('X.md', 100));
        memStore.recordExtraction('X.md', 5);  // simulate a successful extraction
        expect(memStore.get('X.md')?.dirty).toBe(false);

        // Re-index after a modify
        await indexer.indexNote(makeFile('X.md', 200));
        expect(memStore.get('X.md')?.dirty).toBe(true);
    });
});
