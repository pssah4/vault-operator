/**
 * AnthropicProvider - LLM provider for Anthropic Claude
 *
 * Adapted from Kilo Code's src/api/providers/anthropic.ts
 *
 * Key difference from Kilo Code: We accumulate tool_use input_json_delta chunks
 * internally and yield complete tool_use objects (not partial streaming).
 * This simplifies the conversation loop significantly.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from '../../types/settings';
import type { ApiHandler, ApiStream, ApiStreamChunk, ContentBlock, MessageParam, ModelInfo } from '../types';
import { truncatedToolInputError } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { getModelContextWindow, resolveOutputBudget, estimatePromptTokens } from '../../types/model-registry';
import { logCacheStat } from '../logCacheStat';

export class AnthropicProvider implements ApiHandler {
    private client: Anthropic;
    private config: LLMProvider;

    constructor(config: LLMProvider) {
        this.config = config;
        this.client = new Anthropic({
            apiKey: config.apiKey ?? '',
            baseURL: config.baseUrl,
            dangerouslyAllowBrowser: true, // Required for Obsidian (Electron)
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
        // Convert our internal MessageParam[] to Anthropic's format
        const anthropicMessages = this.convertMessages(messages);

        // Convert ToolDefinition[] to Anthropic's tool format
        const anthropicTools: Anthropic.Tool[] = tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
        }));

        // Prompt caching: mark the last user message with cache_control
        if (this.config.promptCachingEnabled && anthropicMessages.length > 0) {
            for (let i = anthropicMessages.length - 1; i >= 0; i--) {
                if (anthropicMessages[i].role === 'user') {
                    const lastUser = anthropicMessages[i];
                    if (typeof lastUser.content === 'string') {
                        anthropicMessages[i] = {
                            role: 'user',
                            content: [{
                                type: 'text' as const,
                                text: lastUser.content,
                                cache_control: { type: 'ephemeral' as const },
                            }],
                        };
                    } else if (Array.isArray(lastUser.content) && lastUser.content.length > 0) {
                        const blocks = [...lastUser.content] as Anthropic.Messages.ContentBlockParam[];
                        const lastBlock = blocks[blocks.length - 1];
                        if ('type' in lastBlock && lastBlock.type === 'text') {
                            blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' as const } };
                            anthropicMessages[i] = { role: 'user', content: blocks };
                        }
                    }
                    break;
                }
            }
        }

        // Build system prompt: use array form with cache_control when caching is enabled
        const systemParam: string | Anthropic.Messages.TextBlockParam[] = this.config.promptCachingEnabled
            ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
            : systemPrompt;

        // Extended thinking: when enabled, temperature MUST be 1.
        // resolveOutputBudget adds the thinking budget on top of the visible-output
        // budget and clamps both to the model's real output ceiling — prevents a
        // near-empty answer (truncated tool calls) and prevents 400s from an
        // over-eager Settings value.
        const thinkingEnabled = this.config.thinkingEnabled ?? false;
        const { maxTokens: effectiveMaxTokens, thinkingBudgetTokens: budgetTokens } = resolveOutputBudget(
            this.config.model,
            this.config.maxTokens,
            {
                enabled: thinkingEnabled,
                budgetTokens: this.config.thinkingBudgetTokens,
                estimatedInputTokens: estimatePromptTokens(systemPrompt, messages),
            },
        );
        const effectiveTemperature = thinkingEnabled
            ? 1
            : Math.min(this.config.temperature ?? 0.2, 1.0);

        // Create streaming request (pass abort signal for cancellation support)
        const stream = this.client.messages.stream(
            {
                model: this.config.model,
                max_tokens: effectiveMaxTokens,
                temperature: effectiveTemperature,
                system: systemParam,
                messages: anthropicMessages,
                tools: anthropicTools.length > 0 ? anthropicTools : undefined,
                tool_choice: anthropicTools.length > 0 ? { type: 'auto' } : undefined,
                ...(thinkingEnabled
                    ? { thinking: { type: 'enabled' as const, budget_tokens: budgetTokens } }
                    : {}),
            },
            { signal: abortSignal },
        );

        // Process stream - accumulate tool input JSON, yield complete tool_use
        // Adapted from Kilo Code's approach in anthropic.ts
        const toolAccumulator = new Map<
            number,
            { id: string; name: string; inputJson: string }
        >();
        // Track thinking blocks by index — yield streaming text then flush on stop
        const thinkingAccumulator = new Map<number, { text: string }>();

        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;
        // stop_reason arrives in message_delta, AFTER every content_block_stop, so
        // parse failures are held and resolved once we know whether the response
        // was cut off by max_tokens.
        let stopReason: string | null = null;
        const failedToolParses: Array<{ id: string; name: string; rawError: string }> = [];

        for await (const event of stream) {
            if (event.type === 'message_start') {
                inputTokens = event.message.usage.input_tokens;
                cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
                cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
            }

            if (event.type === 'message_delta') {
                outputTokens = event.usage.output_tokens;
                if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
            }

            if (event.type === 'content_block_start') {
                if (event.content_block.type === 'tool_use') {
                    toolAccumulator.set(event.index, {
                        id: event.content_block.id,
                        name: event.content_block.name,
                        inputJson: '',
                    });
                } else if (event.content_block.type === 'thinking') {
                    thinkingAccumulator.set(event.index, { text: '' });
                }
            }

            if (event.type === 'content_block_delta') {
                if (event.delta.type === 'text_delta') {
                    yield { type: 'text', text: event.delta.text } satisfies ApiStreamChunk;
                }

                if (event.delta.type === 'input_json_delta') {
                    const tool = toolAccumulator.get(event.index);
                    if (tool) tool.inputJson += event.delta.partial_json;
                }

                // Anthropic extended thinking delta
                if (event.delta.type === 'thinking_delta') {
                    const thinking = thinkingAccumulator.get(event.index);
                    if (thinking) {
                        const chunk = event.delta.thinking;
                        thinking.text += chunk;
                        yield { type: 'thinking', text: chunk } satisfies ApiStreamChunk;
                    }
                }
            }

            if (event.type === 'content_block_stop') {
                thinkingAccumulator.delete(event.index);

                // If this was a tool_use block, yield the complete tool call
                const tool = toolAccumulator.get(event.index);
                if (tool) {
                    let parsedInput: Record<string, unknown> | undefined;
                    try {
                        parsedInput = tool.inputJson ? JSON.parse(tool.inputJson) : {};
                    } catch (e) {
                        // Hold it — the actionable message depends on the stop_reason,
                        // which only arrives in the upcoming message_delta event.
                        failedToolParses.push({ id: tool.id, name: tool.name, rawError: (e as Error).message });
                    }
                    if (parsedInput !== undefined) {
                        yield {
                            type: 'tool_use',
                            id: tool.id,
                            name: tool.name,
                            input: parsedInput,
                        } satisfies ApiStreamChunk;
                    }
                    toolAccumulator.delete(event.index);
                }
            }
        }

        // A tool still in the accumulator means the stream ended without a
        // content_block_stop for it (abrupt cutoff) — treat as a parse failure.
        for (const tool of toolAccumulator.values()) {
            failedToolParses.push({ id: tool.id, name: tool.name, rawError: 'the stream ended before the tool call completed' });
        }
        toolAccumulator.clear();

        const wasMaxTokens = stopReason === 'max_tokens';
        for (const ft of failedToolParses) {
            yield {
                type: 'tool_error',
                id: ft.id,
                name: ft.name,
                error: truncatedToolInputError(ft.name, ft.rawError, wasMaxTokens),
            } satisfies ApiStreamChunk;
        }

        // Yield token usage at the end
        if (inputTokens > 0 || outputTokens > 0) {
            logCacheStat({
                provider: 'anthropic',
                model: this.config.model,
                caching: this.config.promptCachingEnabled ? 'on' : 'OFF',
                nonCachedInputTokens: inputTokens, // message_start.usage.input_tokens excludes cached
                cacheReadTokens,
                cacheCreationTokens,
                outputTokens,
            });
            yield {
                type: 'usage',
                inputTokens,
                outputTokens,
                cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
                cacheCreationTokens: cacheCreationTokens > 0 ? cacheCreationTokens : undefined,
            } satisfies ApiStreamChunk;
        }
    }

    /**
     * Convert our internal MessageParam[] to Anthropic's MessageParam[]
     * Adapted from Kilo Code's message conversion logic
     */
    private convertMessages(messages: MessageParam[]): Anthropic.MessageParam[] {
        return messages.map((msg) => {
            if (typeof msg.content === 'string') {
                return { role: msg.role, content: msg.content };
            }

            // Let TypeScript infer the correct union type from the SDK
            const content = msg.content.map((block) => {
                if (block.type === 'text') {
                    return { type: 'text' as const, text: block.text };
                }

                if (block.type === 'tool_use') {
                    return {
                        type: 'tool_use' as const,
                        id: block.id,
                        name: block.name,
                        input: block.input,
                    };
                }

                if (block.type === 'image') {
                    return {
                        type: 'image' as const,
                        source: {
                            type: 'base64' as const,
                            media_type: block.source.media_type,
                            data: block.source.data,
                        },
                    };
                }

                if (block.type === 'tool_result') {
                    return {
                        type: 'tool_result' as const,
                        tool_use_id: block.tool_use_id,
                        content: block.content,
                        is_error: block.is_error,
                    };
                }

                throw new Error(`Unknown content block type: ${(block as ContentBlock).type}`);
            });

            return { role: msg.role, content };
        });
    }

    /**
     * Quick non-streaming classification call (~100 input, ~10 output tokens).
     * Used by skill matching LLM-fallback when regex finds no match.
     */
    async classifyText(prompt: string, abortSignal?: AbortSignal): Promise<string> {
        const response = await this.client.messages.create({
            model: this.config.model,
            max_tokens: 50,
            messages: [{ role: 'user', content: prompt }],
        }, {
            signal: abortSignal ?? undefined,
        });

        // Extract text from the response
        for (const block of response.content) {
            if (block.type === 'text') return block.text.trim();
        }
        return '';
    }
}
