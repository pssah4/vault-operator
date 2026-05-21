/**
 * FEAT-29-14: tests for the TemplateMaterializer.
 *
 * The materializer is a pure side-effect-on-the-adapter service: given
 * a target folder, a language, and a bundle dictionary, it writes each
 * named template into `<folder>/<name>` unless the file is already
 * there (skip-existing). Force mode overwrites. Unknown languages
 * trigger a translator callback; missing callback falls back to EN.
 *
 * We stub the adapter with an in-memory file store so the suite stays
 * fast and deterministic.
 */

import { describe, it, expect, vi } from 'vitest';
import { TemplateMaterializer } from '../TemplateMaterializer';

function makeFakeApp(opts?: { existing?: Record<string, string>; failPaths?: Set<string> }) {
    const files = new Map<string, string>(Object.entries(opts?.existing ?? {}));
    const failPaths = opts?.failPaths ?? new Set<string>();
    const folders = new Set<string>();
    return {
        files,
        folders,
        app: {
            vault: {
                adapter: {
                    exists: async (p: string) => files.has(p) || folders.has(p),
                    read: async (p: string) => {
                        const v = files.get(p);
                        if (v === undefined) throw new Error(`ENOENT ${p}`);
                        return v;
                    },
                    write: async (p: string, content: string) => {
                        if (failPaths.has(p)) throw new Error(`write failed: ${p}`);
                        files.set(p, content);
                    },
                    mkdir: async (p: string) => {
                        folders.add(p);
                    },
                },
            },
        },
    };
}

const BUNDLE: Record<string, Record<string, string>> = {
    de: {
        'Quelle Template.md': '---\nKategorie:\n  - Quelle\n---\n',
        'Notiz Template.md': '---\nKategorie:\n  - Notiz\n  - Quellen-Notiz\n---\n',
        'Meeting-Notiz Template.md': '---\nKategorie:\n  - Meeting-Notiz\n---\n',
    },
    en: {
        'Source Template.md': '---\nCategory:\n  - Source\n---\n',
        'Note Template.md': '---\nCategory:\n  - Note\n  - Source note\n---\n',
        'Meeting Note Template.md': '---\nCategory:\n  - Meeting note\n---\n',
    },
};

