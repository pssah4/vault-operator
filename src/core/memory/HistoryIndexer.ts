/**
 * HistoryIndexer -- writes conversation messages into history_chunks.
 *
 * Phase 6 / FEATURE-0320. Each chat ui-message becomes one chunk row
 * in `history.db`. The schema's UNIQUE(session_id, chunk_index)
 * constraint makes inserts idempotent: re-indexing the same
 * conversation only inserts the new tail messages.
 *
 * The indexer is not embedding-aware in Phase 6.0 -- the keyword
 * search path is keyword-only via SQL LIKE for now. Embeddings can
 * land in the existing `embedding` column when we wire a cosine
 * upgrade later.
 *
 * Constructor-Injection only (no obsidian, no plugin globals) so the
 * engine extract for UCM stays mechanical (ADR-080).
 */

import type { HistoryDB } from '../knowledge/HistoryDB';
import type { ConversationMeta, ConversationStore, UiMessage } from '../history/ConversationStore';

export interface HistoryIndexReport {
    conversationsScanned: number;
    chunksInserted: number;
    chunksSkipped: number;   // already present (UNIQUE conflict)
    errors: Array<{ conversationId: string; error: string }>;
}

export class HistoryIndexer {
    constructor(
        private readonly historyDB: HistoryDB,
        private readonly store: ConversationStore,
    ) {}

    /**
     * Index every conversation in the store. Called from plugin onload
     * for a one-shot backfill. Abortable via the optional signal so a
     * long-running backfill on a fresh install doesn't block plugin
     * shutdown.
     */
    async backfillAll(signal?: AbortSignal): Promise<HistoryIndexReport> {
        const report: HistoryIndexReport = {
            conversationsScanned: 0,
            chunksInserted: 0,
            chunksSkipped: 0,
            errors: [],
        };
        if (!this.historyDB.isOpen()) return report;
        for (const meta of this.store.list()) {
            if (signal?.aborted) break;
            const sub = await this.indexConversation(meta);
            report.conversationsScanned += 1;
            report.chunksInserted += sub.chunksInserted;
            report.chunksSkipped += sub.chunksSkipped;
            if (sub.error) {
                report.errors.push({ conversationId: meta.id, error: sub.error });
            }
        }
        if (report.chunksInserted > 0) {
            await this.historyDB.save().catch(() => undefined);
        }
        return report;
    }

    /**
     * Index a single conversation incrementally. Loads its messages
     * from the store, then inserts every (session_id, chunk_index)
     * combination that isn't already in history_chunks.
     */
    async indexConversation(meta: ConversationMeta): Promise<{
        chunksInserted: number;
        chunksSkipped: number;
        error?: string;
    }> {
        if (!this.historyDB.isOpen()) {
            return { chunksInserted: 0, chunksSkipped: 0, error: 'history db not open' };
        }
        try {
            const data = await this.store.load(meta.id);
            if (!data) return { chunksInserted: 0, chunksSkipped: 0, error: 'load returned null' };
            return this.writeChunks(meta.id, data.uiMessages);
        } catch (e) {
            return {
                chunksInserted: 0,
                chunksSkipped: 0,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Trigger after a conversation is saved (the live-write path).
     * The plugin wires this to ConversationStore's save flow.
     */
    async onConversationSaved(conversationId: string, messages: readonly UiMessage[]): Promise<void> {
        if (!this.historyDB.isOpen()) return;
        const result = this.writeChunks(conversationId, messages);
        if (result.chunksInserted > 0) {
            await this.historyDB.save().catch(() => undefined);
        }
    }

    private writeChunks(sessionId: string, messages: readonly UiMessage[]): {
        chunksInserted: number;
        chunksSkipped: number;
    } {
        let chunksInserted = 0;
        let chunksSkipped = 0;
        const db = this.historyDB.getDB();
        const stmt = db.prepare(
            `INSERT OR IGNORE INTO history_chunks
                (session_id, chunk_index, role, text, tokens, created_at, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        try {
            db.run('BEGIN');
            for (let i = 0; i < messages.length; i++) {
                const m = messages[i];
                if (!m.text || m.text.trim().length === 0) continue;
                stmt.run([
                    sessionId,
                    i,
                    m.role,
                    m.text,
                    estimateTokens(m.text),
                    m.ts,
                    null,
                ]);
                // db.getRowsModified() to detect insert vs ignore
                if (db.getRowsModified() > 0) {
                    chunksInserted += 1;
                } else {
                    chunksSkipped += 1;
                }
            }
            db.run('COMMIT');
        } catch (e) {
            db.run('ROLLBACK');
            throw e;
        } finally {
            stmt.free();
        }
        if (chunksInserted > 0) this.historyDB.markDirty();
        return { chunksInserted, chunksSkipped };
    }
}

/** Lightweight token estimate: ~4 chars per token. Good enough for budget hints. */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
