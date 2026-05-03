import { App, Notice, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { DEFAULT_AGENT_FOLDER } from '../../core/utils/agentFolder';
import { AgentFolderService, readStoredAgentFolder } from '../../core/utils/agentFolderService';
import { pickAgentFolder } from './AgentFolderPickerModal';
import { promptModal, confirmModal } from '../modals/PromptModal';
import { t } from '../../i18n';
import { DEFAULT_VAULT_INGEST_SETTINGS, DEFAULT_SUMMARY_PROMPT_TEMPLATE } from '../../types/settings';


export class VaultTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    build(containerEl: HTMLElement): void {
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.vault.desc'),
        });

        // ── Checkpoints ─────────────────────────────────────────────────────
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'CHECKPOINTS' });

        new Setting(containerEl)
            .setName(t('settings.vault.enableCheckpoints'))
            .setDesc(t('settings.vault.enableCheckpointsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.enableCheckpoints ?? true).onChange(async (v) => {
                    this.plugin.settings.enableCheckpoints = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.snapshotTimeout'))
            .setDesc(t('settings.vault.snapshotTimeoutDesc'))
            .addText((t) =>
                t
                    .setValue(String(this.plugin.settings.checkpointTimeoutSeconds ?? 30))
                    .onChange(async (v) => {
                        const n = parseInt(v);
                        if (!isNaN(n) && n > 0) {
                            this.plugin.settings.checkpointTimeoutSeconds = n;
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.vault.autoCleanup'))
            .setDesc(t('settings.vault.autoCleanupDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.checkpointAutoCleanup ?? true).onChange(async (v) => {
                    this.plugin.settings.checkpointAutoCleanup = v;
                    await this.plugin.saveSettings();
                }),
            );

        // ── Task Extraction (FEATURE-100) ────────────────────────────────────
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: t('settings.vault.taskExtraction') });
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.vault.taskExtractionDesc'),
        });

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

        // ── Agent Folder (FEATURE-0507 / Issue #26) ────────────────────────────
        containerEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: t('settings.vault.agentFolderHeading'),
        });
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.vault.agentFolderDesc'),
        });

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

        // ── BA-25 Karpathy-Wiki-Pattern (Vault-Ingest) ────────────────────
        this.buildVaultIngestSection(containerEl);
    }

    /**
     * BA-25 PLAN-10..14 Vault-Ingest-Settings:
     *   - Standard-Prompt fuer Auto-Summary (Sebastians Wortlaut Default)
     *   - Auto-Summary-Toggle (Default off)
     *   - Frontmatter-Write-Toggle (Default off, Variante B aus BA-25)
     *   - Auto-Trigger via Frontmatter-Property (FEAT-19-27)
     *   - PDF-Strategie (Page-Refs vs Markdown-Mirror)
     *
     * Plugin-Reload-Notiz: Aenderungen an Auto-Trigger-Property erfordern
     * Plugin-Reload damit der vault.on-Listener neu registriert.
     */
    private buildVaultIngestSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'VAULT-INGEST (BA-25)' });
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text:
                'Karpathy-Wiki-Pattern: zentrale Note-Summary-Pflege, Frontmatter-Mirror, Auto-Trigger '
                + 'via konfigurierbarer Property. Alle Toggles sind defaultmaessig deaktiviert. '
                + 'Aenderungen am Auto-Trigger erfordern Plugin-Reload.',
        });

        const cfg = this.plugin.settings.vaultIngest ?? { ...DEFAULT_VAULT_INGEST_SETTINGS };
        // Sicherstellen dass Setting-Objekt existiert (Migration aus aelteren Settings-Versionen)
        if (!this.plugin.settings.vaultIngest) {
            this.plugin.settings.vaultIngest = cfg;
        }

        // Auto-Summary-Toggle
        new Setting(containerEl)
            .setName('Auto-Summary beim Indexing')
            .setDesc(
                'Wenn aktiviert: SemanticIndexService generiert pro Note eine Summary, falls keine '
                + 'im Frontmatter vorhanden. Bestehende Frontmatter-Summaries werden ueberommen, niemals '
                + 'ueberschrieben. LLM-Call pro Note (Default-Modell, ggf. konfigurierbar).',
            )
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoSummary.enabled).onChange(async (v) => {
                    cfg.autoSummary.enabled = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );

        // Frontmatter-Write-Toggle
        new Setting(containerEl)
            .setName('Auto-Summary in Frontmatter schreiben')
            .setDesc(
                'Wenn aktiviert: generierte Summary wird zusaetzlich als Frontmatter-Property "Zusammenfassung" '
                + 'in die Vault-Note geschrieben (struktur-erhaltend, ueberschreibt nichts). '
                + 'Default OFF (User-Trust). Bei Aktivierung sollte ein einmaliger Backfill-Job laufen.',
            )
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoSummary.writeFrontmatter).onChange(async (v) => {
                    cfg.autoSummary.writeFrontmatter = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );

        // Standard-Prompt-Editor
        new Setting(containerEl)
            .setName('Standard-Prompt fuer Summary-Generierung')
            .setDesc(
                'Multi-Line-Template (Sebastians Default aus BA-25). Editierbar pro Vault. '
                + '"Zuruecksetzen" stellt den Default wieder her.',
            )
            .addButton((btn) =>
                btn
                    .setButtonText('Bearbeiten')
                    .setIcon('pencil')
                    .onClick(async () => {
                        const next = await promptModal(this.app, {
                            title: 'Standard-Prompt fuer Summary',
                            defaultValue: cfg.summaryPrompt.template,
                            placeholder: 'Multi-Line Prompt-Template...',
                            submitLabel: 'Speichern',
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
                    .setButtonText('Zuruecksetzen')
                    .onClick(async () => {
                        cfg.summaryPrompt.template = DEFAULT_SUMMARY_PROMPT_TEMPLATE;
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                        this.rerender();
                    }),
            );

        // Auto-Trigger
        containerEl.createEl('h4', { text: 'Auto-Trigger (FEAT-19-27)' });

        new Setting(containerEl)
            .setName('Auto-Trigger aktiv')
            .setDesc('Triage startet automatisch wenn eine Note die unten konfigurierte Property traegt. Default OFF.')
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoTrigger.enabled).onChange(async (v) => {
                    cfg.autoTrigger.enabled = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                    if (v) {
                        new Notice('Auto-Trigger aktiviert. Plugin-Reload erforderlich, damit der Listener registriert.', 8000);
                    }
                }),
            );

        new Setting(containerEl)
            .setName('Property-Name')
            .setDesc('Frontmatter-Property die geprueft wird (z.B. "Kategorie").')
            .addText((text) =>
                text
                    .setValue(cfg.autoTrigger.propertyName)
                    .setPlaceholder('Kategorie')
                    .onChange(async (v) => {
                        cfg.autoTrigger.propertyName = v.trim();
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Property-Wert')
            .setDesc('Wert der Match ausloest (z.B. "Quelle"). Mehrere Werte mit Komma trennen.')
            .addText((text) =>
                text
                    .setValue(Array.isArray(cfg.autoTrigger.propertyValue) ? cfg.autoTrigger.propertyValue.join(', ') : cfg.autoTrigger.propertyValue)
                    .setPlaceholder('Quelle')
                    .onChange(async (v) => {
                        const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
                        cfg.autoTrigger.propertyValue = parts.length > 1 ? parts : (parts[0] ?? '');
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Auto-Trigger-Notification')
            .setDesc('Toast anzeigen wenn Auto-Trigger feuert. Default OFF (Tab im Health-Modal reicht).')
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoTrigger.notification).onChange(async (v) => {
                    cfg.autoTrigger.notification = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );

        // PDF-Strategie
        containerEl.createEl('h4', { text: 'PDF-Strategie (FEAT-19-29)' });

        new Setting(containerEl)
            .setName('PDF-Strategie')
            .setDesc(
                'page-refs (Default): PDF bleibt im Vault, Source-Position-Marker als '
                + '[[file.pdf#page=N]]. markdown-mirror (opt-in): zusaetzlicher Markdown-Mirror '
                + 'fuer Block-Level-Granularitaet bei text-lastigen PDFs.',
            )
            .addDropdown((dd) =>
                dd
                    .addOption('page-refs', 'Page-Refs (Default)')
                    .addOption('markdown-mirror', 'Markdown-Mirror (opt-in)')
                    .setValue(cfg.pdfStrategy)
                    .onChange(async (v) => {
                        cfg.pdfStrategy = v as 'page-refs' | 'markdown-mirror';
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        // ── Top-Hub-Block (FEAT-03-26 + FIX-03-26-01 Privacy-Hint, AUDIT-014 M-2) ──
        containerEl.createEl('h4', { text: 'Top-Hub-Block im System-Prompt (FEAT-03-26)' });

        const privacyWarn = containerEl.createEl('div', { cls: 'agent-settings-desc' });
        privacyWarn.createEl('strong', { text: 'Privacy-Hinweis: ' });
        privacyWarn.appendText(
            'Bei Aktivierung werden Note-Summaries der Top-30 Hub-Notes deines Vaults '
            + 'bei JEDER LLM-Conversation als System-Prompt-Block an den LLM-Provider gesendet. '
            + 'Pruefe vor Aktivierung welche deiner Hub-Notes vertrauliche Daten enthalten '
            + '(Tagebuch, Patient-Notes, Geschaeftsinfos). Setting kann jederzeit zurueckgenommen werden, '
            + 'aber bereits gesendete Daten bleiben beim Provider.',
        );

        new Setting(containerEl)
            .setName('Privacy-Hinweis gelesen und akzeptiert')
            .setDesc('Erst nach Bestaetigung kann der Top-Hub-Block aktiviert werden.')
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
            .setName('Top-Hub-Block aktivieren')
            .setDesc('Default OFF. Erfordert vorherige Privacy-Bestaetigung.')
            .addToggle((toggle) =>
                toggle
                    .setValue(cfg.topHubBlock.enabled)
                    .setDisabled(!cfg.topHubBlock.privacyAcknowledged)
                    .onChange(async (v) => {
                        if (v && !cfg.topHubBlock.privacyAcknowledged) {
                            new Notice('Bitte zuerst den Privacy-Hinweis bestaetigen.', 6000);
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
            enabledSetting.descEl.createEl('em', { text: '(deaktiviert bis Privacy-Hinweis akzeptiert)' });
        }

        // ── Hot-Cluster-Konfiguration (FEAT-19-21) ─────────────────────
        containerEl.createEl('h4', { text: 'Hot-Cluster fuer Stufe-3-Periodischen-Lint (FEAT-19-21)' });

        const hotDesc = containerEl.createEl('div', { cls: 'agent-settings-desc' });
        hotDesc.appendText(
            'Stufe-3 (wochentlicher Job) prueft externe Aktualitaet nur fuer Hot-Cluster. '
            + 'Markiere unten welche deiner Cluster periodisch ueberprueft werden sollen. '
            + 'Default: keiner. Token-Budget begrenzt zusaetzlich (siehe AUDIT-014).',
        );

        const store = this.plugin.clusterMetadataStore;
        if (!store) {
            containerEl.createEl('p', { cls: 'agent-settings-desc', text: '(Cluster-Metadata-Store nicht geladen.)' });
        } else {
            const all = store.getAll();
            if (all.length === 0) {
                containerEl.createEl('p', {
                    cls: 'agent-settings-desc',
                    text: '(Keine Cluster in der Ontologie. Erst Vault-Indexing laufen lassen.)',
                });
            } else {
                for (const cluster of all) {
                    new Setting(containerEl)
                        .setName(cluster.cluster)
                        .setDesc(`Halbwertszeit: ${cluster.halfLifeDays}d ${cluster.lastExternalCheck ? '. Letzter Check: ' + cluster.lastExternalCheck.split('T')[0] : ''}`)
                        .addToggle((toggle) =>
                            toggle
                                .setValue(cluster.hotCluster)
                                .onChange(async (v) => {
                                    store.setHotCluster(cluster.cluster, v);
                                    await this.plugin.knowledgeDB?.save();
                                }),
                        );
                }
            }
        }

        // ── Stufe-2 Activity-Hint (FEAT-19-19) ─────────────────────────
        containerEl.createEl('h4', { text: 'Stufe-2 Activity-Hint (FEAT-19-19)' });
        const stufe2Desc = containerEl.createEl('div', { cls: 'agent-settings-desc' });
        stufe2Desc.appendText(
            'Bei Note-Open/Modify in einem Cluster mit niedrigem Freshness-Score zeigt das Plugin '
            + 'eine dezente Notice mit Klick-Trigger fuer Anti-Echo-Suche. Default OFF damit kein '
            + 'Notice-Spam entsteht. Cooldowns verhindern Wiederholung pro Cluster.',
        );
        new Setting(containerEl)
            .setName('Stufe-2 Activity-Hint aktivieren')
            .setDesc('Loest dezente Notices aus, wenn Du eine Note in einem reifen Cluster oeffnest oder editierst.')
            .addToggle((toggle) => {
                toggle.setValue(cfg.stufe2Hint.enabled).onChange(async (v) => {
                    cfg.stufe2Hint.enabled = v;
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName('Score-Schwelle')
            .setDesc('Hint feuert wenn Cluster-Freshness-Score unter diesem Wert liegt (0..100). Default 70.')
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
            .setName('Min. Tage seit letztem externen Check')
            .setDesc('Default 30. Verhindert Hint kurz nach einem Stufe-3-Pass.')
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
            .setName('Cooldown pro Cluster (Tage)')
            .setDesc('Default 7. Pro Cluster max ein Hint in diesem Zeitraum.')
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
            .setName('Max Hints pro Tag (global)')
            .setDesc('Default 5. Schuetzt vor Notice-Spam an aktiven Tagen.')
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

        // ── Aktionen (Backfill, Inbox-Triage, MOC-Refresh) ──────────────
        containerEl.createEl('h4', { text: 'BA-25 Aktionen' });
        new Setting(containerEl)
            .setName('Frontmatter-Backfill jetzt ausfuehren')
            .setDesc('Iteriert ueber alle Markdown-Notes, ergaenzt fehlende Frontmatter (Setting writeFrontmatter muss aktiv sein). Kann lang dauern.')
            .addButton((btn) => btn.setButtonText('Backfill starten').onClick(() => { void this.plugin.runFrontmatterBackfill(); }));
        new Setting(containerEl)
            .setName('Inbox-Triage jetzt ausfuehren')
            .setDesc('Erfasst alle Notes mit Auto-Trigger-Property als pending im Triage-Log.')
            .addButton((btn) => btn.setButtonText('Inbox triagen').onClick(() => { void this.plugin.runInboxTriage(); }));
        new Setting(containerEl)
            .setName('MOC-Marker initial einfuegen')
            .setDesc('Fuegt den auto-Marker-Block in alle MOC-Kandidaten ein, deren Basename als Cluster bekannt ist. Idempotent.')
            .addButton((btn) => btn.setButtonText('Marker injizieren').onClick(() => { void this.plugin.injectInitialMOCMarkers(); }));
        new Setting(containerEl)
            .setName('MOC-Pflege jetzt aktualisieren')
            .setDesc('Aktualisiert auto-generierte Marker-Bloecke in MOC-Pages. User-modifizierte Bloecke werden uebersprungen.')
            .addButton((btn) => btn.setButtonText('MOCs aktualisieren').onClick(() => { void this.plugin.refreshAllMOCs(); }));
        new Setting(containerEl)
            .setName('Top-Hub-Block jetzt regenerieren')
            .setDesc('Manueller Refresh des KV-Cache-Blocks (sonst nur bei Hub-Membership-Aenderung mit 24h-Cooldown).')
            .addButton((btn) => btn.setButtonText('Top-Hub regenerieren').onClick(() => {
                if (!this.plugin.topHubBlockGenerator) { new Notice('Top-Hub-Generator nicht verfuegbar.'); return; }
                const r = this.plugin.topHubBlockGenerator.generate();
                this.plugin.topHubBlockState = r.state;
                this.plugin.topHubBlockMarkdown = r.block;
                new Notice(`Top-Hub-Block regeneriert: ${r.hubs.length} Hubs.`);
            }));
    }

    /**
     * FEATURE-0508 P2: prompt for the OLD path, preview what's there,
     * confirm, migrate. Originals stay in place — user deletes manually
     * after verifying the new location works.
     */
    private async handleMigrateClick(service: AgentFolderService): Promise<void> {
        const currentPath = readStoredAgentFolder(this.plugin);
        const oldPathInput = await promptModal(this.app, {
            title: 'Migrate agent folder data',
            message:
                `Migrate data FROM which folder?\n\n`
                + `Current agent folder is "${currentPath}".\n`
                + `Enter the OLD path whose data should be copied here.`,
            defaultValue: DEFAULT_AGENT_FOLDER,
            submitLabel: 'Next',
        });
        if (!oldPathInput) return;
        const oldPath = oldPathInput.trim();
        if (!oldPath || oldPath === currentPath) {
            new Notice('Nothing to do: old and new path are the same.');
            return;
        }

        const preview = await service.previewMigration(oldPath);
        const hasAnything = preview.pluginSkills.length > 0
            || preview.vaultDnaExists
            || preview.knowledgeDbExists
            || preview.memoryDbExists;
        if (!hasAnything) {
            new Notice(`No plugin data found at "${oldPath}". Nothing migrated.`);
            return;
        }

        const parts: string[] = [];
        if (preview.pluginSkills.length > 0) parts.push(`${preview.pluginSkills.length} plugin-skill file(s)`);
        if (preview.vaultDnaExists) parts.push('vault-dna.json');
        if (preview.knowledgeDbExists) parts.push('knowledge.db');
        if (preview.memoryDbExists) parts.push('memory.db');
        const mb = (preview.totalBytes / (1024 * 1024)).toFixed(1);
        const summary = `${parts.join(', ')} (~${mb} MB)`;

        const confirmed = await confirmModal(this.app, {
            title: 'Confirm migration',
            message:
                `Migrate ${summary}\n\n`
                + `FROM: ${oldPath}\n`
                + `TO:   ${currentPath}\n\n`
                + `The originals stay in place. Delete them manually after verifying the new location works.\n\n`
                + `Reload Obsidian after migration so the knowledge and memory databases re-open at the new path.`,
            confirmLabel: 'Migrate',
        });
        if (!confirmed) return;

        const result = await service.migrate(oldPath, currentPath);
        const summaryParts: string[] = [];
        if (result.movedPluginSkills > 0) summaryParts.push(`${result.movedPluginSkills} plugin-skill file(s)`);
        if (result.movedVaultDna) summaryParts.push('vault-dna.json');
        if (result.movedKnowledgeDb) summaryParts.push('knowledge.db');
        if (result.movedMemoryDb) summaryParts.push('memory.db');

        if (result.errors.length > 0) {
            new Notice(
                `Migration finished with ${result.errors.length} error(s). Moved: ${summaryParts.join(', ') || 'none'}. First error: ${result.errors[0]}`,
                15_000,
            );
        } else if (summaryParts.length === 0) {
            new Notice('Nothing migrated — destination already had identical files.');
        } else {
            new Notice(
                `Migrated ${summaryParts.join(', ')}. Reload Obsidian so the knowledge and memory databases open at the new location.`,
                15_000,
            );
        }
    }
}
