/**
 * OpenAiProvider - LLM provider for OpenAI-compatible APIs
 *
 * Adapted from Kilo Code's src/api/providers/openai.ts + base-provider.ts
 *
 * Covers: OpenAI, Mistral, Ollama (port 11434), custom OpenAI-compatible endpoints.
 */

import OpenAI from 'openai';
import type { LLMProvider } from '../../types/settings';
import type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam, ModelInfo } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import type { IncomingMessage } from 'http';
import { getModelContextWindow } from '../../types/model-registry';

// ---------------------------------------------------------------------------
// OpenAI REST API types (subset we need)
// ---------------------------------------------------------------------------

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
}

interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

// ---------------------------------------------------------------------------
// Tool call accumulator for streaming
// ---------------------------------------------------------------------------

interface ToolCallAccumulator {
    id: string;
    name: string;
    argumentsJson: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Node.js fetch wrapper — bypasses CORS in Electron renderer (ADR-064)
// ---------------------------------------------------------------------------

/**
 * Creates a fetch-compatible function using Node.js https module.
 * Used for providers where Electron's CORS enforcement blocks globalThis.fetch
 * (e.g. Google's generativelanguage.googleapis.com, chatgpt.com/backend-api).
 */
export function createNodeFetch(): typeof globalThis.fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(url);

        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js https only available via dynamic require in Electron renderer
        const https = require('https') as typeof import('https');

        return new Promise<Response>((resolve, reject) => {
            const headers: Record<string, string> = {};
            if (init?.headers) {
                if (init.headers instanceof Headers) {
                    init.headers.forEach((v, k) => { headers[k] = v; });
                } else if (Array.isArray(init.headers)) {
                    for (const [k, v] of init.headers) headers[k] = v;
                } else {
                    Object.assign(headers, init.headers);
                }
            }

            const req = https.request({
                hostname: parsed.hostname,
                port: parsed.port || 443,
                path: parsed.pathname + parsed.search,
                method: init?.method ?? 'GET',
                headers,
            }, (res: IncomingMessage) => {
                // Convert Node.js IncomingMessage to a Web ReadableStream
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        res.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                        res.on('end', () => controller.close());
                        res.on('error', (err) => controller.error(err));
                    },
                    cancel() { res.destroy(); },
                });

                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
                }

                resolve(new Response(body, {
                    status: res.statusCode ?? 500,
                    statusText: res.statusMessage ?? '',
                    headers: responseHeaders,
                }));
            });

            req.on('error', reject);

            if (init?.signal) {
                init.signal.addEventListener('abort', () => { req.destroy(); reject(new DOMException('Aborted', 'AbortError')); });
            }

            if (init?.body) {
                req.write(typeof init.body === 'string' ? init.body : init.body);
            }
            req.end();
        });
    };
}

const DEFAULT_BASE_URLS: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
    ollama: 'http://localhost:11434/v1',
    lmstudio: 'http://localhost:1234/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    custom: 'https://api.openai.com/v1',
};

export class OpenAiProvider implements ApiHandler {
    private config: LLMProvider;
    private client: OpenAI;

    constructor(config: LLMProvider) {
        this.config = config;

        let baseURL = config.baseUrl ?? DEFAULT_BASE_URLS[config.type] ?? DEFAULT_BASE_URLS.openai;
        if (config.type === 'ollama' && !baseURL.match(/\/v\d/)) {
            baseURL = baseURL.replace(/\/+$/, '') + '/v1';
        }

        const defaultHeaders: Record<string, string> = {};
        if (config.type === 'openrouter') {
            defaultHeaders['HTTP-Referer'] = 'https://obsidian.md';
            defaultHeaders['X-Title'] = 'Vault Operator';
        }
        if (config.type === 'azure' && config.apiKey) {
            defaultHeaders['api-key'] = config.apiKey;
        }

        this.client = new OpenAI({
            apiKey: config.type === 'azure' ? '' : (config.apiKey || ''),
            baseURL,
            dangerouslyAllowBrowser: true,
            defaultHeaders,
            // Gemini: use Node.js https to bypass CORS restrictions in Electron renderer.
            // Obsidian's Electron renderer enforces CORS on globalThis.fetch, but Node.js
            // https module (available via nodeIntegration) is not subject to CORS.
            ...(config.type === 'gemini' ? { fetch: createNodeFetch() } : {}),
        });
    }

    getModel(): { id: string; info: ModelInfo } {
        // Get context window from central registry
        const contextWindow = getModelContextWindow(this.config.model);

        return {
            id: this.config.model,
            info: {
                contextWindow,
                supportsTools: true,
                supportsStreaming: true,
            },
        };
    }

