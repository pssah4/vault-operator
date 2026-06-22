/**
 * EditReviewPanel -- einheitliche Side-by-Side Review-UI für jeden Edit, der
 * eine Note ändert (Inline-AI-Actions, Sidebar-Agent-Tasks, Checkpoint-Diff).
 *
 * Layout:
 *   ┌─ Header (Titel + ×) ──────────────────────────────────────────┐
 *   │  Dateien (N)      │  Pfad      [Diese Datei skippen]          │
 *   │  • Notes/Idee.md  │ ┌─ Original ────┐ ┌─ Neu (editierbar) ──┐ │
 *   │    Notes/Plan.md  │ │ Lorem ipsum   │ │ Lorem.              │ │
 *   │                   │ │ Consectetur.. │ │ Kurz und klar.      │ │
 *   │                   │ │ Sed do...     │ │ Sed do...           │ │
 *   │                   │ └───────────────┘ └─────────────────────┘ │
 *   ├─ Footer ──────────────────────────────────────────────────────┤
 *   │              [ Verwerfen ]   [ Anwenden ]                     │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Grundsätze:
 *   - Rechte Spalte ist von Anfang an editierbar (Textarea), kein Edit-Button.
 *   - Geänderte Zeilen auf der LINKEN Spalte werden dezent gelb getönt.
 *   - Keine Per-Hunk-Buttons. Per-Datei nur ein "Skippen"-Toggle.
 *   - Nur zwei globale Aktionen: Verwerfen / Anwenden.
 *
 * Bot-Compliance: keine innerHTML, kein direkter style-Mutation außer
 * style.setProperty, keine Emojis, keine console.log (nur .debug/.warn).
 *
 * Related: EPIC-33 Diff-UX-refresh (User-Feedback 2026-06-22).
 */

import { diffLines } from '../../core/utils/diffLines';
import { buildAlignedDiff, type AlignedLine } from './alignedDiff';

export interface EditReviewEntry {
    path: string;
    before: string;
    after: string;
    /** Optional: file is newly created (no prior content). */
    isNew?: boolean;
    /** Optional: file is going to be deleted (after is empty). */
    isDeleted?: boolean;
}

export interface EditReviewDecision {
    path: string;
    /** Final content after user editing (= textarea value at apply time). */
    finalContent: string;
    /** True when user toggled "Skip this file" before applying. */
    skipped: boolean;
}

export type EditReviewMode = 'edit' | 'checkpoint';

export type SetIconHook = (el: HTMLElement, name: string) => void;

export interface EditReviewPanelOptions {
    containerEl: HTMLElement;
    entries: EditReviewEntry[];
    mode: EditReviewMode;
    /** Title shown at the top. */
    title?: string;
    /** Source label (e.g. "Inline-AI: Rewrite") for the header subtitle. */
    sourceLabel?: string;
    /** Called when the user presses "Anwenden" in edit mode. */
    onApply?: (decisions: EditReviewDecision[]) => void | Promise<void>;
    /** Called when the user presses "Verwerfen" or closes. */
    onDiscard?: () => void;
    /** Called when the user presses "Wiederherstellen" in checkpoint mode. */
    onRestore?: () => void | Promise<void>;
    /** Bridge to Obsidian's setIcon() for Lucide rendering. */
    setIcon?: SetIconHook;
}

interface FileState {
    entry: EditReviewEntry;
    workingContent: string;
    skipped: boolean;
}

export class EditReviewPanel {
    private readonly containerEl: HTMLElement;
    private readonly entries: EditReviewEntry[];
    private readonly mode: EditReviewMode;
    private readonly title: string;
    private readonly sourceLabel: string;
    private readonly onApply?: (decisions: EditReviewDecision[]) => void | Promise<void>;
    private readonly onDiscard?: () => void;
    private readonly onRestore?: () => void | Promise<void>;
    private readonly setIcon: SetIconHook;

    private files: FileState[] = [];
    private currentIndex = 0;

    private rootEl: HTMLElement | null = null;
    private filelistEl: HTMLElement | null = null;
    private diffPathEl: HTMLElement | null = null;
    private beforeColEl: HTMLElement | null = null;
    private afterEditorEl: HTMLElement | null = null;
    private afterStatsEl: HTMLElement | null = null;
    private skipBtnEl: HTMLElement | null = null;

