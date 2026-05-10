import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';

// sql.js Database type is internal to its factory; we use a structural alias.
type SqlJsDatabase = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
};
import type { KnowledgeDB } from '../KnowledgeDB';
import { NoteSummaryStore } from '../NoteSummaryStore';
import { FrontmatterPropertyStore } from '../FrontmatterPropertyStore';
import {
    ClusterMetadataStore,
    detectCategory,
    HALF_LIFE_DEFAULTS,
} from '../ClusterMetadataStore';
import {
    ClusterSourceStatsStore,
    normalizeDomain,
} from '../ClusterSourceStatsStore';

/**
 * Tests fuer die vier neuen Store-Klassen aus PLAN-10 (BA-25 Phase 1).
 * Nutzt sql.js direkt mit minimalem KnowledgeDB-Mock, um Plugin-Init
 * und vault.adapter zu vermeiden.
 */

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS note_summaries (
    note_path TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    summary_model TEXT NOT NULL,
    summarized_at TEXT NOT NULL,
    source_mtime INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS frontmatter_properties (
    note_path TEXT NOT NULL,
    property_name TEXT NOT NULL,
    property_value TEXT NOT NULL,
    list_index INTEGER NOT NULL DEFAULT 0,
    UNIQUE(note_path, property_name, list_index)
);
CREATE TABLE IF NOT EXISTS cluster_source_stats (
    cluster TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    note_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (cluster, source_domain)
);
CREATE TABLE IF NOT EXISTS cluster_metadata (
    cluster TEXT PRIMARY KEY,
    half_life_days INTEGER NOT NULL,
    custom_weights TEXT,
    last_external_check TEXT,
    last_hint_at TEXT,
    hot_cluster INTEGER NOT NULL DEFAULT 0
);
`;

function makeMockKnowledgeDB(db: SqlJsDatabase): KnowledgeDB {
    return {
        isOpen: () => true,
        getDB: () => db as never,
        markDirty: () => {},
    } as unknown as KnowledgeDB;
}

async function freshDB() {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(SCHEMA_DDL);
    return db;
}

describe('NoteSummaryStore', () => {
    let store: NoteSummaryStore;
    let db: SqlJsDatabase;

    beforeEach(async () => {
        db = await freshDB();
        store = new NoteSummaryStore(makeMockKnowledgeDB(db));
    });

    it('upsert and get round-trip', () => {
        store.upsert('Notes/A.md', 'Eine kurze Zusammenfassung.', 'haiku', 1700000000);
        const rec = store.get('Notes/A.md');
        expect(rec).not.toBeNull();
        expect(rec?.summary).toBe('Eine kurze Zusammenfassung.');
        expect(rec?.summaryModel).toBe('haiku');
        expect(rec?.sourceMtime).toBe(1700000000);
    });

    it('upsert is idempotent and overwrites', () => {
        store.upsert('Notes/A.md', 'Erste Version.', 'haiku', 1);
        store.upsert('Notes/A.md', 'Zweite Version.', 'sonnet', 2);
        const rec = store.get('Notes/A.md');
        expect(rec?.summary).toBe('Zweite Version.');
        expect(rec?.summaryModel).toBe('sonnet');
        expect(rec?.sourceMtime).toBe(2);
        expect(store.count()).toBe(1);
    });

    it('bulkRead returns map with all hits', () => {
        store.upsert('A.md', 'sa', 'h', 1);
        store.upsert('B.md', 'sb', 'h', 1);
        store.upsert('C.md', 'sc', 'h', 1);
        const map = store.bulkRead(['A.md', 'B.md', 'D.md']);
        expect(map.size).toBe(2);
        expect(map.has('A.md')).toBe(true);
        expect(map.has('D.md')).toBe(false);
    });

    it('delete removes the row', () => {
        store.upsert('A.md', 'sa', 'h', 1);
        store.delete('A.md');
        expect(store.get('A.md')).toBeNull();
    });
});

describe('FrontmatterPropertyStore', () => {
    let store: FrontmatterPropertyStore;
    let db: SqlJsDatabase;

    beforeEach(async () => {
        db = await freshDB();
        store = new FrontmatterPropertyStore(makeMockKnowledgeDB(db));
    });

    it('replaceForNote handles single-value and list-properties', () => {
        store.replaceForNote('A.md', {
            Zusammenfassung: 'Eine Zusammenfassung.',
            tags: ['ai', 'agent'],
            Themen: ['AI', 'Knowledge-Management'],
        });
        const props = store.getForNote('A.md');
        expect(props.Zusammenfassung).toEqual(['Eine Zusammenfassung.']);
        expect(props.tags).toEqual(['ai', 'agent']);
        expect(props.Themen).toEqual(['AI', 'Knowledge-Management']);
    });

    it('replaceForNote replaces existing entries (delete-then-insert)', () => {
        store.replaceForNote('A.md', { tags: ['old'] });
        store.replaceForNote('A.md', { tags: ['new1', 'new2'] });
        const props = store.getForNote('A.md');
        expect(props.tags).toEqual(['new1', 'new2']);
    });

    it('lookupValues returns distinct sorted values', () => {
        store.replaceForNote('A.md', { Themen: ['Politik', 'AI'] });
        store.replaceForNote('B.md', { Themen: ['Politik', 'Geschichte'] });
        const values = store.lookupValues('Themen');
        expect(values).toEqual(['AI', 'Geschichte', 'Politik']);
    });

    it('findNotesWithValue returns matching notes', () => {
        store.replaceForNote('A.md', { Themen: ['Politik'] });
        store.replaceForNote('B.md', { Themen: ['Politik', 'AI'] });
        store.replaceForNote('C.md', { Themen: ['AI'] });
        const notes = store.findNotesWithValue('Themen', 'Politik');
        expect(notes).toEqual(['A.md', 'B.md']);
    });

    it('preserves list_index ordering', () => {
        store.replaceForNote('A.md', { tags: ['z', 'a', 'm'] });
        const props = store.getForNote('A.md');
        expect(props.tags).toEqual(['z', 'a', 'm']);
    });
});

describe('ClusterMetadataStore plus detectCategory', () => {
    let store: ClusterMetadataStore;
    let db: SqlJsDatabase;

    beforeEach(async () => {
        db = await freshDB();
        store = new ClusterMetadataStore(makeMockKnowledgeDB(db));
    });

    it('detectCategory matches Tech-Keywords', () => {
        expect(detectCategory('AI Tools').category).toBe('tech');
        expect(detectCategory('Software Engineering').category).toBe('tech');
        expect(detectCategory('AI Tools').halfLifeDays).toBe(HALF_LIFE_DEFAULTS.tech);
    });

    it('detectCategory matches Wissenschaft', () => {
        expect(detectCategory('Forschung').category).toBe('wissenschaft');
        expect(detectCategory('Research Notes').category).toBe('wissenschaft');
    });

    it('detectCategory matches Politik', () => {
        expect(detectCategory('Politik').category).toBe('politik');
        expect(detectCategory('Wirtschaft').category).toBe('politik');
    });

    it('detectCategory matches Geschichte', () => {
        expect(detectCategory('Geschichte').category).toBe('geschichte');
        expect(detectCategory('Philosophie').category).toBe('geschichte');
    });

    it('detectCategory matches Personal', () => {
        expect(detectCategory('Personal').category).toBe('personal');
        expect(detectCategory('Self Reflection').category).toBe('personal');
        expect(detectCategory('Personal').halfLifeDays).toBe(0);
    });

    it('detectCategory falls back to Tech', () => {
        const r = detectCategory('Random Cluster');
        expect(r.category).toBe('tech');
        expect(r.halfLifeDays).toBe(180);
    });

    it('upsert stores explicit half-life and hot-flag', () => {
        store.upsert('MyCluster', 99, true);
        const rec = store.get('MyCluster');
        expect(rec?.halfLifeDays).toBe(99);
        expect(rec?.hotCluster).toBe(true);
    });

    it('upsert without half-life uses detected default', () => {
        store.upsert('AI Tools');
        const rec = store.get('AI Tools');
        expect(rec?.halfLifeDays).toBe(HALF_LIFE_DEFAULTS.tech);
    });

    it('getHotClusters filters correctly', () => {
        store.upsert('A', 100, true);
        store.upsert('B', 100, false);
        store.upsert('C', 100, true);
        const hot = store.getHotClusters();
        expect(hot.map((c) => c.cluster).sort()).toEqual(['A', 'C']);
    });

    it('setLastHintAt updates timestamp', () => {
        store.upsert('A', 100);
        store.setLastHintAt('A', '2026-05-03T00:00:00Z');
        expect(store.get('A')?.lastHintAt).toBe('2026-05-03T00:00:00Z');
    });
});

describe('ClusterSourceStatsStore plus normalizeDomain', () => {
    let store: ClusterSourceStatsStore;
    let db: SqlJsDatabase;

    beforeEach(async () => {
        db = await freshDB();
        store = new ClusterSourceStatsStore(makeMockKnowledgeDB(db));
    });

    it('normalizeDomain strips protocol, www, path, trailing slash', () => {
        expect(normalizeDomain('https://www.medium.com/some-article')).toBe('medium.com');
        expect(normalizeDomain('http://example.org/')).toBe('example.org');
        expect(normalizeDomain('Example.COM')).toBe('example.com');
        expect(normalizeDomain('  https://www.test.de/x?y=1  ')).toBe('test.de');
        expect(normalizeDomain('')).toBe('');
        expect(normalizeDomain('file:///local/path')).toBe('');
    });

    it('incrementCount accumulates correctly', () => {
        store.incrementCount('Tech', 'medium.com');
        store.incrementCount('Tech', 'medium.com');
        store.incrementCount('Tech', 'github.com');
        const stats = store.getStatsForCluster('Tech');
        expect(stats.length).toBe(2);
        const medium = stats.find((s) => s.sourceDomain === 'medium.com');
        expect(medium?.noteCount).toBe(2);
    });

    it('concentrationScore: single source = 1.0', () => {
        store.incrementCount('Tech', 'medium.com');
        store.incrementCount('Tech', 'medium.com');
        expect(store.concentrationScore('Tech')).toBe(1);
    });

    it('concentrationScore: equal split = 0.5 for two domains', () => {
        store.incrementCount('Tech', 'a.com');
        store.incrementCount('Tech', 'b.com');
        expect(store.concentrationScore('Tech')).toBe(0.5);
    });

    it('diversityScore: single source = 0', () => {
        store.incrementCount('Tech', 'medium.com');
        expect(store.diversityScore('Tech')).toBe(0);
    });

    it('diversityScore: two equal = 1 (Shannon entropy log2(2))', () => {
        store.incrementCount('Tech', 'a.com');
        store.incrementCount('Tech', 'b.com');
        expect(store.diversityScore('Tech')).toBeCloseTo(1, 5);
    });

    it('getConcentratedClusters filters by threshold and minNotes', () => {
        // Cluster 'Tech': 9 medium.com plus 1 github.com -> conc 0.9 (concentrated)
        for (let i = 0; i < 9; i++) store.incrementCount('Tech', 'medium.com');
        store.incrementCount('Tech', 'github.com');
        // Cluster 'Lit': 3 medium.com, 2 sub.com -> conc 0.6 (NOT concentrated, too few notes)
        for (let i = 0; i < 3; i++) store.incrementCount('Lit', 'medium.com');
        for (let i = 0; i < 2; i++) store.incrementCount('Lit', 'sub.com');

        const concentrated = store.getConcentratedClusters(0.7, 5);
        expect(concentrated.length).toBe(1);
        expect(concentrated[0].cluster).toBe('Tech');
        expect(concentrated[0].dominantDomain).toBe('medium.com');
        expect(concentrated[0].concentrationScore).toBe(0.9);
        expect(concentrated[0].totalNotes).toBe(10);
    });
});
