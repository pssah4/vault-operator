/**
 * InlineFloatingMenu unit tests (vitest, node-env, no jsdom).
 *
 * Pure-logic coverage with a hand-rolled minimal DOM stub. Visual
 * rendering and event-handler integration are covered by manual
 * smoke-tests in the live plugin (see PLAN-42).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InlineFloatingMenu } from '../InlineFloatingMenu';
import { InlineActionRegistry, type InlineAction } from '../InlineActionRegistry';
import type { InlineTriggerContext } from '../InlineTriggerContext';

interface FakeNode {
    tagName?: string;
    classList: { classes: Set<string>; add: (c: string) => void; contains: (c: string) => boolean };
    style: { setProperty: (k: string, v: string) => void; get position(): string; get left(): string; get top(): string };
    setCssStyles: (styles: Record<string, string>) => void;
    children: FakeNode[];
    listeners: Map<string, ((ev: unknown) => void)[]>;
    parent: FakeNode | null;
    text: string;
    attrs: Record<string, string>;
    dataset: Record<string, string>;
    ownerDocument: FakeDocument;
    appendChild: (child: FakeNode) => FakeNode;
    remove: () => void;
    setAttribute: (k: string, v: string) => void;
    getAttribute: (k: string) => string | null;
    addEventListener: (t: string, h: (ev: unknown) => void) => void;
    removeEventListener: (t: string, h: (ev: unknown) => void) => void;
    dispatch: (t: string, ev: unknown) => void;
    contains: (other: FakeNode) => boolean;
    getBoundingClientRect: () => { width: number; height: number };
    click: () => void;
    set textContent(v: string);
    get textContent(): string;
}

interface FakeDocument {
    createElement: (tag: string) => FakeNode;
    addEventListener: (t: string, h: (ev: unknown) => void, capture?: boolean) => void;
    removeEventListener: (t: string, h: (ev: unknown) => void, capture?: boolean) => void;
    dispatch: (t: string, ev: unknown) => void;
    defaultView: { innerWidth: number; innerHeight: number };
    body: FakeNode;
}

function styleStore(): FakeNode['style'] {
    const map = new Map<string, string>();
    return {
        setProperty: (k, v) => { map.set(k, v); },
        get position() { return map.get('position') ?? ''; },
        get left() { return map.get('left') ?? ''; },
        get top() { return map.get('top') ?? ''; },
    };
}

function makeNode(doc: FakeDocument, tag: string): FakeNode {
    const node = {
        tagName: tag.toUpperCase(),
        classList: (() => {
            const classes = new Set<string>();
            return {
                classes,
                add: (c: string) => { classes.add(c); },
                contains: (c: string) => classes.has(c),
            };
        })(),
        style: styleStore(),
        children: [] as FakeNode[],
        listeners: new Map<string, ((ev: unknown) => void)[]>(),
        parent: null as FakeNode | null,
        text: '',
        attrs: {} as Record<string, string>,
        dataset: {} as Record<string, string>,
        ownerDocument: doc,
    } as Partial<FakeNode> as FakeNode;

    node.appendChild = (child: FakeNode) => {
        child.parent = node;
        node.children.push(child);
        return child;
    };
    node.remove = () => {
        if (node.parent !== null) {
            const idx = node.parent.children.indexOf(node);
            if (idx >= 0) node.parent.children.splice(idx, 1);
            node.parent = null;
        }
    };
    node.setAttribute = (k, v) => { node.attrs[k] = v; };
    node.getAttribute = (k) => node.attrs[k] ?? null;
    node.addEventListener = (t, h) => {
        const arr = node.listeners.get(t) ?? [];
        arr.push(h);
        node.listeners.set(t, arr);
    };
    node.removeEventListener = (t, h) => {
        const arr = node.listeners.get(t) ?? [];
        const idx = arr.indexOf(h);
        if (idx >= 0) arr.splice(idx, 1);
    };
    node.dispatch = (t, ev) => {
        for (const h of node.listeners.get(t) ?? []) h(ev);
    };
    node.contains = (other: FakeNode) => {
        let cur: FakeNode | null = other;
        while (cur !== null) {
            if (cur === node) return true;
            cur = cur.parent;
        }
        return false;
    };
    // Mirror Obsidian's HTMLElement.setCssStyles by writing through to
    // the same style-property store the test reads back.
    node.setCssStyles = (styles: Record<string, string>) => {
        for (const [k, v] of Object.entries(styles)) {
            node.style.setProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), v);
        }
    };
    node.getBoundingClientRect = () => ({ width: 200, height: 100 });
    node.click = () => node.dispatch('click', { preventDefault: () => {}, stopPropagation: () => {} });
    Object.defineProperty(node, 'textContent', {
        get: () => node.text,
        set: (v: string) => { node.text = v; },
    });
    return node;
}

function makeDocument(): FakeDocument {
    const docListeners = new Map<string, { handler: (ev: unknown) => void; capture: boolean }[]>();
    const doc = {
        createElement: (tag: string) => makeNode(doc, tag),
        defaultView: { innerWidth: 1024, innerHeight: 768 },
    } as Partial<FakeDocument> as FakeDocument;
    doc.body = makeNode(doc, 'body');
    doc.addEventListener = (t, h, capture) => {
        const arr = docListeners.get(t) ?? [];
        arr.push({ handler: h, capture: capture === true });
        docListeners.set(t, arr);
    };
    doc.removeEventListener = (t, h, capture) => {
        const arr = docListeners.get(t) ?? [];
        const idx = arr.findIndex(e => e.handler === h && e.capture === (capture === true));
        if (idx >= 0) arr.splice(idx, 1);
    };
    doc.dispatch = (t, ev) => {
        for (const { handler } of docListeners.get(t) ?? []) handler(ev);
    };
    return doc;
}

function makeCtx(overrides: Partial<InlineTriggerContext> = {}): InlineTriggerContext {
    return {
        selectionText: 'sample',
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        ...overrides,
    };
}

function makeAction(id: string, label: string, isEligible: (ctx: InlineTriggerContext) => boolean = () => true): InlineAction {
    return { id, label, isEligible, execute: vi.fn(async () => { /* no-op */ }) };
}

