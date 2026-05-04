import { describe, it, expect, vi } from 'vitest';
import { MemoryV2Telemetry } from '../MemoryV2Telemetry';

describe('MemoryV2Telemetry (PLAN-006 task 13)', () => {
    it('writes a JSONL line with the event kind and timestamp', async () => {
        const append = vi.fn().mockResolvedValue(undefined);
        const t = new MemoryV2Telemetry(append);
        await t.record({
            kind: 'cache',
            timestamp: '2026-04-28T10:00:00Z',
            payload: { cacheReadTokens: 1234, totalInputTokens: 2000 },
        });
        expect(append).toHaveBeenCalledTimes(1);
        const [path, line] = append.mock.calls[0];
        expect(path).toBe('logs/memory-v2/2026-04-28.jsonl');
        const parsed = JSON.parse(line.trim());
        expect(parsed).toMatchObject({
            kind: 'cache',
            ts: '2026-04-28T10:00:00Z',
            cacheReadTokens: 1234,
            totalInputTokens: 2000,
        });
    });

    it('defaults the timestamp when omitted', async () => {
        const append = vi.fn().mockResolvedValue(undefined);
        const t = new MemoryV2Telemetry(append);
        await t.record({ kind: 'retrieval', payload: { stage: 'compose', durationMs: 42 } });
        const [path, line] = append.mock.calls[0];
        expect(path).toMatch(/^logs\/memory-v2\/\d{4}-\d{2}-\d{2}\.jsonl$/);
        const parsed = JSON.parse(line.trim());
        expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('cache helper produces the right kind', async () => {
        const append = vi.fn().mockResolvedValue(undefined);
        const t = new MemoryV2Telemetry(append);
        await t.cache({ cacheReadTokens: 100, totalInputTokens: 500 });
        const parsed = JSON.parse((append.mock.calls[0][1] as string).trim());
        expect(parsed.kind).toBe('cache');
    });

    it('drift helper records previous + new topic', async () => {
        const append = vi.fn().mockResolvedValue(undefined);
        const t = new MemoryV2Telemetry(append);
        await t.drift({ previousTopic: 'coding', newTopic: 'cooking', score: 0.82 });
        const parsed = JSON.parse((append.mock.calls[0][1] as string).trim());
        expect(parsed).toMatchObject({
            kind: 'drift',
            previousTopic: 'coding',
            newTopic: 'cooking',
            score: 0.82,
        });
    });

    it('recall helper records query + counts', async () => {
        const append = vi.fn().mockResolvedValue(undefined);
        const t = new MemoryV2Telemetry(append);
        await t.recall({ query: 'foo', topK: 5, hits: 3, multiHop: false });
        const parsed = JSON.parse((append.mock.calls[0][1] as string).trim());
        expect(parsed.kind).toBe('recall');
        expect(parsed.hits).toBe(3);
    });

    it('swallows transport errors without throwing', async () => {
        const append = vi.fn().mockRejectedValue(new Error('disk full'));
        const t = new MemoryV2Telemetry(append);
        await expect(
            t.record({ kind: 'cache', payload: {} }),
        ).resolves.toBeUndefined();
    });
});
