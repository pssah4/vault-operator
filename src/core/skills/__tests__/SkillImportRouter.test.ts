/**
 * FEATURE-2202: router detection + markdown-file import path.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { detectSourceFromFile, importSkill } from '../SkillImportRouter';

interface MockAdapter {
    files: Map<string, string>;
    binaries: Map<string, ArrayBuffer>;
    dirs: Set<string>;
    exists: (p: string) => Promise<boolean>;
    mkdir: (p: string) => Promise<void>;
    write: (p: string, data: string) => Promise<void>;
    writeBinary: (p: string, data: ArrayBuffer) => Promise<void>;
}

function createMockAdapter(): MockAdapter {
    const files = new Map<string, string>();
    const binaries = new Map<string, ArrayBuffer>();
    const dirs = new Set<string>();
    return {
        files,
        binaries,
        dirs,
        exists: (p) => Promise.resolve(files.has(p) || binaries.has(p) || dirs.has(p)),
        mkdir: (p) => { dirs.add(p); return Promise.resolve(); },
        write: (p, data) => { files.set(p, data); return Promise.resolve(); },
        writeBinary: (p, data) => { binaries.set(p, data); return Promise.resolve(); },
    };
}

describe('detectSourceFromFile', () => {
    it('treats .md as markdown', () => {
        const source = detectSourceFromFile(new File(['x'], 'foo.md'));
        expect(source.kind).toBe('markdown-file');
    });

    it('treats .zip as zip', () => {
        const source = detectSourceFromFile(new File(['x'], 'pdf.zip'));
        expect(source.kind).toBe('zip-file');
    });

    it('treats .skill as zip', () => {
        const source = detectSourceFromFile(new File(['x'], 'pdf.skill'));
        expect(source.kind).toBe('zip-file');
    });

    it('treats unknown extensions as markdown (permissive fallback)', () => {
        const source = detectSourceFromFile(new File(['x'], 'notes.txt'));
        expect(source.kind).toBe('markdown-file');
    });

    it('is case-insensitive for .SKILL / .ZIP', () => {
        const upper = detectSourceFromFile(new File(['x'], 'MY.SKILL'));
        expect(upper.kind).toBe('zip-file');
    });
});

describe('importSkill(markdown-file)', () => {
    it('writes a single SKILL.md into a new folder derived from frontmatter name', async () => {
        const adapter = createMockAdapter();
        const content = '---\nname: my-skill\ndescription: test\n---\nBody';
        const file = new File([content], 'arbitrary-filename.md');

        const result = await importSkill({
            adapter: adapter as unknown as import('obsidian').DataAdapter,
            targetSkillsDir: '.obsidian-agent/skills',
            source: { kind: 'markdown-file', file },
        });

        expect(result.kind).toBe('markdown');
        expect(result.slug).toBe('my-skill');
        expect(adapter.files.get('.obsidian-agent/skills/my-skill/SKILL.md')).toBe(content);
    });

    it('falls back to filename when frontmatter has no name', async () => {
        const adapter = createMockAdapter();
        const content = '---\ndescription: test\n---\nBody';
        const file = new File([content], 'fallback-name.md');

        const result = await importSkill({
            adapter: adapter as unknown as import('obsidian').DataAdapter,
            targetSkillsDir: '.obsidian-agent/skills',
            source: { kind: 'markdown-file', file },
        });

        expect(result.slug).toBe('fallback-name');
    });

    it('rejects if target already exists without overwrite', async () => {
        const adapter = createMockAdapter();
        adapter.dirs.add('.obsidian-agent/skills/my-skill');
        const file = new File(['---\nname: my-skill\ndescription: x\n---'], 'x.md');

        await expect(
            importSkill({
                adapter: adapter as unknown as import('obsidian').DataAdapter,
                targetSkillsDir: '.obsidian-agent/skills',
                source: { kind: 'markdown-file', file },
            }),
        ).rejects.toMatchObject({ code: 'DESTINATION_EXISTS' });
    });
});

describe('importSkill(zip-file)', () => {
    it('dispatches through SkillPackageImporter and returns kind=zip', async () => {
        const zip = new JSZip();
        zip.file('pdf/SKILL.md', '---\nname: pdf\ndescription: x\n---');
        const buffer = await zip.generateAsync({ type: 'arraybuffer' });
        const adapter = createMockAdapter();
        const file = new File([buffer], 'pdf.skill');

        const result = await importSkill({
            adapter: adapter as unknown as import('obsidian').DataAdapter,
            targetSkillsDir: '.obsidian-agent/skills',
            source: { kind: 'zip-file', file },
        });

        expect(result.kind).toBe('zip');
        expect(result.slug).toBe('pdf');
        expect(adapter.binaries.has('.obsidian-agent/skills/pdf/SKILL.md')).toBe(true);
    });
});
