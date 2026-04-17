/**
 * VaultDataFileAdapter — FileAdapter implementation backed by Obsidian's vault
 * DataAdapter (vault.adapter).
 *
 * Used when a service needs to write files **inside the vault** instead of in
 * the cross-vault {vault-parent}/.obsidian-agent/ root (which is what
 * GlobalFileService provides).
 *
 * Why both implementations:
 * - GlobalFileService:  cross-vault settings, recipes, memory, knowledge DB
 *                       (data that should survive a vault rename or be shared).
 * - VaultDataFileAdapter: per-task tmp files that the agent must read back via
 *                         vault-aware tools (e.g. read_file). Without this
 *                         wrapper, externalised tool results land outside the
 *                         vault and read_file() resolves the same relative path
 *                         to a different absolute location, so the agent loses
 *                         the file (BUG-014).
 *
 * All paths passed to this adapter are normalised via Obsidian's normalizePath
 * so that callers can use forward slashes regardless of platform.
 */

import { normalizePath, type DataAdapter } from 'obsidian';
import type { FileAdapter } from './types';

export class VaultDataFileAdapter implements FileAdapter {
    private readonly adapter: DataAdapter;

    constructor(adapter: DataAdapter) {
        this.adapter = adapter;
    }

    private np(p: string): string {
        return normalizePath(p);
    }

    async exists(p: string): Promise<boolean> {
        return this.adapter.exists(this.np(p));
    }

    async read(p: string): Promise<string> {
        return this.adapter.read(this.np(p));
    }

    async write(p: string, data: string): Promise<void> {
        await this.adapter.write(this.np(p), data);
    }

    async append(p: string, data: string): Promise<void> {
        await this.adapter.append(this.np(p), data);
    }

    /**
     * Create a directory. Obsidian's mkdir is single-level on at least one
     * platform combination (BUG-014, Windows + iCloud), so we ensure every
     * parent exists first, mirroring the recursive semantics callers expect.
     */
    async mkdir(p: string): Promise<void> {
        const normalized = this.np(p);
        const parts = normalized.split('/').filter((s) => s.length > 0);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!(await this.adapter.exists(current))) {
                await this.adapter.mkdir(current);
            }
        }
    }

    async remove(p: string): Promise<void> {
        await this.adapter.remove(this.np(p));
    }

    async list(p: string): Promise<{ files: string[]; folders: string[] }> {
        const listed = await this.adapter.list(this.np(p));
        return { files: listed.files, folders: listed.folders };
    }

    async stat(p: string): Promise<{ mtime: number; size: number } | null> {
        const s = await this.adapter.stat(this.np(p));
        if (!s) return null;
        return { mtime: s.mtime, size: s.size };
    }
}
