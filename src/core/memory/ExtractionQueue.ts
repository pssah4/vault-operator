/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * ExtractionQueue
 *
 * Persistent FIFO queue for background memory extraction jobs.
 * Survives Obsidian restarts via pending-extractions.json.
 *
 * Processing runs in the background -- one item at a time, with a configurable
 * delay between items. Transient failures bump a per-item failureCount and
 * schedule a 60s * failureCount backoff retry; reaching 3 failures parks the
 * item and emits a `memory.extraction.dropped` telemetry event. Permanent
 * provider errors (401/402/403, credit/quota) disable the whole session and
 * also fire the drop event. Cancellation: a reload calls cancelInFlight() to
 * abort the in-flight API call AND clear any pending retry timer before
 * memoryDB.close(), so the post-extract block in SingleCallProcessor cannot
 * race against a closed database.
 */

import type { FileAdapter } from '../storage/types';
import type { MemoryV2Telemetry } from './MemoryV2Telemetry';

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
    /**
     * FIX-32-03-03: number of transient failures so far. Defaults to 0 on
     * enqueue and on v1-shape load. Persisted across reloads so an item that
     * already failed twice does not get a fresh budget on plugin reload.
     */
    failureCount?: number;
    /**
     * FIX-32-03-03: timestamp (Unix ms) of the next scheduled retry, set
     * alongside failureCount when a transient error fires. Diagnostic only;
     * the actual retry is driven by an in-memory setTimeout that is cleared
     * by cancelInFlight() and does not survive reload (the queue picks the
     * item up again on next processQueue() call after load).
     */
    nextRetryAt?: number;
}

export type ExtractionProcessor =
    (item: PendingExtraction, signal?: AbortSignal) => Promise<void>;

export interface QueueHealth {
    /** Items in the active queue waiting to be processed. */
    pending: number;
    /** Items parked after exceeding the failure-count threshold. */
    parked: number;
    /** Set when extraction is paused by a permanent provider error. */
    sessionDisabledReason?: string;
    /** Last error encountered while draining the queue (any kind). */
    lastError?: { kind: 'transient' | 'permanent' | 'cancelled'; message: string; at: string };
}

/** FIX-32-03-03: parking threshold = three consecutive transient failures. */
const PARK_THRESHOLD = 3;
/** Linear backoff base for transient retries. */
const BACKOFF_BASE_MS = 60_000;

// ---------------------------------------------------------------------------
// ExtractionQueue
// ---------------------------------------------------------------------------

