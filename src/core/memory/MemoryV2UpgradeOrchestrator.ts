/**
 * MemoryV2UpgradeOrchestrator -- single entry-point for the cascade of
 * one-shot upgrade steps that run when an existing user opens Vault Operator
 * after a release that introduces v2 (or any later v2 -> v3 jump).
 *
 * Step pattern: each step is an independent class with `id`, `label`,
 * and `execute(ctx) -> StepResult`. The orchestrator runs them in
 * order, streams progress through `onProgress`, and produces a single
 * report. Failure of one step does not abort the cascade unless the
 * step is marked `critical`; non-critical failures are logged and the
 * cascade continues.
 *
 * Why: previous design exposed a "Memory engine: v1 / v2" toggle and
 * a single "Migrate v1 memory" button. That conflated user choice
 * (which path?) with implementation detail (cut-over flag) and missed
 * the broader cascade -- centroid seeds, settings-default refreshes,
 * etc. The orchestrator removes the toggle entirely (v2 is always the
 * answer) and turns "migration" into a transparent multi-step upgrade
 * that the user sees as one operation.
 *
 * Steps shipped today (Phase 3.6):
 *   1. MemoryMigrationStep      -- atomise v1 MDs + soul.md to facts/style
 *   2. SeedTopicCentroidsStep   -- populate known_topics.centroid_embedding
 *                                  for every distinct topic in the migrated
 *                                  facts so ContextComposer can lock topics
 *   3. SettingsDefaultsStep     -- reserved hook for future default migrations
 *                                  (no-op today; documents the slot)
 *
 * Future cascade steps (Phase 4+) plug in by appending to the step list.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals (ADR-080).
 *
 * FEATURE-0317 / Phase 3.6 -- supersedes the inline MemoryMigrationJob
 * UI flow.
 */

import type { FileAdapter } from '../storage/types';
import type { FactStore, Fact } from './FactStore';
import type { CommunicationStyleStore } from './CommunicationStyleStore';
import type { MemoryAtomizer } from './MemoryAtomizer';
import type { EmbeddingService } from './EmbeddingService';
import type { MemoryDB } from '../knowledge/MemoryDB';
import { MemoryMigrationJob, type MigrationReport } from './MemoryMigrationJob';

export interface UpgradeStepContext {
    fs: FileAdapter;
    factStore: FactStore;
    styleStore: CommunicationStyleStore;
    atomizer: MemoryAtomizer;
    embeddingService: EmbeddingService;
    memoryDB: MemoryDB;
    onProgress?: (msg: string) => void;
    /** Override for tests so timestamps stay deterministic. */
    timestamp?: string;
}

export interface UpgradeStepResult {
    id: string;
    label: string;
    ok: boolean;
    skipped?: boolean;
    /** Free-form summary, surfaced in the final report. */
    detail?: string;
    /** Step-specific structured data for downstream code (e.g. counts). */
    data?: Record<string, unknown>;
    /** Error message when ok=false. */
    error?: string;
}

export interface UpgradeStep {
    readonly id: string;
    readonly label: string;
    /** When true, a step error aborts the cascade. */
    readonly critical: boolean;
    execute(ctx: UpgradeStepContext): Promise<UpgradeStepResult>;
}

export interface UpgradeReport {
    timestamp: string;
    steps: UpgradeStepResult[];
    aborted: boolean;
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

/**
 * Wraps the existing MemoryMigrationJob (atomise + style + backup +
 * dedup). Marked critical -- without facts in the DB the rest of the
 * cascade has nothing to work with.
 */
export class MemoryMigrationStep implements UpgradeStep {
    readonly id = 'memory-migration';
    readonly label = 'Atomising legacy memory files';
    readonly critical = true;

    async execute(ctx: UpgradeStepContext): Promise<UpgradeStepResult> {
        ctx.onProgress?.(this.label);
        const job = new MemoryMigrationJob(
            ctx.fs, ctx.factStore, ctx.styleStore, ctx.atomizer,
        );
        const report = await job.run({ timestamp: ctx.timestamp });
        return {
            id: this.id, label: this.label, ok: true,
            detail: `${report.totalFactsInserted} facts, ${report.totalStylesInserted} style row${
                report.totalStylesInserted === 1 ? '' : 's'
            } -- backup: ${report.backupFolder}`,
            data: report as unknown as Record<string, unknown>,
        };
    }
}

/**
 * Computes a centroid embedding per distinct topic over the freshly
 * migrated facts and stores it in `known_topics`. ContextComposer
 * relies on these centroids to lock topics without an LLM call;
 * without this step migrated v1 users would always cold-start.
 *
 * Non-critical: the cascade can finish without centroids (cold-start
 * fallback handles it) but recall quality is materially worse until
 * the next FactExtractor run refreshes them.
 */
export class SeedTopicCentroidsStep implements UpgradeStep {
    readonly id = 'seed-topic-centroids';
    readonly label = 'Computing topic centroids';
    readonly critical = false;

