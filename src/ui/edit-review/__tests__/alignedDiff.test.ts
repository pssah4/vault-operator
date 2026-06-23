import { describe, it, expect } from 'vitest';
import { buildAlignedDiff } from '../alignedDiff';

describe('buildAlignedDiff', () => {
    it('aligns identical text 1:1', () => {
        const { left, right } = buildAlignedDiff('a\nb\nc\n', 'a\nb\nc\n');
        expect(left).toHaveLength(right.length);
        expect(left.every(l => l.type === 'unchanged')).toBe(true);
        expect(right.every(l => l.type === 'unchanged')).toBe(true);
    });

    it('pads the added side when more lines are removed than added', () => {
        // Original: A B C D E -> New: A X E (B,C,D removed; X added)
        const before = 'A\nB\nC\nD\nE\n';
        const after = 'A\nX\nE\n';
        const { left, right } = buildAlignedDiff(before, after);

        expect(left).toHaveLength(right.length);
        // Layout (zeile-für-zeile):
        //   0  A (unchanged)            A (unchanged)
        //   1  B (removed)              X (added)
        //   2  C (removed)              ' ' (padding)
        //   3  D (removed)              ' ' (padding)
        //   4  E (unchanged)            E (unchanged)
        expect(left.map(l => l.type)).toEqual(['unchanged', 'removed', 'removed', 'removed', 'unchanged']);
        expect(right.map(l => l.type)).toEqual(['unchanged', 'added', 'padding', 'padding', 'unchanged']);
        expect(left[1].content).toBe('B');
        expect(right[1].content).toBe('X');
        expect(left[4].content).toBe('E');
        expect(right[4].content).toBe('E');
    });

    it('pads the removed side when more lines are added than removed', () => {
        const before = 'A\nB\nE\n';
        const after = 'A\nX\nY\nZ\nE\n';
        const { left, right } = buildAlignedDiff(before, after);

        expect(left).toHaveLength(right.length);
        expect(left.map(l => l.type)).toEqual(['unchanged', 'removed', 'padding', 'padding', 'unchanged']);
        expect(right.map(l => l.type)).toEqual(['unchanged', 'added', 'added', 'added', 'unchanged']);
        expect(left[3].content).toBe('');
        expect(right[3].content).toBe('Z');
    });

    it('handles pure deletion (right side fully padded)', () => {
        const { left, right } = buildAlignedDiff('A\nB\nC\n', '');
        expect(left).toHaveLength(right.length);
        expect(left.every(l => l.type === 'removed')).toBe(true);
        expect(right.every(l => l.type === 'padding')).toBe(true);
    });

    it('handles pure insertion (left side fully padded)', () => {
        const { left, right } = buildAlignedDiff('', 'A\nB\nC\n');
        expect(left).toHaveLength(right.length);
        expect(left.every(l => l.type === 'padding')).toBe(true);
        expect(right.every(l => l.type === 'added')).toBe(true);
    });

    it('keeps subsequent unchanged blocks aligned after multiple hunks', () => {
        const before = 'A\nB\nC\nD\nE\nF\n';
        const after = 'A\nB2\nC\nD2\nE\nF\n';
        const { left, right } = buildAlignedDiff(before, after);
        expect(left).toHaveLength(right.length);
        // Find where E lives -- it must be on the same index in both arrays.
        const leftEIdx = left.findIndex(l => l.content === 'E');
        const rightEIdx = right.findIndex(l => l.content === 'E');
        expect(leftEIdx).toBe(rightEIdx);
        expect(left[leftEIdx].type).toBe('unchanged');
        expect(right[rightEIdx].type).toBe('unchanged');
    });
});
