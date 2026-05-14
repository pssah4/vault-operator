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
                        this.rerender();
                    }),
                );

            // Threshold lives directly under Auto-extract because it only
            // makes sense in that context. Hidden when Auto is off.
            if (mem.autoExtractSessions) {
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
            }

            // Hint that the manual path is always available, even when auto is off.
            const manualHint = containerEl.createEl('div', { cls: 'agent-settings-hint' });
            manualHint.setText(t('settings.memory.manualAlwaysHint'));

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

            // ─── Cross-Surface Sync (BA-26 / FEAT-23-04) ──────────────
            this.buildCrossSurfaceSection(containerEl);

            // ─── Vault Operator's Soul (FEATURE-0319b L2 + L3) ─────────────────
            this.buildSoulSection(containerEl);

            // ─── Onboarding ──────────────────────────────────────────
            const memService = this.plugin.memoryService;
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
        containerEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: 'Cross-surface sync',
        });
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text:
                'External chat tools (ChatGPT, Claude.ai, Claude Code, Perplexity) can save '
                + 'conversations and facts into Vault Operator via the Remote MCP. Auto-sync triggers '
                + 'memory extraction immediately with the same thresholds as Vault Operator-internal '
                + 'conversations. Manual-sync parks conversations as pending until you confirm '
                + 'them in the History sidebar. ChatGPT and Perplexity default to manual to '
                + 'keep family-shared accounts out of personal memory.',
        });

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

        // Default sync-mode
        new Setting(containerEl)
            .setName('Default sync-mode')
            .setDesc('Used by providers whose per-provider override is set to "global".')
            .addDropdown((d) => {
                d.addOption('auto', 'Auto-sync');
                d.addOption('manual', 'Manual-sync');
                d.setValue(cs.defaultSyncMode);
                d.onChange(async (v) => {
                    cs.defaultSyncMode = v as SyncMode;
                    await this.plugin.saveSettings();
                });
            });

        // FIX-23-01-01: Living-Document default
        new Setting(containerEl)
            .setName('Living document by default')
            .setDesc(
                'When on (default), save_conversation calls within 30 minutes from the same source append to the existing conversation '
                + 'instead of creating a new one. Memory-extraction runs incrementally on the new turns. Turn off if you want every '
                + 'save_conversation call to start a fresh conversation.',
            )
            .addToggle((t) => {
                t.setValue(cs.livingDocumentByDefault ?? true);
                t.onChange(async (v) => {
                    cs.livingDocumentByDefault = v;
                    await this.plugin.saveSettings();
                });
            });

        // AUDIT-015 M-3: Cross-Source-ACL
        new Setting(containerEl)
            .setName('Strict source isolation (recall_memory + search_history)')
            .setDesc(
                'When on, every recall_memory and search_history MCP-call MUST pass an explicit source_interface argument, and reads are '
                + 'scoped to that source only. Use this to prevent ChatGPT/Perplexity connectors from reading conversations or facts that '
                + 'came from claude-ai/claude-code. Default off for backward compatibility.',
            )
            .addToggle((t) => {
                t.setValue(cs.strictSourceIsolation ?? false);
                t.onChange(async (v) => {
                    cs.strictSourceIsolation = v;
                    await this.plugin.saveSettings();
                });
            });

        // Per-provider overrides
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
                    d.addOption('auto', 'Auto-sync');
                    d.addOption('manual', 'Manual-sync');
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
        containerEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: 'Memory contents',
        });

        containerEl.createEl('p', {
            cls: 'agent-settings-paragraph',
            text: 'See what the agent remembers about you and how it knows itself. To add an entry, just say it in chat (for example: remember that emojis are unwanted). This view is for checking what is stored and removing entries you do not want.',
        });

        new Setting(containerEl)
            .setName('View memory')
            .setDesc('Browse user facts, agent soul, and capability snapshot. Soft-delete from here.')
            .addButton((b) => b
                .setButtonText('Open')
                .setCta()
                .onClick(async () => {
                    const { MemoryViewerModal } = await import('../modals/MemoryViewerModal');
                    new MemoryViewerModal(this.app, this.plugin).open();
                }));

        // Right-to-be-forgotten -- always available, two-step confirmation
        new Setting(containerEl)
            .setName('Delete all memory')
            .setDesc('Permanently removes every entry across user memory, agent soul, sessions, and the audit log. Requires a typed confirmation word.')
            .addButton((b) => b
                .setButtonText('Delete all')
                .setWarning()
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
        const banner = containerEl.createDiv('agent-settings-info-banner');
        const bannerText = banner.createDiv({ cls: 'agent-settings-info-text' });
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
                'You chose "Later" in the announcement. The upgrade is a one-time event -- ' +
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
