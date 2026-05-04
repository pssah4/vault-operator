import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

/**
 * MemoryDB schema migration tests (FEATURE-0315 / PLAN-004 Aufgabe 1).
 *
 * We exercise the v1 -> v2 additive migration directly against sql.js,
 * mirroring the DDL that MemoryDB.initMemorySchema runs at open time.
 * KnowledgeDB itself is exercised in its own test file; here we only
 * validate that MemoryDB's two DDL bundles are idempotent and produce
 * the expected v2 shape.
 */

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
async function getSQL() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

// Inlined copies of the DDL bundles -- kept in sync with MemoryDB.ts.
// We do NOT import MemoryDB itself because it requires `obsidian` Vault.

const V1 = `
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    source TEXT DEFAULT 'human',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    user_message TEXT,
    mode TEXT,
    tool_sequence TEXT,
    tool_ledger TEXT,
    success INTEGER NOT NULL,
    result_summary TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    trigger_keywords TEXT,
    steps TEXT NOT NULL,
    source TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    success_count INTEGER DEFAULT 0,
    last_used TEXT,
    modes TEXT
);
CREATE TABLE IF NOT EXISTS patterns (
    pattern_key TEXT PRIMARY KEY,
    tool_sequence TEXT NOT NULL,
    episodes TEXT NOT NULL,
    success_count INTEGER DEFAULT 0
);
`;

