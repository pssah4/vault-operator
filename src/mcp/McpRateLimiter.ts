/**
 * AUDIT-015 M-1: Sliding-window rate limiter for MCP tool calls.
 *
 * Schuetzt vor Burst- und Volume-Attacken auf das exposierte
 * MCP-Surface. Token-Budget-Guards in Memory-v2 wirken nur in der
 * Pipeline; externe Aufrufer koennten unbegrenzt Tools rufen, was
 * Cost (LLM/Embedding) und Memory-DB-Last verursacht.
 *
 * Limit-Klassen pro Tool:
 *   - 'cheap': read-only ohne LLM (read_notes, search_vault, ...)
 *   - 'medium': mit LLM/embedding aber nicht extraction (recall_memory)
 *   - 'expensive': triggert Pipeline (save_conversation, save_to_memory)
 *
 * Zaehlt pro Minute. Caller key ist mcpToken + sourceInterface; das
 * ist die feinste Granularitaet, die wir heute haben (in der Praxis
 * gibt es nur einen Token, aber mehrere source_interfaces).
 */

export type RateLimitClass = 'cheap' | 'medium' | 'expensive';

export interface RateLimitDecision {
    allowed: boolean;
    /** When denied: seconds until the next call would be allowed. */
    retryAfterSec?: number;
    /** Diagnostic, immer gesetzt. */
    remainingInWindow: number;
    limitInWindow: number;
}

const LIMITS_PER_MINUTE: Record<RateLimitClass, number> = {
    cheap: 60,        // 1 pro Sekunde average
    medium: 30,       // 1 pro 2 Sekunden
    expensive: 10,    // alle 6 Sekunden -- LLM + Memory-Schreiben
};

const WINDOW_MS = 60_000;

export class McpRateLimiter {
    private buckets: Map<string, number[]> = new Map();

    /** Returns a decision; does NOT consume the slot. Use record() after. */
    check(callerKey: string, klass: RateLimitClass): RateLimitDecision {
        const now = Date.now();
        const limit = LIMITS_PER_MINUTE[klass];
        const bucketKey = `${callerKey}:${klass}`;
        const timestamps = this.buckets.get(bucketKey) ?? [];
        // Drop expired entries
        const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
        this.buckets.set(bucketKey, fresh);
        if (fresh.length >= limit) {
            const oldest = fresh[0];
            const retryAfterSec = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
            return {
                allowed: false,
                retryAfterSec: Math.max(1, retryAfterSec),
                remainingInWindow: 0,
                limitInWindow: limit,
            };
        }
        return {
            allowed: true,
            remainingInWindow: limit - fresh.length,
            limitInWindow: limit,
        };
    }

    /** Consume a slot. Call only after check() returned allowed=true. */
    record(callerKey: string, klass: RateLimitClass): void {
        const bucketKey = `${callerKey}:${klass}`;
        const timestamps = this.buckets.get(bucketKey) ?? [];
        timestamps.push(Date.now());
        this.buckets.set(bucketKey, timestamps);
    }

    /** Combined check + record in one step. */
    consume(callerKey: string, klass: RateLimitClass): RateLimitDecision {
        const decision = this.check(callerKey, klass);
        if (decision.allowed) this.record(callerKey, klass);
        return decision;
    }

    /** Diagnostic: total active buckets. */
    size(): number { return this.buckets.size; }

    /** Clean up buckets that are empty after expiration. Idempotent. */
    cleanup(): void {
        const now = Date.now();
        for (const [k, ts] of this.buckets) {
            const fresh = ts.filter((t) => now - t < WINDOW_MS);
            if (fresh.length === 0) this.buckets.delete(k);
            else this.buckets.set(k, fresh);
        }
    }
}

/**
 * Map MCP-tool-name -> rate-limit class. Default 'cheap' for unknown
 * tools (defensive: any new tool that hits the limiter must be
 * classified explicitly to step up).
 */
export const TOOL_RATE_CLASS: Readonly<Record<string, RateLimitClass>> = {
    // cheap: read-only, no LLM
    get_context: 'cheap',
    read_notes: 'cheap',
    search_vault: 'cheap',
    list_memory_source_notes: 'cheap',
    get_vault_implicit_edges: 'cheap',
    get_vault_note_metadata: 'cheap',
    close_conversation: 'cheap',

    // medium: embedding or moderate compute
    recall_memory: 'medium',
    search_history: 'medium',
    sync_session: 'medium',
    update_memory: 'medium',  // legacy, routes to save_to_memory
    execute_vault_op: 'medium',

    // expensive: LLM-extract or memory-write
    save_to_memory: 'expensive',
    save_conversation: 'expensive',
    write_vault: 'expensive',
    mark_note_as_memory_source: 'expensive',
    unmark_note_as_memory_source: 'expensive',
};

export function classifyTool(toolName: string): RateLimitClass {
    return TOOL_RATE_CLASS[toolName] ?? 'cheap';
}
