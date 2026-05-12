/**
 * MemoryDB -- SQLite storage for agent memory data.
 *
 * Schema versions:
 *   v1: sessions, episodes, recipes, patterns (legacy memory pipeline)
 *   v2: FEATURE-0315 -- adds Memory-v2 Engine Foundation tables additively
 *       (facts, fact_embeddings, fact_edges, communication_styles,
 *       conversation_threads, thread_sessions, known_topics, memory_audit,
 *       memory_source_notes). Old v1 tables stay untouched.
 *
 * Storage: {vault-parent}/.obsidian-agent/memory.db (user-global, shared across vaults)
 *
 * FEATURE-1505: Knowledge Data Consolidation
 * FEATURE-1508: Storage Consolidation (moved to vault-parent)
 * FEATURE-0315: Memory-v2 Engine Foundation (v2 schema)
 */

import type { Vault } from 'obsidian';
import { KnowledgeDB } from './KnowledgeDB';
import type { SqlJsDatabase } from './KnowledgeDB';

// ---------------------------------------------------------------------------
// Schema versioning
// ---------------------------------------------------------------------------

export const MEMORY_SCHEMA_VERSION = 4;

// ---------------------------------------------------------------------------
// v1 schema -- legacy memory pipeline (unchanged from FEATURE-1505)
// ---------------------------------------------------------------------------

const MEMORY_SCHEMA_V1 = `
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

// ---------------------------------------------------------------------------
// v2 schema -- Memory-v2 Engine Foundation (additive, ADR-077)
// ---------------------------------------------------------------------------

const MEMORY_SCHEMA_V2_ADDITIVE = `
CREATE TABLE IF NOT EXISTS memory_schema_meta (
    version INTEGER NOT NULL
);

