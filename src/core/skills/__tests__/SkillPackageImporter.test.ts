/**
 * FEATURE-2202 / ADR-075 security tests for importSkillPackage.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { importSkillPackage, SkillPackageImportError } from '../SkillPackageImporter';

interface MockAdapter {
    files: Map<string, ArrayBuffer>;
    dirs: Set<string>;
    exists: (p: string) => Promise<boolean>;
    mkdir: (p: string) => Promise<void>;
    writeBinary: (p: string, data: ArrayBuffer) => Promise<void>;
}

function createMockAdapter(): MockAdapter {
    const files = new Map<string, ArrayBuffer>();
    const dirs = new Set<string>();
    return {
        files,
        dirs,
        exists: (p) => Promise.resolve(files.has(p) || dirs.has(p)),
        mkdir: (p) => { dirs.add(p); return Promise.resolve(); },
        writeBinary: (p, data) => { files.set(p, data); return Promise.resolve(); },
    };
}

async function buildZip(entries: Record<string, string | ArrayBuffer>): Promise<ArrayBuffer> {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(entries)) {
        if (typeof content === 'string') zip.file(name, content);
        else zip.file(name, content);
    }
    return await zip.generateAsync({ type: 'arraybuffer' });
}

function makeInput(buffer: ArrayBuffer, overrides: Partial<Parameters<typeof importSkillPackage>[0]> = {}) {
    const adapter = createMockAdapter();
    return {
        adapter: adapter as unknown as import('obsidian').DataAdapter,
        targetSkillsDir: '.obsidian-agent/skills',
        buffer,
        ...overrides,
        _mock: adapter,
    };
}

describe('importSkillPackage', () => {
    it('extracts a well-formed skill with whitelisted subfolders', async () => {
        const buffer = await buildZip({
            'pdf/SKILL.md': '---\nname: pdf\ndescription: test\n---\nBody',
            'pdf/scripts/extract.py': 'print("hi")',
            'pdf/references/GUIDE.md': '# Guide',
            'pdf/assets/template.json': '{}',
        });
        const input = makeInput(buffer);

        const result = await importSkillPackage(input);

        expect(result.slug).toBe('pdf');
        expect(result.writtenFiles.sort()).toEqual([
            'SKILL.md',
            'assets/template.json',
            'references/GUIDE.md',
            'scripts/extract.py',
        ]);
        expect(result.skippedEntries).toHaveLength(0);
        expect(input._mock.files.has('.obsidian-agent/skills/pdf/SKILL.md')).toBe(true);
    });

    it('rejects zips with path-traversal entries', async () => {
        const buffer = await buildZip({
            'evil/SKILL.md': '---\nname: evil\ndescription: x\n---',
            'evil/../../../etc/passwd': 'root:x',
        });
        const input = makeInput(buffer);

        await expect(importSkillPackage(input)).rejects.toThrow(SkillPackageImportError);
        expect(input._mock.files.size).toBe(0);
    });

    it('rejects zips without SKILL.md', async () => {
        const buffer = await buildZip({
            'noskill/scripts/helpers.ts': 'x',
        });
        const input = makeInput(buffer);

        await expect(importSkillPackage(input)).rejects.toMatchObject({ code: 'NO_SKILL_MD' });
    });

    it('skips entries outside the whitelist silently', async () => {
        const buffer = await buildZip({
            'skill/SKILL.md': '---\nname: skill\ndescription: x\n---',
            'skill/.git/config': 'secret',
            'skill/node_modules/foo/index.js': 'x',
            'skill/random.txt': 'x',
        });
        const input = makeInput(buffer);

        const result = await importSkillPackage(input);

        expect(result.writtenFiles).toEqual(['SKILL.md']);
        expect(result.skippedEntries.sort()).toEqual([
            '.git/config',
            'node_modules/foo/index.js',
            'random.txt',
        ]);
    });

    it('rejects when destination already exists and overwrite is not set', async () => {
        const buffer = await buildZip({
            'pdf/SKILL.md': '---\nname: pdf\ndescription: x\n---',
        });
        const input = makeInput(buffer);
        input._mock.dirs.add('.obsidian-agent/skills/pdf');

        await expect(importSkillPackage(input)).rejects.toMatchObject({ code: 'DESTINATION_EXISTS' });
    });

    it('overwrites when explicitly requested', async () => {
        const buffer = await buildZip({
            'pdf/SKILL.md': '---\nname: pdf\ndescription: v2\n---',
        });
        const input = makeInput(buffer, { overwrite: true });
        input._mock.dirs.add('.obsidian-agent/skills/pdf');

        const result = await importSkillPackage(input);

        expect(result.writtenFiles).toEqual(['SKILL.md']);
    });

    it('accepts a zip with SKILL.md at the root if a fallback slug is given', async () => {
        const buffer = await buildZip({
            'SKILL.md': '---\nname: my-skill\ndescription: x\n---',
            'scripts/helper.ts': 'x',
        });
        const input = makeInput(buffer, { fallbackSlug: 'my-skill' });

        const result = await importSkillPackage(input);

        expect(result.slug).toBe('my-skill');
        expect(result.writtenFiles.sort()).toEqual(['SKILL.md', 'scripts/helper.ts']);
    });

    it('enforces the uncompressed size limit', async () => {
        const big = 'x'.repeat(200);
        const buffer = await buildZip({
            'bomb/SKILL.md': '---\nname: bomb\ndescription: x\n---',
            'bomb/references/blob.md': big,
        });
        const input = makeInput(buffer, { maxUncompressedBytes: 100 });

        await expect(importSkillPackage(input)).rejects.toMatchObject({ code: 'ZIP_BOMB' });
    });

    it('accepts nested paths under scripts/ references/ assets/', async () => {
        // Real-world Anthropic-style skills ship `assets/templates/*.potx` etc.
        // The flat-only whitelist used to silently drop these entries.
        const buffer = await buildZip({
            'nested/SKILL.md': '---\nname: nested\ndescription: x\n---',
            'nested/scripts/tool/helper.ts': 'x',
            'nested/references/section/guide.md': '# guide',
            'nested/assets/templates/master.potx': 'binary-blob',
            'nested/assets/icons/set-a/icon.svg': '<svg/>',
        });
        const input = makeInput(buffer);

        const result = await importSkillPackage(input);

        expect(result.skippedEntries).toHaveLength(0);
        expect(result.writtenFiles.sort()).toEqual([
            'SKILL.md',
            'assets/icons/set-a/icon.svg',
            'assets/templates/master.potx',
            'references/section/guide.md',
            'scripts/tool/helper.ts',
        ]);
    });

    it('rejects absolute path entries even inside the top folder', async () => {
        const buffer = await buildZip({
            'evil/SKILL.md': '---\nname: evil\ndescription: x\n---',
            '/etc/shadow': 'x',
        });
        const input = makeInput(buffer);

        await expect(importSkillPackage(input)).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
    });
});
