import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { InspectSelfTool } from '../InspectSelfTool';
import { OBSILO_PROFILE } from '../../../memory/SoulView';
import { FactStore } from '../../../memory/FactStore';
import type { MemoryDB } from '../../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../../knowledge/KnowledgeDB';
import type { ToolExecutionContext, ToolDefinition } from '../../types';
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

interface FakeTool {
    name: string;
    isWriteOperation: boolean;
    getDefinition(): ToolDefinition;
}

function makePlugin(memDB: MemoryDB | null, tools: FakeTool[]): ObsidianAgentPlugin {
    return {
        settings: {
            memory: { enabled: true, autoExtractSessions: true },
            providers: { anthropic: { apiKey: 'sk-secret-123' } },
            myToken: 'super-secret',
            nestedThing: { credential: 'shhh', notes: 'visible' },
        },
        memoryDB: memDB,
        toolRegistry: {
            getAllTools: () => tools,
        } as unknown as ObsidianAgentPlugin['toolRegistry'],
        app: {} as never,
    } as unknown as ObsidianAgentPlugin;
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

const fakeTools: FakeTool[] = [
    {
        name: 'mark_for_memory',
        isWriteOperation: false,
        getDefinition: () => ({
            name: 'mark_for_memory',
            description: 'Save current chat to memory',
            input_schema: { type: 'object', properties: {} },
        }),
    },
    {
        name: 'write_file',
        isWriteOperation: true,
        getDefinition: () => ({
            name: 'write_file',
            description: 'Write a file to vault',
            input_schema: { type: 'object', properties: {} },
        }),
    },
];

describe('InspectSelfTool (PLAN-008 task B.5)', () => {
    let rawDb: SqlJsDatabase;
    let memDB: MemoryDB;
    let plugin: ObsidianAgentPlugin;
    let tool: InspectSelfTool;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memDB = makeMemDB(rawDb);
        plugin = makePlugin(memDB, fakeTools);
        tool = new InspectSelfTool(plugin);
    });

    it('schema declares the four allowed areas', () => {
        const def = tool.getDefinition();
        const props = def.input_schema.properties as Record<string, { enum?: string[] }>;
        expect(props.area.enum).toEqual(['settings', 'tools', 'capabilities', 'code']);
    });

    it('rejects invalid area', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ area: 'random' }, ctx);
        expect(results[0]).toContain('area must be');
    });

    it('settings area redacts sensitive keys', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ area: 'settings' }, ctx);
        const md = results[0];
        expect(md).toContain('## Current settings');
        expect(md).toContain('<redacted>');
        expect(md).not.toContain('sk-secret-123');
        expect(md).not.toContain('super-secret');
        expect(md).not.toContain('shhh');
        // Non-sensitive nested string preserved
        expect(md).toContain('visible');
    });

    it('tools area lists registered tools with name + description', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ area: 'tools' }, ctx);
        const md = results[0];
        expect(md).toContain('## Registered tools');
        expect(md).toContain('Total: 2');
        expect(md).toContain('**mark_for_memory**');
        expect(md).toContain('**write_file** (write)');
        expect(md).toContain('Save current chat to memory');
    });

    it('capabilities area returns capability snapshot from Memory v2', async () => {
        const factStore = new FactStore(memDB);
        factStore.insert({
            text: 'Star icon toggles save', topics: ['capability', 'ui'],
            kind: 'identity', profileId: OBSILO_PROFILE, importance: 0.8,
        });
        factStore.insert({
            text: 'recall_memory searches facts by meaning', topics: ['capability', 'tool'],
            kind: 'identity', profileId: OBSILO_PROFILE, importance: 0.8,
        });

        const { ctx, results } = makeContext();
        await tool.execute({ area: 'capabilities' }, ctx);
        const md = results[0];
        expect(md).toContain('## Capabilities');
        expect(md).toContain('### tool');
        expect(md).toContain('### ui');
        expect(md).toContain('Star icon toggles save');
        expect(md).toContain('recall_memory searches facts by meaning');
    });

    it('capabilities area handles closed memoryDB gracefully', async () => {
        plugin = makePlugin(null, fakeTools);
        tool = new InspectSelfTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ area: 'capabilities' }, ctx);
        expect(results[0]).toContain('not open');
    });

    it('code area returns Phase 2 placeholder', async () => {
        const { ctx, results } = makeContext();
        await tool.execute({ area: 'code', topic: 'memory' }, ctx);
        expect(results[0]).toContain('not yet implemented');
        expect(results[0]).toContain('area=tools');
    });
});
