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

export function getMemorySection(memoryContext?: string): string {
    if (!memoryContext?.trim()) return '';

    // Truncate to keep the per-call memory budget under ~1k tokens. The
    // extraction pipeline can store more, but the prompt only carries the
    // most relevant slice (the MemoryRetriever is responsible for ranking).
    let body = memoryContext.trim();
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
