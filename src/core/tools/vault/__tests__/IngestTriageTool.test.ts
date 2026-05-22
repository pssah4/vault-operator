import { describe, it, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { IngestTriageTool } from '../IngestTriageTool';
import { IngestTriageLogStore } from '../../../ingest/IngestTriageLogStore';
import { ClusterSourceStatsStore } from '../../../knowledge/ClusterSourceStatsStore';
import type { KnowledgeDB } from '../../../knowledge/KnowledgeDB';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

/**
 * IngestTriageTool-Tests: Pipeline (Cluster-Match, Source-Diversity-Check,
 * Decision-Persistierung, Markdown-Output).
 */

type SqlJsDb = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ontology (entity_path TEXT NOT NULL, cluster TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', confidence REAL NOT NULL DEFAULT 1.0, source TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(entity_path, cluster));
CREATE TABLE IF NOT EXISTS cluster_source_stats (cluster TEXT NOT NULL, source_domain TEXT NOT NULL, note_count INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, PRIMARY KEY (cluster, source_domain));
CREATE TABLE IF NOT EXISTS ingest_triage_log (id INTEGER PRIMARY KEY AUTOINCREMENT, source_uri TEXT NOT NULL, triaged_at TEXT NOT NULL, decision TEXT NOT NULL, decision_reason TEXT, UNIQUE(source_uri));
`;

function makeMockKnowledgeDB(db: SqlJsDb): KnowledgeDB {
    return {
        isOpen: () => true,
        getDB: () => db as never,
        markDirty: () => {},
    } as unknown as KnowledgeDB;
}

async function freshSetup() {
    const SQL = await initSqlJs();
    const sqlDb = new SQL.Database();
    sqlDb.exec(SCHEMA);
    const db = sqlDb as unknown as SqlJsDb;
    const knowledgeDB = makeMockKnowledgeDB(db);
    const triageStore = new IngestTriageLogStore(knowledgeDB);
    const sourceStats = new ClusterSourceStatsStore(knowledgeDB);
    return { db, knowledgeDB, triageStore, sourceStats };
}

function makeMockPlugin(stores: Awaited<ReturnType<typeof freshSetup>>, frontmatterMap: Record<string, Record<string, unknown>> = {}) {
    return {
        knowledgeDB: stores.knowledgeDB,
        ingestTriageLogStore: stores.triageStore,
        clusterSourceStatsStore: stores.sourceStats,
        app: {
            vault: {
                getAbstractFileByPath: (path: string) => {
                    if (path in frontmatterMap) {
                        return Object.assign(Object.create({}), { path, basename: path.split('/').pop()?.replace(/\.md$/, '') });
                    }
                    return null;
                },
            },
            metadataCache: {
                getFileCache: (file: { path: string }) => {
                    return frontmatterMap[file.path] ? { frontmatter: frontmatterMap[file.path] } : null;
                },
            },
        },
    } as unknown as ObsidianAgentPlugin;
}

function makeMockCtx() {
    const results: string[] = [];
    return {
        ctx: {
            taskId: 'test',
            mode: 'test',
            callbacks: {
                pushToolResult: (r: string) => { results.push(r); },
            },
        } as unknown as ToolExecutionContext,
        results,
    };
}

// Hack: TFile-instanceof check in IngestTriageTool requires real TFile.
// Workaround: stub vault.getAbstractFileByPath to return objects that pass instanceof checks via Object.create chain.
// For tests we sidestep by NOT testing the file-fetch path (instead, focus on URL-Sources where domain is parsed from URI).

describe('IngestTriageTool', () => {
    let stores: Awaited<ReturnType<typeof freshSetup>>;
    let tool: IngestTriageTool;

    beforeEach(async () => {
        stores = await freshSetup();
    });

    it('records pending decision for new URL source', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'https://example.com/article', cluster_hint: 'Tech' }, ctx);

        expect(results.length).toBe(1);
        expect(results[0]).toContain('Triage-Karte');
        expect(results[0]).toContain('https://example.com/article');
        expect(results[0]).toContain('Cluster-Match**: Tech');
        expect(results[0]).toContain('Source-Domain**: example.com');
        expect(results[0]).toContain('Status**: erstmals triaged');
        expect(stores.triageStore.exists('https://example.com/article')).toBe(true);
        expect(stores.triageStore.get('https://example.com/article')?.decision).toBe('pending');
    });

    it('updates existing decision when triaged again', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx } = makeMockCtx();

        await tool.execute({ source_uri: 'https://x.com/y', cluster_hint: 'Tech' }, ctx);
        await tool.execute({ source_uri: 'https://x.com/y', cluster_hint: 'Tech', decision: 'ingest' }, ctx);

        expect(stores.triageStore.get('https://x.com/y')?.decision).toBe('ingest');
    });

    it('fires concentration warning when single domain dominates cluster', async () => {
        // Stage 9 medium.com + 1 github.com im Cluster Tech -> dominant 90%
        for (let i = 0; i < 9; i++) stores.sourceStats.incrementCount('Tech', 'medium.com');
        stores.sourceStats.incrementCount('Tech', 'github.com');

        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'https://medium.com/another-article', cluster_hint: 'Tech' }, ctx);

        expect(results[0]).toContain('Source-Diversity-Warnung');
        expect(results[0]).toContain('medium.com');
        expect(results[0]).toContain('Echo-Chamber');
    });

    it('does NOT fire concentration warning below 0.7 threshold', async () => {
        // 5 medium.com + 5 github.com = 50% jeder
        for (let i = 0; i < 5; i++) stores.sourceStats.incrementCount('Tech', 'medium.com');
        for (let i = 0; i < 5; i++) stores.sourceStats.incrementCount('Tech', 'github.com');

        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'https://medium.com/x', cluster_hint: 'Tech' }, ctx);

        expect(results[0]).not.toContain('Source-Diversity-Warnung');
    });

    it('handles missing cluster gracefully', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'https://unknown.com/x' }, ctx);

        expect(results[0]).toContain('Cluster-Match**: (kein Match');
    });

    it('AUDIT-014 H-1: rejects vault-path with parent-traversal', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'vault://../../etc/passwd' }, ctx);
        expect(results[0]).toContain('ungueltiger vault-path');
        expect(stores.triageStore.exists('vault://../../etc/passwd')).toBe(false);
    });

    it('AUDIT-014 H-1: rejects vault-path with NUL char', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'vault://valid/path\0/with-nul.md' }, ctx);
        expect(results[0]).toContain('ungueltiger vault-path');
    });

    it('AUDIT-014 H-1: rejects URL-encoded path traversal', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'vault://%2e%2e/secret' }, ctx);
        expect(results[0]).toContain('ungueltiger vault-path');
    });

    it('AUDIT-014 H-1: accepts normal vault-path', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'vault://Notes/Article.md', cluster_hint: 'Tech' }, ctx);
        // Sollte normal triagen, nicht rejecten
        expect(results[0]).toContain('Triage-Karte');
        expect(results[0]).not.toContain('ungueltiger vault-path');
    });

    it('BUG-029 (Issue #312): rejects file:// URIs with skill-workflow hint', async () => {
        const plugin = makeMockPlugin(stores);
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'file:///enbw-geschaeftsbericht-2025.pdf' }, ctx);

        expect(results[0]).toContain('akzeptiert keine file://-URIs');
        expect(results[0]).toContain('Chat-Attachments leben nur einen Turn');
        expect(results[0]).toContain('vault://Attachements/');
        // Decision-Log darf NICHT geschrieben werden -- sonst denkt der Agent
        // beim naechsten Trigger, die Source sei bereits triaged.
        expect(stores.triageStore.exists('file:///enbw-geschaeftsbericht-2025.pdf')).toBe(false);
    });

    it('returns error when knowledgeDB unavailable', async () => {
        const plugin = {
            knowledgeDB: null,
            ingestTriageLogStore: null,
            clusterSourceStatsStore: null,
            app: { vault: {}, metadataCache: { getFileCache: () => null } },
        } as unknown as ObsidianAgentPlugin;
        tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute({ source_uri: 'https://x.com/y' }, ctx);

        expect(results[0]).toContain('Plugin nicht vollstaendig initialisiert');
    });
});

/**
 * Related-context search: triage card must surface related notes (Vault),
 * facts (MemoryDB), and chats (HistoryDB) when a query is given or can be
 * derived. Implements the user-visible behaviour expected from a real
 * sense-making triage (not just a 10-second cluster lookup).
 */
describe('IngestTriageTool -- related-context search', () => {
    function makeSemanticIndexStub(hits: Array<{ path: string; excerpt: string; score: number }>) {
        return {
            isIndexed: true,
            search: vi.fn().mockResolvedValue(hits),
        };
    }

    function makePluginWithIndexes(
        stores: Awaited<ReturnType<typeof freshSetup>>,
        opts: {
            semanticIndex?: ReturnType<typeof makeSemanticIndexStub> | null;
            memoryDB?: SqlJsDb | null;
            historyDB?: SqlJsDb | null;
        } = {},
    ): ObsidianAgentPlugin {
        const memoryDB = opts.memoryDB
            ? ({ isOpen: () => true, getDB: () => opts.memoryDB as never })
            : null;
        const historyDB = opts.historyDB
            ? ({ isOpen: () => true, getDB: () => opts.historyDB as never })
            : null;
        return {
            knowledgeDB: stores.knowledgeDB,
            ingestTriageLogStore: stores.triageStore,
            clusterSourceStatsStore: stores.sourceStats,
            semanticIndex: opts.semanticIndex ?? null,
            memoryDB,
            historyDB,
            conversationStore: { list: () => [] },
            app: {
                vault: { getAbstractFileByPath: () => null },
                metadataCache: { getFileCache: () => null },
            },
        } as unknown as ObsidianAgentPlugin;
    }

    async function makeMemoryDb(facts: Array<{ id: number; text: string; topics: string[] }>): Promise<SqlJsDb> {
        const SQL = await initSqlJs();
        const db = new SQL.Database() as unknown as SqlJsDb;
        db.exec(`CREATE TABLE facts (
            id INTEGER PRIMARY KEY, text TEXT, topics TEXT, importance REAL,
            kind TEXT, created_at TEXT, last_confirmed_at TEXT, confirmation_count INTEGER,
            use_count INTEGER, source_session_id TEXT, source_thread_id TEXT,
            source_interface TEXT, source_uri TEXT, profile_id TEXT, is_latest INTEGER,
            deprecated_at TEXT, metadata TEXT
        );`);
        for (const f of facts) {
            db.run(
                `INSERT INTO facts (id, text, topics, importance, kind, created_at, last_confirmed_at, confirmation_count, use_count, source_interface, profile_id, is_latest) VALUES (?, ?, ?, 0.8, 'fact', ?, ?, 1, 0, 'obsilo', 'default', 1)`,
                [f.id, f.text, JSON.stringify(f.topics), new Date().toISOString(), new Date().toISOString()],
            );
        }
        return db;
    }

    async function makeHistoryDb(chunks: Array<{ session: string; role: string; text: string }>): Promise<SqlJsDb> {
        const SQL = await initSqlJs();
        const db = new SQL.Database() as unknown as SqlJsDb;
        db.exec(`CREATE TABLE history_chunks (
            session_id TEXT, chunk_index INTEGER, role TEXT, text TEXT, created_at TEXT
        );`);
        for (let i = 0; i < chunks.length; i++) {
            db.run(
                `INSERT INTO history_chunks VALUES (?, ?, ?, ?, ?)`,
                [chunks[i].session, i, chunks[i].role, chunks[i].text, new Date().toISOString()],
            );
        }
        return db;
    }

    let stores: Awaited<ReturnType<typeof freshSetup>>;
    beforeEach(async () => {
        stores = await freshSetup();
    });

    it('includes Related Notes (Vault) section when semanticIndex has hits', async () => {
        const semanticIndex = makeSemanticIndexStub([
            { path: 'Notes/RelatedA.md', excerpt: 'Excerpt A talking about LLM evals', score: 0.91 },
            { path: 'Notes/RelatedB.md', excerpt: 'Excerpt B on benchmark design', score: 0.77 },
        ]);
        const plugin = makePluginWithIndexes(stores, { semanticIndex });
        const tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute(
            { source_uri: 'https://example.com/llm-evals', cluster_hint: 'AI', query: 'LLM eval benchmarks' },
            ctx,
        );

        expect(results[0]).toContain('Verwandte Notes (Vault)');
        expect(results[0]).toContain('Notes/RelatedA.md');
        expect(results[0]).toContain('Notes/RelatedB.md');
        expect(semanticIndex.search).toHaveBeenCalledWith('LLM eval benchmarks', expect.any(Number));
    });

    it('includes Related Facts (Memory) section when memoryDB has matching facts', async () => {
        const memoryDB = await makeMemoryDb([
            { id: 1, text: 'User prefers Anthropic SDK over OpenAI SDK', topics: ['provider', 'preference'] },
            { id: 2, text: 'LLM eval methodology should be reproducible', topics: ['eval', 'methodology'] },
            { id: 3, text: 'Unrelated note about coffee preferences', topics: ['coffee'] },
        ]);
        const plugin = makePluginWithIndexes(stores, { memoryDB });
        const tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute(
            { source_uri: 'https://example.com/llm-evals', cluster_hint: 'AI', query: 'LLM eval methodology' },
            ctx,
        );

        expect(results[0]).toContain('Verwandte Facts (Memory)');
        expect(results[0]).toContain('LLM eval methodology should be reproducible');
        // Unrelated coffee fact should NOT match
        expect(results[0]).not.toContain('coffee preferences');
    });

    it('includes Related Chats (History) section when historyDB has matching messages', async () => {
        const historyDB = await makeHistoryDb([
            { session: 'sess-1', role: 'user', text: 'Yesterday we talked about LLM eval frameworks' },
            { session: 'sess-2', role: 'assistant', text: 'There are several eval libraries worth comparing' },
            { session: 'sess-3', role: 'user', text: 'Completely unrelated message about lunch' },
        ]);
        const plugin = makePluginWithIndexes(stores, { historyDB });
        const tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute(
            { source_uri: 'https://example.com/eval', cluster_hint: 'AI', query: 'eval' },
            ctx,
        );

        expect(results[0]).toContain('Verwandte Chats (History)');
        expect(results[0]).toContain('LLM eval frameworks');
        expect(results[0]).toContain('eval libraries worth comparing');
        expect(results[0]).not.toContain('lunch');
    });

    it('skip_search=true suppresses all related-context sections', async () => {
        const semanticIndex = makeSemanticIndexStub([
            { path: 'Notes/X.md', excerpt: 'X', score: 0.9 },
        ]);
        const memoryDB = await makeMemoryDb([
            { id: 1, text: 'LLM eval matters', topics: ['llm'] },
        ]);
        const historyDB = await makeHistoryDb([
            { session: 's1', role: 'user', text: 'LLM eval discussion' },
        ]);
        const plugin = makePluginWithIndexes(stores, { semanticIndex, memoryDB, historyDB });
        const tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute(
            { source_uri: 'https://x.com/y', cluster_hint: 'AI', query: 'LLM eval', skip_search: true },
            ctx,
        );

        expect(results[0]).not.toContain('Verwandte Notes');
        expect(results[0]).not.toContain('Verwandte Facts');
        expect(results[0]).not.toContain('Verwandte Chats');
        expect(semanticIndex.search).not.toHaveBeenCalled();
    });

    it('gracefully degrades when no indexes are available (still renders basic triage)', async () => {
        const plugin = makePluginWithIndexes(stores, {});
        const tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute(
            { source_uri: 'https://example.com/y', cluster_hint: 'AI', query: 'something' },
            ctx,
        );

        // Basic triage card still works
        expect(results[0]).toContain('Triage-Karte');
        expect(results[0]).toContain('Cluster-Match**: AI');
        // No search sections (silently dropped)
        expect(results[0]).not.toContain('Verwandte Notes');
        expect(results[0]).not.toContain('Verwandte Facts');
        expect(results[0]).not.toContain('Verwandte Chats');
    });

    it('combines all three search sections when all indexes have hits', async () => {
        const semanticIndex = makeSemanticIndexStub([
            { path: 'Notes/Eval.md', excerpt: 'Eval methodology notes', score: 0.88 },
        ]);
        const memoryDB = await makeMemoryDb([
            { id: 1, text: 'User prefers reproducible eval setups', topics: ['eval', 'preference'] },
        ]);
        const historyDB = await makeHistoryDb([
            { session: 's1', role: 'user', text: 'We discussed eval reproducibility' },
        ]);
        const plugin = makePluginWithIndexes(stores, { semanticIndex, memoryDB, historyDB });
        const tool = new IngestTriageTool(plugin);
        const { ctx, results } = makeMockCtx();

        await tool.execute(
            { source_uri: 'https://example.com/eval', cluster_hint: 'AI', query: 'eval reproducibility' },
            ctx,
        );

        const out = results[0];
        expect(out).toContain('Verwandte Notes (Vault)');
        expect(out).toContain('Verwandte Facts (Memory)');
        expect(out).toContain('Verwandte Chats (History)');
        // Order should be: triage card, then three search sections
        expect(out.indexOf('Triage-Karte')).toBeLessThan(out.indexOf('Verwandte Notes'));
    });
});
