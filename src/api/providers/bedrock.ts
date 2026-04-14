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

// Default context window for Claude models on Bedrock.
// Can be refined per model in the model-registry later.
const BEDROCK_DEFAULT_CONTEXT_WINDOW = 200_000;
const BEDROCK_DEFAULT_MAX_TOKENS = 8192;

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
        const bedrockMessages = this.convertMessages(messages);
        const system: SystemContentBlock[] = [{ text: systemPrompt }];

        const toolConfig: ConverseStreamCommandInput['toolConfig'] = tools.length > 0
            ? {
                tools: tools.map<BedrockTool>((t) => ({
                    toolSpec: {
                        name: t.name,
                        description: t.description,
                        // AWS DocumentType is a JSON-compatible recursive union; JSON Schema
                        // objects are valid DocumentType at runtime, but TS can't prove it.
                        inputSchema: { json: t.input_schema as unknown as DocumentType },
                    },
                })),
                toolChoice: { auto: {} },
            }
            : undefined;

        const maxTokens = this.config.maxTokens ?? BEDROCK_DEFAULT_MAX_TOKENS;
        const temperature = this.config.temperature ?? 0.2;

        const command = new ConverseStreamCommand({
            modelId: this.config.model,
            messages: bedrockMessages,
            system,
            inferenceConfig: {
                maxTokens,
                temperature,
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

        for await (const event of response.stream) {
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
                    let parsedInput: Record<string, unknown> = {};
                    try {
                        parsedInput = tool.inputJson ? JSON.parse(tool.inputJson) as Record<string, unknown> : {};
                    } catch (e) {
                        yield {
                            type: 'tool_error',
                            id: tool.id,
                            name: tool.name,
                            error: `Tool input parse error: ${(e as Error).message}`,
                        } satisfies ApiStreamChunk;
                        toolAccumulator.delete(idx);
                        continue;
                    }
                    yield {
                        type: 'tool_use',
                        id: tool.id,
                        name: tool.name,
                        input: parsedInput,
                    } satisfies ApiStreamChunk;
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

        if (inputTokens > 0 || outputTokens > 0) {
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
