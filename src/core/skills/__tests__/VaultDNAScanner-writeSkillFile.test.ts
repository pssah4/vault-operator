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
        async rename(from: string, to: string): Promise<void> {
            // Stub: move single file or folder + all its descendants.
            if (folders.has(from)) {
                folders.delete(from);
                folders.add(to);
                const prefix = from.endsWith('/') ? from : from + '/';
                for (const f of Array.from(files.keys())) {
                    if (f.startsWith(prefix)) {
                        files.set(to + f.slice(from.length), files.get(f)!);
                        files.delete(f);
                    }
                }
                for (const subf of Array.from(folders)) {
                    if (subf.startsWith(prefix) && subf !== from) {
                        folders.delete(subf);
                        folders.add(to + subf.slice(from.length));
                    }
                }
            } else if (files.has(from)) {
                files.set(to, files.get(from)!);
                files.delete(from);
            }
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
            expect(write!.path).toBe('.vault-operator/data/skills/dataview/SKILL.md');
            // mkdir should have walked the folder tree
            expect(stub.calls.some(
                (c) => c.op === 'mkdir' && c.path === '.vault-operator/data/skills/dataview',
            )).toBe(true);
        });

        it('uses strict Anthropic frontmatter (name + description + source only)', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'templater-obsidian', description: 'A templating engine' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;

            // Frontmatter is the leading --- block; pull it out
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            expect(fmMatch).toBeTruthy();
            const fm = fmMatch![1];

            // Anthropic format with FEAT-29-11 source-discriminator:
            // `name`, `description`, `source` (= plugin-id). No id/plugin-type/
            // status/class/has-settings/commands.
            expect(fm).toMatch(/^name:\s/m);
            expect(fm).toMatch(/^description:\s/m);
            expect(fm).toMatch(/^source: templater-obsidian$/m);
            expect(fm).not.toMatch(/^id:\s/m);
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

        it('does NOT generate references/commands.md for any plugin (FEAT-29-11 consolidation)', async () => {
            // Commands live in SKILL.md body under "## Plugin metadata > ### Commands".
            // The separate references/commands.md was a Welle-2 dead-mailbox
            // (the agent never read it without an explicit body hint).
            const { scanner, stub } = makeScanner(true);

            // Try with a former Top-5 plugin (would have generated a ref-md previously).
            const skill = makeSkill({
                id: 'obsidian-excalidraw-plugin',
                name: 'Excalidraw',
                commands: [{ id: 'obsidian-excalidraw-plugin:open', name: 'Open Excalidraw' }],
            });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            const cmdRef = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('/references/commands.md'),
            );
            expect(cmdRef).toBeUndefined();
            // Commands ARE still in the SKILL.md body.
            const skillMd = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!;
            expect(skillMd.content).toContain('`obsidian-excalidraw-plugin:open`');
        });

        it('writes a source: <plugin-id> frontmatter field (FEAT-29-11)', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'dataview', name: 'Dataview' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const skillMd = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!;
            const fm = /^---\n([\s\S]*?)\n---/m.exec(skillMd.content!)![1];
            expect(fm).toMatch(/^source: dataview$/m);
        });

        it('escapes backslash before backtick in plugin name/description (code-scanning #69/#70)', async () => {
            // A plugin name or description that contains a literal backslash
            // followed by characters that would otherwise be escaped (e.g.
            // backslash + backtick) must be sanitised in two passes,
            // backslash first. Otherwise the inserted `\` in front of the
            // backtick gets undone by the trailing backslash and the
            // surrounding markdown code-span breaks.
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({
                id: 'evil-plugin',
                name: 'name with \\ and ` chars',
                description: 'desc with \\ and " chars',
            });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const skillMd = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!;
            // Backslash must be doubled BEFORE the backtick escape, otherwise
            // we get `\` (literal backslash + escaped backtick) which markdown
            // parses as escaped-backtick that breaks the code-span.
            expect(skillMd.content!).toContain('\\\\');
            // Description sits in YAML "..." -- the backslash also has to be
            // doubled before the inner quote escape (code-scanning #71).
            const fm = /^---\n([\s\S]*?)\n---/m.exec(skillMd.content!)![1];
            const descLine = fm.split('\n').find((l) => l.startsWith('description:'));
            expect(descLine).toBeDefined();
            // Either "...\\..." (doubled backslash) survived, or the
            // escaped \" sequence is well-formed (no lone backslash).
            expect(descLine).toMatch(/\\\\/);
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

    /**
     * FEAT-29-05 follow-up: Obsidian plugin-ids may contain underscores
     * (e.g. `note_uid_generator`). The Anthropic skill spec mandates
     * kebab-case for the `name` field. writeFolderFormat converts at
     * write time -- the SKILL.md `name` is kebab-cased, `source` keeps
     * the original plugin-id so cleanup-by-source still finds its own
     * writes.
     */
    describe('plugin-id kebab-case conversion (FEAT-29-05)', () => {
        it('converts underscore-name to kebab-case in frontmatter name field', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'note_uid_generator', name: 'Note UID Generator' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            const fm = fmMatch![1];

            // Name is kebab-cased
            expect(fm).toMatch(/^name: note-uid-generator$/m);
            // Source keeps the original plugin-id (cleanup pass needs that
            // to find its own writes)
            expect(fm).toMatch(/^source: note_uid_generator$/m);
        });

        it('leaves already-kebab-case plugin-ids unchanged', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'dataview', name: 'Dataview' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            const fm = fmMatch![1];
            expect(fm).toMatch(/^name: dataview$/m);
            expect(fm).toMatch(/^source: dataview$/m);
        });

        it('strips dots and other non-kebab characters', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'plugin.v2_legacy', name: 'Plugin v2 Legacy' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            const fm = fmMatch![1];
            // Dots -> hyphens, underscores -> hyphens, collapse to single hyphen
            expect(fm).toMatch(/^name: plugin-v2-legacy$/m);
        });

        it('collapses consecutive hyphens after conversion', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({ id: 'plugin___multiple_underscores', name: 'Plugin' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const content = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'))!.content!;
            const fmMatch = /^---\n([\s\S]*?)\n---/m.exec(content);
            const fm = fmMatch![1];
            expect(fm).toMatch(/^name: plugin-multiple-underscores$/m);
            expect(fm).not.toMatch(/--/);
        });
    });

    /**
     * FEAT-29-11 follow-up: hasScanned flag drives the SkillsTab
     * auto-rescan kick-off. It must be false before any fullScan has
     * completed and true after, so the UI can distinguish "scanner has
     * not run yet" from "scanner ran and the user has no plugin skills".
     */
    describe('hasScanned flag (FEAT-29-11 auto-rescan signal)', () => {
        it('is false before any fullScan completes', () => {
            const { scanner } = makeScanner(true);
            expect(scanner.hasScanned).toBe(false);
        });

        it('flips to true after fullScan resolves', async () => {
            const { scanner } = makeScanner(true);
            expect(scanner.hasScanned).toBe(false);
            await scanner.fullScan();
            expect(scanner.hasScanned).toBe(true);
        });

        it('stays true on subsequent fullScan calls (sticky)', async () => {
            const { scanner } = makeScanner(true);
            await scanner.fullScan();
            await scanner.fullScan();
            expect(scanner.hasScanned).toBe(true);
        });
    });

    /**
     * FEAT-29-11 follow-up: every writeFolderFormat call must idempotently
     * drop any stale references/ subfolder under the plugin skill. The
     * init-time Stage-3 cleanup only triggered when SKILL.md already
     * carried the `source: <plugin-id>` marker, which it does not on the
     * first post-upgrade scan, so a pre-FEAT-29-11 references/readme.md
     * would survive. Doing the cleanup per-write closes that gap.
     */
    describe('per-write references/ cleanup (FEAT-29-11)', () => {
        it('drops a pre-existing references/readme.md when writing the new SKILL.md', async () => {
            const { scanner, stub } = makeScanner(true);
            // Seed a stale Welle-2 references/readme.md. The stub adapter does
            // not auto-track parent folders on write, so mkdir explicitly so
            // the production exists()-check finds the references/ folder.
            await stub.adapter.mkdir('.vault-operator/data/skills/dataview');
            await stub.adapter.mkdir('.vault-operator/data/skills/dataview/references');
            await stub.adapter.write(
                '.vault-operator/data/skills/dataview/references/readme.md',
                '# old generated readme',
            );
            expect(stub.files.has('.vault-operator/data/skills/dataview/references/readme.md')).toBe(true);

            const skill = makeSkill({ id: 'dataview', name: 'Dataview' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            // The stale readme is gone, the new SKILL.md is in place.
            expect(stub.files.has('.vault-operator/data/skills/dataview/references/readme.md')).toBe(false);
            expect(stub.files.has('.vault-operator/data/skills/dataview/SKILL.md')).toBe(true);
        });

        it('drops a pre-existing references/commands.md as well (Welle-2 Top-5 quirk)', async () => {
            const { scanner, stub } = makeScanner(true);
            await stub.adapter.mkdir('.vault-operator/data/skills/templater-obsidian');
            await stub.adapter.mkdir('.vault-operator/data/skills/templater-obsidian/references');
            await stub.adapter.write(
                '.vault-operator/data/skills/templater-obsidian/references/commands.md',
                '| Command | Id |\n|---|---|\n',
            );

            const skill = makeSkill({ id: 'templater-obsidian', name: 'Templater' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            expect(stub.files.has('.vault-operator/data/skills/templater-obsidian/references/commands.md')).toBe(false);
        });

        it('removes the now-empty references/ folder via rmdir', async () => {
            const { scanner, stub } = makeScanner(true);
            await stub.adapter.mkdir('.vault-operator/data/skills/canvas');
            await stub.adapter.mkdir('.vault-operator/data/skills/canvas/references');
            await stub.adapter.write(
                '.vault-operator/data/skills/canvas/references/readme.md',
                '# stale',
            );
            expect(stub.folders.has('.vault-operator/data/skills/canvas/references')).toBe(true);

            const skill = makeSkill({ id: 'canvas', name: 'Canvas' });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);

            expect(stub.folders.has('.vault-operator/data/skills/canvas/references')).toBe(false);
        });

        it('is idempotent when no references/ folder exists', async () => {
            const { scanner, stub } = makeScanner(true);
            // No references/ folder pre-existing -- writeSkillFile should
            // succeed without any rmdir / remove calls touching that path.
            const skill = makeSkill({ id: 'bookmarks', name: 'Bookmarks' });
            await expect(
                (scanner as unknown as ScannerInternals).writeSkillFile(skill),
            ).resolves.toBeUndefined();

            const refTouches = stub.calls.filter((c) => c.path.includes('/bookmarks/references'));
            expect(refTouches).toEqual([]);
        });
    });

    describe('AUDIT-FEAT-29-02 M-1 + L-2: markdown injection guards (now body-only)', () => {
        // FEAT-29-11 removed references/commands.md generation -- the
        // Welle-2 table is gone. Markdown-escape guarantees move to the
        // SKILL.md body (Plugin metadata section).
        // The two original table-escape tests are obsolete; the remaining
        // body-escape tests below (backtick + newline) still apply.

        it('escapes backticks in plugin id within inline code spans', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({
                id: 'kanban',
                name: 'Kanban',
                commands: [
                    { id: 'kanban:`exotic`', name: 'Exotic Command' },
                ],
            });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const skill_md = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('SKILL.md'),
            )!;
            // The backticks in the command id must be escaped so the inline-
            // code span around `${c.id}` does not get cut short.
            expect(skill_md.content!).toContain('\\`exotic\\`');
        });

        it('collapses newlines in command name within Plugin metadata list', async () => {
            const { scanner, stub } = makeScanner(true);
            const skill = makeSkill({
                id: 'templater-obsidian',
                name: 'Templater',
                commands: [
                    { id: 'templater-obsidian:run', name: 'Run\ntemplate' },
                ],
            });
            await (scanner as unknown as ScannerInternals).writeSkillFile(skill);
            const skill_md = stub.calls.find(
                (c) => c.op === 'write' && c.path.endsWith('SKILL.md'),
            )!;
            // The Plugin metadata list item must stay on one line, so the
            // raw newline in the command name has to be collapsed.
            const listItem = skill_md.content!
                .split('\n')
                .find((l: string) => l.includes('templater-obsidian:run'));
            expect(listItem).toBeDefined();
            expect(listItem).toContain('Run template');
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
