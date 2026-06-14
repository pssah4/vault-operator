import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { ContextComposer } from '../ContextComposer';
import { TopicInference } from '../TopicInference';
import { UserProfileView } from '../UserProfileView';
import { FactStore } from '../FactStore';
import { CommunicationStyleStore } from '../CommunicationStyleStore';
import type { MemoryDB } from '../../knowledge/MemoryDB';
import type { SqlJsDatabase } from '../../knowledge/KnowledgeDB';

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
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    source TEXT DEFAULT 'human',
    created_at TEXT NOT NULL
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

function seedCentroid(rawDb: SqlJsDatabase, topic: string, vector: Float32Array): void {
    const blob = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
    rawDb.run(
        `INSERT INTO known_topics (topic, first_seen_at, last_seen_at, centroid_embedding, centroid_computed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [topic, '2026-04-28', '2026-04-28', blob, '2026-04-28'],
    );
}

const NOW = new Date('2026-04-28T12:00:00Z');

describe('ContextComposer (PLAN-006 task 6)', () => {
    let rawDb: SqlJsDatabase;
    let composer: ContextComposer;
    let factStore: FactStore;
    let styleStore: CommunicationStyleStore;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        const memDB = makeFakeMemoryDB(rawDb);
        factStore = new FactStore(memDB);
        styleStore = new CommunicationStyleStore(memDB);
        const inference = new TopicInference(memDB);
        const view = new UserProfileView(memDB);
        composer = new ContextComposer(memDB, inference, view);
    });

    it('returns minimal markdown when DB is empty', () => {
        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        expect(out.hits).toEqual([]);
        expect(out.topicLock).toBeNull();
        expect(out.coldStart).toBe(true);
        expect(out.driftEvent).toBeUndefined();
    });

    it('locks on the first turn when a centroid matches above threshold', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        for (let i = 0; i < 6; i++) {
            factStore.insert({ text: `fact ${i}`, topics: ['coding'], importance: 0.5 });
        }
        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([0.95, 0.1, 0]),
            now: NOW,
        });
        expect(out.topicLock?.topic).toBe('coding');
        expect(out.coldStart).toBe(false);
        expect(out.markdown).toContain('Topical memory (lock: coding)');
    });

    it('persists the lock across turns of the same session', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'a', topics: ['coding'], importance: 0.5 });

        composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        // Second turn -- still cosine 1.0 against coding centroid -> stays locked
        const second = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([0.99, 0.1, 0]),
            now: NOW,
        });
        expect(second.topicLock?.topic).toBe('coding');
        expect(second.driftEvent).toBeUndefined();
    });

    it('emits a drift event when the user pivots topic', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        seedCentroid(rawDb, 'cooking', Float32Array.from([0, 1, 0]));
        factStore.insert({ text: 'a', topics: ['coding'], importance: 0.5 });

        composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        const second = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([0, 1, 0]),
            now: NOW,
        });
        expect(second.driftEvent).toEqual({
            previousTopic: 'coding',
            newTopic: 'cooking',
            score: expect.any(Number),
        });
        expect(second.topicLock?.topic).toBe('cooking');
    });

    it('emits to the injected DriftEventBus when drift is detected', async () => {
        const { DriftEventBus } = await import('../DriftEventBus');
        const bus = new DriftEventBus();
        const captured: Array<unknown> = [];
        bus.subscribe(e => captured.push(e));
        const memDB = makeFakeMemoryDB(rawDb);
        const composerWithBus = new ContextComposer(
            memDB, new TopicInference(memDB), new UserProfileView(memDB), bus,
        );

        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        seedCentroid(rawDb, 'cooking', Float32Array.from([0, 1, 0]));
        factStore.insert({ text: 'a', topics: ['coding'], importance: 0.5 });

        composerWithBus.compose({
            sessionId: 'sx',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        composerWithBus.compose({
            sessionId: 'sx',
            userMessageEmbedding: Float32Array.from([0, 1, 0]),
            now: NOW,
        });
        expect(captured).toHaveLength(1);
        expect(captured[0]).toMatchObject({
            sessionId: 'sx',
            previousTopic: 'coding',
            newTopic: 'cooking',
            source: 'context-composer',
        });
    });

    it('drops the lock when no topic matches above threshold (drift to null)', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'a', topics: ['coding'], importance: 0.5 });
        composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        // Wildly orthogonal message -> no centroid >= 0.6
        const second = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([0, 0, 1]),
            now: NOW,
        });
        expect(second.topicLock).toBeNull();
        expect(second.driftEvent?.previousTopic).toBe('coding');
        expect(second.driftEvent?.newTopic).toBeNull();
    });

    it('topicLockOverride bypasses inference', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'a', topics: ['custom-topic'], importance: 0.5 });
        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            topicLockOverride: 'custom-topic',
            now: NOW,
        });
        expect(out.topicLock?.topic).toBe('custom-topic');
    });

    it('renders identity + communication style when present', () => {
        seedCentroid(rawDb, 'topic', Float32Array.from([1, 0]));
        factStore.insert({
            text: 'I am Sebastian', topics: ['identity'], importance: 0.9, kind: 'identity',
        });
        styleStore.addStyle({
            contextMatch: 'default',
            styleDescription: 'Concise. Direct.',
        });
        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0]),
            now: NOW,
        });
        expect(out.markdown).toContain('## Identity');
        expect(out.markdown).toContain('I am Sebastian');
        expect(out.markdown).toContain('## Communication style');
        expect(out.markdown).toContain('Concise. Direct.');
    });

    it('cold-start mode adds a hint and uses recent facts', () => {
        seedCentroid(rawDb, 'newtopic', Float32Array.from([1, 0]));
        // Only 2 facts on the topic -> below threshold
        factStore.insert({ text: 'A', topics: ['newtopic'], importance: 0.5 });
        factStore.insert({ text: 'B', topics: ['newtopic'], importance: 0.5 });

        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0]),
            now: NOW,
        });
        expect(out.coldStart).toBe(true);
        expect(out.markdown).toContain('Cold-start');
    });

    it('null embedding keeps the previous lock unchanged', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'a', topics: ['coding'], importance: 0.5 });
        composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        const second = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: null,
            now: NOW,
        });
        expect(second.topicLock?.topic).toBe('coding');
    });

    it('clearLock removes the per-session state', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'a', topics: ['coding'], importance: 0.5 });
        composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        composer.clearLock('s1');
        const after = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: null,
            now: NOW,
        });
        expect(after.topicLock).toBeNull();
    });

    it('profile filter only returns hits from the requested partition', () => {
        seedCentroid(rawDb, 'work', Float32Array.from([1, 0]));
        factStore.insert({ text: 'work fact', topics: ['work'], profileId: 'work' });
        factStore.insert({ text: 'personal fact', topics: ['work'], profileId: 'personal' });

        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0]),
            profile: 'work',
            now: NOW,
        });
        const texts = out.hits.map(h => h.text);
        expect(texts).toContain('work fact');
        expect(texts).not.toContain('personal fact');
    });

    it('without profile filter, all profiles are visible', () => {
        seedCentroid(rawDb, 'work', Float32Array.from([1, 0]));
        factStore.insert({ text: 'work fact', topics: ['work'], profileId: 'work' });
        factStore.insert({ text: 'personal fact', topics: ['work'], profileId: 'personal' });

        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0]),
            now: NOW,
        });
        const texts = out.hits.map(h => h.text);
        expect(texts).toContain('work fact');
        expect(texts).toContain('personal fact');
    });
});

// ───────────────────────────────────────────────────────────────────────────
// FIX-32-03-01: pause-notice trailer + cold-start suppression
// ───────────────────────────────────────────────────────────────────────────

describe('ContextComposer pause-notice (FIX-32-03-01)', () => {
    let rawDb: SqlJsDatabase;
    let factStore: FactStore;
    let memDB: ReturnType<typeof makeFakeMemoryDB>;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memDB = makeFakeMemoryDB(rawDb);
        factStore = new FactStore(memDB);
    });

    function buildComposer(getPause: (() => { reason: string; dayKey: string } | null) | undefined) {
        const inference = new TopicInference(memDB);
        const view = new UserProfileView(memDB);
        return new ContextComposer(memDB, inference, view, null, getPause);
    }

    it('appends a single italic trailer line when the callback returns a pause-state', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        for (let i = 0; i < 6; i++) {
            factStore.insert({ text: `fact ${i}`, topics: ['coding'], importance: 0.5 });
        }
        const composer = buildComposer(() => ({ reason: 'daily output cap reached (200000 >= 200000)', dayKey: '2026-06-14' }));
        const out = composer.compose({
            sessionId: 's1',
            userMessageEmbedding: Float32Array.from([1, 0, 0]),
            now: NOW,
        });
        expect(out.markdown).toMatch(/_Memory writes paused today \(2026-06-14\): daily output cap reached \(200000 >= 200000\)\._\s*$/);
    });

    it('renders byte-identical markdown for two consecutive compose() calls on the same dayKey', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'fact 1', topics: ['coding'], importance: 0.5 });
        const composer = buildComposer(() => ({ reason: 'budget', dayKey: '2026-06-14' }));
        const first = composer.compose({ sessionId: 's1', userMessageEmbedding: Float32Array.from([1, 0, 0]), now: NOW }).markdown;
        const second = composer.compose({ sessionId: 's1', userMessageEmbedding: null, now: NOW }).markdown;
        expect(second).toBe(first);
    });

    it('flips the trailer when dayKey changes (midnight rollover)', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'fact 1', topics: ['coding'], importance: 0.5 });
        let day = '2026-06-14';
        const composer = buildComposer(() => ({ reason: 'budget', dayKey: day }));
        const before = composer.compose({ sessionId: 's1', userMessageEmbedding: Float32Array.from([1, 0, 0]), now: NOW }).markdown;
        day = '2026-06-15';
        const after = composer.compose({ sessionId: 's1', userMessageEmbedding: null, now: NOW }).markdown;
        expect(before).toContain('2026-06-14');
        expect(after).toContain('2026-06-15');
        expect(after).not.toContain('2026-06-14');
    });

    it('renders no pause line when the callback returns null (writes not paused)', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'fact 1', topics: ['coding'], importance: 0.5 });
        const composer = buildComposer(() => null);
        const out = composer.compose({ sessionId: 's1', userMessageEmbedding: Float32Array.from([1, 0, 0]), now: NOW });
        expect(out.markdown).not.toContain('Memory writes paused');
    });

    it('NOOP path: no callback at all renders identically to the legacy composer', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'fact 1', topics: ['coding'], importance: 0.5 });
        const composer = buildComposer(undefined);
        const out = composer.compose({ sessionId: 's1', userMessageEmbedding: Float32Array.from([1, 0, 0]), now: NOW });
        expect(out.markdown).not.toContain('Memory writes paused');
    });

    it('suppresses the cold-start hint while paused (cold-start moot if no writes happen)', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'fact 1', topics: ['coding'], importance: 0.5 });
        const paused = buildComposer(() => ({ reason: 'r', dayKey: '2026-06-14' }));
        const out = paused.compose({ sessionId: 's1', userMessageEmbedding: Float32Array.from([1, 0, 0]), now: NOW });
        expect(out.coldStart).toBe(true); // semantic flag unchanged
        expect(out.markdown).not.toContain('Cold-start');
    });

    it('a throwing callback degrades to no-pause instead of crashing compose()', () => {
        seedCentroid(rawDb, 'coding', Float32Array.from([1, 0, 0]));
        factStore.insert({ text: 'fact 1', topics: ['coding'], importance: 0.5 });
        const composer = buildComposer(() => { throw new Error('boom'); });
        const out = composer.compose({ sessionId: 's1', userMessageEmbedding: Float32Array.from([1, 0, 0]), now: NOW });
        expect(out.markdown).not.toContain('Memory writes paused');
    });
});
