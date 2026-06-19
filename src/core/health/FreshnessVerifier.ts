/**
 * FreshnessVerifier -- mid-tier-default with optional frontier escalation
 * under ZDR (IMP-20-06-01 W1-T5).
 *
 * Decides per ADR-135:
 * - Mid-tier always runs first.
 * - Frontier only fires when the mid verdict confidence is below the
 *   configured threshold AND the verdict severity is in the configured
 *   escalation filter AND `allowFrontierEscalation` is on AND the
 *   provider exposes a ZDR (zero-data-retention) capability flag.
 * - Without ZDR or with escalation disabled, the mid verdict stays.
 *   That is the fail-closed contract from ADR-135.
 *
 * Wayfinder: see `src/ARCHITECTURE.map`, row `freshness-verifier`.
 * Spec: IMP-20-06-01. ADR refs: ADR-135.
 */

import type { NoteVerdict, VerdictLiteral, VerifierTier } from './types';

/**
 * Input the verifier hands to the LLM provider. The provider builds the
 * actual prompt; the verifier owns only the routing.
 */
export interface VerifierInput {
    note: { path: string; body: string };
    cluster: { cluster: string; sources?: string[] };
}

/**
 * Raw response shape the provider returns. The verifier converts it
 * into a `NoteVerdict` after deciding which tier the value came from.
 */
export interface RawVerdict {
    verdict: VerdictLiteral;
    confidence: number;
    summary: string;
    sources: string[];
    tokensUsed: number;
}

/**
 * Provider abstraction the verifier consumes. The plugin wires this to
 * the existing provider layer; tests pass a fake.
 */
export interface VerifierProvider {
    callMidTier(input: VerifierInput): Promise<RawVerdict>;
    callFrontier(input: VerifierInput): Promise<RawVerdict>;
    /**
     * Reports whether the active frontier provider configuration
     * guarantees ZDR / no-training / no-logging. Per ADR-135 the
     * verifier MUST NOT escalate when this returns false.
     */
    hasZdrCapability(): boolean;
    /** Provider-side identifier for the mid-tier model. */
    midModelId: string;
    /** Provider-side identifier for the frontier model. */
    frontierModelId: string;
}

export interface VerifierSettings {
    allowFrontierEscalation: boolean;
    frontierConfidenceThreshold: number;
    /** Verdict literals that justify escalation. */
    frontierSeverityFilter: VerdictLiteral[];
}

export class FreshnessVerifier {
    constructor(
        private readonly provider: VerifierProvider,
        private readonly settings: VerifierSettings,
    ) {}

    async verifyNote(
        note: VerifierInput['note'],
        cluster: VerifierInput['cluster'],
    ): Promise<NoteVerdict> {
        const input: VerifierInput = { note, cluster };

        const midRaw = await this.provider.callMidTier(input);
        const midVerdict = this.materialize(midRaw, 'mid', this.provider.midModelId, note.path);

        if (!this.shouldEscalate(midRaw)) {
            return midVerdict;
        }

        if (!this.provider.hasZdrCapability()) {
            // Fail-closed per ADR-135: stay mid-tier, keep the lower
            // confidence value so the UI can flag it.
            return midVerdict;
        }

        const frontierRaw = await this.provider.callFrontier(input);
        return this.materialize(
            frontierRaw,
            'frontier',
            this.provider.frontierModelId,
            note.path,
            midRaw.tokensUsed,
        );
    }

    private shouldEscalate(midRaw: RawVerdict): boolean {
        if (!this.settings.allowFrontierEscalation) return false;
        if (midRaw.confidence >= this.settings.frontierConfidenceThreshold) return false;
        if (!this.settings.frontierSeverityFilter.includes(midRaw.verdict)) return false;
        return true;
    }

    private materialize(
        raw: RawVerdict,
        tier: VerifierTier,
        modelId: string,
        path: string,
        carryTokens = 0,
    ): NoteVerdict {
        return {
            path,
            verdict: raw.verdict,
            confidence: raw.confidence,
            summary: raw.summary,
            sources: raw.sources,
            verifierTier: tier,
            modelId,
            tokensUsed: raw.tokensUsed + carryTokens,
        };
    }
}
