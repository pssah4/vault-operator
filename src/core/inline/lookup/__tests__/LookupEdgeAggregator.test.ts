import { describe, it, expect, vi } from 'vitest';
import { LookupEdgeAggregator, type EdgeProbe } from '../LookupEdgeAggregator';

function makeProbe(overrides: Partial<EdgeProbe> = {}): EdgeProbe {
    return {
        getOutgoing: vi.fn(() => []),
        getBacklinks: vi.fn(() => []),
        getTags: vi.fn(() => []),
        getImplicitNeighbors: vi.fn(() => []),
        ...overrides,
    } as EdgeProbe;
}

describe('LookupEdgeAggregator', () => {
    it('returns [] when seedPaths is empty', async () => {
        const aggregator = new LookupEdgeAggregator({ probe: makeProbe() });
        const out = await aggregator.collect({ seedPaths: [] });
        expect(out).toEqual([]);
    });

    it('collects backlinks + outgoing as separate edges', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getBacklinks: () => [{ sourcePath: 'B.md' }],
                getOutgoing: () => [{ targetPath: 'C.md' }],
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md'] });
        expect(out.map(e => e.targetPath).sort()).toEqual(['B.md', 'C.md']);
        const types = out.map(e => e.type);
        expect(types).toContain('backlink');
        expect(types).toContain('outgoing-link');
    });

    it('dedupes same target via backlink + tag, keeps backlink (higher priority)', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getBacklinks: (p) => p === 'A.md' ? [{ sourcePath: 'B.md' }] : [],
                getTags: (p) => p === 'A.md' ? ['#shared'] : p === 'B.md' ? ['#shared'] : [],
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md', 'B.md'], activeNotePath: 'A.md' });
        const bEntries = out.filter(e => e.targetPath === 'B.md');
        expect(bEntries).toHaveLength(1);
        expect(bEntries[0].type).toBe('backlink');
        expect(bEntries[0].secondaryTypes).toContain('tag-cooccurrence');
    });

    it('respects maxTotal cap', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getOutgoing: () => Array.from({ length: 20 }, (_, i) => ({ targetPath: `t${i}.md` })),
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md'], maxTotal: 5, maxPerType: 10 });
        expect(out).toHaveLength(5);
    });

    it('ranks backlink before implicit-similarity at equal score', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getBacklinks: (p) => p === 'S.md' ? [{ sourcePath: 'X.md' }] : [],
                getImplicitNeighbors: (p) => p === 'S.md' ? [{ path: 'Y.md', similarity: 1.0 }] : [],
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['S.md'] });
        expect(out[0].type).toBe('backlink');
        expect(out[0].targetPath).toBe('X.md');
    });

    it('handles probe throwing -- returns [] gracefully', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getBacklinks: () => { throw new Error('boom'); },
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md'] });
        expect(out).toEqual([]);
    });

    it('excludes paths in excludePaths', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getOutgoing: () => [{ targetPath: 'B.md' }, { targetPath: 'C.md' }],
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md'], excludePaths: ['B.md'] });
        expect(out.map(e => e.targetPath)).toEqual(['C.md']);
    });

    it('computes implicit-similarity score correctly', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getImplicitNeighbors: () => [{ path: 'Sim.md', similarity: 0.74 }],
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md'] });
        const sim = out.find(e => e.type === 'implicit-similarity');
        expect(sim?.score).toBe(0.74);
        expect(sim?.reason).toContain('74%');
    });

    it('does NOT include the seed itself when it backlinks itself', async () => {
        const aggregator = new LookupEdgeAggregator({
            probe: makeProbe({
                getBacklinks: () => [{ sourcePath: 'A.md' }],
            }),
        });
        const out = await aggregator.collect({ seedPaths: ['A.md'] });
        expect(out.find(e => e.targetPath === 'A.md')).toBeUndefined();
    });
});
