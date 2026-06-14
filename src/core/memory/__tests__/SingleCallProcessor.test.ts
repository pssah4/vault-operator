import { describe, it, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { SingleCallProcessor, EmptyExtractionError } from '../SingleCallProcessor';
import { ThreadDeltaStore } from '../ThreadDeltaStore';
import { EmbeddingService, type EmbeddingProvider } from '../EmbeddingService';
import type { PendingExtraction } from '../ExtractionQueue';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { MemoryService } from '../MemoryService';
import type { ApiHandler, ApiStream, ApiStreamChunk } from '../../../api/types';

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
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    metadata TEXT,
    CHECK ((to_fact_id IS NOT NULL AND to_external_ref IS NULL) OR
           (to_fact_id IS NULL AND to_external_ref IS NOT NULL))
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
CREATE TABLE conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    last_extracted_message_index INTEGER,
    delta_summary TEXT
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
        isOpen: () => true,
    } as unknown as MemoryDB;
}

class StubEmbeddingProvider implements EmbeddingProvider {
    readonly info = { model: 'stub-4d', provider: 'mock' };
    embed(texts: string[]): Promise<Float32Array[]> {
        return Promise.resolve(texts.map(() => new Float32Array([1, 0, 0, 0])));
    }
}

function mockApi(input: Record<string, unknown>): ApiHandler {
    const chunks: ApiStreamChunk[] = [
        { type: 'tool_use', id: 'tu', name: '_memory_single_call', input },
    ];
    return {
        createMessage: (): ApiStream => (async function*() { for (const c of chunks) yield c; })(),
        getModel: () => ({ id: 'mock', info: { contextWindow: 100000, supportsTools: true, supportsStreaming: true } }),
    };
}

/**
 * The processor calls buildApiHandlerForModel internally; we stub the
 * module so each test can hand back its own scripted ApiHandler.
 */
let nextMockApi: ApiHandler | null = null;
vi.mock('../../../api/index', () => ({
    buildApiHandlerForModel: () => {
        if (!nextMockApi) throw new Error('test setup forgot to assign nextMockApi');
        return nextMockApi;
    },
}));

function makeMemoryService() {
    const writeSessionSummary = vi.fn().mockResolvedValue(undefined);
    return {
        service: { writeSessionSummary } as unknown as MemoryService,
        writeSessionSummary,
    };
}

