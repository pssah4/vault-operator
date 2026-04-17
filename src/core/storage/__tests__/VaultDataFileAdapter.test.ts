/**
 * BUG-014 / FEATURE-1803 regression test
 *
 * VaultDataFileAdapter wraps Obsidian's vault.adapter and ensures:
 *  1. mkdir is recursive (Obsidian's mkdir is single-level on at least some
 *     platform combinations, e.g. Windows + iCloud).
 *  2. All paths are normalised via Obsidian's normalizePath so that callers
 *     can use forward slashes regardless of platform.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { DataAdapter } from 'obsidian';
import { VaultDataFileAdapter } from '../VaultDataFileAdapter';

interface MockDataAdapter {
    files: Map<string, string>;
    dirs: Set<string>;
    mkdirCalls: string[];
    exists: (p: string) => Promise<boolean>;
    read: (p: string) => Promise<string>;
    write: (p: string, data: string) => Promise<void>;
    append: (p: string, data: string) => Promise<void>;
    mkdir: (p: string) => Promise<void>;
    remove: (p: string) => Promise<void>;
    list: (p: string) => Promise<{ files: string[]; folders: string[] }>;
    stat: (p: string) => Promise<{ type: 'file' | 'folder'; ctime: number; mtime: number; size: number } | null>;
}

function createMockDataAdapter(): MockDataAdapter {
    const files = new Map<string, string>();
    const dirs = new Set<string>();
    const mkdirCalls: string[] = [];

    // Synchronous bodies wrapped in Promise.resolve — keeps the API shape
    // identical to the real DataAdapter without triggering require-await
    // (mock methods don't actually await anything).
    return {
        files,
        dirs,
        mkdirCalls,
        exists: (p: string) => Promise.resolve(files.has(p) || dirs.has(p)),
        read: (p: string) => {
            const c = files.get(p);
            if (c === undefined) return Promise.reject(new Error(`File not found: ${p}`));
            return Promise.resolve(c);
        },
        write: (p: string, data: string) => { files.set(p, data); return Promise.resolve(); },
        append: (p: string, data: string) => { files.set(p, (files.get(p) ?? '') + data); return Promise.resolve(); },
        mkdir: (p: string) => {
            mkdirCalls.push(p);
            dirs.add(p);
            return Promise.resolve();
        },
        remove: (p: string) => { files.delete(p); dirs.delete(p); return Promise.resolve(); },
        list: (p: string) => Promise.resolve({
            files: [...files.keys()].filter((f) => f.startsWith(p + '/')),
            folders: [...dirs].filter((d) => d.startsWith(p + '/') && d !== p),
        }),
        stat: (p: string) => Promise.resolve(
            files.has(p)
                ? { type: 'file' as const, ctime: 0, mtime: Date.now(), size: (files.get(p) ?? '').length }
                : null,
        ),
    };
}

describe('VaultDataFileAdapter (BUG-014 / FEATURE-1803)', () => {
    let mock: MockDataAdapter;
    let adapter: VaultDataFileAdapter;

    beforeEach(() => {
        mock = createMockDataAdapter();
        // Cast through unknown: the mock only implements the FileAdapter-relevant
        // subset of DataAdapter (no binary/process/trash methods). The adapter
        // under test never calls those, so the partial implementation is safe.
        adapter = new VaultDataFileAdapter(mock as unknown as DataAdapter);
    });

    it('mkdir creates every missing parent (recursive semantics)', async () => {
        await adapter.mkdir('.obsidian-agent/tmp/task-1');

        // Three mkdir calls, one per level, each only when the level did not exist.
        expect(mock.mkdirCalls).toEqual([
            '.obsidian-agent',
            '.obsidian-agent/tmp',
            '.obsidian-agent/tmp/task-1',
        ]);
        expect(mock.dirs.has('.obsidian-agent/tmp/task-1')).toBe(true);
    });

    it('mkdir is idempotent on existing parents', async () => {
        mock.dirs.add('.obsidian-agent');
        mock.dirs.add('.obsidian-agent/tmp');

        await adapter.mkdir('.obsidian-agent/tmp/task-2');

        // Only the missing leaf should be created.
        expect(mock.mkdirCalls).toEqual(['.obsidian-agent/tmp/task-2']);
    });

    it('write/read round-trip preserves content under nested paths', async () => {
        await adapter.mkdir('.obsidian-agent/tmp/task-3');
        await adapter.write('.obsidian-agent/tmp/task-3/use_mcp_tool-1.md', 'content payload');

        const back = await adapter.read('.obsidian-agent/tmp/task-3/use_mcp_tool-1.md');
        expect(back).toBe('content payload');
    });

    it('exists returns true for files written through the adapter', async () => {
        await adapter.write('.obsidian-agent/tmp/task-4/file.md', 'x');
        expect(await adapter.exists('.obsidian-agent/tmp/task-4/file.md')).toBe(true);
    });

    it('list returns files and folders under the given path', async () => {
        await adapter.mkdir('.obsidian-agent/tmp/task-5');
        await adapter.write('.obsidian-agent/tmp/task-5/a.md', 'a');
        await adapter.write('.obsidian-agent/tmp/task-5/b.md', 'b');

        const listing = await adapter.list('.obsidian-agent/tmp/task-5');
        expect(listing.files.sort()).toEqual([
            '.obsidian-agent/tmp/task-5/a.md',
            '.obsidian-agent/tmp/task-5/b.md',
        ]);
    });

    it('stat returns mtime and size for existing files, null for missing', async () => {
        await adapter.write('.obsidian-agent/tmp/task-6/file.md', 'hello');

        const s = await adapter.stat('.obsidian-agent/tmp/task-6/file.md');
        expect(s).not.toBeNull();
        expect(s?.size).toBe(5);

        const missing = await adapter.stat('.obsidian-agent/tmp/task-6/none.md');
        expect(missing).toBeNull();
    });
});
