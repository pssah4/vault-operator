import { describe, it, expect } from 'vitest';
import { FreshnessScorer } from '../FreshnessScorer';
import type { ClusterMetadataStore } from '../../knowledge/ClusterMetadataStore';

function makeMetaStore(map: Record<string, { halfLifeDays: number }>): ClusterMetadataStore {
    return {
        get: (cluster: string) => map[cluster] ? {
            cluster,
            halfLifeDays: map[cluster].halfLifeDays,
            customWeights: null,
            lastExternalCheck: null,
            lastHintAt: null,
            hotCluster: false,
        } : null,
    } as unknown as ClusterMetadataStore;
}

describe('FreshnessScorer', () => {
    it('fresh cluster (age 0, no drift) -> score ~100, ok', () => {
        const scorer = new FreshnessScorer(makeMetaStore({ Tech: { halfLifeDays: 180 } }));
        const r = scorer.score({ cluster: 'Tech', avgContentAgeDays: 0, coverageDrift: 0 });
        expect(r.score).toBeGreaterThanOrEqual(99);
        expect(r.severity).toBe('ok');
    });

    it('age == half-life -> partial score (Tech), warning or hint', () => {
        const scorer = new FreshnessScorer(makeMetaStore({ Tech: { halfLifeDays: 180 } }));
        const r = scorer.score({ cluster: 'Tech', avgContentAgeDays: 180, coverageDrift: 0 });
        // w1=0.6 * 0 + w2=0.3 * 1 + w3=0.1 * 1 = 0.4 = 40
        expect(r.score).toBe(40);
        expect(r.severity).toBe('warning');
    });

    it('age > half-life with full drift -> critical', () => {
        const scorer = new FreshnessScorer(makeMetaStore({ Politik: { halfLifeDays: 30 } }));
        const r = scorer.score({ cluster: 'Politik', avgContentAgeDays: 60, coverageDrift: 1, staleReferenceRate: 0.5 });
        // w1=0.6 * 0 + w2=0.3 * 0 + w3=0.1 * 0.5 = 0.05 = 5
        expect(r.score).toBe(5);
        expect(r.severity).toBe('critical');
    });

    it('halfLifeDays=0 (Personal-Cluster) treats age as fresh', () => {
        const scorer = new FreshnessScorer(makeMetaStore({ Personal: { halfLifeDays: 0 } }));
        const r = scorer.score({ cluster: 'Personal', avgContentAgeDays: 1000, coverageDrift: 0 });
        // ageRatio = 0 (halfLife 0 -> code returns 0), score sehr hoch
        expect(r.severity).toBe('ok');
    });

    it('falls back to Tech-Default if cluster not in metadata', () => {
        const scorer = new FreshnessScorer(makeMetaStore({}));
        const r = scorer.score({ cluster: 'Unknown', avgContentAgeDays: 90, coverageDrift: 0 });
        // halfLifeDays default 180. ageRatio = 0.5 -> w1 * 0.5 + w2 * 1 + w3 * 1 = 0.7 = 70
        expect(r.score).toBe(70);
        expect(r.halfLifeDays).toBe(180);
    });

    it('thresholds correctly classified', () => {
        const scorer = new FreshnessScorer(makeMetaStore({ Tech: { halfLifeDays: 180 } }));
        const cases = [
            // age 410 (>>halfLife), drift 1, stale 1 -> 0 -> critical
            { age: 410, drift: 1, stale: 1, expected: 'critical' as const },
            // age 90 (halfLife/2), drift 0.5, stale 0.5 -> 0.6*0.5 + 0.3*0.5 + 0.1*0.5 = 0.5 = 50 -> hint
            { age: 90, drift: 0.5, stale: 0.5, expected: 'hint' as const },
            // age 100 (halfLife/1.8), drift 0.2, stale 0 -> 0.6*0.444 + 0.3*0.8 + 0.1 = 0.267 + 0.24 + 0.1 = 0.607 = 61 -> hint
            { age: 100, drift: 0.2, stale: 0, expected: 'hint' as const },
            // age 0, drift 0, stale 0 -> 100 -> ok
            { age: 0, drift: 0, stale: 0, expected: 'ok' as const },
            // age 60 (halfLife/3), drift 0.1, stale 0 -> 0.6*0.667 + 0.3*0.9 + 0.1 = 0.4 + 0.27 + 0.1 = 0.77 = 77 -> ok
            { age: 60, drift: 0.1, stale: 0, expected: 'ok' as const },
        ];
        for (const c of cases) {
            const r = scorer.score({ cluster: 'Tech', avgContentAgeDays: c.age, coverageDrift: c.drift, staleReferenceRate: c.stale });
            expect(r.severity, `age=${c.age} drift=${c.drift} stale=${c.stale} -> score=${r.score}`).toBe(c.expected);
        }
    });
});
