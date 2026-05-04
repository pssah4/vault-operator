import { describe, it, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js';
import {
    MemoryV2UpgradeOrchestrator,
    MemoryMigrationStep,
    SeedTopicCentroidsStep,
    SettingsDefaultsStep,
    type UpgradeStep,
    type UpgradeStepContext,
    type UpgradeStepResult,
} from '../MemoryV2UpgradeOrchestrator';
import { FactStore } from '../FactStore';
import { CommunicationStyleStore } from '../CommunicationStyleStore';
import { MemoryAtomizer, type FactCandidate } from '../MemoryAtomizer';
import { EmbeddingService, type EmbeddingProvider } from '../EmbeddingService';
import type { FileAdapter } from '../../storage/types';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { ApiHandler, ApiStreamChunk } from '../../../api/types';

// ── In-memory FileAdapter (same shape as MemoryMigrationJob.test.ts) ────────
class InMemoryFs implements FileAdapter {
    private files = new Map<string, string>();
    private dirs = new Set<string>();
    async exists(path: string) { return this.files.has(path) || this.dirs.has(path); }
    async read(path: string) {
        const v = this.files.get(path);
        if (v === undefined) throw new Error(`InMemoryFs: not found: ${path}`);
        return v;
    }
    async write(path: string, data: string) {
        this.files.set(path, data);
    }
    async mkdir(path: string) { this.dirs.add(path); }
    async list() { return { files: [], folders: [] }; }
    async remove(path: string) { this.files.delete(path); }
    async append(path: string, data: string) {
        this.files.set(path, (this.files.get(path) ?? '') + data);
    }
    async stat(path: string) {
        if (!this.files.has(path)) return null;
        return { mtime: Date.now(), size: this.files.get(path)!.length };
    }
    seed(path: string, content: string) { this.files.set(path, content); }
    has(path: string) { return this.files.has(path); }
}

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
CREATE TABLE known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    description TEXT,
    centroid_embedding BLOB,
    centroid_computed_at TEXT
);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}
function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return { getDB: () => rawDb, markDirty: () => {} } as unknown as MemoryDB;
}

class StubProvider implements EmbeddingProvider {
    info = { model: 'mock', provider: 'mock', dimensions: 3 };
    async embed(texts: string[]): Promise<Float32Array[]> {
        // Deterministic: each text -> [length, length*2, length*3]
        return texts.map(t => Float32Array.from([t.length, t.length * 2, t.length * 3]));
    }
}

function makeMockAtomizer(scripts: Record<string, FactCandidate[]>): MemoryAtomizer {
    const fakeApi: ApiHandler = {
        createMessage: () => (async function*() { yield {} as ApiStreamChunk; })(),
        getModel: () => ({ id: 'mock', info: { contextWindow: 1000, supportsTools: true, supportsStreaming: true } }),
    };
    const atomizer = new MemoryAtomizer(fakeApi);
    atomizer.atomize = vi.fn(async (_md, opts) => ({
        candidates: scripts[opts?.sourceLabel ?? ''] ?? [],
        rejected: [],
        assistantText: '',
    }));
    return atomizer;
}

async function makeContext(): Promise<UpgradeStepContext & { rawDb: SqlJsDatabase }> {
    const SQL = await getSQL();
    const rawDb = new SQL.Database() as unknown as SqlJsDatabase;
    for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
        rawDb.run(stmt + ';');
    }
    const memoryDB = makeFakeMemoryDB(rawDb);
    return {
        rawDb,
        fs: new InMemoryFs(),
        factStore: new FactStore(memoryDB),
        styleStore: new CommunicationStyleStore(memoryDB),
        atomizer: makeMockAtomizer({}),
        embeddingService: new EmbeddingService(new StubProvider()),
        memoryDB,
    };
}

