import { describe, it, expect } from 'vitest';
import { EmbeddingService, type EmbeddingProvider, type ModelInfo } from '../EmbeddingService';

class StubProvider implements EmbeddingProvider {
    public calls: string[][] = [];
    constructor(
        public readonly info: ModelInfo,
        private readonly behaviour: 'echo' | 'short' | 'throw' = 'echo',
    ) {}
    async embed(texts: string[]): Promise<Float32Array[]> {
        this.calls.push([...texts]);
        if (this.behaviour === 'throw') throw new Error('upstream-fail');
        if (this.behaviour === 'short') return texts.slice(0, -1).map(() => new Float32Array(3));
        return texts.map(t => Float32Array.from([t.length, t.length * 2, t.length * 3]));
    }
}

const okInfo: ModelInfo = { model: 'mock-1', provider: 'mock', dimensions: 3 };

describe('EmbeddingService (PLAN-004 task 5)', () => {
    it('starts un-ready with no provider', () => {
        const svc = new EmbeddingService();
        expect(svc.isReady()).toBe(false);
        expect(svc.getModelInfo()).toBeNull();
    });

    it('reports the provider info once configured', () => {
        const svc = new EmbeddingService(new StubProvider(okInfo));
        expect(svc.isReady()).toBe(true);
        expect(svc.getModelInfo()).toEqual(okInfo);
    });

    it('returns empty array for empty input without calling the provider', async () => {
        const provider = new StubProvider(okInfo);
        const svc = new EmbeddingService(provider);
        expect(await svc.embed([])).toEqual([]);
        expect(provider.calls).toEqual([]);
    });

    it('delegates to the provider and returns its vectors', async () => {
        const provider = new StubProvider(okInfo);
        const svc = new EmbeddingService(provider);
        const out = await svc.embed(['a', 'bb', 'ccc']);
        expect(out).toHaveLength(3);
        expect(Array.from(out[0])).toEqual([1, 2, 3]);
        expect(Array.from(out[2])).toEqual([3, 6, 9]);
        expect(provider.calls).toEqual([['a', 'bb', 'ccc']]);
    });

    it('throws when no provider is configured', async () => {
        const svc = new EmbeddingService();
        await expect(svc.embed(['x'])).rejects.toThrow(/no provider/);
    });

    it('throws when provider returns the wrong number of vectors', async () => {
        const provider = new StubProvider(okInfo, 'short');
        const svc = new EmbeddingService(provider);
        await expect(svc.embed(['a', 'b'])).rejects.toThrow(/1 vectors for 2 inputs/);
    });

    it('propagates provider errors', async () => {
        const provider = new StubProvider(okInfo, 'throw');
        const svc = new EmbeddingService(provider);
        await expect(svc.embed(['a'])).rejects.toThrow(/upstream-fail/);
    });

    it('setProvider switches the active provider live', async () => {
        const a = new StubProvider({ ...okInfo, model: 'a' });
        const b = new StubProvider({ ...okInfo, model: 'b' });
        const svc = new EmbeddingService(a);
        await svc.embed(['x']);
        svc.setProvider(b);
        await svc.embed(['x']);
        expect(a.calls).toHaveLength(1);
        expect(b.calls).toHaveLength(1);
        expect(svc.getModelInfo()?.model).toBe('b');
    });

    it('setProvider(null) drops back to un-ready', () => {
        const svc = new EmbeddingService(new StubProvider(okInfo));
        svc.setProvider(null);
        expect(svc.isReady()).toBe(false);
    });
});
