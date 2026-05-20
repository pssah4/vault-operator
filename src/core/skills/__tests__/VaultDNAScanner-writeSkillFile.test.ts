/**
 * FEAT-29-02 unit tests for VaultDNAScanner.writeSkillFile.
 *
 * Covers the Welle-2 generator-refactor: post-Welle-1 the scanner writes
 * `{root}/data/skills/plugin/{id}/SKILL.md` with strict frontmatter (name +
 * description only) and a `## Plugin metadata` body section. Pre-Welle-1 it
 * keeps the legacy file layout `.skill.md` with the full frontmatter.
 *
 * Approach: VaultDNAScanner is too big to instantiate end-to-end (App,
 * Vault, plugin manifests, etc). We construct a thin App+Vault stub, point
 * the scanner at it, and exercise the private writeSkillFile via a typed
 * cast. The vault.adapter is an in-memory record of every write/mkdir so
 * tests can assert what landed where.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VaultDNAScanner } from '../VaultDNAScanner';
import type { PluginSkillMeta } from '../types';

interface AdapterCall {
    op: 'mkdir' | 'write' | 'remove' | 'rmdir';
    path: string;
    content?: string;
}

function makeStubVault() {
    const files = new Map<string, string>();
    const folders = new Set<string>();
    const calls: AdapterCall[] = [];

    const adapter = {
        async exists(p: string): Promise<boolean> {
            return files.has(p) || folders.has(p);
        },
        async mkdir(p: string): Promise<void> {
            calls.push({ op: 'mkdir', path: p });
            folders.add(p);
        },
        async read(p: string): Promise<string> {
            const v = files.get(p);
            if (v === undefined) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        async write(p: string, content: string): Promise<void> {
            calls.push({ op: 'write', path: p, content });
            files.set(p, content);
        },
        async remove(p: string): Promise<void> {
            calls.push({ op: 'remove', path: p });
            files.delete(p);
        },
        async rmdir(p: string, _recursive: boolean): Promise<void> {
            calls.push({ op: 'rmdir', path: p });
            folders.delete(p);
        },
        async list(p: string): Promise<{ files: string[]; folders: string[] }> {
            const prefix = p.endsWith('/') ? p : p + '/';
            return {
                files: [...files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')),
                folders: [...folders].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')),
            };
        },
        async stat(p: string): Promise<{ mtime: number; size: number; type: 'file' | 'folder' } | null> {
            if (files.has(p)) return { mtime: Date.now(), size: files.get(p)!.length, type: 'file' };
            if (folders.has(p)) return { mtime: Date.now(), size: 0, type: 'folder' };
            return null;
        },
    };

    const vault = {
        adapter,
        configDir: '.obsidian',
    };

    const app = {
        vault,
        plugins: { manifests: {}, plugins: {} },
        commands: { commands: {} },
    };

    return { app, vault, adapter, files, folders, calls };
}

type ScannerInternals = {
    holder: { settings: { agentFolderPath: string; _layoutMigrationStatus?: string } };
    skillsDir: string;
    writeSkillFile: (skill: PluginSkillMeta) => Promise<void>;
    cleanupLegacyPluginSkillsLayout: () => Promise<void>;
    readPluginSettings: (id: string, source: string) => Promise<unknown>;
    sanitizeSettings: (raw: unknown) => { sanitized: string; redactedCount: number; isEmpty: boolean };
};

function makeSkill(overrides: Partial<PluginSkillMeta> = {}): PluginSkillMeta {
    return {
        id: 'example-plugin',
        name: 'Example Plugin',
        source: 'vault-native',
        classification: 'FULL',
        enabled: true,
        commands: [
            { id: 'example-plugin:do-thing', name: 'Do Thing' },
        ],
        description: 'An example plugin used in tests',
        ...overrides,
    };
}

function makeScanner(migrated: boolean) {
    const stub = makeStubVault();
    const holder = {
        settings: {
            agentFolderPath: '.vault-operator',
            ...(migrated ? { _layoutMigrationStatus: 'complete' as const } : {}),
        },
    };
    const scanner = new VaultDNAScanner(
        stub.app as unknown as ConstructorParameters<typeof VaultDNAScanner>[0],
        stub.vault as unknown as ConstructorParameters<typeof VaultDNAScanner>[1],
        holder,
    );
    // Avoid reading real plugin data.json from disk.
    (scanner as unknown as ScannerInternals).readPluginSettings = async () => null;
    return { scanner, stub, holder };
}

describe('VaultDNAScanner.writeSkillFile (FEAT-29-02)', () => {
    describe('post-Welle-1 folder layout', () => {
        it('writes SKILL.md inside per-plugin folder when migrated', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'dataview', name: 'Dataview' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            const write = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('SKILL.md'),
            );
            expect(write).toBeDefined();
            expect(write!.path).toBe('.vault-operator/data/skills/plugin/dataview/SKILL.md');
            // mkdir should have walked the folder tree
            expect(stub.calls.some(
                (c) => c.op === 'mkdir' && c.path === '.vault-operator/data/skills/plugin/dataview',
            )).toBe(true);
        });

        it('uses strict Anthropic frontmatter (only name + description)', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'templater-obsidian', description: 'A templating engine' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;

            // Frontmatter is the leading --- block; pull it out
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            expect(fmMatch).toBeTruthy();
            const fm = fmMatch![1];

            // Anthropic format: exactly `name` and `description` keys at the
            // top-level. No id/source/plugin-type/status/class/has-settings/commands.
            expect(fm).toMatch(/^name:\s/m);
            expect(fm).toMatch(/^description:\s/m);
            expect(fm).not.toMatch(/^id:\s/m);
            expect(fm).not.toMatch(/^source:\s/m);
            expect(fm).not.toMatch(/^plugin-type:\s/m);
            expect(fm).not.toMatch(/^status:\s/m);
            expect(fm).not.toMatch(/^class:\s/m);
            expect(fm).not.toMatch(/^has-settings:\s/m);
            expect(fm).not.toMatch(/^needs-setup:\s/m);
            expect(fm).not.toMatch(/^commands:\s/m);
        });

        it('moves removed metadata into a "## Plugin metadata" body section', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({
                id: 'kanban',
                name: 'Kanban',
                source: 'vault-native',
                classification: 'PARTIAL',
                commands: [
                    { id: 'kanban:create-new-board', name: 'Create new board' },
                    { id: 'kanban:archive-card', name: 'Archive completed card' },
                ],
            });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;

            expect(content).toContain('## Plugin metadata');
            expect(content).toContain('**id:** `kanban`');
            expect(content).toContain('**source:** vault-native');
            expect(content).toContain('**class:** PARTIAL');
            expect(content).toContain('### Commands');
            expect(content).toContain('`kanban:create-new-board`');
            expect(content).toContain('`kanban:archive-card`');
        });

        it('is idempotent: a second call produces the identical file content', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'tasks', name: 'Tasks' });

            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const firstWrite = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('SKILL.md'),
            )!.content!;

            stub.calls.length = 0; // reset call log
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const secondWrite = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('SKILL.md'),
            )!.content!;

            expect(secondWrite).toBe(firstWrite);
        });

        it('generates references/commands.md for Top-5 plugins', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({
                id: 'obsidian-excalidraw-plugin',
                name: 'Excalidraw',
                commands: [
                    { id: 'obsidian-excalidraw-plugin:open', name: 'Open Excalidraw' },
                ],
            });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            const cmdRef = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('/references/commands.md'),
            );
            expect(cmdRef).toBeDefined();
            expect(cmdRef!.path).toBe(
                '.vault-operator/data/skills/plugin/obsidian-excalidraw-plugin/references/commands.md',
            );
            expect(cmdRef!.content).toContain('| Command ID | Name |');
            expect(cmdRef!.content).toContain('`obsidian-excalidraw-plugin:open`');
        });

        it('does NOT generate references/commands.md for non-Top-5 plugins', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'some-random-plugin', name: 'Random' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            const cmdRef = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('/references/commands.md'),
            );
            expect(cmdRef).toBeUndefined();
        });
    });

    describe('pre-Welle-1 legacy file layout', () => {
        it('writes flat {id}.skill.md when not migrated', async () => {
            const { scanner, stub } = makeScanner(false);
            const skill = makeSkill({ id: 'dataview', name: 'Dataview' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            const write = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('.skill.md'))!;
            expect(write.path).toBe('.vault-operator/plugin-skills/dataview.skill.md');
        });

        it('keeps the full legacy frontmatter (id, source, status, class, commands)', async () => {
            const { scanner, stub } = makeScanner(false);
            const skill = makeSkill({ id: 'tasks', name: 'Tasks' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('.skill.md'))!.content!;
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            const fm = fmMatch![1];

            expect(fm).toMatch(/^id: tasks/m);
            expect(fm).toMatch(/^name: Tasks/m);
            expect(fm).toMatch(/^source: vault-native/m);
            expect(fm).toMatch(/^plugin-type: community/m);
            expect(fm).toMatch(/^status: enabled/m);
            expect(fm).toMatch(/^class: FULL/m);
            expect(fm).toMatch(/^description:/m);
        });

        it('never writes into the folder layout when not migrated', async () => {
            const { scanner, stub } = makeScanner(false);
            const skill = makeSkill({ id: 'obsidian-excalidraw-plugin', name: 'Excalidraw' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            // Nothing should land at data/skills/plugin/.
            const stray = stub.calls.find(
                (c) => c.op === 'write' && c.path.includes('/data/skills/plugin/'),
            );
            expect(stray).toBeUndefined();
        });

        it('does NOT generate references/commands.md pre-migration (no per-plugin folder exists)', async () => {
            const { scanner, stub } = makeScanner(false);
            const skill = makeSkill({ id: 'obsidian-excalidraw-plugin', name: 'Excalidraw' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            const cmdRef = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('/references/commands.md'));
            expect(cmdRef).toBeUndefined();
        });
    });
});

describe('VaultDNAScanner.cleanupLegacyPluginSkillsLayout (FEAT-29-02 Task 5)', () => {
    it('removes .skill.md and .readme.md files from data/plugin-skills/ post-Welle-1', async () => {
        const { scanner, stub } = makeScanner(true);
        // Seed the legacy layout
        stub.folders.add('.vault-operator/data/plugin-skills');
        stub.files.set('.vault-operator/data/plugin-skills/dataview.skill.md', 'old content');
        stub.files.set('.vault-operator/data/plugin-skills/dataview.readme.md', 'old readme');

        await (scanner as unknown as ScannerInternals).cleanupLegacyPluginSkillsLayout();

        expect(stub.calls.some((c) => c.op === 'remove' && c.path.endsWith('dataview.skill.md'))).toBe(true);
        expect(stub.calls.some((c) => c.op === 'remove' && c.path.endsWith('dataview.readme.md'))).toBe(true);
        // Folder should be rmdir'd once empty
        expect(stub.calls.some((c) => c.op === 'rmdir' && c.path === '.vault-operator/data/plugin-skills')).toBe(true);
    });

    it('preserves user-added files in legacy folder (only removes .skill.md and .readme.md)', async () => {
        const { scanner, stub } = makeScanner(true);
        stub.folders.add('.vault-operator/data/plugin-skills');
        stub.files.set('.vault-operator/data/plugin-skills/dataview.skill.md', 'old');
        stub.files.set('.vault-operator/data/plugin-skills/user-note.md', 'my notes');

        await (scanner as unknown as ScannerInternals).cleanupLegacyPluginSkillsLayout();

        // Legacy file removed
        expect(stub.files.has('.vault-operator/data/plugin-skills/dataview.skill.md')).toBe(false);
        // User file preserved
        expect(stub.files.has('.vault-operator/data/plugin-skills/user-note.md')).toBe(true);
        // Folder NOT removed because it still contains user content
        expect(stub.folders.has('.vault-operator/data/plugin-skills')).toBe(true);
    });

    it('is a no-op when the legacy folder does not exist (idempotent on subsequent runs)', async () => {
        const { scanner, stub } = makeScanner(true);
        // No legacy folder seeded
        await (scanner as unknown as ScannerInternals).cleanupLegacyPluginSkillsLayout();
        expect(stub.calls).toEqual([]);
    });
});
