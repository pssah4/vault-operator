/**
 * ExtractionQueue
 *
 * Persistent FIFO queue for background memory extraction jobs.
 * Survives Obsidian restarts via pending-extractions.json.
 *
 * Processing runs in the background — one item at a time,
 * with a configurable delay between items.
 */

import type { FileAdapter } from '../storage/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingExtractionMessage {
    role: 'user' | 'assistant';
    text: string;
}

export interface PendingExtraction {
    conversationId: string;
    /** Full conversation messages -- delta-window slicing happens in the processor. */
    messages: PendingExtractionMessage[];
    title: string;
    queuedAt: string;
    /**
     * Bypass-Flag (FEATURE-0318 / PLAN-007 task A.6): set by explicit
     * user-triggered saves (Star button, /save now command, mark_for_memory
     * tool) and by mid-conversation drift detection. Consumers that
     * implement min-message-count throttling check this and skip the
     * throttle when true. The queue itself does not gate on it; the flag
     * survives serialise/load so a queued bypass item keeps its
     * status across plugin restarts.
     */
    bypassThrottle?: boolean;
}

export type ExtractionProcessor = (item: PendingExtraction) => Promise<void>;

// ---------------------------------------------------------------------------
// ExtractionQueue
// ---------------------------------------------------------------------------

/**
 * Persistent errors that should pause extraction for the rest of the session
 * instead of retrying on every single item. BUG-016: a user with an Anthropic
 * memory model configured but no credits got 400s on EVERY reload — the queue
 * never drained because each session re-triggered the same upstream failure.
 */
function isPermanentProviderError(e: unknown): boolean {
    const rawMessage = (e as { message?: unknown })?.message;
    const msg = typeof rawMessage === 'string'
        ? rawMessage
        : typeof e === 'string'
            ? e
            : '';
    const statusCode = (e as { status?: number })?.status;
    if (statusCode === 401 || statusCode === 402 || statusCode === 403) return true;
    // Provider-specific credit / quota messages that surface as 400 in some SDKs.
    if (/credit balance is too low|insufficient.?quota|quota.?exceeded|invalid.?api.?key|api.?key.?not.?found|authentication.?failed/i.test(msg)) return true;
    return false;
}

export class ExtractionQueue {
    private items: PendingExtraction[] = [];
    private filePath: string;
    private processing = false;
    private processor: ExtractionProcessor | null = null;
    /** Delay between processing items (ms). */
    private delayMs = 2000;
    /** BUG-016: once a permanent provider error hits, stop trying until plugin reload. */
    private sessionDisabledReason: string | null = null;
    /**
     * Re-extraction throttle (FEATURE-0319 Phase 5): per-conversationId
     * timestamp of the last enqueue. Auto-extract paths skip if the
     * window hasn't elapsed; bypassThrottle items always pass.
     */
    private lastEnqueuedAt: Map<string, number> = new Map();
    private throttleMs = 60_000;

    constructor(private fs: FileAdapter) {
        this.filePath = 'pending-extractions.json';
    }

    /** Configure the throttle window between automatic re-extracts. */
    setThrottleMs(ms: number): void {
        this.throttleMs = Math.max(0, ms);
    }

    /**
     * IMP-03-18-02: clear the per-conversation throttle marker so the
     * next auto-enqueue passes the throttle gate immediately. Used by
     * the DriftEventBus subscriber: when a topic drifts, we want the
     * fresh extraction to happen now even if the conversation was
     * just enqueued. We do not enqueue here directly because the
     * drift event carries no message payload -- the next normal
     * enqueue trigger (AgentSidebarView push) will produce the work.
     */
    clearThrottle(conversationId: string): void {
        this.lastEnqueuedAt.delete(conversationId);
    }

    // -----------------------------------------------------------------------
    // Setup
    // -----------------------------------------------------------------------

    /** Set the function that processes each queue item. */
    setProcessor(fn: ExtractionProcessor): void {
        this.processor = fn;
    }

    // -----------------------------------------------------------------------
    // Queue operations
    // -----------------------------------------------------------------------

    async enqueue(item: PendingExtraction): Promise<void> {
        // Throttle gate: skip auto-enqueue when the same conversation
        // was enqueued within the throttle window. bypassThrottle items
        // (Star button, mark_for_memory tool) ignore the gate.
        if (!item.bypassThrottle && this.throttleMs > 0) {
            const last = this.lastEnqueuedAt.get(item.conversationId);
            if (last !== undefined && Date.now() - last < this.throttleMs) {
                console.debug(
                    `[ExtractionQueue] throttle skip ${item.conversationId} (${Date.now() - last}ms < ${this.throttleMs}ms)`,
                );
                return;
            }
        }
        this.lastEnqueuedAt.set(item.conversationId, Date.now());
        this.items.push(item);
        await this.save();
        // Kick off processing if not already running
        void this.processQueue();
    }

