import { describe, it, expect } from 'vitest';
import { markBlockIds, hasBlockId } from '../BlockIdSetter';

describe('BlockIdSetter', () => {
    it('appends ^block-1 to first anchored paragraph', () => {
        const md = `# Title\n\nFirst paragraph about AI.\n\nSecond paragraph.\n`;
        const r = markBlockIds(md, ['First paragraph about AI.']);
        expect(r.content).toContain('First paragraph about AI. ^block-1');
        expect(r.anchorToBlockId).toEqual({ 'First paragraph about AI.': 'block-1' });
    });

    it('respects existing ^block-N IDs and starts after max', () => {
        const md = `Para1 ^block-3\n\nPara2\n`;
        const r = markBlockIds(md, ['Para2']);
        expect(r.content).toContain('Para2 ^block-4');
        expect(r.anchorToBlockId).toEqual({ Para2: 'block-4' });
    });

    it('does not overwrite a paragraph that already has a block-id', () => {
        const md = `Para already tagged ^existing-id\n\nAnother\n`;
        const r = markBlockIds(md, ['Para already tagged']);
        expect(r.content).toContain('Para already tagged ^existing-id');
        expect(r.anchorToBlockId).toEqual({ 'Para already tagged': 'existing-id' });
    });

    it('skips anchors that are not found', () => {
        const md = `Some content.\n`;
        const r = markBlockIds(md, ['nonexistent']);
        expect(r.content).toBe(md);
        expect(r.anchorToBlockId).toEqual({});
    });

    it('handles multi-line block (block ends at blank line)', () => {
        const md = `Line A.\nLine B about topic.\nLine C still topic.\n\nNew block.\n`;
        const r = markBlockIds(md, ['Line A.']);
        // The block runs from "Line A." through "Line C still topic." -> id at end of block
        expect(r.content).toContain('Line C still topic. ^block-1');
    });

    it('multiple anchors get sequential IDs', () => {
        const md = `Block one.\n\nBlock two.\n\nBlock three.\n`;
        const r = markBlockIds(md, ['Block one.', 'Block three.']);
        expect(r.content).toContain('Block one. ^block-1');
        expect(r.content).toContain('Block three. ^block-2');
    });

    it('hasBlockId helper detects block-id form', () => {
        expect(hasBlockId('Some content ^block-1')).toBe(true);
        expect(hasBlockId('Some content')).toBe(false);
        expect(hasBlockId('Some content ^other-id')).toBe(false);
    });

    it('case-insensitive anchor fallback works', () => {
        const md = `Wichtige AUSSAGE ueber AI.\n\nAndere.\n`;
        const r = markBlockIds(md, ['wichtige aussage ueber ai.']);
        // Fallback findet die Zeile, hangt ID an
        expect(r.content).toContain('Wichtige AUSSAGE ueber AI. ^block-1');
    });
});
