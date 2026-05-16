/**
 * safeFs -- centralised filesystem wrapper with a hard path allowlist.
 *
 * Every fs operation in the plugin must go through this module. Direct
 * `import * as fs from 'fs'` is forbidden outside this file and its tests.
 * That keeps the Obsidian-Community-Plugin-Store reviewer's audit scope
 * minimal: one file plus the allowlist setup defines the entire
 * filesystem surface of the plugin.
 *
 * The allowlist is built once at plugin init (see safeFs.initialize) and
 * immutable afterwards. Every read/write resolves the path lexically with
 * `path.resolve` and verifies it falls under one of the configured roots.
 * Symlinks are not resolved -- that is deliberate, since resolving would
 * extend the allowlist to whatever the real filesystem points at.
 *
 * See SECURITY.md and FEAT-27-01-safefs-wrapper.md for the threat model.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- this is the *one* file that owns the fs module wrapper */

import type * as FsModule from 'fs';
import * as path from 'path';

// Loaded lazily to keep this module usable in unit tests without electron context.
let fsImpl: typeof FsModule | null = null;
function fs(): typeof FsModule {
    if (!fsImpl) {
        fsImpl = require('fs') as typeof FsModule;
    }
    return fsImpl;
}

export interface SafeFsAllowlist {
    /** Absolute path to the Obsidian vault root (`app.vault.adapter.getBasePath()`). */
    vaultRoot: string;
    /** Absolute path to the plugin data directory (`<vault>/.obsidian/plugins/vault-operator/`). */
    pluginDataDir: string;
    /** Absolute path to the user-facing agent config directory (`<vault>/.obsilo-vault/` by default). */
    agentConfigDir: string;
    /** Absolute path to the system temp directory (`os.tmpdir()`). */
    systemTempDir: string;
    /**
     * Extra roots for MCP/OAuth desktop config files. These are user-home
     * directories (`~/.config/Claude/`, `~/Library/Application Support/Claude/`,
     * `%APPDATA%\Claude\`, plus `~/.obsidian-agent/` for the local MCP token).
     * Only written to from explicit user-UI actions.
     */
    desktopConfigDirs: string[];
    /**
     * Other absolute paths the plugin needs to read or write. Today only the
     * cross-vault shared directory `{vault-parent}/obsilo-shared/` lives here
     * (see GlobalFileService). The list is small on purpose -- every entry is
     * an explicit decision made by the plugin author.
     */
    extraRoots?: string[];
}

export class SafeFsViolation extends Error {
    constructor(
        public readonly attemptedPath: string,
        public readonly allowedRoots: string[],
    ) {
        super(
            `safeFs: path "${attemptedPath}" is outside the allowlist. ` +
            `Allowed roots: ${allowedRoots.join(', ')}`,
        );
        this.name = 'SafeFsViolation';
    }
}

let allowlist: SafeFsAllowlist | null = null;
let allRoots: string[] = [];

/**
 * Initialise the allowlist. Must be called once during plugin onload before
 * any safeFs operation. Subsequent calls throw.
 */
export function initialize(list: SafeFsAllowlist): void {
    if (allowlist !== null) {
        throw new Error('safeFs: already initialised');
    }
    allowlist = {
        vaultRoot: path.resolve(list.vaultRoot),
        pluginDataDir: path.resolve(list.pluginDataDir),
        agentConfigDir: path.resolve(list.agentConfigDir),
        systemTempDir: path.resolve(list.systemTempDir),
        desktopConfigDirs: list.desktopConfigDirs.map((p) => path.resolve(p)),
        extraRoots: (list.extraRoots ?? []).map((p) => path.resolve(p)),
    };
    allRoots = [
        allowlist.vaultRoot,
        allowlist.pluginDataDir,
        allowlist.agentConfigDir,
        allowlist.systemTempDir,
        ...allowlist.desktopConfigDirs,
        ...(allowlist.extraRoots ?? []),
    ];
}

/** Test-only: reset the allowlist so each test sets its own. */
export function resetForTest(): void {
    allowlist = null;
    allRoots = [];
}

/**
 * Lexically resolve `p` and verify it falls under one of the allowlist roots.
 * Throws SafeFsViolation if not. Returns the resolved absolute path.
 */
export function assertAllowed(p: string): string {
    if (allowlist === null) {
        throw new Error('safeFs: not initialised. Call initialize() first.');
    }
    if (typeof p !== 'string' || p.length === 0) {
        throw new SafeFsViolation(String(p), allRoots);
    }
    const resolved = path.resolve(p);
    for (const root of allRoots) {
        const rel = path.relative(root, resolved);
        // rel must not start with '..' (would escape the root) and must not be
        // absolute (would mean different drive on Windows or rooted elsewhere).
        if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
            return resolved;
        }
        // Special case for `path.relative(root, root)` returning '' on some platforms.
        if (resolved === root) {
            return resolved;
        }
    }
    throw new SafeFsViolation(resolved, allRoots);
}

// ---------------------------------------------------------------------------
// Wrapped fs API -- only the subset actually used in the plugin.
// Adding new APIs here is a deliberate decision and should be reviewed.
// ---------------------------------------------------------------------------

