import { describe, it, expect, vi } from 'vitest';
import { DeepIngestPipeline, type DeepIngestPlan } from '../DeepIngestPipeline';
import { TensionDetector } from '../TensionDetector';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

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

function makeMockApp(): { app: App; created: Array<{ path: string; content: string }>; folders: Set<string> } {
    const created: Array<{ path: string; content: string }> = [];
    const folders = new Set<string>();
    return {
        created,
        folders,
        app: {
            vault: {
                getAbstractFileByPath: () => null,
                createFolder: async (p: string) => { folders.add(p); },
                create: async (p: string, content: string) => {
                    created.push({ path: p, content });
                    return makeFile(p);
                },
            },
        } as unknown as App,
    };
}

describe('DeepIngestPipeline', () => {
    it('runs source-only with no senseMaking', async () => {
        const m = makeMockApp();
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({ takeAways: [] }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { sourceFolder: 'Sources' },
            planGenerator,
        });
        const result = await pipeline.run({
            sourceFile: makeFile('Inbox/x.md'),
            mode: 'auto',
            outputMode: 'source-only',
            cluster: 'Tech',
        });
        expect(result.generated.sourceFile).toBeDefined();
        expect(m.created.length).toBe(1);
        expect(m.created[0].path).toContain('Sources');
    });

    it('runs source-plus-summary with sense-making body', async () => {
        const m = makeMockApp();
        const planGenerator = vi.fn(async (): Promise<DeepIngestPlan> => ({
            takeAways: ['claim-1', 'claim-2'],
            summaryBody: 'Sense-Making body',
        }));
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { sourceFolder: 'Sources' },
            planGenerator,
        });
        const result = await pipeline.run({
            sourceFile: makeFile('Inbox/x.md'),
            mode: 'dialog',
            outputMode: 'source-plus-summary',
            cluster: 'Tech',
        });
        expect(result.generated.sourceFile).toBeDefined();
        expect(result.generated.senseMakingFile).toBeDefined();
        expect(m.created.length).toBe(2); // source + sense-making
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
            folderConfig: { sourceFolder: 'Sources' },
            tensionDetector: detector,
            planGenerator,
        });
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
            folderConfig: { sourceFolder: 'Sources' },
            planGenerator,
        });
        const result = await pipeline.run({
            sourceFile: makeFile('Inbox/z.md'),
            mode: 'dialog',
            outputMode: 'source-plus-multi-zettel',
            cluster: 'Tech',
        });
        expect(result.generated.bibliographyFile).toBeDefined();
        expect(result.generated.zettelFiles?.length).toBe(2);
        // Source + Bibliografie + 2 Zettel = 4 Files
        expect(m.created.length).toBe(4);
    });

    it('triggers MOC-update hook when configured', async () => {
        const m = makeMockApp();
        const mocHook = vi.fn(async () => {});
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { sourceFolder: 'Sources' },
            planGenerator: async () => ({ takeAways: [] }),
            onMOCPageUpdated: mocHook,
        });
        await pipeline.run({
            sourceFile: makeFile('Inbox/q.md'),
            mode: 'auto',
            outputMode: 'source-only',
            cluster: 'TopicCluster',
        });
        expect(mocHook).toHaveBeenCalledWith('TopicCluster');
    });

    it('increments source-diversity-counter when sourceDomain provided', async () => {
        const m = makeMockApp();
        const incrementCount = vi.fn();
        const stats = { incrementCount } as unknown as ConstructorParameters<typeof DeepIngestPipeline>[1]['sourceStats'];
        const pipeline = new DeepIngestPipeline(m.app, {
            folderConfig: { sourceFolder: 'Sources' },
            planGenerator: async () => ({ takeAways: [] }),
            sourceStats: stats,
        });
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
