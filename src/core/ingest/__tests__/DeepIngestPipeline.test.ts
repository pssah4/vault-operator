import { describe, it, expect, vi } from 'vitest';
import { DeepIngestPipeline, type DeepIngestPlan } from '../DeepIngestPipeline';
import { TensionDetector } from '../TensionDetector';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type ObsidianAgentPlugin from '../../../main';

// Tests use only markdown sources; parseDocument is never reached, so an
// empty stub satisfies the required-plugin contract (FIX-06-01-01).
const stubPlugin = {} as ObsidianAgentPlugin;

/**
 * DeepIngestPipeline-Tests: orchestriert OutputModeGenerator,
 * TensionDetector, optional MOC-Hook und Source-Diversity-Counter.
 * Mock-App umgeht echten Vault.
 */

function makeFile(path: string): TFile {
    // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- test factory: synthesises a TFile prototype for a mock vault, never reaches the real Vault API where instanceof checks apply
    const f = Object.create(TFile.prototype) as TFile;
    Object.assign(f, { path, basename: path.split('/').pop()?.replace(/\.md$/, '') ?? '', extension: 'md' });
    return f;
}

function makeMockApp(sourceMd?: string): {
    app: App;
    created: Array<{ path: string; content: string }>;
    modified: Array<{ path: string; content: string }>;
    folders: Set<string>;
} {
    const created: Array<{ path: string; content: string }> = [];
    const modified: Array<{ path: string; content: string }> = [];
    const folders = new Set<string>();
    return {
        created,
        modified,
        folders,
        app: {
            vault: {
                getAbstractFileByPath: () => null,
                createFolder: async (p: string) => { folders.add(p); },
                create: async (p: string, content: string) => {
                    created.push({ path: p, content });
                    return makeFile(p);
                },
                cachedRead: async () => sourceMd ?? '',
                read: async () => sourceMd ?? '',
                modify: async (file: TFile, content: string) => {
                    modified.push({ path: file.path, content });
                },
            },
        } as unknown as App,
    };
}

