/**
 * MemorySourceStore -- thin CRUD on memory_source_notes table.
 *
 * FEAT-03-25 / ADR-109: Vault-zu-Memory-Bruecke (Single-Listener-
 * Pattern). Diese Tabelle haelt nur die Brueckendaten -- welche
 * Notes als memory-source markiert sind, wann sie zuletzt
 * extrahiert wurden, ob ein Re-Extract pending ist. Der eigentliche
 * Extract-Pfad laeuft ueber den BA-25 FrontmatterIndexer plus
 * SingleCallProcessor.
 */

import type { MemoryDB } from './MemoryDB';

export type MarkerSource = 'agent-tool' | 'frontmatter' | 'settings-list';

export interface MemorySourceNoteRecord {
    notePath: string;
    lastExtractedAt: string | null;
    dirty: boolean;
    factCount: number;
    markerSource: MarkerSource;
    createdAt: string;
}

export class MemorySourceStore {
    constructor(private readonly memoryDB: MemoryDB) {}

    /**
     * Mark a note as memory-source. Idempotent: if already marked,
     * preserves lastExtractedAt + factCount but updates the marker
     * source if it changed (e.g. user added explicit settings entry
     * after frontmatter-only marker).
     */
    upsert(notePath: string, markerSource: MarkerSource): void {
        if (!this.memoryDB.isOpen()) return;
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        const existing = this.get(notePath);
        if (existing) {
            db.run(
                `UPDATE memory_source_notes SET marker_source = ?, dirty = 1 WHERE note_path = ?`,
                [markerSource, notePath],
            );
        } else {
            db.run(
                `INSERT INTO memory_source_notes
                    (note_path, last_extracted_at, dirty, fact_count, marker_source, created_at)
                 VALUES (?, NULL, 1, 0, ?, ?)`,
                [notePath, markerSource, now],
            );
        }
        this.memoryDB.markDirty();
    }

    /** Remove a note from the memory-source list. Idempotent. */
    remove(notePath: string): boolean {
        if (!this.memoryDB.isOpen()) return false;
        const db = this.memoryDB.getDB();
        const before = this.get(notePath);
        if (!before) return false;
        db.run(`DELETE FROM memory_source_notes WHERE note_path = ?`, [notePath]);
        this.memoryDB.markDirty();
        return true;
    }

    /** Look up a single record. */
    get(notePath: string): MemorySourceNoteRecord | null {
        if (!this.memoryDB.isOpen()) return null;
        const db = this.memoryDB.getDB();
        const r = db.exec(
            `SELECT note_path, last_extracted_at, dirty, fact_count, marker_source, created_at
               FROM memory_source_notes WHERE note_path = ?`,
            [notePath],
        );
        if (!r.length || !r[0].values.length) return null;
        return rowToRecord(r[0].values[0]);
    }

    /** Returns true if the note is registered as memory-source. */
    isMemorySource(notePath: string): boolean {
        return this.get(notePath) !== null;
    }

    /** All registered memory-source notes, ordered by created_at. */
    list(): MemorySourceNoteRecord[] {
        if (!this.memoryDB.isOpen()) return [];
        const db = this.memoryDB.getDB();
        const r = db.exec(
            `SELECT note_path, last_extracted_at, dirty, fact_count, marker_source, created_at
               FROM memory_source_notes ORDER BY created_at DESC`,
        );
        if (!r.length || !r[0].values.length) return [];
        return r[0].values.map(rowToRecord);
    }

    /** All notes that have dirty=1, awaiting re-extract. */
    listDirty(): MemorySourceNoteRecord[] {
        if (!this.memoryDB.isOpen()) return [];
        const db = this.memoryDB.getDB();
        const r = db.exec(
            `SELECT note_path, last_extracted_at, dirty, fact_count, marker_source, created_at
               FROM memory_source_notes WHERE dirty = 1`,
        );
        if (!r.length || !r[0].values.length) return [];
        return r[0].values.map(rowToRecord);
    }

    /** Mark a note dirty (called on vault.on(modify) hook). */
    markDirty(notePath: string): void {
        if (!this.memoryDB.isOpen()) return;
        const db = this.memoryDB.getDB();
        db.run(
            `UPDATE memory_source_notes SET dirty = 1 WHERE note_path = ?`,
            [notePath],
        );
        this.memoryDB.markDirty();
    }

    /**
     * After a successful extraction, mark the note as clean and
     * update bookkeeping (lastExtractedAt + factCount).
     */
    recordExtraction(notePath: string, factCount: number): void {
        if (!this.memoryDB.isOpen()) return;
        const db = this.memoryDB.getDB();
        db.run(
            `UPDATE memory_source_notes
                SET last_extracted_at = ?, dirty = 0, fact_count = ?
              WHERE note_path = ?`,
            [new Date().toISOString(), factCount, notePath],
        );
        this.memoryDB.markDirty();
    }

    /** Rename a memory-source note (vault.on('rename') hook). */
    rename(oldPath: string, newPath: string): void {
        if (!this.memoryDB.isOpen()) return;
        const existing = this.get(oldPath);
        if (!existing) return;
        const db = this.memoryDB.getDB();
        db.run(
            `UPDATE memory_source_notes SET note_path = ? WHERE note_path = ?`,
            [newPath, oldPath],
        );
        this.memoryDB.markDirty();
    }

    /** Diagnostic: total registered count. */
    count(): number {
        if (!this.memoryDB.isOpen()) return 0;
        const db = this.memoryDB.getDB();
        const r = db.exec(`SELECT COUNT(*) FROM memory_source_notes`);
        if (!r.length || !r[0].values.length) return 0;
        return r[0].values[0][0] as number;
    }
}

function rowToRecord(row: ReadonlyArray<unknown>): MemorySourceNoteRecord {
    return {
        notePath: row[0] as string,
        lastExtractedAt: (row[1] as string | null) ?? null,
        dirty: (row[2] as number) === 1,
        factCount: (row[3] as number) ?? 0,
        markerSource: row[4] as MarkerSource,
        createdAt: row[5] as string,
    };
}
