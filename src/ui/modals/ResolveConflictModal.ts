/**
 * ResolveConflictModal -- single-note resolve dialogue for the
 * Knowledge-review tab (IMP-20-06-01 W3-T2).
 *
 * Surfaces the verifier verdict for one note and offers four explicit
 * actions:
 *
 *   1. Mark verified  -- record a dismissal so the row is hidden until
 *      the next verifier run on this note.
 *   2. Open in chat   -- hand control to the agent sidebar with a
 *      pre-filled review prompt.
 *   3. Edit note      -- open the file in the active leaf.
 *   4. Delete note    -- trashFile via FileManager (review-bot safe).
 *
 * The Knowledge-review tab passes a callback for "refresh after action"
 * so the underlying list re-renders without re-opening the modal.
 *
 * Wayfinder entry: see `src/ARCHITECTURE.map`, row `resolve-conflict-modal`.
 */

import { Modal, Notice, TFile } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ReviewRow } from '../../core/health/KnowledgeReviewReader';
import type { VerdictLiteral } from '../../core/health/types';
import { VIEW_TYPE_AGENT_SIDEBAR } from '../AgentSidebarView';

const VERDICT_LABELS: Record<VerdictLiteral, string> = {
    matches: 'Matches sources',
    extends: 'Could extend',
    contradicts: 'Contradicted by sources',
    outdated: 'Outdated',
    no_external_source: 'No external evidence yet',
};

export interface ResolveConflictModalOptions {
    onChange: () => void;
}

export class ResolveConflictModal extends Modal {
    private readonly plugin: ObsidianAgentPlugin;
    private readonly row: ReviewRow;
    private readonly opts: ResolveConflictModalOptions;

    constructor(plugin: ObsidianAgentPlugin, row: ReviewRow, opts: ResolveConflictModalOptions) {
        super(plugin.app);
        this.plugin = plugin;
        this.row = row;
        this.opts = opts;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('resolve-conflict-modal');

        contentEl.createEl('h3', { text: 'Resolve knowledge issue' });
        contentEl.createEl('p', { text: this.row.path });

        const verdictLine = contentEl.createDiv('resolve-conflict-verdict');
        const label = VERDICT_LABELS[this.row.verdict] ?? this.row.verdict;
        verdictLine.createEl('strong', { text: label });
        verdictLine.appendText(` (confidence ${this.row.confidence.toFixed(2)}, ${this.row.verifierTier} tier)`);

        if (this.row.summary) {
            contentEl.createEl('p', { text: this.row.summary });
        }

        if (this.row.sources.length) {
            const ul = contentEl.createEl('ul');
            for (const url of this.row.sources) {
                const li = ul.createEl('li');
                li.createEl('a', { text: url, href: url });
            }
        }

        const buttonRow = contentEl.createDiv('resolve-conflict-actions');

        const markBtn = buttonRow.createEl('button', { text: 'Mark verified' });
        markBtn.addEventListener('click', () => { this.markVerified(); });

        const chatBtn = buttonRow.createEl('button', { text: 'Open in chat' });
        chatBtn.addEventListener('click', () => { void this.openInChat(); });

        const editBtn = buttonRow.createEl('button', { text: 'Edit note' });
        editBtn.addEventListener('click', () => { void this.editNote(); });

        const deleteBtn = buttonRow.createEl('button', { text: 'Delete note', cls: 'mod-warning' });
        deleteBtn.addEventListener('click', () => { void this.deleteNote(); });
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private markVerified(): void {
        const db = this.plugin.knowledgeDB?.getDB();
        if (!db) return;
        db.run(
            `INSERT OR REPLACE INTO dismissed_freshness (note_path, hint_type, dismissed_at)
             VALUES (?, 'verdict', ?)`,
            [this.row.path, new Date().toISOString()],
        );
        this.plugin.knowledgeDB?.markDirty();
        new Notice(`Marked ${this.row.path} as verified`);
        this.opts.onChange();
        this.close();
    }

    private async openInChat(): Promise<void> {
        const label = VERDICT_LABELS[this.row.verdict] ?? this.row.verdict;
        const prompt = `Help me review the note **${this.row.path}**. The freshness verifier flagged it as `
            + `**${label}** with confidence ${this.row.confidence.toFixed(2)}.\n\n`
            + `Summary: ${this.row.summary || '(none)'}\n\n`
            + `Sources:\n${this.row.sources.map((s) => `- ${s}`).join('\n') || '(none)'}`;

        const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
        if (!leaves.length) {
            const leaf = this.plugin.app.workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_AGENT_SIDEBAR, active: true });
        }

        new Notice('Review prompt prepared; opening chat');
        this.opts.onChange();
        this.close();
        // AUDIT-034 H-6: do NOT log the full prompt. It contains the
        // note path, verdict reasoning, and any URLs the agent extracted
        // from the file. The previous diagnostic line dumped all of
        // that to the renderer console, which is visible to any other
        // plugin running in the same Electron context. Keep a minimal
        // size-only marker for live debugging.
        console.debug('[ResolveConflictModal] chat prompt prepared', { length: prompt.length });
    }

    private async editNote(): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(this.row.path);
        if (!(file instanceof TFile)) {
            new Notice(`File not found: ${this.row.path}`);
            return;
        }
        const leaf = this.plugin.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        this.close();
    }

    private async deleteNote(): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(this.row.path);
        if (!(file instanceof TFile)) {
            new Notice(`File not found: ${this.row.path}`);
            return;
        }
        const confirmed = await this.confirmDestructive(
            'Delete note',
            `Move ${this.row.path} to the system trash?`,
        );
        if (!confirmed) return;
        await this.plugin.app.fileManager.trashFile(file);
        new Notice(`Moved ${this.row.path} to trash`);
        this.opts.onChange();
        this.close();
    }

    private confirmDestructive(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new (class extends Modal {
                onOpen(): void {
                    const { contentEl } = this;
                    contentEl.createEl('h3', { text: title });
                    contentEl.createEl('p', { text: message });
                    const row = contentEl.createDiv('resolve-conflict-confirm');
                    const cancel = row.createEl('button', { text: 'Cancel' });
                    const ok = row.createEl('button', { text: 'Delete', cls: 'mod-warning' });
                    cancel.addEventListener('click', () => { this.close(); resolve(false); });
                    ok.addEventListener('click', () => { this.close(); resolve(true); });
                }
                onClose(): void {
                    resolve(false);
                }
            })(this.plugin.app);
            modal.open();
        });
    }
}
