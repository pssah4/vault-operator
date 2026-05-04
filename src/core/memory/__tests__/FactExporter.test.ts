import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { FactStore } from '../FactStore';
import { FactExporter } from '../FactExporter';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

const SCHEMA = `
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    topics TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    kind TEXT NOT NULL DEFAULT 'fact',
    created_at TEXT NOT NULL,
    last_confirmed_at TEXT NOT NULL,
    confirmation_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    source_session_id TEXT,
    source_thread_id TEXT,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    source_uri TEXT,
    profile_id TEXT NOT NULL DEFAULT 'default',
    superseded_by INTEGER REFERENCES facts(id),
    is_latest INTEGER NOT NULL DEFAULT 1,
    deprecated_at TEXT,
    deprecation_reason TEXT,
    metadata TEXT,
    CHECK (importance >= 0.0 AND importance <= 1.0),
    CHECK (kind IN ('fact', 'preference', 'identity', 'event')),
    CHECK (is_latest IN (0, 1))
);
CREATE TABLE memory_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    operation TEXT NOT NULL,
    fact_id INTEGER,
    related_fact_id INTEGER,
    session_id TEXT,
    rationale TEXT,
    metadata TEXT
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return { getDB: () => rawDb, markDirty: () => { /* */ } } as unknown as MemoryDB;
}

describe('FactExporter (PLAN-005 task 2)', () => {
    let rawDb: SqlJsDatabase;
    let store: FactStore;
    let exporter: FactExporter;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        store = new FactStore(makeFakeMemoryDB(rawDb));
        exporter = new FactExporter(store);
    });

    it('renders an empty-state message when no facts exist', () => {
        const { markdown, factCount, topicCount } = exporter.export({
            timestamp: '2026-04-27T12:00:00Z',
        });
        expect(factCount).toBe(0);
        expect(topicCount).toBe(0);
        expect(markdown).toContain('exported 2026-04-27T12:00:00Z');
        expect(markdown).toContain('0 latest facts');
        expect(markdown).toContain('_No facts to export._');
    });

    it('groups facts by primary topic (topics[0])', () => {
        store.insert({ text: 'Sebastian uses Obsidian', topics: ['tools', 'editor'], importance: 0.8 });
        store.insert({ text: 'Sebastian likes coffee', topics: ['preferences'], importance: 0.5, kind: 'preference' });
        store.insert({ text: 'Plugin uses TypeScript', topics: ['tools', 'lang'], importance: 0.7 });

        const { markdown, factCount, topicCount } = exporter.export({
            timestamp: '2026-04-27T12:00:00Z',
        });

        expect(factCount).toBe(3);
        expect(topicCount).toBe(2); // 'tools' + 'preferences'
        expect(markdown).toContain('## tools (2 facts)');
        expect(markdown).toContain('## preferences (1 fact)');
        // tools group sits before preferences because it has more facts
        expect(markdown.indexOf('## tools')).toBeLessThan(markdown.indexOf('## preferences'));
    });

    it('orders facts in a group by importance desc', () => {
        store.insert({ text: 'low fact', topics: ['x'], importance: 0.1 });
        store.insert({ text: 'high fact', topics: ['x'], importance: 0.9 });
        store.insert({ text: 'mid fact', topics: ['x'], importance: 0.5 });

        const { markdown } = exporter.export({ timestamp: 't' });
        const high = markdown.indexOf('high fact');
        const mid = markdown.indexOf('mid fact');
        const low = markdown.indexOf('low fact');
        expect(high).toBeLessThan(mid);
        expect(mid).toBeLessThan(low);
    });

    it('puts facts without topics under "(no topic)" at the bottom', () => {
        store.insert({ text: 'orphan fact', topics: [], importance: 0.5 });
        store.insert({ text: 'tagged fact', topics: ['tools'], importance: 0.5 });

        const { markdown, topicCount } = exporter.export({ timestamp: 't' });
        expect(topicCount).toBe(2);
        expect(markdown).toContain('## (no topic)');
        expect(markdown.indexOf('## tools')).toBeLessThan(markdown.indexOf('## (no topic)'));
    });

    it('renders provenance line with importance, kind, source_uri, session, interface', () => {
        store.insert({
            text: 'Sebastian uses Obsidian',
            topics: ['tools'],
            importance: 0.85,
            kind: 'preference',
            sourceSessionId: 'sess-1',
            sourceUri: 'vault://Notes/Profile.md',
            sourceInterface: 'ucm',
        });

        const { markdown } = exporter.export({ timestamp: 't' });
        expect(markdown).toContain('importance: 0.85');
        expect(markdown).toContain('kind: preference');
        expect(markdown).toContain('source_uri: vault://Notes/Profile.md');
        expect(markdown).toContain('session: session://sess-1');
        expect(markdown).toContain('source_interface: ucm');
    });

    it('skips deprecated and superseded facts by default (onlyLatest=true)', () => {
        const old = store.insert({ text: 'old version', topics: ['tools'] });
        store.supersede(old.id, { text: 'new version', topics: ['tools'] });

        const { markdown, factCount } = exporter.export({ timestamp: 't' });
        expect(factCount).toBe(1);
        expect(markdown).toContain('new version');
        expect(markdown).not.toContain('old version');
    });

    it('honours kind filter from ListOptions', () => {
        store.insert({ text: 'A fact', topics: ['x'], kind: 'fact' });
        store.insert({ text: 'A preference', topics: ['x'], kind: 'preference' });

        const onlyPrefs = exporter.export({ timestamp: 't', kind: 'preference' });
        expect(onlyPrefs.factCount).toBe(1);
        expect(onlyPrefs.markdown).toContain('A preference');
        expect(onlyPrefs.markdown).not.toContain('A fact');
    });

    it('escapes newlines and backticks in fact text so bullet stays single-line', () => {
        store.insert({
            text: 'multi\nline `code` text',
            topics: ['tools'],
        });
        const { markdown } = exporter.export({ timestamp: 't' });
        // Look for the bullet line itself
        const bulletLine = markdown.split('\n').find(l => l.startsWith('- **'));
        expect(bulletLine).toBeDefined();
        expect(bulletLine).not.toContain('\n');
        expect(bulletLine).toContain('multi line');
        expect(bulletLine).toContain('\\`code\\`');
    });

    it('respects the limit option', () => {
        for (let i = 0; i < 5; i++) {
            store.insert({ text: `fact-${i}`, topics: ['x'], importance: i / 10 });
        }
        const { factCount } = exporter.export({ timestamp: 't', limit: 2 });
        expect(factCount).toBe(2);
    });

    it('singular vs plural counts in headings', () => {
        store.insert({ text: 'lone', topics: ['solo'], importance: 0.5 });
        const { markdown } = exporter.export({ timestamp: 't' });
        expect(markdown).toContain('1 latest fact)');
        expect(markdown).toContain('## solo (1 fact)');
    });
});
