/**
 * PluginPatchModal -- Phase 3.
 *
 * Replaces the old auto-deploy path. When the agent has compiled a
 * proposed patch via `manage_source { action: "build" }`, the user
 * gets this modal: download the new main.js, replace the file in the
 * plugin folder manually, optionally reload the plugin. The plugin
 * never writes into its own folder, so the Obsidian review-bot's
 * "self-update" pattern does not trigger.
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';

export class PluginPatchModal extends Modal {
    constructor(
        app: App,
        private readonly plugin: ObsidianAgentPlugin,
        private readonly compiledJs: string,
        private readonly summary?: string,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-operator-wizard');
        this.modalEl.style.maxWidth = '680px';

        const header = contentEl.createDiv({ cls: 'wizard-header' });
        header.createEl('h2', { text: 'Apply self-development patch' });
        header.createDiv({
            cls: 'wizard-step-counter',
            text: `${Math.round(this.compiledJs.length / 1024)} KB compiled`,
        });

        const banner = contentEl.createDiv({ cls: 'wizard-info-banner' });
        const iconWrap = banner.createDiv({ cls: 'wizard-info-banner-icon' });
        setIcon(iconWrap, 'wrench');
        const text = banner.createDiv({ cls: 'wizard-info-banner-text' });
        text.createEl('strong', { text: 'You replace main.js manually' });
        text.createDiv({
            text: 'Obsidian plugins are not allowed to overwrite their own main.js at runtime. Download the new build below, drop it into your plugin folder, then reload.',
        });

        if (this.summary) {
            const sec = contentEl.createEl('h3', { cls: 'wizard-section', text: 'Patch summary' });
            sec.setText('What changed');
            const pre = contentEl.createEl('pre');
            pre.style.background = 'var(--background-secondary)';
            pre.style.padding = '10px 12px';
            pre.style.borderRadius = '4px';
            pre.style.maxHeight = '180px';
            pre.style.overflow = 'auto';
            pre.style.fontSize = '12px';
            pre.style.whiteSpace = 'pre-wrap';
            pre.setText(this.summary);
        }

        contentEl.createEl('h3', { cls: 'wizard-section', text: 'Apply the patch' });

        const steps = contentEl.createEl('ol');
        steps.style.paddingLeft = '20px';
        steps.style.lineHeight = '1.7';
        steps.style.margin = '4px 0 16px 0';

        const pluginPath = this.getPluginFolderPath();
        steps.createEl('li', { text: 'Click "Download main.js" below.' });
        const li2 = steps.createEl('li');
        li2.appendText('Replace the file at ');
        const code = li2.createEl('code', { text: pluginPath });
        code.style.fontSize = '12px';
        li2.appendText(' with the downloaded file.');
        steps.createEl('li', { text: 'Click "Reload plugin" to restart Vault Operator with the new code.' });

        const cautionWrap = contentEl.createDiv({ cls: 'wizard-skip-list' });
        cautionWrap.createEl('strong', { text: 'Safety net: ' });
        cautionWrap.createSpan({
            text: 'before you replace main.js, copy your current main.js to main.js.bak somewhere safe. If the patch breaks Vault Operator, restore that backup or reinstall via BRAT or the Community Plugins directory.',
        });

        const footer = contentEl.createDiv({ cls: 'wizard-footer' });
        const left = footer.createDiv({ cls: 'wizard-footer-left' });
        const right = footer.createDiv({ cls: 'wizard-footer-right' });

        const copyPathBtn = left.createEl('button', { text: 'Copy plugin folder path' });
        copyPathBtn.addEventListener('click', () => {
            void navigator.clipboard.writeText(this.getPluginFolderAbsolute()).then(() => {
                new Notice('Path copied to clipboard.');
            });
        });

        const downloadBtn = right.createEl('button', { cls: 'mod-cta', text: 'Download main.js' });
        downloadBtn.addEventListener('click', () => this.triggerDownload());

        const reloadBtn = right.createEl('button', { text: 'Reload plugin' });
        reloadBtn.addEventListener('click', () => { void this.reloadPlugin(); });

        const closeBtn = right.createEl('button', { text: 'Close' });
        closeBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private triggerDownload(): void {
        const blob = new Blob([this.compiledJs], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'main.js';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Free the blob after the click has flushed.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        new Notice('Downloaded. Replace main.js in the plugin folder, then click "Reload plugin".');
    }

    private getPluginFolderPath(): string {
        const configDir = this.plugin.app.vault.configDir;
        return `${configDir}/plugins/${this.plugin.manifest.id}/main.js`;
    }

    private getPluginFolderAbsolute(): string {
        const adapter = this.plugin.app.vault.adapter as { getBasePath?: () => string };
        const base = adapter.getBasePath?.() ?? '';
        return `${base}/${this.getPluginFolderPath()}`;
    }

    private async reloadPlugin(): Promise<void> {
        const id = this.plugin.manifest.id;
        const plugins = (this.plugin.app as unknown as Record<string, unknown>).plugins as
            { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> } | undefined;
        if (!plugins) {
            new Notice('Cannot access plugin manager. Reload Obsidian manually.');
            return;
        }
        try {
            await plugins.disablePlugin(id);
            await new Promise<void>((resolve) => setTimeout(resolve, 400));
            await plugins.enablePlugin(id);
            new Notice('Plugin reloaded.');
            this.close();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`Reload failed: ${msg}`);
        }
    }
}
