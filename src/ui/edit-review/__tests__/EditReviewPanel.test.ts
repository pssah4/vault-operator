import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditReviewPanel, type EditReviewPanelOptions, type EditReviewEntry } from '../EditReviewPanel';

interface FakeNode {
    tagName: string;
    classList: { classes: Set<string>; add: (c: string) => void; remove: (c: string) => void; contains: (c: string) => boolean; toggle: (c: string, force?: boolean) => void };
    style: { setProperty: (k: string, v: string) => void };
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
        style: { setProperty: (k: string, v: string) => { styleMap.set(k, v); } },
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

    node.appendChild = (child) => { child.parent = node; node.children.push(child); return child; };
    node.append = (...children) => { for (const c of children) node.appendChild(c); };
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
    node.click = () => node.dispatch('click', { preventDefault: () => {}, stopPropagation: () => {} });
    node.focus = () => { /* no-op */ };
    Object.defineProperty(node, 'textContent', {
        get: () => {
            if (node.children.length === 0) return node.text;
            const parts: string[] = [];
            if (node.text.length > 0) parts.push(node.text);
            for (const c of node.children) parts.push(c.textContent);
            return parts.join('');
        },
        set: (v: string | null) => {
            node.text = v ?? '';
            node.children.length = 0;
        },
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

function findByClass(root: FakeNode, cls: string): FakeNode | null {
    if (root.classList.contains(cls)) return root;
    for (const child of root.children) {
        const found = findByClass(child, cls);
        if (found !== null) return found;
    }
    return null;
}

function findAllByClass(root: FakeNode, cls: string): FakeNode[] {
    const out: FakeNode[] = [];
    if (root.classList.contains(cls)) out.push(root);
    for (const child of root.children) out.push(...findAllByClass(child, cls));
    return out;
}

const SAMPLE_ENTRIES: EditReviewEntry[] = [
    {
        path: 'Notes/Idee.md',
        before: 'Lorem ipsum dolor sit amet.\nConsectetur adipiscing.\nSed do eiusmod tempor.\n',
        after: 'Lorem ipsum.\nKurz und klar.\nSed do eiusmod tempor.\n',
    },
    {
        path: 'Notes/Plan.md',
        before: 'Step one.\nStep two.\n',
        after: 'Step one.\nStep two refined.\nStep three.\n',
    },
];

describe('EditReviewPanel', () => {
    let doc: FakeDocument;
    let container: FakeNode;

    beforeEach(() => {
        doc = makeDocument();
        container = doc.body.appendChild(doc.createElement('div'));
    });

    function newPanel(overrides: Partial<EditReviewPanelOptions> = {}): EditReviewPanel {
        return new EditReviewPanel({
            containerEl: container as unknown as HTMLElement,
            entries: SAMPLE_ENTRIES,
            mode: 'edit',
            onApply: vi.fn(),
            onDiscard: vi.fn(),
            ...overrides,
        });
    }

    describe('layout', () => {
        it('open() renders root with file-list left + diff right', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            expect(root.classList.contains('agent-edit-review')).toBe(true);
            expect(findByClass(root, 'agent-edit-review__filelist')).not.toBeNull();
            expect(findByClass(root, 'agent-edit-review__diff')).not.toBeNull();
        });

        it('renders one file entry per input entry in the list', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const entries = findAllByClass(root, 'agent-edit-review__file');
            expect(entries).toHaveLength(2);
            expect(entries[0].textContent).toContain('Idee.md');
            expect(entries[1].textContent).toContain('Plan.md');
        });

        it('selects the first file by default', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const files = findAllByClass(root, 'agent-edit-review__file');
            expect(files[0].classList.contains('is-selected')).toBe(true);
            expect(files[1].classList.contains('is-selected')).toBe(false);
            expect(panel.selectedIndex).toBe(0);
        });

        it('shows the current file path in the diff header', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const header = findByClass(root, 'agent-edit-review__diff-header');
            expect(header).not.toBeNull();
            expect(header!.textContent).toContain('Notes/Idee.md');
        });

        it('clicking a file in the list switches the diff to that file', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const files = findAllByClass(root, 'agent-edit-review__file');
            files[1].click();
            expect(panel.selectedIndex).toBe(1);
            const header = findByClass(root, 'agent-edit-review__diff-header');
            expect(header!.textContent).toContain('Notes/Plan.md');
            expect(files[1].classList.contains('is-selected')).toBe(true);
            expect(files[0].classList.contains('is-selected')).toBe(false);
        });

        it('omits the file list when there is only one entry', () => {
            const panel = newPanel({ entries: [SAMPLE_ENTRIES[0]] });
            panel.open();
            const root = container.children[0];
            expect(findByClass(root, 'agent-edit-review__filelist')).toBeNull();
        });
    });

    describe('side-by-side columns', () => {
        it('left column renders BEFORE content read-only', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const before = findByClass(root, 'agent-edit-review__column--before');
            expect(before).not.toBeNull();
            expect(before!.textContent).toContain('Lorem ipsum dolor sit amet.');
            expect(before!.textContent).toContain('Consectetur adipiscing.');
        });

        it('right column is a contenteditable div rendering AFTER lines', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const after = findByClass(root, 'agent-edit-review__column--after');
            expect(after).not.toBeNull();
            const editor = findByClass(after!, 'agent-edit-review__editor');
            expect(editor).not.toBeNull();
            expect(editor!.tagName).toBe('DIV');
            expect(editor!.getAttribute('contenteditable')).toBe('plaintext-only');
            expect(editor!.textContent).toContain('Lorem ipsum.');
            expect(editor!.textContent).toContain('Kurz und klar.');
        });

        it('AFTER-side added lines get the is-added (and is-changed) class', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const editor = findByClass(root, 'agent-edit-review__editor')!;
            const lines = editor.children.filter(c => c.classList.contains('agent-edit-review__line'));
            const added = lines.filter(c => c.classList.contains('is-added'));
            // First file: "Lorem ipsum." and "Kurz und klar." are new lines.
            expect(added.length).toBeGreaterThanOrEqual(2);
            for (const a of added) {
                expect(a.classList.contains('is-changed')).toBe(true);
            }
            // Unchanged line stays plain on the AFTER side too. The text
            // lives inside a .agent-edit-review__line-text sub-element.
            const unchanged = lines.find(l => {
                const txt = findByClass(l, 'agent-edit-review__line-text');
                return txt !== null && txt.textContent === 'Sed do eiusmod tempor.';
            });
            expect(unchanged).toBeDefined();
            expect(unchanged!.classList.contains('is-added')).toBe(false);
        });

        it('typing in the contenteditable updates the panels internal final-content for that file', () => {
            const onApply = vi.fn();
            const panel = newPanel({ onApply });
            panel.open();
            const root = container.children[0];
            const editor = findByClass(root, 'agent-edit-review__editor')!;
            // Simulate the user clearing the rendered lines and typing
            // a single new line. The FakeNode lets us reset children +
            // set textContent directly.
            editor.children.length = 0;
            editor.text = 'User typed override.';
            editor.dispatch('input', { target: editor });
            const applyBtn = findByClass(root, 'agent-edit-review__apply-btn')!;
            applyBtn.click();
            expect(onApply).toHaveBeenCalledTimes(1);
            const decisions = onApply.mock.calls[0][0] as Array<{ path: string; finalContent: string; skipped: boolean }>;
            expect(decisions).toHaveLength(2);
            expect(decisions[0].finalContent).toBe('User typed override.');
            expect(decisions[1].finalContent).toContain('Step two refined.');
        });

        it('changed lines on the LEFT (before) get the is-changed class', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const beforeCol = findByClass(root, 'agent-edit-review__column--before')!;
            const beforeLines = findAllByClass(beforeCol, 'agent-edit-review__line');
            const changedLines = beforeLines.filter(l => l.classList.contains('is-changed'));
            expect(changedLines.length).toBeGreaterThanOrEqual(2);
            const unchanged = beforeLines.find(l => {
                const txt = findByClass(l, 'agent-edit-review__line-text');
                return txt !== null && txt.textContent === 'Sed do eiusmod tempor.';
            });
            expect(unchanged).toBeDefined();
            expect(unchanged!.classList.contains('is-changed')).toBe(false);
        });

        it('every non-padding line has a numbered gutter', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const beforeCol = findByClass(root, 'agent-edit-review__column--before')!;
            const beforeLines = findAllByClass(beforeCol, 'agent-edit-review__line');
            for (const l of beforeLines) {
                if (l.classList.contains('agent-edit-review__line--padding')) continue;
                const gutter = findByClass(l, 'agent-edit-review__lineno');
                expect(gutter).not.toBeNull();
                expect(gutter!.textContent.length).toBeGreaterThan(0);
            }
        });

        it('left and right columns have the SAME number of lines (zeilen-aligned)', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const beforeCol = findByClass(root, 'agent-edit-review__column--before')!;
            const beforeLines = findAllByClass(beforeCol, 'agent-edit-review__line');
            const editor = findByClass(root, 'agent-edit-review__editor')!;
            const afterLines = findAllByClass(editor, 'agent-edit-review__line');
            expect(beforeLines.length).toBe(afterLines.length);
        });

        it('shows a stats label (e.g. "+N −M") in the AFTER column header', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const stats = findByClass(root, 'agent-edit-review__stats');
            expect(stats).not.toBeNull();
            expect(stats!.textContent.length).toBeGreaterThan(0);
        });
    });

    describe('actions', () => {
        it('footer has exactly two buttons: Verwerfen + Anwenden', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const footer = findByClass(root, 'agent-edit-review__footer');
            expect(footer).not.toBeNull();
            const apply = findByClass(footer!, 'agent-edit-review__apply-btn');
            const discard = findByClass(footer!, 'agent-edit-review__discard-btn');
            expect(apply).not.toBeNull();
            expect(discard).not.toBeNull();
            // No further buttons -- count children: should be exactly the two we expect.
            const buttons = footer!.children.filter(c => c.tagName === 'BUTTON');
            expect(buttons).toHaveLength(2);
        });

        it('Anwenden invokes onApply with one decision per file', () => {
            const onApply = vi.fn();
            const panel = newPanel({ onApply });
            panel.open();
            const root = container.children[0];
            const applyBtn = findByClass(root, 'agent-edit-review__apply-btn')!;
            applyBtn.click();
            expect(onApply).toHaveBeenCalledTimes(1);
            const decisions = onApply.mock.calls[0][0] as Array<{ path: string; finalContent: string; skipped: boolean }>;
            expect(decisions.map(d => d.path)).toEqual(['Notes/Idee.md', 'Notes/Plan.md']);
        });

        it('Verwerfen invokes onDiscard and closes the panel', () => {
            const onDiscard = vi.fn();
            const panel = newPanel({ onDiscard });
            panel.open();
            const root = container.children[0];
            const discardBtn = findByClass(root, 'agent-edit-review__discard-btn')!;
            discardBtn.click();
            expect(onDiscard).toHaveBeenCalledTimes(1);
            expect(panel.isOpen).toBe(false);
        });
    });

    describe('skip', () => {
        it('skip-toggle in the diff header marks the file as skipped', () => {
            const onApply = vi.fn();
            const panel = newPanel({ onApply });
            panel.open();
            const root = container.children[0];
            const skipBtn = findByClass(root, 'agent-edit-review__skip-btn');
            expect(skipBtn).not.toBeNull();
            skipBtn!.click();
            const applyBtn = findByClass(root, 'agent-edit-review__apply-btn')!;
            applyBtn.click();
            const decisions = onApply.mock.calls[0][0] as Array<{ path: string; skipped: boolean }>;
            expect(decisions.find(d => d.path === 'Notes/Idee.md')!.skipped).toBe(true);
            expect(decisions.find(d => d.path === 'Notes/Plan.md')!.skipped).toBe(false);
        });

        it('skipped files get the is-skipped class in the file list', () => {
            const panel = newPanel();
            panel.open();
            const root = container.children[0];
            const skipBtn = findByClass(root, 'agent-edit-review__skip-btn')!;
            skipBtn.click();
            const files = findAllByClass(root, 'agent-edit-review__file');
            expect(files[0].classList.contains('is-skipped')).toBe(true);
            expect(files[1].classList.contains('is-skipped')).toBe(false);
        });
    });

    describe('checkpoint mode', () => {
        it('mode=checkpoint shows a restore button and no contenteditable editor', () => {
            const onRestore = vi.fn();
            const panel = new EditReviewPanel({
                containerEl: container as unknown as HTMLElement,
                entries: [SAMPLE_ENTRIES[0]],
                mode: 'checkpoint',
                onRestore,
            });
            panel.open();
            const root = container.children[0];
            // Editor field on the right side is NOT editable in checkpoint mode.
            const editor = findByClass(root, 'agent-edit-review__editor');
            expect(editor).not.toBeNull();
            expect(editor!.getAttribute('contenteditable')).toBeNull();
            // Footer has a restore button instead of Apply.
            const restore = findByClass(root, 'agent-edit-review__restore-btn');
            expect(restore).not.toBeNull();
            restore!.click();
            expect(onRestore).toHaveBeenCalledTimes(1);
        });
    });

    describe('empty state', () => {
        it('shows an empty-state hint when entries list is empty', () => {
            const panel = newPanel({ entries: [] });
            panel.open();
            const root = container.children[0];
            expect(findByClass(root, 'agent-edit-review__empty')).not.toBeNull();
        });
    });
});
