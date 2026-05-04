/**
 * AuditLog -- one-row-per-state-change audit trail for the Memory v2 engine.
 *
 * ADR-077 reserves `memory_audit` for state-changing operations: insert,
 * confirm, supersede, deprecate. `recordUsage` (use_count, last_used_at)
 * is intentionally inline only -- a use-event audit row would explode the
 * table volume (R15 in PLAN-001).
 *
 * The class is a thin wrapper over the raw INSERT so the four stores
 * (FactStore, EdgeStore, CommunicationStyleStore, future ones) share the
 * exact same row format. No `obsidian` import here -- engine-extract-ready
 * (ADR-080).
 *
 * FEATURE-0315 / PLAN-004 task 8.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';

export type AuditOperation = 'insert' | 'confirm' | 'supersede' | 'deprecate';

export interface AuditEntry {
    operation: AuditOperation;
    factId?: number;
    /** Counterpart of a supersede or other two-fact relation. */
    relatedFactId?: number;
    sessionId?: string;
    rationale?: string;
    /** Free-form structured payload. Stored as JSON string. */
    metadata?: Record<string, unknown>;
}

export class AuditLog {
    constructor(private readonly memoryDB: MemoryDB) {}

    /** Append one row to memory_audit. Always succeeds when the DB is open. */
    log(entry: AuditEntry): void {
        const db = this.memoryDB.getDB();
        db.run(
            `INSERT INTO memory_audit
                (timestamp, operation, fact_id, related_fact_id, session_id, rationale, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                new Date().toISOString(),
                entry.operation,
                entry.factId ?? null,
                entry.relatedFactId ?? null,
                entry.sessionId ?? null,
                entry.rationale ?? null,
                entry.metadata ? JSON.stringify(entry.metadata) : null,
            ],
        );
        this.memoryDB.markDirty();
    }

    /** Read the last `limit` audit rows, newest first. Used by tests + UI. */
    list(limit = 100): AuditRow[] {
        const db = this.memoryDB.getDB();
        const result = db.exec(
            'SELECT id, timestamp, operation, fact_id, related_fact_id, session_id, rationale, metadata ' +
            'FROM memory_audit ORDER BY id DESC LIMIT ?',
            [limit],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            id: row[0] as number,
            timestamp: row[1] as string,
            operation: row[2] as AuditOperation,
            factId: (row[3] as number | null) ?? undefined,
            relatedFactId: (row[4] as number | null) ?? undefined,
            sessionId: (row[5] as string | null) ?? undefined,
            rationale: (row[6] as string | null) ?? undefined,
            metadata: row[7] ? safeParseJson(row[7] as string) : undefined,
        }));
    }
}

export interface AuditRow extends AuditEntry {
    id: number;
    timestamp: string;
}

function safeParseJson(raw: string): Record<string, unknown> | undefined {
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}
