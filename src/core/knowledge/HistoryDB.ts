/**
 * HistoryDB -- dedicated SQLite store for conversation-history chunks.
 *
 * The third Memory-v2 database next to `knowledge.db` (vault index) and
 * `memory.db` (engine + legacy memory). Phase 1 ships only the schema
 * skeleton; Phase 6 fills it via the HistoryIndexer + `search_history`
 * tool (PLAN-001 phases 6).
 *
 * Storage: `{vault-parent}/.obsidian-agent/history.db` (user-global,
 * shared across vaults like memory.db).
 *
 * The `history_chunks` table is intentionally minimal in Phase 1 -- it
 * just has to exist so adapters and migration logic can target it.
 * Phase 6 will add FTS-aware columns, an embedding index, and a
 * URI-based join to the conversation_threads table in memory.db.
 *
 * FEATURE-0315 / PLAN-004 task 9.
 */

import type { Vault } from 'obsidian';
import { KnowledgeDB } from './KnowledgeDB';
import type { SqlJsDatabase } from './KnowledgeDB';

export const HISTORY_SCHEMA_VERSION = 1;

const HISTORY_SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS history_schema_meta (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    tokens INTEGER,
    created_at TEXT NOT NULL,
    embedding BLOB,
    embedding_model TEXT,
    metadata TEXT,
    UNIQUE(session_id, chunk_index),
    CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE INDEX IF NOT EXISTS idx_history_chunks_session ON history_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_history_chunks_role ON history_chunks(role);
CREATE INDEX IF NOT EXISTS idx_history_chunks_created ON history_chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_history_chunks_model ON history_chunks(embedding_model);
`;

export class HistoryDB {
    private knowledgeDB: KnowledgeDB;
    private initialized = false;

    constructor(vault: Vault, pluginDir: string, globalRoot?: string) {
        this.knowledgeDB = new KnowledgeDB(vault, pluginDir, 'global', 'history.db', globalRoot);
    }

    async open(): Promise<void> {
        await this.knowledgeDB.open();
        this.initSchema();
        this.initialized = true;
    }

    getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }

    isOpen(): boolean {
        return this.initialized && this.knowledgeDB.isOpen();
    }

    getAbsolutePath(): string {
        return this.knowledgeDB.getAbsolutePath();
    }

    getStorageLocation(): 'global' | 'local' | 'obsidian-sync' {
        return this.knowledgeDB.getStorageLocation();
    }

    markDirty(): void {
        this.knowledgeDB.markDirty();
    }

    async save(): Promise<void> {
        await this.knowledgeDB.save();
    }

    async close(): Promise<void> {
        await this.knowledgeDB.close();
        this.initialized = false;
    }

    /** Current schema version stored in history_schema_meta. Returns 0 if missing. */
    getSchemaVersion(): number {
        const db = this.knowledgeDB.getDB();
        try {
            const result = db.exec('SELECT version FROM history_schema_meta LIMIT 1');
            return (result[0]?.values?.[0]?.[0] as number) ?? 0;
        } catch {
            return 0;
        }
    }

    private initSchema(): void {
        const db = this.knowledgeDB.getDB();
        for (const stmt of HISTORY_SCHEMA_V1.split(';').map(s => s.trim()).filter(Boolean)) {
            db.run(stmt + ';');
        }
        this.bumpSchemaVersion(db);
        console.debug(`[HistoryDB] Schema initialized (version ${HISTORY_SCHEMA_VERSION})`);
    }

    private bumpSchemaVersion(db: SqlJsDatabase): void {
        const result = db.exec('SELECT version FROM history_schema_meta LIMIT 1');
        const existing = result[0]?.values?.[0]?.[0] as number | undefined;
        if (existing === HISTORY_SCHEMA_VERSION) return;
        if (existing === undefined) {
            db.run('INSERT INTO history_schema_meta (version) VALUES (?)', [HISTORY_SCHEMA_VERSION]);
        } else {
            db.run('UPDATE history_schema_meta SET version = ?', [HISTORY_SCHEMA_VERSION]);
        }
        this.knowledgeDB.markDirty();
    }
}
