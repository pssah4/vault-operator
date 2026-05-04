/**
 * close_conversation -- BA-26 / FIX-23-01-01.
 *
 * Explicitly ends the Living-Document Active-Session for a given
 * conversation. After this call, the next save_conversation from
 * the same MCP-Session creates a NEW conversation instead of
 * appending. Useful when the user signals end-of-topic ("speicher
 * das ab und beginn ein neues Thema").
 *
 * Idempotent: closing an unknown or already-closed conversation
 * succeeds (no error), but reports nothing was open.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';

// eslint-disable-next-line @typescript-eslint/require-await -- MCP-Tool-Handler interface contract: async signature shared with handlers that do disk/HTTP I/O
export async function handleCloseConversation(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const conversationId = typeof args.conversation_id === 'string'
        ? args.conversation_id
        : '';
    if (!conversationId) {
        return errorResult('conversation_id is required');
    }

    const sessions = plugin.activeMcpSessions;
    if (!sessions) {
        return { content: [{ type: 'text', text: `Active sessions store unavailable; nothing to close.` }] };
    }

    const closed = sessions.closeByConversationId(conversationId);
    return {
        content: [{
            type: 'text',
            text: closed
                ? `Living-Document session for conversation ${conversationId} closed. The next save_conversation from this source creates a new conversation.`
                : `No active Living-Document session for conversation ${conversationId} (already closed or never opened).`,
        }],
    };
}

function errorResult(text: string): McpToolResult {
    return { content: [{ type: 'text', text: 'Error: ' + text }], isError: true };
}