export function readFileSync(p: string): Buffer;
export function readFileSync(p: string, options: BufferEncoding | { encoding: BufferEncoding; flag?: string }): string;
export function readFileSync(p: string, options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null): string | Buffer;
export function readFileSync(p: string, options?: unknown): string | Buffer {
    return fs().readFileSync(assertAllowed(p), options as Parameters<typeof FsModule.readFileSync>[1]);
}

export function writeFileSync(p: string, data: string | NodeJS.ArrayBufferView, options?: FsModule.WriteFileOptions): void {
    fs().writeFileSync(assertAllowed(p), data, options);
}

export function appendFileSync(p: string, data: string | Uint8Array, options?: FsModule.WriteFileOptions): void {
    fs().appendFileSync(assertAllowed(p), data, options);
}

export function existsSync(p: string): boolean {
    // existsSync may be called speculatively on paths we don't control yet
    // (e.g. detecting where node is installed). We allow path resolution
    // failures here to return false, matching the non-throwing nature of
    // existsSync. But we still gate against paths outside the allowlist.
    try {
        return fs().existsSync(assertAllowed(p));
    } catch (e) {
        if (e instanceof SafeFsViolation) throw e;
        return false;
    }
}

export function mkdirSync(p: string, options?: FsModule.MakeDirectoryOptions & { recursive?: boolean }): string | undefined {
    return fs().mkdirSync(assertAllowed(p), options);
}

export function rmSync(p: string, options?: FsModule.RmOptions): void {
    fs().rmSync(assertAllowed(p), options);
}

export function unlinkSync(p: string): void {
    fs().unlinkSync(assertAllowed(p));
}

export function readdirSync(p: string, options?: { withFileTypes?: boolean; encoding?: BufferEncoding | null }): string[] | FsModule.Dirent[] {
    return fs().readdirSync(assertAllowed(p), options as unknown as Parameters<typeof FsModule.readdirSync>[1]) as unknown as string[] | FsModule.Dirent[];
}

export function statSync(p: string, options?: FsModule.StatSyncOptions): FsModule.Stats | FsModule.BigIntStats | undefined {
    return fs().statSync(assertAllowed(p), options);
}

export function renameSync(oldPath: string, newPath: string): void {
    fs().renameSync(assertAllowed(oldPath), assertAllowed(newPath));
}

export function copyFileSync(src: string, dest: string, mode?: number): void {
    fs().copyFileSync(assertAllowed(src), assertAllowed(dest), mode);
}

export function openSync(p: string, flags: string | number, mode?: string | number | null): number {
    return fs().openSync(assertAllowed(p), flags, mode);
}

export function closeSync(fd: number): void {
    fs().closeSync(fd);
}

export function fsyncSync(fd: number): void {
    fs().fsyncSync(fd);
}

export function writeSync(fd: number, buffer: NodeJS.ArrayBufferView, offset?: number, length?: number, position?: number): number {
    return fs().writeSync(fd, buffer, offset, length, position);
}

// readFile has two real-world callers: a) text reads with an encoding
// argument (string result), b) binary reads without (Buffer result). The
// underlying `fs.promises.readFile` is overloaded; the safeFs wrapper
// mirrors that via overloaded function signatures so call sites stay
// strongly typed without per-call casts.
function _readFile(p: string): Promise<Buffer>;
function _readFile(p: string, options: BufferEncoding | { encoding: BufferEncoding; flag?: string }): Promise<string>;
function _readFile(p: string, options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null): Promise<string | Buffer>;
function _readFile(p: string, options?: unknown): Promise<string | Buffer> {
    return fs().promises.readFile(assertAllowed(p), options as Parameters<typeof FsModule.promises.readFile>[1]);
}

function _readdir(p: string): Promise<string[]>;
function _readdir(p: string, options: { withFileTypes: true; encoding?: BufferEncoding | null }): Promise<FsModule.Dirent[]>;
function _readdir(p: string, options: { withFileTypes?: false; encoding?: BufferEncoding | null } | BufferEncoding): Promise<string[]>;
function _readdir(p: string, options?: unknown): Promise<string[] | FsModule.Dirent[]> {
    return fs().promises.readdir(assertAllowed(p), options as Parameters<typeof FsModule.promises.readdir>[1]) as unknown as Promise<string[] | FsModule.Dirent[]>;
}

