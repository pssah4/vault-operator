/**
 * IngestSessionStore -- persistent state fuer Multi-Turn Dialog-Ingest.
 *
 * Backs FEAT-19-22 (Aktiver Dialog-Ingest-Modus, ADR-100).
 *
 * Reads from and writes to `ingest_session` (knowledge.db v10).
 */

import type { KnowledgeDB } from '../knowledge/KnowledgeDB';

export type IngestMode = 'A' | 'B'; // A=Dialog, B=Auto
export type IngestStatus = 'active' | 'awaiting-user' | 'completed' | 'abandoned';
export type IngestStep = 'take-away-selection' | 'plan-review' | 'execute' | 'done';

export interface IngestSessionState {
    takeaways?: Array<{
        text: string;
        sourcePosition?: string;
        userImportance?: number;
        userEmphasis?: string;
    }>;
    update_plan?: Array<{
        noteAction: 'create' | 'update';
        notePath: string;
        contentPreview: string;
    }>;
    tension_markers?: Array<{
        claim: string;
        targetNote: string;
        confidence: number;
    }>;
    current_step?: IngestStep;
}

export interface IngestSession {
    id: number;
    sourceUri: string;
    mode: IngestMode;
    status: IngestStatus;
    startedAt: string;
    lastTurnAt: string;
    state: IngestSessionState;
    conversationId?: string;
}

export class IngestSessionStore {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    create(sourceUri: string, mode: IngestMode, state: IngestSessionState = {}, conversationId?: string): IngestSession {
        if (!this.knowledgeDB.isOpen()) throw new Error('KnowledgeDB closed');
        const db = this.knowledgeDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO ingest_session (source_uri, mode, status, started_at, last_turn_at, state_json, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sourceUri, mode, 'active', now, now, JSON.stringify(state), conversationId ?? null],
        );
        const idResult = db.exec('SELECT last_insert_rowid()');
        const id = idResult[0].values[0][0] as number;
        this.knowledgeDB.markDirty();
        return {
            id,
            sourceUri,
            mode,
            status: 'active',
            startedAt: now,
            lastTurnAt: now,
            state,
            conversationId,
        };
    }

    get(id: number): IngestSession | null {
        if (!this.knowledgeDB.isOpen()) return null;
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT id, source_uri, mode, status, started_at, last_turn_at, state_json, conversation_id FROM ingest_session WHERE id = ?`,
            [id],
        );
        if (!result.length || !result[0].values.length) return null;
        return rowToSession(result[0].values[0]);
    }

    updateState(id: number, state: IngestSessionState, status?: IngestStatus): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        const now = new Date().toISOString();
        if (status) {
            db.run(
                `UPDATE ingest_session SET state_json = ?, status = ?, last_turn_at = ? WHERE id = ?`,
                [JSON.stringify(state), status, now, id],
            );
        } else {
            db.run(
                `UPDATE ingest_session SET state_json = ?, last_turn_at = ? WHERE id = ?`,
                [JSON.stringify(state), now, id],
            );
        }
        this.knowledgeDB.markDirty();
    }

    listByStatus(status: IngestStatus): IngestSession[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT id, source_uri, mode, status, started_at, last_turn_at, state_json, conversation_id FROM ingest_session WHERE status = ? ORDER BY last_turn_at DESC`,
            [status],
        );
        if (!result.length) return [];
        return result[0].values.map(rowToSession);
    }

    /** Cleanup: loescht abandoned sessions aelter X Tage. */
    cleanupAbandoned(olderThanDays = 7): number {
        if (!this.knowledgeDB.isOpen()) return 0;
        const db = this.knowledgeDB.getDB();
        const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
        db.run(
            `DELETE FROM ingest_session WHERE status = 'abandoned' AND last_turn_at < ?`,
            [cutoff],
        );
        const modified = db.getRowsModified();
        if (modified > 0) this.knowledgeDB.markDirty();
        return modified;
    }
}

function rowToSession(row: unknown[]): IngestSession {
    let state: IngestSessionState = {};
    try {
        state = JSON.parse(row[6] as string) as IngestSessionState;
    } catch {
        state = {};
    }
    return {
        id: row[0] as number,
        sourceUri: row[1] as string,
        mode: row[2] as IngestMode,
        status: row[3] as IngestStatus,
        startedAt: row[4] as string,
        lastTurnAt: row[5] as string,
        state,
        conversationId: (row[7] as string | null) ?? undefined,
    };
}
