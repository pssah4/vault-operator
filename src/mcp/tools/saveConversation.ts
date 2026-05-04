/**
 * save_conversation -- BA-26 / FEAT-23-01.
 *
 * External MCP clients call this to copy a Chat conversation into
 * Obsilo's ConversationStore + HistoryDB. Conversation appears in
 * the matching source-tab of the History sidebar; Memory-extraction
 * triggers via ExtractionQueue when sync-mode resolves to 'auto'.
 *
 * sync-mode is resolved per-provider (FEAT-23-04). ChatGPT and
 * Perplexity default to 'manual' so family-shared accounts do not
 * leak into Sebastian's personal memory.
 *
 * FIX-23-01-01 / ADR-110: Living-Document-Semantik. Calls within the
 * same MCP-session-key (mcpToken + source_interface) within 30
 * minutes are appended to the existing conversation instead of
 * creating a new one. Cross-Interface-Thread-Klammer ueber
 * `cross_interface_thread_id` -- externer LLM kann die ID aus dem
 * ersten Result in folgenden Calls (auch mit anderem source_interface)
 * mitsenden, alle Conversations werden ueber das Thread-ID verbunden.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import type { MessageParam } from '../../api/types';
import {
    validateSourceInterface,
    resolveSyncMode,
    DEFAULT_CROSS_SURFACE_SETTINGS,
    type SourceInterface,
} from '../../core/memory/SourceInterface';
import {
    hashInitialMessages,
    generateThreadId,
    isValidThreadId,
    type SessionLookupContext,
} from '../../core/memory/ActiveMcpSessions';

interface InputMessage {
    role: 'user' | 'assistant';
    text: string;
    ts?: string;
}

/** AUDIT-015 H-1 / AUDIT-016 H-1: per-message text-cap. 100k chars
 *  per message ist grosszuegig (Kapazitaet eines mittleren Buch-
 *  Kapitels) und schliesst den DoS-Vektor "500 messages * beliebige
 *  Groesse" zuverlaessig. Exportiert damit sync_session denselben Cap
 *  nutzt (DRY). */
export const MAX_MESSAGE_TEXT_LENGTH = 100_000;
/** Max parallel transcript-Eintraege fuer Bulk-Save-Tools. */
export const MAX_MESSAGES_PER_CALL = 500;

function isInputMessage(m: unknown): m is InputMessage {
    return typeof m === 'object' && m !== null
        && typeof (m as { role?: unknown }).role === 'string'
        && ((m as { role?: string }).role === 'user' || (m as { role?: string }).role === 'assistant')
        && typeof (m as { text?: unknown }).text === 'string'
        && (m as { text: string }).text.length <= MAX_MESSAGE_TEXT_LENGTH;
}

