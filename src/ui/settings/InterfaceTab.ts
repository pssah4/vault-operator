import { App, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { OnboardingService } from '../../core/memory/OnboardingService';
import { t } from '../../i18n';
import { addSectionHeading } from './utils';


export class InterfaceTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.interface.introTitle') });
        infoText.createDiv({ text: t('settings.interface.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        addSectionHeading(
            containerEl,
            t('settings.interface.headingSetup'),
            { body: t('settings.interface.sectionSetupInfo') },
        );

        if (this.plugin.memoryService) {
            const onboarding = new OnboardingService(this.plugin.memoryService, this.plugin);
            const isComplete = !onboarding.needsOnboarding();

            const setupSetting = new Setting(containerEl)
                .setName(t('settings.interface.guidedSetup'))
                .setDesc(
                    isComplete
                        ? t('settings.interface.setupCompleted')
                        : t('settings.interface.setupNotStarted'),
                );

            setupSetting.addButton((b) =>
                b.setButtonText(isComplete ? t('settings.interface.restartSetup') : t('settings.interface.startSetup')).setCta().onClick(async () => {
                    await onboarding.reset();
                    await this.plugin.startOnboarding();
                }),
            );

            if (!isComplete) {
                setupSetting.addButton((b) =>
                    b.setButtonText(t('settings.interface.skipSetup')).onClick(async () => {
                        await onboarding.markCompleted();
                        new Notice(t('settings.interface.setupSkipped'));
                        this.rerender();
                    }),
                );
            }
        } else {
            new Setting(containerEl)
                .setName(t('settings.interface.guidedSetup'))
                .setDesc(t('settings.interface.memoryNotAvailable'));
        }

        addSectionHeading(
            containerEl,
            t('settings.interface.headingInterface'),
            { body: t('settings.interface.sectionInterfaceInfo') },
        );
        new Setting(containerEl)
            .setName(t('settings.interface.autoAddActiveNote'))
            .setDesc(t('settings.interface.autoAddActiveNoteDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.autoAddActiveFileContext).onChange(async (v) => {
                    this.plugin.settings.autoAddActiveFileContext = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.sendWithEnter'))
            .setDesc(t('settings.interface.sendWithEnterDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.sendWithEnter ?? true).onChange(async (v) => {
                    this.plugin.settings.sendWithEnter = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.includeTime'))
            .setDesc(t('settings.interface.includeTimeDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.includeCurrentTimeInContext ?? false).onChange(async (v) => {
                    this.plugin.settings.includeCurrentTimeInContext = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.showContextProgress'))
            .setDesc(t('settings.interface.showContextProgressDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showContextProgress).onChange(async (value) => {
                    this.plugin.settings.showContextProgress = value;
                    await this.plugin.saveSettings();
                    new Notice(t('settings.interface.restartSidebarNotice'));
                })
            );

        addSectionHeading(
            containerEl,
            t('settings.interface.headingHistory'),
            { body: t('settings.interface.sectionHistoryInfo') },
        );

        new Setting(containerEl)
            .setName(t('settings.interface.historyFolder'))
            .setDesc(t('settings.interface.historyFolderDesc'))
            .addText((txt) =>
                txt.setPlaceholder(t('settings.interface.historyPlaceholder'))
                    .setValue((this.plugin.settings as unknown as Record<string, unknown>)['chatHistoryFolder'] as string ?? '')
                    .onChange(async (v) => {
                        const folder = v.trim();
                        (this.plugin.settings as unknown as Record<string, unknown>)['chatHistoryFolder'] = folder;
                        await this.plugin.saveSettings();
                        if (folder) {
                            const { ChatHistoryService } = await import('../../core/ChatHistoryService');
                            this.plugin.chatHistoryService = new ChatHistoryService(this.plugin.app.vault, folder);
                        } else {
                            this.plugin.chatHistoryService = null;
                        }
                    }),
            );

        addSectionHeading(
            containerEl,
            t('settings.interface.headingChatLinking'),
            { body: t('settings.interface.sectionChatLinkingInfo') },
        );

        const cl = this.plugin.settings.chatLinking;

        new Setting(containerEl)
            .setName(t('settings.interface.chatLinkingToggle'))
            .setDesc(t('settings.interface.chatLinkingToggleDesc'))
            .addToggle((tog) =>
                tog.setValue(cl.enabled).onChange(async (v) => {
                    this.plugin.settings.chatLinking.enabled = v;
                    await this.plugin.saveSettings();
                }),
            );

        // FEAT-24-08 Welle A follow-up (2026-05-18): the explicit
        // titling-model dropdown was removed. `getTitlingModel()` falls
        // back to the active provider's fast tier when no override is
        // set; the legacy `activeModels[]` it used to enumerate from is
        // empty after the EPIC-26 migration. The setting field
        // `chatLinking.titlingModelKey` is preserved as a data field.
    }

}