describe('DeepIngestPipeline', () => {
    it('source-only does NOT duplicate the source -- it stays in its original folder', async () => {
        const m = makeMockApp();
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({ takeAways: [] }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator,
        }, stubPlugin);
        const sourceFile = makeFile('Inbox/x.md');
        const result = await pipeline.run({
            sourceFile,
            mode: 'auto',
            outputMode: 'source-only',
            cluster: 'Tech',
        });
        // Source-Note is the ORIGINAL file, not a copy.
        expect(result.generated.sourceFile).toBe(sourceFile);
        // Nothing new was created. The original may have been modify-d
        // (block-IDs) when there is a body, but no Sources/ duplicate.
        expect(m.created.length).toBe(0);
        // No file path starting with `Sources` was ever touched.
        expect(m.created.find((c) => c.path.startsWith('Sources/'))).toBeUndefined();
        expect(m.modified.find((c) => c.path.startsWith('Sources/'))).toBeUndefined();
    });

    it('source-plus-summary writes ONLY the sense-making note (source stays in place)', async () => {
        const m = makeMockApp('Body of source note.\n');
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: ['claim-1', 'claim-2'],
            summaryBody: 'Sense-Making body',
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator,
        }, stubPlugin);
        const sourceFile = makeFile('Inbox/x.md');
        const result = await pipeline.run({
            sourceFile,
            mode: 'dialog',
            outputMode: 'source-plus-summary',
            cluster: 'Tech',
        });
        expect(result.generated.sourceFile).toBe(sourceFile);
        expect(result.generated.senseMakingFile).toBeDefined();
        // Only the sense-making note is created -- the source is not duplicated.
        expect(m.created.length).toBe(1);
        expect(m.created[0].path).toBe('Inbox/x (Sense-Making).md');
    });

    it('appends tension-markers to senseMaking when detector finds them', async () => {
        const m = makeMockApp();
        const detector = new TensionDetector(
            async () => [{ path: 'Notes/Existing.md', summary: 'old', excerpt: 'e' }],
            async () => ({
                relationship: 'contradicts',
                targetNotePath: 'Notes/Existing.md',
                confidence: 0.9,
                rationale: 'Differs',
            }),
        );
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: ['controversial claim'],
            summaryBody: 'Body',
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            tensionDetector: detector,
            planGenerator,
        }, stubPlugin);
        await pipeline.run({
            sourceFile: makeFile('Inbox/y.md'),
            mode: 'dialog',
            outputMode: 'source-plus-summary',
            cluster: 'Tech',
        });
        const senseMakingNote = m.created.find((c) => c.path.includes('Sense-Making'));
        expect(senseMakingNote?.content).toContain('Tension-Marker');
        expect(senseMakingNote?.content).toContain('Widerspricht');
    });

    it('runs multi-zettel with bibliography and zettel files', async () => {
        const m = makeMockApp();
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: ['t1'],
            multiZettel: {
                bibliographyTitle: 'Source Bibliography',
                bibliographyBody: 'Abstract here',
                bibliographyFrontmatter: { author: 'X', year: 2026 },
                zettel: [
                    { title: 'Zettel 1', body: 'Z1 body', frontmatter: { tags: ['idea'] } },
                    { title: 'Zettel 2', body: 'Z2 body', frontmatter: { tags: ['idea'] } },
                ],
            },
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator,
        }, stubPlugin);
        const result = await pipeline.run({
            sourceFile: makeFile('Inbox/z.md'),
            mode: 'dialog',
            outputMode: 'source-plus-multi-zettel',
            cluster: 'Tech',
        });
        expect(result.generated.bibliographyFile).toBeDefined();
        expect(result.generated.zettelFiles?.length).toBe(2);
        // No source duplicate -- only Bibliografie + 2 Zettel = 3 files in notesFolder.
        expect(m.created.length).toBe(3);
        for (const c of m.created) {
            expect(c.path.startsWith('Inbox/')).toBe(true);
        }
    });

    it('triggers MOC-update hook when configured', async () => {
        const m = makeMockApp();
        const mocHook = vi.fn(async () => {});
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator: async () => ({ takeAways: [] }),
            onMOCPageUpdated: mocHook,
        }, stubPlugin);
        await pipeline.run({
            sourceFile: makeFile('Inbox/q.md'),
            mode: 'auto',
            outputMode: 'source-only',
            cluster: 'TopicCluster',
        });
        expect(mocHook).toHaveBeenCalledWith('TopicCluster');
    });

    it('FIX-19-28-01: injects ↗-markers in sense-making body when no summaryBody is provided', async () => {
        // Source-Note enthaelt zwei Anker-Texte, die als Take-Aways
        // gepickt werden. Pipeline soll Block-IDs setzen und im
        // Sense-Making-Body inline ↗-Marker rendern.
        const sourceMd = `# Test\n\nWichtige Aussage A ueber AI.\n\nAndere Aussage B mit Detail.\n`;
        const m = makeMockApp(sourceMd);
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: [
                { text: 'A: kurzer Take-Away.', position: { kind: 'block-anchor', anchorText: 'Wichtige Aussage A ueber AI.' } },
                { text: 'B: zweiter Take-Away.', position: { kind: 'block-anchor', anchorText: 'Andere Aussage B mit Detail.' } },
            ],
            // summaryBody bewusst weggelassen -- Pipeline muss
            // SummaryPositionAnnotator nutzen.
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator,
        }, stubPlugin);
        await pipeline.run({
            sourceFile: makeFile('Inbox/test.md'),
            mode: 'dialog',
            outputMode: 'source-plus-summary',
            cluster: 'Tech',
        });
        const senseMakingNote = m.created.find((c) => c.path.includes('Sense-Making'));
        expect(senseMakingNote).toBeDefined();
        // Beide Take-Aways tragen den ↗-Marker mit Block-Ref auf den
        // Sources-Pfad (test.md.md, weil Pipeline basename + '.md' addiert).
        expect(senseMakingNote?.content).toContain('A: kurzer Take-Away. [[test#^block-1|↗]]');
        expect(senseMakingNote?.content).toContain('B: zweiter Take-Away. [[test#^block-2|↗]]');
    });

    it('FIX-19-28-01 / no-duplicate: block-IDs are written in place into the original source', async () => {
        const sourceMd = `Aussage X.\n\nAussage Y.\n`;
        const m = makeMockApp(sourceMd);
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: [
                { text: 'Take-Away X.', position: { kind: 'block-anchor', anchorText: 'Aussage X.' } },
            ],
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator,
        }, stubPlugin);
        await pipeline.run({
            sourceFile: makeFile('Inbox/source.md'),
            mode: 'dialog',
            outputMode: 'source-plus-summary',
            cluster: 'Tech',
        });
        // No Sources/-duplicate was created.
        expect(m.created.find((c) => c.path.startsWith('Sources/'))).toBeUndefined();
        // The original file was modify-d, with block-IDs.
        const modified = m.modified.find((c) => c.path === 'Inbox/source.md');
        expect(modified).toBeDefined();
        expect(modified?.content).toContain('Aussage X. ^block-1');
        expect(modified?.content).toContain('Aussage Y.');
    });

    it('FIX-19-28-01: legacy string[] take-aways still work (backward-compat)', async () => {
        const sourceMd = `claim-1\n\nclaim-2\n`;
        const m = makeMockApp(sourceMd);
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: ['claim-1', 'claim-2'],
            summaryBody: 'Sense-Making body provided',
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator,
        }, stubPlugin);
        await pipeline.run({
            sourceFile: makeFile('Inbox/x.md'),
            mode: 'dialog',
            outputMode: 'source-plus-summary',
            cluster: 'Tech',
        });
        const senseMakingNote = m.created.find((c) => c.path.includes('Sense-Making'));
        // Caller gab summaryBody mit -- der wird verwendet, wir generieren
        // nicht aus take-aways.
        expect(senseMakingNote?.content).toContain('Sense-Making body provided');
    });

    it('increments source-diversity-counter when sourceDomain provided', async () => {
        const m = makeMockApp();
        const incrementCount = vi.fn();
        const stats = { incrementCount } as unknown as ConstructorParameters<typeof DeepIngestPipeline>[1]['sourceStats'];
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { notesFolder: 'Inbox' },
            planGenerator: async () => ({ takeAways: [] }),
            sourceStats: stats,
        }, stubPlugin);
        await pipeline.run({
            sourceFile: makeFile('Inbox/r.md'),
            mode: 'auto',
            outputMode: 'source-only',
            cluster: 'Tech',
            sourceDomain: 'medium.com',
        });
        expect(incrementCount).toHaveBeenCalledWith('Tech', 'medium.com');
    });
});