describe('SingleCallProcessor (PLAN-007 task C.1)', () => {
    let rawDb: SqlJsDatabase;
    let memoryDB: MemoryDB;
    let embeddings: EmbeddingService;
    let memSvc: ReturnType<typeof makeMemoryService>;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memoryDB = makeFakeMemoryDB(rawDb);
        embeddings = new EmbeddingService(new StubEmbeddingProvider());
        memSvc = makeMemoryService();
        nextMockApi = null;
    });

    function buildItem(over: Partial<PendingExtraction> = {}): PendingExtraction {
        return {
            conversationId: 'thread-1',
            messages: [
                { role: 'user', text: 'I prefer Plan-Mode for non-trivial work.' },
                { role: 'assistant', text: 'Got it.' },
            ],
            title: 'Working preferences',
            queuedAt: '2026-04-27T10:00:00Z',
            ...over,
        };
    }

    it('skips when no memory model is configured', async () => {
        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => null,
        });
        await proc.process(buildItem());
        expect(rawDb.exec('SELECT 1 FROM facts').length === 0).toBe(true);
    });

    it('skips when messages is empty', async () => {
        nextMockApi = mockApi({});
        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => ({} as never),
        });
        await proc.process(buildItem({ messages: [] }));
        expect(memSvc.writeSessionSummary).not.toHaveBeenCalled();
    });

    it('runs the full pipeline: extract, integrate, summary, delta save', async () => {
        nextMockApi = mockApi({
            session_summary: 'Sebastian shared Plan-Mode preference.',
            episode_outcome: { success: true, result_summary: 'Acknowledged.' },
            facts: [
                {
                    text: 'Sebastian prefers Plan-Mode',
                    topics: ['workflow'],
                    importance: 0.8,
                    kind: 'preference',
                    relation: 'new',
                },
            ],
            mentions: [],
            conversation_so_far: 'Sebastian set workflow preference.',
            topic_drift_detected: false,
        });

        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => ({} as never),
        });
        await proc.process(buildItem());

        // Fact landed in DB
        const factRow = rawDb.exec('SELECT text, kind, source_thread_id FROM facts');
        expect(factRow[0].values).toHaveLength(1);
        expect(factRow[0].values[0]).toEqual(['Sebastian prefers Plan-Mode', 'preference', 'thread-1']);
        // Embedding stored
        const embRow = rawDb.exec('SELECT 1 FROM fact_embeddings');
        expect(embRow[0].values).toHaveLength(1);
        // Session summary persisted
        expect(memSvc.writeSessionSummary).toHaveBeenCalledWith(
            'thread-1', 'Sebastian shared Plan-Mode preference.', 'Working preferences',
        );
        // Delta state saved
        const delta = new ThreadDeltaStore(memoryDB).get('thread-1');
        expect(delta).toMatchObject({
            threadId: 'thread-1',
            lastExtractedMessageIndex: 1,
            deltaSummary: 'Sebastian set workflow preference.',
        });
    });

    it('respects existing delta state and skips when nothing new', async () => {
        new ThreadDeltaStore(memoryDB).save({
            threadId: 'thread-1',
            lastExtractedMessageIndex: 5,
            deltaSummary: 'prior summary',
        });
        nextMockApi = mockApi({});
        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => ({} as never),
        });
        await proc.process(buildItem({
            // Only 2 messages, indices 0+1 < lastExtractedMessageIndex 5
            messages: [{ role: 'user', text: 'old' }, { role: 'assistant', text: 'old' }],
        }));
        expect(memSvc.writeSessionSummary).not.toHaveBeenCalled();
    });

    it('records single_call + integration telemetry + token budget on full run', async () => {
        nextMockApi = mockApi({
            session_summary: 'Summary here.',
            episode_outcome: { success: true, result_summary: '' },
            facts: [{
                text: 'Sebastian uses Obsidian',
                topics: ['tools'],
                importance: 0.7,
                kind: 'preference',
                relation: 'new',
            }],
            mentions: [],
            conversation_so_far: 'so far',
            topic_drift_detected: false,
        });
        // Force the mock api to surface usage
        const apiWithUsage: ApiHandler = {
            createMessage: (): ApiStream => (async function*() {
                yield { type: 'usage', inputTokens: 100, outputTokens: 30 };
                yield {
                    type: 'tool_use', id: 'tu', name: '_memory_single_call',
                    input: {
                        session_summary: 'Summary',
                        episode_outcome: { success: true, result_summary: '' },
                        facts: [{
                            text: 'Sebastian uses Obsidian', topics: ['tools'],
                            importance: 0.7, kind: 'preference', relation: 'new',
                        }],
                        mentions: [], conversation_so_far: 'so far',
                        topic_drift_detected: false,
                    },
                };
            })(),
            getModel: () => ({ id: 'mock', info: { contextWindow: 100000, supportsTools: true, supportsStreaming: true } }),
        };
        nextMockApi = apiWithUsage;

        const events: Array<{ kind: string; payload: Record<string, unknown> }> = [];
        const telemetry = {
            singleCall: (p: Record<string, unknown>) => { events.push({ kind: 'single_call', payload: p }); return Promise.resolve(); },
            integration: (p: Record<string, unknown>) => { events.push({ kind: 'integration', payload: p }); return Promise.resolve(); },
            budget: (p: Record<string, unknown>) => { events.push({ kind: 'budget', payload: p }); return Promise.resolve(); },
        };

        const budgetState: { day: string; inputTokens: number; outputTokens: number } = {
            day: new Date().toISOString().slice(0, 10),
            inputTokens: 0, outputTokens: 0,
        };
        const { TokenBudgetGuard } = await import('../TokenBudgetGuard');
        const budget = new TokenBudgetGuard({
            loadState: () => ({ ...budgetState }),
            saveState: (s) => { Object.assign(budgetState, s); return Promise.resolve(); },
            thresholds: { dailyInputCap: 1_000_000, dailyOutputCap: 200_000 },
        });

        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => ({} as never),
            tokenBudget: budget,
            telemetry: telemetry as never,
        });
        await proc.process(buildItem());

        expect(events.find(e => e.kind === 'single_call')).toMatchObject({
            kind: 'single_call',
            payload: { factsExtracted: 1, factsRejected: 0, inputTokens: 100, outputTokens: 30 },
        });
        expect(events.find(e => e.kind === 'integration')).toMatchObject({
            kind: 'integration',
            payload: { inserted: 1 },
        });
        expect(budgetState.inputTokens).toBe(100);
        expect(budgetState.outputTokens).toBe(30);
    });

    it('skips extraction when the token budget is exhausted', async () => {
        const events: Array<{ kind: string }> = [];
        const telemetry = {
            singleCall: () => { events.push({ kind: 'single_call' }); return Promise.resolve(); },
            integration: () => Promise.resolve(),
            budget: () => { events.push({ kind: 'budget' }); return Promise.resolve(); },
        };
        // FIX-03-18-01: pin the day key via the today seam so the guard's
        // snapshot() returns the loaded state (instead of falling back to a
        // zero bucket when local-date and UTC-date differ around midnight).
        const today = '2026-05-03';
        const { TokenBudgetGuard } = await import('../TokenBudgetGuard');
        const budget = new TokenBudgetGuard({
            loadState: () => ({ day: today, inputTokens: 5_000_000, outputTokens: 0 }),
            saveState: () => Promise.resolve(),
            thresholds: { dailyInputCap: 1_000_000, dailyOutputCap: 200_000 },
            today: () => today,
        });

        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => ({} as never),
            tokenBudget: budget,
            telemetry: telemetry as never,
        });
        await proc.process(buildItem());

        expect(events.find(e => e.kind === 'budget')).toBeDefined();
        expect(events.find(e => e.kind === 'single_call')).toBeUndefined();
    });

    it('throws EmptyExtractionError when the extractor returns nothing useful (FIX-32-03-03)', async () => {
        nextMockApi = mockApi({
            session_summary: '',
            episode_outcome: { success: true, result_summary: '' },
            facts: [],
            mentions: [],
            conversation_so_far: '',
            topic_drift_detected: false,
        });
        const proc = new SingleCallProcessor({
            memoryService: memSvc.service,
            memoryDB,
            embeddingService: embeddings,
            getMemoryModel: () => ({} as never),
        });
        await expect(proc.process(buildItem())).rejects.toThrowError(EmptyExtractionError);
        // No session summary written -- the throw happens before any DB write
        // and the ExtractionQueue catches the typed error to dequeue silently.
        expect(memSvc.writeSessionSummary).not.toHaveBeenCalled();
    });
});
