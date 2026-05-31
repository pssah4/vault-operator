/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * KiloGatewayProvider — LLM Provider für Kilo Gateway API
 *
 * Nutzt den OpenAI SDK mit einem custom fetch-Wrapper, der Kilo Auth-Header
 * injiziert. Die Inferenzseite ist OpenAI-kompatibel, Auth und Session sind
 * proprietär und leben im KiloAuthService.
 *
 * @see ADR-040 (Provider Architecture)
 * @see ADR-041 (Auth and Session Architecture)
 * @see FEATURE-1302 (Gateway Chat Provider)
 */

import OpenAI from 'openai';
import type { LLMProvider } from '../../types/settings';
import type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam, ModelInfo } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { KiloAuthService } from '../../core/security/KiloAuthService';
import { resolveOutputBudget, estimatePromptTokens, modelSupportsTemperature } from '../../types/model-registry';
import { logCacheStat } from '../logCacheStat';
import { normalizeDeltaContent } from './utils/openAiContent';
import { flushToolCallAccumulators, type ToolCallAccumulator } from './utils/toolCallFlush';

// ---------------------------------------------------------------------------
// OpenAI REST API types (subset — mirrors github-copilot.ts)
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

// ToolCallAccumulator moved to utils/toolCallFlush.ts (FIX-13-02-01); see import above.

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const KILO_GATEWAY_BASE = 'https://api.kilo.ai/api/gateway';

export class KiloGatewayProvider implements ApiHandler {
    private config: LLMProvider;
    private client: OpenAI;
    private authService: KiloAuthService;

    constructor(config: LLMProvider) {
        this.config = config;
        this.authService = KiloAuthService.getInstance();

        this.client = new OpenAI({
            apiKey: 'kilo', // Placeholder — echte Auth über custom fetch
            baseURL: KILO_GATEWAY_BASE,
            dangerouslyAllowBrowser: true,
            fetch: this.authService.getKiloFetch(),
        });
    }

