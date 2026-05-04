import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { UserProfileView } from '../UserProfileView';
import { FactStore } from '../FactStore';
import { CommunicationStyleStore } from '../CommunicationStyleStore';
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
CREATE TABLE communication_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_match TEXT NOT NULL,
    style_description TEXT NOT NULL,
    examples TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    metadata TEXT
);
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    source TEXT DEFAULT 'human',
    created_at TEXT NOT NULL
);
CREATE TABLE known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    description TEXT,
    centroid_embedding BLOB,
    centroid_computed_at TEXT
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

describe('UserProfileView (PLAN-006 task 2)', () => {
    let rawDb: SqlJsDatabase;
    let view: UserProfileView;
    let facts: FactStore;
    let styles: CommunicationStyleStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        const memDB = makeFakeMemoryDB(rawDb);
        facts = new FactStore(memDB);
        styles = new CommunicationStyleStore(memDB);
        view = new UserProfileView(memDB);
    });

    it('returns empty arrays + null style for a fresh DB', () => {
        const profile = view.getUserProfile();
        expect(profile.identity).toEqual([]);
        expect(profile.preferences).toEqual([]);
        expect(profile.patterns).toEqual([]);
        expect(profile.communicationStyle).toBeNull();
        expect(profile.stats).toEqual({ conversations: 0, topics: 0, lastActive: null });
    });

    it('groups facts by kind into identity / preferences', () => {
        facts.insert({ text: 'I am Sebastian', topics: ['identity'], kind: 'identity' });
        facts.insert({ text: 'Lives in DE', topics: ['identity'], kind: 'identity' });
        facts.insert({ text: 'Prefers TypeScript', topics: ['preferences'], kind: 'preference' });
        facts.insert({ text: 'Random fact', topics: ['misc'], kind: 'fact' });

        const profile = view.getUserProfile();
        expect(profile.identity.map(f => f.text).sort()).toEqual([
            'I am Sebastian', 'Lives in DE',
        ]);
        expect(profile.preferences.map(f => f.text)).toEqual(['Prefers TypeScript']);
    });

    it('extracts patterns from primary-topic = "patterns"', () => {
        facts.insert({ text: 'Plans before coding', topics: ['patterns'], kind: 'fact' });
        facts.insert({ text: 'Other topic', topics: ['misc', 'patterns'], kind: 'fact' });
        const profile = view.getUserProfile();
        expect(profile.patterns.map(f => f.text)).toEqual(['Plans before coding']);
    });

    it('returns the default communication style', () => {
        styles.addStyle({
            contextMatch: 'default',
            styleDescription: 'Concise, direct, no filler',
            importance: 0.7,
        });
        const profile = view.getUserProfile();
        expect(profile.communicationStyle?.styleDescription).toBe('Concise, direct, no filler');
    });

    it('skips deprecated facts in groupings', () => {
        const old = facts.insert({ text: 'I was XYZ', topics: ['identity'], kind: 'identity' });
        facts.deprecate(old.id, 'no longer accurate');
        const profile = view.getUserProfile();
        expect(profile.identity).toHaveLength(0);
    });

    it('stats counts sessions + known topics + last activity', () => {
        rawDb.run(
            'INSERT INTO sessions (id, created_at) VALUES (?, ?)',
            ['s1', '2026-01-01T10:00:00Z'],
        );
        rawDb.run(
            'INSERT INTO sessions (id, created_at) VALUES (?, ?)',
            ['s2', '2026-04-01T10:00:00Z'],
        );
        rawDb.run(
            `INSERT INTO known_topics (topic, first_seen_at, last_seen_at) VALUES (?, ?, ?)`,
            ['tools', '2026-01-01', '2026-04-01'],
        );

        const profile = view.getUserProfile();
        expect(profile.stats.conversations).toBe(2);
        expect(profile.stats.topics).toBe(1);
        expect(profile.stats.lastActive).toBe('2026-04-01T10:00:00Z');
    });
});
