import { App, Modal, Notice, Setting } from 'obsidian';

/**
 * SoakReportModal -- shows the Memory v2 health snapshot as a JSON
 * blob that the user can copy to the chat for analysis.
 *
 * Background: the previous "copy to clipboard on command" path
 * silently failed when the sidebar didn't own the focus (browser
 * clipboard API rejects in that case, but our Notice was already
 * fired). A modal makes the copy a real user gesture and gives a
 * Save-to-vault fallback so the data is never lost.
 */
export class SoakReportModal extends Modal {
    constructor(
        app: App,
        private json: string,
        private saveToVault: () => Promise<string>,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('obsilo-soak-report-modal');

        contentEl.createEl('h3', { text: 'Memory soak report' });

        const desc = contentEl.createEl('p');
        desc.appendText(
            'Daily snapshot of Memory v2 health metrics. Copy the JSON ' +
            'and paste it into the agent chat for trend analysis.',
        );

        const ta = contentEl.createEl('textarea', {
            cls: 'obsilo-soak-report-textarea',
        });
        ta.value = this.json;
        ta.readOnly = true;
        ta.spellcheck = false;
        ta.rows = 18;
        // Auto-select on focus so a fast Cmd+A / Cmd+C still works.
        ta.addEventListener('focus', () => ta.select());

        new Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText('Copy to clipboard')
                .setCta()
                .onClick(async () => {
                    try {
                        await navigator.clipboard.writeText(this.json);
                        new Notice('Soak report copied. Paste into chat.');
                    } catch {
                        // Clipboard rejected (no focus, permission denied).
                        // The textarea is auto-selected on focus, so the
                        // user can still copy manually with Cmd/Ctrl+C, or
                        // use "Save to vault" instead.
                        ta.focus();
                        new Notice('Copy blocked -- select the text and press Cmd/Ctrl+C, or use Save to vault.');
                    }
                }))
            .addButton((btn) => btn
                .setButtonText('Save to vault')
                .onClick(async () => {
                    try {
                        const path = await this.saveToVault();
                        new Notice(`Soak report saved: ${path}`);
                    } catch (e) {
                        console.warn('[SoakReportModal] Save to vault failed:', e);
                        new Notice('Save to vault failed -- see console.');
                    }
                }))
            .addButton((btn) => btn
                .setButtonText('Close')
                .onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
