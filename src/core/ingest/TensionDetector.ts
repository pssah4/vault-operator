/**
 * TensionDetector -- Hybrid Cosine-Pre-Filter + LLM-Klassifikation.
 *
 * Backs FEAT-19-13 (Tension-Detection). Implementiert ADR-99 Hybrid-
 * Strategie: pro Claim Top-K Cluster-Notes via Cosine, dann ein
 * LLM-Call zur Klassifikation supports/contradicts/neutral/orthogonal.
 *
 * Embedding-Lookup und LLM-Call werden vom Caller per Constructor-
 * Hook injiziert (kein direktes Coupling). Tests benutzen Mock-
 * Implementierungen.
 */

export type TensionRelation = 'supports' | 'contradicts' | 'neutral' | 'orthogonal';

export interface CandidateNote {
    path: string;
    summary: string;
    excerpt: string;
}

export interface TensionClassification {
    relationship: TensionRelation;
    targetNotePath?: string;
    confidence: number; // 0..1
    rationale: string;
}

export interface TensionResult {
    claim: string;
    classification: TensionClassification | null;
}

export interface TensionDetectorOptions {
    /** Top-K Cluster-Notes pro Claim (Default 3, ADR-99). */
    topK?: number;
    /** Confidence-Threshold fuer Marker-Display (Default 0.6, ADR-99). */
    confidenceThreshold?: number;
}

export type CandidateLookupFn = (claim: string, topK: number) => Promise<CandidateNote[]>;
export type ClassifyFn = (input: { claim: string; candidates: CandidateNote[] }) => Promise<TensionClassification>;

export class TensionDetector {
    private readonly topK: number;
    private readonly confidenceThreshold: number;

    constructor(
        private readonly candidateLookup: CandidateLookupFn,
        private readonly classifier: ClassifyFn,
        options: TensionDetectorOptions = {},
    ) {
        this.topK = options.topK ?? 3;
        this.confidenceThreshold = options.confidenceThreshold ?? 0.6;
    }

    async detect(claims: string[]): Promise<TensionResult[]> {
        const results: TensionResult[] = [];
        for (const claim of claims) {
            try {
                const candidates = await this.candidateLookup(claim, this.topK);
                if (candidates.length === 0) {
                    results.push({ claim, classification: null });
                    continue;
                }
                const classification = await this.classifier({ claim, candidates });
                if (classification.confidence < this.confidenceThreshold) {
                    results.push({ claim, classification: null });
                } else {
                    results.push({ claim, classification });
                }
            } catch (err) {
                console.warn(`[TensionDetector] classify failed for claim:`, err);
                results.push({ claim, classification: null });
            }
        }
        return results;
    }

    /** Filter: nur Tension-Marker mit relationship=supports oder contradicts. */
    static markerWorthy(result: TensionResult): boolean {
        if (!result.classification) return false;
        return result.classification.relationship === 'supports' || result.classification.relationship === 'contradicts';
    }

    /** Render-Helper fuer Inline-Callout im Sense-Making-Note. */
    static renderMarker(result: TensionResult): string {
        if (!result.classification || !this.markerWorthy(result)) return '';
        const c = result.classification;
        const type = c.relationship === 'supports' ? 'support' : 'tension';
        const verb = c.relationship === 'supports' ? 'Stuetzt' : 'Widerspricht';
        const target = c.targetNotePath ? `[[${c.targetNotePath}]]` : '(unspecified)';
        return `> [!${type}] ${verb} ${target}\n> ${c.rationale}`;
    }
}
