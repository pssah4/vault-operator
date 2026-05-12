/**
 * API Types - LLM Provider Abstraction
 *
 * Adapted from Kilo Code's src/api/transform/stream.ts
 *
 * Internal format uses Anthropic's message structure.
 * Each provider converts to/from its own format.
 */

import type { ToolDefinition } from '../core/tools/types';

// --- Stream Chunks ---

export type ApiStreamChunk =
    | { type: 'text'; text: string }
    | { type: 'thinking'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_error'; id: string; name: string; error: string }
    | { type: 'usage'; inputTokens: number; outputTokens: number;
        cacheReadTokens?: number; cacheCreationTokens?: number };

export type ApiStream = AsyncIterable<ApiStreamChunk>;

/**
 * Build the actionable error for a malformed / truncated tool-call input. Every
 * provider's stream handler uses this so the model gets a consistent,
 * recovery-oriented instruction (split the write, do not double-emit) instead of
 * a bare JSON parse error it can only loop on.
 */
export function truncatedToolInputError(toolName: string, rawError: string, wasMaxTokens = false): string {
    const cause = wasMaxTokens
        ? `The response hit the max output token limit, so this "${toolName}" call was cut off before its arguments finished.`
        : `The "${toolName}" tool-call arguments were truncated or malformed.`;
    return `Tool input parse error: ${rawError}. ${cause} `
        + `Do NOT retry the same call. If this was a large write, split it: call write_file with the document header and the first section only, then call append_to_file repeatedly for the rest. `
        + `Reduce the payload if needed. Output the document only through the tool — do not also print its full text in your reply.`;
}

// --- Model Info ---

export interface ModelInfo {
    contextWindow: number;
    supportsTools: boolean;
    supportsStreaming: boolean;
}

// --- Message Format (Anthropic-internal, like Kilo Code) ---

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/**
 * Content blocks that can appear inside a tool_result to return multimodal data
 * (e.g. rendered slide images alongside text descriptions).
 */
export type ToolResultContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } };

export type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string | ToolResultContentBlock[]; is_error?: boolean };

export type MessageParam = {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
};

// --- ApiHandler Interface (adapted from Kilo Code's ApiHandler) ---

export interface ApiHandler {
    /**
     * Send a message to the LLM and stream the response.
     * Tools are provided so the LLM can call them.
     * Pass an AbortSignal to support cancellation.
     */
    createMessage(
        systemPrompt: string,
        messages: MessageParam[],
        tools: ToolDefinition[],
        abortSignal?: AbortSignal,
    ): ApiStream;

    /**
     * Get model information
     */
    getModel(): { id: string; info: ModelInfo };

    /**
     * Quick non-streaming text completion for lightweight classification tasks.
     * Used by skill matching LLM-fallback (~100 input tokens, ~10 output tokens).
     * Returns the raw text response trimmed of whitespace.
     */
    classifyText?(prompt: string, abortSignal?: AbortSignal): Promise<string>;
}
