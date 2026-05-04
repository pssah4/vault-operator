import { describe, it, expect, beforeEach, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { AutoTriggerObserver, type TriggerCallback } from '../AutoTriggerObserver';
import { IngestTriageLogStore } from '../IngestTriageLogStore';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';
import type { App, TFile as TFileType } from 'obsidian';
import { TFile } from 'obsidian';

/**
 * AUDIT-014 L-2 (FIX-19-27-01): Rate-Limit-Tests fuer AutoTriggerObserver.
 * Plus generic match-Pfad-Tests fuer Frontmatter-Property-Match.
 */

type SqlJsDb = {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingest_triage_log (id INTEGER PRIMARY KEY AUTOINCREMENT, source_uri TEXT NOT NULL, triaged_at TEXT NOT NULL, decision TEXT NOT NULL, decision_reason TEXT, UNIQUE(source_uri));
`;

function makeMockKnowledgeDB(db: SqlJsDb): KnowledgeDB {
    return { isOpen: () => true, getDB: () => db as never, markDirty: () => {} } as unknown as KnowledgeDB;
}

function makeMockApp(metadata: Record<string, { frontmatter?: Record<string, unknown> }>): App {
    return {
        vault: {
            on: () => ({}),
            offref: () => {},
        },
        metadataCache: {
            getFileCache: (file: { path: string }) => metadata[file.path] ?? null,
        },
    } as unknown as App;
}

function makeFile(path: string): TFileType {
    // Create a real TFile so instanceof checks pass when needed (here we test maybeTrigger directly)
    const f = Object.create(TFile.prototype) as TFileType;
    Object.assign(f, { path, extension: 'md' });
    return f;
}

async function freshLog(): Promise<IngestTriageLogStore> {
    const SQL = await initSqlJs();
    const sqlDb = new SQL.Database();
    sqlDb.exec(SCHEMA);
    const db = sqlDb as unknown as SqlJsDb;
    return new IngestTriageLogStore(makeMockKnowledgeDB(db));
}

describe('AutoTriggerObserver', () => {
    let log: IngestTriageLogStore;
    let trigger: TriggerCallback;
    let triggered: string[];

    beforeEach(async () => {
        log = await freshLog();
        triggered = [];
        trigger = async (f) => { triggered.push(f.path); };
    });

    it('triggers when frontmatter property matches', async () => {
        const app = makeMockApp({ 'A.md': { frontmatter: { Kategorie: 'Quelle' } } });
        const obs = new AutoTriggerObserver(app, log, trigger, {
            enabled: true, propertyName: 'Kategorie', propertyValue: 'Quelle',
        });
        const fired = await obs.maybeTrigger(makeFile('A.md'));
        expect(fired).toBe(true);
        expect(triggered).toEqual(['A.md']);
    });

    it('does not trigger when property mismatches', async () => {
        const app = makeMockApp({ 'A.md': { frontmatter: { Kategorie: 'Notiz' } } });
        const obs = new AutoTriggerObserver(app, log, trigger, {
            enabled: true, propertyName: 'Kategorie', propertyValue: 'Quelle',
        });
        const fired = await obs.maybeTrigger(makeFile('A.md'));
        expect(fired).toBe(false);
    });

    it('handles list-property match', async () => {
        const app = makeMockApp({ 'A.md': { frontmatter: { Kategorie: ['Quelle', 'Wichtig'] } } });
        const obs = new AutoTriggerObserver(app, log, trigger, {
            enabled: true, propertyName: 'Kategorie', propertyValue: 'Quelle',
        });
        expect(await obs.maybeTrigger(makeFile('A.md'))).toBe(true);
    });

    it('respects multi-value propertyValue option', async () => {
        const app = makeMockApp({ 'A.md': { frontmatter: { Kategorie: 'Quelle' } } });
        const obs = new AutoTriggerObserver(app, log, trigger, {
            enabled: true, propertyName: 'Kategorie', propertyValue: ['Quelle', 'Inbox'],
        });
        expect(await obs.maybeTrigger(makeFile('A.md'))).toBe(true);
    });

    it('respects folder-allowlist', async () => {
        const app = makeMockApp({ 'OutOfScope/A.md': { frontmatter: { Kategorie: 'Quelle' } } });
        const obs = new AutoTriggerObserver(app, log, trigger, {
            enabled: true, propertyName: 'Kategorie', propertyValue: 'Quelle',
            folderAllowList: ['Inbox/'],
        });
        expect(await obs.maybeTrigger(makeFile('OutOfScope/A.md'))).toBe(false);
    });

    it('AUDIT-014 L-2: drops events above rate-limit', async () => {
        const app = makeMockApp({});
        // Generate 20 distinct files all with matching FM
        const files: TFileType[] = [];
        const meta: Record<string, { frontmatter?: Record<string, unknown> }> = {};
        for (let i = 0; i < 20; i++) {
            const path = `Note${i}.md`;
            files.push(makeFile(path));
            meta[path] = { frontmatter: { Kategorie: 'Quelle' } };
        }
        const appWithFiles = makeMockApp(meta);
        const obs = new AutoTriggerObserver(appWithFiles, log, trigger, {
            enabled: true,
            propertyName: 'Kategorie',
            propertyValue: 'Quelle',
            rateLimitMaxPerWindow: 5,
            rateLimitWindowMs: 60_000,
        });

        let firedCount = 0;
        for (const f of files) {
            if (await obs.maybeTrigger(f)) firedCount++;
        }
        // Nur 5 sollten durchkommen (Rate-Limit), Rest gedroppt
        expect(firedCount).toBe(5);
        expect(triggered.length).toBe(5);
    });

    it('AUDIT-014 L-2: window slides (later trigger after window allowed)', async () => {
        vi.useFakeTimers();
        const app = makeMockApp({
            'A.md': { frontmatter: { Kategorie: 'Quelle' } },
            'B.md': { frontmatter: { Kategorie: 'Quelle' } },
        });
        const obs = new AutoTriggerObserver(app, log, trigger, {
            enabled: true, propertyName: 'Kategorie', propertyValue: 'Quelle',
            rateLimitMaxPerWindow: 1, rateLimitWindowMs: 1_000,
        });
        expect(await obs.maybeTrigger(makeFile('A.md'))).toBe(true);
        // Same window: blocked
        expect(await obs.maybeTrigger(makeFile('B.md'))).toBe(false);
        // Advance past window
        vi.advanceTimersByTime(2_000);
        // Now allowed again
        expect(await obs.maybeTrigger(makeFile('B.md'))).toBe(true);
        vi.useRealTimers();
    });
});
