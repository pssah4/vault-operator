/**
 * FEAT-29-11 Step B: tests for BuiltinSkillMaterializer.
 *
 * Built-in skills ship as a Record<skillName, Record<relPath, content>>
 * via the esbuild-generated BUNDLED_SKILLS constant. On plugin onload
 * the materializer writes them to `data/skills/{name}/` so users can
 * browse the folder (Step A "Edit -> open folder") and so the loader
 * picks them up via the same disk-scan as user skills.
 *
 * Contract:
 *   - SKILL.md is written with `source: builtin` in frontmatter
 *     (regardless of what the bundle's own frontmatter said).
 *   - Nested files (scripts/*, references/*, assets/*) are written
 *     verbatim under the skill folder.
 *   - When the existing SKILL.md has `source: user` (or any non-builtin
 *     non-empty value that is not the literal bundle source `bundled`),
 *     the user override wins and that skill is skipped with a notice.
 *   - On re-materialization, the previous builtin folder is wiped
 *     (so a removed-from-bundle file is gone, not stale).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BuiltinSkillMaterializer } from '../BuiltinSkillMaterializer';

interface StubAdapter {
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    read(p: string): Promise<string>;
    write(p: string, content: string): Promise<void>;
    writeBinary(p: string, data: ArrayBuffer): Promise<void>;
    remove(p: string): Promise<void>;
    rmdir(p: string, recursive: boolean): Promise<void>;
    list(p: string): Promise<{ files: string[]; folders: string[] }>;
}

function makeStubAdapter() {
    const files = new Map<string, string>();
    const binaries = new Map<string, ArrayBuffer>();
    const folders = new Set<string>();

    const adapter: StubAdapter = {
        async exists(p) {
            return files.has(p) || binaries.has(p) || folders.has(p);
        },
        async mkdir(p) {
            folders.add(p);
        },
        async read(p) {
            const v = files.get(p);
            if (v === undefined) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        async write(p, content) {
            files.set(p, content);
            const parent = p.slice(0, p.lastIndexOf('/'));
            if (parent) folders.add(parent);
        },
        async writeBinary(p, data) {
            binaries.set(p, data);
            const parent = p.slice(0, p.lastIndexOf('/'));
            if (parent) folders.add(parent);
        },
        async remove(p) {
            files.delete(p);
            binaries.delete(p);
        },
        async rmdir(p) {
            folders.delete(p);
            for (const k of Array.from(files.keys())) {
                if (k.startsWith(p + '/')) files.delete(k);
            }
            for (const k of Array.from(binaries.keys())) {
                if (k.startsWith(p + '/')) binaries.delete(k);
            }
            for (const k of Array.from(folders)) {
                if (k.startsWith(p + '/')) folders.delete(k);
            }
        },
        async list(p) {
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
    };

    return { adapter, files, binaries, folders };
}

const SKILLS_ROOT = '.vault-operator/data/skills';

describe('BuiltinSkillMaterializer', () => {
    let stub: ReturnType<typeof makeStubAdapter>;
    let materializer: BuiltinSkillMaterializer;

    beforeEach(() => {
        stub = makeStubAdapter();
        materializer = new BuiltinSkillMaterializer(stub.adapter as never, SKILLS_ROOT);
    });

    it('writes a flat SKILL.md skill into data/skills/{name}/', async () => {
        const bundle = {
            humanizer: {
                'SKILL.md': '---\nname: humanizer\ndescription: Test skill\nsource: bundled\n---\n\n# Humanizer\n\nBody.\n',
            },
        };

        const report = await materializer.materializeAll(bundle);

        expect(report.written).toEqual(['humanizer']);
        expect(report.skipped).toEqual([]);
        expect(report.errors).toEqual([]);
        const skillMd = stub.files.get('.vault-operator/data/skills/humanizer/SKILL.md');
        expect(skillMd).toBeDefined();
        expect(skillMd).toContain('# Humanizer');
        expect(skillMd).toContain('Body.');
    });

    it('rewrites SKILL.md frontmatter with source: builtin (overriding bundle source)', async () => {
        const bundle = {
            humanizer: {
                'SKILL.md': '---\nname: humanizer\ndescription: Test\nsource: bundled\n---\n\nBody\n',
            },
        };

        await materializer.materializeAll(bundle);
        const skillMd = stub.files.get('.vault-operator/data/skills/humanizer/SKILL.md');
        expect(skillMd).toMatch(/^---\n[\s\S]*?\nsource: builtin\n[\s\S]*?---/);
        expect(skillMd).not.toContain('source: bundled');
    });

    it('adds source: builtin if no source frontmatter field exists', async () => {
        const bundle = {
            ingest: {
                'SKILL.md': '---\nname: ingest\ndescription: Test ingest\n---\n\nBody\n',
            },
        };

        await materializer.materializeAll(bundle);
        const skillMd = stub.files.get('.vault-operator/data/skills/ingest/SKILL.md');
        expect(skillMd).toMatch(/^---\n[\s\S]*?\nsource: builtin\n[\s\S]*?---/);
    });

    it('writes nested scripts/, references/, assets/ files', async () => {
        const bundle = {
            'office-workflow': {
                'SKILL.md': '---\nname: office-workflow\ndescription: Test\nsource: bundled\n---\n\nBody\n',
                'scripts/build-pptx.js': '// builder script',
                'references/template-catalog.md': '# Template catalog',
                'assets/example.txt': 'plain text asset',
            },
        };

        await materializer.materializeAll(bundle);

        expect(stub.files.get('.vault-operator/data/skills/office-workflow/scripts/build-pptx.js'))
            .toBe('// builder script');
        expect(stub.files.get('.vault-operator/data/skills/office-workflow/references/template-catalog.md'))
            .toBe('# Template catalog');
        expect(stub.files.get('.vault-operator/data/skills/office-workflow/assets/example.txt'))
            .toBe('plain text asset');
    });

    it('decodes binary asset files written with __b64__ suffix', async () => {
        // The esbuild step encodes non-text files as base64 with a __b64__
        // suffix on the key. The materializer must decode and writeBinary.
        const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const b64 = Buffer.from(original).toString('base64');
        const bundle = {
            'presentation-design': {
                'SKILL.md': '---\nname: presentation-design\ndescription: Test\n---\n\nBody\n',
                'assets/logo.png__b64__': b64,
            },
        };

        await materializer.materializeAll(bundle);

        const written = stub.binaries.get('.vault-operator/data/skills/presentation-design/assets/logo.png');
        expect(written).toBeDefined();
        const writtenBytes = new Uint8Array(written!);
        expect(Array.from(writtenBytes)).toEqual(Array.from(original));
        expect(stub.files.has('.vault-operator/data/skills/presentation-design/assets/logo.png__b64__')).toBe(false);
    });

    it('skips materialization when an existing SKILL.md has source: user (user override wins)', async () => {
        // Pre-existing user-edited SKILL.md
        await stub.adapter.write(
            '.vault-operator/data/skills/humanizer/SKILL.md',
            '---\nname: humanizer\ndescription: User customized\nsource: user\n---\n\nMy edits\n',
        );

        const bundle = {
            humanizer: {
                'SKILL.md': '---\nname: humanizer\ndescription: Bundled version\nsource: bundled\n---\n\nBundled body\n',
            },
        };

        const report = await materializer.materializeAll(bundle);

        expect(report.written).toEqual([]);
        expect(report.skipped).toEqual([{ name: 'humanizer', reason: 'user-override' }]);
        const skillMd = stub.files.get('.vault-operator/data/skills/humanizer/SKILL.md');
        expect(skillMd).toContain('User customized');
        expect(skillMd).toContain('My edits');
    });

    it('skips materialization when an existing SKILL.md has source: <plugin-id> (plugin override)', async () => {
        await stub.adapter.write(
            '.vault-operator/data/skills/dataview/SKILL.md',
            '---\nname: dataview\ndescription: Plugin-managed\nsource: dataview\n---\n\nPlugin body\n',
        );

        const bundle = {
            dataview: {
                'SKILL.md': '---\nname: dataview\ndescription: Built-in clone\nsource: bundled\n---\n\nBundled\n',
            },
        };

        const report = await materializer.materializeAll(bundle);

        expect(report.written).toEqual([]);
        expect(report.skipped).toEqual([{ name: 'dataview', reason: 'plugin-override' }]);
    });

    it('overwrites previous builtin materialization (existing source: builtin is replaced)', async () => {
        // First materialization run
        await materializer.materializeAll({
            humanizer: {
                'SKILL.md': '---\nname: humanizer\ndescription: Old\n---\n\nOld body\n',
                'scripts/old.js': '// will be removed',
            },
        });
        expect(stub.files.has('.vault-operator/data/skills/humanizer/scripts/old.js')).toBe(true);

        // Second run: scripts/old.js dropped, new content
        const report = await materializer.materializeAll({
            humanizer: {
                'SKILL.md': '---\nname: humanizer\ndescription: New\n---\n\nNew body\n',
                'scripts/new.js': '// new',
            },
        });

        expect(report.written).toEqual(['humanizer']);
        expect(stub.files.has('.vault-operator/data/skills/humanizer/scripts/old.js')).toBe(false);
        expect(stub.files.get('.vault-operator/data/skills/humanizer/scripts/new.js')).toBe('// new');
        expect(stub.files.get('.vault-operator/data/skills/humanizer/SKILL.md')).toContain('New body');
    });

    it('rejects unsafe skill names', async () => {
        const bundle = {
            '../escape': {
                'SKILL.md': '---\nname: escape\ndescription: x\n---\n\nBody\n',
            },
        };

        const report = await materializer.materializeAll(bundle);

        expect(report.errors).toEqual([
            { name: '../escape', reason: 'unsafe-name' },
        ]);
        expect(report.written).toEqual([]);
    });

    /**
     * AUDIT-FEAT-29-11 L-1: defense-in-depth against path-traversal via
     * crafted bundle keys. Bundle is Sebastian-managed at build time, so
     * the risk is theoretical, but enforcing containment closes the
     * traversal class outright.
     */
    describe('AUDIT-FEAT-29-11 L-1 path-traversal guard', () => {
        it('rejects a relpath containing `..`', async () => {
            const bundle = {
                humanizer: {
                    'SKILL.md': '---\nname: humanizer\ndescription: x\n---\n\nB\n',
                    '../escape.md': 'malicious',
                },
            };
            const report = await materializer.materializeAll(bundle);

            // SKILL.md still landed (the inner-loop continue is per-file).
            expect(stub.files.has('.vault-operator/data/skills/humanizer/SKILL.md')).toBe(true);
            // The escape file never made it to disk.
            expect(stub.files.has('.vault-operator/data/skills/escape.md')).toBe(false);
            // And the error is reported.
            expect(report.errors).toContainEqual(
                { name: 'humanizer', reason: 'unsafe relpath rejected: ../escape.md' },
            );
        });

        it('rejects an absolute relpath', async () => {
            const bundle = {
                ingest: {
                    'SKILL.md': '---\nname: ingest\ndescription: x\n---\n\nB\n',
                    '/etc/passwd': 'malicious',
                },
            };
            const report = await materializer.materializeAll(bundle);

            // No write at /etc/passwd.
            expect(stub.files.has('/etc/passwd')).toBe(false);
            expect(report.errors.some((e) => e.reason.includes('/etc/passwd'))).toBe(true);
        });

        it('rejects a relpath with a NUL byte', async () => {
            const bundle = {
                ingest: {
                    'SKILL.md': '---\nname: ingest\ndescription: x\n---\n\nB\n',
                    'scripts/foo\0.js': 'malicious',
                },
            };
            const report = await materializer.materializeAll(bundle);
            expect(report.errors.some((e) => e.reason.includes('foo\0.js'))).toBe(true);
        });

        it('accepts well-formed relative paths in subfolders', async () => {
            const bundle = {
                office: {
                    'SKILL.md': '---\nname: office\ndescription: x\n---\n\nB\n',
                    'scripts/build.js': 'export function f(){}',
                    'references/notes.md': '# notes',
                },
            };
            const report = await materializer.materializeAll(bundle);
            expect(report.errors).toEqual([]);
            expect(stub.files.has('.vault-operator/data/skills/office/scripts/build.js')).toBe(true);
            expect(stub.files.has('.vault-operator/data/skills/office/references/notes.md')).toBe(true);
        });
    });

    it('reports errors per-skill without aborting the whole pass', async () => {
        const bundle = {
            'bad/name': {
                'SKILL.md': '---\nname: bad\ndescription: x\n---\n\nB\n',
            },
            good: {
                'SKILL.md': '---\nname: good\ndescription: x\n---\n\nB\n',
            },
        };

        const report = await materializer.materializeAll(bundle);

        expect(report.written).toEqual(['good']);
        expect(report.errors.map((e) => e.name)).toContain('bad/name');
    });
});
