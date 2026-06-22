import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InlineChatPanel, type InlineChatPanelOptions } from '../InlineChatPanel';
import type { InlineTriggerContext } from '../../InlineTriggerContext';

interface FakeNode {
    tagName: string;
    classList: { classes: Set<string>; add: (c: string) => void; remove: (c: string) => void; contains: (c: string) => boolean; toggle: (c: string, force?: boolean) => void };
    style: { setProperty: (k: string, v: string) => void; get left(): string; get top(): string };
    children: FakeNode[];
    listeners: Map<string, ((ev: unknown) => void)[]>;
    parent: FakeNode | null;
    text: string;
    value: string;
    attrs: Record<string, string>;
    ownerDocument: FakeDocument;
    scrollTop: number;
    scrollHeight: number;
    appendChild: (c: FakeNode) => FakeNode;
    append: (...children: FakeNode[]) => void;
    remove: () => void;
    setAttribute: (k: string, v: string) => void;
    getAttribute: (k: string) => string | null;
    addEventListener: (t: string, h: (ev: unknown) => void) => void;
    removeEventListener: (t: string, h: (ev: unknown) => void) => void;
    dispatch: (t: string, ev: unknown) => void;
    contains: (other: FakeNode) => boolean;
    getBoundingClientRect: () => { width: number; height: number; left: number; bottom: number };
    click: () => void;
    focus: () => void;
    set textContent(v: string | null);
    get textContent(): string;
}

interface FakeDocument {
    createElement: (tag: string) => FakeNode;
    addEventListener: (t: string, h: (ev: unknown) => void) => void;
    removeEventListener: (t: string, h: (ev: unknown) => void) => void;
    dispatch: (t: string, ev: unknown) => void;
    defaultView: { innerWidth: number; innerHeight: number };
    body: FakeNode;
}

function makeNode(doc: FakeDocument, tag: string): FakeNode {
    const styleMap = new Map<string, string>();
    const classes = new Set<string>();
    const node = {
        tagName: tag.toUpperCase(),
        classList: {
            classes,
            add: (c: string) => { classes.add(c); },
            remove: (c: string) => { classes.delete(c); },
            contains: (c: string) => classes.has(c),
            toggle: (c: string, force?: boolean) => {
                if (force === true) classes.add(c);
                else if (force === false) classes.delete(c);
                else if (classes.has(c)) classes.delete(c);
                else classes.add(c);
            },
        },
        style: {
            setProperty: (k: string, v: string) => { styleMap.set(k, v); },
            get left() { return styleMap.get('left') ?? ''; },
            get top() { return styleMap.get('top') ?? ''; },
        },
        children: [] as FakeNode[],
        listeners: new Map<string, ((ev: unknown) => void)[]>(),
        parent: null as FakeNode | null,
        text: '',
        value: '',
        attrs: {} as Record<string, string>,
        ownerDocument: doc,
        scrollTop: 0,
        scrollHeight: 100,
    } as Partial<FakeNode> as FakeNode;

    node.appendChild = (child: FakeNode) => { child.parent = node; node.children.push(child); return child; };
    node.append = (...children: FakeNode[]) => { for (const c of children) node.appendChild(c); };
    node.remove = () => {
        if (node.parent !== null) {
            const idx = node.parent.children.indexOf(node);
            if (idx >= 0) node.parent.children.splice(idx, 1);
            node.parent = null;
        }
    };
    (node as unknown as { removeChild: (c: FakeNode) => FakeNode }).removeChild = (child: FakeNode) => {
        const idx = node.children.indexOf(child);
        if (idx >= 0) node.children.splice(idx, 1);
        child.parent = null;
        return child;
    };
    Object.defineProperty(node, 'firstChild', {
        get: () => (node.children.length > 0 ? node.children[0] : null),
    });
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
    node.dispatch = (t, ev) => { for (const h of node.listeners.get(t) ?? []) h(ev); };
    node.contains = (other) => {
        let cur: FakeNode | null = other;
        while (cur !== null) { if (cur === node) return true; cur = cur.parent; }
        return false;
    };
    node.getBoundingClientRect = () => ({ width: 520, height: 320, left: 0, bottom: 320 });
    node.click = () => node.dispatch('click', { preventDefault: () => {}, stopPropagation: () => {} });
    node.focus = () => { /* no-op */ };
    Object.defineProperty(node, 'textContent', {
        get: () => node.text,
        set: (v: string | null) => { node.text = v ?? ''; },
    });
    return node;
}

function makeDocument(): FakeDocument {
    const docListeners = new Map<string, ((ev: unknown) => void)[]>();
    const doc = {
        createElement: (tag: string) => makeNode(doc, tag),
        defaultView: { innerWidth: 1024, innerHeight: 768 },
    } as Partial<FakeDocument> as FakeDocument;
    doc.body = makeNode(doc, 'body');
    doc.addEventListener = (t, h) => {
        const arr = docListeners.get(t) ?? [];
        arr.push(h);
        docListeners.set(t, arr);
    };
    doc.removeEventListener = (t, h) => {
        const arr = docListeners.get(t) ?? [];
        const idx = arr.indexOf(h);
        if (idx >= 0) arr.splice(idx, 1);
    };
    doc.dispatch = (t, ev) => { for (const h of docListeners.get(t) ?? []) h(ev); };
    return doc;
}

