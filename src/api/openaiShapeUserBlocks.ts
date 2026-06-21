/**
 * REF-06: shared user-block converter for the three OpenAI-Chat-Completions
 * providers (openai, github-copilot, kilo-gateway).
 *
 * History: FIX-04-03-09 (image-blocks dropped by openai/copilot/kilo)
 * landed three near-identical user-branch updates in three convertMessages
 * methods; FIX-04-99-01 then had to add the same handling once more to
 * chatgpt-oauth on a *different* wire shape (Responses API). The audit
 * flagged the duplication as a future-bug carrier -- next time someone
 * adds a new block type, three branches need updating.
 *
 * This helper centralises the Chat-Completions user-message conversion.
 * The Responses-API provider (chatgpt-oauth) keeps its own conversion
 * because its content shape differs (input_image vs image_url, separate
 * function_call_output items vs role:'tool' messages).
 */

import type { ContentBlock, MessageParam } from './types';

/** Subset of OpenAIMessage that this helper writes back to the result array. */
export type OpenAiChatMessage = {
    role: 'user' | 'tool';
    content: string | null | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
    >;
    tool_call_id?: string;
    name?: string;
};

/**
 * Append the OpenAI-Chat-Completions encoding of a single user message
 * (text + image + tool_result content blocks) to `out`. Mirrors the
 * pre-extraction logic from openai.ts/github-copilot.ts/kilo-gateway.ts
 * so the three providers stay byte-identical to their pre-refactor
 * behaviour.
 *
 * Rules:
 *   - If any block is an image, ALL text+image blocks for this user
 *     message are emitted as one role:'user' with a content-array
 *     ({type:'text'|'image_url'}). This is the canonical OpenAI vision
 *     shape (FIX-04-03-09).
 *   - If no image blocks are present, each text block becomes its own
 *     role:'user' message with a plain string body (backwards-compat
 *     with the pre-image-fix behaviour).
 *   - tool_result blocks always become a separate role:'tool' message
 *     with the extracted text content (OpenAI requires string content
 *     on tool messages; multimodal arrays get text-only flattened).
 *   - Thinking blocks cannot legally appear on user messages; ignored
 *     if they do.
 */
export function appendOpenAiChatUserMessage(
    out: OpenAiChatMessage[],
    msg: MessageParam,
): void {
    if (msg.role !== 'user') return;
    if (typeof msg.content === 'string') {
        out.push({ role: 'user', content: msg.content });
        return;
    }

    const blocks: ContentBlock[] = msg.content;
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
                    image_url: {
                        url: `data:${block.source.media_type};base64,${block.source.data}`,
                    },
                });
            }
        }
        if (contentArr.length > 0) {
            out.push({ role: 'user', content: contentArr });
        }
    }

    for (const block of blocks) {
        if (!hasImage && block.type === 'text') {
            out.push({ role: 'user', content: block.text });
        } else if (block.type === 'tool_result') {
            const textContent = typeof block.content === 'string'
                ? block.content
                : block.content
                    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                    .map((b) => b.text)
                    .join('\n');
            out.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: textContent,
            });
        }
    }
}
