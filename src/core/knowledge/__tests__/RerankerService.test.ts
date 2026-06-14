/**
 * Retrieval wave 1, item 6: batched reranking with backoff re-arm.
 *
 * Pins the new RerankerService contract:
 *  - load/inference failures no longer disable reranking permanently;
 *    the service backs off for 60s, then 300s, then 1800s (capped) and
 *    re-arms after each window,
 *  - a successful rerank resets the backoff counter back to the 60s tier,
 *  - candidates are scored with batched cross-encoder calls (chunks of 8
 *    query-document pairs) with candidate order preserved across chunks,
 *  - the original fusion score stays in `score`, the cross-encoder output
 *    goes into the separate `rerankScore` field,
 *  - every failure is fail-open: candidates pass through un-reranked and
 *    no exception reaches the caller.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RerankerService, RERANKER_MODEL_OPTIONS } from '../RerankerService';
import type { TokenizerFn, ModelFn, RerankCandidate } from '../RerankerService';

type Backend = { tokenizer: TokenizerFn; model: ModelFn };

function fakePlugin(): ConstructorParameters<typeof RerankerService>[0] {
    return {} as unknown as ConstructorParameters<typeof RerankerService>[0];
}

/**
 * Test subclass: replaces the heavy transformers.js backend creation.
 * `backend = null` simulates a load failure (init rejects).
 */
class TestReranker extends RerankerService {
    backend: Backend | null = null;
    initCalls = 0;

    protected initBackend(): Promise<Backend | null> {
        this.initCalls++;
        if (!this.backend) return Promise.reject(new Error('init boom'));
        return Promise.resolve(this.backend);
    }
}

/**
 * Backend whose model resolves one logit per query-document pair. The
 * tokenizer forwards the pair texts so the model stub can look up the
 * configured logit per document text. `state.failNext` lets tests flip
 * the model into a throwing state after a successful load.
 */