const V2_ADDITIVE = `
CREATE TABLE IF NOT EXISTS memory_schema_meta (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS facts (
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
CREATE TABLE IF NOT EXISTS memory_source_notes (
    note_path TEXT PRIMARY KEY,
    last_extracted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 0,
    fact_count INTEGER NOT NULL DEFAULT 0,
    marker_source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (dirty IN (0, 1)),
    CHECK (marker_source IN ('agent-tool', 'frontmatter', 'settings-list'))
);
CREATE TABLE IF NOT EXISTS fact_embeddings (
    fact_id INTEGER PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fact_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    to_fact_id INTEGER REFERENCES facts(id) ON DELETE CASCADE,
    to_external_ref TEXT,
    edge_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    metadata TEXT,
    CHECK ((to_fact_id IS NOT NULL AND to_external_ref IS NULL) OR
           (to_fact_id IS NULL AND to_external_ref IS NOT NULL)),
    UNIQUE(from_fact_id, to_fact_id, edge_type),
    UNIQUE(from_fact_id, to_external_ref, edge_type)
);
CREATE TABLE IF NOT EXISTS communication_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_match TEXT NOT NULL,
    style_description TEXT NOT NULL,
    examples TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    metadata TEXT
);
CREATE TABLE IF NOT EXISTS conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    session_count INTEGER NOT NULL DEFAULT 1,
    memory_eligible INTEGER NOT NULL DEFAULT 0,
    memory_eligible_at TEXT,
    metadata TEXT
);
CREATE TABLE IF NOT EXISTS thread_sessions (
    thread_id TEXT NOT NULL REFERENCES conversation_threads(thread_id),
    session_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    PRIMARY KEY (thread_id, session_id)
);
CREATE TABLE IF NOT EXISTS known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    description TEXT,
    centroid_embedding BLOB,
    centroid_computed_at TEXT
);
CREATE TABLE IF NOT EXISTS memory_audit (
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

function execDDL(db: ReturnType<typeof SQL.Database.prototype.constructor>, ddl: string) {
    for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }
}

function bumpVersion(db: ReturnType<typeof SQL.Database.prototype.constructor>, target: number) {
    const result = db.exec('SELECT version FROM memory_schema_meta LIMIT 1');
    const existing = result[0]?.values?.[0]?.[0] as number | undefined;
    if (existing === target) return;
    if (existing === undefined) {
        db.run('INSERT INTO memory_schema_meta (version) VALUES (?)', [target]);
    } else {
        db.run('UPDATE memory_schema_meta SET version = ?', [target]);
    }
}

const V2_TABLES = [
    'memory_schema_meta', 'facts', 'memory_source_notes', 'fact_embeddings',
    'fact_edges', 'communication_styles', 'conversation_threads',
    'thread_sessions', 'known_topics', 'memory_audit',
];

describe('MemoryDB schema v1 -> v2 additive migration (FEATURE-0315)', () => {
    it('seeds memory_schema_meta with version 2 on a fresh DB', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        bumpVersion(db, 2);

        const result = db.exec('SELECT version FROM memory_schema_meta');
        expect(result[0].values[0][0]).toBe(2);
        db.close();
    });

    it('migrates a v1 DB without losing existing rows', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        // Simulate existing v1 user data
        db.run('INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)',
            ['sess-1', 'old-session', '2025-01-01']);
        db.run('INSERT INTO recipes (id, name, steps, source, schema_version) VALUES (?, ?, ?, ?, ?)',
            ['rec-1', 'old-recipe', '[]', 'human', 1]);

        // Run v2 migration
        execDDL(db, V2_ADDITIVE);
        bumpVersion(db, 2);

        // v1 data preserved
        const sessions = db.exec('SELECT id, title FROM sessions');
        expect(sessions[0].values).toHaveLength(1);
        expect(sessions[0].values[0][1]).toBe('old-session');

        const recipes = db.exec('SELECT id FROM recipes');
        expect(recipes[0].values[0][0]).toBe('rec-1');

        // v2 schema present
        expect(db.exec('SELECT version FROM memory_schema_meta')[0].values[0][0]).toBe(2);
        db.close();
    });

    it('is idempotent on re-run (v2 -> v2 changes nothing)', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        bumpVersion(db, 2);

        db.run('INSERT INTO facts (text, topics, created_at, last_confirmed_at) VALUES (?, ?, ?, ?)',
            ['Sebastian uses Obsidian', '["tools"]', '2026-04-27', '2026-04-27']);

        // Re-run -- must not duplicate version row, must not drop facts
        execDDL(db, V2_ADDITIVE);
        bumpVersion(db, 2);

        const versions = db.exec('SELECT COUNT(*) FROM memory_schema_meta');
        expect(versions[0].values[0][0]).toBe(1);
        const facts = db.exec('SELECT text FROM facts');
        expect(facts[0].values).toHaveLength(1);
        expect(facts[0].values[0][0]).toBe('Sebastian uses Obsidian');
        db.close();
    });

    it('creates all 10 v2 tables (9 data + 1 schema_meta)', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);

        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const names = tables[0].values.map(r => r[0] as string);
        for (const expected of V2_TABLES) {
            expect(names).toContain(expected);
        }
        db.close();
    });

    it('rejects facts with kind outside the allowed enum', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);

        expect(() =>
            db.run('INSERT INTO facts (text, topics, kind, created_at, last_confirmed_at) VALUES (?, ?, ?, ?, ?)',
                ['x', '[]', 'belief', '2026-04-27', '2026-04-27']),
        ).toThrow();
        db.close();
    });

    it('rejects facts with importance out of [0, 1]', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);

        expect(() =>
            db.run('INSERT INTO facts (text, topics, importance, created_at, last_confirmed_at) VALUES (?, ?, ?, ?, ?)',
                ['x', '[]', 1.5, '2026-04-27', '2026-04-27']),
        ).toThrow();
        db.close();
    });

    it('rejects fact_edges with both target columns set', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        db.run('INSERT INTO facts (text, topics, created_at, last_confirmed_at) VALUES (?, ?, ?, ?)',
            ['fact a', '[]', '2026-04-27', '2026-04-27']);

        expect(() =>
            db.run('INSERT INTO fact_edges (from_fact_id, to_fact_id, to_external_ref, edge_type, created_at) VALUES (?, ?, ?, ?, ?)',
                [1, 1, 'vault://x.md', 'mentions', '2026-04-27']),
        ).toThrow();
        db.close();
    });

    it('accepts a fact_edge to an external URI when to_fact_id is NULL', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        db.run('INSERT INTO facts (text, topics, created_at, last_confirmed_at) VALUES (?, ?, ?, ?)',
            ['fact a', '[]', '2026-04-27', '2026-04-27']);

        db.run('INSERT INTO fact_edges (from_fact_id, to_external_ref, edge_type, created_at) VALUES (?, ?, ?, ?)',
            [1, 'vault://Notes/X.md', 'mentions_note', '2026-04-27']);

        const result = db.exec('SELECT to_external_ref FROM fact_edges');
        expect(result[0].values[0][0]).toBe('vault://Notes/X.md');
        db.close();
    });
});

// Phase 3.5 (UCM-readiness): facts.profile_id was added in schema v3.
// Existing v2 DBs must pick up the column via ALTER TABLE without losing
// rows; fresh v3 DBs must default the column to 'default'.
describe('MemoryDB schema v2 -> v3 profile_id migration (Phase 3.5)', () => {
    function applyV3(db: ReturnType<typeof SQL.Database.prototype.constructor>) {
        // Mirrors MemoryDB.applyV3ProfileColumn -- defensive ADD COLUMN
        // skipped when the column already exists.
        const cols = db.exec('PRAGMA table_info(facts)');
        const names = cols[0].values.map((r: unknown[]) => r[1] as string);
        if (!names.includes('profile_id')) {
            db.run(`ALTER TABLE facts ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default'`);
        }
        db.run(`CREATE INDEX IF NOT EXISTS idx_facts_profile ON facts(profile_id)`);
    }

    it('v2 DB upgrades to v3 without losing existing rows', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE.replace(
            "    profile_id TEXT NOT NULL DEFAULT 'default',\n",
            '',
        ));
        // Pretend we are a v2 user with one row already in place
        db.run(`INSERT INTO facts (text, topics, created_at, last_confirmed_at)
                VALUES (?, ?, ?, ?)`,
            ['legacy fact', '[]', '2026-04-27', '2026-04-27']);

        applyV3(db);

        // Existing row preserved + auto-defaulted to 'default'
        const result = db.exec('SELECT text, profile_id FROM facts');
        expect(result[0].values).toHaveLength(1);
        expect(result[0].values[0][0]).toBe('legacy fact');
        expect(result[0].values[0][1]).toBe('default');
        db.close();
    });

    it('v3 DB inserts new facts with custom profile_id', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        applyV3(db); // idempotent

        db.run(`INSERT INTO facts (text, topics, created_at, last_confirmed_at, profile_id)
                VALUES (?, ?, ?, ?, ?)`,
            ['work fact', '[]', '2026-04-28', '2026-04-28', 'work']);
        db.run(`INSERT INTO facts (text, topics, created_at, last_confirmed_at)
                VALUES (?, ?, ?, ?)`,
            ['default fact', '[]', '2026-04-28', '2026-04-28']);

        const work = db.exec(`SELECT text FROM facts WHERE profile_id = 'work'`);
        const def = db.exec(`SELECT text FROM facts WHERE profile_id = 'default'`);
        expect(work[0].values[0][0]).toBe('work fact');
        expect(def[0].values[0][0]).toBe('default fact');
        db.close();
    });

    it('idempotent re-run: ALTER TABLE skipped when column exists', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        applyV3(db);
        // Second run must not throw
        expect(() => applyV3(db)).not.toThrow();
        db.close();
    });
});

