import { describe, it, expect, vi } from 'vitest';
import { TensionDetector, type TensionResult } from '../TensionDetector';
import { findAutoBlock, replaceOrInsertAutoBlock } from '../MOCMaintainer';

describe('TensionDetector', () => {
    it('classifies claims and filters by confidence threshold', async () => {
        const lookup = vi.fn(async (claim: string, _topK: number) => [{
            path: 'Notes/Existing.md', summary: 'Existing summary', excerpt: 'Excerpt about ' + claim,
        }]);
        const classify = vi.fn(async () => ({
            relationship: 'contradicts' as const,
            targetNotePath: 'Notes/Existing.md',
            confidence: 0.8,
            rationale: 'Different conclusion than existing.',
        }));
        const detector = new TensionDetector(lookup, classify);
        const results = await detector.detect(['Claim 1']);
        expect(results.length).toBe(1);
        expect(results[0].classification?.relationship).toBe('contradicts');
        expect(lookup).toHaveBeenCalledWith('Claim 1', 3);
    });

    it('drops below confidence threshold (default 0.6)', async () => {
        const lookup = vi.fn(async () => [{ path: 'A', summary: 's', excerpt: 'e' }]);
        const classify = vi.fn(async () => ({
            relationship: 'contradicts' as const, confidence: 0.4, rationale: 'low conf',
        }));
        const detector = new TensionDetector(lookup, classify);
        const results = await detector.detect(['x']);
        expect(results[0].classification).toBeNull();
    });

    it('handles classifier-error gracefully', async () => {
        const lookup = vi.fn(async () => [{ path: 'A', summary: 's', excerpt: 'e' }]);
        const classify = vi.fn(async () => { throw new Error('synthetic'); });
        const detector = new TensionDetector(lookup, classify);
        const results = await detector.detect(['x']);
        expect(results[0].classification).toBeNull();
    });

    it('skips claim when no candidates returned', async () => {
        const lookup = vi.fn(async () => []);
        const classify = vi.fn();
        const detector = new TensionDetector(lookup, classify);
        const results = await detector.detect(['x']);
        expect(results[0].classification).toBeNull();
        expect(classify).not.toHaveBeenCalled();
    });

    it('renderMarker formats supports vs contradicts correctly', () => {
        const supports: TensionResult = {
            claim: 'X', classification: {
                relationship: 'supports', targetNotePath: 'A.md', confidence: 0.9, rationale: 'matches',
            },
        };
        const contradicts: TensionResult = {
            claim: 'X', classification: {
                relationship: 'contradicts', targetNotePath: 'A.md', confidence: 0.9, rationale: 'differs',
            },
        };
        expect(TensionDetector.renderMarker(supports)).toContain('[!support]');
        expect(TensionDetector.renderMarker(supports)).toContain('Stuetzt');
        expect(TensionDetector.renderMarker(contradicts)).toContain('[!tension]');
        expect(TensionDetector.renderMarker(contradicts)).toContain('Widerspricht');
    });

    it('markerWorthy filters neutral and orthogonal', () => {
        const neutral: TensionResult = {
            claim: 'X', classification: { relationship: 'neutral', confidence: 0.9, rationale: 'r' },
        };
        expect(TensionDetector.markerWorthy(neutral)).toBe(false);
    });
});

describe('MOCMaintainer findAutoBlock + replaceOrInsertAutoBlock', () => {
    it('inserts new block after-frontmatter when none exists', () => {
        const md = `---\ntitle: MOC\n---\n\n# Body content here.\n`;
        const r = replaceOrInsertAutoBlock(md, 'auto-content-line\nanother-line');
        expect(r.written).toBe(true);
        expect(r.newContent).toContain('obsilo:auto-start');
        expect(r.newContent).toContain('auto-content-line');
        expect(r.newContent).toContain('obsilo:auto-end');
        expect(r.newContent).toContain('# Body content here.');
    });

    it('replaces existing block when SHA matches', () => {
        const initial = replaceOrInsertAutoBlock('# Title\n', 'old-body');
        expect(initial.written).toBe(true);

        const replaced = replaceOrInsertAutoBlock(initial.newContent!, 'new-body');
        expect(replaced.written).toBe(true);
        expect(replaced.newContent).toContain('new-body');
        expect(replaced.newContent).not.toContain('old-body');
    });

    it('skips when block-body unchanged (no-change)', () => {
        const initial = replaceOrInsertAutoBlock('# Title\n', 'same-body');
        const second = replaceOrInsertAutoBlock(initial.newContent!, 'same-body');
        expect(second.written).toBe(false);
        expect(second.skippedReason).toBe('no-change');
    });

    it('skips when user has modified the block (SHA mismatch)', () => {
        const initial = replaceOrInsertAutoBlock('# Title\n', 'system-body');
        // User editiert den Body manuell (zwischen den Markern)
        const tampered = initial.newContent!.replace('system-body', 'user-edited-body');
        const result = replaceOrInsertAutoBlock(tampered, 'new-system-body');
        expect(result.written).toBe(false);
        expect(result.skippedReason).toBe('user-modified');
    });

    it('findAutoBlock locates id correctly', () => {
        const initial = replaceOrInsertAutoBlock('# x\n', 'body', { blockId: 'header-1' });
        const found = findAutoBlock(initial.newContent!, 'header-1');
        expect(found).not.toBeNull();
        expect(found?.body).toBe('body');
        expect(found?.id).toBe('header-1');
    });

    it('findAutoBlock returns null for missing id', () => {
        const md = '# no markers here';
        expect(findAutoBlock(md, 'whatever')).toBeNull();
    });
});
