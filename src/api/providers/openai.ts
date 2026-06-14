/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
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
import { getModelContextWindow, resolveOutputBudget, estimatePromptTokens, modelSupportsTemperature, getModelEffortLevels } from '../../types/model-registry';
import { logCacheStat } from '../logCacheStat';
import { flushToolCallAccumulators, type ToolCallAccumulator } from './utils/toolCallFlush';

// ---------------------------------------------------------------------------
// OpenAI REST API types (subset we need)
// ---------------------------------------------------------------------------

// FIX-04-03-09: content may be a content-part array on user messages to
// carry multimodal input ({type:'image_url'|'text'}).
type OpenAIContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null | OpenAIContentPart[];
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string;
    // FIX-04-03-07: DeepSeek deepseek-reasoner requires the original
    // reasoning_content to be echoed back on assistant messages that contain
    // tool_calls, otherwise a follow-up request returns 400.
    reasoning_content?: string;
}

// FIX-04-03-07: only OpenAI-compatible backends that *can* consume a passed-back
// reasoning_content field get one on the wire. Excluded:
//   - openai/azure: official OpenAI does not expect the field; future strict
//     validation could 400.
//   - openrouter: has its own server-side reasoning passthrough via the
//     top-level `reasoning: {...}` request param (Claude extended thinking).
//     Echoing reasoning_content too could interfere.
//   - gemini: uses different reasoning conventions.
// If users with OpenRouter -> DeepSeek-reasoner report the same 400 we can
// extend this after a regression test against OpenRouter + Claude ET.
const REASONING_PASSBACK_PROVIDER_TYPES = new Set<string>(['custom', 'ollama', 'lmstudio']);
const MAX_REASONING_CONTENT_CHARS = 50_000;

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

// ToolCallAccumulator moved to utils/toolCallFlush.ts (FIX-13-02-01); see import above.

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Node.js fetch wrapper — bypasses CORS in Electron renderer (ADR-064)
// ---------------------------------------------------------------------------

/**
 * Creates a fetch-compatible function using Node.js http(s) module.
 * Used for providers where Electron's CORS enforcement blocks window.fetch
 * (e.g. Google's generativelanguage.googleapis.com, chatgpt.com/backend-api,
 * and FIX-04-03-03 custom OpenAI-compatible servers like opencode go on
 * localhost).
 *
 * Picks the http or https module based on the URL protocol so plain-HTTP
 * local dev servers also work, not just HTTPS endpoints.
 */
