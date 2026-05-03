import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { IngestSessionStore } from '../IngestSessionStore';
import { IngestTriageLogStore, sanitizeSourceUri } from '../IngestTriageLogStore';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';

type SqlJsDb = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    getRowsModified(): number;
    close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingest_session (id INTEGER PRIMARY KEY AUTOINCREMENT, source_uri TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, last_turn_at TEXT NOT NULL, state_json TEXT NOT NULL, conversation_id TEXT);
CREATE TABLE IF NOT EXISTS ingest_triage_log (id INTEGER PRIMARY KEY AUTOINCREMENT, source_uri TEXT NOT NULL, triaged_at TEXT NOT NULL, decision TEXT NOT NULL, decision_reason TEXT, UNIQUE(source_uri));
`;

function makeMockKnowledgeDB(db: SqlJsDb): KnowledgeDB {
    return {
        isOpen: () => true,
        getDB: () => db as never,
        markDirty: () => {},
    } as unknown as KnowledgeDB;
}

async function freshDB(): Promise<SqlJsDb> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(SCHEMA);
    return db as unknown as SqlJsDb;
}

describe('IngestSessionStore', () => {
    let db: SqlJsDb;
    let store: IngestSessionStore;

    beforeEach(async () => {
        db = await freshDB();
        store = new IngestSessionStore(makeMockKnowledgeDB(db));
    });

    it('create and get round-trip', () => {
        const session = store.create('vault://Notes/A.md', 'A', { current_step: 'take-away-selection' });
        expect(session.id).toBeGreaterThan(0);
        const fetched = store.get(session.id);
        expect(fetched?.sourceUri).toBe('vault://Notes/A.md');
        expect(fetched?.mode).toBe('A');
        expect(fetched?.status).toBe('active');
        expect(fetched?.state.current_step).toBe('take-away-selection');
    });

    it('updateState persists state and optional status', () => {
        const session = store.create('vault://A.md', 'B');
        store.updateState(session.id, { current_step: 'execute' }, 'awaiting-user');
        const refetched = store.get(session.id);
        expect(refetched?.state.current_step).toBe('execute');
        expect(refetched?.status).toBe('awaiting-user');
    });

    it('listByStatus returns only matching', () => {
        const a = store.create('vault://A.md', 'A');
        const b = store.create('vault://B.md', 'A');
        store.updateState(a.id, {}, 'completed');

        const active = store.listByStatus('active');
        expect(active.length).toBe(1);
        expect(active[0].id).toBe(b.id);

        const completed = store.listByStatus('completed');
        expect(completed.length).toBe(1);
        expect(completed[0].id).toBe(a.id);
    });

    it('cleanupAbandoned removes old abandoned only', () => {
        const oldSession = store.create('vault://old.md', 'A');
        const newSession = store.create('vault://new.md', 'A');
        store.updateState(oldSession.id, {}, 'abandoned');
        store.updateState(newSession.id, {}, 'abandoned');

        // Set old session's last_turn_at into the past
        db.run(`UPDATE ingest_session SET last_turn_at = ? WHERE id = ?`, [
            new Date(Date.now() - 10 * 86_400_000).toISOString(),
            oldSession.id,
        ]);

        const removed = store.cleanupAbandoned(7);
        expect(removed).toBe(1);
        expect(store.get(oldSession.id)).toBeNull();
        expect(store.get(newSession.id)).not.toBeNull();
    });
});

describe('IngestTriageLogStore', () => {
    let db: SqlJsDb;
    let store: IngestTriageLogStore;

    beforeEach(async () => {
        db = await freshDB();
        store = new IngestTriageLogStore(makeMockKnowledgeDB(db));
    });

    it('record creates entry once (idempotent on duplicate)', () => {
        expect(store.record('vault://A.md', 'pending')).toBe(true);
        expect(store.record('vault://A.md', 'ingest')).toBe(false);
        expect(store.exists('vault://A.md')).toBe(true);
    });

    it('updateDecision changes decision', () => {
        store.record('vault://A.md', 'pending');
        store.updateDecision('vault://A.md', 'ingest', 'user-approved');
        const rec = store.get('vault://A.md');
        expect(rec?.decision).toBe('ingest');
        expect(rec?.decisionReason).toBe('user-approved');
    });

    it('isInCooldown true within window', () => {
        store.record('vault://A.md', 'pending');
        expect(store.isInCooldown('vault://A.md', 60_000)).toBe(true);
    });

    it('isInCooldown false after window', () => {
        store.record('vault://A.md', 'pending');
        // Set triaged_at into the past
        db.run(`UPDATE ingest_triage_log SET triaged_at = ? WHERE source_uri = ?`, [
            new Date(Date.now() - 2 * 3_600_000).toISOString(),
            'vault://A.md',
        ]);
        expect(store.isInCooldown('vault://A.md', 3_600_000)).toBe(false);
    });

    it('listPending returns only pending entries', () => {
        store.record('vault://A.md', 'pending');
        store.record('vault://B.md', 'ingest');
        store.record('vault://C.md', 'pending');
        const pending = store.listPending();
        expect(pending.length).toBe(2);
        expect(pending.map((r) => r.sourceUri).sort()).toEqual(['vault://A.md', 'vault://C.md']);
    });

    it('AUDIT-014 L-1: strips sensitive query params on record', () => {
        store.record('https://example.com/cb?code=secret&state=xyz&topic=ai', 'pending');
        // Persisted source_uri sollte sanitized sein
        const all = store.listPending();
        expect(all[0].sourceUri).not.toContain('code=secret');
        expect(all[0].sourceUri).not.toContain('state=xyz');
        expect(all[0].sourceUri).toContain('topic=ai');
        expect(all[0].sourceUri).toContain('_sanitized=');
    });

    it('AUDIT-014 L-1: lookup with original raw URI still finds sanitized record', () => {
        store.record('https://x.com/y?token=abc', 'pending');
        // Same raw URI -> sanitize liefert dieselbe Form -> exists() true
        expect(store.exists('https://x.com/y?token=abc')).toBe(true);
    });

    it('AUDIT-014 L-1: sanitizeSourceUri leaves non-URL strings untouched', () => {
        expect(sanitizeSourceUri('vault://Notes/A.md')).toBe('vault://Notes/A.md');
        expect(sanitizeSourceUri('file:///x.pdf')).toBe('file:///x.pdf');
    });

    it('AUDIT-014 L-1: sanitizeSourceUri handles invalid URLs gracefully', () => {
        expect(sanitizeSourceUri('http://invalid url with spaces')).toBe('http://invalid url with spaces');
    });

    it('AUDIT-014 L-1: case-insensitive sensitive param match', () => {
        const r = sanitizeSourceUri('https://x.com/y?Token=abc&API_KEY=def&keep=ok');
        expect(r).not.toContain('Token=abc');
        expect(r).not.toContain('API_KEY=def');
        expect(r).toContain('keep=ok');
    });
});
