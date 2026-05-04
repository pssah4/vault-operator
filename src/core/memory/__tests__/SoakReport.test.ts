import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { generateSoakReport } from '../SoakReport';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { HistoryDB } from '../../knowledge/HistoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { ConversationStore, ConversationMeta } from '../../history/ConversationStore';
import type { ExtractionQueue } from '../ExtractionQueue';

const MEM_SCHEMA = `
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
    metadata TEXT
);
CREATE TABLE fact_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_fact_id INTEGER NOT NULL,
    to_fact_id INTEGER,
    to_external_ref TEXT,
    edge_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    metadata TEXT
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
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    source TEXT DEFAULT 'human',
    created_at TEXT NOT NULL
);
`;

const HIST_SCHEMA = `
CREATE TABLE history_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    tokens INTEGER,
    created_at TEXT NOT NULL,
    embedding BLOB,
    embedding_model TEXT,
    metadata TEXT,
    UNIQUE(session_id, chunk_index)
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        isOpen: () => true,
        getSchemaVersion: () => 4,
        markDirty: () => undefined,
    } as unknown as MemoryDB;
}

function makeHistoryDB(rawDb: SqlJsDatabase): HistoryDB {
    return {
        getDB: () => rawDb,
        isOpen: () => true,
        getSchemaVersion: () => 1,
    } as unknown as HistoryDB;
}

function makeConversationStore(metas: ConversationMeta[]): ConversationStore {
    return { list: () => metas } as unknown as ConversationStore;
}

function makeQueue(opts: {
    size: number;
    disabled: boolean;
    reason: string | null;
    lastEnqueuedAt?: Map<string, number>;
}): ExtractionQueue {
    return {
        size: () => opts.size,
        isSessionDisabled: () => opts.disabled,
        getSessionDisabledReason: () => opts.reason,
        lastEnqueuedAt: opts.lastEnqueuedAt ?? new Map<string, number>(),
    } as unknown as ExtractionQueue;
}

describe('generateSoakReport', () => {
    let memDb: SqlJsDatabase;
    let histDb: SqlJsDatabase;

    beforeEach(async () => {
        const sql = await getSQL();
        memDb = new sql.Database() as unknown as SqlJsDatabase;
        for (const stmt of MEM_SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            memDb.run(stmt + ';');
        }
        histDb = new sql.Database() as unknown as SqlJsDatabase;
        for (const stmt of HIST_SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            histDb.run(stmt + ';');
        }
    });

    it('returns baseline zeros when stores are empty', () => {
        const report = generateSoakReport({
            memoryDB: makeMemoryDB(memDb),
            historyDB: makeHistoryDB(histDb),
            conversationStore: makeConversationStore([]),
            extractionQueue: makeQueue({ size: 0, disabled: false, reason: null }),
            settings: { memory: {} },
        });
        expect(report.schema).toEqual({ memoryDb: 4, historyDb: 1 });
        expect(report.counts.factsLatest).toBe(0);
        expect(report.counts.factsTotal).toBe(0);
        expect(report.counts.factsByKind).toEqual({});
        expect(report.counts.historyChunks).toBe(0);
        expect(report.counts.edges).toBe(0);
        expect(report.counts.conversationsInStore).toBe(0);
        expect(report.aging).toEqual({ lastRunAt: null, sinceLastRunHours: null });
        expect(report.tokenBudget).toBeNull();
        expect(report.top.byImportance).toEqual([]);
        expect(report.top.byConfirmationCount).toEqual([]);
        expect(report.top.byUseCount).toEqual([]);
        expect(report.queueState.pendingItems).toBe(0);
        expect(report.queueState.sessionDisabled).toBe(false);
    });

    it('counts facts by kind, soul facts, capability facts, edges', () => {
        const now = new Date().toISOString();
        const insert = (kind: string, profile: string, topics: string[], importance = 0.5) => {
            memDb.run(
                `INSERT INTO facts (text, topics, importance, kind, created_at, last_confirmed_at, profile_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [`text-${kind}`, JSON.stringify(topics), importance, kind, now, now, profile],
            );
        };
        insert('preference', 'default', ['emojis']);
        insert('fact', 'default', ['work']);
        insert('identity', '_obsilo', ['soul'], 0.9);
        insert('fact', '_obsilo', ['capability'], 0.8);
        memDb.run(
            `INSERT INTO fact_edges (from_fact_id, to_external_ref, edge_type, created_at)
             VALUES (1, 'thread://abc', 'extracted_from', ?)`,
            [now],
        );

        const report = generateSoakReport({
            memoryDB: makeMemoryDB(memDb),
            historyDB: makeHistoryDB(histDb),
            conversationStore: makeConversationStore([
                { id: 'a', title: 'A' } as ConversationMeta,
                { id: 'b', title: 'B' } as ConversationMeta,
            ]),
            extractionQueue: makeQueue({ size: 0, disabled: false, reason: null }),
            settings: { memory: {} },
        });

        expect(report.counts.factsLatest).toBe(4);
        expect(report.counts.factsByKind).toEqual({ preference: 1, fact: 2, identity: 1 });
        expect(report.counts.soulFacts).toBe(1);
        expect(report.counts.capabilityFacts).toBe(1);
        expect(report.counts.edges).toBe(1);
        expect(report.counts.conversationsInStore).toBe(2);
    });

    it('populates top.byImportance / byConfirmationCount / byUseCount', () => {
        const now = new Date().toISOString();
        memDb.run(
            `INSERT INTO facts (text, topics, importance, kind, created_at, last_confirmed_at,
                                confirmation_count, use_count)
             VALUES ('high-imp', '[]', 0.95, 'fact', ?, ?, 1, 0),
                    ('mid-imp', '[]', 0.7, 'fact', ?, ?, 5, 3),
                    ('low-imp', '[]', 0.2, 'fact', ?, ?, 2, 7)`,
            [now, now, now, now, now, now],
        );
        const report = generateSoakReport({
            memoryDB: makeMemoryDB(memDb),
            historyDB: null,
            conversationStore: null,
            extractionQueue: null,
            settings: { memory: {} },
        });
        expect(report.top.byImportance[0]?.text).toBe('high-imp');
        expect(report.top.byImportance[0]?.importance).toBeCloseTo(0.95, 2);
        expect(report.top.byConfirmationCount[0]?.text).toBe('mid-imp');
        expect(report.top.byUseCount[0]?.text).toBe('low-imp');
    });

    it('counts integration audit ops within last 24h only', () => {
        const recent = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        memDb.run(
            `INSERT INTO memory_audit (timestamp, operation) VALUES
              (?, 'insert'), (?, 'insert'),
              (?, 'supersede'),
              (?, 'deprecate'),
              (?, 'insert')`,
            [recent, recent, recent, recent, old],
        );
        const report = generateSoakReport({
            memoryDB: makeMemoryDB(memDb),
            historyDB: null,
            conversationStore: null,
            extractionQueue: null,
            settings: { memory: {} },
        });
        expect(report.integrationStats.recentInsertedFromAudit24h).toBe(2);
        expect(report.integrationStats.recentSupersededFromAudit24h).toBe(1);
        expect(report.integrationStats.recentDeprecatedFromAudit24h).toBe(1);
    });

    it('derives aging.sinceLastRunHours from settings.memory.lastAgingRunAt', () => {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        const report = generateSoakReport({
            memoryDB: null,
            historyDB: null,
            conversationStore: null,
            extractionQueue: null,
            settings: { memory: { lastAgingRunAt: fourHoursAgo } },
        });
        expect(report.aging.lastRunAt).toBe(fourHoursAgo);
        expect(report.aging.sinceLastRunHours ?? 0).toBeGreaterThan(3.9);
        expect(report.aging.sinceLastRunHours ?? 0).toBeLessThan(4.1);
    });

    it('passes through tokenBudgetState when present', () => {
        const report = generateSoakReport({
            memoryDB: null,
            historyDB: null,
            conversationStore: null,
            extractionQueue: null,
            settings: {
                memory: {
                    tokenBudgetState: { day: '2026-04-28', inputTokens: 12345, outputTokens: 678 },
                },
            },
        });
        expect(report.tokenBudget).toEqual({
            day: '2026-04-28',
            inputTokens: 12345,
            outputTokens: 678,
        });
    });

    it('reports throttle window + recently-enqueued count from queue map', () => {
        const map = new Map<string, number>();
        map.set('conv-recent', Date.now() - 5_000);
        map.set('conv-old', Date.now() - 10 * 60 * 1000);
        const report = generateSoakReport({
            memoryDB: null,
            historyDB: null,
            conversationStore: null,
            extractionQueue: makeQueue({
                size: 2,
                disabled: false,
                reason: null,
                lastEnqueuedAt: map,
            }),
            settings: { memory: { reExtractThrottleMs: 60_000 } },
        });
        expect(report.throttle.windowMs).toBe(60_000);
        expect(report.throttle.trackedConversations).toBe(2);
        expect(report.throttle.recentlyEnqueued).toBe(1);
        expect(report.queueState.pendingItems).toBe(2);
    });

    it('reports queue session-disabled state', () => {
        const report = generateSoakReport({
            memoryDB: null,
            historyDB: null,
            conversationStore: null,
            extractionQueue: makeQueue({
                size: 0,
                disabled: true,
                reason: 'budget exceeded',
            }),
            settings: { memory: {} },
        });
        expect(report.queueState.sessionDisabled).toBe(true);
        expect(report.queueState.sessionDisabledReason).toBe('budget exceeded');
    });

    it('counts history_chunks when historyDB is present', () => {
        const now = new Date().toISOString();
        histDb.run(
            `INSERT INTO history_chunks (session_id, chunk_index, role, text, created_at)
             VALUES ('s1', 0, 'user', 'hello', ?), ('s1', 1, 'assistant', 'hi', ?)`,
            [now, now],
        );
        const report = generateSoakReport({
            memoryDB: null,
            historyDB: makeHistoryDB(histDb),
            conversationStore: null,
            extractionQueue: null,
            settings: { memory: {} },
        });
        expect(report.counts.historyChunks).toBe(2);
    });

    it('survives a closed memoryDB without throwing', () => {
        const closedMem = {
            getDB: () => { throw new Error('closed'); },
            isOpen: () => false,
            getSchemaVersion: () => 0,
        } as unknown as MemoryDB;
        const report = generateSoakReport({
            memoryDB: closedMem,
            historyDB: null,
            conversationStore: null,
            extractionQueue: null,
            settings: { memory: {} },
        });
        expect(report.counts.factsLatest).toBe(0);
        expect(report.schema.memoryDb).toBe(0);
    });
});
