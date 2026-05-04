/**
 * Reciprocal Rank Fusion -- combine multiple ranked lists into one score.
 *
 * Cormack, Clarke, and Buettcher (2009) "Reciprocal rank fusion outperforms
 * Condorcet and individual rank learning methods". The score for an item
 * across N rankings is `sum(weight_i / (k + rank_i))` where rank is
 * 1-based and items missing from a ranking contribute 0.
 *
 * Used by Memory v2's hybrid `semantic_search` (Cosine + Trigram +
 * Tag-Match + 1-Hop-Edge-Walk) and reused by ContextComposer in Phase 3.
 * Pure function -- no DB, no obsidian, no globals -- so it is engine-
 * public from day one (ADR-080).
 *
 * FEATURE-0316 / PLAN-005 task 1.
 */

export interface RrfRanking {
    /** Optional human-readable signal name (Cosine, Trigram, ...). For debug only. */
    name?: string;
    /**
     * Ordered list of ids, best first. The position in this array
     * (0-based here) becomes rank in the standard RRF formula
     * (1-based internally).
     */
    items: readonly string[];
    /** Default 1.0. Lets callers downweight noisy signals. */
    weight?: number;
}

export interface RrfOptions {
    /**
     * RRF dampening constant. Cormack et al. recommend 60 for typical
     * IR retrieval; smaller values reward top-1 hits more aggressively.
     */
    k?: number;
}

export interface RrfResult {
    id: string;
    score: number;
    /** Per-signal contribution for debugging. Maps `signalName -> contribution`. */
    contributions: Record<string, number>;
}

/**
 * Fuse N rankings into a single ordered list. Returns items sorted by
 * fused score, descending. Items appearing in no ranking are excluded.
 */
export function rrf(rankings: readonly RrfRanking[], opts: RrfOptions = {}): RrfResult[] {
    const k = opts.k ?? 60;
    if (k < 0) throw new Error('rrf: k must be non-negative');

    const fused = new Map<string, RrfResult>();

    for (let i = 0; i < rankings.length; i++) {
        const ranking = rankings[i];
        const weight = ranking.weight ?? 1.0;
        const name = ranking.name ?? `signal-${i}`;
        if (weight === 0) continue;

        for (let position = 0; position < ranking.items.length; position++) {
            const id = ranking.items[position];
            if (typeof id !== 'string' || id.length === 0) continue;
            const rank = position + 1;
            const contribution = weight / (k + rank);

            const existing = fused.get(id);
            if (existing) {
                existing.score += contribution;
                existing.contributions[name] = (existing.contributions[name] ?? 0) + contribution;
            } else {
                fused.set(id, {
                    id,
                    score: contribution,
                    contributions: { [name]: contribution },
                });
            }
        }
    }

    return [...fused.values()].sort((a, b) => b.score - a.score);
}
