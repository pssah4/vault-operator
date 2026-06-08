/**
 * BackupExportService -- FEAT-29-12.
 *
 * Selective backup/export of plugin state into a single ZIP archive
 * and the reverse direction (unpack + return file list for import).
 *
 * Scope:
 *   - Skills under data/skills/
 *   - Memory DB (data/memory.db + journal)
 *   - History DB (data/history.db + journal)
 *   - Rules markdown(s) under data/rules*
 *   - Workflows folder under data/workflows/
 *   - Optionally a secret-filtered copy of data.json
 *
 * Out-of-scope here:
 *   - Secret-filtering of data.json (lives in BackupSecretFilter)
 *   - Import-conflict resolution (lives in ImportConflictResolver)
 *   - Auto-daily-scheduling (lives in AutoBackupScheduler)
 *   - UI (lives in BackupExportModal)
 *
 * The service is pure-logic + I/O-via-adapter. All side effects flow
 * through the BackupFileAdapter interface so tests run in-memory.
 */

import JSZip from 'jszip';

/** Per-section selection. */
export interface BackupSelection {
    skills: boolean;
    memory: boolean;
    history: boolean;
    rules: boolean;
    workflows: boolean;
    /** Settings (data.json). Subject to the secret filter when true. */
    settings: boolean;
    /** When true, the secret filter is bypassed and API-Keys ship along. */
    exportSecrets: boolean;
}

/** A file as it lives in the archive. Binary-safe. */
export interface BackupFile {
    /** Vault-relative path of the source file. Same path is used inside the ZIP. */
    path: string;
    /** Raw bytes of the file. UTF-8 encoded for text sources. */
    content: Uint8Array;
    /** Hint that the original was text. The archive does not depend on this; downstream UI can use it for diff views. */
    isText: boolean;
}

/** Audit manifest inside every archive. */
export interface BackupManifest {
    schemaVersion: 1;
    createdAt: string;
    selection: BackupSelection;
    sections: Record<keyof Omit<BackupSelection, 'exportSecrets'>, number>;
    fileCount: number;
    /** SHA-256 of the concatenated file contents in deterministic order. */
    contentHash: string;
}

/** Minimal storage interface the service needs. Wider than core/storage/FileAdapter to include binary IO. */
export interface BackupFileAdapter {
    exists(path: string): Promise<boolean>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    readBinary(path: string): Promise<Uint8Array>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    stat(path: string): Promise<{ mtime: number; size: number } | null>;
}

/** Default mapping of selection-flag -> root paths inside the agent-folder. */
export const SECTION_ROOTS: Record<keyof Omit<BackupSelection, 'exportSecrets'>, string[]> = {
    skills: ['data/skills'],
    memory: ['data/memory.db', 'data/memory.db-journal'],
    history: ['data/history.db', 'data/history.db-journal'],
    rules: ['data/rules.md'],
    workflows: ['data/workflows'],
    settings: ['data.json'],
};

const MANIFEST_FILENAME = 'BACKUP_MANIFEST.json';

/**
 * Walk a folder recursively, collecting every contained file path
 * (depth-first). Returns paths relative to the adapter root (matching
 * Obsidian convention).
 */
async function walkFiles(adapter: BackupFileAdapter, root: string): Promise<string[]> {
    if (!(await adapter.exists(root))) return [];
    const out: string[] = [];
    const stack: string[] = [root];
    while (stack.length > 0) {
        const current = stack.pop()!;
        try {
            const listing = await adapter.list(current);
            for (const f of listing.files) out.push(f);
            for (const f of listing.folders) stack.push(f);
        } catch {
            // If it is a file (not a folder), list throws. Treat as a single file.
            out.push(current);
        }
    }
    return out;
}

/**
 * Collect the files for the given selection. Pure: no archive build,
 * no secret filtering, no validation -- just read every file the
 * selection covers and return them as BackupFile[].
 *
 * `agentRoot` is the vault-relative path to the agent folder (e.g.
 * `.vault-operator`). Section paths in SECTION_ROOTS are resolved
 * against that root.
 */
export async function collectFiles(
    adapter: BackupFileAdapter,
    agentRoot: string,
    selection: BackupSelection,
): Promise<BackupFile[]> {
    const wanted: string[] = [];
    for (const section of Object.keys(SECTION_ROOTS) as Array<keyof typeof SECTION_ROOTS>) {
        if (!selection[section]) continue;
        for (const rel of SECTION_ROOTS[section]) {
            wanted.push(joinPath(agentRoot, rel));
        }
    }
    const files: BackupFile[] = [];
    for (const root of wanted) {
        const isFolder = await isFolderPath(adapter, root);
        if (isFolder) {
            const all = await walkFiles(adapter, root);
            for (const p of all) {
                const file = await readFileSafe(adapter, p);
                if (file) files.push(file);
            }
        } else if (await adapter.exists(root)) {
            const file = await readFileSafe(adapter, root);
            if (file) files.push(file);
        }
    }
    // Stable order so the manifest hash is deterministic.
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return files;
}

async function isFolderPath(adapter: BackupFileAdapter, p: string): Promise<boolean> {
    try {
        await adapter.list(p);
        return true;
    } catch {
        return false;
    }
}

async function readFileSafe(adapter: BackupFileAdapter, path: string): Promise<BackupFile | null> {
    try {
        const isText = isLikelyTextPath(path);
        const content = isText
            ? new TextEncoder().encode(await adapter.read(path))
            : await adapter.readBinary(path);
        return { path, content, isText };
    } catch {
        return null;
    }
}

