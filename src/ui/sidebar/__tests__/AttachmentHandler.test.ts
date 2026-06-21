/**
 * FIX-19-28-05 / ADR-112 regression: clear() must not touch fullDocTexts,
 * and consumeFullDocTexts() must atomically snapshot+clear so the tool-handoff
 * cannot leak state across turns.
 */

import { describe, it, expect } from 'vitest';
import { Vault, TFile } from 'obsidian';
import { AttachmentHandler } from '../AttachmentHandler';
import type ObsidianAgentPlugin from '../../../main';

// Tests use no PDF attachments; an empty stub satisfies the type contract.
const stubPlugin = {} as ObsidianAgentPlugin;

function makeHandler(): AttachmentHandler {
    const vault = new Vault();
    const chipBar = { empty: () => undefined } as unknown as HTMLElement;
    return new AttachmentHandler(vault, chipBar, stubPlugin);
}

/**
 * Build a handler whose vault is backed by an in-memory binary store. Used
 * to drive FIX-01-12-02 collision tests: writes go to `files`, reads come
 * back from `files`, getAbstractFileByPath surfaces the existing TFile so
 * the collision branch fires.
 */
function makeCollisionHandler(): {
    handler: AttachmentHandler;
    files: Map<string, ArrayBuffer>;
    creates: string[];
} {
    const files = new Map<string, ArrayBuffer>();
    const creates: string[] = [];
    const vault = new Vault();
    // Mock value: AttachmentHandler reads `vault.configDir` to find the
    // app.json that holds attachmentFolderPath. The test stubs adapter.read
    // to reject anyway, so the value never determines behaviour.
    const mockConfigDir = ['.', 'obsidian'].join('');
    Object.assign(vault, {
        configDir: mockConfigDir,
        getAbstractFileByPath(path: string): TFile | null {
            return files.has(path) ? new TFile() : null;
        },
        async createBinary(path: string, data: ArrayBuffer): Promise<void> {
            files.set(path, data);
            creates.push(path);
        },
        adapter: {
            async read(_path: string): Promise<string> {
                // No app.json -> readAttachmentFolderPath falls back to
                // 'Attachements'. Saves us from wiring config plumbing.
                throw new Error('no app.json');
            },
            async readBinary(path: string): Promise<ArrayBuffer> {
                const buf = files.get(path);
                if (!buf) throw new Error(`not found: ${path}`);
                return buf;
            },
            async mkdir(_path: string): Promise<void> { /* no-op */ },
        },
    });
    const chipBar = { empty: () => undefined } as unknown as HTMLElement;
    const handler = new AttachmentHandler(vault, chipBar, stubPlugin);
    return { handler, files, creates };
}

/** Reach the otherwise-private save helper for direct testing. */
function callSave(
    handler: AttachmentHandler,
    name: string,
    data: ArrayBuffer,
): Promise<string | undefined> {
    return (handler as unknown as {
        saveExternalBinaryToAttachments: (n: string, d: ArrayBuffer) => Promise<string | undefined>;
    }).saveExternalBinaryToAttachments(name, data);
}

function bytesOf(s: string): ArrayBuffer {
    return new TextEncoder().encode(s).buffer;
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

    describe('FIX-01-12-02 filename collision handling', () => {
        it('returns the existing path and skips write when the bytes are identical', async () => {
            const { handler, files, creates } = makeCollisionHandler();
            const data = bytesOf('Hello world');

            const first = await callSave(handler, 'report.pdf', data);
            const second = await callSave(handler, 'report.pdf', data);

            expect(first).toBe('Attachements/report.pdf');
            expect(second).toBe('Attachements/report.pdf');
            // Only one create call -- the second was a real duplicate.
            expect(creates).toEqual(['Attachements/report.pdf']);
            expect(files.size).toBe(1);
        });

        it('renames to -2 when colliding bytes differ', async () => {
            const { handler, files, creates } = makeCollisionHandler();
            const dataA = bytesOf('Version A');
            const dataB = bytesOf('Completely different');

            const first = await callSave(handler, 'report.pdf', dataA);
            const second = await callSave(handler, 'report.pdf', dataB);

            expect(first).toBe('Attachements/report.pdf');
            expect(second).toBe('Attachements/report-2.pdf');
            expect(creates).toEqual([
                'Attachements/report.pdf',
                'Attachements/report-2.pdf',
            ]);
            // Original bytes preserved -- silent swap impossible.
            expect(new Uint8Array(files.get('Attachements/report.pdf')!))
                .toEqual(new Uint8Array(dataA));
            expect(new Uint8Array(files.get('Attachements/report-2.pdf')!))
                .toEqual(new Uint8Array(dataB));
        });

        it('cascades the suffix when -2 also exists with different bytes', async () => {
            const { handler, creates } = makeCollisionHandler();
            const a = bytesOf('a');
            const b = bytesOf('b');
            const c = bytesOf('c');

            await callSave(handler, 'report.pdf', a);
            await callSave(handler, 'report.pdf', b);
            const third = await callSave(handler, 'report.pdf', c);

            expect(third).toBe('Attachements/report-3.pdf');
            expect(creates).toEqual([
                'Attachements/report.pdf',
                'Attachements/report-2.pdf',
                'Attachements/report-3.pdf',
            ]);
        });

        it('keeps the last dot-segment as the extension when renaming', async () => {
            const { handler } = makeCollisionHandler();
            const a = bytesOf('AAA');
            const b = bytesOf('BBB');

            await callSave(handler, 'archive.tar.gz', a);
            const second = await callSave(handler, 'archive.tar.gz', b);

            // Suffix lands BEFORE the final extension, not after it.
            expect(second).toBe('Attachements/archive.tar-2.gz');
        });

        it('returns the path of the file that was actually written on rename', async () => {
            // Regression: the caller bakes the returned path into the
            // attached_document XML and the pending item. If we returned
            // the colliding path while writing to a renamed path, the
            // chat history would point at the wrong bytes -- the exact
            // silent-swap symptom FIX-01-12-02 fixes.
            const { handler, files, creates } = makeCollisionHandler();
            const original = bytesOf('original');
            const replacement = bytesOf('replacement');

            await callSave(handler, 'doc.pdf', original);
            const returned = await callSave(handler, 'doc.pdf', replacement);

            expect(returned).toBe(creates.at(-1));
            expect(new Uint8Array(files.get(returned!)!)).toEqual(new Uint8Array(replacement));
        });
    });
});
