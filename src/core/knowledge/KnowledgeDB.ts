/**
 * KnowledgeDB -- SQLite wrapper for the Unified Knowledge Layer.
 *
 * Replaces vectra's single-JSON-file approach with sql.js (WASM SQLite).
 * Supports three storage locations with a fallback persistence chain:
 *   - global:        ~/.obsidian-agent/knowledge.db   (fs.promises, Desktop-only)
 *   - local:         {vault}/.obsidian-agent/knowledge.db  (vault.adapter)
 *   - obsidian-sync: {vault}/{pluginDir}/knowledge.db      (vault.adapter)
 *
 * Durability (FIX-12): sql.js has no WAL/journal -- persistence is full-blob
 * export/import. To prevent corruption from crashes or iCloud sync conflicts:
 *   - Atomic write: write .tmp → rotate current → .bak → rename .tmp → current
 *   - Integrity check on open: test query detects corrupt B-tree
 *   - Auto-recovery: try .bak first, then fresh DB as last resort
 *
 * ADR-050: SQLite Knowledge DB
 * FEATURE-1500: SQLite Knowledge DB
 */

import type { Vault } from 'obsidian';
import * as path from 'path';
import * as fs from '../security/safeFs';
import { WriterLock, WriterLockHeldError } from '../persistence/WriterLock';

export { WriterLockHeldError } from '../persistence/WriterLock';

// sql.js types -- we import the factory function at runtime
type SqlJsStatic = {
    Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
};
type SqlJsDatabase = {
    run(sql: string, params?: unknown[]): SqlJsDatabase;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
    /** Number of rows modified by the most recent INSERT/UPDATE/DELETE. */
    getRowsModified(): number;
};
type SqlJsStatement = {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(params?: Record<string, unknown>): Record<string, unknown>;
    get(params?: unknown[]): unknown[];
    free(): void;
    run(params?: unknown[]): void;
    reset(): void;
};

export type { SqlJsDatabase, SqlJsStatement };

const SCHEMA_VERSION = 11;

// ---------------------------------------------------------------------------
// Schema DDL
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    embedding_model TEXT NOT NULL DEFAULT 'unknown',
    UNIQUE(path, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vectors_path ON vectors(path);
CREATE INDEX IF NOT EXISTS idx_vectors_model ON vectors(embedding_model);

CREATE TABLE IF NOT EXISTS checkpoint (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT NOT NULL,
    property_name TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    UNIQUE(source_path, target_path, link_type, property_name)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_path);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_path);

CREATE TABLE IF NOT EXISTS tags (
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(path, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS implicit_edges (
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    similarity REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);
CREATE INDEX IF NOT EXISTS idx_implicit_source ON implicit_edges(source_path);
CREATE INDEX IF NOT EXISTS idx_implicit_target ON implicit_edges(target_path);

CREATE TABLE IF NOT EXISTS dismissed_pairs (
    path_a TEXT NOT NULL,
    path_b TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(path_a, path_b)
);

CREATE TABLE IF NOT EXISTS ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_path, cluster)
);
CREATE INDEX IF NOT EXISTS idx_ontology_cluster ON ontology(cluster);
CREATE INDEX IF NOT EXISTS idx_ontology_entity ON ontology(entity_path);

CREATE TABLE IF NOT EXISTS note_freshness (
    path TEXT PRIMARY KEY,
    freshness_class TEXT NOT NULL DEFAULT 'stable',
    temporal_marker_count INTEGER NOT NULL DEFAULT 0,
    classified_at TEXT NOT NULL,
    last_verdict TEXT,
    last_confidence REAL,
    last_summary TEXT,
    last_sources_json TEXT,
    last_checked_at TEXT,
    last_verifier_tier TEXT
);

