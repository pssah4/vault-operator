/**
 * Gemini API via user-owned Desktop OAuth. Native REST only: the existing
 * API-key/OpenAI compatibility path is independent. Fixed origins prevent
 * OAuth credentials being forwarded to a custom endpoint. FEAT-04-14.
 */
import { setTimeout, clearTimeout } from 'node:timers';
import type { CustomModel, LLMProvider } from '../../types/settings';
import type { ApiHandler, ApiStream, MessageParam, ModelInfo, ProviderState } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { GeminiOAuthService } from '../../core/auth/GeminiOAuthService';
import { getModelContextWindow } from '../../types/model-registry';
import { createNodeFetch } from './openai';
import { prepareGeminiRequest, parseGeminiStream, geminiScope, estimateGeminiStateTokens, object } from '../adapters/geminiNative';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/';
export type GeminiTransport = (url: string, init?: RequestInit) => Promise<Response>;
interface GeminiAuth { getHeaders(): Promise<Record<string, string>>; getSessionId(): string }
export interface GeminiDependencies { transport?: GeminiTransport; auth?: GeminiAuth }
interface GeminiModel { id: string; label: string; contextWindow?: number; maxOutputTokens?: number }
function modelName(id: string): string {
    const name = id.replace(/^models\//, '');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(name)) throw new Error('Invalid Gemini model ID.');
    return `models/${name}`;
}
function assertEndpoint(baseUrl: string | undefined): void {
    if (baseUrl && baseUrl.replace(/\/+$/, '') !== BASE.replace(/\/+$/, '')) throw new Error('Gemini OAuth uses the official Google API endpoint; custom endpoints are not supported.');
}
function aborted(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); }
function dependencies(id: string | undefined, deps: GeminiDependencies): { transport: GeminiTransport; auth: GeminiAuth } {
    return { transport: deps.transport ?? createNodeFetch(), auth: deps.auth ?? GeminiOAuthService.forProvider(id) };
}
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}
async function request(path: string, body: unknown, deps: { transport: GeminiTransport; auth: GeminiAuth }, signal?: AbortSignal): Promise<Response> {
    aborted(signal);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 300_000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    try {
        const headers = await withAbort(deps.auth.getHeaders(), controller.signal);
        aborted(controller.signal);
        const pending = deps.transport(BASE + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
        });
        // A transport may finish after cancellation. Do not leak that body.
        void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
        const response = await withAbort(pending, controller.signal);
        if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            const error = new Error(`Google Gemini API request failed (HTTP ${response.status}). Check API access, project quota and sign-in.`);
            Object.assign(error, { status: response.status }); throw error;
        }
        if (!response.body) { cleanup(); return response; }
        const reader = response.body.getReader();
        const cancelReader = () => { void reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancelReader, { once: true });
        const close = () => { cleanup(); controller.signal.removeEventListener('abort', cancelReader); };
        const wrapped = new ReadableStream<Uint8Array>({
            async pull(stream) {
                try {
                    const next = await withAbort(reader.read(), controller.signal);
                    aborted(controller.signal);
                    if (next.done) { close(); stream.close(); } else stream.enqueue(next.value);
                } catch (error) { close(); stream.error(error); await reader.cancel().catch(() => {}); }
            },
            async cancel() { close(); await reader.cancel().catch(() => {}); controller.abort(); },
        });
        return new Response(wrapped, { status: response.status, headers: response.headers });
    } catch (error) { cleanup(); controller.abort(); throw error; }
}
/** Bound non-stream JSON responses; model catalogs and embeddings are external input. */
async function json(response: Response): Promise<unknown> {
    if (!response.body) throw new Error('Google Gemini returned an empty response.');
    const reader = response.body.getReader(); let size = 0; let text = ''; const decoder = new TextDecoder();
    try {
        while (true) {
            const next = await reader.read(); if (next.done) break;
            size += next.value.byteLength;
            if (size > 16_777_216) throw new Error('Google Gemini response exceeds the size limit.');
            text += decoder.decode(next.value, { stream: true });
        }
        text += decoder.decode();
        try { return JSON.parse(text) as unknown; } catch { throw new Error('Google Gemini returned invalid JSON.'); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export class GeminiOAuthProvider implements ApiHandler {
    private readonly deps: { transport: GeminiTransport; auth: GeminiAuth };
    constructor(private readonly config: LLMProvider, deps: GeminiDependencies = {}) {
        assertEndpoint(config.baseUrl); this.deps = dependencies(config.geminiOAuthProviderId, deps);
    }
    private requestConfig(): LLMProvider { return { ...this.config, geminiOAuthSessionId: this.deps.auth.getSessionId() }; }
    getModel(): { id: string; info: ModelInfo } {
        return { id: this.config.model, info: { contextWindow: this.config.contextWindow ?? getModelContextWindow(this.config.model), supportsTools: true, supportsStreaming: true } };
    }
    estimateProviderStateTokens(state: ProviderState | undefined): number { return estimateGeminiStateTokens(state, geminiScope(this.requestConfig())); }
    async *createMessage(system: string, messages: MessageParam[], tools: ToolDefinition[], signal?: AbortSignal): ApiStream {
        aborted(signal);
        const path = modelName(this.config.model); const config = this.requestConfig();
        const body = prepareGeminiRequest(config, system, messages, tools);
        const response = await request(`${path}:streamGenerateContent?alt=sse`, body, this.deps, signal);
        if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body) {
            await response.body?.cancel().catch(() => {}); throw new Error('Google Gemini returned an invalid streaming response.');
        }
        yield* parseGeminiStream(response.body, geminiScope(config), signal);
    }
    async classifyText(prompt: string, signal?: AbortSignal, maxTokens = 50): Promise<string> {
        aborted(signal);
        const path = modelName(this.config.model);
        const thinkingModel = /^gemini-(?:2\.5|3(?:[.-]))/.test(this.config.model);
        const body = prepareGeminiRequest({ ...this.requestConfig(),
            maxTokens: thinkingModel ? Math.max(2048, maxTokens) : maxTokens,
            thinkingEnabled: true, thinkingBudgetTokens: 128, reasoningEffort: 'low',
        }, '', [{ role: 'user', content: prompt }], []);
        const result = object(await json(await request(`${path}:generateContent`, body, this.deps, signal)));
        if (object(result?.promptFeedback)?.blockReason) throw new Error('Google Gemini blocked the request.');
        const candidate = object(Array.isArray(result?.candidates) ? result.candidates[0] : undefined);
        if (candidate?.finishReason !== 'STOP') throw new Error('Google Gemini returned an incomplete classification. Increase the output budget.');
        const parts = object(candidate.content)?.parts;
        if (!Array.isArray(parts)) throw new Error('Google Gemini returned no text.');
        return parts.map((raw: unknown) => { const p = object(raw); return !p?.thought && typeof p?.text === 'string' ? p.text : ''; }).join('').trim();
    }
}
export async function fetchGeminiOAuthModels(providerId: string | undefined, embedding = false, overrides: GeminiDependencies = {}): Promise<GeminiModel[]> {
    const deps = dependencies(providerId, overrides); const models = new Map<string, GeminiModel>(); const pages = new Set<string>(); let token = '';
    for (let page = 0; page < 20; page++) {
        const query = new URLSearchParams({ pageSize: '1000', ...(token ? { pageToken: token } : {}) });
        const payload = object(await json(await request(`models?${query.toString()}`, undefined, deps)));
        if (!payload || !Array.isArray(payload.models)) throw new Error('Google Gemini returned an invalid model catalog.');
        for (const raw of payload.models) {
            const model = object(raw); if (!model || typeof model.name !== 'string' || !Array.isArray(model.supportedGenerationMethods)) continue;
            if (!model.supportedGenerationMethods.includes(embedding ? 'embedContent' : 'generateContent')) continue;
            const id = modelName(model.name).slice(7);
            const positive = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 100_000_000 ? value : undefined;
            models.set(id, { id, label: typeof model.displayName === 'string' ? model.displayName : id, contextWindow: positive(model.inputTokenLimit), maxOutputTokens: positive(model.outputTokenLimit) });
        }
        if (!payload.nextPageToken) return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
        if (typeof payload.nextPageToken !== 'string' || payload.nextPageToken.length > 4096 || pages.has(payload.nextPageToken)) throw new Error('Google Gemini returned an invalid catalog continuation.');
        token = payload.nextPageToken; pages.add(token);
    }
    throw new Error('Google Gemini model catalog exceeds the page limit.');
}
export async function embedGeminiOAuth(texts: string[], model: CustomModel, signal?: AbortSignal, overrides: GeminiDependencies = {}): Promise<Float32Array[]> {
    assertEndpoint(model.baseUrl); const path = modelName(model.name); aborted(signal);
    if (texts.length === 0) return [];
    const deps = dependencies(model.geminiOAuthProviderId, overrides); const out: Float32Array[] = []; let dimensions = 0;
    for (let offset = 0; offset < texts.length; offset += 100) {
        const batch = texts.slice(offset, offset + 100);
        const payload = object(await json(await request(`${path}:batchEmbedContents`, {
            requests: batch.map(text => ({ model: path, content: { parts: [{ text }] } })),
        }, deps, signal)));
        if (!Array.isArray(payload?.embeddings) || payload.embeddings.length !== batch.length) throw new Error('Google Gemini returned an invalid embedding count.');
        for (const raw of payload.embeddings) {
            const values = object(raw)?.values;
            if (!Array.isArray(values) || !values.length || values.length > 65536 || !values.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 3.402823466e38)) throw new Error('Google Gemini returned invalid embedding values.');
            if (dimensions && values.length !== dimensions) throw new Error('Google Gemini returned inconsistent embedding dimensions.');
            dimensions = values.length; out.push(new Float32Array(values as number[]));
        }
    }
    return out;
}
