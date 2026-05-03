/**
 * FreshnessScorer -- Stufe-1 Composite-Freshness-Score (FEAT-19-16, ADR-94).
 *
 * Berechnet pro Cluster einen 0-100 Score lokal (kein LLM-Call):
 *   Score = w1 * (1 - Content-Age / Halbwertszeit)
 *         + w2 * (1 - Coverage-Drift)
 *         + w3 * (1 - Stale-Reference-Rate)
 *
 * Defaults: w1=0.6, w2=0.3, w3=0.1 (BA-25 Section 12.1).
 *
 * Schwellwerte:
 *   < 30 -> Critical
 *   30-50 -> Warning
 *   50-70 -> Hint
 *   > 70 -> OK
 *
 * Coverage-Drift und Stale-Reference-Rate werden hier vereinfacht
 * berechnet (Anteil von verlinkten Notes im Cluster, deren letzte
 * Aktivitaet ueber Halbwertszeit liegt). Eine vollstaendige Berechnung
 * mit Edge-Cluster-Membership kommt in PLAN-13.
 */

import type { ClusterMetadataStore, ClusterMetadataRecord } from '../knowledge/ClusterMetadataStore';

export interface FreshnessScoreInput {
    cluster: string;
    /** Minimum Note-Age in Tagen seit letzter Modification (typisch: avg ueber Cluster-Notes). */
    avgContentAgeDays: number;
    /** Anteil verlinkter Notes im Cluster die selbst stale sind, 0..1. */
    coverageDrift: number;
    /** Anteil externer Links die kaputt/umgezogen sind, 0..1. Default 0. */
    staleReferenceRate?: number;
}

export interface FreshnessScoreResult {
    cluster: string;
    score: number;
    severity: 'critical' | 'warning' | 'hint' | 'ok';
    halfLifeDays: number;
}

export interface FreshnessScorerOptions {
    weights?: { w1: number; w2: number; w3: number };
    thresholds?: { critical: number; warning: number; hint: number };
}

const DEFAULT_WEIGHTS = { w1: 0.6, w2: 0.3, w3: 0.1 };
const DEFAULT_THRESHOLDS = { critical: 30, warning: 50, hint: 70 };

export class FreshnessScorer {
    constructor(
        private readonly clusterMetadataStore: ClusterMetadataStore,
        private readonly options: FreshnessScorerOptions = {},
    ) {}

    score(input: FreshnessScoreInput): FreshnessScoreResult {
        const meta = this.clusterMetadataStore.get(input.cluster);
        const halfLifeDays = meta?.halfLifeDays ?? 180; // Tech-Default Fallback
        const weights = this.options.weights ?? meta?.customWeights as never ?? DEFAULT_WEIGHTS;
        const thresholds = this.options.thresholds ?? DEFAULT_THRESHOLDS;

        const w = normalizeWeights(weights);
        const ageRatio = halfLifeDays > 0 ? Math.min(1, input.avgContentAgeDays / halfLifeDays) : 0;
        const stale = input.staleReferenceRate ?? 0;

        // Score = w1 * freshness + w2 * (1 - drift) + w3 * (1 - stale)
        const score100 = 100 * (
            w.w1 * (1 - ageRatio) +
            w.w2 * (1 - clamp01(input.coverageDrift)) +
            w.w3 * (1 - clamp01(stale))
        );

        const score = Math.max(0, Math.min(100, score100));
        return {
            cluster: input.cluster,
            score: Math.round(score),
            severity: classifySeverity(score, thresholds),
            halfLifeDays,
        };
    }

    /** Convenience: scoreAll(meta-records) skipped here; caller iterates. */
    scoreAll(inputs: FreshnessScoreInput[]): FreshnessScoreResult[] {
        return inputs.map((i) => this.score(i));
    }
}

function normalizeWeights(w: { w1: number; w2: number; w3: number }) {
    const sum = w.w1 + w.w2 + w.w3;
    if (sum <= 0) return DEFAULT_WEIGHTS;
    return { w1: w.w1 / sum, w2: w.w2 / sum, w3: w.w3 / sum };
}

function clamp01(x: number): number {
    if (Number.isNaN(x)) return 0;
    return Math.max(0, Math.min(1, x));
}

function classifySeverity(
    score: number,
    thresholds: { critical: number; warning: number; hint: number },
): 'critical' | 'warning' | 'hint' | 'ok' {
    if (score < thresholds.critical) return 'critical';
    if (score < thresholds.warning) return 'warning';
    if (score < thresholds.hint) return 'hint';
    return 'ok';
}

// ----- explizit damit der Linter nicht meckert -----
export type { ClusterMetadataRecord };