export async function handleSaveConversation(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const messagesRaw = args.messages;
    if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
        return errorResult('messages array is required and must be non-empty');
    }
    const messages: InputMessage[] = messagesRaw.filter(isInputMessage);
    if (messages.length === 0) {
        return errorResult(
            `messages had no valid {role, text} entries. Note: each message text is capped `
            + `at ${MAX_MESSAGE_TEXT_LENGTH} characters; longer messages are rejected.`,
        );
    }
    if (messages.length > MAX_MESSAGES_PER_CALL) {
        return errorResult(`too many messages (max ${MAX_MESSAGES_PER_CALL}); split into multiple conversations`);
    }
    // Reject the call if ANY message of the original raw array was
    // dropped by isInputMessage -- silent truncation would lose data.
    if (messages.length !== messagesRaw.length) {
        return errorResult(
            `${messagesRaw.length - messages.length} of ${messagesRaw.length} messages were `
            + `rejected (invalid shape, role not user/assistant, or text > ${MAX_MESSAGE_TEXT_LENGTH} chars). `
            + `Fix the input or split long messages.`,
        );
    }

    const sourceInterface = validateSourceInterface(args.source_interface);
    if (sourceInterface === 'obsilo') {
        return errorResult('source_interface "obsilo" is reserved for the plugin itself');
    }
    const title = typeof args.title === 'string' && args.title.trim()
        ? args.title.trim().slice(0, 200)
        : `${sourceInterface} conversation`;

    const store = plugin.conversationStore;
    if (!store) {
        return errorResult('ConversationStore is not available');
    }

    // Resolve sync-mode per provider.
    const crossSurface = plugin.settings.memory?.crossSurface ?? DEFAULT_CROSS_SURFACE_SETTINGS;
    const syncMode = resolveSyncMode(sourceInterface, crossSurface);
    const syncState = syncMode === 'auto' ? 'confirmed' : 'pending';

    // FIX-23-01-01: Living-Document-Decision. Default true (Settings),
    // per-call living_document=false ueberschreibt.
    const livingDocumentDefault = crossSurface.livingDocumentByDefault ?? true;
    const livingDocument = typeof args.living_document === 'boolean'
        ? args.living_document
        : livingDocumentDefault;

    const explicitConversationId = typeof args.conversation_id === 'string'
        ? args.conversation_id
        : undefined;
    const explicitThreadId = isValidThreadId(args.cross_interface_thread_id)
        ? args.cross_interface_thread_id
        : undefined;

    // Append vs Create decision via ActiveMcpSessions
    const sessions = plugin.activeMcpSessions;
    const mcpToken = plugin.settings.mcpServerToken ?? '';
    const initialMessagesHash = hashInitialMessages(messages);

    const sessionCtx = {
        mcpToken,
        sourceInterface,
        livingDocument,
        initialMessagesHash,
        explicitConversationId,
        explicitCrossInterfaceThreadId: explicitThreadId,
    };
    const activeSession = sessions?.decide(sessionCtx) ?? null;

    try {
        if (activeSession) {
            return await appendToActive(plugin, activeSession, messages, title, syncMode);
        }
        return await createNew(plugin, messages, title, sourceInterface, syncState, syncMode, sessionCtx, explicitThreadId);
    } catch (e) {
        return errorResult(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function createNew(
    plugin: ObsidianAgentPlugin,
    messages: InputMessage[],
    title: string,
    sourceInterface: SourceInterface,
    syncState: 'pending' | 'confirmed',
    syncMode: 'auto' | 'manual',
    sessionCtx: SessionLookupContext,
    explicitThreadId: string | undefined,
): Promise<McpToolResult> {
    const store = plugin.conversationStore!;

    // Cross-Interface-Thread-ID: nutze die explizit mitgegebene wenn
    // valide, sonst generiere eine neue.
    const crossInterfaceThreadId = explicitThreadId ?? generateThreadId();

    const id = await store.create('mcp', sourceInterface, { sourceInterface, syncState });
    await store.updateMeta(id, { title, crossInterfaceThreadId });

    const apiMessages: MessageParam[] = messages.map((m) => ({
        role: m.role,
        content: m.text,
    }));
    const uiMessages = messages.map((m) => ({
        role: m.role,
        text: m.text,
        ts: m.ts ?? new Date().toISOString(),
    }));
    await store.save(id, apiMessages, uiMessages);

    // Index into HistoryDB
    try {
        await plugin.historyIndexer?.onConversationSaved?.(id, uiMessages);
    } catch (e) {
        console.debug('[save_conversation] HistoryIndexer notify failed:', e);
    }

    // Register in ActiveMcpSessions
    plugin.activeMcpSessions?.register(sessionCtx, id, crossInterfaceThreadId);

    // Auto-sync: trigger memory extraction
    if (syncMode === 'auto' && plugin.extractionQueue) {
        try {
            await plugin.extractionQueue.enqueue({
                conversationId: id,
                messages: messages.map((m) => ({ role: m.role, text: m.text })),
                title,
                queuedAt: new Date().toISOString(),
            });
        } catch (e) {
            console.debug('[save_conversation] enqueue failed:', e);
        }
    }

    const stateMsg = syncMode === 'auto'
        ? 'confirmed (auto-sync)'
        : 'pending (manual-sync; star or mark_for_memory to confirm)';
    const livingMsg = (sessionCtx.livingDocument)
        ? 'Living-Document active: subsequent save_conversation calls within 30min from the same source append into this conversation. '
            + `Pass conversation_id="${id}" or cross_interface_thread_id="${crossInterfaceThreadId}" (also across source_interface) to keep them linked.`
        : 'Living-Document disabled for this call -- treated as standalone conversation.';

    return {
        content: [{
            type: 'text',
            text: `Conversation ${id} created (${messages.length} messages, source: ${sessionCtx.sourceInterface}, ${stateMsg}). `
                + `cross_interface_thread_id: ${crossInterfaceThreadId}. ${livingMsg}`,
        }],
    };
}

async function appendToActive(
    plugin: ObsidianAgentPlugin,
    activeSession: { conversationId: string; crossInterfaceThreadId: string },
    messages: InputMessage[],
    title: string,
    syncMode: 'auto' | 'manual',
): Promise<McpToolResult> {
    const store = plugin.conversationStore!;
    const data = await store.load(activeSession.conversationId);
    if (!data) {
        // Active session referenced a deleted conversation. Should be rare;
        // strip and return a concise error so the next call falls into create.
        plugin.activeMcpSessions?.closeByConversationId(activeSession.conversationId);
        return errorResult(`Active conversation ${activeSession.conversationId} no longer exists; please retry to create a fresh one.`);
    }

    // Compute the delta: messages the caller sent that are not yet
    // persisted. Two strategies:
    //   1. Caller sent the FULL conversation again (Claude.ai pattern):
    //      delta = caller messages beyond data.uiMessages.length.
    //   2. Caller sent ONLY the new turns (compact pattern):
    //      delta = all caller messages.
    // Heuristic: if first caller message matches first persisted message
    // by role+text, we are in case 1.
    let delta: InputMessage[];
    if (
        data.uiMessages.length > 0
        && messages[0]?.role === data.uiMessages[0].role
        && messages[0]?.text === data.uiMessages[0].text
    ) {
        delta = messages.slice(data.uiMessages.length);
    } else {
        delta = messages;
    }

    if (delta.length === 0) {
        // Nothing new -- still touch the session so the timeout clock restarts.
        return {
            content: [{
                type: 'text',
                text: `No new messages to append to conversation ${activeSession.conversationId}. `
                    + `Session timeout refreshed.`,
            }],
        };
    }

    const deltaApi: MessageParam[] = delta.map((m) => ({ role: m.role, content: m.text }));
    const deltaUi = delta.map((m) => ({
        role: m.role,
        text: m.text,
        ts: m.ts ?? new Date().toISOString(),
    }));
    const newCount = await store.appendMessages(activeSession.conversationId, deltaApi, deltaUi);

    // Re-index the delta messages
    try {
        await plugin.historyIndexer?.onConversationSaved?.(activeSession.conversationId, deltaUi);
    } catch (e) {
        console.debug('[save_conversation append] HistoryIndexer notify failed:', e);
    }

    // Memory extraction: re-enqueue the FULL message stream. The
    // SingleCallProcessor uses lastExtractedMessageIndex to extract
    // only the delta (FEAT-03-18 Phase 4).
    if (syncMode === 'auto' && plugin.extractionQueue) {
        try {
            const allMessages = [...data.uiMessages, ...deltaUi].map((m) => ({ role: m.role, text: m.text }));
            await plugin.extractionQueue.enqueue({
                conversationId: activeSession.conversationId,
                messages: allMessages as { role: 'user' | 'assistant'; text: string }[],
                title,
                queuedAt: new Date().toISOString(),
            });
        } catch (e) {
            console.debug('[save_conversation append] enqueue failed:', e);
        }
    }

    return {
        content: [{
            type: 'text',
            text: `Conversation ${activeSession.conversationId} appended (${delta.length} new messages, total ${newCount}). `
                + `cross_interface_thread_id: ${activeSession.crossInterfaceThreadId}.`,
        }],
    };
}

function errorResult(text: string): McpToolResult {
    return { content: [{ type: 'text', text: 'Error: ' + text }], isError: true };
}
