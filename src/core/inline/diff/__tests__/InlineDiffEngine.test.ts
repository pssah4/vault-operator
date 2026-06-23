import { describe, it, expect } from 'vitest';
import {
    buildDiffState,
    getDecision,
    setDecision,
    acceptAll,
    rejectAll,
    applyDiff,
    isResolved,
    countDecisions,
} from '../InlineDiffEngine';

describe('InlineDiffEngine.buildDiffState', () => {
    it('returns no hunks for identical text', () => {
        const state = buildDiffState('hello world', 'hello world');
        expect(state.hunks).toHaveLength(0);
        expect(applyDiff(state)).toBe('hello world');
        expect(isResolved(state)).toBe(true);
    });

    it('detects a single replacement hunk', () => {
        const state = buildDiffState('hello world', 'hello there');
        expect(state.hunks.length).toBeGreaterThanOrEqual(1);
        // Find the hunk that contains the replaced "world" -> "there".
        const replacement = state.hunks.find(h => h.oldText.includes('world') && h.newText.includes('there'));
        expect(replacement).toBeDefined();
    });

    it('detects pure insertion', () => {
        const state = buildDiffState('hello', 'hello world');
        const insertion = state.hunks.find(h => h.oldText === '' && h.newText.length > 0);
        expect(insertion).toBeDefined();
    });

    it('detects pure deletion', () => {
        const state = buildDiffState('hello world', 'hello');
        const deletion = state.hunks.find(h => h.oldText.length > 0 && h.newText === '');
        expect(deletion).toBeDefined();
    });

    it('produces hunks with stable ids (deterministic)', () => {
        const a = buildDiffState('foo bar', 'foo qux');
        const b = buildDiffState('foo bar', 'foo qux');
        expect(a.hunks.map(h => h.id)).toEqual(b.hunks.map(h => h.id));
    });
});

describe('InlineDiffEngine.applyDiff', () => {
    it('returns original when all hunks pending', () => {
        const state = buildDiffState('hello world', 'hello there');
        expect(applyDiff(state)).toBe('hello world');
    });

    it('returns proposed text when all hunks accepted', () => {
        const state = buildDiffState('hello world', 'hello there');
        const all = acceptAll(state);
        expect(applyDiff(all)).toBe('hello there');
    });

    it('returns original when all hunks rejected', () => {
        const state = buildDiffState('hello world', 'hello there');
        const all = rejectAll(state);
        expect(applyDiff(all)).toBe('hello world');
    });

    it('applies per-hunk decisions independently', () => {
        const state = buildDiffState('alpha beta gamma', 'alpha BETA gamma DELTA');
        // Accept the first replacement, reject the trailing insertion.
        let s = state;
        const replacement = state.hunks.find(h => h.newText.includes('BETA'));
        const insertion = state.hunks.find(h => h.oldText === '' && h.newText.includes('DELTA'));
        if (replacement === undefined || insertion === undefined) {
            throw new Error('Test premise failed: expected two hunks');
        }
        s = setDecision(s, replacement.id, 'accepted');
        s = setDecision(s, insertion.id, 'rejected');
        const out = applyDiff(s);
        expect(out).toContain('BETA');
        expect(out).not.toContain('DELTA');
    });
});

describe('InlineDiffEngine.state mutations', () => {
    it('getDecision defaults to pending', () => {
        const state = buildDiffState('a b', 'a x');
        const id = state.hunks[0]?.id ?? '';
        expect(getDecision(state, id)).toBe('pending');
    });

    it('setDecision returns a new immutable object', () => {
        const state = buildDiffState('a b', 'a x');
        const id = state.hunks[0]?.id ?? '';
        const next = setDecision(state, id, 'accepted');
        expect(next).not.toBe(state);
        expect(next.decisions).not.toBe(state.decisions);
        expect(getDecision(state, id)).toBe('pending'); // original unchanged
        expect(getDecision(next, id)).toBe('accepted');
    });

    it('acceptAll marks every hunk accepted', () => {
        const state = buildDiffState('a b c d', 'a B c D');
        const accepted = acceptAll(state);
        for (const h of state.hunks) {
            expect(getDecision(accepted, h.id)).toBe('accepted');
        }
        expect(isResolved(accepted)).toBe(true);
    });

    it('rejectAll marks every hunk rejected', () => {
        const state = buildDiffState('a b c d', 'a B c D');
        const rejected = rejectAll(state);
        for (const h of state.hunks) {
            expect(getDecision(rejected, h.id)).toBe('rejected');
        }
        expect(isResolved(rejected)).toBe(true);
    });

    it('countDecisions tallies all three categories', () => {
        const state = buildDiffState('a b c', 'a B C');
        const accepted = setDecision(state, state.hunks[0].id, 'accepted');
        const counts = countDecisions(accepted);
        // We have at least one accepted; remaining are pending.
        expect(counts.accepted).toBeGreaterThanOrEqual(1);
        expect(counts.pending + counts.accepted + counts.rejected).toBe(state.hunks.length);
    });
});

describe('InlineDiffEngine.isResolved', () => {
    it('returns true when no hunks exist', () => {
        const state = buildDiffState('same', 'same');
        expect(isResolved(state)).toBe(true);
    });

    it('returns false while any hunk is pending', () => {
        const state = buildDiffState('a b', 'a x');
        expect(isResolved(state)).toBe(false);
    });

    it('returns true after acceptAll and rejectAll', () => {
        const state = buildDiffState('a b c', 'a x c');
        expect(isResolved(acceptAll(state))).toBe(true);
        expect(isResolved(rejectAll(state))).toBe(true);
    });
});
