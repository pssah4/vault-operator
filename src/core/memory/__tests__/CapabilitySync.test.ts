/**
 * Capability snapshot sync (PLAN-008 task C.7).
 *
 * Exercises the same deprecate-then-insert cycle that
 * plugin.syncCapabilitySnapshot() runs at onload, but against a raw
 * FactStore so we don't need the full plugin object. Catches
 * regressions in the manifest -> facts mapping.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { FactStore } from '../FactStore';
import { OBSILO_PROFILE, SoulView } from '../SoulView';
import { CAPABILITIES, manifestHash } from '../CapabilityManifest';
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
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

function makeMemDB(rawDb: SqlJsDatabase): MemoryDB {
    return {
        getDB: () => rawDb,
        markDirty: () => undefined,
        isOpen: () => true,
        save: () => Promise.resolve(),
    } as unknown as MemoryDB;
}

/**
 * Minimal port of plugin.syncCapabilitySnapshot() so we can exercise
 * the logic without the plugin shell. Mirrors the production code.
 */
function syncCapabilities(memDB: MemoryDB): { inserted: number; deprecated: number } {
    const factStore = new FactStore(memDB);
    const existing = factStore.listLatest({ profileId: OBSILO_PROFILE, limit: 500 })
        .filter(f => f.topics.includes('capability'));
    for (const fact of existing) {
        factStore.deprecate(fact.id, 'superseded by new capability snapshot');
    }
    for (const cap of CAPABILITIES) {
        factStore.insert({
            text: `${cap.summary}${cap.notes ? ' ' + cap.notes : ''}`,
            topics: ['capability', cap.area, cap.key],
            kind: 'identity',
            importance: 0.6,
            profileId: OBSILO_PROFILE,
            sourceInterface: 'obsilo-self',
            metadata: { area: cap.area, key: cap.key },
        });
    }
    return { inserted: CAPABILITIES.length, deprecated: existing.length };
}

describe('Capability snapshot sync (PLAN-008 task C.7)', () => {
    let rawDb: SqlJsDatabase;
    let memDB: MemoryDB;

    beforeEach(async () => {
        const SQL = await getSQL();
        rawDb = new SQL.Database() as unknown as SqlJsDatabase;
        for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
            rawDb.run(stmt + ';');
        }
        memDB = makeMemDB(rawDb);
    });

    it('first sync inserts every manifest entry under profile_id="_obsilo"', () => {
        const result = syncCapabilities(memDB);
        expect(result.inserted).toBe(CAPABILITIES.length);
        expect(result.deprecated).toBe(0);

        const view = new SoulView(memDB);
        const facts = view.getCapabilities();
        expect(facts).toHaveLength(CAPABILITIES.length);
        for (const fact of facts) {
            expect(fact.topics).toContain('capability');
        }
    });

    it('second sync deprecates the first snapshot and reinserts', () => {
        syncCapabilities(memDB);
        const result = syncCapabilities(memDB);
        expect(result.deprecated).toBe(CAPABILITIES.length);
        expect(result.inserted).toBe(CAPABILITIES.length);

        // Latest = current snapshot only
        const view = new SoulView(memDB);
        expect(view.getCapabilities()).toHaveLength(CAPABILITIES.length);

        // Total rows = 2 * manifest length (deprecated + new)
        const total = rawDb.exec('SELECT COUNT(*) FROM facts');
        expect(Number(total[0].values[0][0])).toBe(CAPABILITIES.length * 2);
    });

    it('deprecated capability facts keep their audit metadata', () => {
        syncCapabilities(memDB);
        syncCapabilities(memDB);
        const audit = rawDb.exec(
            "SELECT operation, COUNT(*) FROM memory_audit GROUP BY operation",
        );
        const counts = new Map<string, number>();
        for (const row of audit[0].values) counts.set(row[0] as string, row[1] as number);
        expect(counts.get('insert')).toBe(CAPABILITIES.length * 2);
        expect(counts.get('deprecate')).toBe(CAPABILITIES.length);
    });

    it('manifest hash is stable across sync runs', () => {
        expect(manifestHash()).toBe(manifestHash());
    });

    it('does not touch facts in other profiles', () => {
        const factStore = new FactStore(memDB);
        factStore.insert({
            text: 'user fact', topics: ['capability'], // looks similar but wrong profile
            kind: 'identity', importance: 0.5,
            profileId: 'default',
        });
        syncCapabilities(memDB);
        const userFacts = rawDb.exec(
            "SELECT text FROM facts WHERE profile_id = 'default' AND is_latest = 1",
        );
        expect(userFacts[0].values).toHaveLength(1);
        expect(userFacts[0].values[0][0]).toBe('user fact');
    });
});
