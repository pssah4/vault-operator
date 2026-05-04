/**
 * CommunicationStyleStore -- context-dependent style lookups.
 *
 * Stores how the agent should phrase replies in a given context. The
 * `context_match` column carries either `'default'` for the global
 * fallback or a tagged context like `'topic:coding'`, `'mode:planning'`,
 * `'thread:abc'`. Style rows are ranked by `importance` so the picker
 * can take the top-N for a System-Prompt slot.
 *
 * No fact-style lifecycle (no supersede / deprecate audit). Styles are
 * either current or removed. If history matters later, an audit row
 * can be added downstream -- ADR-077 leaves this open.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals (ADR-080).
 *
 * FEATURE-0315 / PLAN-004 task 4.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';

export interface NewCommunicationStyle {
    /** 'default' or tagged context like 'topic:coding'. */
    contextMatch: string;
    styleDescription: string;
    examples?: string;
    /** 0.0 - 1.0, default 0.5. */
    importance?: number;
    metadata?: Record<string, unknown>;
}

export interface CommunicationStyle {
    id: number;
    contextMatch: string;
    styleDescription: string;
    examples?: string;
    importance: number;
    createdAt: string;
    lastUpdatedAt: string;
    metadata?: Record<string, unknown>;
}

export interface StyleUpdate {
    styleDescription?: string;
    examples?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
}

export class CommunicationStyleStore {
    constructor(private readonly memoryDB: MemoryDB) {}

    addStyle(input: NewCommunicationStyle): CommunicationStyle {
        validateInput(input);
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO communication_styles
                (context_match, style_description, examples, importance,
                 created_at, last_updated_at, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                input.contextMatch,
                input.styleDescription,
                input.examples ?? null,
                input.importance ?? 0.5,
                now,
                now,
                input.metadata ? JSON.stringify(input.metadata) : null,
            ],
        );
        const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
        this.memoryDB.markDirty();
        const inserted = this.getById(id);
        if (!inserted) throw new Error(`CommunicationStyleStore: insert returned no row for id=${id}`);
        return inserted;
    }

    getById(id: number): CommunicationStyle | undefined {
        const db = this.memoryDB.getDB();
        const result = db.exec('SELECT * FROM communication_styles WHERE id = ?', [id]);
        if (result.length === 0 || result[0].values.length === 0) return undefined;
        return rowToStyle(result[0].columns, result[0].values[0]);
    }

    /**
     * Pick the top styles for a given context. Always falls back to the
     * 'default' context so the caller can rely on a non-empty result when
     * a default row exists. Returned in importance-desc order.
     */
    getMatchingStyles(context: string, limit = 5): CommunicationStyle[] {
        const db = this.memoryDB.getDB();
        const targets = context === 'default' ? ['default'] : [context, 'default'];
        const placeholders = targets.map(() => '?').join(', ');
        const result = db.exec(
            `SELECT * FROM communication_styles
              WHERE context_match IN (${placeholders})
              ORDER BY importance DESC
              LIMIT ?`,
            [...targets, limit],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => rowToStyle(result[0].columns, row));
    }

    updateStyle(id: number, patch: StyleUpdate): CommunicationStyle {
        if (Object.keys(patch).length === 0) {
            throw new Error('CommunicationStyleStore: update requires at least one field');
        }
        if (patch.importance !== undefined) {
            validateImportance(patch.importance);
        }
        const db = this.memoryDB.getDB();
        const sets: string[] = [];
        const params: unknown[] = [];
        if (patch.styleDescription !== undefined) {
            sets.push('style_description = ?');
            params.push(patch.styleDescription);
        }
        if (patch.examples !== undefined) {
            sets.push('examples = ?');
            params.push(patch.examples);
        }
        if (patch.importance !== undefined) {
            sets.push('importance = ?');
            params.push(patch.importance);
        }
        if (patch.metadata !== undefined) {
            sets.push('metadata = ?');
            params.push(JSON.stringify(patch.metadata));
        }
        sets.push('last_updated_at = ?');
        params.push(new Date().toISOString());
        params.push(id);

        db.run(`UPDATE communication_styles SET ${sets.join(', ')} WHERE id = ?`, params);
        this.memoryDB.markDirty();
        const updated = this.getById(id);
        if (!updated) throw new Error(`CommunicationStyleStore: update target ${id} not found`);
        return updated;
    }

    /** Hard delete -- styles have no audit history in Phase 1 (ADR-077 leaves this open). */
    removeStyle(id: number): void {
        const db = this.memoryDB.getDB();
        db.run('DELETE FROM communication_styles WHERE id = ?', [id]);
        this.memoryDB.markDirty();
    }
}

function validateInput(input: NewCommunicationStyle): void {
    if (typeof input.contextMatch !== 'string' || input.contextMatch.trim().length === 0) {
        throw new Error('CommunicationStyleStore: contextMatch must be non-empty');
    }
    if (typeof input.styleDescription !== 'string' || input.styleDescription.trim().length === 0) {
        throw new Error('CommunicationStyleStore: styleDescription must be non-empty');
    }
    if (input.importance !== undefined) validateImportance(input.importance);
}

function validateImportance(value: number): void {
    if (typeof value !== 'number' || value < 0 || value > 1) {
        throw new Error('CommunicationStyleStore: importance must be in [0, 1]');
    }
}

function rowToStyle(columns: string[], row: unknown[]): CommunicationStyle {
    const idx = (name: string) => columns.indexOf(name);
    const at = (name: string) => row[idx(name)];
    const metadataRaw = at('metadata') as string | null;
    let metadata: Record<string, unknown> | undefined;
    if (metadataRaw) {
        try { metadata = JSON.parse(metadataRaw) as Record<string, unknown>; } catch { /* ignore */ }
    }
    return {
        id: at('id') as number,
        contextMatch: at('context_match') as string,
        styleDescription: at('style_description') as string,
        examples: (at('examples') as string | null) ?? undefined,
        importance: at('importance') as number,
        createdAt: at('created_at') as string,
        lastUpdatedAt: at('last_updated_at') as string,
        metadata,
    };
}
