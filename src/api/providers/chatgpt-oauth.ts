/**
 * ChatGptOAuthProvider -- LLM provider for ChatGPT OAuth (Subscription) backend.
 *
 * Talks to https://chatgpt.com/backend-api/codex/responses, which is the
 * Responses API endpoint that codex-cli uses. We do NOT route via the OpenAI
 * SDK because the SDK posts to /chat/completions, which the Codex backend
 * does not expose.
 *
 * Schema as observed 2026-04-28 against codex-rs/core/src/client.rs.
 *
 * @see ADR-088 (Provider Architecture)
 * @see FEATURE-021-002 (Codex Responses-API Handler)
 */

import OpenAI from 'openai';
import type { LLMProvider } from '../../types/settings';
import type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam, ModelInfo } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { ChatGptOAuthService } from '../../core/auth/ChatGptOAuthService';

void OpenAI; // retained: Errors instance kept for compatibility but not actively used

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';

/**
 * First-party originator + user-agent. The Codex backend rejects everything
 * outside this allowlist with 403 + "no active subscription" regardless of
 * the user's actual plan. Verified against pi-mono#1828 and codex-rs.
 */
const CODEX_HEADERS: Record<string, string> = {
    'OpenAI-Beta': 'responses=experimental',
    'Originator': 'codex_cli_rs',
    'User-Agent': 'codex_cli_rs/0.21.0 (Obsidian Plugin) Obsilo',
    'Accept': 'text/event-stream',
};

