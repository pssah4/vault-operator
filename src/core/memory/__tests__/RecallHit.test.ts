import { describe, it, expect } from 'vitest';
import { isColdStart, type RecallHit } from '../RecallHit';

describe('isColdStart (PLAN-006 task 3)', () => {
    it('returns true when facts < default threshold (5)', () => {
        expect(isColdStart(0)).toBe(true);
        expect(isColdStart(4)).toBe(true);
    });

    it('returns false when facts >= default threshold', () => {
        expect(isColdStart(5)).toBe(false);
        expect(isColdStart(50)).toBe(false);
    });

    it('respects custom threshold', () => {
        expect(isColdStart(2, { threshold: 3 })).toBe(true);
        expect(isColdStart(3, { threshold: 3 })).toBe(false);
    });

    it('handles threshold=0 (never cold-start)', () => {
        expect(isColdStart(0, { threshold: 0 })).toBe(false);
    });
});

describe('RecallHit shape', () => {
    it('accepts a fact-shaped hit', () => {
        const hit: RecallHit = {
            uri: 'fact:42',
            text: 'Sebastian uses Obsidian',
            score: 0.85,
            topics: ['tools'],
            kind: 'preference',
            contributions: { cosine: 0.6, tag: 0.25 },
        };
        expect(hit.kind).toBe('preference');
        expect(hit.stale).toBeUndefined();
    });

    it('accepts a vault-shaped hit without kind', () => {
        const hit: RecallHit = {
            uri: 'vault://Notes/Project.md',
            text: 'Excerpt',
            score: 0.5,
            topics: [],
            contributions: { cosine: 0.5 },
        };
        expect(hit.kind).toBeUndefined();
    });

    it('accepts a stale hit', () => {
        const hit: RecallHit = {
            uri: 'vault://Notes/Deleted.md',
            text: '',
            score: 0.1,
            topics: [],
            stale: true,
            contributions: {},
        };
        expect(hit.stale).toBe(true);
    });
});
