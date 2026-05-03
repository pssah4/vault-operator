/**
 * MCP Tool Dispatcher -- routes tool calls to the appropriate handler.
 *
 * Automatically tracks all tool calls as a session in Obsilo's chat history.
 * This ensures MCP conversations appear in the history sidebar even if Claude
 * never explicitly calls sync_session.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { str } from '../types';
import { handleGetContext } from './getContext';
import { handleSearchVault } from './searchVault';
import { handleReadNotes } from './readNotes';
import { handleWriteVault } from './writeVault';
import { handleSyncSession } from './syncSession';
import { handleUpdateMemory } from './updateMemory';
import { handleExecuteVaultOp } from './executeVaultOp';
import { handleGetVaultImplicitEdges, handleGetVaultNoteMetadata } from './getVaultGraph';
import { handleSaveToMemory } from './saveToMemory';
import { handleSaveConversation } from './saveConversation';
import { handleCloseConversation } from './closeConversation';
import { handleRecallMemory } from './recallMemory';
import { handleSearchHistory } from './searchHistory';
import { buildPrompts } from '../prompts/systemContext';

type McpHandler = (plugin: ObsidianAgentPlugin, args: Record<string, unknown>) => Promise<McpToolResult>;

const handlers = new Map<string, McpHandler>([
    ['get_context', handleGetContext],
    ['search_vault', handleSearchVault],
    ['read_notes', handleReadNotes],
    ['write_vault', handleWriteVault],
    ['execute_vault_op', handleExecuteVaultOp],
    ['sync_session', handleSyncSession],
    ['update_memory', handleUpdateMemory],
    ['get_vault_implicit_edges', handleGetVaultImplicitEdges],
    ['get_vault_note_metadata', handleGetVaultNoteMetadata],
    // BA-26 / EPIC-23 -- Cross-Surface MCP Tools (FEAT-23-01, -02, -05)
    ['save_to_memory', handleSaveToMemory],
    ['save_conversation', handleSaveConversation],
    ['close_conversation', handleCloseConversation],
    ['recall_memory', handleRecallMemory],
    ['search_history', handleSearchHistory],
]);

// ---------------------------------------------------------------------------
// Auto Session Tracking
// ---------------------------------------------------------------------------

let currentSessionId: string | null = null;
let sessionToolCalls: string[] = [];
let sessionLastActivity = 0;
let systemContextInjected = false;
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min inactivity = new session

async function ensureSession(plugin: ObsidianAgentPlugin): Promise<void> {
    const now = Date.now();

    // Start a new session if none exists or if timed out
    if (!currentSessionId || (now - sessionLastActivity > SESSION_TIMEOUT_MS)) {
        sessionToolCalls = [];
        sessionMessages = [];
        sessionUiMessages = [];
        systemContextInjected = false;
        if (plugin.conversationStore) {
            try {
                currentSessionId = await plugin.conversationStore.create('mcp', 'Claude (MCP)');
                console.debug(`[MCP] New session: ${currentSessionId}`);
            } catch { /* non-fatal */ }
        } else {
            currentSessionId = `mcp-${now}`;
        }
    }

    sessionLastActivity = now;
}

async function updateSessionTitle(plugin: ObsidianAgentPlugin, tool: string): Promise<void> {
    sessionToolCalls.push(tool);

    if (!plugin.conversationStore || !currentSessionId) return;

    // Generate a title from the tools used
    const uniqueTools = [...new Set(sessionToolCalls)];
    const title = uniqueTools.length === 1
        ? `Claude: ${formatToolName(uniqueTools[0])}`
        : `Claude: ${uniqueTools.map(formatToolName).join(', ')}`;

    try {
        await plugin.conversationStore.updateMeta(currentSessionId, { title });
    } catch { /* non-fatal */ }
}

/** Accumulated messages for the current session (appended per tool call). */
let sessionMessages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> = [];
let sessionUiMessages: Array<{ role: 'user' | 'assistant'; text: string; ts: string }> = [];

async function logToolCallToHistory(
    plugin: ObsidianAgentPlugin,
    tool: string,
    args: Record<string, unknown>,
    result: McpToolResult,
): Promise<void> {
    if (!plugin.conversationStore || !currentSessionId) return;

    try {
        const now = new Date().toISOString();

        // Build human-readable description of what happened
        const description = buildHumanReadable(tool, args, result);

        // Log as compact tool summary (fallback if sync_session is never called)
        sessionMessages.push(
            { role: 'assistant', content: [{ type: 'text', text: description.request }] },
        );
        sessionUiMessages.push(
            { role: 'assistant', text: description.request, ts: now },
        );

        // Save all accumulated messages (conversationStore.save overwrites, so we always send the full list)
        await plugin.conversationStore.save(currentSessionId, sessionMessages, sessionUiMessages);
    } catch { /* non-fatal */ }
}

