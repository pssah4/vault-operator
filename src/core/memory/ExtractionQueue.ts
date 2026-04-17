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

export interface PendingExtraction {
    conversationId: string;
    transcript: string;
    title: string;
    queuedAt: string;
    type: 'session' | 'long-term';
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

    constructor(private fs: FileAdapter) {
        this.filePath = 'pending-extractions.json';
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
        this.items.push(item);
        await this.save();
        // Kick off processing if not already running
        void this.processQueue();
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
            this.items = Array.isArray(parsed) ? parsed : [];
        } catch {
            this.items = [];
        }
    }

    async save(): Promise<void> {
        await this.fs.write(this.filePath, JSON.stringify(this.items, null, 2));
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
                    console.warn(`[Memory] Extraction failed for ${item.conversationId} (type=${item.type}), will retry on next startup:`, e);
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
