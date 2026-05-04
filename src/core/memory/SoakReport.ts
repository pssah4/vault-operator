/**
 * SoakReport -- daily snapshot of Memory v2 health metrics.
 *
 * Phase 6 -> Phase 7 soak phase: the user runs the "Generate memory
 * soak report" command once a day, copies the JSON to chat. The agent
 * (or human reviewer) compares against previous days to spot trends:
 * unbounded growth, aging not firing, dedup over-/under-triggering,
 * throttle thrashing, etc.
 *
 * The report is a plain object intended to be JSON.stringify'd. No
 * obsidian import -- engine layer (ADR-080).
 */

import type { MemoryDB } from '../knowledge/MemoryDB';
import type { HistoryDB } from '../knowledge/HistoryDB';
import type { ConversationStore } from '../history/ConversationStore';
import type { ExtractionQueue } from './ExtractionQueue';

export interface SoakReport {
    generatedAt: string;
    schema: { memoryDb: number; historyDb: number };
    counts: {
        factsLatest: number;
        factsTotal: number;
        factsByKind: Record<string, number>;
        soulFacts: number;
        capabilityFacts: number;
        sessionsRows: number;
        conversationThreadsRows: number;
        historyChunks: number;
        conversationsInStore: number;
        edges: number;
    };
    aging: {
        lastRunAt: string | null;
        sinceLastRunHours: number | null;
    };
    tokenBudget: {
        day: string | null;
        inputTokens: number;
        outputTokens: number;
    } | null;
    throttle: {
        trackedConversations: number;
        recentlyEnqueued: number;  // within the throttle window
        windowMs: number;
    };
    top: {
        byImportance: Array<{ id: number; text: string; kind: string; importance: number; confirmationCount: number; useCount: number }>;
        byConfirmationCount: Array<{ id: number; text: string; kind: string; confirmationCount: number }>;
        byUseCount: Array<{ id: number; text: string; kind: string; useCount: number }>;
    };
    integrationStats: {
        recentInsertedFromAudit24h: number;
        recentSupersededFromAudit24h: number;
        recentDeprecatedFromAudit24h: number;
    };
    queueState: {
        pendingItems: number;
        sessionDisabled: boolean;
        sessionDisabledReason: string | null;
    };
}

