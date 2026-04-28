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

            // ─── Extraction Threshold (only relevant when Auto is on) ───
            if (mem.autoExtractSessions) {
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
            }

            // ─── Obsilo's Soul (FEATURE-0319b L2 + L3) ─────────────────
            this.buildSoulSection(containerEl);

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

    private buildSoulSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: 'Obsilo’s soul',
        });

        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) {
            containerEl.createEl('p', {
                cls: 'agent-settings-hint',
                text: 'Memory database not open. Open the plugin once to initialize, then return here.',
            });
            return;
        }

        const intro = containerEl.createDiv({ cls: 'agent-settings-hint' });
        intro.setText(
            'Curated values, anti-patterns, identity and communication style. ' +
            'Surfaces in every conversation’s system prompt (top-3 per category, ranked by importance). ' +
            'You can also instruct Obsilo directly in chat -- the agent uses update_soul to persist your guidance.',
        );

        // Legacy soul.md import (one-time migration)
        const importRow = containerEl.createDiv({ cls: 'agent-settings-soul-import' });
        const importBtn = importRow.createEl('button', { text: 'Import legacy soul.md' });
        importBtn.addEventListener('click', () => { void this.importLegacySoulMd(); });
        importRow.createSpan({
            cls: 'agent-settings-hint',
            text: 'Idempotent — re-running won’t create duplicates.',
        });

        void (async () => {
            const { SoulView } = await import('../../core/memory/SoulView');
            const view = new SoulView(memDB);
            const snapshot = view.snapshot();
            this.renderSoulCategory(containerEl, 'Identity', 'identity', snapshot.identity);
            this.renderSoulCategory(containerEl, 'Values', 'value', snapshot.values);
            this.renderSoulCategory(containerEl, 'Anti-Patterns', 'anti_pattern', snapshot.antiPatterns);
            this.renderSoulCategory(containerEl, 'Communication', 'communication', snapshot.communication);

            // Read-only capability snapshot (L3) -- diagnostic.
            const caps = view.getCapabilities();
            const capWrap = containerEl.createDiv({ cls: 'agent-settings-soul-caps' });
            const capHeader = capWrap.createEl('details');
            capHeader.createEl('summary', {
                text: `Capabilities snapshot (${caps.length} entries, auto-synced)`,
            });
            const capList = capHeader.createEl('ul', { cls: 'agent-settings-soul-cap-list' });
            for (const c of caps) {
                capList.createEl('li').setText(c.text);
            }
        })().catch(e => console.warn('[MemoryTab] soul section render failed:', e));
    }

    private renderSoulCategory(
        containerEl: HTMLElement,
        label: string,
        category: 'value' | 'anti_pattern' | 'identity' | 'communication',
        facts: Array<{ id: number; text: string; importance: number }>,
    ): void {
        const block = containerEl.createDiv({ cls: 'agent-settings-soul-block' });
        const header = block.createDiv({ cls: 'agent-settings-soul-header' });
        header.createEl('h4', { text: label });
        const addBtn = header.createEl('button', {
            text: '+',
            attr: { 'aria-label': `Add ${label} entry` },
        });
        addBtn.addEventListener('click', () => { void this.promptAddSoulEntry(category, label); });

        if (facts.length === 0) {
            block.createDiv({ cls: 'agent-settings-soul-empty', text: '(empty)' });
            return;
        }
        const list = block.createEl('ul', { cls: 'agent-settings-soul-list' });
        for (const f of facts) {
            const item = list.createEl('li');
            item.createSpan({ cls: 'agent-settings-soul-text', text: f.text });
            const removeBtn = item.createEl('button', {
                cls: 'agent-settings-soul-remove',
                text: 'remove',
            });
            removeBtn.addEventListener('click', () => { void this.removeSoulEntry(f.id, label); });
        }
    }

    private async promptAddSoulEntry(
        category: 'value' | 'anti_pattern' | 'identity' | 'communication',
        label: string,
    ): Promise<void> {
        const { promptModal } = await import('../modals/PromptModal');
        const text = await promptModal(this.app, {
            title: `Add ${label} entry`,
            message: 'Single self-contained statement (max ~120 chars).',
            placeholder: 'e.g. "Avoid filler phrases"',
            submitLabel: 'Add',
        });
        if (!text || !text.trim()) return;
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) {
            new Notice('Memory database not open.');
            return;
        }
        const { OBSILO_PROFILE } = await import('../../core/memory/SoulView');
        const factStore = new FactStore(memDB);
        factStore.insert({
            text: text.trim(),
            topics: ['soul', category],
            kind: 'identity',
            importance: 0.7,
            profileId: OBSILO_PROFILE,
            sourceInterface: 'obsilo-self',
        });
        await memDB.save().catch(() => undefined);
        this.rerender();
    }

    /**
     * One-time importer: parses the legacy memory/soul.md (OpenClaw-style
     * structure with `## Name`, `## Communication`, `## Values`,
     * `## Anti-Patterns`, `## Identity`) into L2 facts. Bullet items become
     * single facts. Idempotent via duplicate-text check on insert.
     */
    private async importLegacySoulMd(): Promise<void> {
        const memSvc = this.plugin.memoryService;
        const memDB = this.plugin.memoryDB;
        if (!memSvc || !memDB?.isOpen()) {
            new Notice('Memory not initialised.');
            return;
        }
        const content = await memSvc.readFile('soul.md').catch(() => '');
        if (!content || content.trim().length === 0) {
            new Notice('No soul.md found.');
            return;
        }
        const sections = parseSoulSections(content);
        const { OBSILO_PROFILE, SoulView } = await import('../../core/memory/SoulView');
        const view = new SoulView(memDB);
        const factStore = new FactStore(memDB);
        const existingTexts = new Set<string>();
        for (const f of view.snapshot().identity) existingTexts.add(f.text);
        for (const f of view.snapshot().values) existingTexts.add(f.text);
        for (const f of view.snapshot().antiPatterns) existingTexts.add(f.text);
        for (const f of view.snapshot().communication) existingTexts.add(f.text);

        let inserted = 0;
        const insertCategory = (cat: 'identity' | 'value' | 'anti_pattern' | 'communication', items: string[]) => {
            for (const item of items) {
                if (!item.trim() || existingTexts.has(item.trim())) continue;
                factStore.insert({
                    text: item.trim(),
                    topics: ['soul', cat],
                    kind: 'identity',
                    importance: 0.7,
                    profileId: OBSILO_PROFILE,
                    sourceInterface: 'obsilo-self',
                    metadata: { migratedFrom: 'soul.md' },
                });
                inserted += 1;
            }
        };
        insertCategory('identity', sections.identity);
        insertCategory('value', sections.values);
        insertCategory('anti_pattern', sections.antiPatterns);
        insertCategory('communication', sections.communication);

        await memDB.save().catch(() => undefined);
        new Notice(`Imported ${inserted} soul entries from soul.md`);
        this.rerender();
    }

    private async removeSoulEntry(factId: number, label: string): Promise<void> {
        const ok = await confirmModal(this.app, {
            title: `Remove ${label} entry`,
            message: 'This deprecates the entry (soft-delete). The audit trail keeps it for recovery.',
            confirmLabel: 'Remove',
            cancelLabel: 'Cancel',
            destructive: true,
        });
        if (!ok) return;
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) return;
        const factStore = new FactStore(memDB);
        factStore.deprecate(factId, 'removed by user via settings UI');
        await memDB.save().catch(() => undefined);
        this.rerender();
    }

    private buildMemoryV2MigrationSection(containerEl: HTMLElement): void {
        const status = this.plugin.settings.memory.v2MigrationStatus;

        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'Obsilo upgrade' });

        // Status banner -- different copy per pre-upgrade state.
        const banner = containerEl.createDiv('agent-settings-info-banner');
        const bannerText = banner.createDiv({ cls: 'agent-settings-info-text' });
        if (status === 'pending') {
            bannerText.createEl('strong', { text: 'Upgrade pending. ' });
            bannerText.appendText(
                'A short cascade brings your existing Obsilo memory onto the new engine: ' +
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
                d.addOption('', '(use Memory Model)');
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
            new Notice('Obsilo upgrade: memory DB, file adapter, or embedding service not ready');
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
                'Obsilo upgrade: no API handler available for the atomiser step. ' +
                'Pick a model in the dropdown above or under Settings → Memory → Memory Model.',
                10000,
            );
            return;
        }

        const ok = await confirmModal(this.app, {
            title: 'Run Obsilo upgrade?',
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

        const progressNotice = new Notice('Obsilo upgrade running...', 0);
        try {
            const report = await orchestrator.run({
                fs, factStore, styleStore, atomizer, embeddingService,
                memoryDB: memDB,
                onProgress: (msg) => progressNotice.setMessage(`Obsilo upgrade: ${msg}`),
            });
            progressNotice.hide();

            if (report.aborted) {
                const failed = report.steps.find(s => !s.ok);
                new Notice(`Obsilo upgrade aborted: ${failed?.error ?? 'unknown error'}`, 12000);
                console.error('[ObsiloUpgrade] Aborted:', report);
                return;
            }

            new Notice(formatReport(report), 14000);
            console.debug('[ObsiloUpgrade] Report:', report);

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
            console.error('[ObsiloUpgrade] Failed:', e);
            new Notice(`Obsilo upgrade failed: ${(e as Error).message}`, 10000);
        } finally {
            btn.setText('Upgrade now');
            btn.disabled = false;
            this.rerender();
        }
    }
}

