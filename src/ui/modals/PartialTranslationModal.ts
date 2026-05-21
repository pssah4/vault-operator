/**
 * PartialTranslationModal -- FEAT-29-08 Task D.
 *
 * Shown by the skill-translator builtin BEFORE writing a translated
 * skill when the dry-run pass produced status `partial` or
 * `unmappable`. The user gets a structured breakdown of which Python
 * modules and bash commands map cleanly, which only map partially
 * with limitations, and which cannot be translated at all. Two
 * buttons close the modal:
 *
 *   - Accept partial translation -> caller receives `accept`
 *   - Cancel + use skill-creator -> caller receives `cancel`
 *
 * Callers wire the result to the next step in the skill body:
 * accept triggers translate.js; cancel triggers invoke_skill
 * skill-creator with a from-scratch brief.
 */

import { App, Modal } from 'obsidian';

export type PartialTranslationDecision = 'accept' | 'cancel';

export interface DryRunMappableEntry {
    source: string;
    module: string;
    jsEquivalent: string | null;
    via: string;
}

export interface DryRunPartialEntry extends DryRunMappableEntry {
    limitations: string[];
}

export interface DryRunUnmappableEntry {
    source: string;
    module: string;
    reason: string;
}

export interface DryRunReport {
    status: 'full' | 'partial' | 'unmappable';
    mappable: DryRunMappableEntry[];
    partial: DryRunPartialEntry[];
    unmappable: DryRunUnmappableEntry[];
    summary: {
        totalImports: number;
        mappableCount: number;
        partialCount: number;
        unmappableCount: number;
    };
}

export class PartialTranslationModal extends Modal {
    constructor(
        app: App,
        private skillName: string,
        private report: DryRunReport,
        private onDecision: (decision: PartialTranslationDecision) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(
            this.report.status === 'unmappable'
                ? `Translation has unmappable parts: ${this.skillName}`
                : `Partial translation: ${this.skillName}`,
        );

        this.contentEl.empty();
        this.renderIntro();
        this.renderSummaryTable();
        if (this.report.partial.length > 0) this.renderPartialSection();
        if (this.report.unmappable.length > 0) this.renderUnmappableSection();
        this.renderButtons();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderIntro(): void {
        const p = this.contentEl.createEl('p', { cls: 'mod-muted' });
        const s = this.report.summary;
        p.setText(
            `${s.totalImports} imports analysed. `
            + `${s.mappableCount} map cleanly, ${s.partialCount} map with limitations, `
            + `${s.unmappableCount} cannot be translated.`,
        );
        const note = this.contentEl.createEl('p');
        note.setText(
            'You can accept the partial translation (limitations will be noted in TRANSLATION.json), '
            + 'or cancel and use the skill-creator to build an equivalent skill from scratch.',
        );
    }

    private renderSummaryTable(): void {
        const tbl = this.contentEl.createEl('table', { cls: 'partial-translation-table' });
        const head = tbl.createEl('thead').createEl('tr');
        ['Category', 'Count'].forEach((h) => {
            head.createEl('th', { text: h });
        });
        const body = tbl.createEl('tbody');
        const rows: Array<[string, number]> = [
            ['Mappable (clean)', this.report.summary.mappableCount],
            ['Partial (with limitations)', this.report.summary.partialCount],
            ['Unmappable', this.report.summary.unmappableCount],
        ];
        for (const [label, count] of rows) {
            const tr = body.createEl('tr');
            tr.createEl('td', { text: label });
            tr.createEl('td', { text: String(count) });
        }
    }

    private renderPartialSection(): void {
        this.contentEl.createEl('h4', { text: 'Partial mappings (limitations)', cls: 'partial-translation-heading' });
        const list = this.contentEl.createEl('ul');
        for (const entry of this.report.partial) {
            const li = list.createEl('li');
            li.createSpan({ text: `${entry.module} -> ${entry.jsEquivalent ?? '?'} (${entry.via})` });
            if (entry.limitations.length > 0) {
                const sub = li.createEl('ul');
                for (const lim of entry.limitations) {
                    sub.createEl('li', { text: lim, cls: 'mod-muted' });
                }
            }
        }
    }

    private renderUnmappableSection(): void {
        this.contentEl.createEl('h4', { text: 'Unmappable (no JavaScript equivalent)', cls: 'partial-translation-heading' });
        const list = this.contentEl.createEl('ul');
        for (const entry of this.report.unmappable) {
            const li = list.createEl('li');
            li.createSpan({ text: `${entry.module} (${entry.source})` });
            const reason = li.createEl('div', { cls: 'mod-muted partial-translation-reason' });
            reason.setText(entry.reason);
        }
    }

    private renderButtons(): void {
        const bar = this.contentEl.createDiv({ cls: 'modal-button-container partial-translation-button-bar' });

        const cancelBtn = bar.createEl('button', {
            text: 'Cancel and use skill-creator instead',
        });
        cancelBtn.addEventListener('click', () => {
            this.onDecision('cancel');
            this.close();
        });

        const acceptBtn = bar.createEl('button', {
            text: this.report.status === 'unmappable'
                ? 'Accept anyway (will skip unmappable parts)'
                : 'Accept partial translation',
            cls: 'mod-cta',
        });
        acceptBtn.addEventListener('click', () => {
            this.onDecision('accept');
            this.close();
        });
    }
}