    async execute(ctx: UpgradeStepContext): Promise<UpgradeStepResult> {
        ctx.onProgress?.(this.label);
        if (!ctx.embeddingService.isReady()) {
            return {
                id: this.id, label: this.label, ok: true, skipped: true,
                detail: 'embedding provider not configured',
            };
        }
        const facts = ctx.factStore.listLatest({ limit: 10000 });
        const byTopic = new Map<string, Fact[]>();
        for (const fact of facts) {
            for (const topic of fact.topics) {
                const list = byTopic.get(topic) ?? [];
                list.push(fact);
                byTopic.set(topic, list);
            }
        }
        if (byTopic.size === 0) {
            return {
                id: this.id, label: this.label, ok: true, skipped: true,
                detail: 'no topics in facts -- nothing to seed',
            };
        }

        const db = ctx.memoryDB.getDB();
        const now = new Date().toISOString();
        let written = 0;
        for (const [topic, factsInTopic] of byTopic) {
            const texts = factsInTopic.map(f => f.text);
            const embeddings = await ctx.embeddingService.embed(texts);
            if (embeddings.length === 0) continue;
            const dim = embeddings[0].length;
            const avg = new Float32Array(dim);
            for (const v of embeddings) {
                if (v.length !== dim) continue;
                for (let i = 0; i < dim; i++) avg[i] += v[i];
            }
            for (let i = 0; i < dim; i++) avg[i] /= embeddings.length;

            const blob = new Uint8Array(avg.buffer, avg.byteOffset, avg.byteLength);
            // INSERT OR REPLACE: known_topics is keyed on `topic`, so this
            // upserts the centroid + last-seen + counts in one step.
            db.run(
                `INSERT OR REPLACE INTO known_topics
                    (topic, fact_count, first_seen_at, last_seen_at,
                     centroid_embedding, centroid_computed_at)
                 VALUES (?, ?, COALESCE((SELECT first_seen_at FROM known_topics WHERE topic = ?), ?), ?, ?, ?)`,
                [topic, factsInTopic.length, topic, now, now, blob, now],
            );
            written += 1;
        }
        ctx.memoryDB.markDirty();
        return {
            id: this.id, label: this.label, ok: true,
            detail: `seeded ${written} topic centroid${written === 1 ? '' : 's'}`,
            data: { topicsSeeded: written },
        };
    }
}

/**
 * Reserved slot for future default-value migrations (e.g. when a new
 * release ships a setting whose default differs from the previous
 * value and existing users should pick up the new default unless
 * they had customised it). Today: no-op marker so the cascade list
 * already shows the slot in reports.
 *
 * When you need it: inject the `settings` object via the context (add
 * a settings handle to UpgradeStepContext), compare per-key against
 * the old default snapshot, only overwrite where the user value
 * matches the *previous* default. Persist via plugin.saveSettings.
 */
export class SettingsDefaultsStep implements UpgradeStep {
    readonly id = 'settings-defaults';
    readonly label = 'Refreshing default settings';
    readonly critical = false;

    // eslint-disable-next-line @typescript-eslint/require-await -- UpgradeStep interface contract: async signature shared with steps that do disk I/O
    async execute(ctx: UpgradeStepContext): Promise<UpgradeStepResult> {
        ctx.onProgress?.(this.label);
        // Reserved -- no diff today. When new releases need to migrate
        // a default, add the diff logic here. The slot is in the
        // cascade report so users see it ran.
        return {
            id: this.id, label: this.label, ok: true, skipped: true,
            detail: 'no settings-default migrations pending in this release',
        };
    }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class MemoryV2UpgradeOrchestrator {
    private readonly steps: UpgradeStep[];

    constructor(steps?: UpgradeStep[]) {
        this.steps = steps ?? [
            new MemoryMigrationStep(),
            new SeedTopicCentroidsStep(),
            new SettingsDefaultsStep(),
        ];
    }

    async run(ctx: UpgradeStepContext): Promise<UpgradeReport> {
        const report: UpgradeReport = {
            timestamp: ctx.timestamp ?? new Date().toISOString(),
            steps: [],
            aborted: false,
        };
        for (const step of this.steps) {
            try {
                const result = await step.execute(ctx);
                report.steps.push(result);
                if (!result.ok && step.critical) {
                    report.aborted = true;
                    return report;
                }
            } catch (e) {
                const message = (e as Error).message ?? String(e);
                report.steps.push({
                    id: step.id, label: step.label, ok: false, error: message,
                });
                if (step.critical) {
                    report.aborted = true;
                    return report;
                }
            }
        }
        return report;
    }

    /** Convenience accessor for the migration-job report inside an orchestrator run. */
    static findMigrationReport(report: UpgradeReport): MigrationReport | null {
        const step = report.steps.find(s => s.id === 'memory-migration');
        return (step?.data as MigrationReport | undefined) ?? null;
    }
}
