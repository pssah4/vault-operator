/**
 * RecallHit -- engine-public result type for memory retrieval.
 *
 * Used by ContextComposer (Hot-Memory-Block), recall_memory tool, and
 * UnifiedGraphService walks. Every hit carries its URI in canonical
 * form so downstream code (rendering, edge-walks, dedup) stays
 * URI-typed end to end.
 *
 * Cold-Start helper lives in this file because it informs which
 * retrieval branch ContextComposer picks.
 *
 * FEATURE-0317 / PLAN-006 task 3.
 */

import type { FactKind } from './FactStore';

export interface RecallHit {
    /** Canonical URI: `fact:<id>`, `session://<id>`, `vault://<path>`, `entity://<name>`, `thread://<id>`. */
    uri: string;
    /** Human-readable text (fact text, session summary excerpt, vault chunk). */
    text: string;
    /** Final fused score (RRF or post-rerank), comparable across hits. */
    score: number;
    /** Topics the hit is tagged with. Empty array for non-fact hits. */
    topics: string[];
    /** Optional: present for fact hits, undefined for session/vault hits. */
    kind?: FactKind;
    /**
     * Set true when an Edge to this URI failed to resolve and the hit
     * is included as a reference token only. ContextRanker scales the
     * score down so stale hits sit near the bottom of the list.
     */
    stale?: boolean;
    /**
     * Per-signal contributions (RRF debug metadata). Key is the signal
     * name (cosine / keyword / tag / edge-walk), value is the float
     * RRF contribution from that signal.
     */
    contributions: Record<string, number>;
}

export interface ColdStartOptions {
    /** Minimum facts required for the inferred topic before ColdStart triggers. */
    threshold?: number;
}

/**
 * ColdStart-Detection: when the inferred topic has fewer than `threshold`
 * facts, ContextComposer should fall back to a recency-based pick instead
 * of topic-filtered retrieval. Pure function -- callers feed it the count
 * they already have so this stays free of DB coupling.
 */
export function isColdStart(factsForTopic: number, opts: ColdStartOptions = {}): boolean {
    const threshold = opts.threshold ?? 5;
    return factsForTopic < threshold;
}
