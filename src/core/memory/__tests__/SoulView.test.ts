import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { SoulView, OBSILO_PROFILE } from '../SoulView';
import { FactStore } from '../FactStore';
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
    return {
        getDB: () => rawDb,
        markDirty: () => undefined,
    } as unknown as MemoryDB;
}

describe('SoulView (PLAN-008 task A.2)', () => {
    let rawDb: SqlJsDatabase;
    let memoryDB: MemoryDB;
    let factStore: FactStore;
    let view: SoulView;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memoryDB = makeFakeMemoryDB(rawDb);
        factStore = new FactStore(memoryDB);
        view = new SoulView(memoryDB);
    });

    function seedSoul(text: string, category: 'value' | 'anti_pattern' | 'identity' | 'communication', importance = 0.7) {
        return factStore.insert({
            text, topics: ['soul', category],
            importance, kind: 'identity',
            profileId: OBSILO_PROFILE,
            sourceInterface: 'obsilo-self',
        });
    }

    it('returns empty snapshot when no facts in _obsilo profile', () => {
        const s = view.snapshot();
        expect(s.values).toEqual([]);
        expect(s.identity).toEqual([]);
        expect(s.antiPatterns).toEqual([]);
        expect(s.communication).toEqual([]);
    });

    it('partitions facts into the four soul categories', () => {
        seedSoul('I am Vault Operator', 'identity');
        seedSoul('Usefulness over politeness', 'value');
        seedSoul('No emojis', 'anti_pattern');
        seedSoul('German, casual', 'communication');

        const s = view.snapshot();
        expect(s.identity[0].text).toBe('I am Vault Operator');
        expect(s.values[0].text).toBe('Usefulness over politeness');
        expect(s.antiPatterns[0].text).toBe('No emojis');
        expect(s.communication[0].text).toBe('German, casual');
    });

    it('caps each category at top-3 ranked by importance', () => {
        seedSoul('low', 'value', 0.2);
        seedSoul('mid-1', 'value', 0.5);
        seedSoul('mid-2', 'value', 0.6);
        seedSoul('high', 'value', 0.9);
        seedSoul('top', 'value', 0.95);

        const s = view.snapshot();
        expect(s.values).toHaveLength(3);
        expect(s.values.map(f => f.text)).toEqual(['top', 'high', 'mid-2']);
    });

    it('ignores facts from other profiles (default user partition)', () => {
        factStore.insert({
            text: 'user fact', topics: ['soul', 'value'],
            importance: 0.9, profileId: 'default',
        });
        const s = view.snapshot();
        expect(s.values).toEqual([]);
    });

    it('ignores facts that lack the "soul" topic', () => {
        factStore.insert({
            text: 'misc obsilo fact', topics: ['value'],
            importance: 0.9, kind: 'identity', profileId: OBSILO_PROFILE,
        });
        const s = view.snapshot();
        expect(s.values).toEqual([]);
    });

    it('getCapabilities returns capability-tagged facts', () => {
        factStore.insert({
            text: 'star button toggles save', topics: ['capability', 'ui'],
            importance: 0.8, kind: 'identity', profileId: OBSILO_PROFILE,
        });
        const caps = view.getCapabilities();
        expect(caps).toHaveLength(1);
        expect(caps[0].text).toContain('star button');
    });

    it('renderMarkdown produces a stable cache-friendly block', () => {
        seedSoul('Vault Operator, AI agent in Obsidian', 'identity');
        seedSoul('Usefulness over politeness', 'value');
        seedSoul('No emojis', 'anti_pattern');
        seedSoul('German, casual', 'communication');

        const md = view.renderMarkdown();
        expect(md).toContain('## Identity & Soul (Vault Operator)');
        expect(md).toContain('**Identity:**');
        expect(md).toContain('**Values:**');
        expect(md).toContain('**Anti-Patterns:**');
        expect(md).toContain('**Communication style:**');
        expect(md).toContain('Usefulness over politeness');
        expect(md).toContain("recall_memory(profile='_obsilo')");
        expect(md).toContain('inspect_self');
    });

    it('renderMarkdown skips empty categories cleanly', () => {
        seedSoul('No emojis', 'anti_pattern');
        const md = view.renderMarkdown();
        expect(md).toContain('**Anti-Patterns:**');
        expect(md).not.toContain('**Values:**');
        expect(md).not.toContain('**Identity:**');
    });

    it('getCategory returns top-3 for a single category', () => {
        seedSoul('v1', 'value', 0.9);
        seedSoul('v2', 'value', 0.8);
        seedSoul('v3', 'value', 0.7);
        seedSoul('v4', 'value', 0.6);
        const top = view.getCategory('value');
        expect(top.map(f => f.text)).toEqual(['v1', 'v2', 'v3']);
    });
});