/** Known Codex models. Hardcoded per ADR-088. */
const KNOWN_MODELS: Record<string, ModelInfo> = {
    'gpt-5.5':          { contextWindow: 256_000, supportsTools: true, supportsStreaming: true },
    'gpt-5':            { contextWindow: 256_000, supportsTools: true, supportsStreaming: true },
    'gpt-5-codex':      { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'gpt-5-codex-mini': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
};

const DEFAULT_MODEL_INFO: ModelInfo = {
    contextWindow: 200_000,
    supportsTools: true,
    supportsStreaming: true,
};

// ---------------------------------------------------------------------------
// Responses API types (observed 2026-04-28)
// ---------------------------------------------------------------------------

interface ResponsesInputMessage {
    type: 'message';
    role: 'user' | 'assistant' | 'system';
    content: ResponsesContentBlock[];
}

interface ResponsesFunctionCallOutput {
    type: 'function_call_output';
    call_id: string;
    output: string;
}

interface ResponsesFunctionCall {
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: string;
}

type ResponsesInputItem = ResponsesInputMessage | ResponsesFunctionCallOutput | ResponsesFunctionCall;

type ResponsesContentBlock =
    | { type: 'input_text'; text: string }
    | { type: 'output_text'; text: string };

interface ResponsesTool {
    type: 'function';
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

interface ResponsesRequestBody {
    model: string;
    instructions?: string;
    input: ResponsesInputItem[];
    tools?: ResponsesTool[];
    stream: true;
    parallel_tool_calls?: boolean;
    store?: boolean;
    [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ChatGptOAuthProvider implements ApiHandler {
    private config: LLMProvider;
    private auth: ChatGptOAuthService;

    constructor(config: LLMProvider) {
        this.config = config;
        this.auth = ChatGptOAuthService.getInstance();
    }

    getModel(): { id: string; info: ModelInfo } {
        const info = KNOWN_MODELS[this.config.model] ?? DEFAULT_MODEL_INFO;
        return { id: this.config.model, info };
    }

    async *createMessage(
        systemPrompt: string,
        messages: MessageParam[],
        tools: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): ApiStream {
        const body: ResponsesRequestBody = {
            model: this.config.model,
            instructions: systemPrompt,
            input: this.convertMessages(messages),
            stream: true,
            store: false,
        };
        if (tools.length > 0) {
            body.tools = this.convertTools(tools);
            body.parallel_tool_calls = false;
        }
        if (this.config.temperature !== undefined) {
            body.temperature = Math.min(this.config.temperature, 2.0);
        }

        let response = await this.streamRequest(body, abortSignal);
        if (response.status === 401) {
            this.auth.invalidateAccessToken();
            response = await this.streamRequest(body, abortSignal);
        }
        if (response.status >= 400) {
            const detail = await readBody(response);
            throw this.enhanceError(response.status, detail);
        }

        yield* parseSseEvents(response, abortSignal);
    }

    async classifyText(prompt: string, abortSignal?: AbortSignal): Promise<string> {
        const body: ResponsesRequestBody = {
            model: this.config.model,
            input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] }],
            stream: true,
            store: false,
        };
        const response = await this.streamRequest(body, abortSignal);
        if (response.status >= 400) {
            const detail = await readBody(response);
            throw this.enhanceError(response.status, detail);
        }
        const buffer: string[] = [];
        for await (const chunk of parseSseEvents(response, abortSignal)) {
            if (chunk.type === 'text') buffer.push(chunk.text);
        }
        return buffer.join('').trim();
    }

    // -----------------------------------------------------------------------
    // HTTP layer (Node https module to bypass Electron's CORS on chatgpt.com)
    // -----------------------------------------------------------------------

    private async streamRequest(body: ResponsesRequestBody, signal?: AbortSignal): Promise<NodeStreamResponse> {
        const token = await this.auth.getValidAccessToken();
        const accountId = this.auth.getAccountId();
        const headers: Record<string, string> = {
            ...CODEX_HEADERS,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        if (accountId) {
            headers['chatgpt-account-id'] = accountId;
            headers['ChatGPT-Account-ID'] = accountId;
        }

        return openStream(CODEX_RESPONSES_URL, JSON.stringify(body), headers, signal);
    }

    // -----------------------------------------------------------------------
    // Format conversion
    // -----------------------------------------------------------------------

    private convertMessages(messages: MessageParam[]): ResponsesInputItem[] {
        const result: ResponsesInputItem[] = [];

        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                result.push({
                    type: 'message',
                    role: msg.role,
                    content: [
                        msg.role === 'assistant'
                            ? { type: 'output_text', text: msg.content }
                            : { type: 'input_text', text: msg.content },
                    ],
                });
                continue;
            }

            const blocks = msg.content;

            if (msg.role === 'assistant') {
                const textParts = blocks
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map((b) => b.text)
                    .join('');
                if (textParts) {
                    result.push({
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: textParts }],
                    });
                }
                for (const block of blocks) {
                    if (block.type === 'tool_use') {
                        result.push({
                            type: 'function_call',
                            call_id: block.id,
                            name: block.name,
                            arguments: JSON.stringify(block.input),
                        });
                    }
                }
            } else {
                const textParts: string[] = [];
                for (const block of blocks) {
                    if (block.type === 'text') {
                        textParts.push(block.text);
                    } else if (block.type === 'tool_result') {
                        const text = typeof block.content === 'string'
                            ? block.content
                            : block.content
                                .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                                .map((b) => b.text)
                                .join('\n');
                        result.push({
                            type: 'function_call_output',
                            call_id: block.tool_use_id,
                            output: text,
                        });
                    }
                }
                if (textParts.length > 0) {
                    result.push({
                        type: 'message',
                        role: 'user',
                        content: [{ type: 'input_text', text: textParts.join('\n') }],
                    });
                }
            }
        }

        return result;
    }

    private convertTools(tools: ToolDefinition[]): ResponsesTool[] {
        return tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
        }));
    }

    // -----------------------------------------------------------------------
    // Error mapping
    // -----------------------------------------------------------------------

    private enhanceError(status: number, detail: string): Error {
        const trimmed = detail.length > 400 ? detail.slice(0, 400) + '...' : detail;
        switch (status) {
            case 401:
                return new Error('ChatGPT authentication failed. Please sign in again in Provider settings.');
            case 403:
                return new Error(`ChatGPT subscription check failed (403). The Codex backend rejected the request. Detail: ${trimmed}`);
            case 404:
                return new Error(`ChatGPT endpoint not found (404). The model "${this.config.model}" may not be available on your plan, or the backend path changed. Detail: ${trimmed}`);
            case 429:
                return new Error('ChatGPT rate limit reached. Please wait a moment and retry.');
            case 400:
                return new Error(`ChatGPT request rejected (400). Schema may have drifted. Detail: ${trimmed}`);
            default:
                return new Error(`ChatGPT API error (${status}): ${trimmed}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Node https streaming helpers
// ---------------------------------------------------------------------------

interface NodeStreamResponse {
    status: number;
    headers: Record<string, string>;
    stream: AsyncIterable<Buffer>;
}

function openStream(url: string, body: string, headers: Record<string, string>, signal?: AbortSignal): Promise<NodeStreamResponse> {
    const parsed = new URL(url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js https module is the only Electron-renderer transport that bypasses CORS for chatgpt.com (same pattern as openai.ts gemini path)
    const https = require('https') as typeof import('https');

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(body).toString(),
            },
        }, (res) => {
            const responseHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
                if (v) responseHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
            }

            const stream = (async function* () {
                for await (const chunk of res) {
                    yield chunk as Buffer;
                }
            })();

            resolve({
                status: res.statusCode ?? 500,
                headers: responseHeaders,
                stream,
            });
        });

        req.on('error', reject);

        if (signal) {
            const onAbort = () => { req.destroy(); reject(new DOMException('Aborted', 'AbortError')); };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
        }

        req.write(body);
        req.end();
    });
}

async function readBody(response: NodeStreamResponse): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of response.stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// SSE parser for Responses API stream
//
// Event names observed 2026-04-28 in codex-cli/codex-rs:
//   response.created
//   response.output_item.added            (new function_call or message)
//   response.output_text.delta            (text delta)
//   response.function_call_arguments.delta (tool args delta)
//   response.output_item.done             (item finished)
//   response.completed                    (terminal, includes usage)
//   response.failed                       (terminal, with error)
// ---------------------------------------------------------------------------

interface ToolCallState {
    callId: string;
    name: string;
    argsJson: string;
}

async function* parseSseEvents(response: NodeStreamResponse, _signal?: AbortSignal): ApiStream {
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls = new Map<string, ToolCallState>();

    for await (const chunk of response.stream) {
        buffer += decoder.decode(chunk, { stream: true });

        let eventEnd: number;
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, eventEnd);
            buffer = buffer.slice(eventEnd + 2);
            const parsed = parseSseBlock(rawEvent);
            if (!parsed) continue;
            yield* dispatchEvent(parsed.eventName, parsed.data, toolCalls);
        }
    }

    // Flush any remaining tool calls (shouldn't happen if response.completed arrived)
    for (const tc of toolCalls.values()) {
        yield* finalizeToolCall(tc);
    }
}

function parseSseBlock(block: string): { eventName: string; data: string } | null {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
        if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    }
    if (dataLines.length === 0) return null;
    return { eventName, data: dataLines.join('\n') };
}

function* dispatchEvent(
    eventName: string,
    data: string,
    toolCalls: Map<string, ToolCallState>,
): Generator<ApiStreamChunk> {
    if (data === '[DONE]') return;

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
        return;
    }

    // type field on the event payload, fallback to eventName
    const type = (parsed.type as string | undefined) ?? eventName;

    if (type === 'response.output_text.delta') {
        const delta = parsed.delta;
        if (typeof delta === 'string' && delta.length > 0) {
            yield { type: 'text', text: delta };
        }
        return;
    }

    if (type === 'response.output_item.added') {
        const item = parsed.item as Record<string, unknown> | undefined;
        if (item && item.type === 'function_call') {
            const callId = (item.call_id as string | undefined) ?? (item.id as string);
            const name = (item.name as string | undefined) ?? '';
            toolCalls.set(callId, { callId, name, argsJson: '' });
        }
        return;
    }

    if (type === 'response.function_call_arguments.delta') {
        const callId = (parsed.item_id as string | undefined) ?? (parsed.call_id as string | undefined);
        const delta = parsed.delta as string | undefined;
        if (callId && delta) {
            const state = toolCalls.get(callId);
            if (state) state.argsJson += delta;
            else toolCalls.set(callId, { callId, name: '', argsJson: delta });
        }
        return;
    }

    if (type === 'response.output_item.done') {
        const item = parsed.item as Record<string, unknown> | undefined;
        if (item && item.type === 'function_call') {
            const callId = (item.call_id as string | undefined) ?? (item.id as string);
            const state = toolCalls.get(callId);
            if (state) {
                if (!state.name && typeof item.name === 'string') state.name = item.name;
                if (!state.argsJson && typeof item.arguments === 'string') state.argsJson = item.arguments;
                yield* finalizeToolCall(state);
                toolCalls.delete(callId);
            }
        }
        return;
    }

    if (type === 'response.completed') {
        const responseObj = parsed.response as Record<string, unknown> | undefined;
        const usage = responseObj?.usage as Record<string, unknown> | undefined;
        if (usage) {
            const input = num(usage.input_tokens) ?? num(usage.prompt_tokens) ?? 0;
            const output = num(usage.output_tokens) ?? num(usage.completion_tokens) ?? 0;
            yield { type: 'usage', inputTokens: input, outputTokens: output };
        }
        // Drain any tool calls that didn't get an explicit done event
        for (const tc of toolCalls.values()) yield* finalizeToolCall(tc);
        toolCalls.clear();
        return;
    }

    if (type === 'response.failed') {
        const responseObj = parsed.response as Record<string, unknown> | undefined;
        const error = responseObj?.error as Record<string, unknown> | undefined;
        const message = (error?.message as string | undefined) ?? 'response.failed';
        throw new Error(`ChatGPT response failed: ${message}`);
    }

    // Other events (response.created, .in_progress, .output_item.added for messages, etc.)
    // are ignored. Add handlers as the schema reveals them.
}

function* finalizeToolCall(state: ToolCallState): Generator<ApiStreamChunk> {
    if (!state.callId || !state.name) {
        console.warn('[ChatGptOAuth] Skipping incomplete tool_call', state);
        return;
    }
    let input: Record<string, unknown> = {};
    try {
        input = state.argsJson.trim() ? JSON.parse(state.argsJson) as Record<string, unknown> : {};
    } catch (e) {
        // BUG-032: tool_error so AgentTask records the failure and breaks the loop.
        yield {
            type: 'tool_error',
            id: state.callId,
            name: state.name,
            error: `Tool input parse error: ${(e as Error).message}. The tool arguments were truncated or malformed -- try a smaller payload or split the work into multiple tool calls.`,
        };
        return;
    }
    yield { type: 'tool_use', id: state.callId, name: state.name, input };
}

function num(v: unknown): number | undefined {
    return typeof v === 'number' ? v : undefined;
}