/**
 * Permanent provider errors should pause extraction for the rest of the session
 * instead of retrying on every single item. BUG-016: a user with an Anthropic
 * memory model configured but no credits got 400s on EVERY reload -- the queue
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
    if (/credit balance is too low|insufficient.?quota|quota.?exceeded|invalid.?api.?key|api.?key.?not.?found|authentication.?failed/i.test(msg)) return true;
    return false;
}

export class ExtractionQueue {
    private items: PendingExtraction[] = [];
    private parkedItems: PendingExtraction[] = [];
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
    /** FIX-32-03-02: aborts the in-flight processor call. */
    private abortController: AbortController | null = null;
    /**
     * FIX-32-03-02: belt-and-suspenders companion to abortController. The
     * AbortController only signals; this boolean lets the while loop and any
     * already-queued setTimeout callback bail out synchronously even when
     * the abort signal fires between two macrotasks. Cleared by load() and
     * the next successful enqueue, so cancellation never sticks across the
     * caller's next intent to drain the queue.
     */
    private cancelled = false;
    /** FIX-32-03-03: pending retry timer; cleared by cancelInFlight(). */
    private retryTimer: number | null = null;
    private retryTimerItemId: string | null = null;
    /** FIX-32-03-03: most recent error visible to getQueueHealth(). */
    private lastError: QueueHealth['lastError'] | undefined;
    /** FIX-32-03-03: telemetry sink for park/drop events. Optional. */
    private telemetry: MemoryV2Telemetry | null = null;

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

    /** FIX-32-03-03: inject telemetry sink for park/drop events. */
    setTelemetry(telemetry: MemoryV2Telemetry | null): void {
        this.telemetry = telemetry;
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
        // FIX-32-03-03: every newly enqueued item starts with failureCount=0.
        this.items.push({ ...item, failureCount: item.failureCount ?? 0 });
        // Clearing the cancellation latch lets a fresh enqueue re-enter the
        // drain loop even if a prior plugin lifecycle had aborted in-flight.
        this.cancelled = false;
        await this.save();
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

    /** FIX-32-03-03: items that exceeded the failure-count threshold. */
    parkedSize(): number {
        return this.parkedItems.length;
    }

    /** FIX-32-03-03: queue health snapshot for diagnostics / UI surface. */
    getQueueHealth(): QueueHealth {
        const out: QueueHealth = {
            pending: this.items.length,
            parked: this.parkedItems.length,
        };
        if (this.sessionDisabledReason) out.sessionDisabledReason = this.sessionDisabledReason;
        if (this.lastError) out.lastError = this.lastError;
        return out;
    }

    // -----------------------------------------------------------------------
    // Persistence
    // -----------------------------------------------------------------------

    async load(): Promise<void> {
        try {
            const raw = await this.fs.read(this.filePath);
            const parsed = JSON.parse(raw);
            // v3 shape: { version: 3, items, parkedItems, lastEnqueuedAt }
            // v2 shape: { items, lastEnqueuedAt } -- no parkedItems
            // v1 shape: plain array of items (back-compat)
            const migrate = (raws: unknown[]): PendingExtraction[] =>
                raws.filter((x): x is PendingExtraction => !!x && typeof x === 'object')
                    .map((x) => ({ ...(x as PendingExtraction), failureCount: (x as PendingExtraction).failureCount ?? 0 }));
            if (Array.isArray(parsed)) {
                this.items = migrate(parsed);
                this.parkedItems = [];
                this.lastEnqueuedAt.clear();
            } else if (parsed && typeof parsed === 'object') {
                this.items = Array.isArray(parsed.items) ? migrate(parsed.items) : [];
                this.parkedItems = Array.isArray(parsed.parkedItems) ? migrate(parsed.parkedItems) : [];
                this.lastEnqueuedAt.clear();
                if (parsed.lastEnqueuedAt && typeof parsed.lastEnqueuedAt === 'object') {
                    for (const [id, ts] of Object.entries(parsed.lastEnqueuedAt as Record<string, unknown>)) {
                        if (typeof ts === 'number' && Number.isFinite(ts)) {
                            this.lastEnqueuedAt.set(id, ts);
                        }
                    }
                    const cutoff = Date.now() - 2 * this.throttleMs;
                    for (const [id, ts] of [...this.lastEnqueuedAt]) {
                        if (ts < cutoff) this.lastEnqueuedAt.delete(id);
                    }
                }
            } else {
                this.items = [];
                this.parkedItems = [];
            }
        } catch {
            this.items = [];
            this.parkedItems = [];
            this.lastEnqueuedAt.clear();
        }
        // Cancellation never survives a load -- the caller is opting into a new
        // drain by calling load() and (almost always) processQueue() next.
        this.cancelled = false;
    }

    async save(): Promise<void> {
        const payload = {
            version: 3,
            items: this.items,
            parkedItems: this.parkedItems,
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
            // BUG-016: a permanent provider error hit earlier this session --
            // don't burn requests on a queue item we already know will fail.
            return;
        }
        if (this.cancelled) {
            // FIX-32-03-02: a cancelInFlight() landed before processQueue()
            // got a chance to start; treat as a no-op until the next enqueue.
            return;
        }
        this.processing = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            while (!this.isEmpty()) {
                if (this.cancelled) break;
                const item = this.peek();
                if (!item) break;

                try {
                    await this.processor(item, signal);
                    // Success -- remove from queue
                    this.dequeue();
                    await this.save();
                } catch (e) {
                    const err = e as Error;
                    const name = err?.name;

                    // (a) FIX-32-03-02: AbortError -- intentional cancel. Do not
                    // bump failureCount, do not park, do not dequeue. The next
                    // load+processQueue picks the item up unchanged.
                    if (name === 'AbortError' || signal.aborted) {
                        this.lastError = { kind: 'cancelled', message: err?.message ?? 'aborted', at: new Date().toISOString() };
                        break;
                    }

                    // (b) FIX-32-03-03: EmptyExtractionError -- not a failure.
                    // Dequeue without failureCount bump or telemetry; the
                    // processor signalled there is nothing new to extract.
                    if (name === 'EmptyExtractionError') {
                        this.dequeue();
                        await this.save();
                        continue;
                    }

                    // (c) Permanent provider error -- disable session + drop.
                    if (isPermanentProviderError(err)) {
                        this.sessionDisabledReason = err?.message ?? 'permanent provider error';
                        this.lastError = { kind: 'permanent', message: this.sessionDisabledReason, at: new Date().toISOString() };
                        await this.telemetry?.extractionDropped({
                            reason: 'permanent-error',
                            failureCount: item.failureCount ?? 0,
                            conversationId: item.conversationId,
                            message: this.sessionDisabledReason,
                        });
                        console.warn(
                            `[Memory] Extraction paused for this session (memory model returned a permanent error: ${this.sessionDisabledReason}). ` +
                                `Fix the configured memory model in Settings > Memory, then reload Obsidian to resume.`,
                        );
                        break;
                    }

                    // (d) Transient failure -- bump failureCount, park or back off.
                    const next = (item.failureCount ?? 0) + 1;
                    item.failureCount = next;
                    this.lastError = { kind: 'transient', message: err?.message ?? String(err), at: new Date().toISOString() };

                    if (next >= PARK_THRESHOLD) {
                        // Park the item: pull it off the active queue, push it
                        // onto parkedItems, emit telemetry, and continue the loop.
                        const parked = this.dequeue();
                        if (parked) this.parkedItems.push(parked);
                        await this.save();
                        await this.telemetry?.extractionDropped({
                            reason: 'transient-failures',
                            failureCount: next,
                            conversationId: item.conversationId,
                            message: this.lastError.message,
                        });
                        console.warn(`[Memory] Extraction parked for ${item.conversationId} after ${next} failures; not retried until plugin reload.`);
                        continue;
                    }

                    // Schedule a 60s * failureCount retry. We persist
                    // nextRetryAt for diagnostics, then break out of the loop;
                    // the timer re-enters processQueue() when it fires.
                    const delay = BACKOFF_BASE_MS * next;
                    item.nextRetryAt = Date.now() + delay;
                    await this.save();
                    if (this.retryTimer) window.clearTimeout(this.retryTimer);
                    const itemId = item.conversationId;
                    this.retryTimerItemId = itemId;
                    this.retryTimer = window.setTimeout(() => {
                        this.retryTimer = null;
                        this.retryTimerItemId = null;
                        // FIX-32-03-02 race guard: respect cancellation set
                        // between scheduling and firing -- this branch runs
                        // after cancelInFlight has nulled the timer AND set
                        // the cancelled flag.
                        if (this.cancelled) return;
                        void this.processQueue();
                    }, delay);
                    console.warn(`[Memory] Extraction failed for ${itemId} (attempt ${next}/${PARK_THRESHOLD}); retrying in ${Math.round(delay / 1000)}s.`, err);
                    break;
                }

                if (this.cancelled) break;
                // Delay between items to avoid hammering the LLM
                if (!this.isEmpty()) {
                    await new Promise<void>((resolve) => window.setTimeout(resolve, this.delayMs));
                }
            }
        } finally {
            this.processing = false;
            this.abortController = null;
        }
    }

    /**
     * FIX-32-03-02: abort the in-flight processor call and clear any pending
     * retry timer. Idempotent: safe to call when no run is active. Must run
     * BEFORE memoryDB.close() in main.onunload so SingleCallProcessor's
     * post-extract block sees the closed-DB and exits early without errors.
     */
    cancelInFlight(): void {
        this.cancelled = true;
        if (this.abortController) {
            try { this.abortController.abort(); } catch { /* noop */ }
            this.abortController = null;
        }
        if (this.retryTimer) {
            window.clearTimeout(this.retryTimer);
            this.retryTimer = null;
            this.retryTimerItemId = null;
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

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
