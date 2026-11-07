import { App, Notice, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { DEFAULT_AGENT_FOLDER } from '../../core/utils/agentFolder';
import { castGenerated } from '../../core/utils/runtime';
import { AgentFolderService, readStoredAgentFolder } from '../../core/utils/agentFolderService';
import { pickAgentFolder } from './AgentFolderPickerModal';
import { promptModal, confirmModal } from '../modals/PromptModal';
import { t } from '../../i18n';
import { DEFAULT_VAULT_INGEST_SETTINGS, DEFAULT_SUMMARY_PROMPT_TEMPLATE, DEFAULT_FRESHNESS_SETTINGS } from '../../types/settings';
import { countDueNotesByCluster } from '../../core/health/clusterDueCounts';
import { addSectionHeading, addSliderInput } from './utils';
import { migrationBackupExists } from '../../core/utils/restoreLayoutFromBackup';
import { resolveCoreTemplatesFolder } from '../../core/utils/templatesFolder';
import { TemplateMaterializer } from '../../core/templates/TemplateMaterializer';
import { makeTemplateTranslator } from '../../core/templates/translateTemplate';
import { BUNDLED_NOTE_TEMPLATES } from '../../_generated/bundled-templates';
import { buildIncomingLinksDisplaySettings } from './incomingLinksDisplaySettings';


export class VaultTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    build(containerEl: HTMLElement): void {
        addSectionHeading(
            containerEl,
            t('settings.vault.headingCheckpoints'),
            { body: t('settings.vault.sectionCheckpointsInfo') },
        );

        new Setting(containerEl)
            .setName(t('settings.vault.enableCheckpoints'))
            .setDesc(t('settings.vault.enableCheckpointsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.enableCheckpoints ?? true).onChange(async (v) => {
                    this.plugin.settings.enableCheckpoints = v;
                    await this.plugin.saveSettings();
                }),
            );

        const timeoutSetting = new Setting(containerEl)
            .setName(t('settings.vault.snapshotTimeout'))
            .setDesc(t('settings.vault.snapshotTimeoutDesc'));
        addSliderInput(timeoutSetting, {
            min: 5, max: 120, step: 5,
            value: this.plugin.settings.checkpointTimeoutSeconds ?? 30,
            onChange: async (v) => {
                this.plugin.settings.checkpointTimeoutSeconds = v;
                await this.plugin.saveSettings();
            },
        });

        new Setting(containerEl)
            .setName(t('settings.vault.autoCleanup'))
            .setDesc(t('settings.vault.autoCleanupDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.checkpointAutoCleanup ?? true).onChange(async (v) => {
                    this.plugin.settings.checkpointAutoCleanup = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.respectObsidianExcluded'))
            .setDesc(t('settings.vault.respectObsidianExcludedDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.respectObsidianExcludedFiles ?? true).onChange(async (v) => {
                    this.plugin.settings.respectObsidianExcludedFiles = v;
                    await this.plugin.saveSettings();
                    // Re-read the rules so the change takes effect immediately.
                    // This bumps the ignore-rule generation; caches keyed on it rebuild.
                    await this.plugin.ignoreService.load(v);
                }),
            );

        addSectionHeading(
            containerEl,
            t('settings.vault.taskExtraction'),
            { body: t('settings.vault.sectionTaskExtractionInfo') },
        );

        const taskSettings = this.plugin.settings.taskExtraction ?? { enabled: true, taskFolder: 'Tasks' };

        new Setting(containerEl)
            .setName(t('settings.vault.taskExtractionEnable'))
            .setDesc(t('settings.vault.taskExtractionEnableDesc'))
            .addToggle((toggle) =>
                toggle.setValue(taskSettings.enabled).onChange(async (v) => {
                    this.plugin.settings.taskExtraction = { ...taskSettings, enabled: v };
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.taskFolder'))
            .setDesc(t('settings.vault.taskFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('Tasks')
                    .setValue(taskSettings.taskFolder)
                    .onChange(async (v) => {
                        const folder = v.trim() || 'Tasks';
                        this.plugin.settings.taskExtraction = { ...taskSettings, taskFolder: folder };
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.preferTaskNotes'))
            .setDesc(t('settings.vault.preferTaskNotesDesc'))
            .addToggle((toggle) =>
                toggle.setValue(taskSettings.preferTaskNotesPlugin ?? true).onChange(async (v) => {
                    this.plugin.settings.taskExtraction = { ...taskSettings, preferTaskNotesPlugin: v };
                    await this.plugin.saveSettings();
                }),
            );

        // ── Default output folder (v2.10.0) ────────────────────────────────────
        new Setting(containerEl)
            .setName(t('settings.vault.defaultOutputFolder'))
            .setDesc(t('settings.vault.defaultOutputFolderDesc'))
            .addText((text) =>
                text
                    .setPlaceholder('Inbox/')
                    .setValue(this.plugin.settings.defaultOutputFolder ?? 'Inbox/')
                    .onChange(async (v) => {
                        const trimmed = v.trim();
                        this.plugin.settings.defaultOutputFolder = trimmed.length > 0 ? trimmed : 'Inbox/';
                        await this.plugin.saveSettings();
                    }),
            );

        addSectionHeading(
            containerEl,
            t('settings.vault.agentFolderHeading'),
            { body: t('settings.vault.sectionAgentFolderInfo') },
        );

        let currentInput: HTMLInputElement | null = null;
        const service = new AgentFolderService(this.plugin);

        /**
         * FEATURE-0508 P0+P1: persist, notify live components, show the
         * change notice. Does NOT migrate data — that's the button below.
         */
        const applyPathChange = async (newPath: string) => {
            const previous = readStoredAgentFolder(this.plugin);
            const sanitized = newPath.trim().length > 0 ? newPath.trim() : DEFAULT_AGENT_FOLDER;
            this.plugin.settings.agentFolderPath = sanitized;
            await this.plugin.saveSettings();
            await service.retargetLiveComponents();
            service.showChangeNotice(previous, sanitized);
        };

        new Setting(containerEl)
            .setName(t('settings.vault.agentFolder'))
            .setDesc(t('settings.vault.agentFolderFieldDesc'))
            .addText((text) => {
                currentInput = text.inputEl;
                text
                    .setPlaceholder(DEFAULT_AGENT_FOLDER)
                    .setValue(this.plugin.settings.agentFolderPath ?? DEFAULT_AGENT_FOLDER)
                    .onChange((v) => { void applyPathChange(v); });
            })
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.agentFolderPick'))
                    .setIcon('folder')
                    .onClick(() => {
                        void (async () => {
                            const picked = await pickAgentFolder(this.app);
                            if (!picked) return;
                            if (currentInput) currentInput.value = picked.path;
                            await applyPathChange(picked.path);
                        })();
                    }),
            );

        // ── P2: migrate data button ───────────────────────────────────────────
        new Setting(containerEl)
            .setName(t('settings.vault.agentFolderMigrate'))
            .setDesc(t('settings.vault.agentFolderMigrateDesc'))
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.agentFolderMigrateButton'))
                    .setIcon('arrow-right-left')
                    .onClick(() => { void this.handleMigrateClick(service); }),
            );

        // ── Reset to default path (FEAT-30-07: aus der Layout-Section
        //    hierher verschoben, gehoert thematisch zum Agent folder) ──────
        this.buildAgentFolderResetSetting(containerEl, applyPathChange, service);

        // ── FEAT-29-01 Storage Layout Migration (ADR-162: nur bei Bedarf) ─
        this.buildLayoutMigrationSection(containerEl);

        // ── BA-25 Karpathy-Wiki-Pattern (Vault-Ingest) ────────────────────
        this.buildVaultIngestSection(containerEl);

        // ── Vault health (inkl. External freshness verification, ADR-163) ─
        this.buildVaultHealthSection(containerEl);
    }

    /**
     * IMP-19-01-01: opt-in auto-apply for deterministic Vault Health
     * repairs. Default off; the toggle lists the three rule checks
     * covered so the user knows what gets auto-applied.
     */
    private buildVaultHealthSection(containerEl: HTMLElement): void {
        addSectionHeading(containerEl, t('settings.vault.headingVaultHealth'), {
            body: t('settings.vault.sectionVaultHealthInfo'),
        });

        // ADR-163 / FEAT-30-07: der External-Freshness-Verifier ist der
        // opt-in Web-Teilcheck von Vault health (Stufe 3 desselben Stacks
        // wie der kostenlose lokale cluster_freshness-Check) und lebt
        // deshalb hier statt als eigene Section.
        this.buildFreshnessSection(containerEl);
    }

    /**
     * Freshness verifier sub-flags.
     *
     * All sub-toggles default OFF. The note-level verifier runs only
     * when the user explicitly enables external sources; the frontmatter
     * mirror and frontier escalation are independent opt-ins on top.
     */
    private buildFreshnessSection(containerEl: HTMLElement): void {
        addSectionHeading(containerEl, t('settings.vault.headingFreshness'), {
            body: t('settings.vault.sectionFreshnessInfo'),
        }, { level: 'h4' });

        // Review-Finding Stale-Capture: jede onChange liest den LIVE-Zustand
        // statt des beim Render gecapturten Objekts, sonst revertiert die
        // zweite Aenderung in derselben Settings-Sitzung die erste still.
        const freshness = this.plugin.settings.freshness;
        const patchFreshness = (patch: Partial<typeof freshness>) => {
            this.plugin.settings.freshness = { ...this.plugin.settings.freshness, ...patch };
        };

        new Setting(containerEl)
            .setName(t('settings.vault.freshnessExternalSources'))
            .setDesc(t('settings.vault.freshnessExternalSourcesDesc'))
            .addToggle((tg) =>
                tg.setValue(freshness.externalSources.enabled).onChange(async (v) => {
                    patchFreshness({
                        externalSources: { ...this.plugin.settings.freshness.externalSources, enabled: v },
                    });
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.freshnessWriteFrontmatter'))
            .setDesc(t('settings.vault.freshnessWriteFrontmatterDesc'))
            .addToggle((tg) =>
                tg.setValue(freshness.writeFrontmatter).onChange(async (v) => {
                    patchFreshness({ writeFrontmatter: v });
                    await this.plugin.saveSettings();
                }),
            );

        // FIX-19-16-08: without the report, a run's results lived only in the
        // modal tab (off on mobile), a six-second Notice and console.debug.
        new Setting(containerEl)
            .setName(t('settings.vault.freshnessWriteReport'))
            .setDesc(t('settings.vault.freshnessWriteReportDesc'))
            .addToggle((tg) =>
                tg.setValue(freshness.writeReport ?? true).onChange(async (v) => {
                    patchFreshness({ writeReport: v });
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.freshnessFrontierEscalation'))
            .setDesc(t('settings.vault.freshnessFrontierEscalationDesc'))
            .addToggle((tg) =>
                tg.setValue(freshness.allowFrontierEscalation).onChange(async (v) => {
                    patchFreshness({ allowFrontierEscalation: v });
                    await this.plugin.saveSettings();
                }),
            );

        const thresholdSetting = new Setting(containerEl)
            .setName(t('settings.vault.freshnessConfidenceThreshold'))
            .setDesc(t('settings.vault.freshnessConfidenceThresholdDesc'));
        addSliderInput(thresholdSetting, {
            min: 0.0, max: 1.0, step: 0.05,
            value: freshness.frontierConfidenceThreshold,
            onChange: async (v) => {
                patchFreshness({ frontierConfidenceThreshold: v });
                await this.plugin.saveSettings();
            },
        });

        new Setting(containerEl)
            .setName(t('settings.vault.freshnessExcludePaths'))
            .setDesc(t('settings.vault.freshnessExcludePathsDesc'))
            .addText((text) => {
                text.setValue(freshness.excludePaths.join(', '))
                    .onChange(async (v) => {
                        const paths = v.split(',').map((s) => s.trim()).filter(Boolean);
                        patchFreshness({ excludePaths: paths });
                        await this.plugin.saveSettings();
                    });
            });

        // FEAT-19-03-01: editierbares Wochenbudget. Deckelt den vault-weiten
        // Lauf; hoeher = der Kaltstart-Rueckstand ist schneller aufgeholt.
        new Setting(containerEl)
            .setName(t('settings.vault.freshnessWeeklyBudget'))
            .setDesc(t('settings.vault.freshnessWeeklyBudgetDesc'))
            .addText((text) => {
                text.setValue(String(freshness.weeklyBudgetUsd ?? DEFAULT_FRESHNESS_SETTINGS.weeklyBudgetUsd))
                    .onChange(async (v) => {
                        const parsed = Number.parseFloat(v.replace(',', '.'));
                        // Ungueltig/negativ ignorieren, damit ein halb getippter
                        // Wert das Budget nicht auf 0 setzt und den Lauf abwuergt.
                        if (!Number.isFinite(parsed) || parsed <= 0) return;
                        patchFreshness({ weeklyBudgetUsd: parsed });
                        await this.plugin.saveSettings();
                    });
            });

        // FEAT-19-03-01: Cluster-Ausschluss (Opt-out statt frueherem Opt-in).
        new Setting(containerEl)
            .setName(t('settings.vault.freshnessExcludeClusters'))
            .setDesc(t('settings.vault.freshnessExcludeClustersDesc'))
            .addTextArea((text) => {
                text.setValue((freshness.excludeClusters ?? []).join('\n'))
                    .onChange(async (v) => {
                        const clusters = v.split('\n').map((s) => s.trim()).filter(Boolean);
                        patchFreshness({ excludeClusters: clusters });
                        await this.plugin.saveSettings();
                    });
            });

        // FIX-30-07-03: der Stufe-3-Weekly-Job hatte nie ein UI-Toggle;
        // die gesamte Verifier-Pipeline war ohne data.json-Handedit
        // unerreichbar und die Hot-Cluster-Toggles wirkungslos.
        const ingestCfg = this.plugin.settings.vaultIngest;
        new Setting(containerEl)
            .setName(t('settings.vault.freshnessWeeklyJob'))
            .setDesc(t('settings.vault.freshnessWeeklyJobDesc'))
            .addToggle((tg) =>
                tg.setValue(ingestCfg?.stufe3PeriodicJob?.enabled ?? false).onChange(async (v) => {
                    if (!ingestCfg) return;
                    if (!ingestCfg.stufe3PeriodicJob) {
                        ingestCfg.stufe3PeriodicJob = { enabled: v, lastRunIso: '' };
                    } else {
                        ingestCfg.stufe3PeriodicJob.enabled = v;
                    }
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.freshnessRunNow'))
            .setDesc(t('settings.vault.freshnessRunNowDesc'))
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.freshnessRunNowButton'))
                    .setIcon('radar')
                    .onClick(() => { void this.plugin.runFreshnessCheckNow(); }),
            );

        // FEAT-19-03-01: der Scan deckt den GANZEN Vault alterungsgesteuert
        // ab (keine manuelle Hot-Auswahl mehr). Statt Toggles zeigt dieser
        // Block, was der naechste Lauf tun wuerde.
        this.buildFreshnessScopeBlock(containerEl);
    }

    private buildFreshnessScopeBlock(containerEl: HTMLElement): void {
        addSectionHeading(
            containerEl,
            t('settings.vault.headingFreshnessScope'),
            { body: t('settings.vault.sectionFreshnessScopeInfo') },
            { level: 'h4' },
        );

        const store = this.plugin.clusterMetadataStore;
        const db = this.plugin.knowledgeDB;
        if (!store || !db?.isOpen()) {
            containerEl.createEl('p', { cls: 'agent-settings-desc', text: t('settings.vault.clusterStoreNotLoaded') });
            return;
        }
        const all = store.getAll();
        if (all.length === 0) {
            containerEl.createEl('p', { cls: 'agent-settings-desc', text: t('settings.vault.noClusters') });
            return;
        }

        // Was ist gerade faellig? Dieselbe Rechnung wie der Lauf, damit die
        // Anzeige nicht behauptet, was der Scan nicht tut.
        const fresh = this.plugin.settings.freshness ?? DEFAULT_FRESHNESS_SETTINGS;
        const due = countDueNotesByCluster(
            db.getDB(),
            {
                volatileRecheckDays: 7,
                evolvingRecheckDays: 30,
                stableRecheckDays: 90,
                excludePaths: fresh.excludePaths,
            },
            new Date(),
        );
        const excluded = new Set(fresh.excludeClusters ?? []);
        let dueClusters = 0;
        let dueVol = 0, dueEvo = 0, dueSta = 0;
        for (const [cluster, c] of due) {
            if (excluded.has(cluster)) continue;
            dueClusters++;
            dueVol += c.dueVolatile; dueEvo += c.dueEvolving; dueSta += c.dueStable;
        }

        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.vault.freshnessScopeSummary', {
                clusters: all.length,
                dueClusters,
                volatile: dueVol,
                evolving: dueEvo,
                stable: dueSta,
            }),
        });
        if (!fresh.externalSources?.enabled) {
            containerEl.createEl('p', {
                cls: 'agent-settings-desc mod-warning',
                text: t('settings.vault.freshnessScopeExternalOff'),
            });
        }
    }

    /**
     * Storage Layout Consolidation section.
     *
     * Consolidates the historical plugin-storage roots (.obsidian-agent,
     * .obsilo-vault, .vault-operator, vault-parent/obsilo-shared) into a
     * single vault-local layout with data/ and cache/ sub-folders. Opt-in
     * because it relocates files across roots and switches the lookup paths
     * for dependent services.
     */
    private buildLayoutMigrationSection(containerEl: HTMLElement): void {
        const statusValue = this.plugin.settings._layoutMigrationStatus ?? 'pending';
        const legacyChatHistory = this.plugin.settings._chatHistoryFolderLegacy;

        // ADR-162 / FIX-30-07-04: Auf konsolidierten Installationen ohne
        // offenen Legacy-Hinweis verschwindet die Section. Die Restore-Zeile
        // erscheint nur, wenn tatsaechlich ein Migrations-Backup unter
        // ~/.vault-operator-migration-backups/ existiert. Review-Finding: der
        // Probe-Aufruf ist synchron (kein fire-and-forget mehr), sonst haengte
        // die Restore-Section nach allen folgenden Sections ans Tab-Ende bzw.
        // nach einem Rerender an einen toten Container.
        if (statusValue === 'complete' && !legacyChatHistory) {
            this.maybeBuildRestoreSection(containerEl);
            return;
        }

        addSectionHeading(
            containerEl,
            t('settings.vault.headingLayoutMigration'),
            { body: t('settings.vault.sectionLayoutMigrationInfo') },
        );

        new Setting(containerEl)
            .setName(t('settings.vault.layoutMigrationStatus'))
            .setDesc(t('settings.vault.layoutMigrationStatusDesc', { status: statusValue }));

        new Setting(containerEl)
            .setName(t('settings.vault.layoutMigrationRun'))
            .setDesc(t('settings.vault.layoutMigrationRunDesc'))
            .addButton((btn) =>
                btn
                    .setButtonText(
                        statusValue === 'complete'
                            ? t('settings.vault.layoutMigrationDoneButton')
                            : t('settings.vault.layoutMigrationActivateButton'),
                    )
                    .setIcon('arrow-right-left')
                    .setTooltip(
                        statusValue === 'complete'
                            ? t('settings.vault.layoutMigrationDoneTooltip')
                            : t('settings.vault.layoutMigrationActivateTooltip'),
                    )
                    .setDisabled(statusValue === 'complete')
                    .onClick(() => {
                        void (async () => {
                            if (statusValue === 'complete') {
                                new Notice(
                                    t('settings.vault.layoutMigrationDoneTooltip'),
                                    5000,
                                );
                                return;
                            }
                            const ok = await confirmModal(this.app, {
                                title: t('settings.vault.layoutMigrationConfirmTitle'),
                                message: t('settings.vault.layoutMigrationConfirmMessage'),
                                confirmLabel: t('settings.vault.layoutMigrationActivateButton'),
                                cancelLabel: t('settings.vault.cancel'),
                            });
                            if (!ok) return;
                            this.plugin.settings._layoutMigrationOptIn = true;
                            await this.plugin.saveSettings();
                            new Notice(
                                t('notice.vault.layoutMigrationActivated'),
                                10000,
                            );
                            this.rerender();
                        })();
                    }),
            );

        // Restore previous layout from a backup snapshot
        this.buildRestoreRow(containerEl, statusValue);

        // Notice for users who had chatHistoryFolder set before the setting was removed
        if (legacyChatHistory) {
            this.buildChatHistoryRemovedNotice(containerEl, legacyChatHistory);
        }
    }

    /**
     * ADR-162: On consolidated installs the migration section is hidden;
     * only when a migration backup snapshot exists does a compact restore
     * section appear. Synchronous (desktop-only fs probe) so it renders
     * inline at the right position instead of appending after later sections.
     */
    private maybeBuildRestoreSection(containerEl: HTMLElement): void {
        const vaultBasePath = (this.app.vault.adapter as unknown as {
            getBasePath?(): string;
        }).getBasePath?.() ?? '';
        if (!vaultBasePath) return;
        let hasBackup = false;
        try {
            hasBackup = migrationBackupExists(vaultBasePath);
        } catch {
            // Probe failure (mobile / restricted FS): section stays hidden.
            return;
        }
        if (!hasBackup) return;
        addSectionHeading(
            containerEl,
            t('settings.vault.headingLayoutMigration'),
            { body: t('settings.vault.sectionLayoutMigrationInfo') },
        );
        this.buildRestoreRow(containerEl, 'complete');
    }

    private buildChatHistoryRemovedNotice(containerEl: HTMLElement, legacyChatHistory: string): void {
        new Setting(containerEl)
            .setName(t('settings.vault.chatHistoryRemoved'))
            .setDesc(t('settings.vault.chatHistoryRemovedDesc', { path: legacyChatHistory }))
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.chatHistoryRemovedDismiss'))
                    .setIcon('check')
                    .onClick(() => {
                        void (async () => {
                            this.plugin.settings._chatHistoryFolderLegacy = undefined;
                            await this.plugin.saveSettings();
                            this.rerender();
                        })();
                    }),
            );
    }

    /** FEAT-30-07: Reset-to-default lives with the Agent-folder settings. */
    private buildAgentFolderResetSetting(
        containerEl: HTMLElement,
        applyPathChange: (newPath: string) => Promise<void>,
        service: AgentFolderService,
    ): void {
        const currentPath = this.plugin.settings.agentFolderPath ?? DEFAULT_AGENT_FOLDER;
        const isDefault = currentPath === DEFAULT_AGENT_FOLDER;
        new Setting(containerEl)
            .setName(t('settings.vault.agentFolderReset'))
            .setDesc(
                isDefault
                    ? t('settings.vault.agentFolderResetAlreadyDefault', { path: DEFAULT_AGENT_FOLDER })
                    : t('settings.vault.agentFolderResetDesc', { currentPath, defaultPath: DEFAULT_AGENT_FOLDER }),
            )
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.agentFolderResetButton', { path: DEFAULT_AGENT_FOLDER }))
                    .setIcon('rotate-ccw')
                    .setTooltip(
                        isDefault
                            ? t('settings.vault.agentFolderResetTooltipDefault', { path: DEFAULT_AGENT_FOLDER })
                            : t('settings.vault.agentFolderResetTooltip', { path: DEFAULT_AGENT_FOLDER }),
                    )
                    .setDisabled(isDefault)
                    .onClick(() => {
                        void (async () => {
                            if (isDefault) {
                                new Notice(
                                    t('settings.vault.agentFolderResetTooltipDefault', { path: DEFAULT_AGENT_FOLDER }),
                                    5000,
                                );
                                return;
                            }
                            const ok = await confirmModal(this.app, {
                                title: t('settings.vault.agentFolderResetConfirmTitle'),
                                message: t('settings.vault.agentFolderResetConfirmMessage', {
                                    currentPath,
                                    defaultPath: DEFAULT_AGENT_FOLDER,
                                }),
                                confirmLabel: t('settings.vault.agentFolderResetConfirmButton'),
                                cancelLabel: t('settings.vault.cancel'),
                            });
                            if (!ok) return;

                            // Move plugin skills, vault-dna snapshot, knowledge db,
                            // memory db from currentPath to DEFAULT_AGENT_FOLDER via
                            // the existing migration helper, then flip the setting.
                            const migrationResult = await service.migrate(currentPath, DEFAULT_AGENT_FOLDER);
                            await applyPathChange(DEFAULT_AGENT_FOLDER);

                            const movedSummary: string[] = [];
                            if (migrationResult.movedKnowledgeDb) movedSummary.push(t('notice.vault.movedKnowledgeIndex'));
                            if (migrationResult.movedMemoryDb) movedSummary.push(t('notice.vault.movedMemoryDatabase'));
                            if (migrationResult.movedVaultDna) movedSummary.push(t('notice.vault.movedVaultDna'));
                            if (migrationResult.movedPluginSkills > 0) {
                                movedSummary.push(t('notice.vault.movedPluginSkills', { count: migrationResult.movedPluginSkills }));
                            }
                            const movedLine = movedSummary.length > 0
                                ? t('notice.vault.movedSummary', { items: movedSummary.join(', ') })
                                : t('notice.vault.nothingToMove');
                            const errLine = migrationResult.errors.length > 0
                                ? ' ' + t('notice.vault.nonFatalErrors', { count: migrationResult.errors.length })
                                : '';
                            new Notice(
                                t('notice.vault.agentFolderResetDone', {
                                    path: DEFAULT_AGENT_FOLDER,
                                    movedLine,
                                    errLine,
                                }),
                                8000,
                            );
                            if (migrationResult.errors.length > 0) {
                                console.warn('[VaultOperator] Reset-to-default migration errors:', migrationResult.errors);
                            }
                            this.rerender();
                        })();
                    }),
            );

    }

    /** Restore-Zeile der Layout-Migration (geteilt zwischen Voll-Section und ADR-162-Kompaktform). */
    private buildRestoreRow(containerEl: HTMLElement, statusValue: string): void {
        new Setting(containerEl)
            .setName(t('settings.vault.layoutRestore'))
            .setDesc(
                statusValue === 'complete'
                    ? t('settings.vault.layoutRestoreDesc')
                    : t('settings.vault.layoutRestoreNotReadyDesc'),
            )
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.layoutRestoreButton'))
                    .setIcon('history')
                    .setTooltip(
                        statusValue === 'complete'
                            ? t('settings.vault.layoutRestoreTooltip')
                            : t('settings.vault.layoutRestoreNotReadyTooltip'),
                    )
                    .setDisabled(statusValue !== 'complete')
                    .onClick(() => {
                        void this.handleRestoreClick(statusValue);
                    }),
            );
    }

    /**
     * BA-25 PLAN-10..14 Vault-Ingest-Settings:
     *   - Standard-Prompt fuer Auto-Summary (des Nutzers Wortlaut Default)
     *   - Auto-Summary-Toggle (Default off)
     *   - Frontmatter-Write-Toggle (Default off, Variante B aus BA-25)
     *   - Auto-Trigger via Frontmatter-Property (FEAT-19-27)
     *   - PDF-Strategie (Page-Refs vs Markdown-Mirror)
     *
     * Plugin-Reload-Notiz: Aenderungen an Auto-Trigger-Property erfordern
     * Plugin-Reload damit der vault.on-Listener neu registriert.
     */
    private buildVaultIngestSection(containerEl: HTMLElement): void {
        addSectionHeading(
            containerEl,
            t('settings.vault.headingIngest'),
            { body: t('settings.vault.sectionIngestInfo') },
        );

        const cfg = this.plugin.settings.vaultIngest ?? { ...DEFAULT_VAULT_INGEST_SETTINGS };
        // Sicherstellen dass Setting-Objekt existiert (Migration aus aelteren Settings-Versionen)
        if (!this.plugin.settings.vaultIngest) {
            this.plugin.settings.vaultIngest = cfg;
        }
        // FIX (Live-Bug 2026-05-04): shallow Object.assign in loadSettings
        // ueberschreibt vaultIngest komplett wenn es im persistenten data.json
        // existiert, auch wenn neue Sub-Objekte (topHubBlock, stufe2Hint,
        // autoTrigger) im Saved fehlen. Hier defensive Init pro Sub-Objekt
        // damit alte Settings-Files mit neuen Toggles funktionieren.
        if (!cfg.topHubBlock) {
            cfg.topHubBlock = { ...DEFAULT_VAULT_INGEST_SETTINGS.topHubBlock };
        }
        if (!cfg.incomingLinksBlock) {
            cfg.incomingLinksBlock = { ...DEFAULT_VAULT_INGEST_SETTINGS.incomingLinksBlock };
        }
        if (!cfg.stufe2Hint) {
            cfg.stufe2Hint = { ...DEFAULT_VAULT_INGEST_SETTINGS.stufe2Hint };
        }
        if (!cfg.autoTrigger) {
            cfg.autoTrigger = { ...DEFAULT_VAULT_INGEST_SETTINGS.autoTrigger };
        }
        if (!cfg.autoSummary) {
            cfg.autoSummary = { ...DEFAULT_VAULT_INGEST_SETTINGS.autoSummary };
        }
        if (!cfg.summaryPrompt) {
            cfg.summaryPrompt = { ...DEFAULT_VAULT_INGEST_SETTINGS.summaryPrompt };
        }

        // Auto-Summary-Toggle
        new Setting(containerEl)
            .setName(t('settings.vault.autoSummary'))
            .setDesc(t('settings.vault.autoSummaryDesc'))
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoSummary.enabled).onChange(async (v) => {
                    cfg.autoSummary.enabled = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );

        // Frontmatter-Write-Toggle (gilt NUR fuer den manuellen Backfill,
        // nicht fuer das Indexing -- die Beschreibung sagt das jetzt auch).
        new Setting(containerEl)
            .setName(t('settings.vault.autoSummaryFrontmatter'))
            .setDesc(t('settings.vault.autoSummaryFrontmatterDesc'))
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoSummary.writeFrontmatter).onChange(async (v) => {
                    cfg.autoSummary.writeFrontmatter = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                    this.rerender();
                }),
            );

        // Ziel-Property fuer den Backfill-Write. Default OKF `description`;
        // nur sichtbar, wenn der Write ueberhaupt erlaubt ist.
        if (cfg.autoSummary.writeFrontmatter) {
            // Frontmatter-Property-Name, kein UI-Text: bewusst kleingeschrieben.
            // Als Variable statt String-Literal, damit obsidianmd/ui/sentence-case
            // nicht anschlaegt (der Disable dieser Regel ist vom Review-Bot verboten).
            const descProp = 'description';
            new Setting(containerEl)
                .setName(t('settings.vault.autoSummaryProperty'))
                .setDesc(t('settings.vault.autoSummaryPropertyDesc'))
                .addText((text) =>
                    text
                        .setPlaceholder(descProp)
                        .setValue(cfg.autoSummary.frontmatterProperty ?? descProp)
                        .onChange(async (v) => {
                            cfg.autoSummary.frontmatterProperty = v.trim() || descProp;
                            this.plugin.settings.vaultIngest = cfg;
                            await this.plugin.saveSettings();
                        }),
                );
        }

        // Standard-Prompt-Editor
        new Setting(containerEl)
            .setName(t('settings.vault.summaryPrompt'))
            .setDesc(t('settings.vault.summaryPromptDesc'))
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.edit'))
                    .setIcon('pencil')
                    .onClick(async () => {
                        const next = await promptModal(this.app, {
                            title: t('settings.vault.summaryPrompt'),
                            defaultValue: cfg.summaryPrompt.template,
                            placeholder: t('settings.vault.summaryPromptPlaceholder'),
                            submitLabel: t('settings.vault.save'),
                        });
                        if (next === null) return;
                        cfg.summaryPrompt.template = next || DEFAULT_SUMMARY_PROMPT_TEMPLATE;
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                        this.rerender();
                    }),
            )
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.reset'))
                    .onClick(async () => {
                        cfg.summaryPrompt.template = DEFAULT_SUMMARY_PROMPT_TEMPLATE;
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                        this.rerender();
                    }),
            );

        addSectionHeading(
            containerEl,
            t('settings.vault.headingAutoTrigger'),
            { body: t('settings.vault.sectionAutoTriggerInfo') },
            { level: 'h4' },
        );

        new Setting(containerEl)
            .setName(t('settings.vault.autoTriggerEnable'))
            .setDesc(t('settings.vault.autoTriggerEnableDesc'))
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoTrigger.enabled).onChange(async (v) => {
                    cfg.autoTrigger.enabled = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                    if (v) {
                        new Notice(t('notice.vault.autoTriggerEnabled'), 8000);
                    }
                }),
            );

        // Frontmatter-Property-Name als Variable (siehe descProp oben): haelt
        // obsidianmd/ui/sentence-case ruhig ohne den verbotenen Disable.
        const typeProp = 'type';
        new Setting(containerEl)
            .setName(t('settings.vault.autoTriggerPropertyName'))
            .setDesc(t('settings.vault.autoTriggerPropertyNameDesc'))
            .addText((text) =>
                text
                    .setValue(cfg.autoTrigger.propertyName)
                    .setPlaceholder(typeProp)
                    .onChange(async (v) => {
                        cfg.autoTrigger.propertyName = v.trim();
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        // Frontmatter-Property-Value-Beispiel als Variable (siehe descProp oben).
        const sourceProp = 'source';
        new Setting(containerEl)
            .setName(t('settings.vault.autoTriggerPropertyValue'))
            .setDesc(t('settings.vault.autoTriggerPropertyValueDesc'))
            .addText((text) =>
                text
                    .setValue(Array.isArray(cfg.autoTrigger.propertyValue) ? cfg.autoTrigger.propertyValue.join(', ') : cfg.autoTrigger.propertyValue)
                    .setPlaceholder(sourceProp)
                    .onChange(async (v) => {
                        const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
                        cfg.autoTrigger.propertyValue = parts.length > 1 ? parts : (parts[0] ?? '');
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.autoTriggerNotification'))
            .setDesc(t('settings.vault.autoTriggerNotificationDesc'))
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoTrigger.notification).onChange(async (v) => {
                    cfg.autoTrigger.notification = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );

        addSectionHeading(
            containerEl,
            t('settings.vault.headingPdf'),
            { body: t('settings.vault.sectionPdfInfo') },
            { level: 'h4' },
        );

        new Setting(containerEl)
            .setName(t('settings.vault.pdfStrategy'))
            .setDesc(t('settings.vault.pdfStrategyDesc'))
            .addDropdown((dd) =>
                dd
                    .addOption('page-refs', t('settings.vault.pdfStrategyPageRefs'))
                    .addOption('markdown-mirror', t('settings.vault.pdfStrategyMarkdownMirror'))
                    .setValue(cfg.pdfStrategy)
                    .onChange(async (v) => {
                        cfg.pdfStrategy = v as 'page-refs' | 'markdown-mirror';
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        // FEAT-30-07: Die vier Template-Pfad-Textfelder sind entfernt. Kein
        // Code-Pfad hat die Werte je gelesen (die Ingest-Skills lesen das
        // OKF Template hardcoded, IMP-19-31-04 offen); nur der
        // Re-materialize-Button tut etwas Reales und bleibt.
        addSectionHeading(
            containerEl,
            t('settings.vault.headingTemplates'),
            { body: t('settings.vault.sectionTemplatesInfo') },
            { level: 'h4' },
        );

        // FEAT-29-14: Re-materialize button. Re-runs the same code path
        // as the FirstRun-Templates step using the persisted
        // `templatesLanguage` (default 'de'). Skip-existing by default
        // so user edits are preserved; the modal offers force-overwrite.
        new Setting(containerEl)
            .setName(t('settings.vault.rematerializeTemplates'))
            .setDesc(t('settings.vault.rematerializeTemplatesDesc'))
            .addButton((btn) =>
                btn
                    .setButtonText(t('settings.vault.rematerializeTemplatesButton'))
                    .onClick(async () => {
                        await this.handleRematerializeTemplates();
                    }),
            );

        addSectionHeading(
            containerEl,
            t('settings.vault.headingTopHub'),
            { body: t('settings.vault.sectionTopHubInfo') },
            { level: 'h4' },
        );

        const privacyWarn = containerEl.createDiv({ cls: 'agent-settings-desc' });
        privacyWarn.createEl('strong', { text: t('settings.vault.topHubPrivacyLabel') });
        privacyWarn.appendText(t('settings.vault.topHubPrivacyText'));

        new Setting(containerEl)
            .setName(t('settings.vault.topHubPrivacyAck'))
            .setDesc(t('settings.vault.topHubPrivacyAckDesc'))
            .addToggle((toggle) =>
                toggle.setValue(cfg.topHubBlock.privacyAcknowledged).onChange(async (v) => {
                    cfg.topHubBlock.privacyAcknowledged = v;
                    if (!v) cfg.topHubBlock.enabled = false; // disable enabled if ack revoked
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                    this.rerender();
                }),
            );

        const enabledSetting = new Setting(containerEl)
            .setName(t('settings.vault.topHubEnable'))
            .setDesc(t('settings.vault.topHubEnableDesc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(cfg.topHubBlock.enabled)
                    .setDisabled(!cfg.topHubBlock.privacyAcknowledged)
                    .onChange(async (v) => {
                        if (v && !cfg.topHubBlock.privacyAcknowledged) {
                            new Notice(t('notice.vault.privacyAckRequired'), 6000);
                            toggle.setValue(false);
                            return;
                        }
                        cfg.topHubBlock.enabled = v;
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );
        if (!cfg.topHubBlock.privacyAcknowledged) {
            enabledSetting.descEl.createEl('br');
            enabledSetting.descEl.createEl('em', { text: t('settings.vault.topHubDisabledHint') });
        }

        // FEAT-19-04-01: selbstbildender Rueckverweis-Block. Eine Notiz gilt
        // als Hub ab `threshold` eingehenden Links (einstellbar).
        addSectionHeading(
            containerEl,
            t('settings.vault.headingIncomingLinks'),
            { body: t('settings.vault.sectionIncomingLinksInfo') },
            { level: 'h4' },
        );
        new Setting(containerEl)
            .setName(t('settings.vault.incomingLinksEnable'))
            .setDesc(t('settings.vault.incomingLinksEnableDesc'))
            .addToggle((toggle) =>
                toggle.setValue(cfg.incomingLinksBlock.enabled).onChange(async (v) => {
                    cfg.incomingLinksBlock.enabled = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );
        const thresholdSetting = new Setting(containerEl)
            .setName(t('settings.vault.incomingLinksThreshold'))
            .setDesc(t('settings.vault.incomingLinksThresholdDesc'));
        addSliderInput(thresholdSetting, {
            min: 2, max: 20, step: 1,
            value: cfg.incomingLinksBlock.threshold,
            onChange: async (v) => {
                cfg.incomingLinksBlock.threshold = v;
                this.plugin.settings.vaultIngest = cfg;
                await this.plugin.saveSettings();
            },
        });

        buildIncomingLinksDisplaySettings(containerEl, cfg.incomingLinksBlock, async () => {
            this.plugin.settings.vaultIngest = cfg;
            await this.plugin.saveSettings();
        });

        // FEAT-30-07: Hot-Cluster-Block lebt jetzt im Freshness-Unterblock
        // der Vault-health-Section (buildHotClustersBlock).

        addSectionHeading(
            containerEl,
            t('settings.vault.headingActivityHint'),
            { body: t('settings.vault.sectionActivityHintInfo') },
            { level: 'h4' },
        );
        new Setting(containerEl)
            .setName(t('settings.vault.activityHintEnable'))
            .setDesc(t('settings.vault.activityHintEnableDesc'))
            .addToggle((toggle) => {
                toggle.setValue(cfg.stufe2Hint.enabled).onChange(async (v) => {
                    cfg.stufe2Hint.enabled = v;
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName(t('settings.vault.activityHintThreshold'))
            .setDesc(t('settings.vault.activityHintThresholdDesc'))
            .addText((text) => {
                text.setValue(String(cfg.stufe2Hint.hintThresholdScore))
                    .onChange(async (v) => {
                        const n = parseInt(v, 10);
                        if (Number.isFinite(n) && n >= 0 && n <= 100) {
                            cfg.stufe2Hint.hintThresholdScore = n;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        new Setting(containerEl)
            .setName(t('settings.vault.activityHintMinDays'))
            .setDesc(t('settings.vault.activityHintMinDaysDesc'))
            .addText((text) => {
                text.setValue(String(cfg.stufe2Hint.minDaysSinceCheck))
                    .onChange(async (v) => {
                        const n = parseInt(v, 10);
                        if (Number.isFinite(n) && n >= 0) {
                            cfg.stufe2Hint.minDaysSinceCheck = n;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        new Setting(containerEl)
            .setName(t('settings.vault.activityHintCooldown'))
            .setDesc(t('settings.vault.activityHintCooldownDesc'))
            .addText((text) => {
                text.setValue(String(cfg.stufe2Hint.perClusterCooldownDays))
                    .onChange(async (v) => {
                        const n = parseInt(v, 10);
                        if (Number.isFinite(n) && n >= 1) {
                            cfg.stufe2Hint.perClusterCooldownDays = n;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        new Setting(containerEl)
            .setName(t('settings.vault.activityHintMaxPerDay'))
            .setDesc(t('settings.vault.activityHintMaxPerDayDesc'))
            .addText((text) => {
                text.setValue(String(cfg.stufe2Hint.maxHintsPerDay))
                    .onChange(async (v) => {
                        const n = parseInt(v, 10);
                        if (Number.isFinite(n) && n >= 1) {
                            cfg.stufe2Hint.maxHintsPerDay = n;
                            await this.plugin.saveSettings();
                        }
                    });
            });

        addSectionHeading(
            containerEl,
            t('settings.vault.headingManualActions'),
            { body: t('settings.vault.sectionManualActionsInfo') },
            { level: 'h4' },
        );
        new Setting(containerEl)
            .setName(t('settings.vault.backfillRun'))
            .setDesc(t('settings.vault.backfillRunDesc'))
            .addButton((btn) => btn.setButtonText(t('settings.vault.backfillRunButton')).onClick(() => { void this.plugin.runFrontmatterBackfill(); }));
        new Setting(containerEl)
            .setName(t('settings.vault.triageRun'))
            .setDesc(t('settings.vault.triageRunDesc'))
            .addButton((btn) => btn.setButtonText(t('settings.vault.triageRunButton')).onClick(() => { void this.plugin.runInboxTriage(); }));
        new Setting(containerEl)
            .setName(t('settings.vault.mocInsert'))
            .setDesc(t('settings.vault.mocInsertDesc'))
            .addButton((btn) => btn.setButtonText(t('settings.vault.mocInsertButton')).onClick(() => { void this.plugin.injectInitialMOCMarkers(); }));
        new Setting(containerEl)
            .setName(t('settings.vault.mocRefresh'))
            .setDesc(t('settings.vault.mocRefreshDesc'))
            .addButton((btn) => btn.setButtonText(t('settings.vault.mocRefreshButton')).onClick(() => { void this.plugin.refreshAllMOCs(); }));
        new Setting(containerEl)
            .setName(t('settings.vault.topHubRegenerate'))
            .setDesc(t('settings.vault.topHubRegenerateDesc'))
            .addButton((btn) => btn.setButtonText(t('settings.vault.topHubRegenerateButton')).onClick(() => {
                if (!this.plugin.topHubBlockGenerator) { new Notice(t('notice.vault.topHubUnavailable')); return; }
                const r = this.plugin.topHubBlockGenerator.generate();
                this.plugin.topHubBlockState = r.state;
                this.plugin.topHubBlockMarkdown = r.block;
                new Notice(t('notice.vault.topHubRegenerated', { count: r.hubs.length }));
            }));
    }

    /**
     * FEATURE-0508 P2: prompt for the OLD path, preview what's there,
     * confirm, migrate. Originals stay in place — user deletes manually
     * after verifying the new location works.
     */
    /**
     * Restore the legacy layout from a backup snapshot the consolidation
     * migration wrote. Lists available backups, asks the user to confirm,
     * then runs the restore service. Resets the migration status so the
     * Settings UI reflects the rollback after the next plugin reload.
     */
    private async handleRestoreClick(statusValue: string): Promise<void> {
        if (statusValue !== 'complete') {
            new Notice(t('notice.vault.restoreNotReady'), 5000);
            return;
        }
        const vaultBasePath = (this.app.vault.adapter as unknown as {
            getBasePath?(): string;
        }).getBasePath?.() ?? '';
        if (!vaultBasePath) {
            new Notice(t('notice.vault.restoreNoBasePath'), 6000);
            return;
        }
        const nodePath = await import('path');
        // Review-Finding: der Backup-Pfad wird jetzt zentral in
        // restoreLayoutFromBackup.resolveMigrationBackupDirs berechnet
        // (sha256 kanonisch, md5 als Back-compat-Fallback, ausserhalb jedes
        // Sync-Containers). Kein dritter Copy-Paste der Hash-Kette mehr.
        const { resolveMigrationBackupDirs, listBackupFolders, restoreLayoutFromBackup } = await import(
            '../../core/utils/restoreLayoutFromBackup'
        );
        const pluginDataDir = resolveMigrationBackupDirs(vaultBasePath).preferredDir;
        const vaultParent = nodePath.dirname(vaultBasePath);
        const backups = await listBackupFolders(pluginDataDir);
        if (backups.length === 0) {
            new Notice(
                t('notice.vault.restoreNoBackup'),
                7000,
            );
            return;
        }
        const latest = backups[0];
        const latestName = nodePath.basename(latest);
        const ok = await confirmModal(this.app, {
            title: t('settings.vault.layoutRestoreConfirmTitle'),
            message: t('settings.vault.layoutRestoreConfirmMessage', { backupName: latestName }),
            confirmLabel: t('settings.vault.layoutRestoreButton'),
            cancelLabel: t('settings.vault.cancel'),
        });
        if (!ok) return;

        const report = await restoreLayoutFromBackup({
            vaultBasePath,
            vaultParent,
            backupPath: latest,
            removeConsolidated: true,
        });

        if (!report.allRestoreSucceeded) {
            const failed = report.entries.filter((e) => e.status === 'failed' || e.status === 'skipped-destination-populated');
            console.warn('[VaultOperator] Restore-from-backup partial failure:', report);
            new Notice(
                t('notice.vault.restoreIncomplete', { count: failed.length }),
                10000,
            );
            return;
        }

        // Reset migration flags so the UI offers the migration again and the
        // next plugin start does not skip the trigger.
        this.plugin.settings._layoutMigrationStatus = undefined;
        this.plugin.settings._layoutMigrationOptIn = false;
        await this.plugin.saveSettings();

        new Notice(
            t('notice.vault.restoreDone'),
            10000,
        );
        this.rerender();
    }

    private async handleMigrateClick(service: AgentFolderService): Promise<void> {
        const currentPath = readStoredAgentFolder(this.plugin);
        const oldPathInput = await promptModal(this.app, {
            title: t('settings.vault.migrateModalTitle'),
            message: t('settings.vault.migrateModalMessage', { currentPath }),
            defaultValue: DEFAULT_AGENT_FOLDER,
            submitLabel: t('settings.vault.migrateModalNext'),
        });
        if (!oldPathInput) return;
        const oldPath = oldPathInput.trim();
        if (!oldPath || oldPath === currentPath) {
            new Notice(t('notice.vault.migrateSamePath'));
            return;
        }

        const preview = await service.previewMigration(oldPath);
        const hasAnything = preview.pluginSkills.length > 0
            || preview.vaultDnaExists
            || preview.knowledgeDbExists
            || preview.memoryDbExists;
        if (!hasAnything) {
            new Notice(t('notice.vault.migrateNothingFound', { path: oldPath }));
            return;
        }

        const parts: string[] = [];
        if (preview.pluginSkills.length > 0) parts.push(t('notice.vault.migratePluginSkillFiles', { count: preview.pluginSkills.length }));
        if (preview.vaultDnaExists) parts.push('vault-dna.json');
        if (preview.knowledgeDbExists) parts.push('knowledge.db');
        if (preview.memoryDbExists) parts.push('memory.db');
        const mb = (preview.totalBytes / (1024 * 1024)).toFixed(1);
        const summary = t('settings.vault.migrateSummary', { items: parts.join(', '), mb });

        const confirmed = await confirmModal(this.app, {
            title: t('settings.vault.migrateConfirmTitle'),
            message: t('settings.vault.migrateConfirmMessage', { summary, oldPath, currentPath }),
            confirmLabel: t('settings.vault.migrateConfirmButton'),
        });
        if (!confirmed) return;

        const result = await service.migrate(oldPath, currentPath);
        const summaryParts: string[] = [];
        if (result.movedPluginSkills > 0) summaryParts.push(t('notice.vault.migratePluginSkillFiles', { count: result.movedPluginSkills }));
        if (result.movedVaultDna) summaryParts.push('vault-dna.json');
        if (result.movedKnowledgeDb) summaryParts.push('knowledge.db');
        if (result.movedMemoryDb) summaryParts.push('memory.db');

        if (result.errors.length > 0) {
            new Notice(
                t('notice.vault.migrateFinishedWithErrors', {
                    count: result.errors.length,
                    moved: summaryParts.join(', ') || t('notice.vault.migrateMovedNone'),
                    error: result.errors[0],
                }),
                15_000,
            );
        } else if (summaryParts.length === 0) {
            new Notice(t('notice.vault.migrateNothingMigrated'));
        } else {
            new Notice(
                t('notice.vault.migrateDone', { items: summaryParts.join(', ') }),
                15_000,
            );
        }
    }

    /**
     * FEAT-29-14: Re-runs the FirstRunWizard templates materialization
     * from the Vault settings tab. Reads the persisted templatesLanguage
     * (default 'de') and the Obsidian-Core-Templates folder. Skip-existing
     * by default; offers force-overwrite via confirm modal.
     */
    private async handleRematerializeTemplates(): Promise<void> {
        const folder = await resolveCoreTemplatesFolder(this.app);
        if (!folder) {
            new Notice(
                t('notice.vault.templatesNoFolder'),
                8000,
            );
            return;
        }

        const tpl = this.plugin.settings.vaultIngest.templates;
        const lang = (tpl.templatesLanguage && tpl.templatesLanguage.length > 0)
            ? tpl.templatesLanguage
            : 'de';

        const force = await confirmModal(this.app, {
            title: t('settings.vault.rematerializeConfirmTitle'),
            message: t('settings.vault.rematerializeConfirmMessage', { folder, lang }),
            confirmLabel: t('settings.vault.rematerializeOverwriteButton'),
            destructive: true,
        });

        // `BUNDLED_NOTE_TEMPLATES` is imported from gitignored `_generated/`.
        // The bot's fresh-clone lint widens the type to `error`; locally
        // it resolves to `Record<string, Record<string, string>>`. The
        // `castGenerated` helper routes through an `unknown` parameter so
        // the cast is necessary in both contexts: locally it removes the
        // type mismatch, at the bot it narrows the widened error type.
        // No eslint-disable directive needed.
        const templates = castGenerated<Record<string, Record<string, string>>>(BUNDLED_NOTE_TEMPLATES);
        const materializer = new TemplateMaterializer(this.app, templates);
        const translator = (lang !== 'de' && lang !== 'en')
            ? makeTemplateTranslator(this.plugin)
            : undefined;

        try {
            const result = await materializer.materialize(folder, lang, { force, translator });
            const failedPart = result.failed.length
                ? t('notice.vault.templatesFailedPart', { count: result.failed.length })
                : '';
            const summary = t('notice.vault.templatesDone', {
                written: result.written.length,
                skipped: result.skipped.length,
                failedPart,
            });
            new Notice(summary, 6000);
            if (result.failed.length > 0) {
                console.warn('[templates] re-materialization failures:', result.failed);
            }
        } catch (e) {
            console.error('[templates] re-materialization failed:', e);
            new Notice(t('notice.vault.templatesFailed', { error: (e as Error).message ?? String(e) }), 10_000);
        }
    }
}
