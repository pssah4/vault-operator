import { describe, it, expect } from 'vitest';
import { rerank, rerankWithBreakdown } from '../ContextRanker';
import type { RecallHit } from '../RecallHit';

const NOW = new Date('2026-04-28T12:00:00Z');

function hit(over: Partial<RecallHit>): RecallHit {
    return {
        uri: 'fact:1',
        text: 'sample',
        score: 0.5,
        topics: [],
        contributions: {},
        ...over,
    };
}

describe('ContextRanker.rerank (PLAN-006 task 8)', () => {
    it('returns hits unchanged when no boosts apply', () => {
        const a = hit({ uri: 'fact:1', score: 0.6 });
        const b = hit({ uri: 'fact:2', score: 0.4 });
        const out = rerank([a, b], { topicLock: null, now: NOW });
        expect(out.map(h => h.uri)).toEqual(['fact:1', 'fact:2']);
        expect(out[0].score).toBe(0.6);
        expect(out[1].score).toBe(0.4);
    });

    it('+0.20 when topic in topic-lock', () => {
        const inLock = hit({ uri: 'fact:1', score: 0.5, topics: ['coding'] });
        const out = rerank([inLock], { topicLock: 'coding', now: NOW });
        expect(out[0].score).toBeCloseTo(0.7, 5);
    });

    it('topic-lock boost flips ranking', () => {
        const a = hit({ uri: 'fact:1', score: 0.6, topics: ['cooking'] });
        const b = hit({ uri: 'fact:2', score: 0.5, topics: ['coding'] });
        const out = rerank([a, b], { topicLock: 'coding', now: NOW });
        expect(out[0].uri).toBe('fact:2');
        expect(out[0].score).toBeCloseTo(0.7, 5);
    });

    it('+0.10 recency boost when last_used_at within 7 days', () => {
        const recent = new Date('2026-04-25T12:00:00Z').toISOString();
        const out = rerank([hit({ score: 0.5 })], {
            topicLock: null, now: NOW,
            getLastUsedAt: () => recent,
        });
        expect(out[0].score).toBeCloseTo(0.6, 5);
    });

    it('no recency boost when last_used_at older than 7 days', () => {
        const old = new Date('2026-03-01T12:00:00Z').toISOString();
        const out = rerank([hit({ score: 0.5 })], {
            topicLock: null, now: NOW,
            getLastUsedAt: () => old,
        });
        expect(out[0].score).toBeCloseTo(0.5, 5);
    });

    it('+0.10 identity boost', () => {
        const out = rerank([hit({ score: 0.5, kind: 'identity' })], {
            topicLock: null, now: NOW,
        });
        expect(out[0].score).toBeCloseTo(0.6, 5);
    });

    it('-0.10 event-decay when age > 30 days', () => {
        const ancient = new Date('2026-02-01T12:00:00Z').toISOString();
        const out = rerank([hit({ score: 0.5, kind: 'event' })], {
            topicLock: null, now: NOW,
            getCreatedAt: () => ancient,
        });
        expect(out[0].score).toBeCloseTo(0.4, 5);
    });

    it('event within 30 days does NOT decay', () => {
        const recent = new Date('2026-04-15T12:00:00Z').toISOString();
        const out = rerank([hit({ score: 0.5, kind: 'event' })], {
            topicLock: null, now: NOW,
            getCreatedAt: () => recent,
        });
        expect(out[0].score).toBeCloseTo(0.5, 5);
    });

    it('stale flag multiplies score by 0.3', () => {
        const out = rerank([hit({ score: 0.5, stale: true })], { topicLock: null, now: NOW });
        expect(out[0].score).toBeCloseTo(0.15, 5);
    });

    it('stacks boosts additively then applies stale penalty multiplicatively', () => {
        // base=0.5 + topic 0.2 + recency 0.1 + identity 0.1 = 0.9 -> *0.3 = 0.27
        const recent = new Date('2026-04-26T12:00:00Z').toISOString();
        const out = rerank([hit({
            uri: 'fact:1', score: 0.5, kind: 'identity', topics: ['coding'], stale: true,
        })], {
            topicLock: 'coding', now: NOW,
            getLastUsedAt: () => recent,
        });
        expect(out[0].score).toBeCloseTo(0.27, 5);
    });

    it('rerankWithBreakdown returns per-hit breakdown for debugging', () => {
        const out = rerankWithBreakdown([
            hit({ uri: 'fact:1', score: 0.5, kind: 'identity', topics: ['coding'] }),
        ], { topicLock: 'coding', now: NOW });
        expect(out[0].breakdown.topicLockBoost).toBe(0.2);
        expect(out[0].breakdown.identityBoost).toBe(0.1);
        expect(out[0].breakdown.stalePenalty).toBe(1);
    });
});
