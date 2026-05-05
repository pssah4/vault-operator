/**
 * update_memory -- BA-26 / FEAT-23-05.
 *
 * DEPRECATED: this tool predates Memory v2. New clients should call
 * `save_to_memory` directly. We keep this handler for backward-compat
 * with existing Claude Desktop / ChatGPT / Claude Code MCP-Configs:
 * the call is routed transparently to save_to_memory (Memory v2),
 * and a telemetry counter records the legacy invocation so we know
 * when no client uses it any more.
 *
 * The original behaviour (writing into memory/{file}.md V1 files)
 * is removed -- those files are dead storage in v2.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { handleSaveToMemory } from './saveToMemory';

const CATEGORIES_TO_TAGS: Record<string, string[]> = {
    profile: ['profile'],
    patterns: ['patterns'],
    errors: ['errors'],
    projects: ['projects'],
};

export async function handleUpdateMemory(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const category = typeof args.category === 'string' ? args.category : '';
    const content = typeof args.content === 'string' ? args.content : '';

    if (!category || !CATEGORIES_TO_TAGS[category]) {
        return {
            content: [{
                type: 'text',
                text: `Error: category must be one of: ${Object.keys(CATEGORIES_TO_TAGS).join(', ')}`,
            }],
            isError: true,
        };
    }
    if (!content.trim()) {
        return { content: [{ type: 'text', text: 'Error: content is required' }], isError: true };
    }

    // Telemetry: count legacy invocations so we know when to remove
    // the tool entirely. Best-effort.
    try {
        void plugin.memoryV2Telemetry?.legacyUpdateMemory?.({
            category,
            sourceInterface: typeof args.source_interface === 'string' ? args.source_interface : 'unknown',
        });
    } catch { /* non-fatal */ }

    // Route to v2 path. Tags carry the original category so the user
    // can still filter for "profile" / "patterns" / "errors" / "projects".
    return handleSaveToMemory(plugin, {
        content,
        tags: CATEGORIES_TO_TAGS[category],
        source_interface: args.source_interface,
        kind: 'fact',
    });
}
