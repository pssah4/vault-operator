import { describe, it, expect, vi } from 'vitest';
import {
    DefaultVaultRagPipeline,
    evaluateVaultSufficiency,
    groupChunksByFile,
    type SemanticIndexHit,
    type SemanticIndexChunkHit,
    type SemanticIndexProbe,
} from '../VaultRagPipeline';
import { EmbeddingCache } from '../EmbeddingCache';

function makeProbe(opts: {
    embedding?: number[];
    hits?: SemanticIndexHit[];
    chunks?: SemanticIndexChunkHit[];
} = {}): SemanticIndexProbe & {
    embedText: ReturnType<typeof vi.fn>;
    queryNoteVectors: ReturnType<typeof vi.fn>;
    queryNoteChunks?: ReturnType<typeof vi.fn>;
} {
    const base = {
        embedText: vi.fn(async () => opts.embedding ?? [0.1, 0.2, 0.3]),
        queryNoteVectors: vi.fn(async () => opts.hits ?? []),
    } as unknown as SemanticIndexProbe & {
        embedText: ReturnType<typeof vi.fn>;
        queryNoteVectors: ReturnType<typeof vi.fn>;
        queryNoteChunks?: ReturnType<typeof vi.fn>;
    };
    if (opts.chunks !== undefined) {
        const chunks = opts.chunks;
        base.queryNoteChunks = vi.fn(async () => chunks);
    }
    return base;
}

describe('DefaultVaultRagPipeline (multi-chunk + tier)', () => {
    it('embeds the selection and calls the multi-chunk probe when available', async () => {
        const probe = makeProbe({
            chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'foo'.repeat(100), cosineSimilarity: 0.85 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        await pipe.augment({ selectionText: 'lambda calculus', confidenceThreshold: 0.7, topN: 5 });
        expect(probe.embedText).toHaveBeenCalledWith('lambda calculus');
        expect(probe.queryNoteChunks).toHaveBeenCalledWith(expect.objectContaining({ topK: 15 }));
    });

    it('falls back to queryNoteVectors when queryNoteChunks is absent', async () => {
        const probe = makeProbe({
            hits: [{ notePath: 'A.md', excerpt: 'foo'.repeat(100), cosineSimilarity: 0.85 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(probe.queryNoteVectors).toHaveBeenCalled();
    });

    it('tier="empty" when no chunks meet the threshold AND no weak fallback', async () => {
        const probe = makeProbe({
            chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'tiny', cosineSimilarity: 0.4 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.tier).toBe('empty');
    });

    it('tier="strong" when a hit clears threshold AND total chars >= 600', async () => {
        const probe = makeProbe({
            chunks: [
                { notePath: 'A.md', chunkIndex: 0, text: 'a'.repeat(700), cosineSimilarity: 0.9 },
            ],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.tier).toBe('strong');
        expect(out?.sources[0].notePath).toBe('A.md');
    });

    it('tier="weak" when a hit clears threshold but total chars < 600', async () => {
        const probe = makeProbe({
            chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'a'.repeat(350), cosineSimilarity: 0.9 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.tier).toBe('weak');
    });

    it('promptAugmentation includes a wikilink heading + chunk text', async () => {
        const probe = makeProbe({
            chunks: [{ notePath: 'foo/bar.md', chunkIndex: 0, text: 'the body text', cosineSimilarity: 0.85 }],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.promptAugmentation).toContain('### [[foo/bar]]');
        expect(out?.promptAugmentation).toContain('(score 0.85)');
        expect(out?.promptAugmentation).toContain('the body text');
    });

    it('respects per-file chunk cap (max 2 chunks per file)', async () => {
        const probe = makeProbe({
            chunks: [
                { notePath: 'A.md', chunkIndex: 0, text: 'chunkA0', cosineSimilarity: 0.9 },
                { notePath: 'A.md', chunkIndex: 1, text: 'chunkA1', cosineSimilarity: 0.85 },
                { notePath: 'A.md', chunkIndex: 2, text: 'chunkA2', cosineSimilarity: 0.8 },
            ],
        });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.promptAugmentation).toContain('chunkA0');
        expect(out?.promptAugmentation).toContain('chunkA1');
        expect(out?.promptAugmentation).not.toContain('chunkA2');
    });

    it('returns tier="empty" with empty sources when probe returns no chunks', async () => {
        const probe = makeProbe({ chunks: [] });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out?.tier).toBe('empty');
        expect(out?.sources).toHaveLength(0);
    });

    it('returns null when the embedding is empty', async () => {
        const probe = makeProbe({ embedding: [], chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'x', cosineSimilarity: 0.99 }] });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: 'x', confidenceThreshold: 0.7, topN: 5 });
        expect(out).toBeNull();
        expect(probe.queryNoteChunks).not.toHaveBeenCalled();
    });

    it('returns null on empty / whitespace-only selection', async () => {
        const probe = makeProbe({ chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'x', cosineSimilarity: 0.99 }] });
        const pipe = new DefaultVaultRagPipeline({ probe });
        const out = await pipe.augment({ selectionText: '   ', confidenceThreshold: 0.7, topN: 5 });
        expect(out).toBeNull();
        expect(probe.embedText).not.toHaveBeenCalled();
    });

    it('truncates very long selections to maxSelectionChars', async () => {
        const probe = makeProbe({ chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'x', cosineSimilarity: 0.9 }] });
        const pipe = new DefaultVaultRagPipeline({ probe, maxSelectionChars: 10 });
        const longText = 'a'.repeat(50);
        await pipe.augment({ selectionText: longText, confidenceThreshold: 0.7, topN: 5 });
        expect(probe.embedText).toHaveBeenCalledWith('a'.repeat(10));
    });

    it('embedding cache: second identical augment does NOT re-embed', async () => {
        const probe = makeProbe({ chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'x'.repeat(700), cosineSimilarity: 0.9 }] });
        const cache = new EmbeddingCache({ capacity: 4 });
        const pipe = new DefaultVaultRagPipeline({ probe, embeddingCache: cache });
        await pipe.augment({ selectionText: 'same text', confidenceThreshold: 0.7, topN: 5 });
        await pipe.augment({ selectionText: 'same text', confidenceThreshold: 0.7, topN: 5 });
        expect(probe.embedText).toHaveBeenCalledTimes(1);
    });
});

