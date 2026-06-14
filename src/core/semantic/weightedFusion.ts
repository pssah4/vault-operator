/**
 * Weighted RRF fusion for the hybrid semantic_search pipeline
 * (retrieval wave 1, item 4).
 *
 * Plain RRF lets the tag arm vote with full weight, so a tag-only hit at
 * tag rank 1 (1/61) displaces a real body keyword match at keyword rank 2
 * (1/62). This helper fixes two things behind the weightedFusionEnabled
 * settings flag:
 *
 *  1. The tag arm contribution is multiplied by TAG_ARM_WEIGHT (0.6),
 *     keeping tag recall while removing its power to outvote real matches.
 *  2. A bonus-only cosine blend: the fused RRF score is normalized to
 *     [0, 1] and, for paths the dense arm actually scored, multiplied by
 *     (1 + 0.3 * cosine). The blend can only lift dense-validated paths,
 *     never demote them. A weighted average (0.7 * rrf + 0.3 * cosine)
 *     would cap dense paths below the 1.0 that keyword/tag-only paths
 *     keep, re-creating for the dense arm exactly the displacement this
 *     module removes for the tag arm.
 *
 * With the flag disabled the function reproduces the previous direct
 * rrf() call exactly, so flag off is byte-identical to the old code path.
 *
 * Pure function: no DB, no obsidian, no globals (same engine-public
 * contract as rrf.ts, ADR-080).
 */

import { rrf } from '../memory/rrf';
import type { RrfResult } from '../memory/rrf';

/** RRF weight of the tag arm in weighted mode. */
export const TAG_ARM_WEIGHT = 0.6;
/** Weight of the dense cosine similarity in the bonus-only blend. */
export const COSINE_BONUS_WEIGHT = 0.3;

export interface HybridFusionArms {
    /** Dense (embedding) arm paths, best first. */
    semantic: readonly string[];
    /** Keyword (TF-IDF) arm paths, best first. */
    keyword: readonly string[];
    /** Tag-match arm paths, best first. */
    tag: readonly string[];
}

export interface HybridFusionOptions {
    /** false reproduces the legacy unweighted rrf() call exactly. */
    weighted: boolean;
    /**
     * Best dense cosine similarity per path. Only consulted in weighted
     * mode; paths missing from the map keep their plain normalized RRF.
     */
    cosineByPath?: ReadonlyMap<string, number>;
}

/**
 * Fuse the three hybrid search arms into one ordered list.
 * Returns RrfResult entries (id, score, contributions) sorted by score
 * descending; contributions stay raw RRF values for method classification.
 */
export function fuseHybridArms(arms: HybridFusionArms, options: HybridFusionOptions): RrfResult[] {
    if (!options.weighted) {
        // Legacy path: must stay byte-identical to the previous direct
        // rrf() call in SemanticSearchTool (flag-off contract).
        return rrf([
            { name: 'semantic', items: arms.semantic },
            { name: 'keyword', items: arms.keyword },
            { name: 'tag', items: arms.tag },
        ]);
    }

    const fused = rrf([
        { name: 'semantic', items: arms.semantic },
        { name: 'keyword', items: arms.keyword },
        { name: 'tag', items: arms.tag, weight: TAG_ARM_WEIGHT },
    ]);
    if (fused.length === 0) return fused;

    // rrf() returns the list sorted descending, so index 0 holds the max.
    const maxScore = fused[0].score;
    if (maxScore <= 0) return fused;

    const cosineByPath = options.cosineByPath;
    for (const entry of fused) {
        const normalizedRrf = entry.score / maxScore;
        const cosine = cosineByPath?.get(entry.id);
        // Bonus-only blend: paths the dense arm scored get lifted by up to
        // 1 + COSINE_BONUS_WEIGHT, paths without a dense cosine keep their
        // plain normalized RRF. Nobody is penalized: blending an implicit
        // cosine of 0 would punish keyword/tag-only hits, and a weighted
        // average would cap dense paths below keyword/tag-only ones.
        // Non-finite cosines (corrupted embedding blobs) are ignored so a
        // NaN cannot propagate into the sort.
        entry.score = typeof cosine === 'number' && Number.isFinite(cosine)
            ? normalizedRrf * (1 + COSINE_BONUS_WEIGHT * cosine)
            : normalizedRrf;
    }
    return fused.sort((a, b) => b.score - a.score);
}
