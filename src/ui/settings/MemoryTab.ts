/**
 * MemoryTab — Settings sub-tab under Agent Behaviour
 *
 * Sections:
 * 1. Memory (master toggle, auto-extract toggles)
 * 2. Memory Model (dropdown from activeModels[])
 * 3. Extraction Threshold (slider 2-20)
 * 4. Chat History (enable toggle, clear button)
 * 5. Memory Files (stats, view, reset)
 */

import { App, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { getModelKey } from '../../types/settings';
import { OnboardingService } from '../../core/memory/OnboardingService';
import { t } from '../../i18n';
import { confirmModal } from '../modals/PromptModal';
import { FactStore } from '../../core/memory/FactStore';
import { CommunicationStyleStore } from '../../core/memory/CommunicationStyleStore';
import { MemoryAtomizer } from '../../core/memory/MemoryAtomizer';
import { MemoryMigrationJob, type MigrationReport } from '../../core/memory/MemoryMigrationJob';

export class MemoryTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('agent-settings-info-banner');
        const infoIcon = infoBanner.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'agent-settings-info-text' });
        infoText.createEl('strong', { text: t('settings.memory.introTitle') });
        infoText.createDiv({ text: t('settings.memory.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.memory.desc'),
        });

        // ─── Chat History ─────────────────────────────────────────────
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.memory.headingHistory') });

        new Setting(containerEl)
            .setName(t('settings.memory.enableHistory'))
            .setDesc(t('settings.memory.enableHistoryDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.enableChatHistory).onChange(async (v) => {
                    this.plugin.settings.enableChatHistory = v;
                    await this.plugin.saveSettings();
                }),
            );

        const store = this.plugin.conversationStore;
        if (store) {
            const count = store.count();
            new Setting(containerEl)
                .setName(t('settings.memory.storedConversations'))
                .setDesc(t('settings.memory.storedConversationsDesc', { count }))
                .addButton((b) =>
                    b.setButtonText(t('settings.memory.clearAll')).setWarning().onClick(async () => {
                        await store.deleteAll();
                        new Notice(t('settings.memory.allConversationsDeleted'));
                        this.rerender();
                    }),
                );
        }

        // ─── Memory ───────────────────────────────────────────────────
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.memory.headingMemory') });

        const mem = this.plugin.settings.memory;

        new Setting(containerEl)
            .setName(t('settings.memory.enableMemory'))
            .setDesc(t('settings.memory.enableMemoryDesc'))
            .addToggle((t) =>
                t.setValue(mem.enabled).onChange(async (v) => {
                    this.plugin.settings.memory.enabled = v;
                    await this.plugin.saveSettings();
                    this.rerender();
                }),
            );

        if (mem.enabled) {
            new Setting(containerEl)
                .setName(t('settings.memory.autoExtract'))
                .setDesc(t('settings.memory.autoExtractDesc'))
                .addToggle((t) =>
                    t.setValue(mem.autoExtractSessions).onChange(async (v) => {
                        this.plugin.settings.memory.autoExtractSessions = v;
                        await this.plugin.saveSettings();
                    }),
                );

            new Setting(containerEl)
                .setName(t('settings.memory.autoLongTerm'))
                .setDesc(t('settings.memory.autoLongTermDesc'))
                .addToggle((t) =>
                    t.setValue(mem.autoUpdateLongTerm).onChange(async (v) => {
                        this.plugin.settings.memory.autoUpdateLongTerm = v;
                        await this.plugin.saveSettings();
                    }),
                );

            // ─── Memory Model ─────────────────────────────────────────
            containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.memory.headingModel') });

            const models = this.plugin.settings.activeModels.filter((m) => m.enabled);
            const modelSetting = new Setting(containerEl)
                .setName(t('settings.memory.modelSelect'))
                .setDesc(t('settings.memory.modelSelectDesc'));

            if (models.length === 0) {
                modelSetting.setDesc(t('settings.memory.noModels'));
            }

            modelSetting.addDropdown((d) => {
                d.addOption('', t('settings.memory.selectModel'));
                for (const m of models) {
                    d.addOption(getModelKey(m), m.displayName ?? m.name);
                }
                d.setValue(mem.memoryModelKey);
                d.onChange(async (v) => {
                    this.plugin.settings.memory.memoryModelKey = v;
                    await this.plugin.saveSettings();
                });
            });

            // ─── Extraction Threshold ─────────────────────────────────
            containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.memory.headingThreshold') });

            new Setting(containerEl)
                .setName(t('settings.memory.minMessages'))
                .setDesc(t('settings.memory.minMessagesDesc'))
                .addSlider((s) =>
                    s
                        .setLimits(2, 20, 1)
                        .setValue(mem.extractionThreshold)
                        .setDynamicTooltip()
                        .onChange(async (v) => {
                            this.plugin.settings.memory.extractionThreshold = v;
                            await this.plugin.saveSettings();
                        }),
                );

            // ─── Memory Files ─────────────────────────────────────────
            containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.memory.headingFiles') });

            const memService = this.plugin.memoryService;
            if (memService) {
                void memService.getStats().then((stats) => {
                    const desc = [
                        t('settings.memory.statsFiles', { count: stats.fileCount }),
                        t('settings.memory.statsSessions', { count: stats.sessionCount }),
                    ];
                    if (stats.lastUpdated) {
                        desc.push(t('settings.memory.statsLastUpdated', { date: new Date(stats.lastUpdated).toLocaleDateString() }));
                    }
                    statsSetting.setDesc(desc.join(' | '));
                });
            }

            const statsSetting = new Setting(containerEl)
                .setName(t('settings.memory.memoryStorage'))
                .setDesc(t('settings.memory.memoryStorageLoading'))
                .addButton((b) =>
                    b.setButtonText(t('settings.memory.viewFiles')).onClick(() => {
                        if (memService) {
                            // Open the memory directory in Obsidian's file explorer
                            const dir = memService.getMemoryDir();
                            new Notice(t('settings.memory.memoryFilesLocation', { dir }));
                        }
                    }),
                )
                .addButton((b) =>
                    b.setButtonText(t('settings.memory.resetAll')).setWarning().onClick(async () => {
                        if (memService) {
                            await memService.resetAll();
                            new Notice(t('settings.memory.allMemoryReset'));
                            this.rerender();
                        }
                    }),
                );

            // ─── Onboarding ──────────────────────────────────────────
            containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.memory.headingOnboarding') });

            if (memService) {
                const onboarding = new OnboardingService(memService, this.plugin);
                const isComplete = !onboarding.needsOnboarding();

                const profileSetting = new Setting(containerEl)
                    .setName(t('settings.memory.userProfile'));

                if (!isComplete) {
                    profileSetting.setDesc(t('settings.memory.noProfile'));
                } else {
                    profileSetting.setDesc(t('settings.memory.profileActive'));
                }

                // Setup dialog controls
                const setupSetting = new Setting(containerEl)
                    .setName(t('settings.memory.setupDialog'))
                    .setDesc(
                        isComplete
                            ? t('settings.memory.setupCompleted')
                            : t('settings.memory.setupNotStarted'),
                    );

                setupSetting.addButton((b) =>
                    b.setButtonText(isComplete ? t('settings.memory.restartSetup') : t('settings.memory.startSetup')).setCta().onClick(async () => {
                        await onboarding.reset();
                        await this.plugin.startOnboarding();
                    }),
                );

                if (!isComplete) {
                    setupSetting.addButton((b) =>
                        b.setButtonText(t('settings.memory.skipSetup')).onClick(async () => {
                            await onboarding.markCompleted();
                            new Notice(t('settings.memory.setupSkipped'));
                            this.rerender();
                        }),
                    );
                }
            }
        }

        // ─── Memory v2 Migration (FEATURE-0316 / PLAN-005 task 7) ────────
        // Beta-only entry point. Atomises 5 of the 7 legacy memory MD files
        // into the v2 fact schema, soul.md into communication_styles, and
        // copies originals into memory-v1-backup/{ISO}/. Originals stay
        // untouched -- Phase 5 retires them after live verification.
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'Memory v2 Migration (Beta)' });
        const v2Setting = new Setting(containerEl)
            .setName('Migrate v1 memory to v2')
            .setDesc(
                'Atomises user-profile.md, projects.md, patterns.md, errors.md, custom-tools.md ' +
                'into the new fact schema. soul.md becomes a communication style. knowledge.md ' +
                'is left as a vault note. Originals are copied to memory-v1-backup/{timestamp}/.',
            );
        v2Setting.addButton((b) =>
            b.setButtonText('Migrate now').onClick(() => void this.runMemoryV2Migration(b.buttonEl)),
        );
    }

    private async runMemoryV2Migration(btn: HTMLButtonElement): Promise<void> {
        const memDB = this.plugin.memoryDB;
        const apiHandler = this.plugin.apiHandler;
        const fs = this.plugin.globalFs;
        if (!memDB?.isOpen() || !apiHandler || !fs) {
            new Notice('Memory v2 migration: memory DB, API handler, or file adapter not ready');
            return;
        }

        const ok = await confirmModal(this.app, {
            title: 'Migrate v1 memory to v2?',
            message:
                '5 markdown files will be sent through an LLM atomizer and stored as facts. ' +
                'soul.md becomes a default communication style. knowledge.md stays as is. ' +
                '\n\nOriginals are copied to memory-v1-backup/{timestamp}/. They are NOT deleted.',
            confirmLabel: 'Migrate',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;

        btn.setText('Migrating...');
        btn.disabled = true;
        const factStore = new FactStore(memDB);
        const styleStore = new CommunicationStyleStore(memDB);
        const atomizer = new MemoryAtomizer(apiHandler);
        const job = new MemoryMigrationJob(fs, factStore, styleStore, atomizer);

        const progressNotice = new Notice('Memory v2 migration in progress...', 0);
        try {
            const report = await job.run();
            progressNotice.hide();
            new Notice(formatReport(report), 12000);
            console.debug('[MemoryV2Migration] Report:', report);
        } catch (e) {
            progressNotice.hide();
            console.error('[MemoryV2Migration] Failed:', e);
            new Notice(`Memory v2 migration failed: ${(e as Error).message}`, 10000);
        } finally {
            btn.setText('Migrate now');
            btn.disabled = false;
            this.rerender();
        }
    }
}

function formatReport(report: MigrationReport): string {
    const lines = [
        `Memory v2 migration done.`,
        `Facts inserted: ${report.totalFactsInserted}.`,
        `Style rows: ${report.totalStylesInserted}.`,
        `Backup: ${report.backupFolder}`,
    ];
    return lines.join('\n');
}
