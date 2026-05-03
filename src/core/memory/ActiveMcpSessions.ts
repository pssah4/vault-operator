/**
 * ActiveMcpSessions -- in-memory state for FIX-23-01-01 / ADR-110
 * Living-Document-Semantik im Cross-Surface MCP.
 *
 * Plugin haelt pro `(mcpToken, source_interface)`-Schluessel die
 * letzte aktive Conversation. save_conversation-Calls innerhalb
 * von 30 Minuten zur selben SessionKey appenden in dieselbe
 * Conversation, statt eine neue anzulegen.
 *
 * State liegt in-memory; Plugin-Reload schliesst alle Sessions.
 * Eviction-Tick alle 5 Minuten entfernt abgelaufene Sessions.
 */

import type { SourceInterface } from './SourceInterface';

export type SessionKey = string;

export interface ActiveSession {
    conversationId: string;
    crossInterfaceThreadId: string;
    lastTouchAt: number;          // ms
    isLivingDocument: boolean;
    /** Hash of the first 5 messages, used for fallback append-match. */
    initialMessagesHash: string;
}

export interface SessionLookupContext {
    mcpToken: string;
    sourceInterface: SourceInterface;
    livingDocument: boolean;
    initialMessagesHash: string;
    /** Optional: explicit conversation_id from the MCP call. Overrides timeout. */
    explicitConversationId?: string;
    /** Optional: explicit thread_id from the MCP call. Reused across surfaces. */
    explicitCrossInterfaceThreadId?: string;
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes -- D2

export class ActiveMcpSessions {
    private sessions: Map<SessionKey, ActiveSession> = new Map();

    /** Returns the active session for this key if it is still alive, else null. */
    peek(key: SessionKey): ActiveSession | null {
        const s = this.sessions.get(key);
        if (!s) return null;
        if (Date.now() - s.lastTouchAt > TIMEOUT_MS) {
            this.sessions.delete(key);
            return null;
        }
        return s;
    }

    /**
     * Decision-helper: given the lookup context, decide whether the
     * current save_conversation call should APPEND into an existing
     * conversation or CREATE a new one. Returns the appended-into
     * session OR null if a new conversation must be created.
     *
     * Append rules (Pass 7 -- relaxed for external clients that send
     * only the new turns instead of the full transcript):
     *   1. explicit conversation_id given AND matches active session
     *      -> append
     *   2. explicit conversation_id given that does NOT match active
     *      session -> create new (do not silently override)
     *   3. living_document=true AND active session exists -> APPEND.
     *      Hash-match no longer required because many MCP clients send
     *      only the delta-messages on subsequent calls. The 30-min
     *      timeout plus close_conversation tool are the safeguards
     *      against accidental cross-topic merging.
     *   4. else -> create new
     */
    decide(ctx: SessionLookupContext): ActiveSession | null {
        const key = makeKey(ctx.mcpToken, ctx.sourceInterface);
        const active = this.peek(key);

        if (ctx.explicitConversationId) {
            if (active && active.conversationId === ctx.explicitConversationId) {
                return active;
            }
            return null;
        }

        if (!ctx.livingDocument) return null;

        if (active) {
            return active;
        }

        return null;
    }

    /**
     * Register a new active session (after CREATE) or refresh an
     * existing one's lastTouchAt (after APPEND). Always overwrites
     * with the latest state.
     */
    register(
        ctx: SessionLookupContext,
        conversationId: string,
        crossInterfaceThreadId: string,
    ): void {
        const key = makeKey(ctx.mcpToken, ctx.sourceInterface);
        this.sessions.set(key, {
            conversationId,
            crossInterfaceThreadId,
            lastTouchAt: Date.now(),
            isLivingDocument: ctx.livingDocument,
            initialMessagesHash: ctx.initialMessagesHash,
        });
    }

    /**
     * Refresh lastTouchAt for an active session (used on every
     * APPEND so the timeout clock restarts).
     */
    touch(key: SessionKey): void {
        const s = this.sessions.get(key);
        if (s) s.lastTouchAt = Date.now();
    }

    /**
     * Explicit close (close_conversation tool). Removes the session
     * from the active map. Idempotent: returns true on a real
     * change, false if the session was already gone.
     */
    closeByConversationId(conversationId: string): boolean {
        for (const [key, s] of this.sessions) {
            if (s.conversationId === conversationId) {
                this.sessions.delete(key);
                return true;
            }
        }
        return false;
    }

    /** Eviction tick. Returns the count of removed sessions. */
    evictExpired(): number {
        const now = Date.now();
        let removed = 0;
        for (const [key, s] of this.sessions) {
            if (now - s.lastTouchAt > TIMEOUT_MS) {
                this.sessions.delete(key);
                removed += 1;
            }
        }
        return removed;
    }

    /** Diagnostic: count of active sessions. */
    size(): number {
        return this.sessions.size;
    }
}

export function makeKey(mcpToken: string, source: SourceInterface): SessionKey {
    // mcpToken is sensitive; we only need a stable, opaque key. Hash
    // collisions are not a security boundary here.
    return `${djb2(mcpToken)}:${source}`;
}

/**
 * djb2 hash, stable across runs. Used for sessionKey + for the
 * initialMessagesHash. Not cryptographic; matched length keeps the
 * key short.
 */
export function djb2(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash | 0; // 32-bit
    }
    return (hash >>> 0).toString(36);
}

/** Hash the first N messages for the append-match fallback. */
export function hashInitialMessages(messages: Array<{ role: string; text: string }>, n = 5): string {
    const slice = messages.slice(0, n).map((m) => `${m.role}:${m.text}`).join('||');
    return djb2(slice);
}

/** FIX-23-01-01: generate a Cross-Interface-Thread ID. Not cryptographic. */
export function generateThreadId(): string {
    const date = new Date().toISOString().slice(0, 10);
    const hex = Math.random().toString(16).slice(2, 8);
    return `thread-${date}-${hex}`;
}

/** Validate thread-ID format. Defends against LLM hallucinated IDs. */
export function isValidThreadId(id: unknown): id is string {
    return typeof id === 'string' && /^thread-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/.test(id);
}
