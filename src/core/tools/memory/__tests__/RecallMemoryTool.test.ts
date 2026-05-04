import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { RecallMemoryTool } from '../RecallMemoryTool';
import { FactStore } from '../../../memory/FactStore';
import type { MemoryDB } from '../../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../../knowledge/KnowledgeDB';
import type { EmbeddingService } from '../../../memory/EmbeddingService';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

/**
 * IMP-03-17-01: covers Cosine path + Token-overlap fallback.
 *
 * Cosine path requires:
 *   - plugin.embeddingService.isReady() === true
 *   - at least one row in fact_embeddings
 *
 * Fallback path requires neither.
 */

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
CREATE TABLE fact_embeddings (
    fact_id INTEGER PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE fact_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    to_fact_id INTEGER REFERENCES facts(id) ON DELETE CASCADE,
    to_external_ref TEXT,
    edge_type TEXT NOT NULL,
    created_at TEXT NOT NULL
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
        isOpen: () => true,
        markDirty: () => { /* no-op */ },
    } as unknown as MemoryDB;
}

function fakeEmbeddingService(vec: Float32Array, ready = true): EmbeddingService {
    return {
        isReady: () => ready,
        getModelInfo: () => ({ model: 'test-embed', dimensions: vec.length }),
        embed: async () => [vec],
    } as unknown as EmbeddingService;
}

function writeEmbedding(rawDb: SqlJsDatabase, factId: number, vec: Float32Array, model = 'test-embed'): void {
    const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
    rawDb.run(
        `INSERT INTO fact_embeddings (fact_id, embedding, embedding_model, created_at)
         VALUES (?, ?, ?, ?)`,
        [factId, bytes, model, new Date().toISOString()],
    );
}

function makeContext(): { ctx: ToolExecutionContext; results: string[] } {
    const results: string[] = [];
    const ctx = {
        callbacks: {
            pushToolResult: (r: string) => { results.push(r); },
            handleError: async (_tool: string, e: unknown) => {
                results.push('ERROR: ' + (e instanceof Error ? e.message : String(e)));
            },
        },
    } as unknown as ToolExecutionContext;
    return { ctx, results };
}

describe('RecallMemoryTool (IMP-03-17-01: Cosine + fallback)', () => {
    let rawDb: SqlJsDatabase;
    let store: FactStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        store = new FactStore(makeFakeMemoryDB(rawDb));
    });

    it('Cosine path: ranks facts by embedding similarity to query', async () => {
        const f1 = store.insert({
            text: 'Sebastian prefers terse responses without summaries',
            topics: ['communication-style'],
            importance: 0.7,
            kind: 'preference',
            sourceSessionId: 's1', profileId: 'default',
        });
        const f2 = store.insert({
            text: 'Annual report deadline is end of February',
            topics: ['work', 'deadlines'],
            importance: 0.5,
            kind: 'fact',
            sourceSessionId: 's1', profileId: 'default',
        });
        // Aligned with query embedding -> high cosine
        writeEmbedding(rawDb, f1.id, new Float32Array([1.0, 0.0, 0.0]));
        // Orthogonal -> 0 cosine
        writeEmbedding(rawDb, f2.id, new Float32Array([0.0, 1.0, 0.0]));

        const queryVec = new Float32Array([0.95, 0.05, 0.0]);
        const plugin = {
            memoryDB: makeFakeMemoryDB(rawDb),
            embeddingService: fakeEmbeddingService(queryVec),
            conversationStore: { list: () => [] },
        } as unknown as ObsidianAgentPlugin;

        const tool = new RecallMemoryTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ query: 'how does the user want responses?' }, ctx);

        expect(results).toHaveLength(1);
        const out = results[0];
        // f1 ranked first (cosine ~0.998), f2 lower (cosine 0.05)
        const f1Idx = out.indexOf('terse responses');
        const f2Idx = out.indexOf('Annual report');
        expect(f1Idx).toBeGreaterThanOrEqual(0);
        expect(f1Idx).toBeLessThan(f2Idx === -1 ? Number.MAX_SAFE_INTEGER : f2Idx);
    });

    it('Falls back to token overlap when no fact has an embedding', async () => {
        store.insert({
            text: 'Sebastian uses Anthropic Claude for coding tasks',
            topics: ['tooling'],
            importance: 0.6, kind: 'fact',
            sourceSessionId: 's1', profileId: 'default',
        });
        // No fact_embeddings rows -> falls back to token overlap

        const queryVec = new Float32Array([1.0, 0.0]);
        const plugin = {
            memoryDB: makeFakeMemoryDB(rawDb),
            embeddingService: fakeEmbeddingService(queryVec),
            conversationStore: { list: () => [] },
        } as unknown as ObsidianAgentPlugin;

        const tool = new RecallMemoryTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ query: 'anthropic claude usage' }, ctx);

        expect(results).toHaveLength(1);
        expect(results[0]).toContain('Anthropic Claude');
    });

    it('Falls back to token overlap when EmbeddingService is not ready', async () => {
        const f1 = store.insert({
            text: 'EnBW Coworking-Konzept ist im Reverse-Brainstorming-Modus',
            topics: ['enbw', 'coworking'],
            importance: 0.6, kind: 'fact',
            sourceSessionId: 's1', profileId: 'default',
        });
        writeEmbedding(rawDb, f1.id, new Float32Array([1.0, 0.0]));

        const queryVec = new Float32Array([1.0, 0.0]);
        const plugin = {
            memoryDB: makeFakeMemoryDB(rawDb),
            embeddingService: fakeEmbeddingService(queryVec, false), // not ready
            conversationStore: { list: () => [] },
        } as unknown as ObsidianAgentPlugin;

        const tool = new RecallMemoryTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ query: 'enbw coworking' }, ctx);

        expect(results).toHaveLength(1);
        expect(results[0]).toContain('EnBW Coworking');
    });
});
