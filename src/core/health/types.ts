/**
 * Shared types for IMP-20-06-01 (FEAT-20-06 Stage 4+5 verifier).
 *
 * The vocabulary maps the FEAT-19-12 TriageCard concepts onto
 * English-only verdict literals: `matches` (the note agrees with the
 * sources), `extends` (the sources add detail), `contradicts` (the
 * sources contradict the note). Plus the two freshness-specific
 * values `outdated` and `no_external_source` that the verifier needs.
 *
 * Confidence stays on the 0.0..1.0 REAL scale used by `edges.confidence`
 * (FEAT-20-01) so all confidence values across the codebase are
 * comparable without rescaling.
 *
 * Historic note (v11 → v12 schema migration, 2026-06-19): the original
 * verdict set was German (`deckt-sich`, `ergaenzt`, `widerspricht`).
 * The DB migration in KnowledgeDB.ts rewrites any stored German values
 * to the English canon. UI and frontmatter writes use English from v12
 * onwards.
 *
 * Wayfinder: see `src/ARCHITECTURE.map`, row `freshness-verifier`.
 * Spec: IMP-20-06-01. ADR refs: ADR-135.
 */

export type VerdictLiteral =
    | 'matches'
    | 'extends'
    | 'contradicts'
    | 'outdated'
    | 'no_external_source';

export type VerifierTier = 'mid' | 'frontier';

/**
 * Result of a single note verification run. Persisted into
 * `note_freshness` (current) and `note_freshness_history` (audit
 * trail). Surfaced via the Knowledge-review tab in the existing
 * VaultHealthRepairModal.
 */
export interface NoteVerdict {
    /** Vault-relative note path. */
    path: string;
    /** Verdict literal that maps to the severity badge in the UI. */
    verdict: VerdictLiteral;
    /** Verifier confidence on the 0.0..1.0 scale. */
    confidence: number;
    /** One-line user-facing summary; up to 200 characters. */
    summary: string;
    /** Source URLs the verifier consulted. */
    sources: string[];
    /**
     * Which tier produced this verdict. Frontier means the call ran
     * through a zero-data-retention endpoint per ADR-135.
     */
    verifierTier: VerifierTier;
    /** Provider-side model identifier. */
    modelId: string;
    /** Token cost of this verdict's LLM call(s). */
    tokensUsed: number;
}
