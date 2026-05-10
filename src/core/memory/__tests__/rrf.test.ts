import { describe, it, expect } from 'vitest';
import { rrf } from '../rrf';

describe('rrf (PLAN-005 task 1)', () => {
    it('a single ranking is identity (items keep their order)', () => {
        const result = rrf([{ name: 'cos', items: ['a', 'b', 'c'] }]);
        expect(result.map(r => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty list when no rankings supplied', () => {
        expect(rrf([])).toEqual([]);
    });

    it('returns empty list when all rankings are empty', () => {
        expect(rrf([{ items: [] }, { items: [] }])).toEqual([]);
    });

    it('fuses two rankings -- common item climbs', () => {
        const result = rrf([
            { name: 'cos', items: ['a', 'b', 'c'] },
            { name: 'tri', items: ['c', 'a', 'b'] },
        ]);
        // a: 1/(60+1) + 1/(60+2)
        // c: 1/(60+3) + 1/(60+1)
        // b: 1/(60+2) + 1/(60+3)
        // a beats both -- it has top-1 in cos and top-2 in tri
        expect(result[0].id).toBe('a');
    });

    it('weight=0 disables a ranking entirely', () => {
        const result = rrf([
            { name: 'cos', items: ['a', 'b'], weight: 0 },
            { name: 'tri', items: ['b', 'a'] },
        ]);
        expect(result[0].id).toBe('b'); // tri's top
    });

    it('higher weight makes a ranking dominate', () => {
        const result = rrf([
            { name: 'cos', items: ['a', 'b'], weight: 1 },
            { name: 'tri', items: ['b', 'a'], weight: 100 },
        ]);
        expect(result[0].id).toBe('b');
    });

    it('items only in one ranking still appear in the fused list', () => {
        const result = rrf([
            { name: 'cos', items: ['a', 'b'] },
            { name: 'tri', items: ['c'] },
        ]);
        const ids = result.map(r => r.id);
        expect(ids).toContain('a');
        expect(ids).toContain('b');
        expect(ids).toContain('c');
    });

    it('records per-signal contributions for debugging', () => {
        const result = rrf([
            { name: 'cos', items: ['a'] },
            { name: 'tri', items: ['a'] },
        ]);
        expect(result[0].contributions).toHaveProperty('cos');
        expect(result[0].contributions).toHaveProperty('tri');
        expect(result[0].contributions.cos).toBeCloseTo(1 / 61, 8);
        expect(result[0].contributions.tri).toBeCloseTo(1 / 61, 8);
    });

    it('default signal name is "signal-<index>" when not provided', () => {
        const result = rrf([{ items: ['x'] }, { items: ['x'] }]);
        expect(result[0].contributions).toHaveProperty('signal-0');
        expect(result[0].contributions).toHaveProperty('signal-1');
    });

    it('rejects negative k', () => {
        expect(() => rrf([{ items: ['a'] }], { k: -1 })).toThrow(/non-negative/);
    });

    it('skips empty/non-string ids', () => {
        const result = rrf([{ items: ['a', '', 'b'] }]);
        expect(result.map(r => r.id)).toEqual(['a', 'b']);
    });

    it('matches the textbook RRF example with k=60', () => {
        // Three rankings, item "x" is rank 1 in all three -> max possible score
        const score = rrf([
            { items: ['x', 'y'] },
            { items: ['x', 'z'] },
            { items: ['x', 'q'] },
        ])[0].score;
        // 3 * 1/61
        expect(score).toBeCloseTo(3 / 61, 8);
    });
});
