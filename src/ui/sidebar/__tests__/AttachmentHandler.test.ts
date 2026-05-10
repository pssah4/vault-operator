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
});
