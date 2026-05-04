import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { HistoryIndexer } from '../HistoryIndexer';
import type { HistoryDB } from '../../knowledge/HistoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type {
    ConversationData, ConversationMeta, ConversationStore, UiMessage,
} from '../../history/ConversationStore';

const SCHEMA = `
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

function makeHistoryDB(rawDb: SqlJsDatabase): HistoryDB {
    return {
        getDB: () => rawDb,
        markDirty: () => undefined,
        isOpen: () => true,
        save: () => Promise.resolve(),
    } as unknown as HistoryDB;
}

function makeStore(metas: ConversationMeta[], data: Record<string, ConversationData>): ConversationStore {
    return {
        list: () => metas,
        load: (id: string) => Promise.resolve(data[id] ?? null),
    } as unknown as ConversationStore;
}

function makeMeta(id: string, title = `Title ${id}`): ConversationMeta {
    return {
        id, title, mode: 'agent', model: 'mock',
        created: '2026-04-28T10:00:00Z',
        updated: '2026-04-28T11:00:00Z',
        messageCount: 0,
        inputTokens: 0,
        outputTokens: 0,
    };
}

function makeMsg(role: 'user' | 'assistant', text: string, ts = '2026-04-28T10:00:00Z'): UiMessage {
    return { role, text, ts };
}

describe('HistoryIndexer (FEATURE-0320 Phase 6)', () => {
    let rawDb: SqlJsDatabase;
    let historyDB: HistoryDB;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        historyDB = makeHistoryDB(rawDb);
    });

    it('backfills all conversations into history_chunks', async () => {
        const meta = makeMeta('conv-1');
        const store = makeStore([meta], {
            'conv-1': {
                meta,
                messages: [],
                uiMessages: [
                    makeMsg('user', 'hello there'),
                    makeMsg('assistant', 'hello back'),
                ],
            },
        });
        const indexer = new HistoryIndexer(historyDB, store);
        const report = await indexer.backfillAll();
        expect(report.conversationsScanned).toBe(1);
        expect(report.chunksInserted).toBe(2);
        const rows = rawDb.exec('SELECT session_id, chunk_index, role, text FROM history_chunks ORDER BY chunk_index');
        expect(rows[0].values).toHaveLength(2);
        expect(rows[0].values[0]).toEqual(['conv-1', 0, 'user', 'hello there']);
    });

    it('is idempotent on a second backfill of the same conversation', async () => {
        const meta = makeMeta('conv-1');
        const store = makeStore([meta], {
            'conv-1': {
                meta, messages: [],
                uiMessages: [makeMsg('user', 'hi')],
            },
        });
        const indexer = new HistoryIndexer(historyDB, store);
        const r1 = await indexer.backfillAll();
        const r2 = await indexer.backfillAll();
        expect(r1.chunksInserted).toBe(1);
        expect(r2.chunksInserted).toBe(0);
        expect(r2.chunksSkipped).toBe(1);
        const rows = rawDb.exec('SELECT COUNT(*) FROM history_chunks');
        expect(rows[0].values[0][0]).toBe(1);
    });

    it('incremental update appends only new tail messages', async () => {
        const meta = makeMeta('conv-1');
        const initial: UiMessage[] = [makeMsg('user', 'm1'), makeMsg('assistant', 'm2')];
        const indexer = new HistoryIndexer(historyDB, makeStore([meta], { 'conv-1': { meta, messages: [], uiMessages: initial } }));
        await indexer.backfillAll();

        // Two new messages appended.
        const extended: UiMessage[] = [...initial, makeMsg('user', 'm3'), makeMsg('assistant', 'm4')];
        await indexer.onConversationSaved('conv-1', extended);

        const rows = rawDb.exec('SELECT chunk_index, text FROM history_chunks ORDER BY chunk_index');
        expect(rows[0].values).toHaveLength(4);
        expect(rows[0].values[2][1]).toBe('m3');
        expect(rows[0].values[3][1]).toBe('m4');
    });

    it('skips empty/whitespace-only messages', async () => {
        const meta = makeMeta('conv-1');
        const store = makeStore([meta], {
            'conv-1': {
                meta, messages: [],
                uiMessages: [
                    makeMsg('user', '  '),
                    makeMsg('assistant', 'real reply'),
                ],
            },
        });
        const indexer = new HistoryIndexer(historyDB, store);
        const report = await indexer.backfillAll();
        expect(report.chunksInserted).toBe(1);
        const rows = rawDb.exec('SELECT text FROM history_chunks');
        expect(rows[0].values[0][0]).toBe('real reply');
    });

    it('respects an aborted backfill', async () => {
        const metas = [makeMeta('a'), makeMeta('b'), makeMeta('c')];
        const store = makeStore(metas, {
            a: { meta: metas[0], messages: [], uiMessages: [makeMsg('user', 'a-text')] },
            b: { meta: metas[1], messages: [], uiMessages: [makeMsg('user', 'b-text')] },
            c: { meta: metas[2], messages: [], uiMessages: [makeMsg('user', 'c-text')] },
        });
        const indexer = new HistoryIndexer(historyDB, store);
        const ctl = new AbortController();
        ctl.abort();
        const report = await indexer.backfillAll(ctl.signal);
        expect(report.conversationsScanned).toBe(0);
        expect(report.chunksInserted).toBe(0);
    });
});