export function createNodeFetch(): typeof window.fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';

        // Node.js http(s) only available via dynamic require in Electron renderer
        const httpModule = isHttps
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for Electron renderer
            ? (require('https') as typeof import('https'))
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for Electron renderer
            : (require('http') as unknown as typeof import('https'));

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

            const defaultPort = isHttps ? 443 : 80;
            const req = httpModule.request({
                hostname: parsed.hostname,
                port: parsed.port || defaultPort,
                path: parsed.pathname + parsed.search,
                method: init?.method ?? 'GET',
                headers,
            }, (res: IncomingMessage) => {
                // AUDIT-023 L-1: clear the connection-level idle timeout once
                // the server actually starts responding; the stream itself is
                // driven by res.on('data'/'end'/'error').
                req.setTimeout(0);
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

            // AUDIT-023 L-1: bound idle-time on the socket so a server that
            // accepts the connection and then never writes does not hang
            // forever. 120 s matches the upstream chat-loop tolerance; the
            // AbortSignal path below still cancels earlier on user action.
            req.setTimeout(120_000, () => {
                req.destroy(new Error('Request timed out after 120s with no response'));
                reject(new Error('Request timed out after 120s with no response'));
            });

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
            // Bypass Electron's CORS enforcement for providers whose endpoints
            // do not set the right Access-Control-Allow-Origin headers. Obsidian
            // renderer enforces CORS on window.fetch; Node.js http(s) is not
            // subject to CORS.
            // - 'gemini' (always blocked by Google):
            // - 'custom' (FIX-04-03-03): generic OpenAI-compatible servers like
            //   opencode go on localhost rarely send CORS headers.
            // - 'ollama' / 'lmstudio' on localhost: same class of local server,
            //   safer to bypass CORS than to rely on the server config.
            ...((['gemini', 'custom', 'ollama', 'lmstudio'] as const).includes(config.type as never)
                ? { fetch: createNodeFetch() }
                : {}),
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

        // Temperature handling — four cases:
        // 1. o-series (o1, o3, o4-mini, etc.) enforce temperature=1 API-side -> omit entirely
        // 2. FIX-04-03-02: GPT-5.x and other default-only models reject any
        //    explicit temperature with a 400 -> omit entirely (detected via
        //    shared helper modelSupportsTemperature so the same rule covers
        //    OpenRouter aliases and gateway names too).
        // 3. Explicitly configured temperature -> always respect it
        // 4. No explicit config -> use 0.2 default for deterministic agent behavior,
        //    EXCEPT for Azure where deployment names are opaque (may hide o-series models)
        const isOSeries = /^o[1-9]/.test(this.config.model);
        const supportsTemperature = modelSupportsTemperature(this.config.model);
        let temperature: number | undefined;
        if (isOSeries || !supportsTemperature) {
            temperature = undefined;
        } else if (this.config.temperature !== undefined) {
            temperature = this.config.temperature;
        } else if (this.config.type !== 'azure') {
            temperature = 0.2;
        }

        // OpenRouter extended thinking: when enabled for Anthropic models via OpenRouter,
        // force temperature to 1 and pass reasoning parameter. The guard must
        // not override models that reject temperature outright (Opus 4.7+,
        // Fable, Mythos via supportsTemperature) or pin it API-side (o-series),
        // otherwise sending temperature: 1 re-introduces the 400 the
        // supportsTemperature gate above just prevented.
        const openRouterThinking = this.config.type === 'openrouter'
            && (this.config.thinkingEnabled ?? false);
        if (openRouterThinking && supportsTemperature && !isOSeries) {
            temperature = 1;
        }
        // Clamp the output budget to the model's real ceiling and (for thinking)
        // add the reasoning budget on top of the visible-output budget. budgetTokens
        // is only used in the reasoning passthrough below, which is gated on
        // openRouterThinking, so the 0 returned when thinking is off is harmless.
        const { maxTokens: effectiveMaxTokens, thinkingBudgetTokens: budgetTokens } = resolveOutputBudget(
            this.config.model,
            this.config.maxTokens,
            {
                enabled: openRouterThinking,
                budgetTokens: this.config.thinkingBudgetTokens,
                estimatedInputTokens: estimatePromptTokens(systemPrompt, messages, tools),
            },
        );

        // Per-conversation reasoning effort. Only honoured for effort-capable
        // (model, provider) pairs (gpt-5 / o-series on openai/copilot/openrouter,
        // Claude-via-openrouter). 'auto'/undefined sends nothing, so the request
        // stays byte-identical to today. The wire field differs by provider:
        //   - OpenRouter normalizes to reasoning: { effort } (works for both its
        //     Claude and non-Claude reasoning models, and merges with the
        //     existing reasoning.max_tokens passthrough).
        //   - openai / github-copilot use the chat-completions reasoning_effort.
        // Defensive per-family validity: getModelEffortLevels returns the exact
        // native set for this (model, provider) pair (OpenRouter Claude -> low..
        // max, GPT -> minimal..high), so a cross-family level (a Claude-only
        // xhigh/max accidentally set on a GPT model, or a GPT-only minimal on an
        // OpenRouter Claude) is dropped, not sent.
        const effort = this.config.reasoningEffort;
        const effortLevels = getModelEffortLevels(this.config.model, this.config.type);
        const effortValid = effort !== undefined && effortLevels.includes(effort);
        // OpenRouter reasoning object: merge the existing extended-thinking
        // max_tokens passthrough (if any) with the effort field (if any).
        const openRouterReasoning: Record<string, unknown> = {};
        if (openRouterThinking) openRouterReasoning.max_tokens = budgetTokens;
        if (effortValid && this.config.type === 'openrouter') openRouterReasoning.effort = effort;

        // Build request body
        const requestBody: OpenAI.ChatCompletionCreateParamsStreaming = {
            model: this.config.type !== 'azure' ? this.config.model : this.config.model,
            messages: openAiMessages as OpenAI.ChatCompletionMessageParam[],
            tools: openAiTools,
            temperature: temperature !== undefined ? Math.min(temperature, 2.0) : undefined,
            // OpenAI and Azure require max_completion_tokens (max_tokens deprecated / rejected by newer models)
            // Other providers (ollama, lmstudio, custom) still need max_tokens
            max_tokens: (this.config.type !== 'azure' && this.config.type !== 'openai')
                ? effectiveMaxTokens
                : undefined,
            stream: true,
            stream_options: (this.config.type === 'openai' || this.config.type === 'openrouter')
                ? { include_usage: true }
                : undefined,
            // OpenRouter reasoning object: extended-thinking max_tokens passthrough
            // and/or the native effort field, whichever is active.
            ...(Object.keys(openRouterReasoning).length > 0
                ? { reasoning: openRouterReasoning } as Record<string, unknown>
                : {}),
            // openai / github-copilot reasoning effort (chat-completions field).
            ...(effortValid && this.config.type !== 'openrouter'
                ? { reasoning_effort: effort } as Record<string, unknown>
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
            (requestBody as unknown as Record<string, unknown>).max_completion_tokens = effectiveMaxTokens;
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
        // FIX-18-04-03: track the most recent finish_reason so the post-loop
        // tool_call flush can distinguish a "length"-cutoff from a "stop"
        // and emit the right recovery message.
        let lastFinishReason: string | null | undefined = null;

        for await (const chunk of stream) {
            // Usage (sent at end with stream_options)
            if (chunk.usage) {
                const cachedIn = (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } })
                    .prompt_tokens_details?.cached_tokens ?? 0;
                logCacheStat({
                    provider: 'openai',
                    model: this.config.model,
                    caching: 'auto', // OpenAI-compatible APIs cache automatically, no toggle
                    nonCachedInputTokens: Math.max(0, chunk.usage.prompt_tokens - cachedIn),
                    cacheReadTokens: cachedIn,
                    outputTokens: chunk.usage.completion_tokens,
                });
                yield {
                    type: 'usage',
                    // IMP-18-01-02: prompt_tokens is the TOTAL (cached + non-cached).
                    // Report the non-cached part as inputTokens and the cached part
                    // separately, matching the Anthropic convention, so the cost calc
                    // bills the cached prefix at the cache-read rate instead of full price.
                    inputTokens: Math.max(0, chunk.usage.prompt_tokens - cachedIn),
                    outputTokens: chunk.usage.completion_tokens,
                    cacheReadTokens: cachedIn > 0 ? cachedIn : undefined,
                } satisfies ApiStreamChunk;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // OpenRouter reasoning content (extended thinking passthrough) +
            // DeepSeek deepseek-reasoner. requiresPassback tells AgentTask to
            // persist these chunks into a ThinkingBlock on the assistant
            // message so convertMessages can echo them back on the next request
            // (FIX-04-03-07). The wire-side allow-list still gates whether the
            // echo actually happens.
            const reasoning = (delta as Record<string, unknown>)?.reasoning_content
                ?? (delta as Record<string, unknown>)?.reasoning;
            if (typeof reasoning === 'string' && reasoning) {
                yield { type: 'thinking', text: reasoning, requiresPassback: true } satisfies ApiStreamChunk;
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

            // Track the most recent finish_reason so the post-loop fallback
            // flush (FIX-18-04-03) can decide whether a JSON-parse failure
            // came from a max-tokens cutoff vs a normal "stop".
            if (choice.finish_reason) {
                lastFinishReason = choice.finish_reason;
            }

            // When the turn ends with tool_calls, yield complete tool_use chunks.
            // wasMaxTokens=false here -- a finish_reason of tool_calls means
            // the arguments were intended to be complete.
            if (choice.finish_reason === 'tool_calls') {
                yield* flushToolCallAccumulators(toolCallAccumulators, {
                    wasMaxTokens: false,
                    providerLabel: 'OpenAi',
                });
            }
        }

        // BUG-013 / FEATURE-0409: Some OpenAI-compatible providers (OpenRouter
        // gpt-oss-120b, Groq, certain local backends) stream tool_calls deltas
        // but emit finish_reason="stop" or "length" instead of "tool_calls".
        // Without this post-loop flush the accumulated tool calls are silently
        // dropped and the agent treats the response as text only.
        // If finish_reason==="tool_calls" already flushed the map, this is a no-op.
        // FIX-18-04-03: wasMaxTokens flag wired so a JSON parse failure on a
        // length-truncated payload surfaces as the "split write_file + append_to_file"
        // hint instead of the generic recovery message.
        if (toolCallAccumulators.size > 0) {
            yield* flushToolCallAccumulators(toolCallAccumulators, {
                wasMaxTokens: lastFinishReason === 'length',
                providerLabel: 'OpenAi',
            });
        }
    }

    // ---------------------------------------------------------------------------
    // Format conversion: Anthropic → OpenAI
    // ---------------------------------------------------------------------------

    private convertMessages(systemPrompt: string, messages: MessageParam[]): OpenAIMessage[] {
        const result: OpenAIMessage[] = [
            { role: 'system', content: systemPrompt },
        ];

        // FIX-04-03-07: DeepSeek deepseek-reasoner requires reasoning_content on
        // the assistant message whose tool_calls are being resolved. Multi-round
        // convention says strip reasoning from older rounds. So: find the LAST
        // assistant message that has a tool_use; only THAT one gets the echo.
        // Older assistant ThinkingBlocks (and ThinkingBlocks on any message
        // without tool_use) are silently dropped from the wire — caps the
        // per-request overhead at one turn of reasoning regardless of session
        // length, preventing token-cost explosion.
        const emitReasoningPassback = REASONING_PASSBACK_PROVIDER_TYPES.has(this.config.type);
        let lastAssistantWithToolUseIdx = -1;
        if (emitReasoningPassback) {
            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (m.role !== 'assistant' || typeof m.content === 'string') continue;
                if (m.content.some((b) => b.type === 'tool_use')) {
                    lastAssistantWithToolUseIdx = i;
                    break;
                }
            }
        }

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (typeof msg.content === 'string') {
                result.push({ role: msg.role, content: msg.content });
                continue;
            }

            // Array of ContentBlock
            const blocks = msg.content;

            if (msg.role === 'assistant') {
                // Assistant messages may contain text + tool_use blocks.
                // Thinking blocks are filtered out of textParts here (they never
                // belong in visible content) and live in reasoning_content
                // instead, gated on the allow-list + last-assistant rule above.
                const textParts = blocks
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map((b) => b.text)
                    .join('');

                const toolUseParts = blocks.filter(
                    (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
                        b.type === 'tool_use',
                );

                let reasoningContent: string | undefined;
                if (emitReasoningPassback && i === lastAssistantWithToolUseIdx) {
                    const joined = blocks
                        .filter((b): b is { type: 'thinking'; text: string } => b.type === 'thinking')
                        .map((b) => b.text)
                        .join('');
                    if (joined.length > 0) {
                        reasoningContent = joined.length > MAX_REASONING_CONTENT_CHARS
                            ? `${joined.slice(0, MAX_REASONING_CONTENT_CHARS)}\n[reasoning truncated]`
                            : joined;
                    }
                }

                if (toolUseParts.length > 0) {
                    // Message with tool calls
                    const assistantMsg: OpenAIMessage = {
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
                    };
                    if (reasoningContent !== undefined) {
                        assistantMsg.reasoning_content = reasoningContent;
                    }
                    result.push(assistantMsg);
                } else {
                    result.push({ role: 'assistant', content: textParts });
                }
            } else {
                // User messages may contain text + image + tool_result blocks.
                // Thinking blocks cannot legally appear on user role; ignored
                // if they do. FIX-04-03-09: image blocks used to be silently
                // dropped (text/tool_result-only branches) so gpt-4o /
                // Gemini-via-OpenAI / OpenRouter vision models received text
                // only and answered "I don't see an image". They are now
                // emitted in the canonical content-array format.
                const hasImage = blocks.some((b) => b.type === 'image');
                if (hasImage) {
                    const contentArr: Array<
                        | { type: 'text'; text: string }
                        | { type: 'image_url'; image_url: { url: string } }
                    > = [];
                    for (const block of blocks) {
                        if (block.type === 'text') {
                            contentArr.push({ type: 'text', text: block.text });
                        } else if (block.type === 'image') {
                            contentArr.push({
                                type: 'image_url',
                                image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
                            });
                        }
                    }
                    if (contentArr.length > 0) {
                        result.push({ role: 'user', content: contentArr });
                    }
                }
                for (const block of blocks) {
                    if (!hasImage && block.type === 'text') {
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

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