    constructor(options: EditReviewPanelOptions) {
        this.containerEl = options.containerEl;
        this.entries = options.entries;
        this.mode = options.mode;
        this.title = options.title ?? (options.mode === 'checkpoint' ? 'Checkpoint anzeigen' : 'Änderungen prüfen');
        this.sourceLabel = options.sourceLabel ?? '';
        this.onApply = options.onApply;
        this.onDiscard = options.onDiscard;
        this.onRestore = options.onRestore;
        this.setIcon = options.setIcon ?? ((el, _name) => { el.textContent = ''; });

        this.files = options.entries.map((e) => ({
            entry: e,
            workingContent: e.after,
            skipped: false,
        }));
    }

    get isOpen(): boolean { return this.rootEl !== null; }
    get selectedIndex(): number { return this.currentIndex; }

    open(): HTMLElement {
        this.close();
        const doc = this.containerEl.ownerDocument;
        const root = doc.createElement('div');
        root.classList.add('agent-edit-review');
        if (this.mode === 'checkpoint') root.classList.add('is-checkpoint');

        this.buildHeader(root, doc);

        if (this.entries.length === 0) {
            const empty = doc.createElement('div');
            empty.classList.add('agent-edit-review__empty');
            empty.textContent = 'Keine Änderungen.';
            root.appendChild(empty);
            this.buildFooter(root, doc);
            this.containerEl.appendChild(root);
            this.rootEl = root;
            return root;
        }

        const main = doc.createElement('div');
        main.classList.add('agent-edit-review__main');
        root.appendChild(main);

        if (this.entries.length > 1) {
            this.buildFileList(main, doc);
        }
        this.buildDiff(main, doc);
        this.buildFooter(root, doc);

        this.containerEl.appendChild(root);
        this.rootEl = root;
        this.renderSelectedFile();
        return root;
    }

    close(): void {
        if (this.rootEl !== null) {
            this.rootEl.remove();
            this.rootEl = null;
        }
        this.filelistEl = null;
        this.diffPathEl = null;
        this.beforeColEl = null;
        this.afterEditorEl = null;
        this.skipBtnEl = null;
    }

    selectFile(index: number): void {
        if (index < 0 || index >= this.files.length) return;
        if (this.afterEditorEl !== null) {
            this.files[this.currentIndex].workingContent = readEditorText(this.afterEditorEl);
        }
        this.currentIndex = index;
        this.renderSelectedFile();
    }

    private buildHeader(root: HTMLElement, doc: Document): void {
        const header = doc.createElement('div');
        header.classList.add('agent-edit-review__header');

        const titleWrap = doc.createElement('div');
        titleWrap.classList.add('agent-edit-review__title-wrap');

        const title = doc.createElement('div');
        title.classList.add('agent-edit-review__title');
        title.textContent = this.title;
        titleWrap.appendChild(title);

        if (this.sourceLabel.length > 0) {
            const sub = doc.createElement('div');
            sub.classList.add('agent-edit-review__subtitle');
            sub.textContent = this.sourceLabel;
            titleWrap.appendChild(sub);
        }
        header.appendChild(titleWrap);
        root.appendChild(header);
    }