describe('MemoryV2UpgradeOrchestrator (Phase 3.6)', () => {
    let ctx: UpgradeStepContext & { rawDb: SqlJsDatabase; fs: InMemoryFs };

    beforeEach(async () => {
        ctx = (await makeContext()) as UpgradeStepContext & { rawDb: SqlJsDatabase; fs: InMemoryFs };
    });

    it('runs all default steps in order and returns one report per step', async () => {
        ctx.fs.seed('memory/user-profile.md', '# u\n- A.');
        ctx.fs.seed('memory/soul.md', 'voice');
        ctx.atomizer = makeMockAtomizer({
            'user-profile.md': [{ text: 'A.', topics: ['x'], importance: 0.5, kind: 'fact' }],
        });

        const orch = new MemoryV2UpgradeOrchestrator();
        const report = await orch.run({ ...ctx, timestamp: '2026-04-28T10:00:00Z' });

        expect(report.aborted).toBe(false);
        expect(report.steps.map(s => s.id)).toEqual([
            'memory-migration', 'seed-topic-centroids', 'settings-defaults',
        ]);
        expect(report.steps.every(s => s.ok)).toBe(true);
    });

    it('streams progress messages through onProgress for each step', async () => {
        const messages: string[] = [];
        ctx.fs.seed('memory/user-profile.md', '# u');
        ctx.atomizer = makeMockAtomizer({});

        const orch = new MemoryV2UpgradeOrchestrator();
        await orch.run({
            ...ctx,
            onProgress: (m) => messages.push(m),
        });

        expect(messages).toContain('Atomising legacy memory files');
        expect(messages).toContain('Computing topic centroids');
        expect(messages).toContain('Refreshing default settings');
    });

    it('aborts on critical step failure and returns partial report', async () => {
        const failingStep: UpgradeStep = {
            id: 'fail', label: 'Fail step', critical: true,
            async execute(): Promise<UpgradeStepResult> {
                throw new Error('boom');
            },
        };
        const orch = new MemoryV2UpgradeOrchestrator([failingStep, new SettingsDefaultsStep()]);
        const report = await orch.run(ctx);
        expect(report.aborted).toBe(true);
        expect(report.steps).toHaveLength(1);
        expect(report.steps[0].ok).toBe(false);
        expect(report.steps[0].error).toBe('boom');
    });

    it('non-critical step failure logs but continues the cascade', async () => {
        const flakyStep: UpgradeStep = {
            id: 'flaky', label: 'Flaky', critical: false,
            async execute(): Promise<UpgradeStepResult> {
                throw new Error('soft fail');
            },
        };
        const orch = new MemoryV2UpgradeOrchestrator([flakyStep, new SettingsDefaultsStep()]);
        const report = await orch.run(ctx);
        expect(report.aborted).toBe(false);
        expect(report.steps).toHaveLength(2);
        expect(report.steps[0].ok).toBe(false);
        expect(report.steps[1].ok).toBe(true);
    });

    it('SeedTopicCentroidsStep skips when embedding service is not ready', async () => {
        ctx.embeddingService = new EmbeddingService(); // no provider
        const step = new SeedTopicCentroidsStep();
        const result = await step.execute(ctx);
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
    });

    it('SeedTopicCentroidsStep writes one centroid per distinct topic', async () => {
        // Pre-seed facts directly so the seed-step has work to do
        ctx.factStore.insert({ text: 'fact1', topics: ['tools'], importance: 0.5 });
        ctx.factStore.insert({ text: 'fact2', topics: ['tools'], importance: 0.5 });
        ctx.factStore.insert({ text: 'fact3', topics: ['cooking'], importance: 0.5 });

        const step = new SeedTopicCentroidsStep();
        const result = await step.execute(ctx);
        expect(result.ok).toBe(true);
        expect(result.data?.topicsSeeded).toBe(2);

        const rows = ctx.rawDb.exec('SELECT topic, centroid_embedding FROM known_topics ORDER BY topic');
        const topics = rows[0].values.map(r => r[0] as string);
        expect(topics).toEqual(['cooking', 'tools']);
        expect(rows[0].values.every(r => r[1] !== null)).toBe(true);
    });

    it('SeedTopicCentroidsStep skips when there are no facts/topics', async () => {
        const step = new SeedTopicCentroidsStep();
        const result = await step.execute(ctx);
        expect(result.skipped).toBe(true);
    });

    it('SettingsDefaultsStep is a no-op marker today', async () => {
        const step = new SettingsDefaultsStep();
        const result = await step.execute(ctx);
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
    });

    it('findMigrationReport extracts the migration step\'s data block', async () => {
        ctx.fs.seed('memory/user-profile.md', '# u');
        ctx.atomizer = makeMockAtomizer({
            'user-profile.md': [{ text: 'a', topics: ['x'], importance: 0.5, kind: 'fact' }],
        });
        const orch = new MemoryV2UpgradeOrchestrator([new MemoryMigrationStep()]);
        const report = await orch.run(ctx);
        const migration = MemoryV2UpgradeOrchestrator.findMigrationReport(report);
        expect(migration).toBeTruthy();
        expect(migration?.totalFactsInserted).toBe(1);
    });

    it('idempotent re-run: second cascade skips already-inserted facts', async () => {
        ctx.fs.seed('memory/user-profile.md', '# u');
        ctx.atomizer = makeMockAtomizer({
            'user-profile.md': [{ text: 'A.', topics: ['x'], importance: 0.5, kind: 'fact' }],
        });
        const orch = new MemoryV2UpgradeOrchestrator();
        const first = await orch.run(ctx);
        const second = await orch.run({ ...ctx, timestamp: '2026-04-28T11:00:00Z' });

        const firstMig = MemoryV2UpgradeOrchestrator.findMigrationReport(first);
        const secondMig = MemoryV2UpgradeOrchestrator.findMigrationReport(second);
        expect(firstMig?.totalFactsInserted).toBe(1);
        expect(secondMig?.totalFactsInserted).toBe(0); // dedup
    });
});
