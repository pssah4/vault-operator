/**
 * FreshnessOrchestrator -- per-cluster note-level verifier pipeline
 * (IMP-20-06-01 W2-T5).
 *
 * Flow per cluster:
 *   1. NoteSelector picks N candidate notes (volatile-first).
 *   2. For each candidate: read body via vault adapter, build query,
 *      run FreshnessWebSearch.
 *   3. FreshnessVerifier produces a NoteVerdict (mid + optional
 *      frontier).
 *   4. Verdict goes into note_freshness_history (retained), and the
 *      latest values mirror into note_freshness columns.
 *   5. Aggregated NoteVerdict[] feeds back to the caller, which
 *      attaches them to the cluster's UpdateFinding.
 *
 * The orchestrator is provider- and vault-agnostic for testability.
 * main.ts wires the real callbacks.
 *
 * Wayfinder entry: see `src/ARCHITECTURE.map`, row `freshness-orchestrator`.
 */

import type { FreshnessQueryBuilder } from './FreshnessQueryBuilder';
import type { FreshnessVerifier } from './FreshnessVerifier';
import type { FreshnessWebSearch } from './FreshnessWebSearch';
import type { NoteFreshnessHistoryStore } from './NoteFreshnessHistoryStore';
import type { NoteSelector } from './NoteSelector';
import type { NoteVerdict } from './types';

interface SqlDb {
    run(sql: string, params?: unknown[]): unknown;
}

export type ReadNoteBodyFn = (path: string) => Promise<string | null>;
export type GetTopEntitiesFn = (path: string) => string[];
export type IsEnabledFn = () => boolean;

export interface FreshnessOrchestratorDeps {
    selector: NoteSelector;
    queryBuilder: FreshnessQueryBuilder;
    webSearch: FreshnessWebSearch;
    verifier: FreshnessVerifier;
    history: NoteFreshnessHistoryStore;
    db: SqlDb;
    readNoteBody: ReadNoteBodyFn;
    getTopEntities?: GetTopEntitiesFn;
    /**
     * Audit M-3 mitigation (AUDIT-IMP-20-06-01-2026-06-19):
     * outer authorization gate. The orchestrator MUST NOT touch
     * note_freshness or note_freshness_history when no freshness
     * sub-flag is enabled. main.ts wires this to the user setting
     * so a fresh install does not write verifier rows the user
     * never opted into.
     */
    enabled?: IsEnabledFn;
    now?: () => Date;
}

export interface RunForClusterResult {
    verdicts: NoteVerdict[];
    tokensUsed: number;
}

export class FreshnessOrchestrator {
    constructor(private readonly deps: FreshnessOrchestratorDeps) {}

    async runForCluster(cluster: string): Promise<RunForClusterResult> {
        if (this.deps.enabled && !this.deps.enabled()) {
            return { verdicts: [], tokensUsed: 0 };
        }
        const now = (this.deps.now ?? (() => new Date()))();
        const candidates = this.deps.selector.pickCandidates(cluster, now);
        if (!candidates.length) return { verdicts: [], tokensUsed: 0 };

        const verdicts: NoteVerdict[] = [];
        let tokensUsed = 0;

        for (const candidate of candidates) {
            const body = await this.deps.readNoteBody(candidate.path);
            if (body === null) continue;

            const topEntities = this.deps.getTopEntities?.(candidate.path) ?? [];
            const title = extractTitle(body, candidate.path);
            const query = this.deps.queryBuilder.build({
                notePath: candidate.path,
                title,
                cluster,
                topEntities,
            });

            const webResults = query
                ? await this.deps.webSearch.search(query, 5)
                : [];
            const sources = webResults.map((r) => r.url);

            const verdict = await this.deps.verifier.verifyNote(
                { path: candidate.path, body },
                { cluster, sources },
            );

            tokensUsed += verdict.tokensUsed;

            this.persistVerdict(verdict, now);
            verdicts.push(verdict);
        }

        return { verdicts, tokensUsed };
    }

    private persistVerdict(verdict: NoteVerdict, now: Date): void {
        const runAt = now.toISOString();
        const sourcesJson = JSON.stringify(verdict.sources);

        this.deps.history.recordRun({
            path: verdict.path,
            runAt,
            verdict: verdict.verdict,
            confidence: verdict.confidence,
            verifierTier: verdict.verifierTier,
            modelId: verdict.modelId,
            tokensUsed: verdict.tokensUsed,
            summary: verdict.summary,
            sources: verdict.sources,
            now,
        });

        this.deps.db.run(
            `UPDATE note_freshness
             SET last_verdict = ?, last_confidence = ?, last_summary = ?,
                 last_sources_json = ?, last_checked_at = ?, last_verifier_tier = ?
             WHERE path = ?`,
            [
                verdict.verdict,
                verdict.confidence,
                verdict.summary,
                sourcesJson,
                runAt,
                verdict.verifierTier,
                verdict.path,
            ],
        );
    }
}

function extractTitle(body: string, fallbackPath: string): string {
    const firstHeading = body.split('\n').find((line) => line.startsWith('# '));
    if (firstHeading) return firstHeading.slice(2).trim();
    const filename = fallbackPath.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
}
