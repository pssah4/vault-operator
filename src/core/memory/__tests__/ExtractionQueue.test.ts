import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FileAdapter } from '../../storage/types';
import { ExtractionQueue } from '../ExtractionQueue';
import type { PendingExtraction } from '../ExtractionQueue';

function makeItem(id: string, type: 'session' | 'long-term' = 'session'): PendingExtraction {
    return {
        conversationId: id,
        transcript: `Transcript for ${id}`,
        title: `Title ${id}`,
        queuedAt: new Date().toISOString(),
        type,
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
});