describe('InlineFloatingMenu (DOM-stub)', () => {
    let doc: FakeDocument;
    let container: FakeNode;

    beforeEach(() => {
        doc = makeDocument();
        container = doc.body.appendChild(doc.createElement('div'));
    });

    it('isOpen is false before open()', () => {
        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry: new InlineActionRegistry(),
            onPick: vi.fn(),
        });
        expect(menu.isOpen).toBe(false);
    });

    it('open() renders one button per registered action', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('lookup', 'Lookup'));
        registry.register(makeAction('rewrite', 'Rewrite'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 100, y: 200 });

        // First child of container is the menu root, with two button children.
        expect(container.children).toHaveLength(1);
        const root = container.children[0];
        expect(root.classList.contains('agent-inline-menu')).toBe(true);
        expect(root.children).toHaveLength(2);
        expect(root.children[0].textContent).toBe('Lookup');
        expect(root.children[1].textContent).toBe('Rewrite');
        expect(menu.isOpen).toBe(true);
    });

    it('open() filters actions via isEligible', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('rewrite', 'Rewrite', (ctx) => ctx.editorMode !== 'reading'));
        registry.register(makeAction('lookup', 'Lookup'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx({ editorMode: 'reading' }), { x: 0, y: 0 });

        const root = container.children[0];
        expect(root.children).toHaveLength(1);
        expect(root.children[0].textContent).toBe('Lookup');
    });

    it('open() with zero eligible actions stays closed', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('rewrite', 'Rewrite', () => false));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 0, y: 0 });

        expect(menu.isOpen).toBe(false);
        expect(container.children).toHaveLength(0);
    });

    it('clicking an item calls onPick and closes the menu', () => {
        const onPick = vi.fn();
        const action = makeAction('lookup', 'Lookup');
        const registry = new InlineActionRegistry();
        registry.register(action);

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick,
        });
        const ctx = makeCtx();
        menu.open(ctx, { x: 0, y: 0 });

        const item = container.children[0].children[0];
        item.click();

        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith(action, ctx);
        expect(menu.isOpen).toBe(false);
    });

    it('Escape closes the menu', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('lookup', 'Lookup'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 0, y: 0 });
        doc.dispatch('keydown', { key: 'Escape', preventDefault: () => {} });
        expect(menu.isOpen).toBe(false);
    });

    it('Click outside closes the menu', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('lookup', 'Lookup'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 0, y: 0 });

        // mousedown event with a target that is NOT in the menu root.
        const outside = doc.createElement('div');
        doc.dispatch('mousedown', { target: outside });
        expect(menu.isOpen).toBe(false);
    });

    it('Click inside menu root does NOT close it (only the button click does)', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('lookup', 'Lookup'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 0, y: 0 });

        const root = container.children[0];
        // Dispatch mousedown with the root as target -- should NOT close.
        doc.dispatch('mousedown', { target: root });
        expect(menu.isOpen).toBe(true);
    });

    it('dispose() removes the menu and is idempotent on Escape', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('lookup', 'Lookup'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 0, y: 0 });
        menu.dispose();
        expect(menu.isOpen).toBe(false);
        expect(container.children).toHaveLength(0);

        // Escape after dispose is a no-op (no thrown error).
        expect(() => doc.dispatch('keydown', { key: 'Escape', preventDefault: () => {} })).not.toThrow();
        expect(menu.isOpen).toBe(false);
    });

    it('positions the menu absolutely with left/top set on style', () => {
        const registry = new InlineActionRegistry();
        registry.register(makeAction('lookup', 'Lookup'));

        const menu = new InlineFloatingMenu({
            containerEl: container as unknown as HTMLElement,
            registry,
            onPick: vi.fn(),
        });
        menu.open(makeCtx(), { x: 120, y: 240 });

        const root = container.children[0];
        // Position is now handled via the .agent-inline-menu CSS rule
        // (position: absolute) so the test asserts left/top via the
        // setCssStyles call instead of the inline `position` literal.
        expect(root.classList.contains('agent-inline-menu')).toBe(true);
        expect(root.style.left).toBeTruthy();
        expect(root.style.top).toBeTruthy();
    });
});