    async *createMessage(
        systemPrompt: string,
        messages: MessageParam[],
        tools: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): ApiStream {
        const openAiMessages = this.convertMessages(systemPrompt, messages);
        const openAiTools = tools.length > 0 ? this.convertTools(tools) : undefined;

        // Temperature handling — three cases:
        // 1. o-series (o1, o3, o4-mini, etc.) enforce temperature=1 API-side -> omit entirely
        // 2. Explicitly configured temperature -> always respect it
        // 3. No explicit config -> use 0.2 default for deterministic agent behavior,
        //    EXCEPT for Azure where deployment names are opaque (may hide o-series models)
        const isOSeries = /^o[1-9]/.test(this.config.model);
        let temperature: number | undefined;
        if (isOSeries) {
            temperature = undefined;
        } else if (this.config.temperature !== undefined) {
            temperature = this.config.temperature;
        } else if (this.config.type !== 'azure') {
            temperature = 0.2;
        }

        // OpenRouter extended thinking: when enabled for Anthropic models via OpenRouter,
        // force temperature to 1 and pass reasoning parameter
        const openRouterThinking = this.config.type === 'openrouter'
            && (this.config.thinkingEnabled ?? false);
        const budgetTokens = this.config.thinkingBudgetTokens ?? 10000;
        if (openRouterThinking) {
            temperature = 1;
        }

        // Build request body
        const requestBody: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: this.config.type !== 'azure' ? this.config.model : this.config.model,
            messages: openAiMessages as OpenAI.ChatCompletionMessageParam[],
            tools: openAiTools,
            temperature: temperature !== undefined ? Math.min(temperature, 2.0) : undefined,
            // OpenAI and Azure require max_completion_tokens (max_tokens deprecated / rejected by newer models)
            // Other providers (ollama, lmstudio, custom) still need max_tokens
            max_tokens: (this.config.type !== 'azure' && this.config.type !== 'openai')
                ? (openRouterThinking
                    ? Math.max(this.config.maxTokens ?? 16384, budgetTokens)
                    : (this.config.maxTokens ?? 8192))
                : undefined,
            stream: true,
            stream_options: (this.config.type === 'openai' || this.config.type === 'openrouter')
                ? { include_usage: true }
                : undefined,
            // OpenRouter reasoning passthrough for Anthropic models
            ...(openRouterThinking
                ? { reasoning: { max_tokens: budgetTokens } } as Record<string, unknown>
                : {}),
            // OpenRouter: disable automatic model fallback to prevent silent model switches.
            // Without this, OpenRouter can route to a completely different model (e.g. Gemini)
            // when the configured model is rate-limited or under high load.
            ...(this.config.type === 'openrouter'
                ? { provider: { allow_fallbacks: false } } as Record<string, unknown>
                : {}),
        };

        // OpenAI and Azure use max_completion_tokens (newer models reject max_tokens with 400)
        if (this.config.type === 'openai' || this.config.type === 'azure') {
            const maxCompletionTokens = openRouterThinking
                ? Math.max(this.config.maxTokens ?? 16384, budgetTokens)
                : (this.config.maxTokens ?? 8192);
            (requestBody as unknown as Record<string, unknown>).max_completion_tokens = maxCompletionTokens;
        }

        if (openAiTools && openAiTools.length > 0) {
            requestBody.tool_choice = 'auto';
        }

        // Azure deployment-based routing: use a custom path
        const requestOptions: OpenAI.RequestOptions = { signal: abortSignal ?? null };
        if (this.config.type === 'azure') {
            const apiVersion = this.config.apiVersion ?? '2024-10-21';
            requestOptions.path = `/deployments/${this.config.model}/chat/completions?api-version=${apiVersion}`;
        }

        const stream = await this.client.chat.completions.create(requestBody, requestOptions);

        // Accumulate tool calls across chunks (keyed by index)
        const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