function isLikelyTextPath(p: string): boolean {
    return /\.(md|json|txt|yaml|yml|ts|js|toml|csv)$/i.test(p);
}

/**
 * Returns true when a ZIP entry path contains a `..` segment or is
 * rooted (`/foo`, `\\foo`, drive-letter prefix). Exported for direct
 * unit testing because JSZip normalises path-traversal on its public
 * API, leaving this defense unreachable through a normal round-trip
 * test.
 */
export function isUnsafePath(path: string): boolean {
    if (!path) return false;
    if (path.startsWith('/') || path.startsWith('\\')) return true;
    if (/^[a-zA-Z]:[\\/]/.test(path)) return true; // C:\, D:/...
    const segments = path.split(/[\\/]/);
    return segments.some((s) => s === '..');
}

function joinPath(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return `${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`;
}

/**
 * Build a JSZip archive from the collected files. Adds a deterministic
 * manifest at the root for audit + import validation.
 */
export async function buildZip(
    files: BackupFile[],
    selection: BackupSelection,
    now: string = new Date().toISOString(),
): Promise<Uint8Array> {
    const zip = new JSZip();
    for (const f of files) {
        zip.file(f.path, f.content);
    }
    const manifest = await buildManifestObject(files, selection, now);
    zip.file(MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/**
 * Inverse of buildZip: read a ZIP, validate the manifest, return the
 * file list (manifest excluded).
 */
export async function unpackZip(zipBytes: Uint8Array): Promise<{ files: BackupFile[]; manifest: BackupManifest }> {
    const zip = await JSZip.loadAsync(zipBytes);
    const manifestEntry = zip.file(MANIFEST_FILENAME);
    if (!manifestEntry) {
        throw new Error(`Backup ZIP is missing ${MANIFEST_FILENAME}`);
    }
    const manifestText = await manifestEntry.async('string');
    const manifest = JSON.parse(manifestText) as BackupManifest;
    if (manifest.schemaVersion !== 1) {
        throw new Error(`Unsupported backup schema version: ${String(manifest.schemaVersion)}`);
    }
    const files: BackupFile[] = [];
    for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (entry.name === MANIFEST_FILENAME) continue;
        if (isUnsafePath(entry.name)) {
            // Defense in depth. JSZip normalises path-traversal on
            // generateAsync, but a hand-crafted raw ZIP byte sequence
            // could still carry segments we should refuse.
            throw new Error(`Backup ZIP contains an unsafe path: ${entry.name}`);
        }
        const bytes = await entry.async('uint8array');
        files.push({
            path: entry.name,
            content: bytes,
            isText: isLikelyTextPath(entry.name),
        });
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const recomputed = await contentHash(files);
    if (recomputed !== manifest.contentHash) {
        throw new Error(
            `Backup integrity check failed: manifest hash ${manifest.contentHash} does not match recomputed hash ${recomputed}`,
        );
    }
    return { files, manifest };
}

/** Compute a stable SHA-256 over the file contents in path-sorted order. */
async function contentHash(files: BackupFile[]): Promise<string> {
    // Always sort internally so callers can pass files in any order and
    // still get a deterministic hash. buildZip and unpackZip both rely
    // on this for the integrity check to round-trip cleanly.
    const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const chunks: Uint8Array[] = [];
    for (const f of sorted) {
        chunks.push(new TextEncoder().encode(`PATH:${f.path}\n`));
        chunks.push(f.content);
        chunks.push(new TextEncoder().encode('\n'));
    }
    const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        buf.set(c, offset);
        offset += c.byteLength;
    }
    // BackupExportService runs in the renderer; `window.crypto.subtle` is
    // the standard Web Crypto handle. Replaces the previous globalThis cast
    // (review-bot Tier 3 `no-global-this`).
    const cryptoLike = (window as { crypto?: { subtle?: SubtleCrypto } }).crypto;
    if (cryptoLike?.subtle) {
        const digest = await cryptoLike.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
    // Fallback used only in environments without WebCrypto (older test runners).
    // The fallback hash is not cryptographic but stable for round-trip tests.
    let h = 2166136261;
    for (let i = 0; i < buf.length; i++) {
        h ^= buf[i];
        h = (h * 16777619) >>> 0;
    }
    return `fnv32:${h.toString(16)}`;
}

async function buildManifestObject(
    files: BackupFile[],
    selection: BackupSelection,
    now: string,
): Promise<BackupManifest> {
    const sections: BackupManifest['sections'] = {
        skills: 0,
        memory: 0,
        history: 0,
        rules: 0,
        workflows: 0,
        settings: 0,
    };
    for (const f of files) {
        for (const section of Object.keys(SECTION_ROOTS) as Array<keyof typeof SECTION_ROOTS>) {
            for (const rel of SECTION_ROOTS[section]) {
                if (f.path.endsWith(rel) || f.path.includes(`/${rel.split('/').pop()}`)) {
                    sections[section] += 1;
                    break;
                }
            }
        }
    }
    return {
        schemaVersion: 1,
        createdAt: now,
        selection,
        sections,
        fileCount: files.length,
        contentHash: await contentHash(files),
    };
}

/** Public re-export of the manifest-only inspection (for UI: show what is in a ZIP without unpacking everything). */
export async function readManifest(zipBytes: Uint8Array): Promise<BackupManifest> {
    const zip = await JSZip.loadAsync(zipBytes);
    const manifestEntry = zip.file(MANIFEST_FILENAME);
    if (!manifestEntry) throw new Error(`Backup ZIP is missing ${MANIFEST_FILENAME}`);
    return JSON.parse(await manifestEntry.async('string')) as BackupManifest;
}
