/**
 * save_to_memory -- BA-26 / FEAT-23-01.
 *
 * Persists a content blob as a Memory v2 fact. Replaces the V1
 * update_memory pathway. External MCP clients (Claude Desktop,
 * ChatGPT, Claude Code, Perplexity) call this when they want to
 * record a learned insight in Vault Operator's shared memory.
 *
 * Source-Interface-Tag is set per the connector configuration; the
 * tool whitelists the value and falls back to 'unknown'.
 *
 * For ergonomic single-fact use we bypass the LLM-driven
 * MemoryAtomizer (which exists for the bulk-import path in
 * MemoryMigrationJob). Callers that need atomic split should send
 * one save_to_memory call per fact.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { FactStore } from '../../core/memory/FactStore';
import {
    validateSourceInterface,
} from '../../core/memory/SourceInterface';
import type { FactKind } from '../../core/memory/FactStore';

const VALID_KINDS: FactKind[] = ['fact', 'preference', 'identity', 'event'];

function clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max);
}

export async function handleSaveToMemory(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const content = typeof args.content === 'string' ? args.content.trim() : '';
    if (!content) {
        return errorResult('content is required');
    }
    if (content.length > 4000) {
        return errorResult('content exceeds 4000 characters; split into multiple calls');
    }

    const memDB = plugin.memoryDB;
    if (!memDB?.isOpen()) {
        return errorResult('Memory database is not available');
    }

    const sourceInterface = validateSourceInterface(args.source_interface);
    const tags = Array.isArray(args.tags)
        ? args.tags.filter((t): t is string => typeof t === 'string').slice(0, 5)
        : [];
    const kind = (typeof args.kind === 'string' && VALID_KINDS.includes(args.kind as FactKind))
        ? args.kind as FactKind
        : 'fact';
    const importance = typeof args.importance === 'number'
        ? clamp(args.importance, 0, 1)
        : 0.5;

    try {
        const store = new FactStore(memDB);
        const fact = store.insert({
            text: content,
            topics: tags,
            importance,
            kind,
            sourceInterface,
            sourceUri: typeof args.source_uri === 'string' ? args.source_uri : undefined,
            profileId: 'default',
        });
        await memDB.save().catch(() => undefined);

        return {
            content: [{
                type: 'text',
                text: `Fact ${fact.id} saved to memory (source: ${sourceInterface}, kind: ${kind}, topics: ${tags.join(', ') || '-'}).`,
            }],
        };
    } catch (e) {
        return errorResult(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

function errorResult(text: string): McpToolResult {
    return { content: [{ type: 'text', text: 'Error: ' + text }], isError: true };
}
