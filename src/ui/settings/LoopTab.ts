import { App, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { addInfoButton } from './utils';

export class LoopTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('agent-settings-info-banner');
        const infoIcon = infoBanner.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'agent-settings-info-text' });
        infoText.createEl('strong', { text: t('settings.loop.introTitle') });
        infoText.createDiv({ text: t('settings.loop.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.loop.desc'),
        });

        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.loop.headingLoop') });

        new Setting(containerEl)
            .setName(t('settings.loop.errorLimit'))
            .setDesc(t('settings.loop.errorLimitDesc'))
            .addText((t) =>
                t
                    .setValue(String(this.plugin.settings.advancedApi.consecutiveMistakeLimit))
                    .onChange(async (v) => {
                        const n = parseInt(v);
                        if (!isNaN(n) && n >= 0) {
                            this.plugin.settings.advancedApi.consecutiveMistakeLimit = n;
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.loop.rateLimit'))
            .setDesc(t('settings.loop.rateLimitDesc'))
            .addText((t) =>
                t
                    .setValue(String(this.plugin.settings.advancedApi.rateLimitMs))
                    .onChange(async (v) => {
                        const n = parseInt(v);
                        if (!isNaN(n) && n >= 0) {
                            this.plugin.settings.advancedApi.rateLimitMs = n;
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.loop.headingCondensing') });

        const condensingSetting = new Setting(containerEl)
            .setName(t('settings.loop.enableCondensing'))
            .setDesc(t('settings.loop.enableCondensingDesc'));
        addInfoButton(condensingSetting, this.app, t('settings.loop.infoCondensingTitle'), t('settings.loop.infoCondensingBody'));
        condensingSetting.addToggle((t) =>
            t.setValue(this.plugin.settings.advancedApi.condensingEnabled ?? false).onChange(async (v) => {
                this.plugin.settings.advancedApi.condensingEnabled = v;
                await this.plugin.saveSettings();
                thresholdSetting.settingEl.classList.toggle('agent-u-hidden', !v);
            }),
        );

        const thresholdSetting = new Setting(containerEl)
            .setName(t('settings.loop.condensingThreshold'))
            .setDesc(t('settings.loop.condensingThresholdDesc'))
            .addSlider((s) =>
                s
                    .setLimits(50, 95, 5)
                    .setValue(this.plugin.settings.advancedApi.condensingThreshold ?? 80)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                        this.plugin.settings.advancedApi.condensingThreshold = v;
                        await this.plugin.saveSettings();
                    }),
            );
        thresholdSetting.settingEl.classList.toggle('agent-u-hidden',
            !(this.plugin.settings.advancedApi.condensingEnabled ?? false));

        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.loop.headingPowerSteering') });

        const powerSteeringSetting = new Setting(containerEl)
            .setName(t('settings.loop.powerSteeringFreq'))
            .setDesc(t('settings.loop.powerSteeringFreqDesc'));
        addInfoButton(powerSteeringSetting, this.app, t('settings.loop.infoPowerSteeringTitle'), t('settings.loop.infoPowerSteeringBody'));
        powerSteeringSetting.addText((t) =>
            t
                .setValue(String(this.plugin.settings.advancedApi.powerSteeringFrequency ?? 0))
                .onChange(async (v) => {
                    const n = parseInt(v);
                    if (!isNaN(n) && n >= 0) {
                        this.plugin.settings.advancedApi.powerSteeringFrequency = n;
                        await this.plugin.saveSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.loop.maxIterations'))
            .setDesc(t('settings.loop.maxIterationsDesc'))
            .addSlider((s) =>
                s
                    .setLimits(5, 50, 5)
                    .setValue(this.plugin.settings.advancedApi.maxIterations ?? 25)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                        this.plugin.settings.advancedApi.maxIterations = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.loop.maxSubtaskDepth'))
            .setDesc(t('settings.loop.maxSubtaskDepthDesc'))
            .addSlider((s) =>
                s
                    .setLimits(1, 3, 1)
                    .setValue(this.plugin.settings.advancedApi.maxSubtaskDepth ?? 2)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                        this.plugin.settings.advancedApi.maxSubtaskDepth = v;
                        await this.plugin.saveSettings();
                    }),
            );

        // FEAT-24-08 Welle A follow-up (2026-05-18): the explicit
        // Helper-Model dropdown was removed. Since Welle A the resolver
        // `getHelperModel()` falls back to the active provider's `fast`
        // tier when no override is set, and the UI dropdown only listed
        // entries from the legacy `activeModels[]` which is empty after
        // the EPIC-26 migration. The underlying `helperModelKey` setting
        // is preserved as a data field so power users can still set an
        // explicit override via `update_settings` if they want.
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.loop.headingHelperModel') });

        // v2.10.0: TaskRouter toggle. When enabled, simple tool tasks
        // (create xlsx/docx/pptx, read or write one file) route to the
        // active provider's fast tier (the helper slot) instead of the
        // main loop model. Research and multi-step prompts stay on the
        // main model. The router escalates back to main on >= 2 consecutive
        // tool errors so a weaker model never gets stuck.
        new Setting(containerEl)
            .setName(t('settings.loop.autoTaskRouterName'))
            .setDesc(t('settings.loop.autoTaskRouterDesc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoTaskRouter?.enabled ?? true)
                    .onChange(async (v) => {
                        this.plugin.settings.autoTaskRouter = { enabled: v };
                        await this.plugin.saveSettings();
                    }),
            );
    }

}
