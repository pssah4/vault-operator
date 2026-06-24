/**
 * InlineActionPill contract tests (FEAT-33-12, user feedback 2026-06-24).
 *
 * The pill must:
 *   - render only when there is a non-collapsed selection with a real rect
 *   - position itself just past the trailing edge of the selection rect
 *   - call onClick + auto-hide when the user clicks it
 *   - swallow mousedown so the selection survives the click
 *   - self-hide on outside mousedown, on selection-collapse, on Escape
 *   - leak no document listeners after hide()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal stubs for Obsidian's setIcon (no-op) so the pill can import.
vi.mock('obsidian', () => ({
    setIcon: vi.fn(),
}));

import { InlineActionPill } from '../InlineActionPill';

interface Listener { type: string; handler: EventListener; capture: boolean }
interface FakeDocument {
    listeners: Listener[];
    addEventListener: (t: string, h: EventListener, c?: boolean) => void;
    removeEventListener: (t: string, h: EventListener, c?: boolean) => void;
    createElement: (tag: string) => FakeElement;
    defaultView: FakeWindow | null;
}
interface FakeWindow {
    getSelection: () => FakeSelection | null;
    innerWidth: number;
}
interface FakeSelection {
    rangeCount: number;
    getRangeAt: (n: number) => FakeRange;
}
interface FakeRange {
    collapsed: boolean;
    getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
    getClientRects?: () => Array<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;
    endContainer?: { nodeType: number; parentElement?: { closest: (sel: string) => { getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number } } | null } | null };
}
interface FakeElement {
    tag: string;
    attrs: Map<string, string>;
    classes: Set<string>;
    styles: Map<string, string>;
    childNodes: FakeElement[];
    parent: FakeElement | null;
    listeners: Listener[];
    ownerDocument: FakeDocument;
    textContent: string;
    setAttribute: (k: string, v: string) => void;
    classList: { add: (c: string) => void; contains: (c: string) => boolean };
    setCssStyles: (styles: Record<string, string>) => void;
    addEventListener: (t: string, h: EventListener, c?: boolean) => void;
    removeEventListener: (t: string, h: EventListener, c?: boolean) => void;
    appendChild: (child: FakeElement) => void;
    remove: () => void;
    contains: (n: Node | null) => boolean;
    dispatch: (t: string, ev: unknown) => void;
    querySelector: (sel: string) => FakeElement | null;
}

function makeDoc(opts: { selection?: FakeSelection | null; innerWidth?: number } = {}): FakeDocument {
    const doc: FakeDocument = {
        listeners: [],
        addEventListener: (t, h, c) => { doc.listeners.push({ type: t, handler: h, capture: c === true }); },
        removeEventListener: (t, h, c) => {
            const idx = doc.listeners.findIndex(l => l.type === t && l.handler === h && l.capture === (c === true));
            if (idx >= 0) doc.listeners.splice(idx, 1);
        },
        createElement: (tag) => makeEl(tag, doc),
        defaultView: null,
    };
    doc.defaultView = {
        innerWidth: opts.innerWidth ?? 1024,
        getSelection: () => opts.selection ?? null,
    };
    return doc;
}

function makeEl(tag: string, doc: FakeDocument): FakeElement {
    const el: FakeElement = {
        tag,
        attrs: new Map(),
        classes: new Set(),
        styles: new Map(),
        childNodes: [],
        parent: null,
        listeners: [],
        ownerDocument: doc,
        textContent: '',
        setAttribute: (k, v) => { el.attrs.set(k, v); },
        querySelector: (sel) => {
            if (sel === 'svg') {
                return el.childNodes.find(c => c.tag === 'svg') ?? null;
            }
            return null;
        },
        classList: {
            add: (c) => { el.classes.add(c); },
            contains: (c) => el.classes.has(c),
        },
        setCssStyles: (styles) => { for (const [k, v] of Object.entries(styles)) el.styles.set(k, v); },
        addEventListener: (t, h, c) => { el.listeners.push({ type: t, handler: h, capture: c === true }); },
        removeEventListener: (t, h, c) => {
            const idx = el.listeners.findIndex(l => l.type === t && l.handler === h && l.capture === (c === true));
            if (idx >= 0) el.listeners.splice(idx, 1);
        },
        appendChild: (child) => { child.parent = el; el.childNodes.push(child); },
        remove: () => {
            if (el.parent !== null) {
                const idx = el.parent.childNodes.indexOf(el);
                if (idx >= 0) el.parent.childNodes.splice(idx, 1);
                el.parent = null;
            }
        },
        contains: (n) => (n as unknown) === el,
        dispatch: (t, ev) => { for (const l of el.listeners) if (l.type === t) l.handler(ev as Event); },
    };
    return el;
}

function makeSelection(opts: { collapsed?: boolean; rect?: { right: number; top: number; width: number; height: number } } = {}): FakeSelection {
    const rect = opts.rect ?? { right: 200, top: 50, width: 60, height: 18 };
    const r = {
        left: rect.right - rect.width,
        top: rect.top,
        right: rect.right,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
    };
    return {
        rangeCount: 1,
        getRangeAt: () => ({
            collapsed: opts.collapsed === true,
            getBoundingClientRect: () => r,
            getClientRects: () => [r],
        }),
    };
}

describe('InlineActionPill', () => {
    let target: FakeElement;
    let doc: FakeDocument;

    beforeEach(() => {
        doc = makeDoc({ selection: makeSelection() });
        target = makeEl('div', doc);
    });
    afterEach(() => {
        // Sanity: nothing dangling after every test
    });

    it('renders nothing without a selection', () => {
        doc = makeDoc({ selection: null });
        target = makeEl('div', doc);
        const onClick = vi.fn();
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick });
        pill.show();
        expect(pill.isVisible).toBe(false);
        expect(target.childNodes.length).toBe(0);
    });

    it('renders nothing for a collapsed selection', () => {
        doc = makeDoc({ selection: makeSelection({ collapsed: true }) });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        expect(pill.isVisible).toBe(false);
    });

    it('renders nothing when the selection rect is empty', () => {
        doc = makeDoc({ selection: makeSelection({ rect: { right: 0, top: 0, width: 0, height: 0 } }) });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        expect(pill.isVisible).toBe(false);
    });

    it('anchors right of rightmost word, centered on the last line vertically', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        expect(pill.isVisible).toBe(true);
        const btn = target.childNodes[0];
        expect(btn.tag).toBe('button');
        expect(btn.classes.has('agent-inline-action-pill')).toBe(true);
        // rightmost rect: right=200, GAP=6 -> left = 206
        expect(btn.styles.get('left')).toBe('206px');
        // single line: top=50, bottom=68, centre=59, top = 59 - 11 = 48
        expect(btn.styles.get('top')).toBe('48px');
    });

    it('uses rightmost-word X and last-line MID Y in a multi-line selection', () => {
        // Line 1 short (200), line 2 longest (600), line 3 (220) -- LAST.
        // X = rightmost rect.right across all (600, line 2) + GAP.
        // Y = centre of LAST line (top=90, bottom=108, centre=99) -> top = 99-11 = 88.
        const rects = [
            { left: 100, top: 50, right: 200, bottom: 68, width: 100, height: 18 },
            { left: 100, top: 70, right: 600, bottom: 88, width: 500, height: 18 },
            { left: 100, top: 90, right: 220, bottom: 108, width: 120, height: 18 },
        ];
        const sel: FakeSelection = {
            rangeCount: 1,
            getRangeAt: () => ({
                collapsed: false,
                getBoundingClientRect: () => ({ left: 100, top: 50, right: 600, bottom: 108, width: 500, height: 58 }),
                getClientRects: () => rects,
            }),
        };
        doc = makeDoc({ selection: sel });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        expect(btn.styles.get('left')).toBe('606px');
        expect(btn.styles.get('top')).toBe('88px');
    });

    it('ignores zero-size CM6 seed rects in the rightmost search', () => {
        const rects = [
            { left: 100, top: 50, right: 100, bottom: 50, width: 0, height: 0 },
            { left: 100, top: 100, right: 220, bottom: 118, width: 120, height: 18 },
            { left: 100, top: 120, right: 400, bottom: 138, width: 300, height: 18 }, // rightmost
        ];
        const sel: FakeSelection = {
            rangeCount: 1,
            getRangeAt: () => ({
                collapsed: false,
                getBoundingClientRect: () => ({ left: 100, top: 100, right: 400, bottom: 138, width: 300, height: 38 }),
                getClientRects: () => rects,
            }),
        };
        doc = makeDoc({ selection: sel });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        // rightmost real: right=400 -> left=406
        // last-line centre: top=120, bottom=138, centre=129, top = 129-11 = 118
        expect(btn.styles.get('left')).toBe('406px');
        expect(btn.styles.get('top')).toBe('118px');
    });

    it('uses cm-line right edge when the selection ends mid-line (so the pill clears the WHOLE line, not just the marked part)', () => {
        // Selection ends at "ist" -- the line continues with "maschinenlesbar".
        // Without the cm-line lookup the pill would land between "ist" and
        // "maschinenlesbar" (mid-text). With the lookup it lands beyond
        // "maschinenlesbar" at the line's right edge.
        const selectionRect = { left: 100, top: 200, right: 280, bottom: 218, width: 180, height: 18 };
        const lineRect = { left: 100, top: 200, right: 720, bottom: 218, width: 620, height: 18 };
        const sel: FakeSelection = {
            rangeCount: 1,
            getRangeAt: () => ({
                collapsed: false,
                getBoundingClientRect: () => selectionRect,
                getClientRects: () => [selectionRect],
                endContainer: {
                    nodeType: 3, // Text node
                    parentElement: {
                        closest: (s: string) => {
                            // AUDIT-034 M-40: pill now requires a trusted-root
                            // ancestor (markdown view / cm-editor) before
                            // accepting the cm-line right edge. Provide both
                            // so the test path still resolves.
                            if (s.includes('.markdown-source-view') || s.includes('.cm-editor')) {
                                return { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
                            }
                            return s.includes('.cm-line') ? { getBoundingClientRect: () => lineRect } : null;
                        },
                    },
                },
            }),
        };
        doc = makeDoc({ selection: sel });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        // pill x = lineRect.right(720) + GAP(6) = 726
        expect(btn.styles.get('left')).toBe('726px');
    });

    it('keeps the selection rightmost when its right exceeds the cm-line right (edge case)', () => {
        // Rare but possible (e.g. an inline widget pushed beyond the line box).
        // The pill should still clear the rightmost visible mark.
        const selectionRect = { left: 100, top: 200, right: 900, bottom: 218, width: 800, height: 18 };
        const lineRect = { left: 100, top: 200, right: 720, bottom: 218, width: 620, height: 18 };
        const sel: FakeSelection = {
            rangeCount: 1,
            getRangeAt: () => ({
                collapsed: false,
                getBoundingClientRect: () => selectionRect,
                getClientRects: () => [selectionRect],
                endContainer: {
                    nodeType: 1,
                    parentElement: {
                        closest: (s: string) => {
                            if (s.includes('.markdown-source-view') || s.includes('.cm-editor')) {
                                return { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
                            }
                            return { getBoundingClientRect: () => lineRect };
                        },
                    },
                },
            }),
        };
        doc = makeDoc({ selection: sel, innerWidth: 2048 });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        // selection right(900) > line right(720) -> use selection: 900 + 6 = 906
        expect(btn.styles.get('left')).toBe('906px');
    });

    it('clamps horizontally so the pill never escapes the viewport', () => {
        doc = makeDoc({
            selection: makeSelection({ rect: { right: 1020, top: 100, width: 40, height: 18 } }),
            innerWidth: 1024,
        });
        target = makeEl('div', doc);
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        // desiredLeft = 1020 + 6 = 1026 ; clamp = min(1026, 1024-22-4) = min(1026, 998) = 998
        expect(btn.styles.get('left')).toBe('998px');
    });

    it('invokes onClick and auto-hides on click', () => {
        const onClick = vi.fn();
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick });
        pill.show();
        const btn = target.childNodes[0];
        btn.dispatch('click', { preventDefault: vi.fn(), stopPropagation: vi.fn() });
        expect(onClick).toHaveBeenCalledOnce();
        expect(pill.isVisible).toBe(false);
    });

    it('swallows mousedown so the click does not collapse the selection', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        const evt = { preventDefault: vi.fn() };
        btn.dispatch('mousedown', evt);
        expect(evt.preventDefault).toHaveBeenCalledOnce();
    });

    it('hides on outside mousedown', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const outsideListener = doc.listeners.find(l => l.type === 'mousedown');
        expect(outsideListener).toBeDefined();
        outsideListener!.handler({ target: makeEl('div', doc) } as unknown as Event);
        expect(pill.isVisible).toBe(false);
    });

    it('ignores mousedown on the pill itself', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        const outsideListener = doc.listeners.find(l => l.type === 'mousedown');
        outsideListener!.handler({ target: btn } as unknown as Event);
        expect(pill.isVisible).toBe(true);
    });

    it('hides when the selection collapses', () => {
        const win = doc.defaultView!;
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        // Simulate the user clicking somewhere -> selection collapses.
        win.getSelection = () => makeSelection({ collapsed: true });
        const selChange = doc.listeners.find(l => l.type === 'selectionchange');
        selChange!.handler({} as Event);
        expect(pill.isVisible).toBe(false);
    });

    it('hides on Escape', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const keyListener = doc.listeners.find(l => l.type === 'keydown');
        keyListener!.handler({ key: 'Escape' } as unknown as Event);
        expect(pill.isVisible).toBe(false);
    });

    it('hides on workspace-container scroll (capture phase, catches inner scrollables like .cm-scroller)', () => {
        // Scroll events do NOT bubble. A capture-phase listener on the
        // workspace container is the only way to catch scrolls of nested
        // scrollable descendants. Registering on document misses them.
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const scrollListener = target.listeners.find(l => l.type === 'scroll' && l.capture === true);
        expect(scrollListener).toBeDefined();
        scrollListener!.handler({} as Event);
        expect(pill.isVisible).toBe(false);
    });

    it('leaks no listeners after hide() (both document and target are cleaned)', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        expect(doc.listeners.length).toBeGreaterThan(0);
        expect(target.listeners.length).toBeGreaterThan(0);
        pill.hide();
        expect(doc.listeners.length).toBe(0);
        expect(target.listeners.length).toBe(0);
    });

    it('show() is idempotent (replaces the previous pill)', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        pill.show();
        // Exactly one pill in the target, listeners reset to one set.
        expect(target.childNodes.length).toBe(1);
        const mousedownCount = doc.listeners.filter(l => l.type === 'mousedown').length;
        expect(mousedownCount).toBe(1);
        // Scroll listener moved from doc to target (see scroll-hide test).
        const scrollCount = target.listeners.filter(l => l.type === 'scroll').length;
        expect(scrollCount).toBe(1);
    });

    it('button is non-focusable (tabindex=-1) so Tab does not blur the editor', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        expect(btn.attrs.get('tabindex')).toBe('-1');
    });

    it('falls back to a unicode sparkle glyph when no icon name renders an SVG', () => {
        // setIcon is mocked as a no-op above, so no SVG ever gets injected.
        // The pill must NOT be empty -- the user reported the button being
        // invisible because nothing rendered. The fallback chain ends in
        // a unicode glyph so the affordance stays visible.
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        const btn = target.childNodes[0];
        expect(btn.textContent.length).toBeGreaterThan(0);
    });

    it('dispose is an alias for hide', () => {
        const pill = new InlineActionPill({ target: target as unknown as HTMLElement, onClick: vi.fn() });
        pill.show();
        pill.dispose();
        expect(pill.isVisible).toBe(false);
        expect(doc.listeners.length).toBe(0);
    });
});
