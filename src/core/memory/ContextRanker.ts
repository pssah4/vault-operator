/**
 * ContextRanker -- post-RRF re-rank pass that injects contextual boosts.
 *
 * RRF (FEATURE-0316 task 1) only knows about per-signal ranking. Real
 * recall quality depends on context the signals can't see: which topic
 * the conversation is locked on right now, when the fact was last used,
 * whether it's an identity statement that always matters, whether it's a
 * stale event from months ago, and whether the upstream Edge resolution
 * declared the URI dead.
 *
 * Boosts (FEATURE-0317 DoD, "Context-aware Reranker"):
 *   +0.20  topic in the active topic-lock
 *   +0.10  last_used_at within 7 days
 *   +0.10  kind === 'identity'
 *   -0.10  kind === 'event' AND age > 30 days
 *    *0.3  stale === true   (multiplicative)
 *
 * Pure function -- no DB, no clock side-effects (the caller passes
 * `now`). Engine-public, ADR-080 compliant.
 *
 * FEATURE-0317 / PLAN-006 task 8.
 */

import type { RecallHit } from './RecallHit';

export interface RerankContext {
    /** Active topic locked on the conversation; null when cold-start. */
    topicLock: string | null;
    /** Reference timestamp; tests inject a fixed value. */
    now: Date;
    /**
     * Optional per-fact `last_used_at` lookup. Caller wires this against
     * FactStore (or supplies pre-fetched data). A null result means the
     * fact has never been used and therefore doesn't earn the recency boost.
     */
    getLastUsedAt?: (uri: string) => string | null;
    /** Same idea for fact `created_at`, used for the event-decay rule. */
    getCreatedAt?: (uri: string) => string | null;
}

export interface RerankBreakdown {
    base: number;
    topicLockBoost: number;
    recencyBoost: number;
    identityBoost: number;
    eventDecay: number;
    stalePenalty: number; // multiplicative factor (1 = no penalty, 0.3 = stale)
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function rerank(
    hits: readonly RecallHit[],
    ctx: RerankContext,
): RecallHit[] {
    const reranked = hits.map(hit => {
        const breakdown = computeBreakdown(hit, ctx);
        const score = applyBreakdown(hit.score, breakdown);
        return { ...hit, score };
    });
    reranked.sort((a, b) => b.score - a.score);
    return reranked;
}

/** Variant returning the breakdown alongside each hit -- useful for tests/logs. */
export function rerankWithBreakdown(
    hits: readonly RecallHit[],
    ctx: RerankContext,
): Array<RecallHit & { breakdown: RerankBreakdown }> {
    const out = hits.map(hit => {
        const breakdown = computeBreakdown(hit, ctx);
        const score = applyBreakdown(hit.score, breakdown);
        return { ...hit, score, breakdown };
    });
    out.sort((a, b) => b.score - a.score);
    return out;
}

function computeBreakdown(hit: RecallHit, ctx: RerankContext): RerankBreakdown {
    const breakdown: RerankBreakdown = {
        base: hit.score,
        topicLockBoost: 0,
        recencyBoost: 0,
        identityBoost: 0,
        eventDecay: 0,
        stalePenalty: 1,
    };

    if (ctx.topicLock && hit.topics.includes(ctx.topicLock)) {
        breakdown.topicLockBoost = 0.2;
    }

    const lastUsedAt = ctx.getLastUsedAt?.(hit.uri) ?? null;
    if (lastUsedAt) {
        const ageMs = ctx.now.getTime() - new Date(lastUsedAt).getTime();
        if (ageMs >= 0 && ageMs <= 7 * DAY_MS) {
            breakdown.recencyBoost = 0.1;
        }
    }

    if (hit.kind === 'identity') {
        breakdown.identityBoost = 0.1;
    }

    if (hit.kind === 'event') {
        const createdAt = ctx.getCreatedAt?.(hit.uri) ?? null;
        if (createdAt) {
            const ageMs = ctx.now.getTime() - new Date(createdAt).getTime();
            if (ageMs > 30 * DAY_MS) {
                breakdown.eventDecay = -0.1;
            }
        }
    }

    if (hit.stale) {
        breakdown.stalePenalty = 0.3;
    }

    return breakdown;
}

function applyBreakdown(base: number, b: RerankBreakdown): number {
    const additive =
        b.topicLockBoost +
        b.recencyBoost +
        b.identityBoost +
        b.eventDecay;
    return (base + additive) * b.stalePenalty;
}
