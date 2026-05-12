import { describe, it, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { MemoryMigrationJob } from '../MemoryMigrationJob';
import { FactStore } from '../FactStore';
import { CommunicationStyleStore } from '../CommunicationStyleStore';
import { MemoryAtomizer, type FactCandidate } from '../MemoryAtomizer';
import type { FileAdapter } from '../../storage/types';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';
import type { ApiHandler, ApiStreamChunk } from '../../../api/types';

/**
 * In-memory FileAdapter that mirrors the subset of the surface used by
 * MemoryMigrationJob. Paths are virtual.
 */
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
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash > 0) this.dirs.add(path.slice(0, lastSlash));
    }
    async mkdir(path: string) { this.dirs.add(path); }
    async list(path: string) {
        const files: string[] = [];
        const folders: string[] = [];
        for (const p of this.files.keys()) {
            if (p.startsWith(path + '/') && p.indexOf('/', path.length + 1) === -1) files.push(p);
        }
        for (const d of this.dirs) {
            if (d.startsWith(path + '/') && d.indexOf('/', path.length + 1) === -1) folders.push(d);
        }
        return { files, folders };
    }
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
    snapshot() { return [...this.files.keys()].sort(); }
}

const FACTS_TABLES = `
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
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeFakeMemoryDB(rawDb: SqlJsDatabase): MemoryDB {
    return { getDB: () => rawDb, markDirty: () => { /* */ } } as unknown as MemoryDB;
}

/** Mock atomizer driver -- returns scripted candidates per source-label. */
function makeMockAtomizer(scripts: Record<string, FactCandidate[]>): MemoryAtomizer {
    const fakeApi: ApiHandler = {
        createMessage: () => (async function*() {
            // not used -- we override atomize() via a subclass below
            yield {} as ApiStreamChunk;
        })(),
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

function makeFreshStores() {
    let rawDb!: SqlJsDatabase;
    const init = async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of FACTS_TABLES.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        const memoryDB = makeFakeMemoryDB(rawDb);
        return {
            rawDb,
            factStore: new FactStore(memoryDB),
            styleStore: new CommunicationStyleStore(memoryDB),
        };
    };
    return init;
}

describe('MemoryMigrationJob (PLAN-005 task 4)', () => {
    let fs: InMemoryFs;
    let factStore: FactStore;
    let styleStore: CommunicationStyleStore;
    let atomizer: MemoryAtomizer;

    beforeEach(async () => {
        fs = new InMemoryFs();
        const init = makeFreshStores();
        const setup = await init();
        factStore = setup.factStore;
        styleStore = setup.styleStore;
    });

    function makeJob(scripts: Record<string, FactCandidate[]>) {
        atomizer = makeMockAtomizer(scripts);
        return new MemoryMigrationJob(fs, factStore, styleStore, atomizer);
    }

    it('migrates the full file set with backups and dedup', async () => {
        fs.seed('memory/user-profile.md', '# Profile\n- Sebastian uses Obsidian.');
        fs.seed('memory/projects.md', '# Projects\n- Vault Operator plugin.');
        fs.seed('memory/patterns.md', '# Patterns\n- Plans before coding.');
        fs.seed('memory/errors.md', '# Errors\n- Forgot to await once.');
        fs.seed('memory/custom-tools.md', '# Custom Tools\n- writeBinary helper.');
        fs.seed('memory/soul.md', 'You are concise, direct, no filler.');
        fs.seed('memory/knowledge.md', '# Knowledge\nDomain notes.');

        const job = makeJob({
            'user-profile.md': [{ text: 'Sebastian uses Obsidian.', topics: ['tools'], importance: 0.8, kind: 'preference' }],
            'projects.md': [{ text: 'Vault Operator plugin.', topics: ['projects'], importance: 0.7, kind: 'fact' }],
            'patterns.md': [{ text: 'Plans before coding.', topics: ['patterns'], importance: 0.6, kind: 'preference' }],
            'errors.md': [{ text: 'Forgot to await once.', topics: ['errors'], importance: 0.4, kind: 'event' }],
            'custom-tools.md': [{ text: 'writeBinary helper.', topics: ['tools'], importance: 0.5, kind: 'fact' }],
        });

        const report = await job.run({ timestamp: '2026-04-27T12:00:00Z' });

        expect(report.dryRun).toBe(false);
        expect(report.totalFactsInserted).toBe(5);
        expect(report.totalStylesInserted).toBe(1);
        expect(report.backupFolder).toContain('memory-v1-backup/2026-04-27T12-00-00');

        // Backup files present
        for (const f of ['user-profile.md', 'projects.md', 'patterns.md', 'errors.md', 'custom-tools.md', 'soul.md']) {
            expect(fs.has(`${report.backupFolder}/${f}`)).toBe(true);
        }
        // Originals untouched (Phase 5 does the cleanup)
        expect(fs.has('memory/user-profile.md')).toBe(true);

        // Facts in DB with source_uri set
        const facts = factStore.listLatest({ limit: 100 });
        expect(facts.map(f => f.sourceUri).sort()).toEqual([
            'vault://memory/custom-tools.md',
            'vault://memory/errors.md',
            'vault://memory/patterns.md',
            'vault://memory/projects.md',
            'vault://memory/user-profile.md',
        ]);

        // Style row landed
        const styles = styleStore.getMatchingStyles('default');
        expect(styles).toHaveLength(1);
        expect(styles[0].styleDescription).toBe('You are concise, direct, no filler.');

        // knowledge.md is reported as skipped, never inserted
        const knowledgeReport = report.files.find(r => r.file === 'knowledge.md');
        expect(knowledgeReport?.handled).toBe('skipped');
    });

    it('dry-run does not write to FS or stores', async () => {
        fs.seed('memory/user-profile.md', '# x\n- A.');
        fs.seed('memory/soul.md', 'voice');

        const job = makeJob({
            'user-profile.md': [{ text: 'A.', topics: ['x'], importance: 0.5, kind: 'fact' }],
        });
        const report = await job.run({ dryRun: true, timestamp: '2026-04-27T12:00:00Z' });

        expect(report.dryRun).toBe(true);
        // Report still proposes counts for visibility
        expect(report.totalFactsInserted).toBe(1);
        expect(report.totalStylesInserted).toBe(1);

        // But nothing in DB or backup
        expect(factStore.listLatest({ limit: 100 })).toHaveLength(0);
        expect(styleStore.getMatchingStyles('default')).toHaveLength(0);
        expect(fs.has(`${report.backupFolder}/user-profile.md`)).toBe(false);
    });

    it('handles missing files gracefully', async () => {
        // No source files seeded
        fs.seed('memory/soul.md', 'just-soul');
        const job = makeJob({});
        const report = await job.run({ timestamp: 't' });

        const userProfile = report.files.find(r => r.file === 'user-profile.md');
        expect(userProfile?.handled).toBe('missing');
        expect(report.totalFactsInserted).toBe(0);
        expect(report.totalStylesInserted).toBe(1);
    });

    it('handles empty source files (no atomize call)', async () => {
        fs.seed('memory/user-profile.md', '   \n\n');
        const atomizeSpy = vi.fn();
        atomizer = makeMockAtomizer({});
        atomizer.atomize = atomizeSpy;
        const job = new MemoryMigrationJob(fs, factStore, styleStore, atomizer);

        const report = await job.run({ timestamp: 't' });
        const userProfile = report.files.find(r => r.file === 'user-profile.md')!;
        expect(userProfile.candidatesProposed).toBe(0);
        expect(atomizeSpy).not.toHaveBeenCalled();
    });

    it('skips knowledge.md even when present', async () => {
        fs.seed('memory/knowledge.md', 'Domain.');
        const job = makeJob({});
        const report = await job.run({ timestamp: 't' });
        expect(factStore.listLatest({ limit: 100 })).toHaveLength(0);
        const r = report.files.find(r => r.file === 'knowledge.md');
        expect(r?.handled).toBe('skipped');
    });

    it('dedupes on (text, source_uri) for safe re-runs', async () => {
        fs.seed('memory/user-profile.md', '# x\n- A.');
        const job = makeJob({
            'user-profile.md': [
                { text: 'A.', topics: ['x'], importance: 0.5, kind: 'fact' },
                { text: 'B.', topics: ['x'], importance: 0.5, kind: 'fact' },
            ],
        });
        const first = await job.run({ timestamp: 't1' });
        expect(first.totalFactsInserted).toBe(2);
        const second = await job.run({ timestamp: 't2' });
        expect(second.totalFactsInserted).toBe(0);

        const secondReport = second.files.find(r => r.file === 'user-profile.md')!;
        expect(secondReport.candidatesDeduped).toBe(2);
        expect(secondReport.candidatesProposed).toBe(2);
    });

    it('tags fact rationale into metadata when atomizer supplies it', async () => {
        fs.seed('memory/user-profile.md', '# x\n- A.');
        const job = makeJob({
            'user-profile.md': [{
                text: 'A.', topics: ['x'], importance: 0.5, kind: 'fact',
                rationale: 'mentioned in title',
            }],
        });
        await job.run({ timestamp: 't' });
        const facts = factStore.listLatest({ limit: 1 });
        expect(facts[0].metadata).toEqual({ rationale: 'mentioned in title' });
    });

    it('attaches source_uri pointing at the original vault path', async () => {
        fs.seed('memory/projects.md', 'p');
        const job = makeJob({
            'projects.md': [{ text: 'Plugin.', topics: ['projects'], importance: 0.5, kind: 'fact' }],
        });
        await job.run({ timestamp: 't' });
        const facts = factStore.listLatest({ limit: 1 });
        expect(facts[0].sourceUri).toBe('vault://memory/projects.md');
    });

    it('passes Atomizer rejected count through to the report', async () => {
        fs.seed('memory/user-profile.md', 'x');
        atomizer = makeMockAtomizer({});
        atomizer.atomize = vi.fn(async () => ({
            candidates: [],
            rejected: [{ raw: { text: '' }, reason: 'text empty' }, { raw: {}, reason: 'kind missing' }],
            assistantText: '',
        }));
        const job = new MemoryMigrationJob(fs, factStore, styleStore, atomizer);
        const report = await job.run({ timestamp: 't' });
        const upr = report.files.find(r => r.file === 'user-profile.md')!;
        expect(upr.candidatesRejected).toBe(2);
    });
});
