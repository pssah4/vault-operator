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
