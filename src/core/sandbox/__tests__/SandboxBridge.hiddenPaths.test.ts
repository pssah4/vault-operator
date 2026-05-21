/**
 * FEAT-29-05 follow-up: SandboxBridge must transparently work with
 * hidden folders (.vault-operator/, .obsidian/, ...). Obsidian's
 * vault.getAbstractFileByPath returns null for paths inside hidden
 * folders, so the bridge falls back to the adapter API for read/write/
 * list/mkdir on those paths.
 *
 * Pinning this behaviour because init_skill, quick_validate, and every
 * future sandbox-bridge call against the skill folder depend on it.
 */

import { describe, it, expect } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { SandboxBridge } from '../SandboxBridge';

interface AdapterCall {
    op: 'exists' | 'read' | 'readBinary' | 'write' | 'writeBinary' | 'list' | 'mkdir';
    path: string;
}

function makeBridge(opts: {
    files?: Record<string, string>;
    binaries?: Record<string, ArrayBuffer>;
    folders?: Set<string>;
    tFiles?: Record<string, unknown>;
}) {
    const files = new Map<string, string>(Object.entries(opts.files ?? {}));
    const binaries = new Map<string, ArrayBuffer>(Object.entries(opts.binaries ?? {}));
    const folders = new Set<string>(opts.folders ?? []);
    const calls: AdapterCall[] = [];

    const adapter = {
        async exists(p: string) {
            calls.push({ op: 'exists', path: p });
            return files.has(p) || binaries.has(p) || folders.has(p);
        },
        async read(p: string) {
            calls.push({ op: 'read', path: p });
            const v = files.get(p);
            if (v === undefined) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        async readBinary(p: string) {
            calls.push({ op: 'readBinary', path: p });
            const v = binaries.get(p);
            if (!v) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        async write(p: string, content: string) {
            calls.push({ op: 'write', path: p });
            files.set(p, content);
        },
        async writeBinary(p: string, content: ArrayBuffer) {
            calls.push({ op: 'writeBinary', path: p });
            binaries.set(p, content);
        },
        async list(p: string) {
            calls.push({ op: 'list', path: p });
            const prefix = p.endsWith('/') ? p : p + '/';
            return {
                files: [...files.keys(), ...binaries.keys()].filter(
                    (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
                ),
                folders: [...folders].filter(
                    (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
                ),
            };
        },
        async mkdir(p: string) {
            calls.push({ op: 'mkdir', path: p });
            folders.add(p);
        },
    };

    const vault = {
        adapter,
        configDir: '.obsidian',
        getAbstractFileByPath: (p: string) => opts.tFiles?.[p] ?? null,
        getRoot: () => Object.create(TFolder.prototype),
        read: () => Promise.reject(new Error('TFile API should not be used for hidden paths')),
        readBinary: () => Promise.reject(new Error('TFile API should not be used for hidden paths')),
        modify: () => Promise.reject(new Error('TFile API should not be used for hidden paths')),
        modifyBinary: () => Promise.reject(new Error('TFile API should not be used for hidden paths')),
        create: () => Promise.reject(new Error('TFile API should not be used for hidden paths')),
        createBinary: () => Promise.reject(new Error('TFile API should not be used for hidden paths')),
    };

    const plugin = {
        app: { vault },
    } as unknown as import('../../../main').default;

    const bridge = new SandboxBridge(plugin);
    return { bridge, adapter, files, binaries, folders, calls };
}

describe('SandboxBridge hidden-path adapter fallback (FEAT-29-05)', () => {
    describe('vaultRead', () => {
        it('reads via adapter when the path lives under a hidden folder', async () => {
            const { bridge, calls } = makeBridge({
                files: { '.vault-operator/data/skills/x/SKILL.md': 'content' },
            });

            await expect(
                bridge.vaultRead('.vault-operator/data/skills/x/SKILL.md'),
            ).resolves.toBe('content');

            expect(calls.some((c) => c.op === 'read' && c.path === '.vault-operator/data/skills/x/SKILL.md')).toBe(true);
        });

        it('uses TFile API for normal vault paths', async () => {
            const fakeTFile = Object.create(TFile.prototype) as TFile;
            const { bridge } = makeBridge({
                tFiles: { 'Notes/My Note.md': fakeTFile },
            });

            // Throws because the test stub TFile path rejects, but the
            // important thing is the adapter is NOT used for non-hidden
            // paths. The throw confirms TFile path was taken.
            await expect(bridge.vaultRead('Notes/My Note.md')).rejects.toThrow(/TFile API/);
        });

        it('throws "Not a file" when the hidden-path target does not exist', async () => {
            const { bridge } = makeBridge({});
            await expect(
                bridge.vaultRead('.vault-operator/data/skills/missing/SKILL.md'),
            ).rejects.toThrow(/Not a file/);
        });

        it('detects hidden paths in any nested segment', async () => {
            const { bridge, calls } = makeBridge({
                files: { 'Notes/.archive/secret.md': 'hidden in subfolder' },
            });
            await expect(bridge.vaultRead('Notes/.archive/secret.md')).resolves.toBe('hidden in subfolder');
            expect(calls.some((c) => c.op === 'read')).toBe(true);
        });
    });

    describe('vaultWrite', () => {
        it('writes via adapter to hidden paths', async () => {
            const { bridge, files, calls } = makeBridge({});
            await bridge.vaultWrite('.vault-operator/data/skills/y/SKILL.md', 'new content');
            expect(files.get('.vault-operator/data/skills/y/SKILL.md')).toBe('new content');
            expect(calls.some((c) => c.op === 'write')).toBe(true);
        });

        it('still blocks writes to the configDir even for hidden adapter writes', async () => {
            const { bridge } = makeBridge({});
            await expect(
                bridge.vaultWrite('.obsidian/plugins/evil/data.json', 'malicious'),
            ).rejects.toThrow(/protected/);
        });
    });

    describe('vaultList', () => {
        it('lists via adapter for hidden folders', async () => {
            const { bridge } = makeBridge({
                files: {
                    '.vault-operator/data/skills/x/SKILL.md': '',
                    '.vault-operator/data/skills/x/scripts/foo.js': '',
                },
                folders: new Set([
                    '.vault-operator/data/skills/x',
                    '.vault-operator/data/skills/x/scripts',
                ]),
            });
            const result = await bridge.vaultList('.vault-operator/data/skills/x');
            expect(result).toContain('.vault-operator/data/skills/x/SKILL.md');
            expect(result).toContain('.vault-operator/data/skills/x/scripts');
        });

        it('throws when the hidden folder does not exist', async () => {
            const { bridge } = makeBridge({});
            await expect(
                bridge.vaultList('.vault-operator/missing'),
            ).rejects.toThrow(/Not a folder/);
        });
    });

    describe('vaultMkdir', () => {
        it('creates the entire chain of missing folders idempotently', async () => {
            const { bridge, folders, calls } = makeBridge({});
            await bridge.vaultMkdir('.vault-operator/data/skills/new/scripts');

            // Each segment is mkdir'd
            expect(folders.has('.vault-operator')).toBe(true);
            expect(folders.has('.vault-operator/data')).toBe(true);
            expect(folders.has('.vault-operator/data/skills')).toBe(true);
            expect(folders.has('.vault-operator/data/skills/new')).toBe(true);
            expect(folders.has('.vault-operator/data/skills/new/scripts')).toBe(true);

            const mkdirCalls = calls.filter((c) => c.op === 'mkdir');
            expect(mkdirCalls.length).toBeGreaterThanOrEqual(5);
        });

        it('is idempotent when every segment already exists', async () => {
            const { bridge, calls } = makeBridge({
                folders: new Set([
                    '.vault-operator',
                    '.vault-operator/data',
                    '.vault-operator/data/skills',
                ]),
            });
            await bridge.vaultMkdir('.vault-operator/data/skills');

            // No mkdir call (every segment short-circuited via exists)
            const mkdirCalls = calls.filter((c) => c.op === 'mkdir');
            expect(mkdirCalls).toEqual([]);
        });

        it('rejects path traversal attempts', async () => {
            const { bridge } = makeBridge({});
            await expect(bridge.vaultMkdir('../escape')).rejects.toThrow(/Invalid path/);
        });

        it('respects the configDir write-block', async () => {
            const { bridge } = makeBridge({});
            await expect(
                bridge.vaultMkdir('.obsidian/plugins/evil'),
            ).rejects.toThrow(/protected/);
        });
    });
});
