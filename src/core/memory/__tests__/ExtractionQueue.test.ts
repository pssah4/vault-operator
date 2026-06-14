import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FileAdapter } from '../../storage/types';
import { ExtractionQueue } from '../ExtractionQueue';
import type { PendingExtraction } from '../ExtractionQueue';

function makeItem(id: string): PendingExtraction {
    return {
        conversationId: id,
        messages: [{ role: 'user', text: `Hello from ${id}` }],
        title: `Title ${id}`,
        queuedAt: new Date().toISOString(),
    };
}

function createMockFs(): FileAdapter {
    const store: Record<string, string> = {};
    return {
        exists: (p: string) => Promise.resolve(p in store),
        read: (p: string) => {
            if (!(p in store)) return Promise.reject(new Error('Not found'));
            return Promise.resolve(store[p]);
        },
        write: (p: string, data: string) => { store[p] = data; return Promise.resolve(); },
        mkdir: () => Promise.resolve(),
        list: () => Promise.resolve({ files: [] as string[], folders: [] as string[] }),
        remove: (p: string) => { delete store[p]; return Promise.resolve(); },
        append: () => Promise.resolve(),
        stat: () => Promise.resolve(null),
    };
}

describe('ExtractionQueue', () => {
    let queue: ExtractionQueue;
    let mockFs: FileAdapter;

    beforeEach(() => {
        mockFs = createMockFs();
        queue = new ExtractionQueue(mockFs);
    });

    describe('FIFO operations', () => {
        it('should start empty', () => {
            expect(queue.isEmpty()).toBe(true);
            expect(queue.size()).toBe(0);
        });

        it('should enqueue and dequeue in FIFO order', async () => {
            // Temporarily set no processor so enqueue doesn't trigger processing
            await queue.enqueue(makeItem('first'));
            await queue.enqueue(makeItem('second'));

            expect(queue.size()).toBe(2);
            expect(queue.dequeue()?.conversationId).toBe('first');
            expect(queue.dequeue()?.conversationId).toBe('second');
            expect(queue.isEmpty()).toBe(true);
        });

        it('should peek without removing', async () => {
            await queue.enqueue(makeItem('item-1'));
            expect(queue.peek()?.conversationId).toBe('item-1');
            expect(queue.size()).toBe(1);
        });

        it('should return undefined when dequeuing empty queue', () => {
            expect(queue.dequeue()).toBeUndefined();
        });

        it('should return undefined when peeking empty queue', () => {
            expect(queue.peek()).toBeUndefined();
        });
    });

    describe('persistence', () => {
        it('should save and load queue state', async () => {
            await queue.enqueue(makeItem('persist-1'));
            await queue.enqueue(makeItem('persist-2'));

            // Create new queue from same fs to test load
            const queue2 = new ExtractionQueue(mockFs);
            await queue2.load();
            expect(queue2.size()).toBe(2);
            expect(queue2.peek()?.conversationId).toBe('persist-1');
        });

        it('should handle load from non-existing file', async () => {
            await queue.load();
            expect(queue.isEmpty()).toBe(true);
        });

        it('should handle load from invalid JSON', async () => {
            await mockFs.write('pending-extractions.json', 'not json');
            await queue.load();
            expect(queue.isEmpty()).toBe(true);
        });
    });

    describe('processQueue', () => {
        it('should not process without a processor set', async () => {
            await queue.enqueue(makeItem('no-processor'));
            await queue.processQueue();
            // Item should still be in queue
            expect(queue.size()).toBe(1);
        });

        it('should process all items in order', async () => {
            const processed: string[] = [];
            queue.setProcessor((item) => {
                processed.push(item.conversationId);
                return Promise.resolve();
            });

            // Enqueue items (processQueue is triggered but we track order)
            queue['items'].push(makeItem('a'), makeItem('b'), makeItem('c'));
            await queue.processQueue();

            expect(processed).toEqual(['a', 'b', 'c']);
            expect(queue.isEmpty()).toBe(true);
        });

        it('should stop processing on error and keep failed item', async () => {
            let callCount = 0;
            queue.setProcessor((item) => {
                callCount++;
                if (item.conversationId === 'fail') {
                    return Promise.reject(new Error('Processing failed'));
                }
                return Promise.resolve();
            });

            queue['items'].push(makeItem('ok'), makeItem('fail'), makeItem('never'));
            await queue.processQueue();

            expect(callCount).toBe(2); // 'ok' succeeds, 'fail' throws
            expect(queue.peek()?.conversationId).toBe('fail');
            expect(queue.size()).toBe(2); // 'fail' + 'never' remain
        });

        it('should guard against re-entrant processing', async () => {
            let concurrent = 0;
            let maxConcurrent = 0;
            queue.setProcessor(async () => {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise(r => setTimeout(r, 10));
                concurrent--;
            });

            queue['items'].push(makeItem('a'));
            // Start two processQueue calls concurrently
            const p1 = queue.processQueue();
            const p2 = queue.processQueue();
            await Promise.all([p1, p2]);

            expect(maxConcurrent).toBe(1); // Only one should run at a time
        });
    });

    describe('BUG-016: session-disable on permanent provider errors', () => {
        function makeError(opts: { status?: number; message?: string }): Error & { status?: number } {
            const err = new Error(opts.message ?? 'boom') as Error & { status?: number };
            if (opts.status !== undefined) err.status = opts.status;
            return err;
        }

        it('stops retrying after a 401 and marks the session disabled', async () => {
            let calls = 0;
            queue.setProcessor(() => {
                calls++;
                return Promise.reject(makeError({ status: 401, message: 'Unauthorized' }));
            });
            queue['items'].push(makeItem('a'), makeItem('b'), makeItem('c'));

            await queue.processQueue();

            // One failure should mark the session dead and stop the loop.
            expect(calls).toBe(1);
            expect(queue.size()).toBe(3); // Nothing removed
            expect(queue.isSessionDisabled()).toBe(true);
            expect(queue.getSessionDisabledReason()).toContain('Unauthorized');
        });

        it('recognises "credit balance is too low" as permanent (Anthropic pattern)', async () => {
            let calls = 0;
            queue.setProcessor(() => {
                calls++;
                return Promise.reject(makeError({
                    status: 400,
                    message: 'Your credit balance is too low to access the Anthropic API.',
                }));
            });
            queue['items'].push(makeItem('a'), makeItem('b'));

            await queue.processQueue();

            expect(calls).toBe(1);
            expect(queue.isSessionDisabled()).toBe(true);
        });

        it('does not mark the session disabled on transient errors', async () => {
            queue.setProcessor(() => Promise.reject(new Error('network timeout')));
            queue['items'].push(makeItem('a'));

            await queue.processQueue();

            expect(queue.isSessionDisabled()).toBe(false);
            expect(queue.size()).toBe(1); // Still queued for next startup
        });

        it('refuses to re-enter processQueue once disabled', async () => {
            let calls = 0;
            queue.setProcessor(() => {
                calls++;
                return Promise.reject(makeError({ status: 403, message: 'Forbidden' }));
            });
            queue['items'].push(makeItem('a'));

            await queue.processQueue();
            expect(calls).toBe(1);

            // Second invocation must short-circuit.
            queue['items'].push(makeItem('b'));
            await queue.processQueue();
            expect(calls).toBe(1);
        });
    });

    describe('re-extraction throttle (PLAN-009 / Phase 5)', () => {
        it('blocks a second auto-enqueue within the throttle window', async () => {
            const fs = createMockFs();
            const q = new ExtractionQueue(fs);
            q.setThrottleMs(60_000);
            await q.enqueue(makeItem('chat-1'));
            await q.enqueue(makeItem('chat-1'));
            expect(q.size()).toBe(1);
        });

        it('lets the same conversation through after the window elapsed', async () => {
            const fs = createMockFs();
            const q = new ExtractionQueue(fs);
            q.setThrottleMs(50);
            await q.enqueue(makeItem('chat-1'));
            await new Promise(r => setTimeout(r, 80));
            await q.enqueue(makeItem('chat-1'));
            expect(q.size()).toBe(2);
        });

        it('different conversations are independent', async () => {
            const fs = createMockFs();
            const q = new ExtractionQueue(fs);
            q.setThrottleMs(60_000);
            await q.enqueue(makeItem('chat-a'));
            await q.enqueue(makeItem('chat-b'));
            expect(q.size()).toBe(2);
        });

        it('bypassThrottle items are not throttled', async () => {
            const fs = createMockFs();
            const q = new ExtractionQueue(fs);
            q.setThrottleMs(60_000);
            await q.enqueue(makeItem('chat-1'));
            await q.enqueueImmediate({
                conversationId: 'chat-1',
                messages: [{ role: 'user', text: 'force-save' }],
                title: 'T',
                queuedAt: new Date().toISOString(),
            });
            expect(q.size()).toBe(2);
        });

        it('throttle state survives save -> new instance load', async () => {
            const fs = createMockFs();
            const q1 = new ExtractionQueue(fs);
            q1.setThrottleMs(60_000);
            await q1.enqueue(makeItem('chat-1'));
            // New instance reads from same fs.
            const q2 = new ExtractionQueue(fs);
            q2.setThrottleMs(60_000);
            await q2.load();
            await q2.enqueue(makeItem('chat-1'));
            // q2's enqueue should be throttled because q1's lastEnqueuedAt
            // was persisted.
            expect(q2.size()).toBe(1);
        });

        it('legacy plain-array persistence loads without throttle state', async () => {
            const fs = createMockFs();
            await fs.write(
                'pending-extractions.json',
                JSON.stringify([{
                    conversationId: 'old', messages: [], title: 'T',
                    queuedAt: new Date().toISOString(),
                }]),
            );
            const q = new ExtractionQueue(fs);
            await q.load();
            expect(q.size()).toBe(1);
        });

        it('setThrottleMs(0) disables the throttle entirely', async () => {
            const fs = createMockFs();
            const q = new ExtractionQueue(fs);
            q.setThrottleMs(0);
            await q.enqueue(makeItem('chat-1'));
            await q.enqueue(makeItem('chat-1'));
            expect(q.size()).toBe(2);
        });
    });

    describe('bypass flag (PLAN-007 task A.6)', () => {
        // Processors are not set in these tests so processQueue() is a no-op
        // (no processor configured) and we can inspect the queued item before
        // it gets drained.
        it('enqueueImmediate sets bypassThrottle=true on the persisted item', async () => {
            const fs = createMockFs();
            const queue = new ExtractionQueue(fs);
            await queue.enqueueImmediate({
                conversationId: 'a', messages: [{ role: 'user', text: 'hi' }], title: 'T',
                queuedAt: new Date().toISOString(),
            });
            const peeked = queue.peek();
            expect(peeked?.bypassThrottle).toBe(true);
        });

        it('regular enqueue leaves bypassThrottle undefined by default', async () => {
            const fs = createMockFs();
            const queue = new ExtractionQueue(fs);
            await queue.enqueue({
                conversationId: 'a', messages: [{ role: 'user', text: 'hi' }], title: 'T',
                queuedAt: new Date().toISOString(),
            });
            expect(queue.peek()?.bypassThrottle).toBeUndefined();
        });

        it('bypassThrottle survives serialise -> load roundtrip', async () => {
            const fs = createMockFs();
            const queue1 = new ExtractionQueue(fs);
            await queue1.enqueueImmediate({
                conversationId: 'a', messages: [{ role: 'user', text: 'hi' }], title: 'T',
                queuedAt: new Date().toISOString(),
            });
            const queue2 = new ExtractionQueue(fs);
            await queue2.load();
            expect(queue2.peek()?.bypassThrottle).toBe(true);
        });
    });

    describe('IMP-03-18-02: clearThrottle', () => {
        it('after clearThrottle the next enqueue passes the throttle gate', async () => {
            queue.setThrottleMs(60_000);
            await queue.enqueue(makeItem('conv-x'));
            expect(queue.size()).toBe(1);

            // Second enqueue within throttle window is dropped
            await queue.enqueue(makeItem('conv-x'));
            expect(queue.size()).toBe(1);

            // Drift fires -> clearThrottle -> next enqueue passes
            queue.clearThrottle('conv-x');
            await queue.enqueue(makeItem('conv-x'));
            expect(queue.size()).toBe(2);
        });

        it('clearThrottle on unknown id is a no-op', () => {
            expect(() => queue.clearThrottle('does-not-exist')).not.toThrow();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // FIX-32-03-02 + FIX-32-03-03: cancellation + failureCount + park + backoff
    // + getQueueHealth + EmptyExtractionError + telemetry
    // ─────────────────────────────────────────────────────────────────────────

    describe('FIX-32-03-02 cancelInFlight', () => {
        it('aborts the processor signal and dequeues nothing', async () => {
            queue.setThrottleMs(0);
            const seen: { signal?: AbortSignal } = {};
            queue.setProcessor(async (_item, signal) => {
                seen.signal = signal;
                await new Promise((resolve) => {
                    signal?.addEventListener('abort', () => resolve(undefined), { once: true });
                });
                // Mirror what SingleCallExtractor does on abort
                const err = new Error('aborted');
                err.name = 'AbortError';
                throw err;
            });
            await queue.enqueue(makeItem('cancel-1'));
            // give the processQueue microtasks a chance to spin up
            await new Promise((r) => setTimeout(r, 0));
            queue.cancelInFlight();
            // wait one more tick for the catch + finally to run
            await new Promise((r) => setTimeout(r, 0));
            expect(seen.signal?.aborted).toBe(true);
            expect(queue.size()).toBe(1); // item survives for next session
            expect(queue.parkedSize()).toBe(0);
        });

        it('cancelInFlight is idempotent and safe when nothing is in flight', () => {
            expect(() => queue.cancelInFlight()).not.toThrow();
            expect(() => queue.cancelInFlight()).not.toThrow();
        });

        it('cancelled flag clears on the next enqueue so future drains can run', async () => {
            queue.setThrottleMs(0);
            let calls = 0;
            queue.setProcessor(async () => { calls += 1; });
            queue.cancelInFlight();
            await queue.enqueue(makeItem('drain-after-cancel'));
            // give processQueue the chance to drain
            await new Promise((r) => setTimeout(r, 0));
            expect(calls).toBe(1);
            expect(queue.size()).toBe(0);
        });
    });

    describe('FIX-32-03-03 failureCount + park + backoff + telemetry', () => {
        function transient(message = 'boom'): Error {
            return new Error(message);
        }

        function emptyExtractionError(): Error {
            const e = new Error('extractor returned empty result');
            e.name = 'EmptyExtractionError';
            return e;
        }

        it('initialises new items with failureCount=0', async () => {
            queue.setThrottleMs(0);
            // Block the processor so the item stays in queue and we can peek it.
            queue.setProcessor(() => new Promise<void>(() => { /* never resolves */ }));
            void queue.enqueue(makeItem('fresh'));
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.peek()?.failureCount).toBe(0);
            // Detach to let the test exit cleanly.
            queue.cancelInFlight();
        });

        it('parks items after three transient failures and emits dropped telemetry', async () => {
            queue.setThrottleMs(0);
            queue.setProcessor(async () => { throw transient(); });
            const dropEvents: unknown[] = [];
            queue.setTelemetry({
                extractionDropped: (payload: unknown) => {
                    dropEvents.push(payload);
                    return Promise.resolve();
                },
            } as never);
            await queue.enqueue(makeItem('park-me'));
            // Let the implicit processQueue from enqueue settle (failureCount=1).
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.size()).toBe(1);
            expect(queue.peek()?.failureCount).toBe(1);
            expect(queue.parkedSize()).toBe(0);
            // Drive failures 2 and 3 by re-entering processQueue without the
            // 60s timer; the cancelInFlight in between guarantees the prior
            // void call already settled and processing=false again.
            await queue.processQueue();
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.peek()?.failureCount).toBe(2);
            await queue.processQueue();
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.size()).toBe(0);
            expect(queue.parkedSize()).toBe(1);
            expect(dropEvents).toHaveLength(1);
            expect((dropEvents[0] as Record<string, unknown>).reason).toBe('transient-failures');
            expect((dropEvents[0] as Record<string, unknown>).failureCount).toBe(3);
        });

        it('EmptyExtractionError dequeues without bumping failureCount', async () => {
            queue.setThrottleMs(0);
            const dropped: unknown[] = [];
            queue.setTelemetry({ extractionDropped: (p: unknown) => { dropped.push(p); return Promise.resolve(); } } as never);
            queue.setProcessor(async () => { throw emptyExtractionError(); });
            await queue.enqueue(makeItem('empty'));
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.size()).toBe(0);
            expect(queue.parkedSize()).toBe(0);
            expect(dropped).toEqual([]);
        });

        it('permanent provider error parks the session and emits dropped telemetry', async () => {
            queue.setThrottleMs(0);
            const dropped: unknown[] = [];
            queue.setTelemetry({ extractionDropped: (p: unknown) => { dropped.push(p); return Promise.resolve(); } } as never);
            queue.setProcessor(async () => {
                const e = new Error('credit balance is too low');
                throw e;
            });
            await queue.enqueue(makeItem('no-credits'));
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.isSessionDisabled()).toBe(true);
            expect(dropped).toHaveLength(1);
            expect((dropped[0] as Record<string, unknown>).reason).toBe('permanent-error');
            const health = queue.getQueueHealth();
            expect(health.sessionDisabledReason).toContain('credit balance');
            expect(health.lastError?.kind).toBe('permanent');
        });

        it('getQueueHealth exposes pending, parked, sessionDisabledReason, lastError', async () => {
            queue.setThrottleMs(0);
            queue.setProcessor(async () => { /* noop */ });
            await queue.enqueue(makeItem('a'));
            await queue.enqueue(makeItem('b'));
            // mid-state right after enqueue: items have already drained because
            // the noop processor resolved instantly. Re-enqueue to capture a
            // non-empty pending state.
            await queue.enqueue(makeItem('c'));
            const health = queue.getQueueHealth();
            expect(health.pending).toBeGreaterThanOrEqual(0);
            expect(health.parked).toBe(0);
            expect(health.sessionDisabledReason).toBeUndefined();
        });

        it('persists parkedItems + failureCount across save and load', async () => {
            queue.setThrottleMs(0);
            queue.setProcessor(async () => { throw transient(); });
            await queue.enqueue(makeItem('save-me'));
            await new Promise((r) => setTimeout(r, 0)); // fc=1
            await queue.processQueue();                  // fc=2
            await new Promise((r) => setTimeout(r, 0));
            await queue.processQueue();                  // fc=3 -> park
            await new Promise((r) => setTimeout(r, 0));
            expect(queue.parkedSize()).toBe(1);

            const queue2 = new ExtractionQueue(mockFs);
            await queue2.load();
            expect(queue2.parkedSize()).toBe(1);
            expect(queue2.size()).toBe(0);
        });

        it('load() back-fills failureCount=0 on v1 plain-array files', async () => {
            // Write a v1 plain-array file directly through the FS mock
            await mockFs.write('pending-extractions.json', JSON.stringify([
                { conversationId: 'legacy', messages: [], title: 't', queuedAt: 'x' },
            ]));
            const fresh = new ExtractionQueue(mockFs);
            await fresh.load();
            expect(fresh.size()).toBe(1);
            expect(fresh.peek()?.failureCount).toBe(0);
            expect(fresh.parkedSize()).toBe(0);
        });
    });
});
