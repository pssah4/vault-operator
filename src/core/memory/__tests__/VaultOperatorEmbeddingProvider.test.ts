import { describe, it, expect, vi } from 'vitest';
import { VaultOperatorEmbeddingProvider } from '../VaultOperatorEmbeddingProvider';
import { EmbeddingService } from '../EmbeddingService';

describe('VaultOperatorEmbeddingProvider (PLAN-005 task 6)', () => {
    it('delegates embed() to the callback and returns its vectors', async () => {
        const fn = vi.fn().mockResolvedValue([
            Float32Array.from([1, 2, 3]),
            Float32Array.from([4, 5, 6]),
        ]);
        const provider = new VaultOperatorEmbeddingProvider(
            fn,
            () => ({ model: 'qwen3-embedding-8b', provider: 'openrouter', dimensions: 3 }),
        );
        const out = await provider.embed(['a', 'b']);
        expect(fn).toHaveBeenCalledWith(['a', 'b']);
        expect(Array.from(out[0])).toEqual([1, 2, 3]);
    });

    it('skips the callback for empty input', async () => {
        const fn = vi.fn();
        const provider = new VaultOperatorEmbeddingProvider(fn, () => null);
        expect(await provider.embed([])).toEqual([]);
        expect(fn).not.toHaveBeenCalled();
    });

    it('exposes the live ModelInfo from the supplier (picks up runtime swaps)', () => {
        let liveInfo = { model: 'a', provider: 'p1' };
        const provider = new VaultOperatorEmbeddingProvider(
            async () => [],
            () => liveInfo,
        );
        expect(provider.info.model).toBe('a');
        liveInfo = { model: 'b', provider: 'p2' };
        expect(provider.info.model).toBe('b');
    });

    it('falls back to fallbackInfo when supplier returns null', () => {
        const provider = new VaultOperatorEmbeddingProvider(
            async () => [],
            () => null,
            { fallbackInfo: { model: 'fb', provider: 'cache' } },
        );
        expect(provider.info).toEqual({ model: 'fb', provider: 'cache' });
    });

    it('falls back to "unknown" when no fallback is configured', () => {
        const provider = new VaultOperatorEmbeddingProvider(async () => [], () => null);
        expect(provider.info).toEqual({ model: 'unknown', provider: 'unknown' });
    });

    it('plays nicely with EmbeddingService end-to-end', async () => {
        const provider = new VaultOperatorEmbeddingProvider(
            async (texts) => texts.map(t => Float32Array.from([t.length])),
            () => ({ model: 'mock', provider: 'mock', dimensions: 1 }),
        );
        const svc = new EmbeddingService(provider);
        expect(svc.isReady()).toBe(true);
        expect(svc.getModelInfo()?.model).toBe('mock');
        const out = await svc.embed(['ab', 'cde']);
        expect(out.map(v => v[0])).toEqual([2, 3]);
    });

    it('propagates callback errors to the EmbeddingService caller', async () => {
        const provider = new VaultOperatorEmbeddingProvider(
            async () => { throw new Error('upstream-rate-limit'); },
            () => null,
        );
        const svc = new EmbeddingService(provider);
        await expect(svc.embed(['x'])).rejects.toThrow(/upstream-rate-limit/);
    });
});
