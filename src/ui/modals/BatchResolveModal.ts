/**
 * BatchResolveModal -- bulk-apply for the Aging-knowledge tab
 * (IMP-20-06-01 W3-T3).
 *
 * Lets the user filter the verdict list by severity + min confidence
 * and then run a single bulk action (mark verified / delete) over the
 * surviving rows. Includes an Abort button that flips a cancellation
 * flag the loop checks between rows.
 *
 * Wayfinder entry: see `src/ARCHITECTURE.map`, row `batch-resolve-modal`.
 */

import { Modal, Notice, TFile } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type {
    AgingRow,
    AgingSeverity,
} from '../../core/health/AgingKnowledgeReader';

const ALL_SEVERITIES: AgingSeverity[] = ['critical', 'moderate', 'info'];

type BatchAction = 'mark-verified' | 'delete';

export interface BatchResolveModalOptions {
    onChange: () => void;
}

export class BatchResolveModal extends Modal {
    private readonly plugin: ObsidianAgentPlugin;
    private readonly rows: AgingRow[];
    private readonly opts: BatchResolveModalOptions;

    private selectedSeverities: Set<AgingSeverity> = new Set(['critical', 'moderate']);
    private minConfidence = 0;
    private action: BatchAction = 'mark-verified';
    private aborted = false;

    constructor(plugin: ObsidianAgentPlugin, rows: AgingRow[], opts: BatchResolveModalOptions) {
        super(plugin.app);
        this.plugin = plugin;
        this.rows = rows;
        this.opts = opts;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('batch-resolve-modal');

        contentEl.createEl('h3', { text: 'Batch resolve aging knowledge' });
        contentEl.createEl('p', { text: `${this.rows.length} rows in the current view.` });

        this.renderFilters(contentEl);
        const previewEl = contentEl.createDiv('batch-resolve-preview');
        const counterEl = contentEl.createDiv('batch-resolve-counter');

        const update = () => {
            const matched = this.filteredRows();
            previewEl.empty();
            previewEl.createEl('strong', { text: `Will affect ${matched.length} rows.` });
            counterEl.empty();
        };

        // Wire all filter changes to update the preview.
        contentEl.querySelectorAll('input').forEach((el) => {
            el.addEventListener('change', update);
        });
        contentEl.querySelectorAll('select').forEach((el) => {
            el.addEventListener('change', update);
        });
        update();

        const buttonRow = contentEl.createDiv('batch-resolve-actions');
        const runBtn = buttonRow.createEl('button', { text: 'Run' });
        const abortBtn = buttonRow.createEl('button', { text: 'Abort', cls: 'mod-warning' });
        abortBtn.disabled = true;

        runBtn.addEventListener('click', () => {
            void (async () => {
                const targets = this.filteredRows();
                // Audit M-1 mitigation: per-batch confirm for the
                // destructive action. Mark-verified stays one-click.
                if (this.action === 'delete') {
                    const ok = await this.confirmDestructive(
                        'Delete batch',
                        `Move ${targets.length} notes to the system trash?`,
                    );
                    if (!ok) return;
                }
                runBtn.disabled = true;
                abortBtn.disabled = false;
                await this.runBatch(targets, counterEl).finally(() => {
                    runBtn.disabled = false;
                    abortBtn.disabled = true;
                    update();
                });
            })();
        });
        abortBtn.addEventListener('click', () => {
            this.aborted = true;
        });
    }

    onClose(): void {
        this.aborted = true;
        this.contentEl.empty();
    }

    private renderFilters(parent: HTMLElement): void {
        const sevRow = parent.createDiv('batch-resolve-filter-row');
        sevRow.createEl('strong', { text: 'Severities' });
        for (const sev of ALL_SEVERITIES) {
            const label = sevRow.createEl('label', { cls: 'batch-resolve-filter-label' });
            const input = label.createEl('input', { type: 'checkbox' });
            input.checked = this.selectedSeverities.has(sev);
            input.addEventListener('change', () => {
                if (input.checked) this.selectedSeverities.add(sev);
                else this.selectedSeverities.delete(sev);
            });
            label.appendText(' ' + sev);
        }

        const confRow = parent.createDiv('batch-resolve-filter-row');
        confRow.createEl('strong', { text: 'Min confidence' });
        const confInput = confRow.createEl('input', { type: 'number' });
        confInput.value = '0';
        confInput.min = '0';
        confInput.max = '1';
        confInput.step = '0.05';
        confInput.addEventListener('change', () => {
            const parsed = parseFloat(confInput.value);
            this.minConfidence = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
        });

        const actionRow = parent.createDiv('batch-resolve-filter-row');
        actionRow.createEl('strong', { text: 'Action' });
        const select = actionRow.createEl('select');
        const optVerified = select.createEl('option', { text: 'Mark verified', value: 'mark-verified' });
        optVerified.selected = true;
        select.createEl('option', { text: 'Delete', value: 'delete' });
        select.addEventListener('change', () => {
            this.action = select.value as BatchAction;
        });
    }

    private filteredRows(): AgingRow[] {
        return this.rows.filter((r) => {
            if (!this.selectedSeverities.has(r.severity)) return false;
            if (r.confidence < this.minConfidence) return false;
            return true;
        });
    }

    private async runBatch(rows: AgingRow[], counterEl: HTMLElement): Promise<void> {
        this.aborted = false;
        let done = 0;
        let failed = 0;
        for (const row of rows) {
            if (this.aborted) break;
            try {
                if (this.action === 'mark-verified') {
                    await this.markVerifiedRow(row);
                } else {
                    await this.deleteRow(row);
                }
                done++;
            } catch (e) {
                console.debug('[BatchResolveModal] row failed', row.path, e);
                failed++;
            }
            counterEl.empty();
            counterEl.appendText(`Processed ${done}/${rows.length} (${failed} failed)`);
        }
        new Notice(`Batch complete: ${done} done, ${failed} failed${this.aborted ? ', aborted' : ''}`);
        this.opts.onChange();
    }

    private async markVerifiedRow(row: AgingRow): Promise<void> {
        const db = this.plugin.knowledgeDB?.getDB();
        if (!db) return;
        db.run(
            `INSERT OR REPLACE INTO dismissed_freshness (note_path, hint_type, dismissed_at)
             VALUES (?, 'verdict', ?)`,
            [row.path, new Date().toISOString()],
        );
        this.plugin.knowledgeDB?.markDirty();
    }

    private async deleteRow(row: AgingRow): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(row.path);
        if (!(file instanceof TFile)) return;
        await this.plugin.app.fileManager.trashFile(file);
    }

    private confirmDestructive(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new (class extends Modal {
                onOpen(): void {
                    const { contentEl } = this;
                    contentEl.createEl('h3', { text: title });
                    contentEl.createEl('p', { text: message });
                    const row = contentEl.createDiv('batch-resolve-confirm');
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