function formatReport(report: UpgradeReport): string {
    const lines = ['Obsilo upgrade done.'];
    for (const step of report.steps) {
        const tag = step.skipped ? 'skipped' : step.ok ? 'ok' : 'failed';
        lines.push(`  ${step.label}: ${tag}${step.detail ? ` -- ${step.detail}` : ''}`);
    }
    return lines.join('\n');
}

// Re-export for legacy callers (kept for type imports until Phase 4 cleanup).
export type { MigrationReport };

interface SoulSections {
    identity: string[];
    values: string[];
    antiPatterns: string[];
    communication: string[];
}

/**
 * Parse a legacy soul.md into the four L2 categories. Recognises
 * common OpenClaw-style headings ("## Identity", "## Values",
 * "## Anti-Patterns", "## Communication"); bullet items underneath
 * become facts. Other sections (e.g. "## Name") are merged into
 * identity.
 */
function parseSoulSections(content: string): SoulSections {
    const out: SoulSections = { identity: [], values: [], antiPatterns: [], communication: [] };
    const lines = content.split('\n');
    let bucket: keyof SoulSections | null = null;
    for (const raw of lines) {
        const line = raw.trim();
        const heading = /^#{1,3}\s+(.+)$/.exec(line);
        if (heading) {
            const name = heading[1].toLowerCase();
            if (name.includes('value')) bucket = 'values';
            else if (name.includes('anti')) bucket = 'antiPatterns';
            else if (name.includes('communication') || name.includes('style')) bucket = 'communication';
            else if (name.includes('identity') || name.includes('name') || name.includes('role')) bucket = 'identity';
            else bucket = null;
            continue;
        }
        const bullet = /^[-*+]\s+(.+)$/.exec(line);
        if (bucket && bullet) out[bucket].push(bullet[1].trim());
    }
    return out;
}
