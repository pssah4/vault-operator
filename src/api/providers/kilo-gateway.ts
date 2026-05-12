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
import { truncatedToolInputError } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { KiloAuthService } from '../../core/security/KiloAuthService';
import { resolveOutputBudget, estimatePromptTokens } from '../../types/model-registry';
import { logCacheStat } from '../logCacheStat';

// ---------------------------------------------------------------------------
// OpenAI REST API types (subset — mirrors github-copilot.ts)
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

interface ToolCallAccumulator {
    id: string;
    name: string;
    argumentsJson: string;
}

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

        // Temperature: o-series weglassen, sonst Config oder 0.2-Default
        const isOSeries = /^o[1-9]/.test(this.config.model);
        const temperature: number | undefined = isOSeries
            ? undefined
            : (this.config.temperature ?? 0.2);

        const { maxTokens: effectiveMaxTokens } = resolveOutputBudget(
            this.config.model,
            this.config.maxTokens,
            { estimatedInputTokens: estimatePromptTokens(systemPrompt, messages) },
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
                    inputTokens: chunk.usage.prompt_tokens,
                    outputTokens: chunk.usage.completion_tokens,
                } satisfies ApiStreamChunk;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            const text = typeof delta?.content === 'string' ? delta.content : null;
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

            if (choice.finish_reason === 'tool_calls') {
                for (const [, acc] of toolCallAccumulators) {
                    let input: Record<string, unknown> = {};
                    try {
                        input = acc.argumentsJson.trim() ? JSON.parse(acc.argumentsJson) : {};
                    } catch (e) {
                        // BUG-032: tool_error increments AgentTask mistake counter.
                        yield {
                            type: 'tool_error',
                            id: acc.id,
                            name: acc.name,
                            error: truncatedToolInputError(acc.name, (e as Error).message),
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
                toolCallAccumulators.clear();
            }
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
                for (const block of blocks) {
                    if (block.type === 'text') {
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
