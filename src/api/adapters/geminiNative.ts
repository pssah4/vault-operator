/**
 * Native Gemini generateContent wire format for the optional OAuth provider.
 * Preserve signed Parts exactly, scoped to model/provider/sign-in; convert
 * only at this boundary. Streaming tools are committed at finish, never from
 * a partial transport. FEAT-04-14, ADR-150.
 */
import type { LLMProvider } from '../../types/settings';
import type { ToolDefinition } from '../../core/tools/types';
import type { ApiStream, ApiStreamChunk, MessageParam, ProviderState } from '../types';
import { truncatedToolInputError } from '../types';
import { estimatePromptTokens, getModelContextWindow, resolveOutputBudget, getModelEffortLevels } from '../../types/model-registry';
import { sha256Hex } from '../../core/utils/sha256';

interface GeminiCall { name: string; args: Record<string, unknown>; id?: string }
export interface GeminiPart {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
    inlineData?: { mimeType: string; data: string };
    functionCall?: GeminiCall;
    functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
}
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }
interface GeminiRequest {
    contents: GeminiContent[];
    systemInstruction?: { parts: Array<{ text: string }> };
    tools?: Array<{ functionDeclarations: Array<{ name: string; description: string; parametersJsonSchema: unknown }> }>;
    generationConfig: { maxOutputTokens: number; temperature?: number; thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string; includeThoughts?: boolean } };
}
const MAX_EVENT_CHARS = 1_048_576;
const MAX_STATE_CHARS = 4_194_304;
const MAX_PARTS = 16384;
export function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function geminiScope(config: LLMProvider): string {
    return sha256Hex(JSON.stringify([config.type, config.geminiOAuthProviderId, config.geminiOAuthSessionId, config.model]));
}
function readPart(raw: unknown): GeminiPart | undefined {
    const p = object(raw); if (!p) return;
    const out: GeminiPart = {};
    if (p.text !== undefined) { if (typeof p.text !== 'string') return; out.text = p.text; }
    if (p.thought !== undefined) { if (typeof p.thought !== 'boolean') return; out.thought = p.thought; }
    if (p.thoughtSignature !== undefined) {
        if (typeof p.thoughtSignature !== 'string' || p.thoughtSignature.length > MAX_EVENT_CHARS) return;
        out.thoughtSignature = p.thoughtSignature;
    }
    if (p.functionCall !== undefined) {
        const call = object(p.functionCall);
        if (!call || typeof call.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(call.name) || (call.args !== undefined && !object(call.args))) return;
        if (call.id !== undefined && (typeof call.id !== 'string' || call.id.length > 256)) return;
        out.functionCall = { name: call.name, args: (call.args ?? {}) as Record<string, unknown>, ...(typeof call.id === 'string' ? { id: call.id } : {}) };
    }
    // Text output is the supported contract. Never silently lose audio/images
    // or executable provider tools that were not requested by this adapter.
    if (Object.keys(p).some(key => !['text', 'thought', 'thoughtSignature', 'functionCall'].includes(key))) return;
    return Object.keys(out).length > 0 ? out : undefined;
}
function readState(state: ProviderState | undefined, scope: string): { parts: GeminiPart[]; toolIds: string[] } | undefined {
    if (!state || state.format !== 'gemini-parts-v1' || state.scope !== scope) return;
    const value = object(state.value);
    if (!value || !Array.isArray(value.parts) || !Array.isArray(value.toolIds) || value.parts.length > MAX_PARTS
        || !value.toolIds.every((id: unknown) => typeof id === 'string' && id.length <= 256)) return;
    if (JSON.stringify(value).length > MAX_STATE_CHARS) return;
    const parts = value.parts.map(readPart);
    if (parts.some(p => !p)) return;
    const valid = parts as GeminiPart[];
    if (valid.filter(p => p.functionCall).length !== value.toolIds.length) return;
    return { parts: valid, toolIds: value.toolIds as string[] };
}
export function estimateGeminiStateTokens(state: ProviderState | undefined, scope: string): number {
    const value = readState(state, scope); if (!value) return 0;
    return Math.ceil(value.parts.reduce((size, part) => size + (part.thoughtSignature?.length ?? 0) + (part.thought ? part.text?.length ?? 0 : 0), 0) / 4);
}
function stateMatches(message: MessageParam, native: { parts: GeminiPart[]; toolIds: string[] }): boolean {
    const blocks = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content;
    if (blocks.flatMap(b => b.type === 'text' ? [b.text] : []).join('') !== native.parts.filter(p => !p.thought).map(p => p.text ?? '').join('')) return false;
    const calls = blocks.flatMap(b => b.type === 'tool_use' ? [b] : []); const nativeCalls = native.parts.flatMap(p => p.functionCall ? [p.functionCall] : []);
    return calls.length === nativeCalls.length && calls.every((call, i) => call.id === native.toolIds[i] && call.name === nativeCalls[i].name && JSON.stringify(call.input) === JSON.stringify(nativeCalls[i].args));
}
function convertMessages(messages: MessageParam[], scope: string): GeminiContent[] {
    const contents: GeminiContent[] = [];
    const calls = new Map<string, { name: string; id?: string }>();
    for (const message of messages) {
        const native = message.role === 'assistant' ? readState(message.providerState, scope) : undefined;
        if (native && stateMatches(message, native)) {
            let i = 0;
            for (const part of native.parts) if (part.functionCall) {
                const { name, id } = part.functionCall;
                calls.set(native.toolIds[i++], { name, ...(id !== undefined ? { id } : {}) });
            }
            contents.push({ role: 'model', parts: native.parts }); continue;
        }
        const parts: GeminiPart[] = [];
        if (typeof message.content === 'string') parts.push({ text: message.content });
        else for (const block of message.content) {
            switch (block.type) {
                case 'text': parts.push({ text: block.text }); break;
                case 'image': parts.push({ inlineData: { mimeType: block.source.media_type, data: block.source.data } }); break;
                case 'tool_use':
                    calls.set(block.id, { name: block.name });
                    parts.push({ functionCall: { name: block.name, args: block.input } }); break;
                case 'tool_result': {
                    const call = calls.get(block.tool_use_id);
                    if (!call) throw new Error('Gemini tool result has no matching call. Start a new conversation.');
                    const text = typeof block.content === 'string' ? block.content : block.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('\n');
                    parts.push({ functionResponse: { ...call, response: block.is_error ? { error: text } : { output: text } } });
                    if (Array.isArray(block.content)) for (const item of block.content) if (item.type === 'image') parts.push({ inlineData: { mimeType: item.source.media_type, data: item.source.data } });
                    break;
                }
                case 'thinking': case 'redacted_thinking': break;
            }
        }
        if (parts.length) contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts });
    }
    return contents;
}
export function prepareGeminiRequest(config: LLMProvider, system: string, messages: MessageParam[], tools: ToolDefinition[]): GeminiRequest {
    const scope = geminiScope(config);
    const input = estimatePromptTokens(system, messages, tools) + messages.reduce((n, m) => n + estimateGeminiStateTokens(m.providerState, scope), 0);
    const window = typeof config.contextWindow === 'number' && Number.isFinite(config.contextWindow) && config.contextWindow > 0 ? config.contextWindow : getModelContextWindow(config.model);
    const remaining = Math.floor(window - input - 1024);
    if (remaining < 1) throw new Error('Gemini context budget exhausted. Shorten or condense the conversation.');
    const resolved = resolveOutputBudget(config.model, config.maxTokens);
    const maxOutputTokens = Math.max(1, Math.min(remaining, Math.floor(resolved.maxTokens)));
    const generationConfig: GeminiRequest['generationConfig'] = { maxOutputTokens };
    if (config.temperature !== undefined && Number.isFinite(config.temperature)) generationConfig.temperature = Math.min(2, Math.max(0, config.temperature));
    const effort = config.reasoningEffort;
    if (effort && getModelEffortLevels(config.model, 'gemini-oauth').includes(effort)) generationConfig.thinkingConfig = { thinkingLevel: effort.toUpperCase() };
    else if (/^gemini-2\.5-/.test(config.model) && config.thinkingEnabled !== undefined) {
        const pro = /-pro(?:-|$)/.test(config.model);
        if (config.thinkingEnabled) {
            const minimum = pro ? 128 : 0;
            const limit = pro ? 32768 : 24576;
            if (maxOutputTokens <= minimum) throw new Error('Gemini output budget leaves no room for thinking and an answer.');
            const requested = config.thinkingBudgetTokens ?? 1024;
            generationConfig.thinkingConfig = { thinkingBudget: Math.max(minimum, Math.min(limit, maxOutputTokens - 1, Number.isFinite(requested) ? Math.floor(requested) : 1024)), includeThoughts: true };
        } else if (!pro) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    return {
        contents: convertMessages(messages, scope),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map(tool => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.input_schema })) }] } : {}),
        generationConfig,
    };
}
async function* sseEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncIterable<unknown> {
    const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    const onAbort = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        while (true) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            const result = await reader.read();
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            buffer += result.done ? decoder.decode() : decoder.decode(result.value, { stream: true });
            let match: RegExpExecArray | null;
            while ((match = /\r?\n\r?\n/.exec(buffer))) {
                const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
                if (event.length > MAX_EVENT_CHARS) throw new Error('Gemini SSE event exceeds the size limit.');
                const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
                if (data && data !== '[DONE]') {
                    try { yield JSON.parse(data) as unknown; } catch (error) {
                        if (error instanceof SyntaxError) throw new Error('Gemini returned invalid SSE JSON.');
                        throw error;
                    }
                }
            }
            if (buffer.length > MAX_EVENT_CHARS) throw new Error('Gemini SSE event exceeds the size limit.');
            if (result.done) { if (buffer.trim()) throw new Error('Gemini SSE stream ended with an incomplete event.'); break; }
        }
    } finally {
        signal?.removeEventListener('abort', onAbort);
        await reader.cancel().catch(() => {}); reader.releaseLock();
    }
}
function count(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000_000 ? Math.floor(value) : 0; }
export async function* parseGeminiStream(body: ReadableStream<Uint8Array>, scope: string, signal?: AbortSignal): ApiStream {
    const parts: GeminiPart[] = []; const toolIds: string[] = []; const tools: Array<Extract<ApiStreamChunk, { type: 'tool_use' | 'tool_error' }>> = [];
    let finish = ''; let size = 0; let usage: Record<string, unknown> | undefined;
    for await (const raw of sseEvents(body, signal)) {
        const event = object(raw); if (!event) throw new Error('Gemini returned an invalid stream event.');
        if (event.error) throw new Error('Gemini returned a stream error. Retry the request.');
        if (object(event.promptFeedback)?.blockReason) throw new Error('Gemini blocked the request under its safety policy.');
        usage = object(event.usageMetadata) ?? usage;
        if (!Array.isArray(event.candidates)) continue;
        const candidate = object(event.candidates[0]); if (!candidate) continue;
        if (typeof candidate.finishReason === 'string') finish = candidate.finishReason;
        const rawParts = object(candidate.content)?.parts;
        if (!Array.isArray(rawParts)) continue;
        for (const rawPart of rawParts) {
            const part = readPart(rawPart);
            if (!part) {
                const call = object(object(rawPart)?.functionCall);
                if (call && typeof call.name === 'string') {
                    tools.push({ type: 'tool_error', id: crypto.randomUUID(), name: call.name, error: truncatedToolInputError(call.name, 'Invalid native function arguments') }); continue;
                }
                throw new Error('Gemini returned an unsupported or invalid content part.');
            }
            size += JSON.stringify(part).length;
            if (size > MAX_STATE_CHARS || parts.length >= MAX_PARTS) throw new Error('Gemini response exceeds the continuation size limit.');
            parts.push(part);
            if (part.text) yield part.thought ? { type: 'thinking', text: part.text } : { type: 'text', text: part.text };
            if (part.functionCall) {
                const id = part.functionCall.id || crypto.randomUUID();
                if (toolIds.includes(id)) throw new Error('Gemini returned duplicate function call IDs.');
                toolIds.push(id);
                tools.push({ type: 'tool_use', id, name: part.functionCall.name, input: part.functionCall.args });
            }
        }
    }
    if (!finish) throw new Error('Gemini stream ended without a finish reason (incomplete response).');
    if (usage) {
        const prompt = count(usage.promptTokenCount); const cached = Math.min(prompt, count(usage.cachedContentTokenCount));
        yield { type: 'usage', inputTokens: prompt - cached, outputTokens: count(usage.candidatesTokenCount) + count(usage.thoughtsTokenCount), cacheReadTokens: cached };
    }
    if (!['STOP', 'MAX_TOKENS'].includes(finish)) throw new Error(`Gemini generation stopped (${finish}).`);
    if (finish === 'MAX_TOKENS') {
        for (const call of tools) yield { type: 'tool_error', id: call.id, name: call.name, error: truncatedToolInputError(call.name, 'Output limit reached', true) };
        if (!tools.length) throw new Error('Gemini output token limit reached. Increase the output budget.');
        return;
    }
    if (tools.some(call => call.type === 'tool_error')) { for (const call of tools) yield call.type === 'tool_error' ? call : { type: 'tool_error', id: call.id, name: call.name, error: 'Retry this batch: another Gemini function call was malformed.' }; return; }
    yield { type: 'provider_state', state: { format: 'gemini-parts-v1', scope, value: { parts, toolIds } } };
    for (const call of tools) yield call;
}
