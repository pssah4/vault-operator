/**
 * GlobalFileService
 *
 * FileAdapter implementation backed by Node.js `fs` at {vault-parent}/.obsidian-agent/.
 * Used by all services whose data is shared across vaults (memory, history,
 * rules, workflows, skills, recipes, episodes, logs, etc.).
 *
 * FEATURE-1508: Root changed from ~/.obsidian-agent/ to {vault-parent}/.obsidian-agent/
 * so that all global data lives next to the vault and syncs via iCloud/OneDrive/etc.
 *
 * Pattern follows GlobalModeStore (same require-based Node.js access
 * available in Obsidian's Electron runtime).
 */

import type { FileAdapter } from './types';
import * as fsModule from '../security/safeFs';
import osModule from 'os';
import pathModule from 'path';

/** Cross-vault data directory next to the vault. Fresh installs get
 *  "vault-operator-shared". Existing installs may still be on the
 *  legacy names; the constructor below detects them and stays put,
 *  so no migration is required for current users. */
const GLOBAL_DIR_NAME = 'vault-operator-shared';
/** Legacy names. Looked up in order; the first existing one wins. */
const LEGACY_GLOBAL_DIR_NAMES = ['obsilo-shared', '.obsidian-agent'] as const;
/** Legacy name. Used by onload migration to detect old installs. */
export const LEGACY_GLOBAL_DIR_NAME = '.obsidian-agent';

export class GlobalFileService implements FileAdapter {
    private readonly root: string;

    /**
     * @param vaultBasePath - Absolute path to the vault root (from vault.adapter.getBasePath()).
     *   Fresh installs land in {vault-parent}/vault-operator-shared/.
     *   If an existing user already has a legacy folder
     *   ({vault-parent}/obsilo-shared/ or {vault-parent}/.obsidian-agent/),
     *   that path is used instead so their data is never abandoned.
     *   Falls back to ~/vault-operator-shared/ if no vaultBasePath.
     */
    constructor(vaultBasePath?: string) {
        const baseDir = vaultBasePath ? pathModule.dirname(vaultBasePath) : osModule.homedir();

        // Prefer existing legacy folders if they exist (preserves user data).
        // probePathExists is the documented bypass for this case -- the
        // candidate paths live in the vault-parent and may not be in the
        // allowlist on every install layout.
        for (const legacy of LEGACY_GLOBAL_DIR_NAMES) {
            const candidate = pathModule.join(baseDir, legacy);
            if (fsModule.probePathExists(candidate)) {
                this.root = candidate;
                return;
            }
        }

        this.root = pathModule.join(baseDir, GLOBAL_DIR_NAME);
    }

    /** Return the legacy root path (~/.obsidian-agent/) for migration purposes. */
    static getLegacyRoot(): string {
        return pathModule.join(osModule.homedir(), LEGACY_GLOBAL_DIR_NAME);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Resolve a relative path to an absolute path under the root. */
    resolvePath(relativePath: string): string {
        const resolved = pathModule.join(this.root, relativePath);
        // H-5: Prevent path traversal — resolved path must stay within root
        if (!resolved.startsWith(this.root + pathModule.sep) && resolved !== this.root) {
            throw new Error(`Path traversal blocked: ${relativePath}`);
        }
        return resolved;
    }

    /** Return the root directory path (~/.obsidian-agent/). */
    getRoot(): string {
        return this.root;
    }

    // ── FileAdapter implementation ───────────────────────────────────────────

    async exists(p: string): Promise<boolean> {
        try {
            await fsModule.promises.access(this.resolvePath(p));
            return true;
        } catch {
            return false;
        }
    }

    async read(p: string): Promise<string> {
        return fsModule.promises.readFile(this.resolvePath(p), 'utf-8');
    }

    async write(p: string, data: string): Promise<void> {
        const abs = this.resolvePath(p);
        // Ensure parent directory exists
        await fsModule.promises.mkdir(pathModule.dirname(abs), { recursive: true });
        await fsModule.promises.writeFile(abs, data, 'utf-8');
    }

    /** Binary read for SQLite DBs and other non-UTF8 payloads (FEATURE-0319b backup-zip). */
    async readBinary(p: string): Promise<Uint8Array> {
        const buf = await fsModule.promises.readFile(this.resolvePath(p));
        return new Uint8Array(buf);
    }

    /** Binary write counterpart. */
    async writeBinary(p: string, data: Uint8Array): Promise<void> {
        const abs = this.resolvePath(p);
        await fsModule.promises.mkdir(pathModule.dirname(abs), { recursive: true });
        await fsModule.promises.writeFile(abs, data);
    }

    async mkdir(p: string): Promise<void> {
        await fsModule.promises.mkdir(this.resolvePath(p), { recursive: true });
    }

    async list(p: string): Promise<{ files: string[]; folders: string[] }> {
        const abs = this.resolvePath(p);
        try {
            const entries = await fsModule.promises.readdir(abs, { withFileTypes: true });
            const files: string[] = [];
            const folders: string[] = [];
            for (const entry of entries) {
                // Return paths relative to the adapter root (matching Obsidian convention)
                const relPath = p ? `${p}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    folders.push(relPath);
                } else {
                    files.push(relPath);
                }
            }
            return { files: files.sort(), folders: folders.sort() };
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
                return { files: [], folders: [] };
            }
            throw err;
        }
    }

    async remove(p: string): Promise<void> {
        const abs = this.resolvePath(p);
        const stat = await fsModule.promises.stat(abs).catch(() => null);
        if (!stat) return;
        if (stat.isDirectory()) {
            await fsModule.promises.rm(abs, { recursive: true, force: true });
        } else {
            await fsModule.promises.unlink(abs);
        }
    }

    async append(p: string, data: string): Promise<void> {
        const abs = this.resolvePath(p);
        // Ensure parent directory exists
        await fsModule.promises.mkdir(pathModule.dirname(abs), { recursive: true });
        await fsModule.promises.appendFile(abs, data, 'utf-8');
    }

    async stat(p: string): Promise<{ mtime: number; size: number } | null> {
        try {
            const s = await fsModule.promises.stat(this.resolvePath(p));
            return { mtime: s.mtimeMs, size: s.size };
        } catch {
            return null;
        }
    }
}