    /**
     * Enqueue with bypassThrottle=true. Convenience wrapper for the
     * Star button / "/save now" / mark_for_memory paths so callers
     * cannot accidentally forget to set the flag.
     */
    async enqueueImmediate(item: Omit<PendingExtraction, 'bypassThrottle'>): Promise<void> {
        await this.enqueue({ ...item, bypassThrottle: true });
    }

    dequeue(): PendingExtraction | undefined {
        return this.items.shift();
    }

    peek(): PendingExtraction | undefined {
        return this.items[0];
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    size(): number {
        return this.items.length;
    }

    // -----------------------------------------------------------------------
    // Persistence
    // -----------------------------------------------------------------------

    async load(): Promise<void> {
        try {
            const raw = await this.fs.read(this.filePath);
            const parsed = JSON.parse(raw);
            // v2 shape: { items: [...], lastEnqueuedAt: { [id]: ts } }
            // v1 shape (back-compat): plain array of items, no throttle state.
            if (Array.isArray(parsed)) {
                this.items = parsed;
                this.lastEnqueuedAt.clear();
            } else if (parsed && typeof parsed === 'object') {
                this.items = Array.isArray(parsed.items) ? parsed.items : [];
                this.lastEnqueuedAt.clear();
                if (parsed.lastEnqueuedAt && typeof parsed.lastEnqueuedAt === 'object') {
                    for (const [id, ts] of Object.entries(parsed.lastEnqueuedAt as Record<string, unknown>)) {
                        if (typeof ts === 'number' && Number.isFinite(ts)) {
                            this.lastEnqueuedAt.set(id, ts);
                        }
                    }
                    // Drop entries older than the throttle window twice over --
                    // anything older has no chance of blocking a future enqueue.
                    const cutoff = Date.now() - 2 * this.throttleMs;
                    for (const [id, ts] of [...this.lastEnqueuedAt]) {
                        if (ts < cutoff) this.lastEnqueuedAt.delete(id);
                    }
                }
            } else {
                this.items = [];
            }
        } catch {
            this.items = [];
            this.lastEnqueuedAt.clear();
        }
    }

    async save(): Promise<void> {
        const payload = {
            items: this.items,
            lastEnqueuedAt: Object.fromEntries(this.lastEnqueuedAt),
        };
        await this.fs.write(this.filePath, JSON.stringify(payload, null, 2));
    }

    // -----------------------------------------------------------------------
    // Background processing
    // -----------------------------------------------------------------------

    /**
     * Process all pending items one by one.
     * Runs in the background. Safe to call multiple times (re-entrant guard).
     */
    async processQueue(): Promise<void> {
        if (this.processing || !this.processor) return;
        if (this.sessionDisabledReason) {
            // BUG-016: a permanent provider error hit earlier this session —
            // don't burn requests on a queue item we already know will fail.
            return;
        }
        this.processing = true;

        try {
            while (!this.isEmpty()) {
                const item = this.peek();
                if (!item) break;

                try {
                    await this.processor(item);
                    // Success — remove from queue
                    this.dequeue();
                    await this.save();
                } catch (e) {
                    if (isPermanentProviderError(e)) {
                        // BUG-016: auth / credit / quota failure on the memory model.
                        // Retrying on every queue item would spam error logs. Disable
                        // extraction for this session, surface ONE warning, leave the
                        // queue intact so the user can fix the model and reload.
                        this.sessionDisabledReason = (e as Error)?.message ?? 'permanent provider error';
                        console.warn(
                            `[Memory] Extraction paused for this session (memory model returned a permanent error: ${this.sessionDisabledReason}). ` +
                                `Fix the configured memory model in Settings > Memory, then reload Obsidian to resume.`,
                        );
                        break;
                    }
                    // Transient failure — leave in queue for retry on next startup, stop processing
                    console.warn(`[Memory] Extraction failed for ${item.conversationId}, will retry on next startup:`, e);
                    break;
                }

                // Delay between items to avoid hammering the LLM
                if (!this.isEmpty()) {
                    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
                }
            }
        } finally {
            this.processing = false;
        }
    }

    /** BUG-016: true once extraction was paused by a permanent provider error. */
    isSessionDisabled(): boolean {
        return this.sessionDisabledReason !== null;
    }

    /** BUG-016: human-readable reason for why extraction was paused. */
    getSessionDisabledReason(): string | null {
        return this.sessionDisabledReason;
    }
}