    getModel(): { id: string; info: ModelInfo } {
        return {
            id: this.config.model,
            info: {
                contextWindow: 128_000,
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

        // Temperature: o-series weglassen, default-only Modelle (Opus 4.7,
        // GPT-5.x; FIX-04-03-02) ebenfalls weglassen, sonst Config oder 0.2.
        const isOSeries = /^o[1-9]/.test(this.config.model);
        const supportsTemperature = modelSupportsTemperature(this.config.model);
        const temperature: number | undefined = (isOSeries || !supportsTemperature)
            ? undefined
            : (this.config.temperature ?? 0.2);

        const { maxTokens: effectiveMaxTokens } = resolveOutputBudget(
            this.config.model,
            this.config.maxTokens,
            { estimatedInputTokens: estimatePromptTokens(systemPrompt, messages, tools) },
        );
        const requestBody: Record<string, unknown> = {
            model: this.config.model,
            messages: openAiMessages,
            tools: openAiTools,
            temperature: temperature !== undefined ? Math.min(temperature, 2.0) : undefined,
            max_tokens: effectiveMaxTokens,
            stream: true,
            stream_options: { include_usage: true },
        };

        if (openAiTools && openAiTools.length > 0) {
            requestBody.tool_choice = 'auto';
        }

        const createParams = requestBody as unknown as OpenAI.ChatCompletionCreateParamsStreaming;

        let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
        try {
            stream = await this.client.chat.completions.create(createParams, {
                signal: abortSignal ?? null,
            });
        } catch (e) {
            throw this.enhanceError(e);
        }

        const toolCallAccumulators = new Map<number, ToolCallAccumulator>();
        // FIX-18-04-03: see openai.ts comment.
        let lastFinishReason: string | null | undefined = null;

        for await (const chunk of stream) {
            if (chunk.usage) {
                const cachedIn = (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } })
                    .prompt_tokens_details?.cached_tokens ?? 0;
                logCacheStat({
                    provider: 'kilo-gateway',
                    model: this.config.model,
                    caching: 'auto',
                    nonCachedInputTokens: Math.max(0, chunk.usage.prompt_tokens - cachedIn),
                    cacheReadTokens: cachedIn,
                    outputTokens: chunk.usage.completion_tokens,
                });
                yield {
                    type: 'usage',
                    // IMP-18-01-02: prompt_tokens is the total; report non-cached as
                    // inputTokens + cached separately so cost bills the cached prefix cheap.
                    inputTokens: Math.max(0, chunk.usage.prompt_tokens - cachedIn),
                    outputTokens: chunk.usage.completion_tokens,
                    cacheReadTokens: cachedIn > 0 ? cachedIn : undefined,
                } satisfies ApiStreamChunk;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // FIX-13-02-02: delta.content can arrive either as a plain
            // string or as an Anthropic-style array of content blocks
            // when the gateway proxies to a Claude tier. Strict-string
            // typecheck used to drop the array form and the user saw
            // empty output despite a billed completion.
            const text = normalizeDeltaContent(delta?.content);
            if (text) {
                yield { type: 'text', text } satisfies ApiStreamChunk;
            }

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

            // FIX-18-04-03: track finish_reason for the post-loop fallback.
            if (choice.finish_reason) {
                lastFinishReason = choice.finish_reason;
            }

            // When the turn ends with tool_calls, flush via the shared helper
            // so kilo-gateway, openai and copilot stay in lockstep.
            if (choice.finish_reason === 'tool_calls') {
                yield* flushToolCallAccumulators(toolCallAccumulators, {
                    wasMaxTokens: false,
                    providerLabel: 'Kilo',
                });
            }
        }

        // FIX-13-02-01 / BUG-013-pattern: Kilo Gateway routes to varied
        // upstream models (Groq, OpenRouter shapes, Claude tiers); any of them
        // can stream tool_calls deltas and finish with finish_reason="stop"
        // or "length" instead of "tool_calls". Without this post-loop flush
        // the accumulated tool calls were silently discarded -- the exact bug
        // openai.ts and github-copilot.ts already guard against.
        // FIX-18-04-03 wires the wasMaxTokens flag.
        if (toolCallAccumulators.size > 0) {
            yield* flushToolCallAccumulators(toolCallAccumulators, {
                wasMaxTokens: lastFinishReason === 'length',
                providerLabel: 'Kilo',
            });
        }
    }

    /**
     * Schneller non-streaming Klassifizierungsaufruf.
     * Wird für Skill-Matching LLM-Fallback genutzt.
     */
    async classifyText(prompt: string, abortSignal?: AbortSignal): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: this.config.model,
            max_tokens: 50,
            messages: [{ role: 'user', content: prompt }],
        }, {
            signal: abortSignal ?? undefined,
        });

        return response.choices?.[0]?.message?.content?.trim() ?? '';
    }

    // ---------------------------------------------------------------------------
    // Format conversion: Anthropic → OpenAI (mirrors github-copilot.ts)
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

            const blocks = msg.content;

            if (msg.role === 'assistant') {
                // FIX-04-03-07: thinking blocks (DeepSeek-style reasoning) are
                // dropped here -- the Kilo Gateway does not echo reasoning_content
                // back to its upstream models.
                const textParts = blocks
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map((b) => b.text)
                    .join('');

                const toolUseParts = blocks.filter(
                    (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
                        b.type === 'tool_use',
                );

                if (toolUseParts.length > 0) {
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
                // FIX-04-03-09: image blocks used to be silently dropped.
                // See openai.ts for the same fix; kept symmetric so the
                // three OpenAI-shape providers behave identically.
                const hasImage = blocks.some((b) => b.type === 'image');
                if (hasImage) {
                    const contentArr: OpenAIContentPart[] = [];
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

    // ---------------------------------------------------------------------------
    // Error handling
    // ---------------------------------------------------------------------------

    private enhanceError(e: unknown): Error {
        if (!(e instanceof OpenAI.APIError)) {
            return e instanceof Error ? e : new Error(String(e));
        }
        switch (e.status) {
            case 401:
                return new Error('Kilo session expired. Please sign in again in the settings.');
            case 403:
                return new Error('Access denied. Check your Kilo subscription and model access.');
            case 429:
                return new Error('Kilo rate limit exceeded. Please wait a moment and try again.');
            case 400:
                return new Error(`Kilo request error: ${e.message}`);
            default:
                return new Error(`Kilo Gateway API error (${e.status}): ${e.message}`);
        }
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
