/**
 * Stufe3PeriodicJob -- wochentlicher Background-Job mit hartem
 * Token-Budget-Cap.
 *
 * Backs FEAT-19-20 (Periodischer Lint) plus FEAT-19-21 (Hot-Cluster).
 * ADR-105: setInterval mit Cooldown-Persistenz, Hard-Cap mit
 * 80%-Notification, kalender-wochentlich Reset Montag 0:00.
 *
 * Pipeline:
 *   1. Iteration ueber Hot-Clusters (sortiert nach Freshness-Score asc).
 *   2. Pro Cluster: Semantic-Pre-Filter LLM-Call (yes/no/unsure).
 *   3. Bei yes/unsure: Light-Web-Search-Pass plus LLM-Synthese.
 *   4. Strong-Signal-Filter (min N unabhaengige Sources).
 *   5. Notification gesammelt.
 *
 * LLM-Call und Web-Search sind als Hooks injiziert (kein direktes
 * Coupling). Token-Counter pro Call.
 */

import type { ClusterMetadataStore, ClusterMetadataRecord } from '../knowledge/ClusterMetadataStore';
import type { KnowledgeDB } from '../knowledge/KnowledgeDB';

export interface PreFilterResult { decision: 'yes' | 'no' | 'unsure'; tokensUsed: number; }
export interface UpdateFinding {
    cluster: string;
    title: string;
    summary: string;
    sources: string[]; // url-list
    detectedAt: string;
    strongSignal: boolean;
    /**
     * Optional per-note verdicts attached to this cluster finding.
     * Populated by the FreshnessVerifier wiring from IMP-20-06-01.
     * Existing notification sinks that only consume cluster-level
     * fields ignore this; the Knowledge-review tab reads it.
     * Additive per ADR-105 amendment 2026-06-19.
     */
    notes?: import('./types').NoteVerdict[];
}

export interface WebUpdatePassResult {
    findings: UpdateFinding[];
    tokensUsed: number;
}

export type PreFilterFn = (cluster: ClusterMetadataRecord) => Promise<PreFilterResult>;
export type WebUpdatePassFn = (cluster: ClusterMetadataRecord) => Promise<WebUpdatePassResult>;
export type NotificationSink = (findings: UpdateFinding[]) => void;
export type BudgetExceededSink = (info: { spentUsd: number; budgetUsd: number }) => void;

export interface Stufe3JobOptions {
    /** Default 2.0 USD pro Woche. */
    weeklyBudgetUsd: number;
    /** Default 0.8: Notification ab 80%. */
    notificationThreshold: number;
    /** Wenn dryRun true: Web-Search/LLM-Calls werden simuliert (Zero-Cost). */
    dryRun?: boolean;
    /** Tokens-zu-USD-Konversion (zB Haiku ~ 0.0015 USD/1k input). Default Haiku-Schatzung. */
    tokensPerUsd?: number;
}

export interface Stufe3JobState {
    weekStartIso: string; // ISO date of monday-week-start (UTC)
    spentUsd: number;
    notifiedAt80Percent: boolean;
}

export interface Stufe3RunResult {
    clustersProcessed: number;
    findingsCount: number;
    spentUsd: number;
    budgetExceeded: boolean;
    state: Stufe3JobState;
}

const DEFAULT_TOKENS_PER_USD = 660_000; // ~0.0015 USD per 1k tokens (Haiku-Schaetzung input)

/**
 * AUDIT-014 Info-1 (IMP-19-20-01): persistent state via dedicated row
 * in cluster_metadata. Reserved cluster-name guarantees no collision
 * with real clusters; custom_weights JSON-Spalte wird als state-blob
 * verwendet. Vermeidet Schema-Migration v10 -> v11.
 */
const STATE_ROW_CLUSTER = '__stufe3_job_state__';

export interface Stufe3StatePersistence {
    load(): Stufe3JobState | null;
    save(state: Stufe3JobState): void;
}

/** Default-Persistence ueber cluster_metadata-Row mit reserviertem Namen. */
export class ClusterMetadataStatePersistence implements Stufe3StatePersistence {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}
    load(): Stufe3JobState | null {
        if (!this.knowledgeDB.isOpen()) return null;
        const db = this.knowledgeDB.getDB();
        const r = db.exec(
            `SELECT custom_weights FROM cluster_metadata WHERE cluster = ?`,
            [STATE_ROW_CLUSTER],
        );
        if (!r.length || !r[0].values.length) return null;
        const raw = r[0].values[0][0] as string | null;
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Stufe3JobState;
        } catch {
            return null;
        }
    }
    save(state: Stufe3JobState): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run(
            `INSERT INTO cluster_metadata (cluster, half_life_days, custom_weights) VALUES (?, ?, ?)
             ON CONFLICT(cluster) DO UPDATE SET custom_weights = excluded.custom_weights`,
            [STATE_ROW_CLUSTER, 0, JSON.stringify(state)],
        );
        this.knowledgeDB.markDirty();
    }
}

