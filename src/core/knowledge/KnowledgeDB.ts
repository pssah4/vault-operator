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

import { type Vault, requestUrl } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
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

const SCHEMA_VERSION = 9;

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
    classified_at TEXT NOT NULL
);

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
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private saving = false;
    /** ADR-079 Cloud-Sync-Abwehr: only set in obsidian-sync setup. */
    private writerLock: WriterLock | null = null;

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

        // Obsidian's app:// protocol can't serve WASM files via fetch().
        // Load the binary directly from disk and pass it to sql.js.
        const pluginBasePath = (this.vault.adapter as unknown as { getBasePath?(): string }).getBasePath?.() ?? '';
        const configDir = this.vault.configDir;
        const pluginMainDir = path.join(pluginBasePath, configDir, 'plugins', 'obsilo-agent');

        const wasmBinary = await this.loadWasmBinary(pluginMainDir);
        this.SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer });

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

    // AUDIT-010 M-2: SHA-256 hash of sql.js@1.14.1 sql-wasm.wasm for CDN integrity check
    private static readonly SQL_WASM_SHA256 = '438c88f666dc054ce4e9395f80fe9db4218b1a3c379960454880f048a7898aed';

    /**
     * Load sql-wasm.wasm binary: try local disk first, download from CDN as fallback (FIX-16).
     * BRAT installs only main.js/manifest/styles -- WASM files are missing for those users.
     */
    private async loadWasmBinary(pluginMainDir: string): Promise<Buffer> {
        const candidates = [
            path.join(pluginMainDir, 'sql-wasm-browser.wasm'),
            path.join(pluginMainDir, 'sql-wasm.wasm'),
        ];

        // Try reading from disk (existing behavior)
        for (const candidate of candidates) {
            try {
                return fs.readFileSync(candidate);
            } catch {
                // try next
            }
        }

        // Fallback: download from CDN via Obsidian's requestUrl (FIX-16)
        const cdnUrl = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm';
        console.debug('[KnowledgeDB] WASM not found on disk, downloading from CDN...');
        const response = await requestUrl({ url: cdnUrl });

        // AUDIT-010 M-2/M-3: Verify integrity before trusting CDN content
        const hashBuffer = await crypto.subtle.digest('SHA-256', response.arrayBuffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashHex !== KnowledgeDB.SQL_WASM_SHA256) {
            throw new Error(`[KnowledgeDB] WASM integrity check failed (expected ${KnowledgeDB.SQL_WASM_SHA256.slice(0, 16)}..., got ${hashHex.slice(0, 16)}...)`);
        }

        const buffer = Buffer.from(response.arrayBuffer);

        // Cache to disk for next startup
        const cachePath = candidates[1]; // sql-wasm.wasm
        try {
            fs.writeFileSync(cachePath, buffer);
            console.debug('[KnowledgeDB] WASM cached to', cachePath);
        } catch {
            console.debug('[KnowledgeDB] Could not cache WASM to disk (non-fatal)');
        }

        return buffer;
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
            clearTimeout(this.saveTimer);
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
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.save();
        }, 2000); // 2s debounce
    }
}
