/**
 * CodeMirrorBlockMount -- inline chat as a CodeMirror-6 block widget (FEAT-33-12).
 *
 * The block widget reserves a real layout line between the selection's
 * trailing line and the next line, so surrounding text pushes down (VS-Code-
 * style inline chat). The panel renders into a DIV the adapter creates and
 * the widget hands back to CodeMirror in toDOM().
 *
 * Mount pipeline:
 *   1. mount() creates a wrapper DIV and dispatches `openInlineChatEffect`
 *      with that DIV + the doc-offset to anchor on.
 *   2. The state field stores { offset, container }. The decoration set
 *      contains exactly one block widget at the stored offset, side:1
 *      (after the offset).
 *   3. CodeMirror calls `InlineChatBlockWidget.toDOM()` which returns the
 *      wrapper. The InlineChatPanel renders into it via the adapter handle.
 *   4. destroy() dispatches `closeInlineChatEffect`. The field clears, the
 *      decoration disappears, the wrapper is detached.
 *
 * The extension also exposes an `EditorView.updateListener` that keeps the
 * last-active view in a file-local cache so unit tests can inject one.
 *
 * Bot-compliance: pure CM6 + DOM API; no innerHTML, no fetch.
 *
 * Related: ADR-139 (the same StateField+StateEffect+WidgetType pattern as
 * `CodeMirrorDiffAdapter`).
 */