describe('groupChunksByFile', () => {
    it('groups + sorts groups by best chunk score', () => {
        const grouped = groupChunksByFile([
            { notePath: 'A.md', chunkIndex: 0, text: 'a', cosineSimilarity: 0.5 },
            { notePath: 'B.md', chunkIndex: 0, text: 'b', cosineSimilarity: 0.9 },
            { notePath: 'A.md', chunkIndex: 1, text: 'a2', cosineSimilarity: 0.6 },
        ]);
        expect(grouped[0].notePath).toBe('B.md');
        expect(grouped[1].notePath).toBe('A.md');
        expect(grouped[1].chunks).toHaveLength(2);
        expect(grouped[1].chunks[0].cosineSimilarity).toBe(0.6);
    });
});

describe('evaluateVaultSufficiency', () => {
    it('returns "empty" for empty input', () => {
        expect(evaluateVaultSufficiency([], 0.7)).toBe('empty');
    });
    it('returns "strong" for a high score with enough chars', () => {
        const grouped = [{
            notePath: 'A.md', bestScore: 0.85,
            chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'a'.repeat(700), cosineSimilarity: 0.85 }],
            excerptChars: 700,
        }];
        expect(evaluateVaultSufficiency(grouped, 0.7)).toBe('strong');
    });
    it('returns "weak" for a high score with too few chars', () => {
        const grouped = [{
            notePath: 'A.md', bestScore: 0.85,
            chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'a'.repeat(350), cosineSimilarity: 0.85 }],
            excerptChars: 350,
        }];
        expect(evaluateVaultSufficiency(grouped, 0.7)).toBe('weak');
    });
    it('returns "weak" for two below-threshold hits both above floor 0.6 with top>=0.6', () => {
        // AUDIT-EPIC-33 L-01: VAULT_WEAK_THRESHOLD_FLOOR raised from
        // 0.5 to 0.6. Both hits must clear the floor; the previous
        // version accepted 0.55 which is below the new floor.
        const grouped = [
            { notePath: 'A.md', bestScore: 0.65, chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'a'.repeat(200), cosineSimilarity: 0.65 }], excerptChars: 200 },
            { notePath: 'B.md', bestScore: 0.62, chunks: [{ notePath: 'B.md', chunkIndex: 0, text: 'b'.repeat(150), cosineSimilarity: 0.62 }], excerptChars: 150 },
        ];
        expect(evaluateVaultSufficiency(grouped, 0.7)).toBe('weak');
    });
    it('returns "empty" when a second hit falls below the 0.6 floor', () => {
        // AUDIT-EPIC-33 L-01: 0.55 is now below the floor; the
        // pipeline must NOT accept this as a weak match anymore.
        const grouped = [
            { notePath: 'A.md', bestScore: 0.65, chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'a'.repeat(200), cosineSimilarity: 0.65 }], excerptChars: 200 },
            { notePath: 'B.md', bestScore: 0.55, chunks: [{ notePath: 'B.md', chunkIndex: 0, text: 'b'.repeat(150), cosineSimilarity: 0.55 }], excerptChars: 150 },
        ];
        expect(evaluateVaultSufficiency(grouped, 0.7)).toBe('empty');
    });
    it('returns "empty" for low scores with too few chars', () => {
        const grouped = [{
            notePath: 'A.md', bestScore: 0.45,
            chunks: [{ notePath: 'A.md', chunkIndex: 0, text: 'tiny', cosineSimilarity: 0.45 }],
            excerptChars: 4,
        }];
        expect(evaluateVaultSufficiency(grouped, 0.7)).toBe('empty');
    });
});
