/**
 * alignedDiff -- pad-aligned side-by-side diff for the EditReviewPanel
 * (EPIC-33 Diff-UX-refresh, 2026-06-22).
 *
 * `diffLines` returns a flat sequence of `unchanged`, `removed`, `added`
 * lines. Rendering each column independently leaves the two sides out of
 * vertical sync as soon as a hunk has a different number of removed vs
 * added lines. This helper groups removals and insertions into hunks and
 * pads the shorter side with `padding` rows so the left and right arrays
 * have the same length and Zeile N corresponds to Zeile N visually.
 *
 * Pure-logic, free of DOM imports. The renderer in EditReviewPanel walks
 * the two output arrays in lock-step.
 */

import { diffLines, type DiffLine } from '../../core/utils/diffLines';

export type AlignedLineType = 'unchanged' | 'removed' | 'added' | 'padding';

export interface AlignedLine {
    type: AlignedLineType;
    content: string;
    /**
     * 1-based line number in the corresponding source (before for the
     * left column, after for the right column). Null for padding rows
     * that don't exist in that source.
     */
    lineNumber: number | null;
}

export interface AlignedDiff {
    left: AlignedLine[];
    right: AlignedLine[];
}

export function buildAlignedDiff(before: string, after: string): AlignedDiff {
    const lines = diffLines(before, after);
    const left: AlignedLine[] = [];
    const right: AlignedLine[] = [];
    let leftNo = 1;
    let rightNo = 1;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.type === 'unchanged') {
            left.push({ type: 'unchanged', content: line.content, lineNumber: leftNo });
            right.push({ type: 'unchanged', content: line.content, lineNumber: rightNo });
            leftNo += 1;
            rightNo += 1;
            i += 1;
            continue;
        }
        // Collect a contiguous removed+added hunk.
        const removed: DiffLine[] = [];
        const added: DiffLine[] = [];
        while (i < lines.length && lines[i].type !== 'unchanged') {
            if (lines[i].type === 'removed') removed.push(lines[i]);
            else added.push(lines[i]);
            i += 1;
        }
        const max = Math.max(removed.length, added.length);
        for (let j = 0; j < max; j += 1) {
            const r = removed[j];
            const a = added[j];
            if (r !== undefined) {
                left.push({ type: 'removed', content: r.content, lineNumber: leftNo });
                leftNo += 1;
            } else {
                left.push({ type: 'padding', content: '', lineNumber: null });
            }
            if (a !== undefined) {
                right.push({ type: 'added', content: a.content, lineNumber: rightNo });
                rightNo += 1;
            } else {
                right.push({ type: 'padding', content: '', lineNumber: null });
            }
        }
    }

    return { left, right };
}
