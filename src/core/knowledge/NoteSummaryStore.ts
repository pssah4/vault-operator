/**
 * NoteSummaryStore -- Note-Level summaries plus generation metadata.
 *
 * Backs FEAT-15-09. Per-note record with summary text, model used,
 * timestamp, and source mtime for idempotent re-generation detection.
 *
 * Reads from and writes to `note_summaries` (knowledge.db v10, ADR-92).
 */

import type { KnowledgeDB } from './KnowledgeDB';

export interface NoteSummaryRecord {
    notePath: string;
    summary: string;
    summaryModel: string;
    summarizedAt: string;
    sourceMtime: number;
}

export class NoteSummaryStore {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    upsert(notePath: string, summary: string, summaryModel: string, sourceMtime: number): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO note_summaries (note_path, summary, summary_model, summarized_at, source_mtime)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(note_path) DO UPDATE SET
                summary = excluded.summary,
                summary_model = excluded.summary_model,
                summarized_at = excluded.summarized_at,
                source_mtime = excluded.source_mtime`,
            [notePath, summary, summaryModel, now, sourceMtime],
        );
        this.knowledgeDB.markDirty();
    }

    get(notePath: string): NoteSummaryRecord | null {
        if (!this.knowledgeDB.isOpen()) return null;
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT note_path, summary, summary_model, summarized_at, source_mtime
             FROM note_summaries WHERE note_path = ?`,
            [notePath],
        );
        if (!result.length || !result[0].values.length) return null;
        const row = result[0].values[0];
        return {
            notePath: row[0] as string,
            summary: row[1] as string,
            summaryModel: row[2] as string,
            summarizedAt: row[3] as string,
            sourceMtime: row[4] as number,
        };
    }

    bulkRead(notePaths: string[]): Map<string, NoteSummaryRecord> {
        const out = new Map<string, NoteSummaryRecord>();
        if (!this.knowledgeDB.isOpen() || notePaths.length === 0) return out;
        const db = this.knowledgeDB.getDB();
        const placeholders = notePaths.map(() => '?').join(',');
        const result = db.exec(
            `SELECT note_path, summary, summary_model, summarized_at, source_mtime
             FROM note_summaries WHERE note_path IN (${placeholders})`,
            notePaths,
        );
        if (!result.length) return out;
        for (const row of result[0].values) {
            out.set(row[0] as string, {
                notePath: row[0] as string,
                summary: row[1] as string,
                summaryModel: row[2] as string,
                summarizedAt: row[3] as string,
                sourceMtime: row[4] as number,
            });
        }
        return out;
    }

    delete(notePath: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run(`DELETE FROM note_summaries WHERE note_path = ?`, [notePath]);
        this.knowledgeDB.markDirty();
    }

    count(): number {
        if (!this.knowledgeDB.isOpen()) return 0;
        const db = this.knowledgeDB.getDB();
        const result = db.exec(`SELECT COUNT(*) FROM note_summaries`);
        return (result[0]?.values?.[0]?.[0] as number) ?? 0;
    }
}