import { StateField, StateEffect, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { MarkdownView } from 'obsidian';
import type { InlineChatMountAdapter, MountCheck, MountHandle } from './InlineChatMountAdapter';

interface InlineChatBlockSession {
    /** Document offset where the block widget anchors. Typically selectionTo. */
    offset: number;
    /** The DIV the widget hands back to CM6. The panel renders inside. */
    container: HTMLElement;
}

/**
 * Range of the original selection that triggered the inline chat.
 * Painted as a mark decoration so the highlight survives focus changes
 * (the native DOM selection collapses as soon as the user clicks the
 * composer). Cleared when the inline chat closes. User feedback 2026-06-24.
 */
interface InlineChatHighlight {
    from: number;
    to: number;
}

const openInlineChatEffect = StateEffect.define<InlineChatBlockSession>();
const closeInlineChatEffect = StateEffect.define<void>();
const setHighlightEffect = StateEffect.define<InlineChatHighlight>();
const clearHighlightEffect = StateEffect.define<void>();

const inlineChatBlockField = StateField.define<InlineChatBlockSession | null>({
    create() { return null; },
    update(value, tr) {
        let v = value;
        for (const effect of tr.effects) {
            if (effect.is(openInlineChatEffect)) v = effect.value;
            else if (effect.is(closeInlineChatEffect)) v = null;
        }
        return v;
    },
    provide: (f) => EditorView.decorations.from(f, (session) => buildBlockDecoration(session)),
});

/**
 * Separate StateField for the selection-highlight mark decoration. Kept
 * orthogonal to the block-widget field so a future refactor (e.g.
 * supporting highlight WITHOUT a block widget) does not need to thread
 * extra effect types through the block field.
 */
const inlineChatHighlightField = StateField.define<InlineChatHighlight | null>({
    create() { return null; },
    update(value, tr) {
        let v = value;
        for (const effect of tr.effects) {
            if (effect.is(setHighlightEffect)) v = effect.value;
            else if (effect.is(clearHighlightEffect)) v = null;
        }
        return v;
    },
    provide: (f) => EditorView.decorations.from(f, (h) => buildHighlightDecoration(h)),
});

class InlineChatBlockWidget extends WidgetType {
    constructor(private readonly container: HTMLElement) { super(); }
    toDOM(): HTMLElement {
        // The wrapper is owned and managed by the adapter; CM6 returns it
        // verbatim. Block: true on the parent Decoration.widget makes CM6
        // treat this as a layout block between two lines, so surrounding
        // text actually pushes down rather than overlapping.
        return this.container;
    }
    /**
     * eq() returns true only when the SAME container is requested -- this
     * way CM6 never recreates the DOM for the same session (which would
     * tear down the InlineChatPanel mid-conversation). A different
     * session = different container reference = forced redraw.
     */
    eq(other: InlineChatBlockWidget): boolean {
        return other.container === this.container;
    }
    /**
     * Return true so CM6 leaves every event on the widget DOM alone --
     * the browser then drives focus, text selection, and copy without
     * interference. An earlier revision (2026-06-24) tried "return
     * false for mouse / touch / pointer events" to fix copy-from-bubble,
     * but that handed mousedown to CodeMirror: CM moved its own cursor
     * into the editor line behind the widget and stole focus from the
     * composer textarea -- typing became impossible and bubble
     * selection collapsed. The real fix for the copy bug was the
     * `user-select: text` CSS on the inline panel and bubble classes;
     * this method keeps the widget event-opaque.
     */
    ignoreEvent(): boolean { return true; }
    /** Tell CM6 not to estimate height; the panel decides its own size. */
    get estimatedHeight(): number { return -1; }
}

function buildBlockDecoration(session: InlineChatBlockSession | null): DecorationSet {
    if (session === null) return Decoration.none;
    const widget = Decoration.widget({
        widget: new InlineChatBlockWidget(session.container),
        block: true,
        side: 1,
    });
    return Decoration.set([widget.range(session.offset)]);
}

function buildHighlightDecoration(highlight: InlineChatHighlight | null): DecorationSet {
    if (highlight === null) return Decoration.none;
    if (highlight.from >= highlight.to) return Decoration.none;
    return Decoration.set([
        Decoration.mark({ class: 'agent-inline-selection-highlight' }).range(highlight.from, highlight.to),
    ]);
}

/** File-local last-active view, written by the updateListener. */
let lastView: EditorView | null = null;

/**
 * Public extension. Plugin entry-point includes this in
 * registerEditorExtension([...]) so the field is known to every CM6
 * instance Obsidian creates for a markdown leaf.
 */
export function inlineChatBlockExtension(): Extension {
    return [
        inlineChatBlockField,
        inlineChatHighlightField,
        EditorView.updateListener.of((u) => { lastView = u.view; }),
    ];
}

/** Visible for tests. */
export function _internalSetLastBlockViewForTest(view: EditorView | null): void {
    lastView = view;
}
export function _internalGetLastBlockView(): EditorView | null { return lastView; }
export { inlineChatBlockField as _inlineChatBlockField };

/**
 * Extract the CM6 EditorView from an Obsidian MarkdownView. Obsidian does
 * not officially expose `editor.cm` in its public type definitions; we use
 * the documented inoffical access path that has been stable since CM6
 * adoption in Obsidian 1.0.
 *
 * Falls back to the updateListener cache if direct access fails.
 */
function getEditorView(view: MarkdownView | null): EditorView | null {
    if (view === null) return lastView;
    try {
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        if (cm instanceof EditorView) return cm;
    } catch { /* swallow -- fall through to cache */ }
    return lastView;
}

export class CodeMirrorBlockMount implements InlineChatMountAdapter {
    readonly id = 'cm-block-widget' as const;
    private activeView: EditorView | null = null;

    canMount(view: MarkdownView | null): MountCheck {
        if (view === null) return { ok: false, reason: 'no-view' };
        // Reading view uses a fully rendered DOM tree, no CodeMirror.
        // getMode() returns 'preview' for reading view, 'source' otherwise.
        try {
            if (view.getMode() === 'preview') return { ok: false, reason: 'reading-view' };
        } catch { /* unknown view shape -- treat as no-cm so the orchestrator surfaces a generic notice */
            return { ok: false, reason: 'no-cm' };
        }
        if (resolveDirectEditorView(view) === null && getEditorView(view) === null) {
            return { ok: false, reason: 'no-cm' };
        }
        return { ok: true };
    }

    mount(view: MarkdownView): MountHandle {
        // AUDIT-FEAT-33-12 #3 fix: prefer the EditorView that is
        // DIRECTLY attached to the active MarkdownView over the
        // updateListener cache. Rapid view-switches can leave a stale
        // `lastView` pointing at a different leaf; attaching the
        // decoration there would mount it in the wrong editor.
        const editorView = resolveDirectEditorView(view) ?? getEditorView(view);
        if (editorView === null) {
            // canMount guards this; defensive throw rather than null-return
            throw new Error('CodeMirrorBlockMount.mount called without an EditorView');
        }
        const doc = view.contentEl.ownerDocument;
        const container = doc.createElement('div');
        container.classList.add('agent-inline-chat-block');
        // Read the full selection now: `from` for the highlight mark
        // (so the user sees what the chat is referencing even after the
        // composer steals focus and the native DOM selection collapses)
        // and `to` for the block-widget anchor (widget renders BELOW
        // the trailing edge of the selection).
        const sel = editorView.state.selection.main;
        const from = Math.min(sel.from, sel.to);
        const to = Math.max(sel.from, sel.to);
        this.activeView = editorView;
        // Single dispatch with both effects so the highlight and the
        // widget appear in the same animation frame (no flicker).
        editorView.dispatch({
            effects: from < to
                ? [openInlineChatEffect.of({ offset: to, container }), setHighlightEffect.of({ from, to })]
                : [openInlineChatEffect.of({ offset: to, container })],
        });
        return {
            containerEl: container,
            position: { x: 0, y: 0 },
            displayMode: 'inline-block',
            destroy: () => this.destroy(),
        };
    }

    private destroy(): void {
        const v = this.activeView;
        this.activeView = null;
        if (v !== null) {
            try { v.dispatch({ effects: [closeInlineChatEffect.of(), clearHighlightEffect.of()] }); } catch {
                /* view may already be torn down -- swallow */
            }
        }
    }
}

/**
 * Resolve the EditorView that belongs to `view` itself (no cache fallback).
 * Returns null when the inoffical `editor.cm` field is missing or does not
 * carry the EditorView surface -- callers fall back to the updateListener
 * cache. Duck-typed instead of `instanceof EditorView` so the check stays
 * testable in node without spinning up a full CM6 view (EditorView's
 * `state` getter is non-settable, which prevents a clean spy fixture).
 */
function resolveDirectEditorView(view: MarkdownView | null): EditorView | null {
    if (view === null) return null;
    try {
        const cm = (view.editor as unknown as { cm?: unknown }).cm;
        if (cm === undefined || cm === null) return null;
        if (cm instanceof EditorView) return cm;
        // Duck-type fallback for tests: a structural twin with the
        // EXACT surface we read in mount() -- state.selection.main +
        // dispatch. Validating `main` too (not just `selection`)
        // prevents a partial mock from sneaking past and crashing
        // inside mount() when sel.from/sel.to are read.
        const candidate = cm as {
            state?: { selection?: { main?: { from?: unknown; to?: unknown } } };
            dispatch?: unknown;
        };
        if (
            typeof candidate.dispatch === 'function'
            && candidate.state !== undefined
            && candidate.state.selection !== undefined
            && candidate.state.selection.main !== undefined
        ) {
            return cm as EditorView;
        }
    } catch { /* swallow */ }
    return null;
}
