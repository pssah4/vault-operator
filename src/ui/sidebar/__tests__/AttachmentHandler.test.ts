/**
 * FIX-19-28-05 / ADR-112 regression: clear() must not touch fullDocTexts,
 * and consumeFullDocTexts() must atomically snapshot+clear so the tool-handoff
 * cannot leak state across turns.
 */

import { describe, it, expect } from 'vitest';
import { Vault } from 'obsidian';
import { AttachmentHandler } from '../AttachmentHandler';

function makeHandler(): AttachmentHandler {
    const vault = new Vault();
    const chipBar = { empty: () => undefined } as unknown as HTMLElement;
    return new AttachmentHandler(vault, chipBar);
}

/** pushFullDocText is private; tests reach the underlying array directly. */
function pushDoc(handler: AttachmentHandler, text: string): void {
    (handler as unknown as { fullDocTexts: string[] }).fullDocTexts.push(text);
}

describe('AttachmentHandler lifecycle', () => {
    describe('clear()', () => {
        it('does NOT touch fullDocTexts (FIX-19-28-05 regression)', () => {
            const h = makeHandler();
            pushDoc(h, 'doc-A');
            pushDoc(h, 'doc-B');

            h.clear();

            expect(h.getFullDocTexts()).toEqual(['doc-A', 'doc-B']);
        });
    });

    describe('consumeFullDocTexts()', () => {
        it('returns a snapshot and clears the internal buffer atomically', () => {
            const h = makeHandler();
            pushDoc(h, 'doc-A');
            pushDoc(h, 'doc-B');

            const result = h.consumeFullDocTexts();

            expect(result).toEqual(['doc-A', 'doc-B']);
            expect(h.getFullDocTexts()).toEqual([]);
        });

        it('returns a fresh array, not the internal reference', () => {
            const h = makeHandler();
            pushDoc(h, 'doc-A');

            const result = h.consumeFullDocTexts();
            result.push('mutated-after-consume');

            // internal state must not see the post-consume mutation
            expect(h.getFullDocTexts()).toEqual([]);
            // and a re-push should not include the mutation either
            pushDoc(h, 'doc-B');
            expect(h.getFullDocTexts()).toEqual(['doc-B']);
        });

        it('returns [] when the buffer is empty and leaves it empty', () => {
            const h = makeHandler();

            const result = h.consumeFullDocTexts();

            expect(result).toEqual([]);
            expect(h.getFullDocTexts()).toEqual([]);
        });
    });

    describe('cross-turn state-leak protection', () => {
        it('second consume without a fresh push returns [] (no stale state)', () => {
            const h = makeHandler();
            pushDoc(h, 'doc-A');

            const first = h.consumeFullDocTexts();
            const second = h.consumeFullDocTexts();

            expect(first).toEqual(['doc-A']);
            expect(second).toEqual([]);
        });
    });

    describe('FEAT-24-03 attachment context budget', () => {
        type Priv = {
            truncateTextFileForContext(text: string, vaultPath: string): string;
            contextCharsUsed: number;
        };

        it('caps a single large attachment to the per-file limit and points at read_file', () => {
            const h = makeHandler() as unknown as Priv;
            const big = 'x'.repeat(200_000);
            const out = h.truncateTextFileForContext(big, 'Notes/Big.md');
            expect(out.length).toBeLessThan(90_000);
            expect(out).toContain('read_file path="Notes/Big.md"');
        });

        it('shrinks later attachments to the remaining per-turn budget', () => {
            const h = makeHandler() as unknown as Priv;
            const big = 'x'.repeat(200_000);
            const first = h.truncateTextFileForContext(big, 'A.md');
            const second = h.truncateTextFileForContext(big, 'B.md');
            // Combined attachment text stays near the total budget (~64k chars + notices).
            expect(first.length + second.length).toBeLessThan(80_000);
            // The second one is much smaller than the first (budget mostly spent).
            expect(second.length).toBeLessThan(first.length);
        });

        it('keeps a small attachment whole and tracks its size', () => {
            const h = makeHandler() as unknown as Priv;
            const out = h.truncateTextFileForContext('short content', 'S.md');
            expect(out).toBe('short content');
            expect(h.contextCharsUsed).toBe('short content'.length);
        });

        it('clear() resets the per-turn budget', () => {
            const h = makeHandler();
            const priv = h as unknown as Priv;
            priv.truncateTextFileForContext('x'.repeat(200_000), 'A.md');
            expect(priv.contextCharsUsed).toBeGreaterThan(0);
            h.clear();
            expect(priv.contextCharsUsed).toBe(0);
        });

        it('tells the user the rest is gone when the attachment has no vault path', () => {
            const h = makeHandler() as unknown as Priv;
            const out = h.truncateTextFileForContext('x'.repeat(200_000), '');
            expect(out).toContain('not available');
            expect(out).not.toContain('read_file path=""');
        });
    });
});
