/**
 * PdfReindexHintModal -- IMP-06-01-01 follow-up to FIX-06-01-01.
 *
 * Surfaces a one-shot hint to users whose PDF embeddings were created
 * before v2.14.10 (when the parseDocument plugin-ref drift was fixed).
 * Those embeddings contain the "PDF Parser is not installed..."
 * placeholder string, which leaks into semantic-search results.
 *
 * Two flags on settings guard the lifecycle:
 *   _pdfReindexHintShown    -- modal has been displayed once; do not
 *                              re-open on every plugin load.
 *   _pdfReindexCompleted    -- user actually ran the reindex; only then
 *                              the EmbeddingsTab CTA disappears.
 *
 * The modal does NOT trigger the reindex itself -- it deep-links to the
 * Embeddings tab so the user reviews the action surface first.
 */

import { App, Modal, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';

export class PdfReindexHintModal extends Modal {
    constructor(app: App, private plugin: ObsidianAgentPlugin) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Reindex your PDFs' });

        const body = contentEl.createEl('p');
        body.appendText(
            'PDFs you indexed before v2.14.10 carry a "PDF Parser is not installed" placeholder '
            + 'in their embeddings, because of a bug fixed in that release. Semantic search results '
            + 'on those PDFs are noisy until the index is rebuilt.',
        );

        const body2 = contentEl.createEl('p');
        body2.appendText(
            'Open the Embeddings tab to run a one-shot "Reindex PDFs only" pass. Other file types '
            + 'are untouched. You can also dismiss this hint -- it will not be shown again.',
        );

        new Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText('Dismiss')
                .onClick(() => { void this.dismiss(); }))
            .addButton((btn) => btn
                .setButtonText('Open Embeddings tab')
                .setCta()
                .onClick(() => { void this.openEmbeddings(); }));
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async dismiss(): Promise<void> {
        this.plugin.settings._pdfReindexHintShown = true;
        await this.plugin.saveSettings();
        this.close();
    }

    private async openEmbeddings(): Promise<void> {
        this.plugin.settings._pdfReindexHintShown = true;
        await this.plugin.saveSettings();
        this.close();
        // Embeddings live under the providers tab. The user lands on
        // providers > embeddings; the CTA renders inline there.
        this.plugin.openSettingsAt('providers', 'embeddings');
    }
}