-- v10 -> v11: note-level LLM-verifier history (IMP-20-06-01).
-- 1:N to note_freshness.path. Retention is enforced in the
-- NoteFreshnessHistoryStore wrapper, not the schema.
CREATE TABLE IF NOT EXISTS note_freshness_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    run_at TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confidence REAL NOT NULL,
    summary TEXT,
    sources_json TEXT,
    verifier_tier TEXT NOT NULL,
    model_id TEXT,
    tokens_used INTEGER
);
CREATE INDEX IF NOT EXISTS idx_note_freshness_history_path_run
    ON note_freshness_history(path, run_at DESC);

CREATE TABLE IF NOT EXISTS dismissed_freshness (
    note_path TEXT NOT NULL,
    hint_type TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(note_path, hint_type)
);

CREATE TABLE IF NOT EXISTS dismissed_health_findings (
    check_type TEXT NOT NULL,
    path TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (check_type, path)
);

-- v9 -> v10: BA-25 Karpathy-Wiki-Pattern Foundation (ADR-92 Bundle).
-- Six additive tables for Note-Summary storage, Frontmatter-Property
-- mirror, Cluster-Source-Stats, Cluster-Metadata plus two tables that
-- PLAN-12 will fill (Dialog-Ingest-State and Triage-Log).

-- FEAT-15-09: Note-Level summaries plus generation metadata.
CREATE TABLE IF NOT EXISTS note_summaries (
    note_path TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    summary_model TEXT NOT NULL,
    summarized_at TEXT NOT NULL,
    source_mtime INTEGER NOT NULL
);

-- FEAT-15-10: SQL mirror of frontmatter properties for taxonomy lookups.
CREATE TABLE IF NOT EXISTS frontmatter_properties (
    note_path TEXT NOT NULL,
    property_name TEXT NOT NULL,
    property_value TEXT NOT NULL,
    list_index INTEGER NOT NULL DEFAULT 0,
    UNIQUE(note_path, property_name, list_index)
);
CREATE INDEX IF NOT EXISTS idx_frontmatter_value ON frontmatter_properties(property_name, property_value);
CREATE INDEX IF NOT EXISTS idx_frontmatter_path ON frontmatter_properties(note_path);

-- FEAT-15-11 (ADR-93 Domain-only): per-cluster source-domain counts
-- backing the source-diversity score and concentration warning.
CREATE TABLE IF NOT EXISTS cluster_source_stats (
    cluster TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    note_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (cluster, source_domain)
);
CREATE INDEX IF NOT EXISTS idx_cluster_source_cluster ON cluster_source_stats(cluster);