// Phase 4 (FEATURE-0318 task B.3): conversation_threads gets two delta-window
// columns so SingleCallExtractor can pull only new messages and persist a
// rolling 200-token summary.
describe('MemoryDB schema v3 -> v4 conversation delta migration (Phase 4)', () => {
    function applyV4(db: ReturnType<typeof SQL.Database.prototype.constructor>) {
        const cols = db.exec('PRAGMA table_info(conversation_threads)');
        const names = cols[0].values.map((r: unknown[]) => r[1] as string);
        if (!names.includes('last_extracted_message_index')) {
            db.run(`ALTER TABLE conversation_threads ADD COLUMN last_extracted_message_index INTEGER`);
        }
        if (!names.includes('delta_summary')) {
            db.run(`ALTER TABLE conversation_threads ADD COLUMN delta_summary TEXT`);
        }
    }

    it('v3 DB upgrades to v4 without losing existing thread rows', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        // Seed a v3-shape thread row before applying v4.
        db.run(
            `INSERT INTO conversation_threads (thread_id, created_at, last_active_at)
             VALUES ('legacy-thread', '2026-04-27', '2026-04-27')`,
        );

        applyV4(db);

        const result = db.exec(
            'SELECT thread_id, last_extracted_message_index, delta_summary FROM conversation_threads',
        );
        expect(result[0].values).toHaveLength(1);
        expect(result[0].values[0][0]).toBe('legacy-thread');
        expect(result[0].values[0][1]).toBeNull();
        expect(result[0].values[0][2]).toBeNull();
        db.close();
    });

    it('v4 DB persists delta-window state and reads it back', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        applyV4(db);
        db.run(
            `INSERT INTO conversation_threads
                (thread_id, created_at, last_active_at,
                 last_extracted_message_index, delta_summary)
             VALUES ('t1', '2026-04-28', '2026-04-28', 12, 'so-far summary')`,
        );
        const result = db.exec(
            `SELECT last_extracted_message_index, delta_summary
               FROM conversation_threads WHERE thread_id = 't1'`,
        );
        expect(result[0].values[0]).toEqual([12, 'so-far summary']);
        db.close();
    });

    it('idempotent re-run: ALTER TABLE skipped when columns already exist', async () => {
        const SQL = await getSQL();
        const db = new SQL.Database();
        execDDL(db, V1);
        execDDL(db, V2_ADDITIVE);
        applyV4(db);
        expect(() => applyV4(db)).not.toThrow();
        db.close();
    });
});
