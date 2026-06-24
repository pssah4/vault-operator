/**
 * Mount-adapter contract tests (FEAT-33-12).
 *
 * Verifies the canMount + mount + destroy lifecycle for both adapters
 * without touching the real Obsidian / CodeMirror runtime -- the adapters
 * are pure-logic enough that minimal stubs suffice. DOM is faked locally
 * because the project's vitest config runs in node without jsdom.
 */

import { describe, it, expect, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { OverlayPopoverMount } from '../OverlayPopoverMount';
import { CodeMirrorBlockMount, _internalSetLastBlockViewForTest } from '../CodeMirrorBlockMount';

interface FakeElement {
    classList: { add: (c: string) => void; contains: (c: string) => boolean };
    getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
    ownerDocument: FakeDocument;
}
interface FakeDocument { createElement: (tag: string) => FakeElement }

function makeDocument(): FakeDocument {
    const doc: FakeDocument = {
        createElement: () => {
            const classes = new Set<string>();
            const el: FakeElement = {
                classList: {
                    add: (c) => { classes.add(c); },
                    contains: (c) => classes.has(c),
                },
                getBoundingClientRect: () => ({ left: 100, top: 200, right: 700, bottom: 600, width: 600, height: 400 }),
                ownerDocument: doc,
            };
            return el;
        },
    };
    return doc;
}

function makeMarkdownViewStub(opts: { mode?: 'source' | 'preview'; withEditor?: boolean } = {}): unknown {
    const mode = opts.mode ?? 'source';
    const contentEl = makeDocument().createElement('div');
    const editor = opts.withEditor === false ? null : { cm: null };
    return {
        contentEl,
        getMode: () => mode,
        editor,
    };
}

describe('OverlayPopoverMount', () => {
    it('canMount returns ok for any markdown view', () => {
        const mount = new OverlayPopoverMount();
        const view = makeMarkdownViewStub() as never;
        expect(mount.canMount(view)).toEqual({ ok: true });
    });

    it('canMount rejects null view', () => {
        const mount = new OverlayPopoverMount();
        expect(mount.canMount(null)).toEqual({ ok: false, reason: 'no-view' });
    });

    it('mount returns popover handle with contentEl as container', () => {
        const mount = new OverlayPopoverMount();
        const view = makeMarkdownViewStub() as never;
        const h = mount.mount(view);
        expect(h.displayMode).toBe('popover');
        expect(h.containerEl).toBeDefined();
        expect(typeof h.destroy).toBe('function');
        h.destroy(); // must be a no-op without throwing
    });
});

describe('CodeMirrorBlockMount', () => {
    it('canMount rejects null view', () => {
        const mount = new CodeMirrorBlockMount();
        expect(mount.canMount(null)).toEqual({ ok: false, reason: 'no-view' });
    });

    it('canMount rejects reading view with reading-view reason', () => {
        const mount = new CodeMirrorBlockMount();
        const view = makeMarkdownViewStub({ mode: 'preview' }) as never;
        expect(mount.canMount(view)).toEqual({ ok: false, reason: 'reading-view' });
    });

    it('canMount rejects no-cm when EditorView cannot be resolved', () => {
        _internalSetLastBlockViewForTest(null);
        const mount = new CodeMirrorBlockMount();
        const view = makeMarkdownViewStub({ mode: 'source' }) as never;
        expect(mount.canMount(view)).toEqual({ ok: false, reason: 'no-cm' });
    });

    it('mount dispatches an open effect plus highlight on the resolved EditorView and returns inline-block handle', () => {
        const dispatchSpy = vi.fn();
        const fakeView = {
            state: { selection: { main: { from: 5, to: 10 } } },
            dispatch: dispatchSpy,
        } as unknown as import('@codemirror/view').EditorView;
        _internalSetLastBlockViewForTest(fakeView);
        const mount = new CodeMirrorBlockMount();
        const view = makeMarkdownViewStub({ mode: 'source' }) as never;
        const h = mount.mount(view);
        expect(h.displayMode).toBe('inline-block');
        expect(h.containerEl.classList.contains('agent-inline-chat-block')).toBe(true);
        expect(dispatchSpy).toHaveBeenCalledOnce();
        const openCall = dispatchSpy.mock.calls[0]?.[0] as { effects: unknown[] };
        // For a non-collapsed selection we dispatch BOTH open + highlight.
        expect(Array.isArray(openCall.effects)).toBe(true);
        expect(openCall.effects.length).toBe(2);
        // destroy dispatches close + clear-highlight.
        h.destroy();
        expect(dispatchSpy).toHaveBeenCalledTimes(2);
        const closeCall = dispatchSpy.mock.calls[1]?.[0] as { effects: unknown[] };
        expect(Array.isArray(closeCall.effects)).toBe(true);
        expect(closeCall.effects.length).toBe(2);
        _internalSetLastBlockViewForTest(null);
    });

    it('mount skips the highlight effect when the selection is collapsed', () => {
        const dispatchSpy = vi.fn();
        const fakeView = {
            state: { selection: { main: { from: 7, to: 7 } } },
            dispatch: dispatchSpy,
        } as unknown as import('@codemirror/view').EditorView;
        _internalSetLastBlockViewForTest(fakeView);
        const mount = new CodeMirrorBlockMount();
        const view = makeMarkdownViewStub({ mode: 'source' }) as never;
        mount.mount(view);
        const call = dispatchSpy.mock.calls[0]?.[0] as { effects: unknown[] };
        // Collapsed -> only the open effect, no highlight.
        expect(call.effects.length).toBe(1);
        _internalSetLastBlockViewForTest(null);
    });

    it('destroy is safe when the view is already gone', () => {
        _internalSetLastBlockViewForTest(null);
        const mount = new CodeMirrorBlockMount();
        // mount without a view succeeds only if we set lastView first;
        // simulate the dropped-view case directly via destroy on a fresh
        // adapter that never mounted: it must not throw.
        expect(() => {
            // private path: typescript-cast to invoke the destroy seam.
            (mount as unknown as { destroy: () => void }).destroy?.();
        }).not.toThrow();
    });

    it('mount prefers the view-attached EditorView over the cached lastView (race fix #3)', () => {
        // Scenario: user switches views rapidly. lastView still points at
        // the OLD leaf's editor. mount() must dispatch the open effect on
        // the ACTIVE view's editor, not the cache.
        const cachedDispatch = vi.fn();
        const directDispatch = vi.fn();
        const cachedView = {
            state: { selection: { main: { from: 0, to: 0 } } },
            dispatch: cachedDispatch,
        } as unknown as EditorView;
        const directView = {
            state: { selection: { main: { from: 42, to: 42 } } },
            dispatch: directDispatch,
        } as unknown as EditorView;
        _internalSetLastBlockViewForTest(cachedView);
        const mount = new CodeMirrorBlockMount();
        const view = {
            contentEl: makeDocument().createElement('div'),
            getMode: () => 'source',
            editor: { cm: directView },
        } as unknown as never;
        mount.mount(view);
        expect(directDispatch).toHaveBeenCalledOnce();
        expect(cachedDispatch).not.toHaveBeenCalled();
        _internalSetLastBlockViewForTest(null);
    });
});
