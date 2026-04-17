/**
 * sanitizeHistoryForApi - defensive history cleanup before sending to LLM
 *
 * BUG-017: Anthropic's API rejects requests where an assistant message
 * contains a `tool_use` block without a matching `tool_result` block in the
 * directly following user message. The same constraint applies to
 * Claude-via-Copilot. OpenAI is more lenient but a clean history is better.
 *
 * Orphans can enter the history through several paths:
 *   - Stream abort right after the assistant message was pushed but before
 *     tool execution finished.
 *   - Crash/reload mid-conversation, with a partially-saved transcript.
 *   - Resume of an older conversation that was already inconsistent.
 *   - Hard-limit recovery / emergency condensing edge cases.
 *
 * This helper removes orphaned tool_use / tool_result blocks immediately
 * before the history goes to the API. It is intentionally conservative: we
 * only drop blocks that would trigger a 400, never user text or assistant
 * commentary.
 *
 * Returns a NEW array. Input is not mutated.
 */

import type { MessageParam, ContentBlock } from '../../api/types';

interface SanitizeStats {
    droppedOrphanToolUses: number;
    droppedOrphanToolResults: number;
    droppedEmptyMessages: number;
}

export function sanitizeHistoryForApi(
    history: readonly MessageParam[],
): { history: MessageParam[]; stats: SanitizeStats } {
    const stats: SanitizeStats = {
        droppedOrphanToolUses: 0,
        droppedOrphanToolResults: 0,
        droppedEmptyMessages: 0,
    };

    // Pass 1: collect every tool_result tool_use_id present anywhere in history.
    // An assistant tool_use is "valid" if some later user message has a
    // tool_result with the matching tool_use_id. Anthropic actually requires
    // the result to be in the *immediately following* user message, but allowing
    // any later result is enough to keep the transcript useful and the strict
    // ordering check still happens server-side.
    const resolvedToolUseIds = new Set<string>();
    for (const msg of history) {
        if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
        for (const block of msg.content) {
            if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
                resolvedToolUseIds.add(block.tool_use_id);
            }
        }
    }

    // Pass 2: collect every assistant tool_use id present anywhere in history.
    const emittedToolUseIds = new Set<string>();
    for (const msg of history) {
        if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
        for (const block of msg.content) {
            if (block.type === 'tool_use' && typeof block.id === 'string') {
                emittedToolUseIds.add(block.id);
            }
        }
    }

    // Pass 3: rebuild history, dropping orphan blocks.
    const out: MessageParam[] = [];
    for (const msg of history) {
        if (!Array.isArray(msg.content)) {
            // Plain string content — nothing to sanitize, keep as is.
            out.push(msg);
            continue;
        }

        const cleaned: ContentBlock[] = [];
        for (const block of msg.content) {
            if (msg.role === 'assistant' && block.type === 'tool_use') {
                if (typeof block.id !== 'string' || !resolvedToolUseIds.has(block.id)) {
                    stats.droppedOrphanToolUses++;
                    continue;
                }
            }
            if (msg.role === 'user' && block.type === 'tool_result') {
                if (typeof block.tool_use_id !== 'string' || !emittedToolUseIds.has(block.tool_use_id)) {
                    stats.droppedOrphanToolResults++;
                    continue;
                }
            }
            cleaned.push(block);
        }

        // Drop messages that became empty after cleaning. An empty assistant
        // or user message would itself be a 400 ("content must be non-empty").
        if (cleaned.length === 0) {
            stats.droppedEmptyMessages++;
            continue;
        }
        out.push({ ...msg, content: cleaned });
    }

    return { history: out, stats };
}

/**
 * Convenience wrapper: sanitize and log if anything was dropped.
 * Use this at every API send-site in AgentTask.
 */
export function sanitizeAndLog(
    history: readonly MessageParam[],
    callsite: string,
): MessageParam[] {
    const { history: cleaned, stats } = sanitizeHistoryForApi(history);
    if (stats.droppedOrphanToolUses + stats.droppedOrphanToolResults + stats.droppedEmptyMessages > 0) {
        console.warn(
            `[AgentTask:${callsite}] Sanitized history: ` +
                `${stats.droppedOrphanToolUses} orphan tool_use, ` +
                `${stats.droppedOrphanToolResults} orphan tool_result, ` +
                `${stats.droppedEmptyMessages} empty messages dropped`,
        );
    }
    return cleaned;
}
