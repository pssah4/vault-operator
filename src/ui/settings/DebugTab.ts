import { App, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { DEFAULT_AGENT_FOLDER } from '../../core/utils/agentFolder';
import { t } from '../../i18n';


export class DebugTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('agent-settings-info-banner');
        const infoIcon = infoBanner.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'agent-settings-info-text' });
        infoText.createEl('strong', { text: t('settings.debug.introTitle') });
        infoText.createDiv({ text: t('settings.debug.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        new Setting(containerEl)
            .setName(t('settings.debug.debugMode'))
            .setDesc(t('settings.debug.debugModeDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.debugMode).onChange(async (v) => {
                    this.plugin.settings.debugMode = v;
                    await this.plugin.saveSettings();
                }),
            );

        // FEATURE-0507 / Issue #26: configurable agent folder.
        new Setting(containerEl)
            .setName(t('settings.debug.agentFolder'))
            .setDesc(t('settings.debug.agentFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_AGENT_FOLDER)
                    .setValue(this.plugin.settings.agentFolderPath ?? DEFAULT_AGENT_FOLDER)
                    .onChange(async (v) => {
                        const trimmed = v.trim();
                        this.plugin.settings.agentFolderPath = trimmed.length > 0 ? trimmed : DEFAULT_AGENT_FOLDER;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
