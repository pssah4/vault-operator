/**
 * InlineActionsTab -- Settings UI for Inline-Editor-AI-Actions (FEAT-33-01 TR-1.6, EPIC-33).
 *
 * Renders toggles + sliders for the inlineActions settings block.
 * The tab is registered as a sub-tab in AgentSettingsTab's advanced
 * area.
 *
 * Bot-Compliance: uses Obsidian Setting API + createDiv/createEl;
 * no innerHTML or direct style mutation.
 */

import { Setting, type App } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { resolveInlineActionsSettings } from '../../core/inline/inlineSettings';
import type { InlineActionsSettings } from '../../types/settings';

export class InlineActionsTab {
    constructor(private plugin: ObsidianAgentPlugin, private _app: App, private rerender: () => void) {}

    private getSettings(): InlineActionsSettings {
        if (this.plugin.settings.inlineActions === undefined) {
            this.plugin.settings.inlineActions = {};
        }
        return this.plugin.settings.inlineActions;
    }

    private async save(): Promise<void> {
        await this.plugin.saveSettings();
    }

    build(containerEl: HTMLElement): void {
        const intro = containerEl.createDiv('vault-op-box vault-op-box--intro');
        intro.createEl('strong', { text: 'Inline editor AI actions' });
        intro.createDiv({
            text: 'Run AI actions on a marked selection directly in the editor. Open via the inline-AI command (bind a hotkey in settings, e.g. Cmd+K).',
        });

        const settings = this.getSettings();
        const resolved = resolveInlineActionsSettings(settings);

        new Setting(containerEl)
            .setName('Inline editor AI actions enabled')
            .setDesc('Master toggle for the inline-menu, hotkey and command-palette entry.')
            .addToggle(t => t
                .setValue(resolved.enabled)
                .onChange(async (v) => { settings.enabled = v; await this.save(); }),
            );

        new Setting(containerEl)
            .setName('Show inline AI action icon on selection')
            .setDesc('Off by default. When on, a small icon appears next to a finished text selection. Click it to open the inline chat. The selection stays alive so copy and the format toolbar keep working in parallel. When off, only the hotkey or command-palette opens the chat.')
            .addToggle(t => t
                .setValue(resolved.floatingMenuEnabled)
                .onChange(async (v) => { settings.floatingMenuEnabled = v; await this.save(); }),
            );

        new Setting(containerEl)
            .setName('Use vault knowledge in lookup')
            .setDesc('Augment the lookup action with semantic-search hits from your vault.')
            .addToggle(t => t
                .setValue(resolved.vaultRagInLookup)
                .onChange(async (v) => { settings.vaultRagInLookup = v; await this.save(); }),
            );

        new Setting(containerEl)
            .setName('Vault knowledge confidence threshold')
            .setDesc('Cosine similarity 0 to 1. Lookup falls back to LLM-only when no vault hit meets this threshold.')
            .addSlider(s => s
                .setLimits(0, 1, 0.05)
                .setValue(resolved.vaultRagConfidenceThreshold)
                .setDynamicTooltip()
                .onChange(async (v) => { settings.vaultRagConfidenceThreshold = v; await this.save(); }),
            );

        new Setting(containerEl)
            .setName('Show vault source links in lookup tooltip')
            .setDesc('When on, the lookup preview block lists the wiki-links of the vault notes used.')
            .addToggle(t => t
                .setValue(resolved.showVaultSourcesInTooltip)
                .onChange(async (v) => { settings.showVaultSourcesInTooltip = v; await this.save(); }),
            );

        new Setting(containerEl)
            .setName('Inline chat display')
            .setDesc('How the inline chat panel mounts in the editor. Block widget is recommended for source and live-preview. Switch to the floating popover if you frequently work in reading view or prefer a floating panel.')
            .addDropdown(d => d
                .addOption('cm-block-widget', 'Block widget in editor (recommended)')
                .addOption('popover-overlay', 'Floating popover')
                .setValue(resolved.inlineChatDisplay)
                .onChange(async (v) => {
                    settings.inlineChatDisplay = v === 'popover-overlay' ? 'popover-overlay' : 'cm-block-widget';
                    await this.save();
                }),
            );

        new Setting(containerEl)
            .setName('Skills in floating menu (top N)')
            .setDesc('Maximum number of inline-eligible skills to list. Set to 0 to hide all skills.')
            .addText(t => t
                .setPlaceholder('10')
                .setValue(String(resolved.skillsTopN))
                .onChange(async (raw) => {
                    const n = Number.parseInt(raw, 10);
                    if (Number.isFinite(n) && n >= 0) {
                        settings.skillsTopN = n;
                        await this.save();
                    }
                }),
            );

        // Footer: rerender control + reload hint.
        const footer = containerEl.createDiv({ cls: 'setting-item-description' });
        footer.setText('Some changes (action registration) take effect after reloading the plugin.');
        new Setting(containerEl)
            .addButton(b => b.setButtonText('Refresh settings view').onClick(() => this.rerender()));
    }
}
