/**
 * SourceReader tests (FIX-19-28-01 PLAN-15 Step 1).
 *
 * Helper liest .md / .pdf / Office einheitlich als Markdown.
 * Bei .pdf wird parsePdf via parseDocument genutzt -- das gibt
 * pro Page ein "## Page N"-Heading. Bei .md ist es ein direkter
 * cachedRead. Unsupported extensions werfen einen klaren Fehler.
 */

import { describe, it, expect, vi } from 'vitest';
import { TFile } from 'obsidian';

// Wir mocken parseDocument, damit der Test unabhaengig von pdfjs laeuft.
vi.mock('../../document-parsers/parseDocument', () => ({
    parseDocument: vi.fn(async (_data: ArrayBuffer, ext: string) => {
        if (ext === 'pdf') {
            return {
                text: '## Page 1\n\nPage one body.\n\n## Page 2\n\nPage two body.',
                images: [],
                metadata: { format: 'pdf', pageCount: 2 },
            };
        }
        if (ext === 'docx') {
            return {
                text: '# Doc\n\nDocx body.',
                images: [],
                metadata: { format: 'docx' },
            };
        }
        throw new Error(`Unsupported document format: .${ext}`);
    }),
}));

import { readSourceAsMarkdown } from '../SourceReader';

function makeFile(name: string, ext: string): TFile {
    const file = Object.create(TFile.prototype) as TFile;
    Object.assign(file, {
        name,
        basename: name.replace(/\.[^.]+$/, ''),
        extension: ext,
        path: name,
        parent: null,
        stat: { size: 100, ctime: 0, mtime: 0 },
        vault: undefined,
    });
    return file;
}

function makeApp(reads: Record<string, string>, binaries: Record<string, ArrayBuffer> = {}) {
    return {
        vault: {
            cachedRead: vi.fn(async (file: TFile) => {
                const v = reads[file.path];
                if (v === undefined) throw new Error(`no read for ${file.path}`);
                return v;
            }),
            readBinary: vi.fn(async (file: TFile) => {
                const v = binaries[file.path];
                if (v === undefined) throw new Error(`no binary for ${file.path}`);
                return v;
            }),
        },
    } as unknown as Parameters<typeof readSourceAsMarkdown>[0];
}

describe('SourceReader', () => {
    it('returns vault.cachedRead text for .md', async () => {
        const app = makeApp({ 'Notes/Source.md': '# Title\n\nMarkdown content.' });
        const file = makeFile('Source.md', 'md');
        Object.defineProperty(file, 'path', { value: 'Notes/Source.md' });
        const text = await readSourceAsMarkdown(app, file);
        expect(text).toBe('# Title\n\nMarkdown content.');
    });

    it('reads pdf as Markdown with ## Page N headings', async () => {
        const app = makeApp({}, { 'Sources/Test.pdf': new ArrayBuffer(8) });
        const file = makeFile('Test.pdf', 'pdf');
        Object.defineProperty(file, 'path', { value: 'Sources/Test.pdf' });
        const text = await readSourceAsMarkdown(app, file);
        expect(text).toContain('## Page 1');
        expect(text).toContain('## Page 2');
        expect(text).toContain('Page one body.');
    });

    it('reads docx via parseDocument', async () => {
        const app = makeApp({}, { 'Sources/Test.docx': new ArrayBuffer(8) });
        const file = makeFile('Test.docx', 'docx');
        Object.defineProperty(file, 'path', { value: 'Sources/Test.docx' });
        const text = await readSourceAsMarkdown(app, file);
        expect(text).toContain('Docx body.');
    });

    it('throws clear error for unsupported extension', async () => {
        const app = makeApp({}, { 'Sources/Test.zzz': new ArrayBuffer(8) });
        const file = makeFile('Test.zzz', 'zzz');
        Object.defineProperty(file, 'path', { value: 'Sources/Test.zzz' });
        await expect(readSourceAsMarkdown(app, file)).rejects.toThrow(/Unsupported document format/);
    });

    it('handles uppercase extensions case-insensitively', async () => {
        const app = makeApp({ 'Notes/UPPER.MD': 'upper content' });
        const file = makeFile('UPPER.MD', 'MD');
        Object.defineProperty(file, 'path', { value: 'Notes/UPPER.MD' });
        const text = await readSourceAsMarkdown(app, file);
        expect(text).toBe('upper content');
    });
});
