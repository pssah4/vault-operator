/**
 * ThreadDeltaStore -- read/write delta-window state on conversation_threads.
 *
 * Phase 4 / FEATURE-0318 task B.3. The Single-Call extraction loop pulls
 * only messages with index > `last_extracted_message_index` and feeds
 * `delta_summary` back to the LLM as "conversation so far". Both columns
 * land in schema v4 via additive ALTER TABLE.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';

export interface ThreadDelta {
    threadId: string;
    /** Index of the last message processed by SingleCallExtractor. Null = never run. */
    lastExtractedMessageIndex: number | null;
    /** ~200 token narrative summary handed back to the next delta run. Null = no prior run. */
    deltaSummary: string | null;
}

export class ThreadDeltaStore {
    constructor(private readonly memoryDB: MemoryDB) {}

    /** Returns delta state for a thread, or null when the thread row doesn't exist. */
    get(threadId: string): ThreadDelta | null {
        if (!threadId) return null;
        const db = this.memoryDB.getDB();
        const result = db.exec(
            `SELECT thread_id, last_extracted_message_index, delta_summary
               FROM conversation_threads
              WHERE thread_id = ?`,
            [threadId],
        );
        if (result.length === 0 || result[0].values.length === 0) return null;
        const row = result[0].values[0];
        return {
            threadId: row[0] as string,
            lastExtractedMessageIndex: (row[1] as number | null) ?? null,
            deltaSummary: (row[2] as string | null) ?? null,
        };
    }

    /**
     * Upsert delta state. Creates the thread row when missing so
     * extractions can run before any other code has touched the thread.
     */
    save(input: ThreadDelta): void {
        if (!input.threadId) throw new Error('ThreadDeltaStore.save: threadId required');
        if (input.lastExtractedMessageIndex !== null
            && (!Number.isInteger(input.lastExtractedMessageIndex)
                || input.lastExtractedMessageIndex < 0)) {
            throw new Error('ThreadDeltaStore.save: lastExtractedMessageIndex must be a non-negative integer');
        }
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        const existing = db.exec(
            'SELECT thread_id FROM conversation_threads WHERE thread_id = ?',
            [input.threadId],
        );
        if (existing.length === 0 || existing[0].values.length === 0) {
            db.run(
                `INSERT INTO conversation_threads
                    (thread_id, created_at, last_active_at,
                     last_extracted_message_index, delta_summary)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    input.threadId, now, now,
                    input.lastExtractedMessageIndex,
                    input.deltaSummary,
                ],
            );
        } else {
            db.run(
                `UPDATE conversation_threads
                    SET last_extracted_message_index = ?,
                        delta_summary = ?,
                        last_active_at = ?
                  WHERE thread_id = ?`,
                [
                    input.lastExtractedMessageIndex,
                    input.deltaSummary,
                    now,
                    input.threadId,
                ],
            );
        }
        this.memoryDB.markDirty();
    }
}
