/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * GitHubCopilotProvider - LLM provider for GitHub Copilot API
 *
 * Uses the OpenAI SDK with a custom fetch wrapper that injects Copilot
 * authentication headers. Content normalization handles Claude-via-Copilot
 * streaming quirks (array delta.content, missing delta.role).
 *
 * @see ADR-036 (Streaming Strategy — OpenAI SDK + custom fetch)
 * @see ADR-037 (Provider Architecture — separate provider + auth service)
 * @see ADR-039 (Content Normalization)
 * @see FEATURE-1202 (Chat Completions Provider)
 */

import OpenAI from 'openai';
import type { LLMProvider } from '../../types/settings';
import type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam, ModelInfo } from '../types';
import { truncatedToolInputError } from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { GitHubCopilotAuthService } from '../../core/security/GitHubCopilotAuthService';
import { resolveOutputBudget, estimatePromptTokens } from '../../types/model-registry';
import { logCacheStat } from '../logCacheStat';

// ---------------------------------------------------------------------------
// OpenAI REST API types (subset — mirrors openai.ts)
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
// Known models — fallback when model is not in the global registry.
// Kept in the provider to avoid ID collisions with direct OpenAI/Anthropic models.
// ---------------------------------------------------------------------------

const KNOWN_MODELS: Record<string, ModelInfo> = {
    'claude-sonnet-4': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'claude-sonnet-4-5-20250929': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'claude-3.5-sonnet': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'gpt-5.4': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'gpt-4o': { contextWindow: 128_000, supportsTools: true, supportsStreaming: true },
    'gpt-4o-mini': { contextWindow: 128_000, supportsTools: true, supportsStreaming: true },
    'gpt-4.1': { contextWindow: 128_000, supportsTools: true, supportsStreaming: true },
    'o3-mini': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'o4-mini': { contextWindow: 200_000, supportsTools: true, supportsStreaming: true },
    'gemini-2.0-flash': { contextWindow: 1_048_576, supportsTools: true, supportsStreaming: true },
};

const DEFAULT_MODEL_INFO: ModelInfo = {
    contextWindow: 128_000,
    supportsTools: true,
    supportsStreaming: true,
};

// ---------------------------------------------------------------------------
// Content normalization (ADR-039)
// ---------------------------------------------------------------------------

/**
 * Normalize streaming delta.content for Copilot API responses.
 *
 * Claude via Copilot sends `delta.content` as an array of content blocks:
 *   `[{ type: "text", text: "Hello" }]`
 * instead of a plain string. Other models (GPT) send a normal string.
 *
 * Returns null if there is no content (e.g. tool_call-only delta).
 */