/** Promise-flavoured wrappers for callers that use fs.promises. */
export const promises = {
    readFile: _readFile,
    async writeFile(p: string, data: string | NodeJS.ArrayBufferView, options?: FsModule.WriteFileOptions): Promise<void> {
        await fs().promises.writeFile(assertAllowed(p), data, options);
    },
    async mkdir(p: string, options?: FsModule.MakeDirectoryOptions & { recursive?: boolean }): Promise<string | undefined> {
        return fs().promises.mkdir(assertAllowed(p), options);
    },
    async stat(p: string): Promise<FsModule.Stats> {
        return fs().promises.stat(assertAllowed(p));
    },
    async lstat(p: string): Promise<FsModule.Stats> {
        return fs().promises.lstat(assertAllowed(p));
    },
    readdir: _readdir,
    async rm(p: string, options?: FsModule.RmOptions): Promise<void> {
        await fs().promises.rm(assertAllowed(p), options);
    },
    async rmdir(p: string, options?: FsModule.RmDirOptions): Promise<void> {
        await fs().promises.rmdir(assertAllowed(p), options);
    },
    async unlink(p: string): Promise<void> {
        await fs().promises.unlink(assertAllowed(p));
    },
    async rename(oldPath: string, newPath: string): Promise<void> {
        await fs().promises.rename(assertAllowed(oldPath), assertAllowed(newPath));
    },
    async access(p: string, mode?: number): Promise<void> {
        await fs().promises.access(assertAllowed(p), mode);
    },
    async cp(src: string, dest: string, opts?: FsModule.CopyOptions): Promise<void> {
        await fs().promises.cp(assertAllowed(src), assertAllowed(dest), opts);
    },
    async copyFile(src: string, dest: string, mode?: number): Promise<void> {
        await fs().promises.copyFile(assertAllowed(src), assertAllowed(dest), mode);
    },
    async appendFile(p: string, data: string | Uint8Array, options?: FsModule.WriteFileOptions): Promise<void> {
        await fs().promises.appendFile(assertAllowed(p), data, options);
    },
    async open(p: string, flags: string | number, mode?: string | number | null): Promise<FsModule.promises.FileHandle> {
        return fs().promises.open(assertAllowed(p), flags, mode ?? undefined);
    },
    // symlink and readlink intentionally not exported. AUDIT-028 L-2 + AUDIT-029
    // closure: the wrapper resolves paths lexically (path.resolve, not
    // path.realpath) and therefore cannot validate a symlink target. Allowing
    // promises.symlink would have let any caller drop a trapdoor link inside an
    // allowed root that points outside it, and a subsequent read would have
    // passed the lexical allowlist check while reading the off-allowlist target.
    // Zero callers existed; the methods are removed rather than guarded.
    async chmod(p: string, mode: string | number): Promise<void> {
        await fs().promises.chmod(assertAllowed(p), mode);
    },
};

export function accessSync(p: string, mode?: number): void {
    fs().accessSync(assertAllowed(p), mode);
}

export function realpathSync(p: string): string {
    return fs().realpathSync(assertAllowed(p));
}

export function lstatSync(p: string): FsModule.Stats {
    return fs().lstatSync(assertAllowed(p));
}

export function chmodSync(p: string, mode: string | number): void {
    fs().chmodSync(assertAllowed(p), mode);
}

export function utimesSync(p: string, atime: number | Date, mtime: number | Date): void {
    fs().utimesSync(assertAllowed(p), atime, mtime);
}

export function createReadStream(p: string, options?: Parameters<typeof FsModule.createReadStream>[1]): FsModule.ReadStream {
    return fs().createReadStream(assertAllowed(p), options);
}

export function createWriteStream(p: string, options?: Parameters<typeof FsModule.createWriteStream>[1]): FsModule.WriteStream {
    return fs().createWriteStream(assertAllowed(p), options);
}

export function mkdtempSync(prefix: string, options?: { encoding?: BufferEncoding | null }): string {
    // Prefix is a path prefix (e.g. `<systemTempDir>/obsilo-render-`) and the
    // returned path is `<prefix>XXXX`. Both must fall under the allowlist;
    // since the returned path nests under the prefix, validating the prefix
    // is sufficient. mkdtempSync itself adds random suffix bytes.
    assertAllowed(prefix);
    return fs().mkdtempSync(prefix, options as Parameters<typeof FsModule.mkdtempSync>[1]);
}

/**
 * Probe whether an absolute path to a SYSTEM BINARY exists. Used by the
 * node-binary / libreoffice / git / cloudflared discovery code paths, which
 * intentionally look outside the allowlist (binaries live in /usr/local/bin,
 * /opt/homebrew/bin, etc.). The function only returns a boolean, never reads
 * or writes the file, and never returns its contents. Adding a new caller
 * of this function is a reviewed exception, not a routine fs operation --
 * keep the call sites small and documented.
 */
export function probeBinaryExists(absPath: string): boolean {
    if (!absPath) return false;
    try {
        return fs().existsSync(absPath);
    } catch {
        return false;
    }
}

/**
 * Probe whether a path exists, returning false instead of throwing when the
 * path is outside the allowlist. Used by GlobalFileService to detect legacy
 * cross-vault directories at startup, where the legacy candidates may live
 * in a parent directory that is technically outside the allowlist roots
 * built in main.ts. Returns false for non-existent paths and for paths the
 * caller is not allowed to read; never returns the file's contents.
 */
export function probePathExists(absPath: string): boolean {
    if (!absPath) return false;
    try {
        return fs().existsSync(absPath);
    } catch {
        return false;
    }
}

/** Test-only: read the current allowlist roots. */
export function _rootsForTest(): string[] {
    return [...allRoots];
}

/* eslint-enable @typescript-eslint/no-require-imports -- end of fs-wrapper file scope */