export function generateSoakReport(args: {
    memoryDB: MemoryDB | null;
    historyDB: HistoryDB | null;
    conversationStore: ConversationStore | null;
    extractionQueue: ExtractionQueue | null;
    settings: {
        memory: {
            lastAgingRunAt?: string | null;
            tokenBudgetState?: { day: string; inputTokens: number; outputTokens: number } | null;
            reExtractThrottleMs?: number;
        };
    };
}): SoakReport {
    const now = new Date();
    const report: SoakReport = {
        generatedAt: now.toISOString(),
        schema: {
            memoryDb: args.memoryDB?.getSchemaVersion?.() ?? 0,
            historyDb: args.historyDB?.getSchemaVersion?.() ?? 0,
        },
        counts: {
            factsLatest: 0, factsTotal: 0, factsByKind: {},
            soulFacts: 0, capabilityFacts: 0,
            sessionsRows: 0, conversationThreadsRows: 0,
            historyChunks: 0,
            conversationsInStore: args.conversationStore?.list?.().length ?? 0,
            edges: 0,
        },
        aging: { lastRunAt: null, sinceLastRunHours: null },
        tokenBudget: null,
        throttle: {
            trackedConversations: 0,
            recentlyEnqueued: 0,
            windowMs: args.settings.memory.reExtractThrottleMs ?? 60_000,
        },
        top: { byImportance: [], byConfirmationCount: [], byUseCount: [] },
        integrationStats: {
            recentInsertedFromAudit24h: 0,
            recentSupersededFromAudit24h: 0,
            recentDeprecatedFromAudit24h: 0,
        },
        queueState: {
            pendingItems: args.extractionQueue?.size?.() ?? 0,
            sessionDisabled: args.extractionQueue?.isSessionDisabled?.() ?? false,
            sessionDisabledReason: args.extractionQueue?.getSessionDisabledReason?.() ?? null,
        },
    };

    if (args.memoryDB?.isOpen()) {
        const db = args.memoryDB.getDB();
        report.counts.factsLatest = scalar(db, 'SELECT COUNT(*) FROM facts WHERE is_latest = 1 AND deprecated_at IS NULL');
        report.counts.factsTotal = scalar(db, 'SELECT COUNT(*) FROM facts');
        const byKind = db.exec(
            'SELECT kind, COUNT(*) FROM facts WHERE is_latest = 1 AND deprecated_at IS NULL GROUP BY kind',
        );
        if (byKind.length > 0) {
            for (const row of byKind[0].values) {
                report.counts.factsByKind[row[0] as string] = row[1] as number;
            }
        }
        report.counts.soulFacts = scalar(db,
            "SELECT COUNT(*) FROM facts WHERE profile_id = '_obsilo' AND topics LIKE '%\"soul\"%' AND is_latest = 1");
        report.counts.capabilityFacts = scalar(db,
            "SELECT COUNT(*) FROM facts WHERE profile_id = '_obsilo' AND topics LIKE '%\"capability\"%' AND is_latest = 1");
        report.counts.sessionsRows = scalar(db, 'SELECT COUNT(*) FROM sessions');
        report.counts.conversationThreadsRows = scalar(db, 'SELECT COUNT(*) FROM conversation_threads');
        report.counts.edges = scalar(db, 'SELECT COUNT(*) FROM fact_edges');

        const topImp = db.exec(
            `SELECT id, text, kind, importance, confirmation_count, use_count
               FROM facts WHERE is_latest = 1 AND deprecated_at IS NULL
              ORDER BY importance DESC LIMIT 5`,
        );
        if (topImp.length > 0) {
            report.top.byImportance = topImp[0].values.map(r => ({
                id: r[0] as number, text: trim(r[1] as string), kind: r[2] as string,
                importance: roundTo(r[3] as number, 3),
                confirmationCount: r[4] as number, useCount: r[5] as number,
            }));
        }
        const topConf = db.exec(
            `SELECT id, text, kind, confirmation_count
               FROM facts WHERE is_latest = 1 AND deprecated_at IS NULL
                AND confirmation_count > 1
              ORDER BY confirmation_count DESC LIMIT 5`,
        );
        if (topConf.length > 0) {
            report.top.byConfirmationCount = topConf[0].values.map(r => ({
                id: r[0] as number, text: trim(r[1] as string), kind: r[2] as string,
                confirmationCount: r[3] as number,
            }));
        }
        const topUse = db.exec(
            `SELECT id, text, kind, use_count
               FROM facts WHERE is_latest = 1 AND deprecated_at IS NULL
                AND use_count > 0
              ORDER BY use_count DESC LIMIT 5`,
        );
        if (topUse.length > 0) {
            report.top.byUseCount = topUse[0].values.map(r => ({
                id: r[0] as number, text: trim(r[1] as string), kind: r[2] as string,
                useCount: r[3] as number,
            }));
        }
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        report.integrationStats.recentInsertedFromAudit24h = scalar(db,
            "SELECT COUNT(*) FROM memory_audit WHERE operation = 'insert' AND timestamp > ?", [cutoff]);
        report.integrationStats.recentSupersededFromAudit24h = scalar(db,
            "SELECT COUNT(*) FROM memory_audit WHERE operation = 'supersede' AND timestamp > ?", [cutoff]);
        report.integrationStats.recentDeprecatedFromAudit24h = scalar(db,
            "SELECT COUNT(*) FROM memory_audit WHERE operation = 'deprecate' AND timestamp > ?", [cutoff]);
    }

    if (args.historyDB?.isOpen()) {
        const db = args.historyDB.getDB();
        report.counts.historyChunks = scalar(db, 'SELECT COUNT(*) FROM history_chunks');
    }

    if (args.settings.memory.lastAgingRunAt) {
        report.aging.lastRunAt = args.settings.memory.lastAgingRunAt;
        const diffMs = now.getTime() - new Date(args.settings.memory.lastAgingRunAt).getTime();
        report.aging.sinceLastRunHours = Math.round(diffMs / 36_000) / 100;
    }

    if (args.settings.memory.tokenBudgetState) {
        report.tokenBudget = {
            day: args.settings.memory.tokenBudgetState.day,
            inputTokens: args.settings.memory.tokenBudgetState.inputTokens,
            outputTokens: args.settings.memory.tokenBudgetState.outputTokens,
        };
    }

    // Throttle introspection -- access the private map via a typed cast
    // because the queue keeps it private but exposes no getter. Soak
    // report is read-only, so this is acceptable; we'd add a getter if
    // any other consumer needed it.
    const queue = args.extractionQueue as unknown as { lastEnqueuedAt?: Map<string, number> };
    if (queue?.lastEnqueuedAt instanceof Map) {
        report.throttle.trackedConversations = queue.lastEnqueuedAt.size;
        const cutoff = now.getTime() - report.throttle.windowMs;
        for (const ts of queue.lastEnqueuedAt.values()) {
            if (ts > cutoff) report.throttle.recentlyEnqueued += 1;
        }
    }

    return report;
}

function scalar(db: { exec(sql: string, params?: unknown[]): Array<{ values: unknown[][] }> }, sql: string, params?: unknown[]): number {
    try {
        const result = db.exec(sql, params);
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return Number(result[0].values[0][0]) || 0;
    } catch { return 0; }
}

function trim(s: string, max = 80): string {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function roundTo(n: number, digits: number): number {
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
}