function normalizeDeltaContent(content: unknown): string | null {
    if (content == null) return null;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const text = content
            .filter((c): c is { type: string; text: string } =>
                c != null && typeof c === 'object' && 'text' in c && typeof c.text === 'string')
            .map((c) => c.text)
            .join('');
        return text || null;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class GitHubCopilotProvider implements ApiHandler {
    private config: LLMProvider;
    private client: OpenAI;
    private authService: GitHubCopilotAuthService;

    constructor(config: LLMProvider) {
        this.config = config;
        this.authService = GitHubCopilotAuthService.getInstance();

        this.client = new OpenAI({
            apiKey: 'copilot', // Placeholder — real auth injected via custom fetch
            baseURL: 'https://api.githubcopilot.com',
            dangerouslyAllowBrowser: true,
            fetch: this.authService.getCopilotFetch(),
        });
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
        const openAiMessages = this.convertMessages(systemPrompt, messages);
        const openAiTools = tools.length > 0 ? this.convertTools(tools) : undefined;

        // Extended thinking for Claude models via Copilot
        const isClaude = /^claude/i.test(this.config.model);
        const thinkingEnabled = isClaude && (this.config.thinkingEnabled ?? false);
        const { maxTokens: effectiveMaxTokens, thinkingBudgetTokens: budgetTokens } = resolveOutputBudget(
            this.config.model,
            this.config.maxTokens,
            {
                enabled: thinkingEnabled,
                budgetTokens: this.config.thinkingBudgetTokens,
                estimatedInputTokens: estimatePromptTokens(systemPrompt, messages),
            },
        );

        // Temperature: o-series omit, thinking forces 1, otherwise respect config or use 0.2 default
        const isOSeries = /^o[1-9]/.test(this.config.model);
        let temperature: number | undefined;
        if (isOSeries) {
            temperature = undefined;
        } else if (thinkingEnabled) {
            temperature = 1;
        } else if (this.config.temperature !== undefined) {
            temperature = this.config.temperature;
        } else {
            temperature = 0.2;
        }

        // BUG-015 / FEATURE-1206: GitHub Copilot routes through models that
        // require max_completion_tokens instead of max_tokens (gpt-5,
        // gpt-5-codex, o3, o4-mini). The Copilot Gateway accepts
        // max_completion_tokens uniformly across the catalog, so we send only
        // the new parameter for all models.
        const requestBody: Record<string, unknown> = {
            model: this.config.model,
            messages: openAiMessages,
            tools: openAiTools,
            temperature: temperature !== undefined ? Math.min(temperature, 2.0) : undefined,
            max_completion_tokens: effectiveMaxTokens,
            stream: true,
            stream_options: { include_usage: true },
            // Extended thinking: passed as top-level body param for Claude-via-Copilot
            ...(thinkingEnabled
                ? { thinking: { type: 'enabled', budget_tokens: budgetTokens } }
                : {}),
        };

        if (openAiTools && openAiTools.length > 0) {
            requestBody.tool_choice = 'auto';
        }

        // Cast to SDK type — extra fields (like `thinking`) are passed through by the API
        const createParams = requestBody as unknown as OpenAI.ChatCompletionCreateParamsStreaming;

        let stream: AsyncIterable<OpenAI.ChatCompletionChunk>;
        try {
            stream = await this.client.chat.completions.create(createParams, {
                signal: abortSignal ?? null,
            });
        } catch (e) {
            // 401 retry: invalidate token, refresh, retry once
            if (this.is401Error(e)) {
                this.authService.invalidateCopilotToken();
                stream = await this.client.chat.completions.create(createParams, {
                    signal: abortSignal ?? null,
                });
            } else {
                throw this.enhanceError(e);
            }
        }

        // Accumulate tool calls across chunks (keyed by index)
        const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

        for await (const chunk of stream) {
            // Usage (sent at end with stream_options)
            if (chunk.usage) {
                const cachedIn = (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } })
                    .prompt_tokens_details?.cached_tokens ?? 0;
                logCacheStat({
                    provider: 'github-copilot',
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

            // Text content — with normalization (ADR-039)
            const text = normalizeDeltaContent((delta as Record<string, unknown>)?.content);
            if (text) {
                yield { type: 'text', text } satisfies ApiStreamChunk;
            }

            // Tool call deltas — accumulate until finish_reason = 'tool_calls'
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

        // BUG-013 / FEATURE-0409: Some Copilot-routed models emit
        // finish_reason="stop" or "length" while still streaming tool_calls
        // deltas. Without this post-loop flush the accumulated tool calls are
        // silently dropped. If the in-loop branch already cleared the map, this
        // is a no-op.
        if (toolCallAccumulators.size > 0) {
            yield* this.flushToolCallAccumulators(toolCallAccumulators);
        }
    }

    /**
     * Yield tool_use chunks for every accumulated tool call, then clear the map.
     * Mirrors the helper in OpenAiProvider so both providers share the same
     * flush semantics (BUG-013 fallback).
     */
    private *flushToolCallAccumulators(
        accumulators: Map<number, ToolCallAccumulator>,
    ): Generator<ApiStreamChunk> {
        for (const [, acc] of accumulators) {
            if (!acc.id || !acc.name) {
                console.warn(
                    `[Copilot] Skipping incomplete tool_call accumulator: id="${acc.id}", name="${acc.name}"`,
                );
                continue;
            }
            let input: Record<string, unknown> = {};
            try {
                input = acc.argumentsJson.trim() ? JSON.parse(acc.argumentsJson) : {};
            } catch (e) {
                // BUG-032: Emit tool_error (not text) so AgentTask records a
                // failed tool_use, increments consecutiveMistakes, and breaks
                // the loop after the configured limit. Emitting text causes
                // the model to retry the same broken call indefinitely.
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
        accumulators.clear();
    }

    /**
     * Quick non-streaming classification call.
     * Used by skill matching LLM-fallback.
     */
    async classifyText(prompt: string, abortSignal?: AbortSignal): Promise<string> {
        // BUG-015 / FEATURE-1206: see createMessage() for the rationale.
        const response = await this.client.chat.completions.create({
            model: this.config.model,
            max_completion_tokens: 50,
            messages: [{ role: 'user', content: prompt }],
        }, {
            signal: abortSignal ?? undefined,
        });

        return response.choices?.[0]?.message?.content?.trim() ?? '';
    }

    // ---------------------------------------------------------------------------
    // Format conversion: Anthropic → OpenAI (mirrors OpenAiProvider)
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

    private is401Error(e: unknown): boolean {
        if (e instanceof OpenAI.APIError) {
            return e.status === 401;
        }
        return false;
    }

    /**
     * Enhance Copilot API errors with actionable messages.
     */
    private enhanceError(e: unknown): Error {
        if (!(e instanceof OpenAI.APIError)) {
            return e instanceof Error ? e : new Error(String(e));
        }
        switch (e.status) {
            case 401:
                return new Error('Copilot authentication failed. Please sign in again.');
            case 403:
                return new Error('No active GitHub Copilot subscription, or model not enabled. Check your Copilot settings at github.com.');
            case 429:
                return new Error('Copilot rate limit exceeded. Please wait a moment and try again.');
            case 400:
                return new Error(`Copilot request error: ${e.message}. The model may require policy acceptance at github.com.`);
            default:
                return new Error(`Copilot API error (${e.status}): ${e.message}`);
        }
    }
}