-- FEAT-15-12 (ADR-94 Halbwertszeit + ADR-106 last_hint_at): per-cluster
-- configuration for freshness scoring, hot-cluster filter, and
-- activity-trigger cooldown.
CREATE TABLE IF NOT EXISTS cluster_metadata (
    cluster TEXT PRIMARY KEY,
    half_life_days INTEGER NOT NULL,
    custom_weights TEXT,
    last_external_check TEXT,
    last_hint_at TEXT,
    hot_cluster INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cluster_metadata_hot ON cluster_metadata(hot_cluster);

-- ADR-100 (FEAT-19-22 Dialog-State, filled by PLAN-12): persistent
-- ingest-session state across multi-turn dialogs and plugin restarts.
CREATE TABLE IF NOT EXISTS ingest_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uri TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_turn_at TEXT NOT NULL,
    state_json TEXT NOT NULL,
    conversation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_session_status ON ingest_session(status);

-- ADR-98 + ADR-102 (FEAT-19-12, FEAT-19-27, filled by PLAN-12):
-- triage-decision log plus double-trigger guard for the auto-trigger
-- listener.
CREATE TABLE IF NOT EXISTS ingest_triage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uri TEXT NOT NULL,
    triaged_at TEXT NOT NULL,
    decision TEXT NOT NULL,
    decision_reason TEXT,
    UNIQUE(source_uri)
);
`;

// ---------------------------------------------------------------------------
// KnowledgeDB
// ---------------------------------------------------------------------------

export class KnowledgeDB {
    private db: SqlJsDatabase | null = null;
    private SQL: SqlJsStatic | null = null;
    private vault: Vault;
    private storageLocation: 'global' | 'local' | 'obsidian-sync';
    private absolutePath: string;       // Absolute FS path (for global: fs.promises)
    private vaultRelativePath: string;  // Vault-relative path (for local/sync: vault.adapter)
    private dirty = false;
    private saveTimer: number | null = null;
    private saving = false;
    /** ADR-079 Cloud-Sync-Abwehr: only set in obsidian-sync setup. */
    private writerLock: WriterLock | null = null;
    /** Vault-relative plugin folder (e.g. `.obsidian/plugins/vault-operator`) — used to locate the sql.js WASM bundle. */
    private pluginDir: string;

    constructor(
        vault: Vault,
        pluginDir: string,
        storageLocation: 'global' | 'local' | 'obsidian-sync' = 'global',
        dbName = 'knowledge.db',
        /** Override the global root directory (default: {vault-parent}/.obsidian-agent/). */
        globalRoot?: string,
        /**
         * FEATURE-0507: vault-relative directory for the local storage mode.
         * Defaults to ".obsidian-agent" to preserve the legacy on-disk layout.
         * Pass `getAgentFolderPath(plugin)` to honor the user setting.
         */
        vaultRelativeDir = '.obsidian-agent',
    ) {
        this.vault = vault;
        this.pluginDir = pluginDir;
        this.storageLocation = storageLocation;

        const basePath = (vault.adapter as unknown as { getBasePath?(): string }).getBasePath?.() ?? '';

        if (storageLocation === 'global') {
            const root = globalRoot ?? path.join(path.dirname(basePath), '.obsidian-agent');
            this.absolutePath = path.join(root, dbName);
            this.vaultRelativePath = ''; // not used for global
        } else if (storageLocation === 'local') {
            this.vaultRelativePath = `${vaultRelativeDir}/${dbName}`;
            this.absolutePath = path.join(basePath, this.vaultRelativePath);
        } else {
            this.vaultRelativePath = `${pluginDir}/${dbName}`;
            this.absolutePath = path.join(basePath, this.vaultRelativePath);
        }
    }

    /** Initialize sql.js WASM and open/create the database. */
    async open(): Promise<void> {
        if (this.db) return; // already open

        // BUG-029: WriterLock for Setup-Klasse B (obsidian-sync). Same-host
        // duplicate instances are blocked here; cross-host (other device on
        // same Sync-Vault) is advisory only because PIDs are not portable.
        if (this.storageLocation === 'obsidian-sync') {
            this.writerLock = new WriterLock(path.dirname(this.absolutePath));
            const result = await this.writerLock.acquire();
            if (!result.acquired) {
                this.writerLock = null;
                throw new WriterLockHeldError(result.heldBy!);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-require-imports -- sql.js WASM init needs require for Electron compatibility
        const initSqlJs = require('sql.js') as (config?: { wasmBinary?: ArrayBuffer }) => Promise<SqlJsStatic>;

        // sql.js WASM is bundled inline at build time (Phase 1: no
        // runtime download, no pluginDir read, no CDN fallback).
        const wasmBinary = await this.loadWasmBinary();
        this.SQL = await initSqlJs({ wasmBinary });

        // Clean up stale .tmp files from interrupted writes
        await this.cleanupTmp();

        // Try to load existing DB with integrity check + auto-recovery
        const data = await this.readDB();
        if (data) {
            if (this.tryLoadWithIntegrityCheck(data)) return;

            // Primary DB corrupt -- try backup recovery
            console.warn('[KnowledgeDB] Primary DB corrupt, attempting backup recovery...');
            const backupData = await this.readBackup();
            if (backupData && this.tryLoadWithIntegrityCheck(backupData)) {
                console.warn('[KnowledgeDB] Recovered from backup');
                this.markDirty(); // save recovered state as new primary
                return;
            }

            // Both corrupt -- fresh DB
            console.warn('[KnowledgeDB] Backup recovery failed, creating fresh database');
        }

        this.db = new this.SQL.Database();
        this.initSchema();
    }

    /** Get the raw sql.js Database instance for direct queries. */
    getDB(): SqlJsDatabase {
        if (!this.db) throw new Error('KnowledgeDB not opened. Call open() first.');
        return this.db;
    }

    /**
     * Decode the inlined sql.js WASM binary. Phase 1: WASM ships inside
     * main.js as base64, no disk read and no CDN fetch. Obsidian's
     * Developer Policy does not allow downloading code at runtime, and
     * extracting bundled WASM into pluginDir is the "self-update"
     * pattern the review bot rejects.
     */
    private async loadWasmBinary(): Promise<ArrayBuffer> {
        const mod = await import('../../_generated/bundled-wasm') as { SQL_WASM_BASE64: string };
        const bytes = Uint8Array.from(atob(mod.SQL_WASM_BASE64), c => c.charCodeAt(0));
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    /** Check if the DB is open and ready. */
    isOpen(): boolean {
        return this.db !== null;
    }

    /** Absolute filesystem path of the live DB file. Used by SnapshotJob. */
    getAbsolutePath(): string {
        return this.absolutePath;
    }

    /** Storage location, used by callers that need to skip vault-sync paths. */
    getStorageLocation(): 'global' | 'local' | 'obsidian-sync' {
        return this.storageLocation;
    }

    /** Mark the DB as dirty (needs saving). Triggers debounced save. */
    markDirty(): void {
        this.dirty = true;
        this.scheduleSave();
    }

    /** Persist DB to disk immediately. */
    async save(): Promise<void> {
        if (!this.db || !this.dirty || this.saving) return;
        this.saving = true;
        try {
            const data = this.db.export();
            await this.writeDB(data);
            this.dirty = false;
        } catch (e) {
            console.warn('[KnowledgeDB] Save failed:', e);
        } finally {
            this.saving = false;
        }
    }

    /** Close the DB and persist final state. Call on plugin unload. */
    async close(): Promise<void> {
        if (this.saveTimer) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.save();
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        if (this.writerLock) {
            await this.writerLock.release().catch((e) =>
                console.warn('[KnowledgeDB] WriterLock release failed (non-fatal):', e),
            );
            this.writerLock = null;
        }
    }

    /** Delete the DB file from disk and reset in-memory state. */
    async deleteDB(): Promise<void> {
        await this.close();
        try {
            if (this.storageLocation === 'global') {
                await fs.promises.unlink(this.absolutePath).catch(() => { /* non-fatal */ });
                await fs.promises.unlink(this.absolutePath + '.bak').catch(() => { /* non-fatal */ });
            } else {
                for (const suffix of ['', '.bak']) {
                    const p = this.vaultRelativePath + suffix;
                    const exists = await this.vault.adapter.exists(p);
                    if (exists) await this.vault.adapter.remove(p);
                }
            }
        } catch { /* non-fatal */ }
    }

    // -----------------------------------------------------------------------
    // Checkpoint helpers (key-value in checkpoint table)
    // -----------------------------------------------------------------------

    getCheckpointValue(key: string): string | null {
        if (!this.db) return null;
        const result = this.db.exec('SELECT value FROM checkpoint WHERE key = ?', [key]);
        if (result.length === 0 || result[0].values.length === 0) return null;
        return result[0].values[0][0] as string;
    }

    setCheckpointValue(key: string, value: string): void {
        if (!this.db) return;
        this.db.run('INSERT OR REPLACE INTO checkpoint (key, value) VALUES (?, ?)', [key, value]);
        this.markDirty();
    }

    // -----------------------------------------------------------------------
    // Private: Schema
    // -----------------------------------------------------------------------

    private initSchema(): void {
        if (!this.db) return;
        // Execute DDL statements one by one (sql.js doesn't support multi-statement exec well)
        for (const stmt of SCHEMA_DDL.split(';').map(s => s.trim()).filter(Boolean)) {
            this.db.run(stmt + ';');
        }
        // Set initial version
        const existing = this.db.exec('SELECT version FROM schema_meta');
        if (existing.length === 0 || existing[0].values.length === 0) {
            this.db.run('INSERT INTO schema_meta VALUES (?)', [SCHEMA_VERSION]);
        }
        this.markDirty();
    }

    private migrateSchema(): void {
        if (!this.db) return;
        const result = this.db.exec('SELECT version FROM schema_meta');
        const currentVersion = (result.length > 0 && result[0].values.length > 0)
            ? result[0].values[0][0] as number
            : 0;

        if (currentVersion < SCHEMA_VERSION) {
            // v1 -> v2: Add enriched column for two-pass contextual enrichment
            if (currentVersion < 2) {
                try {
                    this.db.run('ALTER TABLE vectors ADD COLUMN enriched INTEGER NOT NULL DEFAULT 0');
                } catch {
                    // Column may already exist if schema was partially migrated
                }
            }

            // v6 -> v7: Add confidence column to edges (FEATURE-2001, ADR-069)
            if (currentVersion < 7) {
                try {
                    this.db.run('ALTER TABLE edges ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0');
                } catch {
                    // Column may already exist if schema was partially migrated
                }
            }

            // v2 -> v3: Add edges + tags tables for graph extraction (FEATURE-1502)
            // v3 -> v4: Add implicit_edges table (FEATURE-1503)
            // v4 -> v5: Add dismissed_pairs table (FEATURE-1506)
            // v5 -> v6: Add ontology table (FEATURE-1902)
            // v7 -> v8: Add dismissed_health_findings table (vault health skip/ignore)
            // All CREATE TABLE IF NOT EXISTS — idempotent, handled by initSchema() below

            // v8 -> v9: Add embedding_model column so the cosine search can
            // filter on the model that produced each vector (FEATURE-0314,
            // ADR-079). URI schemas for paths land separately, in Memory v2
            // Phase 1+ via new tables -- not by mutating the existing columns.
            if (currentVersion < 9) {
                try {
                    this.db.run("ALTER TABLE vectors ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'unknown'");
                } catch {
                    // Column may already exist if schema was partially migrated
                }
            }

            // v9 -> v10: BA-25 Karpathy-Wiki-Pattern foundation (ADR-92).
            // Six new additive tables: note_summaries, frontmatter_properties,
            // cluster_source_stats, cluster_metadata, ingest_session,
            // ingest_triage_log. All created idempotently by the initSchema()
            // re-run below; no ALTER on existing tables needed.

            // v10 -> v11: IMP-20-06-01 freshness verifier columns plus
            // note_freshness_history table. ADD COLUMN runs explicitly
            // (initSchema re-run below cannot mutate an existing table).
            // WriterLock around ALTER is the FIX-12 lesson; the
            // serializer is single-threaded inside this constructor so
            // the ALTER cannot race against an ingest write.
            if (currentVersion < 11) {
                for (const col of [
                    'last_verdict TEXT',
                    'last_confidence REAL',
                    'last_summary TEXT',
                    'last_sources_json TEXT',
                    'last_checked_at TEXT',
                    'last_verifier_tier TEXT',
                ]) {
                    try {
                        this.db.run(`ALTER TABLE note_freshness ADD COLUMN ${col}`);
                    } catch {
                        // Column may already exist if a previous migration attempt landed partial.
                    }
                }
            }

            // Re-run DDL (CREATE IF NOT EXISTS is idempotent)
            this.initSchema();
            this.db.run('UPDATE schema_meta SET version = ?', [SCHEMA_VERSION]);
            this.markDirty();
            console.debug(`[KnowledgeDB] Migrated schema from v${currentVersion} to v${SCHEMA_VERSION}`);
        }
    }


    // -----------------------------------------------------------------------
    // Private: Integrity Check + Recovery
    // -----------------------------------------------------------------------

    /**
     * Try to load a DB from raw data, run integrity check + schema migration.
     * Returns true if the DB is healthy and assigned to this.db.
     * Returns false if the data is corrupt (this.db remains null).
     *
     * Two-stage integrity check (FEATURE-0314, ADR-079):
     *   1. Touch-the-B-tree queries on schema_meta + vectors -- catches blob
     *      truncation, missing tables, broken root pages.
     *   2. PRAGMA integrity_check -- SQLite's own deeper structural audit.
     *      Catches corruption that the lightweight queries miss (orphan
     *      pages, broken indexes, freelist mismatches).
     */
    private tryLoadWithIntegrityCheck(data: Uint8Array): boolean {
        if (!this.SQL) return false;
        let candidate: SqlJsDatabase | null = null;
        try {
            candidate = new this.SQL.Database(data);
            // Stage 1: light B-tree touch
            candidate.exec('SELECT count(*) FROM schema_meta');
            candidate.exec('SELECT count(*) FROM vectors');
            // Stage 2: PRAGMA integrity_check (returns 'ok' or list of errors)
            const integrity = candidate.exec('PRAGMA integrity_check;');
            const verdict = integrity[0]?.values?.[0]?.[0];
            if (verdict !== 'ok') {
                console.warn('[KnowledgeDB] integrity_check failed:', verdict);
                throw new Error(`integrity_check returned ${String(verdict)}`);
            }
            // DB is healthy -- assign and migrate
            this.db = candidate;
            this.migrateSchema();
            return true;
        } catch {
            // Corrupt -- clean up
            try { candidate?.close(); } catch { /* ignore */ }
            this.db = null;
            return false;
        }
    }

    // -----------------------------------------------------------------------
    // Private: Persistence (Atomic write with backup)
    // -----------------------------------------------------------------------

    /** Allowed suffixes for DB file variants. */
    private static readonly ALLOWED_SUFFIXES = new Set(['', '.bak', '.tmp']);

    private async readDB(): Promise<Uint8Array | null> {
        return this.readFile('');
    }

    private async readBackup(): Promise<Uint8Array | null> {
        return this.readFile('.bak');
    }

    /** Read the DB file (or .bak variant) from the appropriate storage. */
    private async readFile(suffix: '' | '.bak' | '.tmp'): Promise<Uint8Array | null> {
        if (!KnowledgeDB.ALLOWED_SUFFIXES.has(suffix)) return null;
        try {
            if (this.storageLocation === 'global') {
                const filePath = this.absolutePath + suffix;
                const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
                if (!exists) return null;
                const buf = await fs.promises.readFile(filePath);
                return new Uint8Array(buf);
            } else {
                const filePath = this.vaultRelativePath + suffix;
                const exists = await this.vault.adapter.exists(filePath);
                if (!exists) return null;
                const buf = await this.vault.adapter.readBinary(filePath);
                return new Uint8Array(buf);
            }
        } catch (e) {
            console.warn(`[KnowledgeDB] Failed to read DB${suffix}:`, e);
            return null;
        }
    }

    /**
     * Write DB to disk with atomic write pattern (FIX-12).
     *
     * For global (fs.promises): write .tmp → rotate current → .bak → rename .tmp → current
     * For local/sync (vault.adapter): backup current → .bak, then write new data
     * (vault.adapter has no rename, so we use backup-before-write instead)
     */
    private async writeDB(data: Uint8Array): Promise<void> {
        if (this.storageLocation === 'global') {
            await this.writeDBGlobalAtomic(data);
        } else {
            await this.writeDBVaultWithBackup(data);
        }
    }

    /** Atomic write via fs.promises: tmp → rename chain. */
    private async writeDBGlobalAtomic(data: Uint8Array): Promise<void> {
        const dir = path.dirname(this.absolutePath);
        await fs.promises.mkdir(dir, { recursive: true });

        const tmpPath = this.absolutePath + '.tmp';
        const bakPath = this.absolutePath + '.bak';

        // 1. Write to temp file
        await fs.promises.writeFile(tmpPath, data);

        // 2. Rotate current → backup (skip if first write)
        try {
            await fs.promises.rename(this.absolutePath, bakPath);
        } catch { /* first write -- no existing file to backup */ }

        // 3. Atomic rename: tmp → current
        await fs.promises.rename(tmpPath, this.absolutePath);
    }

    /**
     * Vault-mode write: write-tmp -> verify -> backup-current -> replace.
     *
     * vault.adapter has no rename, so we cannot use the global atomic-rename
     * pattern. Instead we stage to `.tmp`, read it back to verify the bytes
     * landed correctly, only then overwrite the real file. The previous
     * version is rotated to `.bak` so the open-path recovery (tryLoad ->
     * readBackup) still has a fallback. FEATURE-0314, ADR-079 Massnahme 2.
     */
    private async writeDBVaultWithBackup(data: Uint8Array): Promise<void> {
        // Ensure parent directory exists
        const dir = this.vaultRelativePath.substring(0, this.vaultRelativePath.lastIndexOf('/'));
        if (dir) {
            const dirExists = await this.vault.adapter.exists(dir);
            if (!dirExists) await this.vault.adapter.mkdir(dir);
        }

        const tmpPath = this.vaultRelativePath + '.tmp';
        const bakPath = this.vaultRelativePath + '.bak';

        // 1. Stage new data in .tmp
        await this.vault.adapter.writeBinary(tmpPath, data.buffer);

        // 2. Verify the staged bytes match what we intended to write.
        //    Catches truncation under iCloud/Dropbox sync conflicts before we touch the live file.
        try {
            const staged = await this.vault.adapter.readBinary(tmpPath);
            if (!this.bytesEqual(new Uint8Array(staged), data)) {
                await this.vault.adapter.remove(tmpPath).catch(() => undefined);
                throw new Error('Staged DB bytes did not match expected payload');
            }
        } catch (e) {
            await this.vault.adapter.remove(tmpPath).catch(() => undefined);
            throw e;
        }

        // 3. Rotate current -> .bak (read-modify-write because vault.adapter has no rename).
        try {
            const exists = await this.vault.adapter.exists(this.vaultRelativePath);
            if (exists) {
                const currentData = await this.vault.adapter.readBinary(this.vaultRelativePath);
                await this.vault.adapter.writeBinary(bakPath, currentData);
            }
        } catch {
            console.warn('[KnowledgeDB] Backup rotation failed (non-fatal)');
        }

        // 4. Promote .tmp -> live by writing the verified payload, then drop .tmp
        await this.vault.adapter.writeBinary(this.vaultRelativePath, data.buffer);
        await this.vault.adapter.remove(tmpPath).catch(() => undefined);
    }

    private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /** Remove stale .tmp files left behind by interrupted writes. */
    private async cleanupTmp(): Promise<void> {
        try {
            if (this.storageLocation === 'global') {
                await fs.promises.unlink(this.absolutePath + '.tmp').catch(() => { /* no stale tmp */ });
            } else {
                const tmpPath = this.vaultRelativePath + '.tmp';
                const exists = await this.vault.adapter.exists(tmpPath);
                if (exists) await this.vault.adapter.remove(tmpPath);
            }
        } catch { /* non-fatal */ }
    }

    private scheduleSave(): void {
        if (this.saveTimer) return; // already scheduled
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            void this.save();
        }, 2000); // 2s debounce
    }
}
