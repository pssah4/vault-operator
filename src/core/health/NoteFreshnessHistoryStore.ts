/**
 * NoteFreshnessHistoryStore -- append-only history of note-level
 * verifier runs with bounded retention (IMP-20-06-01 W1-T3).
 *
 * Retention policy per ADR-135 plus IMP-20-06-01 acceptance criterion
 * AC-11: keep the newest 5 runs OR runs from the last 90 days, whichever
 * shrinks the set further. Applied on every insert, inside the same
 * implicit transaction.
 *
 * Storage: `note_freshness_history` table from KnowledgeDB schema v11.
 *
 * Wayfinder entry: see `src/ARCHITECTURE.map`, row `freshness-verifier`.
 * ADR refs: ADR-135.
 */

import type { VerdictLiteral, VerifierTier } from './types';

/**
 * Minimal local shape of `sql.js`'s Database. Mirrors the pattern used
 * by `KnowledgeDB.ts` to avoid pulling in sql.js typings (which do not
 * export `Database` as a named type in the version pinned for this
 * project).
 */
interface SqlDb {
    run(sql: string, params?: unknown[]): unknown;
}

const RETENTION_DAYS = 90;
const RETENTION_RUNS = 5;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RecordRunOptions {
    path: string;
    runAt: string;
    verdict: VerdictLiteral;
    confidence: number;
    verifierTier: VerifierTier;
    modelId: string;
    tokensUsed: number;
    summary?: string;
    sources?: string[];
    /**
     * Override the "now" used for the 90-day retention sweep. Production
     * callers omit this and the store uses the system clock; tests pass
     * a fixed Date so the sweep stays deterministic.
     */
    now?: Date;
}

export class NoteFreshnessHistoryStore {
    constructor(private readonly db: SqlDb) {}

    recordRun(opts: RecordRunOptions): void {
        const sourcesJson = opts.sources ? JSON.stringify(opts.sources) : null;

        this.db.run(
            `INSERT INTO note_freshness_history
             (path, run_at, verdict, confidence, summary, sources_json, verifier_tier, model_id, tokens_used)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                opts.path,
                opts.runAt,
                opts.verdict,
                opts.confidence,
                opts.summary ?? null,
                sourcesJson,
                opts.verifierTier,
                opts.modelId,
                opts.tokensUsed,
            ],
        );

        this.applyRetention(opts.path, opts.now ?? new Date());
    }

    private applyRetention(path: string, now: Date): void {
        const cutoff = new Date(now.getTime() - RETENTION_DAYS * MILLIS_PER_DAY).toISOString();
        this.db.run(
            `DELETE FROM note_freshness_history WHERE path = ? AND run_at < ?`,
            [path, cutoff],
        );

        // Keep only newest RETENTION_RUNS rows for this path.
        this.db.run(
            `DELETE FROM note_freshness_history
             WHERE id IN (
                 SELECT id FROM note_freshness_history
                 WHERE path = ?
                 ORDER BY run_at DESC, id DESC
                 LIMIT -1 OFFSET ?
             )`,
            [path, RETENTION_RUNS],
        );
    }
}
