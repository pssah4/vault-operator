/**
 * Shared helpers for OpenAI-compatible providers. Extracted because
 * OpenRouter / GitHub Copilot / Kilo Gateway / Custom backends all
 * speak the same wire shape but emit subtle variations on the same
 * fields, and we don't want each provider to grow its own one-off
 * fix for the same upstream quirk.
 */

/**
 * Normalise the `delta.content` field of a streaming chat-completion
 * chunk into a plain text string (or null when nothing usable came
 * through this delta).
 *
 * Most OpenAI-compatible backends emit `delta.content: string` like
 * the canonical API does. A handful of routers (GitHub Copilot for
 * Claude tiers, and likely the Kilo Gateway when proxying to Claude)
 * leak the Anthropic content-block array shape through:
 *   `[{ type: "text", text: "Hello" }, ...]`
 *
 * FIX-13-02-02: kilo-gateway used to `typeof === 'string'` here,
 * silently dropping the array form and billing tokens for invisible
 * output. github-copilot already had a local `normalizeDeltaContent`;
 * this is the shared version both providers now use.
 *
 * Returns `null` when there is no text content (including the empty
 * string and tool_call-only deltas). Callers turn `null` into "skip
 * yielding a text chunk this iteration".
 */
export function normalizeDeltaContent(content: unknown): string | null {
    if (content == null) return null;
    if (typeof content === 'string') return content.length > 0 ? content : null;
    if (Array.isArray(content)) {
        const text = content
            .filter((c): c is { type: string; text: string } =>
                c != null && typeof c === 'object' && 'text' in c && typeof (c as { text: unknown }).text === 'string')
            .map((c) => c.text)
            .join('');
        return text.length > 0 ? text : null;
    }
    return null;
}
