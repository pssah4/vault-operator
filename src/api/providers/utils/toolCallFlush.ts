/**
 * Shared streaming tool-call flush for OpenAI-compatible providers.
 *
 * OpenRouter / GitHub Copilot / Kilo Gateway / ChatGPT-OAuth all use the
 * same wire shape: tool_call deltas accumulate inside the loop and need
 * to be yielded as ApiStream tool_use chunks either when finish_reason
 * lands on "tool_calls" (canonical) or after the stream ends with
 * "stop" / "length" (the BUG-013 / FEATURE-0409 pattern that several
 * upstreams emit). Without the post-loop flush the tool_use is silently
 * dropped and the agent treats the response as text-only.
 *
 * Extracted from openai.ts (FIX-13-02-01) so kilo-gateway and the rest
 * stay in lockstep instead of growing parallel one-offs. The helper also
 * takes a `wasMaxTokens` flag (FIX-18-04-03) so the tool_error emitted
 * on a JSON-parse failure carries the actionable "split write_file +
 * append_to_file" recovery hint when finish_reason was "length".
 */

import type { ApiStreamChunk } from '../../types';
import { truncatedToolInputError } from '../../types';

export interface ToolCallAccumulator {
    id: string;
    name: string;
    argumentsJson: string;
}

/**
 * Yield tool_use (or tool_error) chunks for every accumulated tool call,
 * then clear the map. The caller is expected to invoke this both
 * mid-stream (on finish_reason === 'tool_calls', wasMaxTokens=false) and
 * post-stream as a fallback (wasMaxTokens = lastFinishReason === 'length').
 *
 * `providerLabel` is only used for the defensive log line when an
 * accumulator arrived without id or name -- the helper itself stays
 * provider-agnostic.
 */
export function* flushToolCallAccumulators(
    accumulators: Map<number, ToolCallAccumulator>,
    opts: { wasMaxTokens: boolean; providerLabel: string },
): Generator<ApiStreamChunk> {
    for (const [, acc] of accumulators) {
        // Skip incomplete accumulators (no id or no name -- defensive).
        if (!acc.id || !acc.name) {
            console.warn(
                `[${opts.providerLabel}] Skipping incomplete tool_call accumulator: id="${acc.id}", name="${acc.name}"`,
            );
            continue;
        }
        let input: Record<string, unknown> = {};
        try {
            input = acc.argumentsJson.trim()
                ? (JSON.parse(acc.argumentsJson) as Record<string, unknown>)
                : {};
        } catch (e) {
            // BUG-032 / FIX-18-04-03: surface as tool_error so AgentTask
            // increments the mistake counter; with wasMaxTokens=true the
            // model sees the "split write_file + append_to_file" hint
            // instead of the generic recovery message, which prevents
            // the same-payload retry loop on length-truncated writes.
            yield {
                type: 'tool_error',
                id: acc.id,
                name: acc.name,
                error: truncatedToolInputError(acc.name, (e as Error).message, opts.wasMaxTokens),
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
