/**
 * CodeMirrorDiffAdapter -- renders an InlineDiffState as CodeMirror-6
 * Decorations (FEAT-33-03 + ADR-139).
 *
 * Bridges the pure-logic InlineDiffEngine and the live editor. Uses
 * Decoration.mark for rot/gruen highlighting and a StateField +
 * StateEffect pair for incremental updates. Per-hunk Accept/Reject
 * happen via Cmd+Opt+Y / Cmd+Opt+N (Continue-Pattern). Cmd+Return
 * accepts all, Cmd+Backspace rejects all.
 *
 * Bot-Compliance: no fetch, no innerHTML, no direct style mutation
 * (all CSS classes from styles.css). Decorations are managed via
 * the standard StateField/Effect API; no DOM access outside Widgets.
 *
 * Related: ADR-139, FEAT-33-03.
 */

import {
    StateField,
    StateEffect,
    EditorSelection,
    type Extension,
} from '@codemirror/state';
import {
    Decoration,
    EditorView,
    WidgetType,
    keymap,
    type DecorationSet,
} from '@codemirror/view';
import {
    acceptAll,
    applyDiff,
    buildDiffState,
    countDecisions,
    getDecision,
    isResolved,
    rejectAll,
    setDecision,
    type DiffHunk,
    type InlineDiffState,
} from './InlineDiffEngine';

/** Effect emitted to start a diff session for a given selection range. */
export const startDiffEffect = StateEffect.define<{
    from: number;
    to: number;
    proposedText: string;
}>();

/** Effect emitted to apply an updated diff state (after Accept/Reject). */
export const updateDiffEffect = StateEffect.define<InlineDiffState>();

/** Effect emitted to clear the diff (final commit or cancel). */
export const closeDiffEffect = StateEffect.define<{ commit: boolean }>();

interface DiffSession {
    /** Char-offset where the original selection began in the doc. */
    docFrom: number;
    /** Pure-logic state. */
    state: InlineDiffState;
}

const inlineDiffField = StateField.define<DiffSession | null>({
    create() { return null; },
    update(value, tr) {
        let v = value;
        for (const effect of tr.effects) {
            if (effect.is(startDiffEffect)) {
                const originalText = tr.startState.sliceDoc(effect.value.from, effect.value.to);
                v = {
                    docFrom: effect.value.from,
                    state: buildDiffState(originalText, effect.value.proposedText),
                };
            } else if (effect.is(updateDiffEffect)) {
                if (v !== null) v = { ...v, state: effect.value };
            } else if (effect.is(closeDiffEffect)) {
                v = null;
            }
        }
        return v;
    },
    provide: (f) => EditorView.decorations.from(f, (session) => session === null
        ? Decoration.none
        : buildDecorations(session)),
});

class AcceptRejectWidget extends WidgetType {
    constructor(private hunkId: string, private view: () => EditorView | null) { super(); }
    toDOM(): HTMLElement {
        const wrap = activeDocument.createElement('span');
        wrap.classList.add('agent-inline-diff-hunk-actions');
        const accept = activeDocument.createElement('button');
        accept.textContent = '✓';
        accept.title = 'Accept hunk (Cmd+Opt+Y)';
        accept.setAttribute('type', 'button');
        accept.addEventListener('click', (ev) => {
            ev.preventDefault();
            const v = this.view();
            if (v !== null) acceptHunkById(v, this.hunkId);
        });
        const reject = activeDocument.createElement('button');
        reject.textContent = '✗';
        reject.title = 'Reject hunk (Cmd+Opt+N)';
        reject.setAttribute('type', 'button');
        reject.addEventListener('click', (ev) => {
            ev.preventDefault();
            const v = this.view();
            if (v !== null) rejectHunkById(v, this.hunkId);
        });
        wrap.append(accept, reject);
        return wrap;
    }
    eq(other: AcceptRejectWidget): boolean {
        return other.hunkId === this.hunkId;
    }
    ignoreEvent(): boolean { return true; }
}

function buildDecorations(session: DiffSession): DecorationSet {
    const builder: Array<{ from: number; to: number; deco: Decoration }> = [];
    const { docFrom, state } = session;
    for (const h of state.hunks) {
        const decision = getDecision(state, h.id);
        if (decision === 'rejected') continue;
        // Rendering strategy: we DO NOT mutate the editor doc itself
        // for pending/accepted hunks. Instead we visualise the diff:
        // accepted hunks become 'add' marks at the original location,
        // pending hunks become a "remove-then-widget-add" pair.
        // Final commit replaces the original range with applyDiff(state).
        const from = docFrom + h.startInOld;
        const to = docFrom + h.endInOld;
        if (h.oldText.length > 0) {
            builder.push({
                from,
                to,
                deco: Decoration.mark({ class: decision === 'accepted' ? 'agent-inline-diff-add' : 'agent-inline-diff-remove' }),
            });
        }
        // Widget for inline accept/reject buttons.
        builder.push({
            from: to,
            to,
            deco: Decoration.widget({
                widget: new AcceptRejectWidget(h.id, () => widgetView),
                side: 1,
            }),
        });
    }
    builder.sort((a, b) => a.from - b.from || a.to - b.to);
    return Decoration.set(
        builder.map((e) => e.deco.range(e.from, e.to)),
        true,
    );
}

