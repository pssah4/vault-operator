/**
 * BUG-019 regression: resolveObsidianDraggedFiles must read both the
 * single-file and multi-file shapes Obsidian's drag manager uses, and
 * must silently return [] when the drag manager is missing or holds an
 * unknown payload type.
 */

import { describe, it, expect } from 'vitest';
import { TFile } from 'obsidian';
import { resolveObsidianDraggedFiles } from '../dragManagerBridge';

function makeFile(path: string): TFile {
    const f = new TFile();
    // The obsidian stub has no constructor args; wire the minimum shape.
    (f as unknown as { path: string }).path = path;
    return f;
}

function makeApp(dragManager: unknown): import('obsidian').App {
    return { dragManager } as unknown as import('obsidian').App;
}

describe('resolveObsidianDraggedFiles', () => {
    it('returns the single file from a type=file draggable', () => {
        const file = makeFile('notes/today.md');
        const out = resolveObsidianDraggedFiles(makeApp({
            draggable: { type: 'file', file },
        }));
        expect(out).toEqual([file]);
    });

    it('returns every TFile from a type=files draggable', () => {
        const a = makeFile('a.md');
        const b = makeFile('b.md');
        const out = resolveObsidianDraggedFiles(makeApp({
            draggable: { type: 'files', files: [a, b] },
        }));
        expect(out).toEqual([a, b]);
    });

    it('drops non-TFile entries from a type=files draggable', () => {
        const a = makeFile('a.md');
        const out = resolveObsidianDraggedFiles(makeApp({
            draggable: { type: 'files', files: [a, { path: 'not a tfile' }, null] },
        }));
        expect(out).toEqual([a]);
    });

    it('returns [] when dragManager is missing', () => {
        expect(resolveObsidianDraggedFiles(makeApp(undefined))).toEqual([]);
    });

    it('returns [] when draggable holds an unknown type', () => {
        const out = resolveObsidianDraggedFiles(makeApp({
            draggable: { type: 'folder', folder: {} },
        }));
        expect(out).toEqual([]);
    });

    it('returns [] when dragManager is not an object', () => {
        const out = resolveObsidianDraggedFiles(makeApp('nope'));
        expect(out).toEqual([]);
    });
});
