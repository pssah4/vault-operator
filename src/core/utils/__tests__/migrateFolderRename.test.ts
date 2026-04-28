import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { migrateFolderRename } from '../migrateFolderRename';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface FakeAdapter {
    files: Set<string>;
    folders: Set<string>;
    renames: Array<[string, string]>;
}

function makeAdapter(initial: { folders?: string[]; files?: string[] }): {
    adapter: {
        exists(p: string): Promise<boolean>;
        rename(oldPath: string, newPath: string): Promise<void>;
    };
    state: FakeAdapter;
} {
    const state: FakeAdapter = {
        files: new Set(initial.files ?? []),
        folders: new Set(initial.folders ?? []),
        renames: [],
    };
    return {
        state,
        adapter: {
            exists: (p: string) => Promise.resolve(state.folders.has(p) || state.files.has(p)),
            rename: (oldPath: string, newPath: string) => {
                if (state.folders.has(oldPath)) {
                    state.folders.delete(oldPath);
                    state.folders.add(newPath);
                } else if (state.files.has(oldPath)) {
                    state.files.delete(oldPath);
                    state.files.add(newPath);
                } else {
                    return Promise.reject(new Error(`not found: ${oldPath}`));
                }
                state.renames.push([oldPath, newPath]);
                return Promise.resolve();
            },
        },
    };
}

function makeApp(adapter: { exists(p: string): Promise<boolean>; rename(oldPath: string, newPath: string): Promise<void> }) {
    return { vault: { adapter } } as Parameters<typeof migrateFolderRename>[0];
}

describe('migrateFolderRename (folder rename migration)', () => {
    let tmpRoot: string;
    let vaultBasePath: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsilo-rename-test-'));
        vaultBasePath = path.join(tmpRoot, 'TestVault');
        fs.mkdirSync(vaultBasePath, { recursive: true });
    });

    afterEach(() => {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* noop */ }
    });

    it('renames legacy vault-local folder when only legacy exists', async () => {
        const { adapter, state } = makeAdapter({ folders: ['.obsidian-agent'] });
        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, undefined);
        expect(result.vaultLocalRenamed).toBe(true);
        expect(state.folders.has('obsilo-vault')).toBe(true);
        expect(state.folders.has('.obsidian-agent')).toBe(false);
    });

    it('skips vault-local rename when settings has a custom path', async () => {
        const { adapter, state } = makeAdapter({ folders: ['.obsidian-agent'] });
        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, '/custom/abs/path');
        expect(result.vaultLocalRenamed).toBe(false);
        expect(result.vaultLocalReason).toMatch(/custom/);
        expect(state.folders.has('.obsidian-agent')).toBe(true);
    });

    it('skips vault-local rename when both legacy and new folders already exist', async () => {
        const { adapter, state } = makeAdapter({ folders: ['.obsidian-agent', 'obsilo-vault'] });
        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, undefined);
        expect(result.vaultLocalRenamed).toBe(false);
        expect(result.vaultLocalReason).toMatch(/both legacy and new/);
        expect(state.renames).toEqual([]);
    });

    it('is idempotent when only the new folder already exists', async () => {
        const { adapter, state } = makeAdapter({ folders: ['obsilo-vault'] });
        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, undefined);
        expect(result.vaultLocalRenamed).toBe(false);
        expect(state.renames).toEqual([]);
    });

    it('renames legacy global folder under vault-parent', async () => {
        const { adapter } = makeAdapter({});
        const oldGlobal = path.join(tmpRoot, '.obsidian-agent');
        fs.mkdirSync(oldGlobal, { recursive: true });
        fs.writeFileSync(path.join(oldGlobal, 'sentinel.txt'), 'legacy');

        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, undefined);
        expect(result.globalRenamed).toBe(true);
        expect(fs.existsSync(path.join(tmpRoot, 'obsilo-shared'))).toBe(true);
        expect(fs.existsSync(path.join(tmpRoot, 'obsilo-shared', 'sentinel.txt'))).toBe(true);
        expect(fs.existsSync(oldGlobal)).toBe(false);
    });

    it('skips global rename when both legacy and new folders exist', async () => {
        const { adapter } = makeAdapter({});
        fs.mkdirSync(path.join(tmpRoot, '.obsidian-agent'), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, 'obsilo-shared'), { recursive: true });

        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, undefined);
        expect(result.globalRenamed).toBe(false);
        expect(result.globalReason).toMatch(/both legacy and new/);
    });

    it('reports cleanly when nothing to migrate', async () => {
        const { adapter } = makeAdapter({});
        const result = await migrateFolderRename(makeApp(adapter), vaultBasePath, undefined);
        expect(result.vaultLocalRenamed).toBe(false);
        expect(result.globalRenamed).toBe(false);
    });

    it('handles empty vaultBasePath gracefully', async () => {
        const { adapter } = makeAdapter({ folders: ['.obsidian-agent'] });
        const result = await migrateFolderRename(makeApp(adapter), '', undefined);
        expect(result.vaultLocalRenamed).toBe(true);
        expect(result.globalRenamed).toBe(false);
        expect(result.globalReason).toMatch(/no vault basePath/);
    });
});
