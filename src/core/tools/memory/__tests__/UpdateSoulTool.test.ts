import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { UpdateSoulTool } from '../UpdateSoulTool';
import { OBSILO_PROFILE } from '../../../memory/SoulView';
import type { MemoryDB } from '../../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../../knowledge/KnowledgeDB';
import type { ToolExecutionContext } from '../../types';
import type ObsidianAgentPlugin from '../../../../main';

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

function makeMemDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        markDirty: () => undefined,
        isOpen: () => true,
        save: () => Promise.resolve(),
    } as unknown as MemoryDB;
}

function makeContext(): { ctx: ToolExecutionContext; results: string[] } {
    const results: string[] = [];
    return {
        results,
        ctx: {
            taskId: 't',
            mode: 'agent',
            callbacks: {
                pushToolResult: (r: string) => { results.push(r); },
                handleError: () => Promise.resolve(),
                pushAssistantMessage: () => undefined,
                pushUserMessage: () => undefined,
            },
        } as unknown as ToolExecutionContext,
    };
}

describe('UpdateSoulTool (PLAN-008 task B.4)', () => {
    let rawDb: SqlJsDatabase;
    let memDB: MemoryDB;
    let plugin: ObsidianAgentPlugin;
    let tool: UpdateSoulTool;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memDB = makeMemDB(rawDb);
        plugin = {
            settings: { memory: { enabled: true } },
            memoryDB: memDB,
            app: {} as never,
        } as unknown as ObsidianAgentPlugin;
        tool = new UpdateSoulTool(plugin);
    });

    it('schema declares the four allowed categories', () => {
        const def = tool.getDefinition();
        const props = def.input_schema.properties as Record<string, { enum?: string[] }>;
        expect(props.category.enum).toEqual(['value', 'anti_pattern', 'identity', 'communication']);
    });

    it('inserts a value fact under profile_id="_obsilo"', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ category: 'value', text: 'Usefulness over politeness' }, ctx);
        const rows = rawDb.exec(
            'SELECT text, topics, profile_id, source_interface, kind FROM facts',
        );
        expect(rows[0].values).toHaveLength(1);
        const row = rows[0].values[0];
        expect(row[0]).toBe('Usefulness over politeness');
        expect(JSON.parse(row[1] as string)).toEqual(['soul', 'value']);
        expect(row[2]).toBe(OBSILO_PROFILE);
        expect(row[3]).toBe('obsilo-self');
        expect(row[4]).toBe('identity');
        expect(results[0]).toContain('Added value');
    });

    it('uses default importance 0.7 when omitted', async () => {
        const { ctx } = makeContext();
        await tool.execute({ category: 'anti_pattern', text: 'No filler phrases' }, ctx);
        const rows = rawDb.exec('SELECT importance FROM facts');
        expect(Number(rows[0].values[0][0])).toBeCloseTo(0.7, 2);
    });

    it('respects custom importance within [0,1]', async () => {
        const { ctx } = makeContext();
        await tool.execute({ category: 'value', text: 'X', importance: 0.9 }, ctx);
        const rows = rawDb.exec('SELECT importance FROM facts');
        expect(Number(rows[0].values[0][0])).toBeCloseTo(0.9, 2);
    });

    it('falls back to default when importance is out of range', async () => {
        const { ctx } = makeContext();
        await tool.execute({ category: 'value', text: 'X', importance: 1.5 }, ctx);
        const rows = rawDb.exec('SELECT importance FROM facts');
        expect(Number(rows[0].values[0][0])).toBeCloseTo(0.7, 2);
    });

    it('rejects invalid category', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ category: 'belief', text: 'X' }, ctx);
        expect(results[0]).toContain('category must be');
        const rows = rawDb.exec('SELECT 1 FROM facts');
        expect(rows.length === 0 || rows[0].values.length === 0).toBe(true);
    });

    it('rejects empty text', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ category: 'value', text: '   ' }, ctx);
        expect(results[0]).toContain('non-empty');
    });

    it('supersedes an existing fact when supersedes id is provided', async () => {
        const { ctx } = makeContext();
        await tool.execute({ category: 'value', text: 'old', importance: 0.5 }, ctx);
        const oldId = rawDb.exec('SELECT id FROM facts WHERE is_latest = 1')[0].values[0][0] as number;

        const { ctx: ctx2, results: results2 } = makeContext();
        await tool.execute({ category: 'value', text: 'new', supersedes: oldId }, ctx2);

        const latest = rawDb.exec('SELECT text FROM facts WHERE is_latest = 1');
        expect(latest[0].values[0][0]).toBe('new');
        const old = rawDb.exec('SELECT is_latest, superseded_by FROM facts WHERE id = ?', [oldId]);
        expect(old[0].values[0][0]).toBe(0);
        expect(old[0].values[0][1]).not.toBeNull();
        expect(results2[0]).toContain('Superseded');
    });

    it('refuses when memory is disabled', async () => {
        plugin.settings.memory.enabled = false;
        const { ctx, results } = makeContext();
        await tool.execute({ category: 'value', text: 'X' }, ctx);
        expect(results[0]).toContain('Memory is disabled');
    });

    it('persists rationale to metadata', async () => {
        const { ctx } = makeContext();
        await tool.execute({ category: 'value', text: 'X', rationale: 'because user said' }, ctx);
        const rows = rawDb.exec('SELECT metadata FROM facts');
        const meta = JSON.parse(rows[0].values[0][0] as string);
        expect(meta.rationale).toBe('because user said');
    });
});