function controllableBackend(logitByText: Record<string, number>): Backend & {
    modelCalls: string[][];
    tokenizerCalls: { queries: string[]; pairs: string[] }[];
    state: { failNext: boolean };
} {
    const modelCalls: string[][] = [];
    const tokenizerCalls: { queries: string[]; pairs: string[] }[] = [];
    const state = { failNext: false };

    const tokenizer: TokenizerFn = (texts, options) => {
        tokenizerCalls.push({ queries: [...texts], pairs: [...options.text_pair] });
        return Promise.resolve({ pairs: options.text_pair });
    };
    const model: ModelFn = (inputs) => {
        if (state.failNext) return Promise.reject(new Error('inference boom'));
        const pairs = inputs.pairs;
        if (!Array.isArray(pairs)) return Promise.reject(new Error('expected batched pairs'));
        const texts = pairs.map((p) => String(p));
        modelCalls.push(texts);
        const data = new Float32Array(texts.length);
        texts.forEach((t, i) => { data[i] = logitByText[t] ?? 0; });
        return Promise.resolve({ logits: { data, dims: [texts.length, 1] } });
    };
    return { tokenizer, model, modelCalls, tokenizerCalls, state };
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

describe('RerankerService backoff re-arm', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('first failure arms a 60s window; loadModel does not retry inside it', async () => {
        const svc = new TestReranker(fakePlugin());

        await svc.loadModel(); // failure 1
        expect(svc.isLoaded).toBe(false);
        expect(svc.isInBackoff).toBe(true);
        expect(svc.initCalls).toBe(1);

        vi.advanceTimersByTime(30_000);
        await svc.loadModel(); // inside the window: no new attempt
        expect(svc.initCalls).toBe(1);
        expect(svc.isInBackoff).toBe(true);

        vi.advanceTimersByTime(30_001);
        expect(svc.isInBackoff).toBe(false);
        await svc.loadModel(); // re-armed: new attempt
        expect(svc.initCalls).toBe(2);
    });

    it('second failure arms 300s; a successful rerank resets to the 60s tier', async () => {
        const svc = new TestReranker(fakePlugin());

        await svc.loadModel(); // failure 1 -> 60s
        vi.advanceTimersByTime(60_001);
        await svc.loadModel(); // failure 2 -> 300s
        expect(svc.isInBackoff).toBe(true);

        vi.advanceTimersByTime(60_001);
        expect(svc.isInBackoff).toBe(true); // 60s is not enough on tier 2
        vi.advanceTimersByTime(240_000);
        expect(svc.isInBackoff).toBe(false);

        // Backend recovers: load + rerank succeed, counter resets
        const backend = controllableBackend({ a: 2 });
        svc.backend = backend;
        const cands: RerankCandidate[] = [{ path: 'Notes/A.md', text: 'a', score: 0.5 }];
        const out = await svc.rerank('q', cands);
        expect(out[0].rerankScore).toBeCloseTo(sigmoid(2), 5);
        expect(svc.isInBackoff).toBe(false);

        // Next failure starts again at the 60s tier (counter was reset)
        backend.state.failNext = true;
        const failOpen = await svc.rerank('q', cands);
        expect(failOpen.map((r) => r.path)).toEqual(['Notes/A.md']); // fail-open
        expect(svc.isInBackoff).toBe(true);
        vi.advanceTimersByTime(60_001);
        expect(svc.isInBackoff).toBe(false);
    });

    it('third and later failures cap the window at 1800s', async () => {
        const svc = new TestReranker(fakePlugin());

        await svc.loadModel(); // failure 1 -> 60s
        vi.advanceTimersByTime(60_001);
        await svc.loadModel(); // failure 2 -> 300s
        vi.advanceTimersByTime(300_001);
        await svc.loadModel(); // failure 3 -> 1800s
        vi.advanceTimersByTime(300_001);
        expect(svc.isInBackoff).toBe(true);
        vi.advanceTimersByTime(1_500_000);
        expect(svc.isInBackoff).toBe(false);

        await svc.loadModel(); // failure 4 -> stays at 1800s
        vi.advanceTimersByTime(1_799_999);
        expect(svc.isInBackoff).toBe(true);
        vi.advanceTimersByTime(2);
        expect(svc.isInBackoff).toBe(false);
    });

    it('rerank during backoff passes through without touching the model', async () => {
        const backend = controllableBackend({ a: 1 });
        const svc = new TestReranker(fakePlugin());
        svc.backend = backend;
        const cands: RerankCandidate[] = [{ path: 'Notes/A.md', text: 'a', score: 0.5 }];

        backend.state.failNext = true;
        await svc.rerank('q', cands); // inference failure arms the backoff
        expect(svc.isInBackoff).toBe(true);

        backend.state.failNext = false;
        const callsBefore = backend.modelCalls.length;
        const out = await svc.rerank('q', cands); // still inside the window
        expect(out.map((r) => r.path)).toEqual(['Notes/A.md']);
        expect(out[0].rerankScore).toBe(0.5); // pass-through, score mirrored
        expect(backend.modelCalls.length).toBe(callsBefore);

        vi.advanceTimersByTime(60_001);
        const reranked = await svc.rerank('q', cands); // window expired: reranks again
        expect(reranked[0].rerankScore).toBeCloseTo(sigmoid(1), 5);
    });
});