describe('TemplateMaterializer', () => {
    it('materializes the DE set into the target folder (3 files)', async () => {
        const { app, files } = makeFakeApp();
        const m = new TemplateMaterializer(app as never, BUNDLE);
        const result = await m.materialize('Templates', 'de', {});
        expect(result.written.sort()).toEqual([
            'Templates/Meeting-Notiz Template.md',
            'Templates/Notiz Template.md',
            'Templates/Quelle Template.md',
        ]);
        expect(result.skipped).toEqual([]);
        expect(result.failed).toEqual([]);
        expect(files.size).toBe(3);
        // Spot-check that content lands intact.
        expect(files.get('Templates/Quelle Template.md')).toContain('Kategorie:');
    });

    it('skips existing files when force is false', async () => {
        const existing = { 'Templates/Quelle Template.md': '---\nKategorie:\n  - Quelle\nNotizen: [[my-note]]\n---\n' };
        const { app, files } = makeFakeApp({ existing });
        const m = new TemplateMaterializer(app as never, BUNDLE);
        const result = await m.materialize('Templates', 'de', {});
        expect(result.skipped).toEqual(['Templates/Quelle Template.md']);
        expect(result.written.sort()).toEqual([
            'Templates/Meeting-Notiz Template.md',
            'Templates/Notiz Template.md',
        ]);
        // The user's edited Quelle stays untouched.
        expect(files.get('Templates/Quelle Template.md')).toContain('Notizen: [[my-note]]');
    });

    it('overwrites existing files when force is true', async () => {
        const existing = { 'Templates/Quelle Template.md': 'old content' };
        const { app, files } = makeFakeApp({ existing });
        const m = new TemplateMaterializer(app as never, BUNDLE);
        const result = await m.materialize('Templates', 'de', { force: true });
        expect(result.written.sort()).toEqual([
            'Templates/Meeting-Notiz Template.md',
            'Templates/Notiz Template.md',
            'Templates/Quelle Template.md',
        ]);
        expect(result.skipped).toEqual([]);
        expect(files.get('Templates/Quelle Template.md')).not.toBe('old content');
        expect(files.get('Templates/Quelle Template.md')).toContain('Kategorie:');
    });

    it('captures write failures in the failed list without throwing', async () => {
        const failPaths = new Set(['Templates/Notiz Template.md']);
        const { app } = makeFakeApp({ failPaths });
        const m = new TemplateMaterializer(app as never, BUNDLE);
        const result = await m.materialize('Templates', 'de', {});
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0]).toMatchObject({
            path: 'Templates/Notiz Template.md',
            reason: expect.stringContaining('write failed'),
        });
        // The other two still go through.
        expect(result.written.sort()).toEqual([
            'Templates/Meeting-Notiz Template.md',
            'Templates/Quelle Template.md',
        ]);
    });

    it('falls back to EN when language is unknown and no translator is supplied', async () => {
        const { app, files } = makeFakeApp();
        const m = new TemplateMaterializer(app as never, BUNDLE);
        const result = await m.materialize('Templates', 'fr', {});
        expect(result.fallbackLanguage).toBe('en');
        expect(result.written.sort()).toEqual([
            'Templates/Meeting Note Template.md',
            'Templates/Note Template.md',
            'Templates/Source Template.md',
        ]);
        expect(files.get('Templates/Source Template.md')).toContain('Category:');
    });

    it('invokes the translator with EN as source language and writes the translated content', async () => {
        const { app, files } = makeFakeApp();
        const translator = vi.fn(async (lang: string, name: string, sourceContent: string) => {
            // Pretend we translated by appending a sentinel.
            return `${sourceContent}\n# translated to ${lang}: ${name}\n`;
        });
        const m = new TemplateMaterializer(app as never, BUNDLE);
        const result = await m.materialize('Templates', 'fr', { translator });
        expect(result.fallbackLanguage).toBeUndefined();
        expect(translator).toHaveBeenCalledTimes(3);
        // Translator is called with the EN source as the basis.
        const firstCall = translator.mock.calls[0];
        expect(firstCall[0]).toBe('fr');
        expect(firstCall[2]).toContain('Category:');
        const writtenContent = files.get('Templates/Source Template.md');
        expect(writtenContent).toContain('translated to fr');
        expect(writtenContent).toContain('Source Template.md');
    });

    it('ensures the target folder exists before writing', async () => {
        const { app, folders } = makeFakeApp();
        const m = new TemplateMaterializer(app as never, BUNDLE);
        await m.materialize('Sub/Templates', 'de', {});
        expect(folders.has('Sub/Templates')).toBe(true);
    });

    it('refuses to materialize when targetFolder is empty (defensive)', async () => {
        const { app } = makeFakeApp();
        const m = new TemplateMaterializer(app as never, BUNDLE);
        await expect(m.materialize('', 'de', {})).rejects.toThrow(/folder/i);
    });

    it('rejects bundle filenames with path-traversal segments (AUDIT-024 M-2)', async () => {
        // Defense-in-depth: a future bundle generator or supply-chain
        // compromise could land traversal segments in bundle keys.
        // The materializer must refuse to compose `${folder}/${name}`
        // when the name escapes the folder.
        const evilBundle = {
            de: {
                '../evil.md': '---\nfoo: bar\n---\n',
                'nested/path.md': '---\nfoo: bar\n---\n',
                'with\0null.md': '---\nfoo: bar\n---\n',
                'safe.md': '---\nfoo: bar\n---\n',
            },
        };
        const { app, files } = makeFakeApp();
        const m = new TemplateMaterializer(app as never, evilBundle);
        const result = await m.materialize('Templates', 'de', {});
        expect(result.failed).toHaveLength(3);
        expect(result.failed.map((f) => f.reason).every((r) => /unsafe/i.test(r))).toBe(true);
        expect(result.written).toEqual(['Templates/safe.md']);
        expect(files.has('Templates/../evil.md')).toBe(false);
    });
});