export class Stufe3PeriodicJob {
    private state: Stufe3JobState;

    constructor(
        private readonly clusterMetadataStore: ClusterMetadataStore,
        private readonly preFilter: PreFilterFn,
        private readonly webUpdatePass: WebUpdatePassFn,
        private readonly notificationSink: NotificationSink,
        private readonly options: Stufe3JobOptions,
        initialState?: Stufe3JobState,
        private readonly budgetExceededSink?: BudgetExceededSink,
        private readonly persistence?: Stufe3StatePersistence,
    ) {
        this.state = initialState ?? this.persistence?.load() ?? this.freshState();
    }

    /** Sollte beim Plugin-Onload aufgerufen werden bevor run() laeuft. */
    rolloverIfNewWeek(): void {
        const currentWeekStart = mondayOfWeek(new Date()).toISOString();
        if (currentWeekStart !== this.state.weekStartIso) {
            this.state = { weekStartIso: currentWeekStart, spentUsd: 0, notifiedAt80Percent: false };
            this.persistence?.save(this.state);
        }
    }

    getState(): Stufe3JobState { return { ...this.state }; }

    /** Single Pass. setInterval-Wrapper liegt im Plugin. */
    async run(): Promise<Stufe3RunResult> {
        this.rolloverIfNewWeek();
        const result: Stufe3RunResult = {
            clustersProcessed: 0,
            findingsCount: 0,
            spentUsd: 0,
            budgetExceeded: false,
            state: this.state,
        };

        const hot = this.clusterMetadataStore.getHotClusters();
        // Sort by lastExternalCheck asc (oldest first), so reife Cluster zuerst
        hot.sort((a, b) => {
            const ta = a.lastExternalCheck ? new Date(a.lastExternalCheck).getTime() : 0;
            const tb = b.lastExternalCheck ? new Date(b.lastExternalCheck).getTime() : 0;
            return ta - tb;
        });

        const allFindings: UpdateFinding[] = [];

        for (const cluster of hot) {
            if (this.budgetReached()) {
                result.budgetExceeded = true;
                break;
            }

            // Step 1: Pre-Filter
            const pre = await this.preFilter(cluster);
            this.spendTokens(pre.tokensUsed);
            if (this.budgetReached()) { result.budgetExceeded = true; break; }
            if (pre.decision === 'no') {
                result.clustersProcessed++;
                continue;
            }

            // Step 2: Web-Update-Pass
            const webResult = await this.webUpdatePass(cluster);
            this.spendTokens(webResult.tokensUsed);
            this.clusterMetadataStore.setLastExternalCheck(cluster.cluster, new Date().toISOString());

            // Step 3: Strong-Signal-Filter
            for (const finding of webResult.findings) {
                if (finding.strongSignal) allFindings.push(finding);
            }
            result.clustersProcessed++;

            if (this.budgetReached()) { result.budgetExceeded = true; break; }
        }

        if (allFindings.length > 0) {
            this.notificationSink(allFindings);
        }

        result.findingsCount = allFindings.length;
        result.spentUsd = this.state.spentUsd;
        result.state = { ...this.state };
        return result;
    }

    private spendTokens(tokens: number): void {
        const tokensPerUsd = this.options.tokensPerUsd ?? DEFAULT_TOKENS_PER_USD;
        const cost = tokens / tokensPerUsd;
        this.state.spentUsd += cost;
        const ratio = this.state.spentUsd / this.options.weeklyBudgetUsd;
        if (!this.state.notifiedAt80Percent && ratio >= this.options.notificationThreshold) {
            this.state.notifiedAt80Percent = true;
            this.budgetExceededSink?.({ spentUsd: this.state.spentUsd, budgetUsd: this.options.weeklyBudgetUsd });
        }
        // AUDIT-014 IMP-19-20-01: persist state nach jeder Spending-Operation
        // damit Plugin-Reload mid-week das Budget korrekt fortfuehrt.
        this.persistence?.save(this.state);
    }

    private budgetReached(): boolean {
        return this.state.spentUsd >= this.options.weeklyBudgetUsd;
    }

    private freshState(): Stufe3JobState {
        return {
            weekStartIso: mondayOfWeek(new Date()).toISOString(),
            spentUsd: 0,
            notifiedAt80Percent: false,
        };
    }
}

/** Berechnet Montag 0:00 UTC der Wochenwoche fuer ein gegebenes Datum. */
export function mondayOfWeek(d: Date): Date {
    const date = new Date(d.getTime());
    const day = date.getUTCDay(); // 0=So, 1=Mo, ..., 6=Sa
    const diff = day === 0 ? -6 : 1 - day; // shift to Monday
    date.setUTCDate(date.getUTCDate() + diff);
    date.setUTCHours(0, 0, 0, 0);
    return date;
}