    private buildFileList(main: HTMLElement, doc: Document): void {
        const list = doc.createElement('div');
        list.classList.add('agent-edit-review__filelist');
        const heading = doc.createElement('div');
        heading.classList.add('agent-edit-review__filelist-heading');
        heading.textContent = `Dateien (${this.entries.length})`;
        list.appendChild(heading);

        this.entries.forEach((entry, index) => {
            const row = doc.createElement('button');
            row.classList.add('agent-edit-review__file');
            row.setAttribute('type', 'button');

            const statusEl = doc.createElement('span');
            statusEl.classList.add('agent-edit-review__file-status');
            statusEl.textContent = entry.isNew === true ? '+'
                : entry.isDeleted === true ? '−'
                : '●';
            row.appendChild(statusEl);

            const labelEl = doc.createElement('span');
            labelEl.classList.add('agent-edit-review__file-label');
            labelEl.textContent = entry.path;
            row.appendChild(labelEl);

            row.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.selectFile(index);
            });

            list.appendChild(row);
        });

        main.appendChild(list);
        this.filelistEl = list;
    }

    private buildDiff(main: HTMLElement, doc: Document): void {
        const diff = doc.createElement('div');
        diff.classList.add('agent-edit-review__diff');

        const diffHeader = doc.createElement('div');
        diffHeader.classList.add('agent-edit-review__diff-header');

        const pathEl = doc.createElement('div');
        pathEl.classList.add('agent-edit-review__diff-path');
        diffHeader.appendChild(pathEl);
        this.diffPathEl = pathEl;

        if (this.mode === 'edit') {
            const skip = doc.createElement('button');
            skip.classList.add('agent-edit-review__skip-btn');
            skip.setAttribute('type', 'button');
            skip.textContent = 'Skip this file';
            skip.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.toggleSkipCurrent();
            });
            diffHeader.appendChild(skip);
            this.skipBtnEl = skip;
        }
        diff.appendChild(diffHeader);

        const cols = doc.createElement('div');
        cols.classList.add('agent-edit-review__columns');

        const beforeCol = doc.createElement('div');
        beforeCol.classList.add('agent-edit-review__column');
        beforeCol.classList.add('agent-edit-review__column--before');
        const beforeLabel = doc.createElement('div');
        beforeLabel.classList.add('agent-edit-review__column-label');
        beforeLabel.textContent = 'Original';
        beforeCol.appendChild(beforeLabel);
        const beforeBody = doc.createElement('div');
        beforeBody.classList.add('agent-edit-review__column-body');
        beforeCol.appendChild(beforeBody);
        this.beforeColEl = beforeBody;
        cols.appendChild(beforeCol);

        const afterCol = doc.createElement('div');
        afterCol.classList.add('agent-edit-review__column');
        afterCol.classList.add('agent-edit-review__column--after');
        const afterLabel = doc.createElement('div');
        afterLabel.classList.add('agent-edit-review__column-label');
        const afterLabelText = doc.createElement('span');
        afterLabelText.textContent = this.mode === 'checkpoint' ? 'Snapshot' : 'Neu (klick rein und schreib einfach)';
        afterLabel.appendChild(afterLabelText);
        const stats = doc.createElement('span');
        stats.classList.add('agent-edit-review__stats');
        afterLabel.appendChild(stats);
        this.afterStatsEl = stats;
        afterCol.appendChild(afterLabel);

        const editor = doc.createElement('div');
        editor.classList.add('agent-edit-review__editor');
        if (this.mode === 'edit') {
            // plaintext-only avoids the browser inserting <div>/<br>
            // markup so textContent stays a clean newline-joined string.
            // Chromium (Electron / Obsidian) supports this; the read-only
            // checkpoint mode does not need it.
            editor.setAttribute('contenteditable', 'plaintext-only');
            editor.setAttribute('spellcheck', 'true');
        }
        editor.addEventListener('input', () => {
            const text = readEditorText(editor);
            this.files[this.currentIndex].workingContent = text;
            // Initial highlights are gone once the user types -- we keep
            // the stat counter live so they still see the change scope.
            this.refreshStats(this.files[this.currentIndex].entry.before, text);
        });
        afterCol.appendChild(editor);
        this.afterEditorEl = editor;
        cols.appendChild(afterCol);

        diff.appendChild(cols);
        main.appendChild(diff);
    }

    private buildFooter(root: HTMLElement, doc: Document): void {
        const footer = doc.createElement('div');
        footer.classList.add('agent-edit-review__footer');

        const discardBtn = doc.createElement('button');
        discardBtn.classList.add('agent-edit-review__discard-btn');
        discardBtn.setAttribute('type', 'button');
        discardBtn.textContent = 'Verwerfen';
        discardBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            this.handleDiscard();
        });
        footer.appendChild(discardBtn);

        if (this.mode === 'checkpoint') {
            const restoreBtn = doc.createElement('button');
            restoreBtn.classList.add('agent-edit-review__restore-btn');
            restoreBtn.classList.add('mod-cta');
            restoreBtn.setAttribute('type', 'button');
            restoreBtn.textContent = 'Wiederherstellen';
            restoreBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.handleRestore();
            });
            footer.appendChild(restoreBtn);
        } else {
            const applyBtn = doc.createElement('button');
            applyBtn.classList.add('agent-edit-review__apply-btn');
            applyBtn.classList.add('mod-cta');
            applyBtn.setAttribute('type', 'button');
            applyBtn.textContent = 'Anwenden';
            applyBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.handleApply();
            });
            footer.appendChild(applyBtn);
        }

        root.appendChild(footer);
    }

    private renderSelectedFile(): void {
        if (this.entries.length === 0) return;
        const file = this.files[this.currentIndex];

        if (this.filelistEl !== null) {
            const rows = this.filelistEl.children;
            for (let i = 0; i < rows.length; i += 1) {
                const child = rows[i] as HTMLElement;
                if (child.classList.contains('agent-edit-review__file') === false) continue;
                child.classList.toggle('is-selected', this.indexOfFileChild(child) === this.currentIndex);
                child.classList.toggle('is-skipped', this.files[this.indexOfFileChild(child)]?.skipped === true);
            }
        }

        if (this.diffPathEl !== null) {
            this.diffPathEl.textContent = file.entry.path;
        }

        if (this.beforeColEl !== null && this.afterEditorEl !== null) {
            this.renderAlignedDiff(this.beforeColEl, this.afterEditorEl, file.entry, file.workingContent);
        }

        this.refreshStats(file.entry.before, file.workingContent);

        if (this.skipBtnEl !== null) {
            this.skipBtnEl.classList.toggle('is-active', file.skipped);
            this.skipBtnEl.textContent = file.skipped ? 'Skippen aufheben' : 'Diese Datei skippen';
        }
    }

    private indexOfFileChild(child: HTMLElement): number {
        if (this.filelistEl === null) return -1;
        const items = Array.from(this.filelistEl.children).filter(
            (c) => (c as HTMLElement).classList.contains('agent-edit-review__file'),
        );
        return items.indexOf(child);
    }

    private renderAlignedDiff(
        beforeHost: HTMLElement,
        afterHost: HTMLElement,
        entry: EditReviewEntry,
        currentContent: string,
    ): void {
        const doc = this.containerEl.ownerDocument;
        while (beforeHost.firstChild !== null) beforeHost.removeChild(beforeHost.firstChild);
        while (afterHost.firstChild !== null) afterHost.removeChild(afterHost.firstChild);

        const aligned = buildAlignedDiff(entry.before, currentContent);
        if (aligned.left.length === 0) {
            const empty = doc.createElement('div');
            empty.classList.add('agent-edit-review__line');
            empty.textContent = '(leer)';
            beforeHost.appendChild(empty);
            const emptyR = doc.createElement('div');
            emptyR.classList.add('agent-edit-review__line');
            emptyR.textContent = ' ';
            afterHost.appendChild(emptyR);
            return;
        }
        for (let i = 0; i < aligned.left.length; i += 1) {
            beforeHost.appendChild(this.makeLineEl(doc, aligned.left[i], 'before'));
            afterHost.appendChild(this.makeLineEl(doc, aligned.right[i], 'after'));
        }
    }

    private makeLineEl(doc: Document, line: AlignedLine, side: 'before' | 'after'): HTMLElement {
        const el = doc.createElement('div');
        el.classList.add('agent-edit-review__line');
        if (line.type === 'removed') {
            el.classList.add('is-removed');
            el.classList.add('is-changed');
        } else if (line.type === 'added') {
            el.classList.add('is-added');
            el.classList.add('is-changed');
        } else if (line.type === 'padding') {
            el.classList.add('agent-edit-review__line--padding');
            // Padding rows are non-editable in the contenteditable host;
            // readEditorText additionally filters them out so they never
            // bleed back into the note.
            if (side === 'after') el.setAttribute('contenteditable', 'false');
        }

        // Line-number gutter (GitHub split-view style). Always rendered
        // so columns stay visually flush; padding rows leave the slot
        // empty. Carries the change-status icon as a leading hint so
        // non-tech users see "added / removed" at a glance.
        const gutter = doc.createElement('span');
        gutter.classList.add('agent-edit-review__lineno');
        if (side === 'after') gutter.setAttribute('contenteditable', 'false');
        gutter.textContent = line.lineNumber === null ? '' : String(line.lineNumber);
        el.appendChild(gutter);

        const status = doc.createElement('span');
        status.classList.add('agent-edit-review__line-status');
        if (side === 'after') status.setAttribute('contenteditable', 'false');
        if (line.type === 'added') status.textContent = '+';
        else if (line.type === 'removed') status.textContent = '−';
        else status.textContent = ' ';
        el.appendChild(status);

        const textEl = doc.createElement('span');
        textEl.classList.add('agent-edit-review__line-text');
        // Empty content -> single space so the line still has visible
        // height and Zeile N left stays aligned with Zeile N right.
        textEl.textContent = line.content.length === 0 ? ' ' : line.content;
        el.appendChild(textEl);

        return el;
    }

    private refreshStats(before: string, current: string): void {
        if (this.afterStatsEl === null) return;
        const lines = diffLines(before, current);
        let added = 0;
        let removed = 0;
        for (const l of lines) {
            if (l.type === 'added') added += 1;
            else if (l.type === 'removed') removed += 1;
        }
        if (added === 0 && removed === 0) {
            this.afterStatsEl.textContent = 'Unchanged';
            this.afterStatsEl.classList.remove('is-changed');
        } else {
            const parts: string[] = [];
            if (added > 0) parts.push(`+${added}`);
            if (removed > 0) parts.push(`−${removed}`);
            this.afterStatsEl.textContent = parts.join(' ');
            this.afterStatsEl.classList.add('is-changed');
        }
    }

    private toggleSkipCurrent(): void {
        const file = this.files[this.currentIndex];
        file.skipped = !file.skipped;
        this.renderSelectedFile();
    }

    private handleApply(): void {
        if (this.afterEditorEl !== null) {
            this.files[this.currentIndex].workingContent = readEditorText(this.afterEditorEl);
        }
        const decisions: EditReviewDecision[] = this.files.map((f) => ({
            path: f.entry.path,
            finalContent: f.workingContent,
            skipped: f.skipped,
        }));
        try {
            const result = this.onApply?.(decisions);
            if (result instanceof Promise) {
                void result.catch((e) => console.warn('[edit-review] onApply threw:', e));
            }
        } catch (e) {
            console.warn('[edit-review] onApply threw:', e);
        }
        this.close();
    }

    private handleDiscard(): void {
        try {
            this.onDiscard?.();
        } catch (e) {
            console.warn('[edit-review] onDiscard threw:', e);
        }
        this.close();
    }

    private handleRestore(): void {
        try {
            const result = this.onRestore?.();
            if (result instanceof Promise) {
                void result.catch((e) => console.warn('[edit-review] onRestore threw:', e));
            }
        } catch (e) {
            console.warn('[edit-review] onRestore threw:', e);
        }
        this.close();
    }
}

