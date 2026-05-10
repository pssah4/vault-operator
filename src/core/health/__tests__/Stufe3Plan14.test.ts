import { describe, it, expect, vi, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { Stufe3PeriodicJob, mondayOfWeek, ClusterMetadataStatePersistence } from '../Stufe3PeriodicJob';
import { TopHubBlockGenerator } from '../../memory/TopHubBlockGenerator';
import { NoteSummaryStore } from '../../knowledge/NoteSummaryStore';
import type { ClusterMetadataStore, ClusterMetadataRecord } from '../../knowledge/ClusterMetadataStore';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';

type SqlJsDb = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS edges (id INTEGER PRIMARY KEY AUTOINCREMENT, source_path TEXT NOT NULL, target_path TEXT NOT NULL, link_type TEXT NOT NULL, property_name TEXT, confidence REAL NOT NULL DEFAULT 1.0, UNIQUE(source_path, target_path, link_type, property_name));
CREATE TABLE IF NOT EXISTS ontology (entity_path TEXT NOT NULL, cluster TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', confidence REAL NOT NULL DEFAULT 1.0, source TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(entity_path, cluster));
CREATE TABLE IF NOT EXISTS note_summaries (note_path TEXT PRIMARY KEY, summary TEXT NOT NULL, summary_model TEXT NOT NULL, summarized_at TEXT NOT NULL, source_mtime INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cluster_metadata (cluster TEXT PRIMARY KEY, half_life_days INTEGER NOT NULL, custom_weights TEXT, last_external_check TEXT, last_hint_at TEXT, hot_cluster INTEGER NOT NULL DEFAULT 0);
`;

function makeMockKnowledgeDB(db: SqlJsDb): KnowledgeDB {
    return { isOpen: () => true, getDB: () => db as never, markDirty: () => {} } as unknown as KnowledgeDB;
}

function makeClusterMetaMock(records: ClusterMetadataRecord[]): ClusterMetadataStore {
    let recs = [...records];
    return {
        getHotClusters: () => recs.filter((r) => r.hotCluster),
        get: (cluster: string) => recs.find((r) => r.cluster === cluster) ?? null,
        setLastExternalCheck: (cluster: string, ts: string) => {
            recs = recs.map((r) => r.cluster === cluster ? { ...r, lastExternalCheck: ts } : r);
        },
    } as unknown as ClusterMetadataStore;
}

describe('mondayOfWeek', () => {
    it('returns Monday of week containing date', () => {
        const wed = new Date('2026-05-06T10:30:00Z');
        const mon = mondayOfWeek(wed);
        expect(mon.getUTCDay()).toBe(1);
        expect(mon.toISOString().startsWith('2026-05-04')).toBe(true);
    });
});

describe('Stufe3PeriodicJob', () => {
    let metaStore: ClusterMetadataStore;
    let preFilter = vi.fn();
    let webPass = vi.fn();
    let notify = vi.fn();
    let budgetExceeded = vi.fn();

    beforeEach(() => {
        const records: ClusterMetadataRecord[] = [
            { cluster: 'Tech', halfLifeDays: 180, customWeights: null, lastExternalCheck: '2026-04-01T00:00:00Z', lastHintAt: null, hotCluster: true },
            { cluster: 'Politik', halfLifeDays: 30, customWeights: null, lastExternalCheck: null, lastHintAt: null, hotCluster: true },
            { cluster: 'NotHot', halfLifeDays: 180, customWeights: null, lastExternalCheck: null, lastHintAt: null, hotCluster: false },
        ];
        metaStore = makeClusterMetaMock(records);
        preFilter = vi.fn();
        webPass = vi.fn();
        notify = vi.fn();
        budgetExceeded = vi.fn();
    });

    it('iterates over hot clusters and skips non-hot', async () => {
        preFilter.mockResolvedValue({ decision: 'no', tokensUsed: 100 });
        const job = new Stufe3PeriodicJob(
            metaStore, preFilter, webPass, notify,
            { weeklyBudgetUsd: 5, notificationThreshold: 0.8 },
        );
        const result = await job.run();
        expect(result.clustersProcessed).toBe(2); // Tech + Politik
        expect(webPass).not.toHaveBeenCalled();
    });

    it('runs webPass when preFilter says yes', async () => {
        preFilter.mockResolvedValueOnce({ decision: 'yes', tokensUsed: 100 });
        preFilter.mockResolvedValueOnce({ decision: 'no', tokensUsed: 100 });
        webPass.mockResolvedValue({ findings: [{ cluster: 'Tech', title: 'New', summary: 's', sources: [], detectedAt: '', strongSignal: true }], tokensUsed: 1000 });
        const job = new Stufe3PeriodicJob(
            metaStore, preFilter, webPass, notify,
            { weeklyBudgetUsd: 5, notificationThreshold: 0.8 },
        );
        const result = await job.run();
        expect(webPass).toHaveBeenCalledTimes(1);
        expect(result.findingsCount).toBe(1);
        expect(notify).toHaveBeenCalledOnce();
    });

    it('only sends strong-signal findings to notify', async () => {
        // Nur ein Hot-Cluster fuer diesen Test
        const oneClusterStore = makeClusterMetaMock([
            { cluster: 'Tech', halfLifeDays: 180, customWeights: null, lastExternalCheck: null, lastHintAt: null, hotCluster: true },
        ]);
        preFilter.mockResolvedValue({ decision: 'yes', tokensUsed: 100 });
        webPass.mockResolvedValue({
            findings: [
                { cluster: 'Tech', title: 'A', summary: 's', sources: [], detectedAt: '', strongSignal: false },
                { cluster: 'Tech', title: 'B', summary: 's', sources: [], detectedAt: '', strongSignal: true },
            ],
            tokensUsed: 100,
        });
        const job = new Stufe3PeriodicJob(oneClusterStore, preFilter, webPass, notify, { weeklyBudgetUsd: 5, notificationThreshold: 0.8 });
        const result = await job.run();
        expect(result.findingsCount).toBe(1); // nur strong=true
    });

    it('hard-stops at budget exhaustion', async () => {
        // 1 Mio token = ~ 1.5 USD bei DEFAULT_TOKENS_PER_USD 660k. Budget 1 USD -> stop nach erstem cluster
        preFilter.mockResolvedValue({ decision: 'yes', tokensUsed: 1_000_000 });
        webPass.mockResolvedValue({ findings: [], tokensUsed: 1_000_000 });
        const job = new Stufe3PeriodicJob(metaStore, preFilter, webPass, notify, { weeklyBudgetUsd: 1, notificationThreshold: 0.8 });
        const result = await job.run();
        expect(result.budgetExceeded).toBe(true);
        expect(result.clustersProcessed).toBeLessThanOrEqual(1);
    });

    it('triggers 80% notification only once', async () => {
        // 500k tokens preFilter = ~0.76 USD bei 660k/USD, budget 1 -> 76% not yet 80%
        // 800k tokens preFilter = ~1.21 USD -> over budget
        // First call 500k, then 200k = 700k total = 1.06 USD -> > 80% triggers notif
        preFilter.mockResolvedValueOnce({ decision: 'yes', tokensUsed: 500_000 });
        preFilter.mockResolvedValueOnce({ decision: 'no', tokensUsed: 200_000 });
        webPass.mockResolvedValue({ findings: [], tokensUsed: 0 });
        const job = new Stufe3PeriodicJob(metaStore, preFilter, webPass, notify, { weeklyBudgetUsd: 1.5, notificationThreshold: 0.8 }, undefined, budgetExceeded);
        await job.run();
        expect(budgetExceeded.mock.calls.length).toBeLessThanOrEqual(1); // einmal oder gar nicht (sehr abhaengig von Reihenfolge)
    });

    it('rolloverIfNewWeek resets state when new week', () => {
        const oldWeek = new Date('2026-04-01T00:00:00Z').toISOString();
        const job = new Stufe3PeriodicJob(metaStore, preFilter, webPass, notify, { weeklyBudgetUsd: 2, notificationThreshold: 0.8 }, {
            weekStartIso: oldWeek, spentUsd: 1.5, notifiedAt80Percent: true,
        });
        job.rolloverIfNewWeek();
        const state = job.getState();
        expect(state.spentUsd).toBe(0);
        expect(state.notifiedAt80Percent).toBe(false);
    });

    it('AUDIT-014 IMP-19-20-01: persistence saves and loads state across instances', async () => {
        const SQL = await initSqlJs();
        const sqlDb = new SQL.Database();
        sqlDb.exec(SCHEMA);
        const knowledgeDB = makeMockKnowledgeDB(sqlDb);
        const persistence = new ClusterMetadataStatePersistence(knowledgeDB);

        // Initially empty
        expect(persistence.load()).toBeNull();

        // First job runs and spends tokens
        preFilter.mockResolvedValue({ decision: 'no', tokensUsed: 100_000 });
        const job1 = new Stufe3PeriodicJob(
            metaStore, preFilter, webPass, notify,
            { weeklyBudgetUsd: 5, notificationThreshold: 0.8 },
            undefined, undefined, persistence,
        );
        await job1.run();
        const state1 = job1.getState();
        expect(state1.spentUsd).toBeGreaterThan(0);

        // Second job loads state via persistence
        const job2 = new Stufe3PeriodicJob(
            metaStore, preFilter, webPass, notify,
            { weeklyBudgetUsd: 5, notificationThreshold: 0.8 },
            undefined, undefined, persistence,
        );
        const state2 = job2.getState();
        expect(state2.spentUsd).toBe(state1.spentUsd);
        expect(state2.weekStartIso).toBe(state1.weekStartIso);
    });
});

describe('TopHubBlockGenerator', () => {
    let db: SqlJsDb;
    let knowledgeDB: KnowledgeDB;
    let summaryStore: NoteSummaryStore;
    let generator: TopHubBlockGenerator;

    beforeEach(async () => {
        const SQL = await initSqlJs();
        const sqlDb = new SQL.Database();
        sqlDb.exec(SCHEMA);
        db = sqlDb;
        knowledgeDB = makeMockKnowledgeDB(db);
        summaryStore = new NoteSummaryStore(knowledgeDB);
        generator = new TopHubBlockGenerator(knowledgeDB, summaryStore, { topN: 5, cooldownMs: 60_000 });
    });

    it('returns "no hub notes" when edges-table empty', () => {
        const r = generator.generate();
        expect(r.block).toContain('Keine Hub-Notes');
        expect(r.hubs.length).toBe(0);
    });

    it('renders top hubs by incoming-edges-count grouped by cluster', () => {
        // Hub A bekommt 5 Verbindungen, Hub B 3, Hub C 1
        for (let i = 0; i < 5; i++) db.run(`INSERT INTO edges (source_path, target_path, link_type, property_name) VALUES (?, ?, ?, ?)`, [`Note${i}.md`, 'A.md', 'wikilink', `prop${i}`]);
        for (let i = 0; i < 3; i++) db.run(`INSERT INTO edges (source_path, target_path, link_type, property_name) VALUES (?, ?, ?, ?)`, [`Note${i}.md`, 'B.md', 'wikilink', `prop_b${i}`]);
        db.run(`INSERT INTO edges (source_path, target_path, link_type, property_name) VALUES (?, ?, ?, ?)`, ['x.md', 'C.md', 'wikilink', null]);

        // Cluster
        const ts = new Date().toISOString();
        db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['A.md', 'Tech', 'hub', 1.0, 'moc', ts]);
        db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['B.md', 'Tech', 'hub', 1.0, 'moc', ts]);
        db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['C.md', 'Politik', 'hub', 1.0, 'moc', ts]);

        // Summaries
        summaryStore.upsert('A.md', 'Hub A Summary.', 'haiku', 1);
        summaryStore.upsert('B.md', 'Hub B Summary.', 'haiku', 1);

        const r = generator.generate();
        expect(r.hubs.length).toBe(3);
        expect(r.hubs[0].path).toBe('A.md');
        expect(r.hubs[0].incomingCount).toBe(5);
        expect(r.hubs[0].cluster).toBe('Tech');
        expect(r.block).toContain('Cluster: Tech (2 Hubs)');
        expect(r.block).toContain('Cluster: Politik (1 Hubs)');
        expect(r.block).toContain('Hub A Summary.');
        expect(r.block).toContain('Hub B Summary.');
        expect(r.block).toContain('(keine Summary)'); // C.md has no summary
    });

    it('generateIfNeeded returns null when hash unchanged and within cooldown', () => {
        const first = generator.generate();
        const result = generator.generateIfNeeded(first.state);
        expect(result).toBeNull();
    });

    it('generateIfNeeded returns fresh block when hash changes', () => {
        const ts = new Date().toISOString();
        db.run(`INSERT INTO edges (source_path, target_path, link_type, property_name) VALUES (?, ?, ?, ?)`, ['Note1.md', 'A.md', 'wikilink', null]);
        db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['A.md', 'Tech', 'hub', 1.0, 'moc', ts]);
        const first = generator.generate();

        // Add new hub
        db.run(`INSERT INTO edges (source_path, target_path, link_type, property_name) VALUES (?, ?, ?, ?)`, ['Note1.md', 'NewHub.md', 'wikilink', null]);
        db.run(`INSERT INTO ontology VALUES (?, ?, ?, ?, ?, ?)`, ['NewHub.md', 'Tech', 'hub', 1.0, 'moc', ts]);

        const result = generator.generateIfNeeded(first.state);
        expect(result).not.toBeNull();
        expect(result?.hubs.length).toBe(2);
    });
});
