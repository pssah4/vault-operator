import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { CommunicationStyleStore } from '../CommunicationStyleStore';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

const SCHEMA = `
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
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return { getDB: () => rawDb, markDirty: () => { /* */ } } as unknown as MemoryDB;
}

describe('CommunicationStyleStore (PLAN-004 task 4)', () => {
    let rawDb: SqlJsDatabase;
    let store: CommunicationStyleStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        store = new CommunicationStyleStore(makeFakeMemoryDB(rawDb));
    });

    it('persists a style with defaults', () => {
        const s = store.addStyle({
            contextMatch: 'default',
            styleDescription: 'Direct, concise, no fluff',
        });
        expect(s.id).toBeGreaterThan(0);
        expect(s.contextMatch).toBe('default');
        expect(s.importance).toBe(0.5);
        expect(s.createdAt).toBe(s.lastUpdatedAt);
    });

    it('respects optional examples + importance + metadata', () => {
        const s = store.addStyle({
            contextMatch: 'topic:coding',
            styleDescription: 'TypeScript-first, file paths as `path:line`',
            examples: '"src/foo.ts:42 has the bug"',
            importance: 0.8,
            metadata: { lang: 'de' },
        });
        expect(s.examples).toContain('foo.ts');
        expect(s.importance).toBeCloseTo(0.8);
        expect(s.metadata).toEqual({ lang: 'de' });
    });

    it('rejects empty contextMatch / styleDescription', () => {
        expect(() => store.addStyle({ contextMatch: '', styleDescription: 'x' })).toThrow(/contextMatch/);
        expect(() => store.addStyle({ contextMatch: 'x', styleDescription: '   ' })).toThrow(/styleDescription/);
    });

    it('rejects out-of-range importance', () => {
        expect(() => store.addStyle({
            contextMatch: 'x', styleDescription: 'y', importance: 2,
        })).toThrow(/\[0, 1\]/);
    });

    describe('getMatchingStyles', () => {
        it('falls back to default when only default exists', () => {
            store.addStyle({ contextMatch: 'default', styleDescription: 'fallback', importance: 0.5 });
            const matches = store.getMatchingStyles('topic:cooking');
            expect(matches.map(m => m.styleDescription)).toEqual(['fallback']);
        });

        it('returns context-specific + default in importance order', () => {
            store.addStyle({ contextMatch: 'default', styleDescription: 'base', importance: 0.4 });
            store.addStyle({ contextMatch: 'topic:coding', styleDescription: 'code', importance: 0.9 });
            const matches = store.getMatchingStyles('topic:coding');
            expect(matches.map(m => m.styleDescription)).toEqual(['code', 'base']);
        });

        it('respects the limit', () => {
            for (let i = 0; i < 5; i++) {
                store.addStyle({ contextMatch: 'default', styleDescription: `s${i}`, importance: i / 10 });
            }
            expect(store.getMatchingStyles('default', 2)).toHaveLength(2);
        });

        it('returns empty when no rows match and no default exists', () => {
            expect(store.getMatchingStyles('topic:cooking')).toEqual([]);
        });
    });

    describe('updateStyle', () => {
        it('patches only the provided fields and bumps last_updated_at', async () => {
            const s = store.addStyle({
                contextMatch: 'default', styleDescription: 'old', importance: 0.5,
            });
            await new Promise(r => setTimeout(r, 5));
            const u = store.updateStyle(s.id, { styleDescription: 'new' });
            expect(u.styleDescription).toBe('new');
            expect(u.importance).toBe(0.5);
            expect(u.lastUpdatedAt > s.lastUpdatedAt).toBe(true);
        });

        it('rejects an empty patch', () => {
            const s = store.addStyle({ contextMatch: 'default', styleDescription: 'x' });
            expect(() => store.updateStyle(s.id, {})).toThrow(/at least one field/);
        });

        it('rejects out-of-range importance', () => {
            const s = store.addStyle({ contextMatch: 'default', styleDescription: 'x' });
            expect(() => store.updateStyle(s.id, { importance: -1 })).toThrow(/\[0, 1\]/);
        });

        it('throws when target id does not exist', () => {
            expect(() => store.updateStyle(99999, { styleDescription: 'x' })).toThrow(/not found/);
        });
    });

    describe('removeStyle', () => {
        it('hard-deletes by id', () => {
            const s = store.addStyle({ contextMatch: 'default', styleDescription: 'x' });
            store.removeStyle(s.id);
            expect(store.getById(s.id)).toBeUndefined();
        });
    });
});