function makeCtx(text = 'hello world'): InlineTriggerContext {
    return {
        selectionText: text,
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
    };
}

function findByClass(root: FakeNode, cls: string): FakeNode | null {
    if (root.classList.contains(cls)) return root;
    for (const child of root.children) {
        const found = findByClass(child, cls);
        if (found !== null) return found;
    }
    return null;
}

describe('InlineChatPanel (Sidebar-Composer-Layout)', () => {
    let doc: FakeDocument;
    let container: FakeNode;

    beforeEach(() => {
        doc = makeDocument();
        container = doc.body.appendChild(doc.createElement('div'));
    });

    function newPanel(overrides: Partial<InlineChatPanelOptions> = {}): InlineChatPanel {
        return new InlineChatPanel({
            containerEl: container as unknown as HTMLElement,
            ctx: makeCtx(),
            position: { x: 50, y: 50 },
            onDispatch: vi.fn(),
            ...overrides,
        });
    }

    it('isOpen is false before open()', () => {
        const panel = newPanel();
        expect(panel.isOpen).toBe(false);
    });

    it('open() renders Sidebar-style composer (chat-input-wrapper + chat-textarea + chat-toolbar)', () => {
        const panel = newPanel();
        panel.open();
        const root = container.children[0];
        expect(root.classList.contains('agent-inline-panel')).toBe(true);
        expect(findByClass(root, 'chat-input-container')).not.toBeNull();
        expect(findByClass(root, 'chat-input-wrapper')).not.toBeNull();
        expect(findByClass(root, 'chat-textarea')).not.toBeNull();
        expect(findByClass(root, 'chat-toolbar')).not.toBeNull();
        expect(findByClass(root, 'chat-toolbar-left')).not.toBeNull();
        expect(findByClass(root, 'chat-toolbar-right')).not.toBeNull();
    });

    it('toolbar has model + plus + lookup (magnifier) + ellipsis + send buttons', () => {
        const panel = newPanel();
        panel.open();
        const root = container.children[0];
        expect(findByClass(root, 'model-button')).not.toBeNull();
        expect(findByClass(root, 'plus-button')).not.toBeNull();
        expect(findByClass(root, 'lookup-button')).not.toBeNull();
        expect(findByClass(root, 'ellipsis-button')).not.toBeNull();
        expect(findByClass(root, 'send-button')).not.toBeNull();
    });

    it('clicking the magnifier dispatches the lookup action', () => {
        const onDispatch = vi.fn();
        const panel = newPanel({ onDispatch });
        panel.open();
        const root = container.children[0];
        const lookupBtn = findByClass(root, 'lookup-button');
        expect(lookupBtn).not.toBeNull();
        lookupBtn!.click();
        expect(onDispatch).toHaveBeenCalledTimes(1);
        expect(onDispatch.mock.calls[0][0]).toMatchObject({ actionId: 'lookup', userInput: '' });
    });

    it('selection preview shows above the body with the actual text', () => {
        const panel = newPanel({ ctx: makeCtx('first line\nsecond line') });
        panel.open();
        const root = container.children[0];
        const preview = findByClass(root, 'agent-inline-panel__anchor-text');
        expect(preview).not.toBeNull();
        expect(preview!.textContent).toContain('first line');
        expect(preview!.textContent).toContain('second line');
    });

    it('selection preview truncates to 3 lines and offers a chevron toggle', () => {
        const longSelection = 'line 1\nline 2\nline 3\nline 4\nline 5';
        const setIcon = vi.fn();
        const panel = newPanel({ ctx: makeCtx(longSelection), setIcon });
        panel.open();
        const root = container.children[0];
        const preview = findByClass(root, 'agent-inline-panel__anchor-text');
        expect(preview).not.toBeNull();
        expect(preview!.textContent).toContain('line 3');
        expect(preview!.textContent).not.toContain('line 4');
        expect(preview!.textContent.endsWith('…')).toBe(true);

        const toggle = findByClass(root, 'agent-inline-panel__anchor-toggle');
        expect(toggle).not.toBeNull();
        expect(toggle!.getAttribute('title')).toBe('Expand');
        // Initial render: chevron-down icon requested via setIcon hook.
        const initialIcons = setIcon.mock.calls.map(c => c[1]);
        expect(initialIcons).toContain('chevron-down');

        toggle!.click();
        expect(preview!.textContent).toContain('line 4');
        expect(preview!.textContent).toContain('line 5');
        expect(toggle!.getAttribute('title')).toBe('Collapse');
        const afterExpandIcons = setIcon.mock.calls.map(c => c[1]);
        expect(afterExpandIcons).toContain('chevron-up');

        toggle!.click();
        expect(preview!.textContent).not.toContain('line 4');
        expect(toggle!.getAttribute('title')).toBe('Expand');
    });

    it('preview toggle is omitted when selection has 3 or fewer lines', () => {
        const panel = newPanel({ ctx: makeCtx('line 1\nline 2') });
        panel.open();
        const root = container.children[0];
        expect(findByClass(root, 'agent-inline-panel__anchor-toggle')).toBeNull();
    });

    it('no preview section when selection is empty', () => {
        const panel = newPanel({ ctx: makeCtx('') });
        panel.open();
        const root = container.children[0];
        expect(findByClass(root, 'agent-inline-panel__anchor')).toBeNull();
    });

    it('Escape closes the panel', () => {
        const panel = newPanel();
        panel.open();
        expect(panel.isOpen).toBe(true);
        doc.dispatch('keydown', { key: 'Escape', preventDefault: () => {} });
        expect(panel.isOpen).toBe(false);
    });

    it('close button removes the panel', () => {
        const panel = newPanel();
        panel.open();
        const root = container.children[0];
        const closeBtn = findByClass(root, 'agent-inline-panel__close');
        expect(closeBtn).not.toBeNull();
        closeBtn!.click();
        expect(panel.isOpen).toBe(false);
        expect(container.children).toHaveLength(0);
    });

    it('onShowMoreMenu fires when ellipsis is clicked', () => {
        const onShowMoreMenu = vi.fn();
        const panel = newPanel({ onShowMoreMenu });
        panel.open();
        const ellipsis = findByClass(container.children[0], 'ellipsis-button');
        ellipsis!.click();
        expect(onShowMoreMenu).toHaveBeenCalledTimes(1);
    });

    it('onShowPlusMenu fires when plus is clicked', () => {
        const onShowPlusMenu = vi.fn();
        const panel = newPanel({ onShowPlusMenu });
        panel.open();
        const plus = findByClass(container.children[0], 'plus-button');
        plus!.click();
        expect(onShowPlusMenu).toHaveBeenCalledTimes(1);
    });

    it('appendMessage + streaming both land in the body', () => {
        const panel = newPanel();
        const handle = panel.open();
        const id = handle.appendMessage({ role: 'assistant', text: 'A' });
        handle.appendStreamChunk(id, 'B');
        const body = findByClass(container.children[0], 'agent-inline-panel__body');
        expect(body!.children).toHaveLength(1);
        expect(body!.children[0].textContent).toBe('AB');
    });

    it('open() twice replaces previous instance', () => {
        const panel = newPanel();
        panel.open();
        panel.open();
        expect(container.children).toHaveLength(1);
    });

    it('onClose fires once on user-initiated close', () => {
        const onClose = vi.fn();
        const panel = newPanel({ onClose });
        panel.open();
        panel.close();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('finalizeBubble: invokes renderMarkdown hook with accumulated markdown after streaming', async () => {
        const renderMarkdown = vi.fn(async (el: { textContent: string }, md: string) => { el.textContent = `RENDERED:${md}`; });
        const panel = newPanel({ renderMarkdown: renderMarkdown as never });
        const handle = panel.open();
        const id = handle.appendMessage({ role: 'assistant', text: '' });
        handle.appendStreamChunk(id, 'Hello ');
        handle.appendStreamChunk(id, '[[note]]');
        await handle.finalizeBubble(id);
        expect(renderMarkdown).toHaveBeenCalledTimes(1);
        const callArgs = renderMarkdown.mock.calls[0];
        expect(callArgs[1]).toBe('Hello [[note]]');
        const body = findByClass(container.children[0], 'agent-inline-panel__body');
        expect(body!.children[0].textContent).toBe('RENDERED:Hello [[note]]');
    });

    it('finalizeBubble: no-op when renderMarkdown hook is undefined (bubble keeps plain text)', async () => {
        const panel = newPanel();
        const handle = panel.open();
        const id = handle.appendMessage({ role: 'assistant', text: '' });
        handle.appendStreamChunk(id, 'plain text');
        await handle.finalizeBubble(id);
        const body = findByClass(container.children[0], 'agent-inline-panel__body');
        expect(body!.children[0].textContent).toBe('plain text');
    });

    it('finalizeBubble: hook error falls back to plain text', async () => {
        const renderMarkdown = vi.fn(async () => { throw new Error('boom'); });
        const panel = newPanel({ renderMarkdown: renderMarkdown as never });
        const handle = panel.open();
        const id = handle.appendMessage({ role: 'assistant', text: '' });
        handle.appendStreamChunk(id, 'fallback content');
        await handle.finalizeBubble(id);
        const body = findByClass(container.children[0], 'agent-inline-panel__body');
        expect(body!.children[0].textContent).toBe('fallback content');
    });

    it('custom setIcon hook is invoked for every icon button', () => {
        const setIcon = vi.fn();
        const panel = newPanel({ setIcon });
        panel.open();
        // 4 icon buttons: plus, lookup, ellipsis, send.
        expect(setIcon.mock.calls.map(c => c[1])).toEqual(['plus', 'search', 'ellipsis', 'send-horizontal']);
    });
});
