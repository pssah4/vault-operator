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
import { addSectionHeading, addSliderInput } from './utils';
import { confirmModal } from '../modals/PromptModal';
import { FactStore } from '../../core/memory/FactStore';
import { CommunicationStyleStore } from '../../core/memory/CommunicationStyleStore';
import { MemoryAtomizer } from '../../core/memory/MemoryAtomizer';
import {
    MemoryV2UpgradeOrchestrator,
    type UpgradeReport,
} from '../../core/memory/MemoryV2UpgradeOrchestrator';
import type { MigrationReport } from '../../core/memory/MemoryMigrationJob';
import {
    DEFAULT_CROSS_SURFACE_SETTINGS,
    SOURCE_INTERFACES,
    type SyncMode,
    type PerProviderSyncOverride,
    type SourceInterface,
} from '../../core/memory/SourceInterface';

export class MemoryTab {
    /**
     * Local UI state: which model the user picked for the v2 migration.
     * Defaults to the memory-model key on tab open. Reset on tab rebuild --
     * this is a one-shot decision, not worth persisting in plugin settings.
     */
    private migrationModelKey: string;

    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {
        this.migrationModelKey = plugin.settings.memory.memoryModelKey ?? '';
    }

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.memory.introTitle') });
        infoText.createDiv({ text: t('settings.memory.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        addSectionHeading(
            containerEl,
            t('settings.memory.headingHistory'),
            { body: t('settings.memory.sectionHistoryInfo') },
        );

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
                    b.setButtonText(t('settings.memory.clearAll')).onClick(async () => {
                        await store.deleteAll();
                        new Notice(t('settings.memory.allConversationsDeleted'));
                        this.rerender();
                    }),
                );
        }

