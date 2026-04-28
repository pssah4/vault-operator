/**
 * AgingService -- daily importance-decay sweep with use-count boost.
 *
 * Runs through every latest, non-deprecated fact and recomputes its
 * `importance` according to a kind-aware half-life curve. The curve
 * keeps identity statements stable for half a year, lets `event` facts
 * fade quickly, and shields preferences entirely (they only ever go
 * up, via use-count). Touch-refresh (`last_used_at` within 7 days)
 * adds a +0.05 boost so frequently-used facts stop decaying.
 *
 * Half-lives (FEATURE-0318 E2/E8):
 *   identity     180 days
 *   fact          90 days  (default)
 *   event         14 days
 *   preference   never decays (multiplicative use-count boost only)
 *
 * Idempotent: a single transaction wraps the run; tracking field
 * `lastAgingRunAt` lives in plugin settings (caller persists). A second
 * call within 24 hours short-circuits unless `force: true`.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals.
 *
 * FEATURE-0318 / PLAN-007 task A.3.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';
import type { FactKind } from './FactStore';

export interface AgingOptions {
    /** Reference timestamp (defaults to "now"). Tests inject a fixed value. */
    now?: Date;
    /** Skip the 24h short-circuit when true. */
    force?: boolean;
    /** ISO timestamp of the last successful run; passed in by the caller (plugin settings). */
    lastRunAt?: string | null;
    /** Floor importance; facts below this drop to the floor instead of zero. */
    minImportance?: number;
}

export interface AgingReport {
    timestamp: string;
    skipped: boolean;
    skippedReason?: string;
    factsProcessed: number;
    factsUpdated: number;
    /** Per-kind row counts that received an update. */
    byKind: Record<FactKind, number>;
}

/**
 * Two-tier half-life model (FEATURE-0319 Phase 5 refinement).
 *
 * `single`: short-shot information that hasn't repeated. Decays so
 * unconfirmed claims fade away over time without polluting the hot
 * memory block.
 * `pattern`: information that has been confirmed >= PATTERN_THRESHOLD
 * times in conversations. Treated as stable -- never decays (null) or
 * decays much slower. The user's framing: information becomes a
 * "pattern" once it repeats, and patterns are not made unimportant by
 * mere age.
 *
 * Picking thresholds: identity / preference / fact reach pattern-tier
 * fast (any repeat is enough). event has its own pattern-tier with a
 * longer half-life because some "events" recur (weekly meeting, daily
 * standup) and we want them to stick around longer once they show
 * pattern-like behaviour.
 */
const HALF_LIFE_DAYS_BY_TIER: Record<FactKind, { single: number | null; pattern: number | null }> = {
    identity:   { single: 90,  pattern: null },
    fact:       { single: 60,  pattern: null },
    preference: { single: 30,  pattern: null },
    event:      { single: 14,  pattern: 30   },
};

/** confirmation_count >= this becomes "pattern" tier. */
const PATTERN_THRESHOLD = 3;

const RECENCY_BOOST_DAYS = 7;
const RECENCY_BOOST = 0.05;
const MIN_IMPORTANCE_DEFAULT = 0.05;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class AgingService {
    constructor(private readonly memoryDB: MemoryDB) {}

    runAgingCycle(opts: AgingOptions = {}): AgingReport {
        const now = opts.now ?? new Date();
        const minImportance = opts.minImportance ?? MIN_IMPORTANCE_DEFAULT;
        const empty: AgingReport['byKind'] = {
            identity: 0, fact: 0, event: 0, preference: 0,
        };
        const report: AgingReport = {
            timestamp: now.toISOString(),
            skipped: false,
            factsProcessed: 0,
            factsUpdated: 0,
            byKind: empty,
        };

        if (!opts.force && opts.lastRunAt) {
            const last = new Date(opts.lastRunAt).getTime();
            if (Number.isFinite(last) && now.getTime() - last < TWENTY_FOUR_HOURS_MS) {
                report.skipped = true;
                report.skippedReason = `last run was ${Math.round((now.getTime() - last) / 1000)}s ago, < 24h`;
                return report;
            }
        }

        const db = this.memoryDB.getDB();
        const candidates = db.exec(
            `SELECT id, kind, importance, created_at, last_used_at, use_count, confirmation_count
               FROM facts
              WHERE is_latest = 1 AND deprecated_at IS NULL`,
        );
        if (candidates.length === 0 || candidates[0].values.length === 0) return report;

        const stmt = db.prepare('UPDATE facts SET importance = ? WHERE id = ?');
        try {
            db.run('BEGIN');
            for (const row of candidates[0].values) {
                report.factsProcessed += 1;
                const id = row[0] as number;
                const kind = (row[1] as FactKind) ?? 'fact';
                const currentImportance = row[2] as number;
                const createdAt = row[3] as string;
                const lastUsedAtRaw = row[4] as string | null;
                const useCount = (row[5] as number) ?? 0;
                const confirmationCount = (row[6] as number) ?? 1;

                const next = computeNextImportance(
                    currentImportance, kind, createdAt, lastUsedAtRaw,
                    useCount, confirmationCount, now, minImportance,
                );
                if (Math.abs(next - currentImportance) < 0.001) continue;
                stmt.run([next, id]);
                report.factsUpdated += 1;
                if (kind in report.byKind) {
                    report.byKind[kind] += 1;
                }
            }
            db.run('COMMIT');
        } catch (e) {
            db.run('ROLLBACK');
            throw e;
        } finally {
            stmt.free();
        }

        if (report.factsUpdated > 0) this.memoryDB.markDirty();
        return report;
    }
}

function computeNextImportance(
    current: number,
    kind: FactKind,
    createdAt: string,
    lastUsedAt: string | null,
    useCount: number,
    confirmationCount: number,
    now: Date,
    floor: number,
): number {
    const tier = confirmationCount >= PATTERN_THRESHOLD ? 'pattern' : 'single';
    const halfLifeDays = HALF_LIFE_DAYS_BY_TIER[kind][tier];
    let decayed = current;

    // Decay path -- skipped when half-life is null (pattern-tier
    // identity/fact/preference, single-tier preference is also null
    // by the legacy never-decay contract).
    if (halfLifeDays !== null) {
        const ageDays = ageInDays(createdAt, now);
        if (ageDays > 0) {
            decayed = current * Math.pow(0.5, ageDays / halfLifeDays);
        }
    }

    // Touch-refresh boost: facts used recently get a small additive boost.
    if (lastUsedAt) {
        const usedAgeDays = ageInDays(lastUsedAt, now);
        if (usedAgeDays >= 0 && usedAgeDays <= RECENCY_BOOST_DAYS) {
            decayed = Math.max(decayed, current + RECENCY_BOOST);
        }
    }

    // Use-count boost (preference + general): +0.01 per confirmation, capped.
    if (useCount > 0) {
        decayed = Math.max(decayed, Math.min(1, current + 0.01 * Math.min(useCount, 20)));
    }

    return clamp(decayed, floor, 1);
}

function ageInDays(iso: string, now: Date): number {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 0;
    return (now.getTime() - t) / DAY_MS;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}