function buildHumanReadable(tool: string, args: Record<string, unknown>, result: McpToolResult): { request: string; response: string } {
    const resultText = result.content.map(c => c.text).join('\n');

    switch (tool) {
        case 'search_vault':
            return {
                request: `Search: "${str(args.query)}"`,
                response: resultText.slice(0, 500),
            };
        case 'read_notes': {
            const paths = (args.paths as string[]) ?? [];
            return {
                request: `Read: ${paths.map(p => p.split('/').pop()?.replace(/\.md$/, '')).join(', ')}`,
                response: resultText.slice(0, 500),
            };
        }
        case 'write_vault': {
            const ops = (args.operations as Array<{ type: string; path: string; content?: string }>) ?? [];
            const lines: string[] = [];
            for (const o of ops) {
                const name = o.path.split('/').pop()?.replace(/\.md$/, '') ?? o.path;
                if (o.type === 'create') lines.push(`Created "${name}" in ${o.path.substring(0, o.path.lastIndexOf('/')) || 'vault root'}`);
                else if (o.type === 'edit') lines.push(`Edited "${name}"`);
                else if (o.type === 'append') lines.push(`Appended to "${name}"`);
                else if (o.type === 'delete') lines.push(`Deleted "${name}"`);
            }
            return {
                request: lines.join('\n'),
                response: resultText,
            };
        }
        case 'get_context':
            return {
                request: 'Context loaded',
                response: 'Memory, vault stats, skills, and rules loaded.',
            };
        case 'sync_session':
            return {
                request: `Session saved: "${str(args.title)}"`,
                response: resultText,
            };
        case 'update_memory':
            return {
                request: `Memory updated (${str(args.category, 'unknown')}): ${str(args.content).slice(0, 100)}`,
                response: resultText,
            };
        case 'execute_vault_op':
            return {
                request: `${str(args.operation, 'vault operation')}: ${JSON.stringify(args.params ?? {}).slice(0, 100)}`,
                response: resultText.slice(0, 300),
            };
        default:
            return {
                request: formatToolName(tool),
                response: resultText.slice(0, 300),
            };
    }
}

function formatToolName(tool: string): string {
    return tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Get the current auto-tracked session ID (used by sync_session). */
export function getAutoSessionId(): string | null {
    return currentSessionId;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handleToolCall(
    plugin: ObsidianAgentPlugin,
    tool: string,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    // CodeQL #62: Use Map.get() to avoid unvalidated dynamic property access
    const handler = handlers.get(tool);
    if (!handler) {
        return {
            content: [{ type: 'text', text: `Unknown tool: ${tool}` }],
            isError: true,
        };
    }

    // Auto-track session
    await ensureSession(plugin);

    // Execute tool
    const startMs = Date.now();
    const result = await handler(plugin, args);

    // AUDIT-006 H-2: Audit logging for MCP operations
    if (plugin.operationLogger) {
        void plugin.operationLogger.log({
            timestamp: new Date().toISOString(),
            taskId: `mcp-${currentSessionId ?? 'unknown'}`,
            mode: 'mcp',
            tool: `mcp:${tool}`,
            params: args,
            result: result.content.map(c => c.text).join('\n').slice(0, 2000),
            success: !result.isError,
            durationMs: Date.now() - startMs,
        });
    }

    // Inject system context into the first tool response of each session
    // (sent to Claude but NOT logged to history)
    if (!systemContextInjected && tool !== 'sync_session') {
        systemContextInjected = true;
        try {
            const prompts = await buildPrompts(plugin);
            const contextText = prompts.map(p => typeof p.content === 'object' ? p.content.text : '').join('\n');
            if (contextText.trim()) {
                const originalText = result.content.map(c => c.text).join('\n');
                result.content = [{
                    type: 'text',
                    text: `${contextText}\n\n---\n\n${originalText}`,
                }];
            }
        } catch { /* non-fatal */ }
    }

    // Log to history only for non-sync tools (sync_session writes its own full transcript)
    if (tool !== 'sync_session' && tool !== 'get_context') {
        await logToolCallToHistory(plugin, tool, args, result);
    }
    void updateSessionTitle(plugin, tool);

    return result;
}