/**
 * Read the editable right-side content. The editor is a contenteditable
 * div with one line-div per source line. textContent would concatenate
 * "<div>A</div><div>B</div>" to "AB" without newlines -- so in real
 * browsers we prefer innerText which respects the rendered line breaks
 * the user sees. In the jsdom unit-test stub innerText is undefined; we
 * then fall back to joining direct-child textContent with '\n'. Padding
 * rows (rendered as visual filler when one side has fewer change lines)
 * are dropped so they never land in the note.
 */
function readEditorText(host: HTMLElement): string {
    const elementChildren = Array.from(host.children) as HTMLElement[];
    if (elementChildren.length > 0) {
        // Structured render: each child is a .agent-edit-review__line
        // with three spans inside (lineno gutter + status + line-text).
        // Read the text from the .agent-edit-review__line-text child if
        // present; fall back to the line element's textContent (and
        // strip the gutter+status prefix as a safety net).
        return elementChildren
            .filter((c) => c.classList.contains('agent-edit-review__line--padding') === false)
            .map((c) => {
                const textChild = (Array.from(c.children) as HTMLElement[])
                    .find((ch) => ch.classList.contains('agent-edit-review__line-text'));
                if (textChild !== undefined) return textChild.textContent ?? '';
                return c.textContent ?? '';
            })
            .join('\n');
    }
    // Flat text-node fallback (user wiped the structured render and
    // typed free-form). innerText respects rendered line breaks.
    const it = (host as HTMLElement & { innerText?: string }).innerText;
    if (typeof it === 'string') return it;
    return host.textContent ?? '';
}
