import { describe, it, expect, vi } from 'vitest';
import { DefaultVaultRagPipeline, type SemanticIndexHit, type SemanticIndexProbe } from '../VaultRagPipeline';

function makeProbe(opts: { embedding?: number[]; hits?: SemanticIndexHit[] } = {}): SemanticIndexProbe & { embedText: ReturnType<typeof vi.fn>; queryNoteVectors: ReturnType<typeof vi.fn> } {
    return {
        embedText: vi.fn(async () => opts.embedding ?? [0.1, 0.2, 0.3]),
        queryNoteVectors: vi.fn(async () => opts.hits ?? []),
    } as any;
}

describe('DefaultVaultRagPipeline', () => {
    it('embeds the selection and queries vectors', async () => {
        const probe = makeProbe({
            hits: [{ notePath: 'A.md', excerpt: 'foo', cosineSimilarity: 0.8 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        await pipe.augment({ selectionText: 'lambda calculus', confidenceThreshold: 0.7, topN: 5 });
        expect(probe.embedText).toHaveBeenCalledWith('lambda calculus');
        expect(probe.queryNoteVectors).toHaveBeenCalledWith(expect.objectContaining({ topN: 5 }));
    });

    it('returns null when no hit meets the confidence threshold', async () => {
        const probe = makeProbe({
            hits: [{ notePath: 'A.md', cosineSimilarity: 0.5 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out).toBeNull();
    });

    it('returns sources and prompt augmentation for hits above threshold', async () => {
        const probe = makeProbe({
            hits: [
                { notePath: 'A.md', excerpt: 'foo', cosineSimilarity: 0.9 },
                { notePath: 'B.md', excerpt: 'bar', cosineSimilarity: 0.75 },
                { notePath: 'C.md', excerpt: 'baz', cosineSimilarity: 0.5 },
            ],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out).not.toBeNull();
        expect(out?.sources).toHaveLength(2);
        expect(out?.sources[0].notePath).toBe('A.md');
        expect(out?.sources[1].notePath).toBe('B.md');
        expect(out?.promptAugmentation).toContain('A.md: foo');
        expect(out?.promptAugmentation).toContain('B.md: bar');
        expect(out?.promptAugmentation).not.toContain('C.md');
    });

    it('handles hits without excerpt', async () => {
        const probe = makeProbe({
            hits: [{ notePath: 'A.md', cosineSimilarity: 0.9 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.promptAugmentation).toBe('- A.md: ');
    });

    it('returns null when the embedding is empty', async () => {
        const probe = makeProbe({ embedding: [], hits: [{ notePath: 'A.md', cosineSimilarity: 0.99 }] });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out).toBeNull();
        // queryNoteVectors must NOT be called when embedding is empty.
        expect(probe.queryNoteVectors).not.toHaveBeenCalled();
    });

    it('returns null on empty / whitespace-only selection', async () => {
        const probe = makeProbe({ hits: [{ notePath: 'A.md', cosineSimilarity: 0.99 }] });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: '   ', confidenceThreshold: 0.7, topN: 5 });
        expect(out).toBeNull();
        expect(probe.embedText).not.toHaveBeenCalled();
    });

    it('truncates very long selections to maxSelectionChars', async () => {
        const probe = makeProbe({ hits: [{ notePath: 'A.md', cosineSimilarity: 0.9 }] });
        const pipe = new DefaultVaultRagPipeline({ probe, maxSelectionChars: 10 });
        const longText = 'a'.repeat(50);
        await pipe.augment({ selectionText: longText, confidenceThreshold: 0.7, topN: 5 });
        expect(probe.embedText).toHaveBeenCalledWith('a'.repeat(10));
    });
});
