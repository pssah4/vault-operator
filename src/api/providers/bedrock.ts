/**
 * BedrockProvider -- LLM provider for Amazon Bedrock.
 *
 * Uses the unified Converse API (ConverseStreamCommand) so the same code path
 * works for Claude, Nova, Llama and Mistral models. Region support includes
 * eu-central-1 and other EU regions via cross-region inference profiles
 * (model IDs like `eu.anthropic.claude-sonnet-4-5-20250929-v1:0`).
 *
 * Two authentication modes:
 *   1. Bedrock API key (bearer token, simpler, recommended) -- uses the
 *      clientConfig.token + authSchemePreference: ['httpBearerAuth'] path.
 *      This is AWS's newer single-token credential, typically exported as
 *      AWS_BEARER_TOKEN_BEDROCK in other tools. Optional custom endpoint URL.
 *   2. IAM access key ID + secret access key (classic SigV4 signing), plus
 *      optional session token for AWS SSO / STS temporary credentials.
 *
 * Shape matches src/api/providers/anthropic.ts: emits our internal ApiStream
 * chunks (text, tool_use, usage) so the AgentTask conversation loop doesn't
 * need to know which provider is active.
 */

import {
    BedrockRuntimeClient,
    ConverseStreamCommand,
    ConverseCommand,
    type BedrockRuntimeClientConfig,
    type ContentBlock as BedrockContentBlock,
    type Message as BedrockMessage,
    type SystemContentBlock,
    type Tool as BedrockTool,
    type ToolResultContentBlock,
    type ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import type { LLMProvider } from '../../types/settings';
import type {
    ApiHandler,
    ApiStream,
    ApiStreamChunk,
    ContentBlock,
    MessageParam,
    ModelInfo,
} from '../types';
import type { ToolDefinition } from '../../core/tools/types';
import { truncatedToolInputError } from '../types';
import { resolveOutputBudget, estimatePromptTokens, modelSupportsTemperature } from '../../types/model-registry';
import { getCacheCapability } from '../capabilities';
import { splitSystemPromptAtCacheBreakpoint } from '../../core/systemPrompt';
import { logCacheStat } from '../logCacheStat';

// Default context window for Claude models on Bedrock.
// Can be refined per model in the model-registry later.
const BEDROCK_DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * FIX-04-03-06: AWS Bedrock Converse rejects calls where the history
 * contains `toolUse`/`toolResult` blocks but the call passes no
 * `toolConfig`. The hard-limit-recovery path in AgentTask intentionally
 * sends `tools=[]` to disable further tool calls, which then trips the
 * mismatch. This helper replaces tool-blocks in a defensive copy with
 * compact text markers so the API call shape is consistent.
 *
 * Pure function; does not mutate the input.
 */
export function messagesHaveToolBlocks(messages: MessageParam[]): boolean {
    for (const msg of messages) {
        if (typeof msg.content === 'string') continue;
        for (const block of msg.content) {
            if (block.type === 'tool_use' || block.type === 'tool_result') return true;
        }
    }
    return false;
}

export function stripToolBlocksForNoToolsCall(messages: MessageParam[]): MessageParam[] {
    return messages.map((msg) => {
        if (typeof msg.content === 'string') return msg;
        const newContent: ContentBlock[] = msg.content.map((block) => {
            if (block.type === 'tool_use') {
                return {
                    type: 'text',
                    text: `[prior tool call: ${block.name}]`,
                };
            }
            if (block.type === 'tool_result') {
                // Compact representation: collapse any structured tool-result
                // payload into a single text marker. The conversation history
                // stays meaningful, but no tool-block references remain.
                const summary = typeof block.content === 'string'
                    ? block.content.slice(0, 200)
                    : '[tool result content]';
                return {
                    type: 'text',
                    text: `[prior tool result] ${summary}`,
                };
            }
            return block;
        });
        return { role: msg.role, content: newContent };
    });
}

/**
 * Pull the region out of a Bedrock endpoint URL, e.g.
 * `https://bedrock-runtime.eu-central-1.amazonaws.com` -> `eu-central-1`.
 * Returns null if the URL does not match the expected AWS pattern.
 */
export function extractRegionFromBedrockUrl(url: string | undefined): string | null {
    if (!url) return null;
    const match = url.match(/^https?:\/\/(?:[^.]+\.)?([a-z]{2}-[a-z]+-\d+)\.amazonaws\.com/i);
    return match ? match[1].toLowerCase() : null;
}

export class BedrockProvider implements ApiHandler {
    private client: BedrockRuntimeClient;
    private config: LLMProvider;

    constructor(config: LLMProvider) {
        this.config = config;

        // Prefer the explicit region field, fall back to parsing it out of the
        // endpoint URL. That way the user can set just one of the two fields.
        const region = config.awsRegion?.trim() || extractRegionFromBedrockUrl(config.baseUrl) || '';
        if (!region) {
            throw new Error('[Bedrock] awsRegion is required (e.g. eu-central-1) -- either pick a region or give an endpoint URL containing one');
        }

        // Default to bearer-token mode if not specified, since it's the recommended path.
        const authMode = config.awsAuthMode ?? 'api-key';

        const clientConfig: BedrockRuntimeClientConfig = {
            region,
            // Optional custom endpoint URL -- users can point at e.g.
            // https://bedrock-runtime.eu-central-1.amazonaws.com explicitly.
            // Falls back to the default regional endpoint when empty.
            ...(config.baseUrl?.trim() ? { endpoint: config.baseUrl.trim() } : {}),
        };

        if (authMode === 'api-key') {
            const apiKey = config.awsApiKey?.trim();
            if (!apiKey) {
                throw new Error('[Bedrock] API key is required when authMode is api-key');
            }
            clientConfig.token = { token: apiKey };
            clientConfig.authSchemePreference = ['httpBearerAuth'];
        } else {
            const accessKeyId = config.awsAccessKey?.trim();
            const secretAccessKey = config.awsSecretKey?.trim();
            if (!accessKeyId || !secretAccessKey) {
                throw new Error('[Bedrock] awsAccessKey and awsSecretKey are required when authMode is access-key');
            }
            clientConfig.credentials = {
                accessKeyId,
                secretAccessKey,
                ...(config.awsSessionToken ? { sessionToken: config.awsSessionToken.trim() } : {}),
            };
        }

        this.client = new BedrockRuntimeClient(clientConfig);
    }

    getModel(): { id: string; info: ModelInfo } {
        return {
            id: this.config.model,
            info: {
                contextWindow: BEDROCK_DEFAULT_CONTEXT_WINDOW,
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
        // FIX-04-03-06: when the caller passes no tools but the history
        // still contains tool_use/tool_result blocks (typical for the
        // hard-limit-recovery path in AgentTask), strip those blocks
        // to text markers. Otherwise AWS Converse returns 400
        // "toolConfig must be defined when using toolUse and toolResult
        // content blocks".
        const messagesForApi = tools.length === 0 && messagesHaveToolBlocks(messages)
            ? stripToolBlocksForNoToolsCall(messages)
            : messages;
        const bedrockMessages = this.convertMessages(messagesForApi);

        // IMP-18-01-02 / ADR-111: Bedrock caches nothing without explicit cachePoint
        // markers. When the model supports it (Anthropic Claude on Bedrock) and the
        // toggle is on, split the system prompt at the cache breakpoint and place a
        // cachePoint after the stable prefix, after the tool list, and after the last
        // user message — the same shape as the Anthropic-direct provider.
        const cacheStyle = getCacheCapability(this.config.type, this.config.model).cacheStyle;
        const useCachePoint = (this.config.promptCachingEnabled ?? false) && cacheStyle === 'bedrock-cachepoint';

        let system: SystemContentBlock[];
        if (useCachePoint) {
            const { stable, volatile } = splitSystemPromptAtCacheBreakpoint(systemPrompt);
            system = volatile.trim().length > 0
                ? [{ text: stable }, { cachePoint: { type: 'default' } }, { text: volatile }]
                : [{ text: stable }, { cachePoint: { type: 'default' } }];
        } else {
            system = [{ text: systemPrompt }];
        }

        if (useCachePoint) {
            for (let i = bedrockMessages.length - 1; i >= 0; i--) {
                const m = bedrockMessages[i];
                if (m.role === 'user' && Array.isArray(m.content)) {
                    m.content.push({ cachePoint: { type: 'default' } });
                    break;
                }
            }
        }

        const toolConfig: ConverseStreamCommandInput['toolConfig'] = tools.length > 0
            ? {
                tools: [
                    ...tools.map<BedrockTool>((t) => ({
                        toolSpec: {
                            name: t.name,
                            description: t.description,
                            // AWS DocumentType is a JSON-compatible recursive union; JSON Schema
                            // objects are valid DocumentType at runtime, but TS can't prove it.
                            inputSchema: { json: t.input_schema as unknown as DocumentType },
                        },
                    })),
                    ...(useCachePoint ? [{ cachePoint: { type: 'default' } } as BedrockTool] : []),
                ],
                toolChoice: { auto: {} },
            }
            : undefined;

        // Auto by default: undefined -> model-scaled budget; clamped to the
        // model's output ceiling and to the room left in the context window.
        const { maxTokens } = resolveOutputBudget(
            this.config.model,
            this.config.maxTokens,
            { estimatedInputTokens: estimatePromptTokens(systemPrompt, messages) },
        );
        // FIX-04-03-02: omit temperature for default-only models (Opus 4.7+,
        // GPT-5.x on Bedrock if it ever ships there); Bedrock surfaces the
        // same provider 400 as direct calls when temperature is rejected.
        const supportsTemperature = modelSupportsTemperature(this.config.model);
        const temperature = supportsTemperature ? (this.config.temperature ?? 0.2) : undefined;

        const command = new ConverseStreamCommand({
            modelId: this.config.model,
            messages: bedrockMessages,
            system,
            inferenceConfig: {
                maxTokens,
                ...(temperature !== undefined ? { temperature } : {}),
            },
            toolConfig,
        });

        const response = await this.client.send(command, { abortSignal });
        if (!response.stream) {
            throw new Error('[Bedrock] Converse stream returned no body');
        }

        // Tool accumulation: Bedrock streams toolUse input as JSON deltas, same
        // as Anthropic. We accumulate and yield a single complete tool_use chunk.
        const toolAccumulator = new Map<number, { id: string; name: string; inputJson: string }>();
        let currentBlockIndex: number | undefined;

        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;
        // stopReason arrives in messageStop, after the content blocks — hold parse
        // failures until then so the model gets a truncation-aware error.
        let stopReason: string | undefined;
        const failedToolParses: Array<{ id: string; name: string; rawError: string }> = [];

        for await (const event of response.stream) {
            if (event.messageStop?.stopReason) {
                stopReason = event.messageStop.stopReason;
                continue;
            }
            if (event.contentBlockStart) {
                const idx = event.contentBlockStart.contentBlockIndex ?? 0;
                currentBlockIndex = idx;
                const start = event.contentBlockStart.start;
                if (start?.toolUse) {
                    toolAccumulator.set(idx, {
                        id: start.toolUse.toolUseId ?? '',
                        name: start.toolUse.name ?? '',
                        inputJson: '',
                    });
                }
                continue;
            }

            if (event.contentBlockDelta) {
                const idx = event.contentBlockDelta.contentBlockIndex ?? currentBlockIndex ?? 0;
                const delta = event.contentBlockDelta.delta;
                if (delta?.text !== undefined) {
                    yield { type: 'text', text: delta.text } satisfies ApiStreamChunk;
                    continue;
                }
                if (delta?.toolUse?.input !== undefined) {
                    const entry = toolAccumulator.get(idx);
                    if (entry) entry.inputJson += delta.toolUse.input;
                    continue;
                }
                if (delta?.reasoningContent?.text !== undefined) {
                    yield { type: 'thinking', text: delta.reasoningContent.text } satisfies ApiStreamChunk;
                    continue;
                }
                continue;
            }

            if (event.contentBlockStop) {
                const idx = event.contentBlockStop.contentBlockIndex ?? currentBlockIndex ?? 0;
                const tool = toolAccumulator.get(idx);
                if (tool) {
                    let parsedInput: Record<string, unknown> | undefined;
                    try {
                        parsedInput = tool.inputJson ? JSON.parse(tool.inputJson) as Record<string, unknown> : {};
                    } catch (e) {
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
                    toolAccumulator.delete(idx);
                }
                continue;
            }

            if (event.metadata?.usage) {
                const usage = event.metadata.usage;
                inputTokens = usage.inputTokens ?? 0;
                outputTokens = usage.outputTokens ?? 0;
                cacheReadTokens = usage.cacheReadInputTokens ?? 0;
                cacheCreationTokens = usage.cacheWriteInputTokens ?? 0;
            }
        }

        // Tools still accumulating means the stream ended mid-tool-call.
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

        if (inputTokens > 0 || outputTokens > 0) {
            logCacheStat({
                provider: 'bedrock',
                model: this.config.model,
                caching: this.config.promptCachingEnabled ? 'on' : 'OFF',
                nonCachedInputTokens: inputTokens,
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
     * Quick non-streaming classification call for the skill matcher.
     * Uses ConverseCommand (no stream) to keep it cheap.
     */
    async classifyText(prompt: string, abortSignal?: AbortSignal): Promise<string> {
        const response = await this.client.send(
            new ConverseCommand({
                modelId: this.config.model,
                messages: [{ role: 'user', content: [{ text: prompt }] }],
                inferenceConfig: { maxTokens: 50, temperature: 0 },
            }),
            { abortSignal },
        );

        const blocks = response.output?.message?.content ?? [];
        for (const block of blocks) {
            if (block.text) return block.text.trim();
        }
        return '';
    }

    /**
     * Convert our internal MessageParam[] to Bedrock Converse Message[].
     * Handles text, image (base64), tool_use and tool_result content blocks.
     */
    private convertMessages(messages: MessageParam[]): BedrockMessage[] {
        return messages.map((msg) => {
            if (typeof msg.content === 'string') {
                return {
                    role: msg.role,
                    content: [{ text: msg.content }] as BedrockContentBlock[],
                };
            }

            const content: BedrockContentBlock[] = msg.content.map((block) => this.convertBlock(block));
            return { role: msg.role, content };
        });
    }

    private convertBlock(block: ContentBlock): BedrockContentBlock {
        if (block.type === 'text') {
            return { text: block.text };
        }

        if (block.type === 'tool_use') {
            return {
                toolUse: {
                    toolUseId: block.id,
                    name: block.name,
                    input: block.input as unknown as DocumentType,
                },
            };
        }

        if (block.type === 'image') {
            const format = mediaTypeToBedrockFormat(block.source.media_type);
            return {
                image: {
                    format,
                    source: { bytes: base64ToUint8Array(block.source.data) },
                },
            };
        }

        if (block.type === 'tool_result') {
            const resultContent: ToolResultContentBlock[] = [];
            if (typeof block.content === 'string') {
                resultContent.push({ text: block.content });
            } else {
                for (const c of block.content) {
                    if (c.type === 'text') {
                        resultContent.push({ text: c.text });
                    } else if (c.type === 'image') {
                        resultContent.push({
                            image: {
                                format: mediaTypeToBedrockFormat(c.source.media_type),
                                source: { bytes: base64ToUint8Array(c.source.data) },
                            },
                        });
                    }
                }
            }
            return {
                toolResult: {
                    toolUseId: block.tool_use_id,
                    content: resultContent,
                    status: block.is_error ? 'error' : 'success',
                },
            };
        }

        // Exhaustiveness check -- unreachable
        const _exhaustive: never = block;
        throw new Error(`[Bedrock] Unknown content block: ${String(_exhaustive)}`);
    }
}

function mediaTypeToBedrockFormat(mt: string): 'png' | 'jpeg' | 'gif' | 'webp' {
    switch (mt) {
        case 'image/png': return 'png';
        case 'image/jpeg': return 'jpeg';
        case 'image/gif': return 'gif';
        case 'image/webp': return 'webp';
        default: return 'png';
    }
}

function base64ToUint8Array(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