-- Atomic facts (knowledge statements) -- ADR-077
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
    superseded_by INTEGER REFERENCES facts(id),
    is_latest INTEGER NOT NULL DEFAULT 1,
    deprecated_at TEXT,
    deprecation_reason TEXT,
    metadata TEXT,
    CHECK (importance >= 0.0 AND importance <= 1.0),
    CHECK (kind IN ('fact', 'preference', 'identity', 'event')),
    CHECK (is_latest IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_facts_is_latest ON facts(is_latest, importance) WHERE is_latest = 1 AND deprecated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_facts_kind ON facts(kind);
CREATE INDEX IF NOT EXISTS idx_facts_source_uri ON facts(source_uri);
CREATE INDEX IF NOT EXISTS idx_facts_importance ON facts(importance) WHERE deprecated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_facts_last_used ON facts(last_used_at);
CREATE INDEX IF NOT EXISTS idx_facts_last_confirmed ON facts(last_confirmed_at);
CREATE INDEX IF NOT EXISTS idx_facts_source_session ON facts(source_session_id);
CREATE INDEX IF NOT EXISTS idx_facts_source_thread ON facts(source_thread_id);
CREATE INDEX IF NOT EXISTS idx_facts_active ON facts(deprecated_at);

-- Memory-source notes (FEATURE-0325, vault-note-as-fact-source pipeline)
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

CREATE INDEX IF NOT EXISTS idx_memory_source_dirty ON memory_source_notes(dirty) WHERE dirty = 1;

-- Embeddings stored separately to keep fact reads cheap
CREATE TABLE IF NOT EXISTS fact_embeddings (
    fact_id INTEGER PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fact_embeddings_model ON fact_embeddings(embedding_model);

-- URI-based edges between facts and external references
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

CREATE INDEX IF NOT EXISTS idx_fact_edges_from ON fact_edges(from_fact_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_fact_edges_to_fact ON fact_edges(to_fact_id);
CREATE INDEX IF NOT EXISTS idx_fact_edges_to_ref ON fact_edges(to_external_ref);

-- Context-dependent communication styles
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

CREATE INDEX IF NOT EXISTS idx_styles_context ON communication_styles(context_match);

-- Conversation threads (cross-session, prepared for UCM cross-interface)
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

CREATE INDEX IF NOT EXISTS idx_thread_sessions_session ON thread_sessions(session_id);

-- Topic registry (soft normalisation + centroid storage for local inference)
CREATE TABLE IF NOT EXISTS known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    description TEXT,
    centroid_embedding BLOB,
    centroid_computed_at TEXT
);

-- Audit trail for state-changing operations only (use-counts stay inline)
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

CREATE INDEX IF NOT EXISTS idx_audit_fact ON memory_audit(fact_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON memory_audit(timestamp);
`;

// ---------------------------------------------------------------------------
// MemoryDB
// ---------------------------------------------------------------------------

export class MemoryDB {
    private knowledgeDB: KnowledgeDB;
    private initialized = false;

    constructor(vault: Vault, pluginDir: string, globalRoot?: string) {
        // Use 'global' storage: {vault-parent}/.obsidian-agent/memory.db — user-global, shared across vaults
        this.knowledgeDB = new KnowledgeDB(vault, pluginDir, 'global', 'memory.db', globalRoot);
    }

    /** Open the DB and initialize the memory schema. */
    async open(): Promise<void> {
        await this.knowledgeDB.open();
        this.initMemorySchema();
        this.initialized = true;
    }

    /** Get the raw sql.js Database for direct queries. */
    getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }

    /** Check if the DB is open. */
    isOpen(): boolean {
        return this.initialized && this.knowledgeDB.isOpen();
    }

    /** Absolute filesystem path of the live DB file. Used by SnapshotJob. */
    getAbsolutePath(): string {
        return this.knowledgeDB.getAbsolutePath();
    }

    /** Storage location of the underlying file. */
    getStorageLocation(): 'global' | 'local' | 'obsidian-sync' {
        return this.knowledgeDB.getStorageLocation();
    }

    /** Mark as dirty (triggers debounced save). */
    markDirty(): void {
        this.knowledgeDB.markDirty();
    }

    /** Persist to disk immediately. */
    async save(): Promise<void> {
        await this.knowledgeDB.save();
    }

    /** Close and persist final state. */
    async close(): Promise<void> {
        await this.knowledgeDB.close();
        this.initialized = false;
    }

    // -----------------------------------------------------------------------
    // Private: Schema initialization
    // -----------------------------------------------------------------------

    private initMemorySchema(): void {
        const db = this.knowledgeDB.getDB();
        // Phase 1: legacy v1 tables (sessions, episodes, recipes, patterns)
        execDDL(db, MEMORY_SCHEMA_V1);
        // Phase 2: Memory-v2 additive tables + version tracker (FEATURE-0315)
        execDDL(db, MEMORY_SCHEMA_V2_ADDITIVE);
        // Phase 3.5 (UCM-readiness): profile_id column for multi-profile facts.
        // Default 'default' covers Vault Operator's single-user reality; UCM later
        // assigns per-profile values (work / personal / coding / ...).
        this.applyV3ProfileColumn(db);
        // Phase 4 (FEATURE-0318 task B.3): delta-window state per thread so
        // SingleCallExtractor can pull only new messages and persist a
        // ~200 token rolling summary.
        this.applyV4ConversationDeltaColumns(db);
        this.bumpSchemaVersion(db);
        console.debug(`[MemoryDB] Schema initialized (version ${MEMORY_SCHEMA_VERSION})`);
    }

    /**
     * Idempotent ADD COLUMN for facts.profile_id. Skips when the column
     * already exists, so v2 upgraders and fresh installs both land at v3.
     */
    private applyV3ProfileColumn(db: SqlJsDatabase): void {
        const cols = db.exec('PRAGMA table_info(facts)');
        if (cols.length === 0) return;
        const names = cols[0].values.map(r => r[1] as string);
        if (!names.includes('profile_id')) {
            db.run(`ALTER TABLE facts ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default'`);
        }
        // Index is wrapped in IF NOT EXISTS so a re-run on a partial migration
        // (column exists but index missing) still completes.
        db.run(`CREATE INDEX IF NOT EXISTS idx_facts_profile ON facts(profile_id)`);
    }

    /**
     * Idempotent ADD COLUMN for conversation_threads.last_extracted_message_index
     * and conversation_threads.delta_summary. Phase 4 / FEATURE-0318 task B.3.
     */
    private applyV4ConversationDeltaColumns(db: SqlJsDatabase): void {
        const cols = db.exec('PRAGMA table_info(conversation_threads)');
        if (cols.length === 0) return;
        const names = cols[0].values.map(r => r[1] as string);
        if (!names.includes('last_extracted_message_index')) {
            db.run(`ALTER TABLE conversation_threads ADD COLUMN last_extracted_message_index INTEGER`);
        }
        if (!names.includes('delta_summary')) {
            db.run(`ALTER TABLE conversation_threads ADD COLUMN delta_summary TEXT`);
        }
    }

    /**
     * Idempotent schema-version write. Old v1 DBs have no `memory_schema_meta`
     * row; the additive DDL above creates the table, this method seeds it.
     * Re-runs do nothing.
     */
    private bumpSchemaVersion(db: SqlJsDatabase): void {
        const result = db.exec('SELECT version FROM memory_schema_meta LIMIT 1');
        const existing = result[0]?.values?.[0]?.[0] as number | undefined;
        if (existing === MEMORY_SCHEMA_VERSION) return;
        if (existing === undefined) {
            db.run('INSERT INTO memory_schema_meta (version) VALUES (?)', [MEMORY_SCHEMA_VERSION]);
        } else {
            db.run('UPDATE memory_schema_meta SET version = ?', [MEMORY_SCHEMA_VERSION]);
        }
        this.knowledgeDB.markDirty();
    }

    /** Current schema version stored in memory_schema_meta. Returns 0 if missing. */
    getSchemaVersion(): number {
        const db = this.knowledgeDB.getDB();
        try {
            const result = db.exec('SELECT version FROM memory_schema_meta LIMIT 1');
            return (result[0]?.values?.[0]?.[0] as number) ?? 0;
        } catch {
            return 0;
        }
    }
}

function execDDL(db: SqlJsDatabase, ddl: string): void {
    for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }
}