        addSectionHeading(
            containerEl,
            t('settings.memory.headingMemory'),
            { body: t('settings.memory.sectionMemoryInfo') },
        );

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
                        this.rerender();
                    }),
                );

            // Threshold lives directly under Auto-extract because it only
            // makes sense in that context. Hidden when Auto is off.
            if (mem.autoExtractSessions) {
                const minMessagesSetting = new Setting(containerEl)
                    .setName(t('settings.memory.minMessages'))
                    .setDesc(t('settings.memory.minMessagesDesc'));
                addSliderInput(minMessagesSetting, {
                    min: 2, max: 20, step: 1,
                    value: mem.extractionThreshold,
                    onChange: async (v) => {
                        this.plugin.settings.memory.extractionThreshold = v;
                        await this.plugin.saveSettings();
                    },
                });
            }

            // FEAT-24-08 Welle A follow-up (2026-05-18): the explicit
            // memory-model dropdown was removed. `getMemoryModel()` falls
            // back to the active provider's fast tier when no override is
            // set; the legacy `activeModels[]` it used to enumerate from
            // is empty after the EPIC-26 migration. The setting field
            // `memory.memoryModelKey` is preserved for `update_settings`
            // power-user override.

            // ─── Cross-Surface Sync (BA-26 / FEAT-23-04) ──────────────
            this.buildCrossSurfaceSection(containerEl);

            // ─── Vault Operator's Soul (FEATURE-0319b L2 + L3) ─────────────────
            this.buildSoulSection(containerEl);

            // ─── Onboarding ──────────────────────────────────────────
            const memService = this.plugin.memoryService;
            addSectionHeading(
                containerEl,
                t('settings.memory.headingOnboarding'),
                { body: t('settings.memory.sectionOnboardingInfo') },
            );

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
                    b.setButtonText(isComplete ? t('settings.memory.restartSetup') : t('settings.memory.startSetup')).onClick(async () => {
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
        // Visible only when the user actually has something to do:
        // 'pending' (just upgraded, modal not yet decided) or 'skipped'
        // (clicked "Later" -- still offer the migration here).
        // Hidden for fresh installs ('not-applicable') and after the
        // migration finished ('completed') -- it is a one-time event.
        // The v1 backup folder remains accessible via Settings ->
        // Advanced -> Backups (category "memory-v1-backup").
        // The Memory v2 upgrade section is the only memory-engine UI now.
        // v2 is the default + only path; the previous engineVersion toggle
        // was removed because keeping v1 around as a user choice was
        // complexity for nostalgia, not value.
        const v2Status = this.plugin.settings.memory.v2MigrationStatus;
        if (v2Status === 'pending' || v2Status === 'skipped') {
            this.buildMemoryV2MigrationSection(containerEl);
        }
    }

    /**
     * BA-26 / FEAT-23-04: Cross-Surface Sync settings (global default
     * + per-provider override). Privacy-sichere Defaults: chatgpt +
     * perplexity + unknown auf manual.
     */
    private buildCrossSurfaceSection(containerEl: HTMLElement): void {
        // 2026-05-19: hide the dropdowns when there is no remote MCP
        // server active. Without a connector configured in the
        // Customize -> Connectors tab nothing can push conversations
        // into Vault Operator, so the settings would be inert and
        // confusing. Show a single info banner with a pointer instead.
        const remoteMcpEnabled = this.plugin.settings.enableMcpServer ?? false;
        if (!remoteMcpEnabled) {
            addSectionHeading(
                containerEl,
                t('settings.memory.headingCrossSurface'),
                { body: t('settings.memory.sectionCrossSurfaceInfo') },
            );
            const banner = containerEl.createDiv('vault-op-box vault-op-box--info');
            const icon = banner.createSpan({ cls: 'vault-op-box__icon' });
            setIcon(icon, 'info');
            const text = banner.createDiv({ cls: 'vault-op-box__text' });
            text.createEl('strong', { text: t('settings.memory.crossSurfaceInactiveTitle') });
            text.createDiv({ text: t('settings.memory.crossSurfaceInactiveBody') });
            return;
        }

        addSectionHeading(
            containerEl,
            t('settings.memory.headingCrossSurface'),
            { body: t('settings.memory.sectionCrossSurfaceInfo') },
            { inlineHint: t('settings.memory.crossSurfaceInlineHint') },
        );

        // Ensure settings block exists
        if (!this.plugin.settings.memory.crossSurface) {
            this.plugin.settings.memory.crossSurface = { ...DEFAULT_CROSS_SURFACE_SETTINGS };
        }
        const cs = this.plugin.settings.memory.crossSurface;
        // Defensive Init der Sub-Objekte (gleicher Bug-Klasse wie VaultTab
        // 2026-05-04: shallow Object.assign in loadSettings ueberschreibt
        // memory.crossSurface komplett wenn es im persistenten data.json
        // existiert, neue Felder fehlen dann.).
        if (!cs.perProvider) cs.perProvider = { ...DEFAULT_CROSS_SURFACE_SETTINGS.perProvider };
        if (cs.livingDocumentByDefault === undefined) cs.livingDocumentByDefault = true;
        if (cs.strictSourceIsolation === undefined) cs.strictSourceIsolation = false;
        if (!cs.defaultSyncMode) cs.defaultSyncMode = 'auto';

        new Setting(containerEl)
            .setName('Default handling for incoming conversations')
            .setDesc('Applied to providers whose per-source override below is set to use the default.')
            .addDropdown((d) => {
                d.addOption('auto', 'Extract immediately');
                d.addOption('manual', 'Park as pending');
                d.setValue(cs.defaultSyncMode);
                d.onChange(async (v) => {
                    cs.defaultSyncMode = v as SyncMode;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Living document by default')
            .setDesc(
                'When on (default), save_conversation calls from the same source within 30 minutes append to the existing conversation '
                + 'instead of starting a new one. Memory extraction then runs incrementally on the new turns. Turn off if you want '
                + 'every save_conversation call to create a fresh conversation.',
            )
            .addToggle((t) => {
                t.setValue(cs.livingDocumentByDefault ?? true);
                t.onChange(async (v) => {
                    cs.livingDocumentByDefault = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Strict source isolation for recall')
            .setDesc(
                'When on, every recall_memory and search_history MCP call must pass an explicit source_interface argument and reads '
                + 'are scoped to that source only. Use this to prevent the ChatGPT or Perplexity connectors from reading conversations '
                + 'or facts that came from Claude. Default off for backward compatibility.',
            )
            .addToggle((t) => {
                t.setValue(cs.strictSourceIsolation ?? false);
                t.onChange(async (v) => {
                    cs.strictSourceIsolation = v;
                    await this.plugin.saveSettings();
                });
            });

        // Per-source overrides
        const PROVIDER_LABELS: Record<SourceInterface, string> = {
            'obsilo': 'Vault Operator (internal)',
            'claude-ai': 'Claude.ai',
            'claude-code': 'Claude Code',
            'chatgpt': 'ChatGPT',
            'perplexity': 'Perplexity',
            'unknown': 'Unknown source',
        };
        for (const provider of SOURCE_INTERFACES) {
            new Setting(containerEl)
                .setName(PROVIDER_LABELS[provider])
                .addDropdown((d) => {
                    d.addOption('global', 'Use default');
                    d.addOption('auto', 'Extract immediately');
                    d.addOption('manual', 'Park as pending');
                    const current = cs.perProvider[provider] ?? 'global';
                    d.setValue(current);
                    d.onChange(async (v) => {
                        cs.perProvider[provider] = v as PerProviderSyncOverride;
                        await this.plugin.saveSettings();
                    });
                });
        }
    }

    private buildSoulSection(containerEl: HTMLElement): void {
        addSectionHeading(
            containerEl,
            t('settings.memory.headingContents'),
            { body: t('settings.memory.sectionContentsInfo') },
        );

        new Setting(containerEl)
            .setName(t('settings.memory.viewMemory'))
            .setDesc(t('settings.memory.viewMemoryDesc'))
            .addButton((b) => b
                .setButtonText(t('settings.memory.viewMemoryButton'))
                
                .onClick(async () => {
                    const { MemoryViewerModal } = await import('../modals/MemoryViewerModal');
                    new MemoryViewerModal(this.app, this.plugin).open();
                }));

        new Setting(containerEl)
            .setName(t('settings.memory.deleteAll'))
            .setDesc(t('settings.memory.deleteAllDesc'))
            .addButton((b) => b
                .setButtonText(t('settings.memory.deleteAllButton'))
                
                .onClick(async () => {
                    const { confirmAndWipeAllMemory } = await import('../modals/wipeAllMemory');
                    await confirmAndWipeAllMemory(this.app, this.plugin);
                    this.rerender();
                }));
    }

    private buildMemoryV2MigrationSection(containerEl: HTMLElement): void {
        const status = this.plugin.settings.memory.v2MigrationStatus;

        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'Vault Operator upgrade' });

        // Status banner -- different copy per pre-upgrade state.
        const banner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const bannerText = banner.createDiv({ cls: 'vault-op-box__text' });
        if (status === 'pending') {
            bannerText.createEl('strong', { text: 'Upgrade pending. ' });
            bannerText.appendText(
                'A short cascade brings your existing Vault Operator memory onto the new engine: ' +
                'atomise legacy memory files, seed topic centroids, refresh defaults. ' +
                'Originals are copied to memory-v1-backup/{timestamp}/ before any change.',
            );
        } else if (status === 'skipped') {
            bannerText.createEl('strong', { text: 'Upgrade skipped. ' });
            bannerText.appendText(
                'You chose "Later" in the announcement. The upgrade is a one-time event; ' +
                'once it runs, this section disappears.',
            );
        }

        // Model dropdown (BUG-031): the global chat provider can be on a
        // quota-limited tier (e.g. Copilot 402). The atomiser step is the
        // only LLM-heavy part of the cascade; let the user pick a model
        // that is known to have quota.
        const activeModels = this.plugin.settings.activeModels.filter(m => m.enabled);
        new Setting(containerEl)
            .setName('Atomiser model')
            .setDesc(
                'Used for the atomise-legacy-memory step. Haiku 4.5 is sufficient for ' +
                'typical memory MDs; Sonnet 4.6 if the source has dense compound prose. ' +
                'Defaults to your Memory Model.',
            )
            .addDropdown(d => {
                d.addOption('', 'Use the configured memory model');
                for (const m of activeModels) {
                    d.addOption(getModelKey(m), `${m.displayName ?? m.name} (${m.provider})`);
                }
                d.setValue(this.migrationModelKey);
                d.onChange((v) => { this.migrationModelKey = v; });
            });

        const upgradeSetting = new Setting(containerEl)
            .setName('Run upgrade')
            .setDesc(
                'Runs the full upgrade cascade in one go. Backups are written before any ' +
                'change. This section disappears after a successful run; backups stay ' +
                'accessible under Settings → Advanced → Backups.',
            );
        upgradeSetting.addButton((b) =>
            b.setButtonText('Upgrade now')
                .onClick(() => void this.runMemoryV2Migration(b.buttonEl)),
        );
    }

    private async runMemoryV2Migration(btn: HTMLButtonElement): Promise<void> {
        const memDB = this.plugin.memoryDB;
        const fs = this.plugin.globalFs;
        const embeddingService = this.plugin.embeddingService;
        if (!memDB?.isOpen() || !fs || !embeddingService) {
            new Notice('Memory upgrade: memory database, file adapter, or embedding service not ready');
            return;
        }

        // Atomiser uses an independent model selection (BUG-031, 2026-04-28).
        // Falls back to the memory model, then the global chat provider.
        const selectedKey = this.migrationModelKey;
        const candidate = selectedKey
            ? this.plugin.settings.activeModels.find(m => getModelKey(m) === selectedKey && m.enabled)
            : null;
        const fallback = this.plugin.getMemoryModel();
        const chosen = candidate ?? fallback;

        let atomizerApi = this.plugin.apiHandler;
        let providerLabel = 'global chat provider';
        if (chosen) {
            const { buildApiHandlerForModel } = await import('../../api/index');
            atomizerApi = buildApiHandlerForModel(chosen);
            providerLabel = `${chosen.displayName ?? chosen.name} (${chosen.provider})`;
        }
        if (!atomizerApi) {
            new Notice(
                'Vault Operator upgrade: no API handler available for the atomiser step. ' +
                'Pick a model in the dropdown above or under Settings → Memory → Memory Model.',
                10000,
            );
            return;
        }

        const ok = await confirmModal(this.app, {
            title: 'Run Vault Operator upgrade?',
            message:
                `Atomiser provider: ${providerLabel}\n\n` +
                'Cascade steps:\n' +
                '  1. Atomise legacy memory files into the new fact schema\n' +
                '  2. Seed topic centroids so context locks instantly\n' +
                '  3. Refresh release-specific settings defaults\n\n' +
                'Originals are copied to memory-v1-backup/{timestamp}/. They are NOT deleted.',
            confirmLabel: 'Upgrade',
            cancelLabel: 'Cancel',
        });
        if (!ok) return;

        btn.setText('Upgrading...');
        btn.disabled = true;
        const factStore = new FactStore(memDB);
        const styleStore = new CommunicationStyleStore(memDB);
        const atomizer = new MemoryAtomizer(atomizerApi);
        const orchestrator = new MemoryV2UpgradeOrchestrator();

        const progressNotice = new Notice('Vault Operator upgrade running...', 0);
        try {
            const report = await orchestrator.run({
                fs, factStore, styleStore, atomizer, embeddingService,
                memoryDB: memDB,
                onProgress: (msg) => progressNotice.setMessage(`Vault Operator upgrade: ${msg}`),
            });
            progressNotice.hide();

            if (report.aborted) {
                const failed = report.steps.find(s => !s.ok);
                new Notice(`Vault Operator upgrade aborted: ${failed?.error ?? 'unknown error'}`, 12000);
                console.error('[VaultOperatorUpgrade] Aborted:', report);
                return;
            }

            new Notice(formatReport(report), 14000);
            console.debug('[VaultOperatorUpgrade] Report:', report);

            // Persist outcome from the migration step so the settings banner
            // switches state and the modal stops appearing on next load.
            const migrationReport = MemoryV2UpgradeOrchestrator.findMigrationReport(report);
            if (migrationReport) {
                this.plugin.settings.memory.v2MigrationStatus = 'completed';
                this.plugin.settings.memory.v2MigrationReport = {
                    completedAt: migrationReport.timestamp,
                    factsInserted: migrationReport.totalFactsInserted,
                    stylesInserted: migrationReport.totalStylesInserted,
                    backupFolder: migrationReport.backupFolder,
                };
                await this.plugin.saveSettings();
            }
        } catch (e) {
            progressNotice.hide();
            console.error('[VaultOperatorUpgrade] Failed:', e);
            new Notice(`Vault Operator upgrade failed: ${(e as Error).message}`, 10000);
        } finally {
            btn.setText('Upgrade now');
            btn.disabled = false;
            this.rerender();
        }
    }
}

function formatReport(report: UpgradeReport): string {
    const lines = ['Vault Operator upgrade done.'];
    for (const step of report.steps) {
        const tag = step.skipped ? 'skipped' : step.ok ? 'ok' : 'failed';
        lines.push(`  ${step.label}: ${tag}${step.detail ? ` -- ${step.detail}` : ''}`);
    }
    return lines.join('\n');
}

// Re-export for legacy callers (kept for type imports until Phase 4 cleanup).
export type { MigrationReport };
