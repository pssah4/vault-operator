/**
 * User Memory Section
 *
 * Injected after vault context, before tools. Contains user profile,
 * active projects, and behavioral patterns from the memory system.
 * Only included when memory context is available.
 *
 * FEATURE-1508: Memory files are stored outside the vault ({vault-parent}/.obsidian-agent/memory/).
 * The agent cannot access them via read_file/edit_file. Instead, memory is injected
 * into the system prompt and updated automatically via the extraction pipeline.
 */

/** Cap on injected memory chars. ADR-080 Lever 8: was unbounded (~16k chars / 4k tokens). */
const MAX_MEMORY_CHARS = 4000;

/**
 * AUDIT-034 H-8: scrub credential-like substrings from memory facts
 * before injecting them into the system prompt. The extraction pipeline
 * can pick up an API key the user pasted into a chat, and the system
 * prompt is cached across the provider (Anthropic prompt cache, etc.).
 * A leaked key persists in every subsequent turn until cache eviction.
 *
 * The patterns aim to catch obvious shapes:
 *   - sk_ / sk- prefixed tokens (OpenAI, Anthropic, Stripe family)
 *   - long alnum strings labelled api_key / token / secret / bearer
 *   - AWS-style AKIA / ASIA / aws_access_key_id values
 *   - JWTs (three dot-separated base64 segments)
 *
 * Anything matched is replaced by `[REDACTED]` so the LLM can still
 * reason about the SHAPE of the memory entry without seeing the key.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
    /\bsk[-_][A-Za-z0-9]{16,}\b/g,
    /\b(?:api[_-]?key|token|secret|bearer|password|authorization)\s*[:=]\s*["']?([A-Za-z0-9+/_-]{12,})["']?/gi,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16,}\b/g,
    /\beyJ[A-Za-z0-9+/_=-]{8,}\.[A-Za-z0-9+/_=-]{8,}\.[A-Za-z0-9+/_=-]{8,}\b/g,
];

function redactCredentials(text: string): string {
    let out = text;
    for (const p of CREDENTIAL_PATTERNS) {
        out = out.replace(p, (match, group?: string) => {
            if (typeof group === 'string' && group.length > 0) {
                return match.replace(group, '[REDACTED]');
            }
            return '[REDACTED]';
        });
    }
    return out;
}

export function getMemorySection(memoryContext?: string): string {
    if (!memoryContext?.trim()) return '';

    // Truncate to keep the per-call memory budget under ~1k tokens. The
    // extraction pipeline can store more, but the prompt only carries the
    // most relevant slice (the MemoryRetriever is responsible for ranking).
    let body = redactCredentials(memoryContext.trim());
    if (body.length > MAX_MEMORY_CHARS) {
        body = body.slice(0, MAX_MEMORY_CHARS) + `\n\n[Memory truncated to ${MAX_MEMORY_CHARS} chars. Use recall_memory to query specific facts.]`;
    }

    return [
        '',
        '====',
        '',
        'PERSISTENT MEMORY (top relevant slice; full memory via recall_memory)',
        '',
        body,
    ].join('\n');
}

/** Exported for tests. */
export const _internalRedactCredentialsForTest = redactCredentials;
