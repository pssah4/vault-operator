/**
 * EditReviewModal -- thin Obsidian-Modal wrapper around EditReviewPanel.
 *
 * The pure-logic UI lives in EditReviewPanel (tested in isolation). This file
 * only adapts the panel to the Obsidian Modal lifecycle: open with full-width
 * content area, close on apply/discard/restore.
 *
 * Two entry helpers keep call-sites short:
 *   - showEditReviewModal({app, entries, source}) for inline / agent post-task
 *   - showCheckpointReviewModal({app, entries, source, onRestore}) for read-only
 *
 * Bot-Compliance: no inline-style mutations beyond setProperty, no innerHTML.
 *
 * Related: EPIC-33 Diff-UX-refresh (User-Feedback 2026-06-22).
 */

import { Modal, setIcon, type App } from 'obsidian';
import { EditReviewPanel, type EditReviewEntry, type EditReviewDecision } from './EditReviewPanel';

export type { EditReviewEntry, EditReviewDecision } from './EditReviewPanel';

export interface ShowEditReviewArgs {
    app: App;
    entries: EditReviewEntry[];
    /** Source label shown in the header (e.g. "Inline-AI: Rewrite"). */
    source?: string;
    title?: string;
}

export interface EditReviewResult {
    /** Decisions provided by the user via Apply. null when user discarded. */
    decisions: EditReviewDecision[] | null;
}

/**
 * Open the edit-review modal and resolve once the user has applied or
 * discarded. Caller awaits the promise and applies the returned decisions
 * to disk.
 */
export function showEditReviewModal(args: ShowEditReviewArgs): Promise<EditReviewResult> {
    return new Promise((resolve) => {
        const modal = new EditReviewModal(args.app, {
            entries: args.entries,
            mode: 'edit',
            source: args.source,
            title: args.title,
            onApply: (decisions) => resolve({ decisions }),
            onDiscard: () => resolve({ decisions: null }),
        });
        modal.open();
    });
}

export interface ShowCheckpointReviewArgs {
    app: App;
    entries: EditReviewEntry[];
    source?: string;
    title?: string;
    onRestore: () => void | Promise<void>;
}

export function showCheckpointReviewModal(args: ShowCheckpointReviewArgs): void {
    const modal = new EditReviewModal(args.app, {
        entries: args.entries,
        mode: 'checkpoint',
        source: args.source,
        title: args.title,
        onRestore: args.onRestore,
    });
    modal.open();
}

interface EditReviewModalOptions {
    entries: EditReviewEntry[];
    mode: 'edit' | 'checkpoint';
    source?: string;
    title?: string;
    onApply?: (decisions: EditReviewDecision[]) => void;
    onDiscard?: () => void;
    onRestore?: () => void | Promise<void>;
}

class EditReviewModal extends Modal {
    private readonly opts: EditReviewModalOptions;
    private panel: EditReviewPanel | null = null;

    constructor(app: App, opts: EditReviewModalOptions) {
        super(app);
        this.opts = opts;
        this.modalEl.addClass('agent-edit-review-modal');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.panel = new EditReviewPanel({
            containerEl: contentEl,
            entries: this.opts.entries,
            mode: this.opts.mode,
            title: this.opts.title,
            sourceLabel: this.opts.source,
            setIcon: (el, name) => setIcon(el, name),
            onApply: (decisions) => {
                try { this.opts.onApply?.(decisions); } finally { this.close(); }
            },
            onDiscard: () => {
                try { this.opts.onDiscard?.(); } finally { this.close(); }
            },
            onRestore: () => {
                const r = this.opts.onRestore?.();
                if (r instanceof Promise) void r.catch((e) => console.warn('[edit-review-modal] onRestore threw:', e));
                this.close();
            },
        });
        this.panel.open();
    }

    onClose(): void {
        if (this.panel !== null) {
            this.panel.close();
            this.panel = null;
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}
