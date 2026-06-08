import { describe, it, expect } from 'vitest';
import { ToolRepetitionDetector } from '../ToolRepetitionDetector';

/**
 * FEAT-32-02 PR 2.2 / ADR-133: FastPath-driven dispatches must show up in the
 * episodic toolSequence + ledger so RecipePromotion sees the full chronological
 * path, but they MUST NOT feed the repetition-detection sliding window
 * (FastPath batches are deterministic, not a flailing-loop signal).
 */
describe('ToolRepetitionDetector.recordForEpisodeOnly (FEAT-32-02 PR 2.2)', () => {
    it('appends to the tool sequence and ledger', () => {
        const d = new ToolRepetitionDetector();
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'read ok', 0);
        d.recordForEpisodeOnly('write_file', { path: 'b.md' }, 'wrote', 0);
        expect(d.getToolSequence()).toEqual(['read_file', 'write_file']);
        expect(d.getLedger()).toContain('read_file');
        expect(d.getLedger()).toContain('write_file');
    });

    it('does NOT feed the repetition sliding window (block-check stays open)', () => {
        const d = new ToolRepetitionDetector();
        // Three FastPath records of the exact same call should NOT trigger a block,
        // because FastPath batches are deterministic and never re-fire the same input
        // multiple times in the loop sense.
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'r1', 0);
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'r2', 0);
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'r3', 0);
        const check = d.check('read_file', { path: 'a.md' });
        expect(check.blocked).toBe(false);
    });

    it('interleaves correctly with loop-driven record() calls (chronological order)', () => {
        const d = new ToolRepetitionDetector();
        d.recordForEpisodeOnly('search_files', { query: 'foo' }, 'fp', 0);
        d.record('read_file', { path: 'a.md' }, 'loop read', 1);
        d.recordForEpisodeOnly('write_file', { path: 'b.md' }, 'fp write', 1);
        d.record('attempt_completion', { result: 'done' }, 'completed', 2);
        expect(d.getToolSequence()).toEqual([
            'search_files',
            'read_file',
            'write_file',
            'attempt_completion',
        ]);
    });

    it('loop record() still triggers exact-repetition block after the limit', () => {
        const d = new ToolRepetitionDetector();
        // FastPath records of the same input do NOT count toward block.
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'fp', 0);
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'fp', 0);
        d.recordForEpisodeOnly('read_file', { path: 'a.md' }, 'fp', 0);
        // Three subsequent loop records of the same input MUST trigger the block.
        d.record('read_file', { path: 'a.md' }, 'loop', 1);
        d.record('read_file', { path: 'a.md' }, 'loop', 2);
        d.record('read_file', { path: 'a.md' }, 'loop', 3);
        const check = d.check('read_file', { path: 'a.md' });
        expect(check.blocked).toBe(true);
    });
});
