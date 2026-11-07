/**
 * Optional Qwen3 reranker over Ollama's native Generate API (IMP-15-04-01).
 * Scores only genuine first-token yes/no logprobs using Qwen's two-way softmax.
 * Sources: https://huggingface.co/Qwen/Qwen3-Reranker-4B and
 * https://docs.ollama.com/api/generate. This is not an /api/rerank endpoint.
 * Extension: keep transport bounds and whole-round failure semantics intact.
 */
import { setTimeout, clearTimeout } from 'node:timers';
import { createNodeFetch } from '../../api/providers/openai';
import { validateProviderUrl } from '../../api/providers/providerUrlGuard';
import type { RerankCandidate, RerankResult } from './RerankerService';

export const OLLAMA_RERANKER_DEFAULT_URL = 'http://localhost:11434';
export const OLLAMA_RERANKER_DEFAULT_MODEL = 'awenleven/Qwen3-Reranker-4B:Q4_K_M';
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CANDIDATES = 30;
const TIMEOUT_MS = 30_000;

export interface OllamaRerankerConfig { baseUrl: string; model: string }

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bound before encoding/escaping: adversarial notes cannot allocate an unbounded copy. */
function promptData(text: string, maxBytes: number): string {
    const bounded = text.slice(0, maxBytes).replace(/</g, '＜').replace(/>/g, '＞');
    const encoder = new TextEncoder();
    let bytes = 0;
    let result = '';
    for (const char of bounded) {
        bytes += encoder.encode(char).byteLength;
        if (bytes > maxBytes) break;
        result += char;
    }
    return result;
}

function prompt(query: string, document: string): string {
    // The completed think block is required by Qwen's official inference example.
    // Only the fixed scaffold contains model control tokens; data cannot close roles.
    return '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n' +
        '<Instruct>: Given a web search query, retrieve relevant passages that answer the query\n' +
        `<Query>: ${promptData(query, 1024)}\n<Document>: ${promptData(document, 4096)}` +
        '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n';
}

function scoreResponse(value: unknown): number {
    const invalid = (): never => { throw new Error('Ollama must return both yes and no logprobs for the first answer token. Check the model and Ollama version.'); };
    if (!record(value) || !Array.isArray(value.logprobs) || value.logprobs.length !== 1) return invalid();
    const first: unknown = value.logprobs[0];
    if (!record(first) || (first.token !== 'yes' && first.token !== 'no')) return invalid();
    const alternatives: unknown[] = Array.isArray(first.top_logprobs) ? first.top_logprobs : [];
    const tokens: unknown[] = [first, ...alternatives];
    let yes: number | undefined;
    let no: number | undefined;
    for (const entry of tokens) {
        if (!record(entry) || (entry.token !== 'yes' && entry.token !== 'no')) continue;
        if (typeof entry.logprob !== 'number' || !Number.isFinite(entry.logprob) || entry.logprob > 0) return invalid();
        const previous = entry.token === 'yes' ? yes : no;
        if (previous !== undefined && previous !== entry.logprob) return invalid();
        if (entry.token === 'yes') yes = entry.logprob;
        else no = entry.logprob;
    }
    if (yes === undefined || no === undefined) return invalid();
    // Same-position normalization cancels: sigmoid(log P(yes) - log P(no)).
    return 1 / (1 + Math.exp(no - yes));
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
    if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error(`Ollama reranking request failed (HTTP ${response.status}).`);
    }
    if (!response.body) throw new Error('Ollama returned no response body.');
    const reader = response.body.getReader();
    const cancel = (): void => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder();
    let size = 0;
    let text = '';
    try {
        while (true) {
            if (signal.aborted) throw signal.reason;
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
                cancel();
                throw new Error('Ollama reranking response exceeded the size limit.');
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        try { return JSON.parse(text) as unknown; }
        catch { throw new Error('Ollama returned invalid reranking JSON.'); }
    } finally {
        signal.removeEventListener('abort', cancel);
        reader.releaseLock();
    }
}

export class OllamaReranker {
    private readonly active = new Set<AbortController>();
    constructor(private readonly config: OllamaRerankerConfig, private readonly request = createNodeFetch()) {}

    dispose(): void {
        for (const controller of this.active) controller.abort(new DOMException('Aborted', 'AbortError'));
    }

    async rerank(query: string, candidates: RerankCandidate[], signal?: AbortSignal): Promise<RerankResult[]> {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (!candidates.length) return [];
        if (candidates.length > MAX_CANDIDATES) throw new Error('Ollama reranking is limited to 30 candidates.');
        const base = validateProviderUrl('ollama', this.config.baseUrl);
        if (!base || base.username || base.password || base.search || base.hash) throw new Error('Enter an Ollama server URL without credentials, query or fragment.');
        base.pathname = base.pathname.replace(/\/(?:v1|api(?:\/generate)?)\/?$/, '').replace(/\/$/, '') + '/api/generate';
        const endpoint = validateProviderUrl('ollama', base.href)!.href;
        const model = this.config.model.trim();
        if (!model || model.length > 200) throw new Error('Enter a valid Qwen3 reranker model name.');
        const controller = new AbortController();
        this.active.add(controller);
        const onAbort = (): void => controller.abort(new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(new Error('Ollama reranking timed out after 30 seconds.')), TIMEOUT_MS);
        let rejectAborted: () => void = () => undefined;
        const aborted = new Promise<never>((_, reject) => {
            rejectAborted = () => {
                const reason: unknown = controller.signal.reason;
                reject(reason instanceof Error ? reason : new Error('Ollama reranking aborted.'));
            };
            controller.signal.addEventListener('abort', rejectAborted, { once: true });
        });
        const run = async (): Promise<RerankResult[]> => {
            const results: RerankResult[] = [];
            for (const candidate of candidates) {
                if (controller.signal.aborted) throw controller.signal.reason;
                const response = await this.request(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal, redirect: 'error',
                    body: JSON.stringify({ model, prompt: prompt(query, candidate.text), raw: true, stream: false,
                        logprobs: true, top_logprobs: 20, truncate: false,
                        options: { temperature: 0, num_predict: 1, num_ctx: 8192 } }),
                });
                const result = await readResponse(response, controller.signal);
                if (controller.signal.aborted) throw controller.signal.reason;
                results.push({ ...candidate, rerankScore: scoreResponse(result) });
            }
            return results.sort((a, b) => b.rerankScore - a.rerankScore);
        };
        try { return await Promise.race([run(), aborted]); }
        finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            controller.signal.removeEventListener('abort', rejectAborted);
            this.active.delete(controller);
        }
    }

    /** Explicit capability probe: synthetic inputs, never user query or vault text. */
    async testConnection(signal?: AbortSignal): Promise<void> {
        const results = await this.rerank('What is the capital of France?', [
            { path: 'relevant', text: 'Paris is the capital of France.', score: 0 },
            { path: 'irrelevant', text: 'The Moon orbits Earth.', score: 0 },
        ], signal);
        if (results[0].path !== 'relevant' || results[0].rerankScore <= results[1].rerankScore) {
            throw new Error('The model returned logprobs but did not rank the relevant test passage higher. Use a Qwen3 reranker model.');
        }
    }
}