// EditorView reference used by widgets to dispatch effects without
// chaining a ref through the constructor.
let widgetView: EditorView | null = null;

function setWidgetView(view: EditorView | null): void {
    widgetView = view;
}

function acceptHunkById(view: EditorView, hunkId: string): void {
    const session = view.state.field(inlineDiffField);
    if (session === null) return;
    const next = setDecision(session.state, hunkId, 'accepted');
    view.dispatch({ effects: updateDiffEffect.of(next) });
    maybeCommit(view);
}

function rejectHunkById(view: EditorView, hunkId: string): void {
    const session = view.state.field(inlineDiffField);
    if (session === null) return;
    const next = setDecision(session.state, hunkId, 'rejected');
    view.dispatch({ effects: updateDiffEffect.of(next) });
    maybeCommit(view);
}

/** When every hunk has a decision, apply the diff and clear the session. */
function maybeCommit(view: EditorView): void {
    const session = view.state.field(inlineDiffField);
    if (session === null) return;
    if (!isResolved(session.state)) return;
    commitDiff(view, /*useCurrentDecisions*/ true);
}

/**
 * Replace the original range with the diff-applied text and close the
 * session. When `useCurrentDecisions` is false, all hunks accept (Cmd+Return).
 */
function commitDiff(view: EditorView, useCurrentDecisions: boolean): void {
    const session = view.state.field(inlineDiffField);
    if (session === null) return;
    const state = useCurrentDecisions ? session.state : acceptAll(session.state);
    const finalText = applyDiff(state);
    const docFrom = session.docFrom;
    const docTo = docFrom + state.originalText.length;
    view.dispatch({
        changes: { from: docFrom, to: docTo, insert: finalText },
        effects: closeDiffEffect.of({ commit: true }),
    });
}

function cancelDiff(view: EditorView): void {
    const session = view.state.field(inlineDiffField);
    if (session === null) return;
    // Reject all so applyDiff returns originalText, then commit the
    // (no-op) replacement and close.
    const rejected = rejectAll(session.state);
    view.dispatch({ effects: [updateDiffEffect.of(rejected), closeDiffEffect.of({ commit: false })] });
}

/**
 * Public extension. Plugin entry-point includes this in
 * registerEditorExtension([...]).
 */
export function inlineDiffExtension(): Extension {
    return [
        inlineDiffField,
        EditorView.updateListener.of((u) => {
            // Keep widgetView in sync so AcceptRejectWidget can dispatch.
            setWidgetView(u.view);
        }),
        keymap.of([
            {
                key: 'Mod-Enter',
                run: (view) => {
                    if (view.state.field(inlineDiffField) === null) return false;
                    commitDiff(view, /*useCurrentDecisions*/ false);
                    return true;
                },
            },
            {
                key: 'Mod-Backspace',
                run: (view) => {
                    if (view.state.field(inlineDiffField) === null) return false;
                    cancelDiff(view);
                    return true;
                },
            },
            {
                key: 'Mod-Alt-y',
                run: (view) => acceptUnderCursor(view),
            },
            {
                key: 'Mod-Alt-n',
                run: (view) => rejectUnderCursor(view),
            },
        ]),
    ];
}

function findHunkAtCursor(view: EditorView): DiffHunk | null {
    const session = view.state.field(inlineDiffField);
    if (session === null) return null;
    const head = view.state.selection.main.head;
    const offset = head - session.docFrom;
    return session.state.hunks.find((h) => h.startInOld <= offset && offset <= h.endInOld) ?? null;
}

function acceptUnderCursor(view: EditorView): boolean {
    const h = findHunkAtCursor(view);
    if (h === null) return false;
    acceptHunkById(view, h.id);
    return true;
}

function rejectUnderCursor(view: EditorView): boolean {
    const h = findHunkAtCursor(view);
    if (h === null) return false;
    rejectHunkById(view, h.id);
    return true;
}

/**
 * Start a diff session. Called by the plugin when a Rewrite-Action
 * stream finishes -- the proposedText is the LLM output.
 */
export function startDiffSession(view: EditorView, args: { from: number; to: number; proposedText: string }): void {
    view.dispatch({
        effects: startDiffEffect.of(args),
        selection: EditorSelection.range(args.from, args.to),
    });
}

/** Public read of the current session state -- useful for status badges. */
export function getDiffStatus(view: EditorView): { accepted: number; rejected: number; pending: number; active: boolean } {
    const session = view.state.field(inlineDiffField);
    if (session === null) return { accepted: 0, rejected: 0, pending: 0, active: false };
    return { ...countDecisions(session.state), active: true };
}

/**
 * Side-effect: track the latest view in module state so the StateField
 * provider can be referenced from a Transaction.create. Used for
 * defensive testing.
 */
export function _internalSetWidgetViewForTest(view: EditorView | null): void {
    setWidgetView(view);
}

/** Re-export pure-logic for callers that want them. */
export { buildDiffState } from './InlineDiffEngine';

/**
 * StateField identity export so external callers (e.g. PluginWiring
 * tests) can read the current session.
 */
export const _internalInlineDiffField: StateField<DiffSession | null> = inlineDiffField;

