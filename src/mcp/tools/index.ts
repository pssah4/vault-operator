/**
 * MCP Tool Dispatcher -- routes tool calls to the appropriate handler.
 *
 * Automatically tracks all tool calls as a session in Vault Operator's chat history.
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

/**
 * FIX-23-01-04 (Pass 9): ensureSession ist jetzt LAZY -- es markiert
 * nur die Session-Grenze (Timeout-Reset), legt aber KEINE
 * ConversationStore-Row mehr an. Die Conversation wird beim ERSTEN
 * Aufruf von logToolCallToHistory tatsaechlich erzeugt
 * (createSessionIfNeeded). Das verhindert, dass jeder MCP-Tool-Call
 * (auch save_conversation, das seinen eigenen Storage-Pfad hat)
 * eine leere "Claude (MCP)"-Conversation im Unknown-Tab hinterlaesst.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async kept lazily for the in-flight refactor that wires ConversationStore.create here once FIX-23-01-04 lands its second pass
async function ensureSession(plugin: ObsidianAgentPlugin): Promise<void> {
    const now = Date.now();

    if (sessionLastActivity === 0 || (now - sessionLastActivity > SESSION_TIMEOUT_MS)) {
        sessionToolCalls = [];
        sessionMessages = [];
        sessionUiMessages = [];
        systemContextInjected = false;
        currentSessionId = null;  // lazy: wird beim ersten Log-Call erzeugt
    }

    sessionLastActivity = now;
}

/**
 * Lazy create the auto-tracked Conversation. Called by
 * logToolCallToHistory and updateSessionTitle on demand. No-op if
 * already created.
 */
async function createSessionIfNeeded(plugin: ObsidianAgentPlugin): Promise<void> {
    if (currentSessionId) return;
    if (!plugin.conversationStore) {
        currentSessionId = `mcp-${Date.now()}`;
        return;
    }
    try {
        currentSessionId = await plugin.conversationStore.create('mcp', 'Claude (MCP)', {
            sourceInterface: 'unknown',
        });
        console.debug(`[MCP] New auto-tracked session: ${currentSessionId}`);
    } catch { /* non-fatal */ }
}

async function updateSessionTitle(plugin: ObsidianAgentPlugin, tool: string): Promise<void> {
    sessionToolCalls.push(tool);

    // Lazy: only update title when an auto-tracked session was already created.
    // Skip-pure tools (save_conversation et al.) leave currentSessionId null.
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
    if (!plugin.conversationStore) return;
    // Lazy: erzeuge die auto-tracked Conversation hier, nicht in
    // ensureSession. Damit entstehen keine leeren ConversationStore-
    // Rows mehr, wenn ausschliesslich SKIP_AUTO_TRACK-Tools gerufen
    // wurden (save_conversation etc.).
    await createSessionIfNeeded(plugin);
    if (!currentSessionId) return;

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

    // AUDIT-015 M-1: Rate-Limit-Check vor jeglicher Verarbeitung.
    // Caller-Key = mcpToken + source_interface (falls mitgegeben).
    // 429-Antwort mit retry_after-Sek wenn Limit ueberschritten.
    const rateLimiter = plugin.mcpRateLimiter;
    if (rateLimiter) {
        const { classifyTool } = await import('../McpRateLimiter');
        const callerKey = `${plugin.settings.mcpServerToken ?? ''}:${
            typeof args.source_interface === 'string' ? args.source_interface : 'unknown'
        }`;
        const decision = rateLimiter.consume(callerKey, classifyTool(tool));
        if (!decision.allowed) {
            return {
                content: [{
                    type: 'text',
                    text: `Rate limit exceeded for tool "${tool}" (limit ${decision.limitInWindow}/min). `
                        + `Retry after ${decision.retryAfterSec}s.`,
                }],
                isError: true,
            };
        }
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

    // Log to history only for tools that don't write their own full
    // transcript. Pass 8 (FIX-23-01-03): EPIC-23 Cross-Surface tools
    // (save_conversation, save_to_memory, close_conversation, recall_*,
    // search_history, update_memory) write into ConversationStore /
    // FactStore directly. Auto-tracking would create a duplicate
    // 'unknown'-tab entry, so we skip them here.
    const SKIP_AUTO_TRACK = new Set([
        'sync_session',
        'get_context',
        'save_conversation',
        'save_to_memory',
        'close_conversation',
        'recall_memory',
        'search_history',
        'update_memory', // legacy, also routes to v2
    ]);
    if (!SKIP_AUTO_TRACK.has(tool)) {
        await logToolCallToHistory(plugin, tool, args, result);
    }
    void updateSessionTitle(plugin, tool);

    return result;
}