        for await (const chunk of stream) {
            // Usage (sent at end with stream_options)
            if (chunk.usage) {
                yield {
                    type: 'usage',
                    inputTokens: chunk.usage.prompt_tokens,
                    outputTokens: chunk.usage.completion_tokens,
                } satisfies ApiStreamChunk;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // OpenRouter reasoning content (extended thinking passthrough)
            const reasoning = (delta as Record<string, unknown>)?.reasoning_content
                ?? (delta as Record<string, unknown>)?.reasoning;
            if (typeof reasoning === 'string' && reasoning) {
                yield { type: 'thinking', text: reasoning } satisfies ApiStreamChunk;
            }

            // Text content
            if (delta?.content) {
                yield { type: 'text', text: delta.content } satisfies ApiStreamChunk;
            }

            // Tool call deltas -- accumulate until finish_reason = 'tool_calls'
            if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCallAccumulators.has(idx)) {
                        toolCallAccumulators.set(idx, { id: '', name: '', argumentsJson: '' });
                    }
                    const acc = toolCallAccumulators.get(idx)!;
                    if (tc.id) acc.id = tc.id;
                    if (tc.function?.name) acc.name += tc.function.name;
                    if (tc.function?.arguments) acc.argumentsJson += tc.function.arguments;
                }
            }

            // When the turn ends with tool_calls, yield complete tool_use chunks
            if (choice.finish_reason === 'tool_calls') {
                yield* this.flushToolCallAccumulators(toolCallAccumulators);
            }
        }

        // BUG-013 / FEATURE-0409: Some OpenAI-compatible providers (OpenRouter
        // gpt-oss-120b, Groq, certain local backends) stream tool_calls deltas
        // but emit finish_reason="stop" or "length" instead of "tool_calls".
        // Without this post-loop flush the accumulated tool calls are silently
        // dropped and the agent treats the response as text only.
        // If finish_reason==="tool_calls" already flushed the map, this is a no-op.
        if (toolCallAccumulators.size > 0) {
            yield* this.flushToolCallAccumulators(toolCallAccumulators);
        }
    }

    /**
     * Yield tool_use chunks for every accumulated tool call, then clear the map.
     * Extracted so the streaming loop can flush both mid-stream (on
     * finish_reason==="tool_calls") and post-stream (BUG-013 fallback).
     */
    private *flushToolCallAccumulators(
        accumulators: Map<number, ToolCallAccumulator>,
    ): Generator<ApiStreamChunk> {
        for (const [, acc] of accumulators) {
            // Skip incomplete accumulators (no id or no name -- defensive).
            if (!acc.id || !acc.name) {
                console.warn(
                    `[OpenAi] Skipping incomplete tool_call accumulator: id="${acc.id}", name="${acc.name}"`,
                );
                continue;
            }
            let input: Record<string, unknown> = {};
            try {
                input = acc.argumentsJson.trim() ? JSON.parse(acc.argumentsJson) : {};
            } catch (e) {
                // BUG-032: Emit tool_error so AgentTask increments the mistake
                // counter and breaks after consecutiveMistakeLimit. Text chunks
                // hide the failure from the loop, causing infinite retries.
                yield {
                    type: 'tool_error',
                    id: acc.id,
                    name: acc.name,
                    error: `Tool input parse error: ${(e as Error).message}. The tool arguments were truncated or malformed -- try a smaller payload (e.g. write_file or append_to_file with a shorter content block) or split the work into multiple tool calls.`,
                } satisfies ApiStreamChunk;
                continue;
            }
            yield {
                type: 'tool_use',
                id: acc.id,
                name: acc.name,
                input,
            } satisfies ApiStreamChunk;
        }
        accumulators.clear();
    }

    // ---------------------------------------------------------------------------
    // Format conversion: Anthropic → OpenAI
    // ---------------------------------------------------------------------------

    private convertMessages(systemPrompt: string, messages: MessageParam[]): OpenAIMessage[] {
        const result: OpenAIMessage[] = [
            { role: 'system', content: systemPrompt },
        ];

        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                result.push({ role: msg.role, content: msg.content });
                continue;
            }

            // Array of ContentBlock
            const blocks = msg.content;

            if (msg.role === 'assistant') {
                // Assistant messages may contain text + tool_use blocks
                const textParts = blocks
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map((b) => b.text)
                    .join('');

                const toolUseParts = blocks.filter(
                    (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
                        b.type === 'tool_use',
                );

                if (toolUseParts.length > 0) {
                    // Message with tool calls
                    result.push({
                        role: 'assistant',
                        content: textParts || null,
                        tool_calls: toolUseParts.map((b) => ({
                            id: b.id,
                            type: 'function',
                            function: {
                                name: b.name,
                                arguments: JSON.stringify(b.input),
                            },
                        })),
                    });
                } else {
                    result.push({ role: 'assistant', content: textParts });
                }
            } else {
                // User messages may contain text + tool_result blocks
                for (const block of blocks) {
                    if (block.type === 'text') {
                        result.push({ role: 'user', content: block.text });
                    } else if (block.type === 'tool_result') {
                        // Tool results become separate 'tool' role messages in OpenAI format.
                        // OpenAI only supports string content — extract text from multimodal arrays.
                        const textContent = typeof block.content === 'string'
                            ? block.content
                            : block.content
                                .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                                .map((b) => b.text)
                                .join('\n');
                        result.push({
                            role: 'tool',
                            tool_call_id: block.tool_use_id,
                            content: textContent,
                        });
                    }
                }
            }
        }

        return result;
    }

    private convertTools(tools: ToolDefinition[]): OpenAITool[] {
        return tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));
    }

    /**
     * Quick non-streaming classification call (~100 input, ~10 output tokens).
     * Used by skill matching LLM-fallback when regex finds no match.
     */
    async classifyText(prompt: string, abortSignal?: AbortSignal): Promise<string> {
        const classifyBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
            model: this.config.model,
            max_tokens: (this.config.type !== 'openai' && this.config.type !== 'azure') ? 50 : undefined,
            messages: [{ role: 'user', content: prompt }],
        };
        if (this.config.type === 'openai' || this.config.type === 'azure') {
            (classifyBody as unknown as Record<string, unknown>).max_completion_tokens = 50;
        }
        const response = await this.client.chat.completions.create(classifyBody, {
            signal: abortSignal ?? undefined,
        });

        return response.choices?.[0]?.message?.content?.trim() ?? '';
    }
}