describe('RerankerService batched scoring', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('scores in chunks of 8 pairs and preserves candidate order across chunks', async () => {
        const logitByText: Record<string, number> = {};
        const candidates: RerankCandidate[] = [];
        for (let i = 0; i < 20; i++) {
            const text = `doc-${i}`;
            logitByText[text] = i * 0.1; // doc-19 gets the highest relevance
            candidates.push({ path: `Notes/${i}.md`, text, score: 1 - i * 0.01 });
        }
        const backend = controllableBackend(logitByText);
        const svc = new TestReranker(fakePlugin());
        svc.backend = backend;

        const out = await svc.rerank('my query', candidates);

        // Chunked at 8 pairs per forward pass: 8 + 8 + 4
        expect(backend.modelCalls.map((b) => b.length)).toEqual([8, 8, 4]);
        // Batches walk the candidates in their original order
        expect(backend.modelCalls[0][0]).toBe('doc-0');
        expect(backend.modelCalls[1][0]).toBe('doc-8');
        expect(backend.modelCalls[2][3]).toBe('doc-19');
        // Every pair carries the same query
        for (const call of backend.tokenizerCalls) {
            expect(call.queries.every((q) => q === 'my query')).toBe(true);
            expect(call.queries.length).toBe(call.pairs.length);
        }
        // Results sorted by rerankScore descending
        expect(out[0].path).toBe('Notes/19.md');
        expect(out[out.length - 1].path).toBe('Notes/0.md');
        // Original fusion score preserved alongside the rerank output
        expect(out[0].score).toBeCloseTo(1 - 19 * 0.01, 10);
        expect(out[0].rerankScore).toBeCloseTo(sigmoid(1.9), 5);
    });

    it('applies topK after sorting', async () => {
        const backend = controllableBackend({ low: -1, high: 3 });
        const svc = new TestReranker(fakePlugin());
        svc.backend = backend;

        const out = await svc.rerank('q', [
            { path: 'Notes/Low.md', text: 'low', score: 0.9 },
            { path: 'Notes/High.md', text: 'high', score: 0.1 },
        ], 1);
        expect(out).toHaveLength(1);
        expect(out[0].path).toBe('Notes/High.md');
    });
});

describe('RerankerService model options (ISSUE-A regression)', () => {
    // The plugin injects onnxruntime-web via globalThis[Symbol.for('onnxruntime')].
    // In that custom-runtime branch transformers.js never populates its
    // supportedDevices list, so device 'wasm' throws
    // 'Unsupported device: "wasm". Should be one of: .' at load time.
    // 'auto' returns the (empty) list without throwing, and the explicit
    // session_options.executionProviders pins the ORT wasm EP deterministically.
    it('uses device auto, not wasm, to dodge the empty supportedDevices throw', () => {
        expect(RERANKER_MODEL_OPTIONS.device).toBe('auto');
    });

    it('pins the wasm execution provider via session_options', () => {
        expect([...RERANKER_MODEL_OPTIONS.session_options.executionProviders]).toEqual(['wasm']);
    });

    it('keeps the q8 quantized weights', () => {
        expect(RERANKER_MODEL_OPTIONS.dtype).toBe('q8');
    });
});

describe('RerankerService fail-open', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('model throw returns candidates unchanged with rerankScore mirroring score', async () => {
        const backend = controllableBackend({});
        backend.state.failNext = true;
        const svc = new TestReranker(fakePlugin());
        svc.backend = backend;

        const candidates: RerankCandidate[] = [
            { path: 'Notes/A.md', text: 'aa', score: 0.7 },
            { path: 'Notes/B.md', text: 'bb', score: 0.3 },
        ];
        const out = await svc.rerank('q', candidates);
        expect(out.map((r) => r.path)).toEqual(['Notes/A.md', 'Notes/B.md']);
        out.forEach((r, i) => {
            expect(r.score).toBe(candidates[i].score);
            expect(r.rerankScore).toBe(candidates[i].score);
        });
    });

    it('load failure returns candidates pass-through in original order', async () => {
        const svc = new TestReranker(fakePlugin()); // backend stays null -> load fails

        const candidates: RerankCandidate[] = [
            { path: 'Notes/B.md', text: 'bb', score: 0.3 },
            { path: 'Notes/A.md', text: 'aa', score: 0.7 },
        ];
        const out = await svc.rerank('q', candidates);
        expect(out.map((r) => r.path)).toEqual(['Notes/B.md', 'Notes/A.md']);
        expect(out[0].rerankScore).toBe(0.3);
    });

    it('returns an empty array for empty candidates without loading', async () => {
        const svc = new TestReranker(fakePlugin());
        const out = await svc.rerank('q', []);
        expect(out).toEqual([]);
        expect(svc.initCalls).toBe(0);
    });
});
