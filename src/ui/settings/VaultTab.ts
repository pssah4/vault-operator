import { App, Notice, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { DEFAULT_AGENT_FOLDER } from '../../core/utils/agentFolder';
import { AgentFolderService, readStoredAgentFolder } from '../../core/utils/agentFolderService';
import { pickAgentFolder } from './AgentFolderPickerModal';
import { promptModal, confirmModal } from '../modals/PromptModal';
import { t } from '../../i18n';
import { DEFAULT_VAULT_INGEST_SETTINGS, DEFAULT_SUMMARY_PROMPT_TEMPLATE } from '../../types/settings';
import { addSectionHeading, addSliderInput } from './utils';


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
            .setName('Default output folder')
            .setDesc('Folder where generated files (xlsx, docx, pptx, drawio, excalidraw) land when the agent provides only a filename without a path. Use a trailing slash, e.g. "Inbox/".')
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

        // ── FEAT-29-01 Storage Layout Migration ───────────────────────────
        this.buildLayoutMigrationSection(containerEl, applyPathChange);

        // ── BA-25 Karpathy-Wiki-Pattern (Vault-Ingest) ────────────────────
        this.buildVaultIngestSection(containerEl);
    }

    /**
     * FEAT-29-01: Storage Layout Migration section.
     *
     * Consolidates the four historical roots (.obsidian-agent, .obsilo-vault,
     * .vault-operator, obsilo-shared) into a single .vault-operator/{data,cache}/
     * layout. Migration is opt-in because it relocates files across roots and
     * the dependent services switch their lookup paths.
     */
    private buildLayoutMigrationSection(
        containerEl: HTMLElement,
        applyPathChange: (newPath: string) => Promise<void>,
    ): void {
        addSectionHeading(
            containerEl,
            'Storage Layout Migration (FEAT-29-01)',
            {
                body:
                    'Konsolidiert alle Plugin-Storage-Lokationen in einen einzigen vault-local '
                    + 'Pfad mit data/ und cache/ Sub-Foldern. Ersetzt die vier historischen Roots '
                    + '.obsidian-agent, .obsilo-vault, .vault-operator und {vault-parent}/obsilo-shared. '
                    + 'Backup wird vor jedem Schreiben angelegt. Migration ist resumable.',
            },
        );

        const statusValue = this.plugin.settings._layoutMigrationStatus ?? 'pending';
        new Setting(containerEl)
            .setName('Migration-Status')
            .setDesc(`Aktueller Stand: ${statusValue}`);

        // Run-button: writes _layoutMigrationOptIn=true and asks the user to reload.
        new Setting(containerEl)
            .setName('Run layout migration')
            .setDesc(
                'Aktiviert die Migration. Plugin muss nach Aktivierung neu geladen werden '
                + '(Strg+P, "Reload plugin"). Beim naechsten Start laeuft Migration. Backup-Snapshot wird vorher '
                + 'angelegt unter ~/Library/Application Support/...',
            )
            .addButton((btn) =>
                btn
                    .setButtonText(
                        statusValue === 'complete' ? 'Bereits abgeschlossen' : 'Migration aktivieren',
                    )
                    .setIcon('arrow-up-circle')
                    .setDisabled(statusValue === 'complete')
                    .onClick(() => {
                        void (async () => {
                            const ok = await confirmModal(this.app, {
                                title: 'Storage-Layout-Migration aktivieren?',
                                message:
                                    'Die Migration verschiebt alle Plugin-Daten (knowledge.db, history, '
                                    + 'memory, skills, rules, workflows, episodes, logs, plugin-skills, '
                                    + 'asset cache, checkpoints, dev-env, tmp) in einen konsolidierten '
                                    + 'Pfad .vault-operator/{data,cache}/. \n\n'
                                    + 'Vor erstem Schreiben wird ein Backup-Snapshot angelegt. Die '
                                    + 'Operation ist resumable. Nach Aktivierung musst du das Plugin '
                                    + 'reloaden (Strg+P -> Reload Vault Operator). Fortfahren?',
                                confirmLabel: 'Migration aktivieren',
                                cancelLabel: 'Abbrechen',
                            });
                            if (!ok) return;
                            this.plugin.settings._layoutMigrationOptIn = true;
                            await this.plugin.saveSettings();
                            new Notice(
                                'Migration aktiviert. Bitte Plugin neu laden (Strg+P -> Reload Vault Operator).',
                                10000,
                            );
                            this.rerender();
                        })();
                    }),
            );

        // Reset agent folder path to default + migrate files
        const currentPath = this.plugin.settings.agentFolderPath ?? DEFAULT_AGENT_FOLDER;
        const isDefault = currentPath === DEFAULT_AGENT_FOLDER;
        new Setting(containerEl)
            .setName('Reset auf Standard-Pfad')
            .setDesc(
                isDefault
                    ? 'Aktueller Pfad ist bereits der Standard (.vault-operator).'
                    : `Aktueller Pfad ist Custom (${currentPath}). Reset setzt auf .vault-operator zurueck.`,
            )
            .addButton((btn) =>
                btn
                    .setButtonText('Reset auf .vault-operator')
                    .setIcon('rotate-ccw')
                    .setDisabled(isDefault)
                    .onClick(() => {
                        void (async () => {
                            const ok = await confirmModal(this.app, {
                                title: 'Agent-Folder-Pfad zuruecksetzen?',
                                message:
                                    `Aktueller Pfad: ${currentPath}\n`
                                    + 'Neuer Pfad: .vault-operator\n\n'
                                    + 'Existing Files bleiben im alten Pfad. Du musst sie manuell verschieben '
                                    + 'oder ueber den "Migrate data"-Button (oben) bewegen. Fortfahren?',
                                confirmLabel: 'Zuruecksetzen',
                                cancelLabel: 'Abbrechen',
                            });
                            if (!ok) return;
                            await applyPathChange(DEFAULT_AGENT_FOLDER);
                            new Notice('Agent-Folder-Pfad zurueckgesetzt auf .vault-operator.', 6000);
                            this.rerender();
                        })();
                    }),
            );

        // chatHistoryFolder legacy notice (FEAT-29-01 Task 10)
        const legacyChatHistory = this.plugin.settings._chatHistoryFolderLegacy;
        if (legacyChatHistory) {
            new Setting(containerEl)
                .setName('Hinweis: chatHistoryFolder entfernt')
                .setDesc(
                    `Das Setting chatHistoryFolder ist mit FEAT-29-01 entfallen. Dein alter Pfad war: ${legacyChatHistory}. `
                    + 'Conversations sind weiterhin ueber die Plugin-Sidebar (HistoryPanel) zugaenglich. Der Vault-Folder bleibt unangetastet '
                    + 'und kann manuell geloescht werden, falls nicht mehr benoetigt.',
                )
                .addButton((btn) =>
                    btn
                        .setButtonText('Verstanden, Hinweis entfernen')
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
            .setName('Auto-summary on indexing')
            .setDesc(
                'When enabled, the semantic index generates a short summary for each note that does '
                + 'not already have one in its frontmatter. Existing summaries are reused and never '
                + 'overwritten. Costs one LLM call per note (uses your default model).',
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
            .setName('Write auto-summary into frontmatter')
            .setDesc(
                'When enabled, the generated summary is also written into the note\'s frontmatter as '
                + 'a "Zusammenfassung" property (structure-preserving, never overwrites existing values). '
                + 'Default OFF so the agent never modifies your notes without consent. After enabling, '
                + 'run the backfill action below to summarize existing notes.',
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
            .setName('Default summary prompt')
            .setDesc(
                'Prompt template used to generate note summaries. Editable per vault. '
                + '"Reset" restores the built-in default.',
            )
            .addButton((btn) =>
                btn
                    .setButtonText('Edit')
                    .setIcon('pencil')
                    .onClick(async () => {
                        const next = await promptModal(this.app, {
                            title: 'Default summary prompt',
                            defaultValue: cfg.summaryPrompt.template,
                            placeholder: 'Multi-line prompt template...',
                            submitLabel: 'Save',
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
                    .setButtonText('Reset')
                    .onClick(async () => {
                        cfg.summaryPrompt.template = DEFAULT_SUMMARY_PROMPT_TEMPLATE;
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                        this.rerender();
                    }),
            );

        addSectionHeading(
            containerEl,
            'Auto-trigger for inbox triage',
            { body: 'Watches your vault for notes that carry a specific frontmatter property and value. When a match appears (e.g. you save a note with `category: source`), the agent automatically queues it for triage and processes it in the background. Useful for inbox-style workflows where new sources should be summarised and filed without manual invocation. Toggling the master switch requires a plugin reload to (de)register the file watcher.' },
            { level: 'h4' },
        );

        new Setting(containerEl)
            .setName('Enable auto-trigger')
            .setDesc('Triage starts automatically when a note carries the property and value configured below. Default off.')
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoTrigger.enabled).onChange(async (v) => {
                    cfg.autoTrigger.enabled = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                    if (v) {
                        new Notice('Auto-trigger enabled. Reload the plugin so the file watcher registers.', 8000);
                    }
                }),
            );

        new Setting(containerEl)
            .setName('Property name')
            .setDesc('Name of the frontmatter property to watch, for example category.')
            .addText((text) =>
                text
                    .setValue(cfg.autoTrigger.propertyName)
                    .setPlaceholder('Category')
                    .onChange(async (v) => {
                        cfg.autoTrigger.propertyName = v.trim();
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Property value')
            .setDesc('Value that triggers a match, for example source. Separate multiple values with commas.')
            .addText((text) =>
                text
                    .setValue(Array.isArray(cfg.autoTrigger.propertyValue) ? cfg.autoTrigger.propertyValue.join(', ') : cfg.autoTrigger.propertyValue)
                    .setPlaceholder('Source')
                    .onChange(async (v) => {
                        const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
                        cfg.autoTrigger.propertyValue = parts.length > 1 ? parts : (parts[0] ?? '');
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Show notification on trigger')
            .setDesc('Display a toast when auto-trigger fires. Default off (the vault health modal already lists triggered notes).')
            .addToggle((toggle) =>
                toggle.setValue(cfg.autoTrigger.notification).onChange(async (v) => {
                    cfg.autoTrigger.notification = v;
                    this.plugin.settings.vaultIngest = cfg;
                    await this.plugin.saveSettings();
                }),
            );

        addSectionHeading(
            containerEl,
            'PDF handling',
            { body: 'Controls how PDFs are referenced when the agent cites them. Page-refs keeps the PDF untouched and links to specific pages. Markdown-mirror additionally extracts the text into a parallel markdown file, which lets the agent quote and link at block level. Page-refs is the default; use Markdown-mirror only for text-heavy PDFs where you need quote-level granularity.' },
            { level: 'h4' },
        );

        new Setting(containerEl)
            .setName('PDF strategy')
            .setDesc(
                'Page-refs (default): PDF stays in the vault, citations use [[file.pdf#page=N]]. '
                + 'Markdown-mirror (opt-in): an additional markdown copy is created for block-level '
                + 'granularity. Useful for text-heavy PDFs where you want quote-level references.',
            )
            .addDropdown((dd) =>
                dd
                    .addOption('page-refs', 'Page-refs (default)')
                    .addOption('markdown-mirror', 'Markdown-mirror (opt-in)')
                    .setValue(cfg.pdfStrategy)
                    .onChange(async (v) => {
                        cfg.pdfStrategy = v as 'page-refs' | 'markdown-mirror';
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        addSectionHeading(
            containerEl,
            'Note templates for ingest skills',
            { body: 'Vault-relative path to a Markdown file whose YAML frontmatter is used as the basis for newly ingested source notes. Leave empty to fall back to the bundled defaults. Useful if you want a custom set of frontmatter properties on every new source note.' },
            { level: 'h4' },
        );

        new Setting(containerEl)
            .setName('Template for /ingest')
            .setDesc('Frontmatter template used by the quick single-pass ingest skill.')
            .addText((text) =>
                text
                    .setPlaceholder('Tools & Settings/Templates/Quelle Template.md')
                    .setValue(cfg.templates?.ingestNoteTemplate ?? '')
                    .onChange(async (v) => {
                        cfg.templates = cfg.templates ?? { ingestNoteTemplate: '', ingestDeepNoteTemplate: '', meetingSummaryTemplate: '' };
                        cfg.templates.ingestNoteTemplate = v.trim();
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Template for /ingest-deep')
            .setDesc('Frontmatter template used by the multi-turn deep-ingest skill.')
            .addText((text) =>
                text
                    .setPlaceholder('Tools & Settings/Templates/Quelle Template.md')
                    .setValue(cfg.templates?.ingestDeepNoteTemplate ?? '')
                    .onChange(async (v) => {
                        cfg.templates = cfg.templates ?? { ingestNoteTemplate: '', ingestDeepNoteTemplate: '', meetingSummaryTemplate: '' };
                        cfg.templates.ingestDeepNoteTemplate = v.trim();
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Template for /meeting-summary')
            .setDesc('Frontmatter template used by the meeting-transcript summary skill.')
            .addText((text) =>
                text
                    .setPlaceholder('Tools & Settings/Templates/Meeting-Notiz Template.md')
                    .setValue(cfg.templates?.meetingSummaryTemplate ?? '')
                    .onChange(async (v) => {
                        cfg.templates = cfg.templates ?? { ingestNoteTemplate: '', ingestDeepNoteTemplate: '', meetingSummaryTemplate: '' };
                        cfg.templates.meetingSummaryTemplate = v.trim();
                        this.plugin.settings.vaultIngest = cfg;
                        await this.plugin.saveSettings();
                    }),
            );

        addSectionHeading(
            containerEl,
            'Top-hub block in system prompt',
            { body: 'Hubs are the most-linked notes in your vault, the structural backbone of your knowledge graph (central index notes, MOCs, key topic pages). With this on, short summaries of your top 30 hubs are injected into every conversation\'s system prompt so the agent has a high-level map of your vault. Improves grounding for general questions, raises token cost on every call.' },
            { level: 'h4' },
        );

        const privacyWarn = containerEl.createEl('div', { cls: 'agent-settings-desc' });
        privacyWarn.createEl('strong', { text: 'Privacy notice: ' });
        privacyWarn.appendText(
            'When enabled, the summaries of your top 30 hub notes are sent to the LLM provider on '
            + 'EVERY conversation. Before enabling, check whether any of your hub notes contain '
            + 'sensitive data (journal entries, patient notes, business information). The setting '
            + 'can be revoked at any time, but data already sent to the provider remains with them.',
        );

        new Setting(containerEl)
            .setName('Privacy notice read and accepted')
            .setDesc('The top-hub block can only be enabled after this confirmation.')
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
            .setName('Enable top-hub block')
            .setDesc('Default off. Requires the privacy notice to be accepted first.')
            .addToggle((toggle) =>
                toggle
                    .setValue(cfg.topHubBlock.enabled)
                    .setDisabled(!cfg.topHubBlock.privacyAcknowledged)
                    .onChange(async (v) => {
                        if (v && !cfg.topHubBlock.privacyAcknowledged) {
                            new Notice('Please accept the privacy notice first.', 6000);
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
            enabledSetting.descEl.createEl('em', { text: '(disabled until privacy notice is accepted)' });
        }

        addSectionHeading(
            containerEl,
            'Hot clusters (periodic freshness lint)',
            { body: 'A "cluster" is a topic group derived from your vault\'s ontology (e.g. "AI", "Cooking"). A weekly background job checks whether the external world has moved on since your notes were last updated, but only for clusters you mark as "hot" below. Mark topics where currency matters (fast-moving fields, active projects). Default: none selected. A token budget caps the cost of each run.' },
            { level: 'h4' },
        );

        const store = this.plugin.clusterMetadataStore;
        if (!store) {
            containerEl.createEl('p', { cls: 'agent-settings-desc', text: 'Cluster metadata store not loaded.' });
        } else {
            const all = store.getAll();
            if (all.length === 0) {
                containerEl.createEl('p', {
                    cls: 'agent-settings-desc',
                    text: 'No clusters in the ontology yet. Run vault indexing first.',
                });
            } else {
                for (const cluster of all) {
                    new Setting(containerEl)
                        .setName(cluster.cluster)
                        .setDesc(`Half-life: ${cluster.halfLifeDays}d${cluster.lastExternalCheck ? '. Last check: ' + cluster.lastExternalCheck.split('T')[0] : ''}`)
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

        addSectionHeading(
            containerEl,
            'Activity hint on stale clusters',
            { body: 'When you open or edit a note in a cluster whose knowledge looks stale (low freshness score), the plugin can show a subtle notice offering to run an "anti-echo" search against external sources to surface what may have changed. Default off to avoid notice spam. Per-cluster cooldowns and a daily cap prevent repeated nagging.' },
            { level: 'h4' },
        );
        new Setting(containerEl)
            .setName('Enable activity hint')
            .setDesc('Shows subtle notices when you open or edit a note in a cluster that has not been refreshed in a while.')
            .addToggle((toggle) => {
                toggle.setValue(cfg.stufe2Hint.enabled).onChange(async (v) => {
                    cfg.stufe2Hint.enabled = v;
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName('Freshness score threshold')
            .setDesc('Hint fires when the cluster\'s freshness score drops below this value (0..100). Default 70.')
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
            .setName('Minimum days since last external check')
            .setDesc('Default 30. Prevents hints right after the periodic freshness lint already ran.')
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
            .setName('Cooldown per cluster (days)')
            .setDesc('Default 7. At most one hint per cluster within this period.')
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
            .setName('Max hints per day (global)')
            .setDesc('Default 5. Caps total hints on busy days to avoid notice spam.')
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
            'Manual actions',
            { body: 'One-off operations you can run on the whole vault: backfill missing frontmatter summaries, scan the inbox for auto-trigger matches, inject map-of-content markers into hub notes, or rebuild the cached top-hub block. Each action is idempotent and safe to re-run.' },
            { level: 'h4' },
        );
        new Setting(containerEl)
            .setName('Run frontmatter backfill')
            .setDesc('Iterates over all Markdown notes and adds missing frontmatter summaries. Requires the auto-summary toggle above to be enabled. Can take a while on large vaults.')
            .addButton((btn) => btn.setButtonText('Run backfill').onClick(() => { void this.plugin.runFrontmatterBackfill(); }));
        new Setting(containerEl)
            .setName('Run inbox triage now')
            .setDesc('Scans all notes that match the auto-trigger property and queues them as pending in the triage log.')
            .addButton((btn) => btn.setButtonText('Triage inbox').onClick(() => { void this.plugin.runInboxTriage(); }));
        new Setting(containerEl)
            .setName('Insert map-of-content markers')
            .setDesc('A map-of-content is a hub note that lists related notes. This action inserts the auto-generated marker block into all hub-candidate notes whose name matches a known cluster. Idempotent (safe to re-run).')
            .addButton((btn) => btn.setButtonText('Insert markers').onClick(() => { void this.plugin.injectInitialMOCMarkers(); }));
        new Setting(containerEl)
            .setName('Refresh map-of-content pages')
            .setDesc('Updates the auto-generated marker blocks inside hub pages. User-edited blocks are skipped.')
            .addButton((btn) => btn.setButtonText('Refresh hub pages').onClick(() => { void this.plugin.refreshAllMOCs(); }));
        new Setting(containerEl)
            .setName('Regenerate top-hub block')
            .setDesc('Manually rebuild the cached system-prompt block listing your top hubs. Otherwise it only refreshes when hub membership changes (with a 24h cooldown).')
            .addButton((btn) => btn.setButtonText('Regenerate').onClick(() => {
                if (!this.plugin.topHubBlockGenerator) { new Notice('Top-hub generator not available.'); return; }
                const r = this.plugin.topHubBlockGenerator.generate();
                this.plugin.topHubBlockState = r.state;
                this.plugin.topHubBlockMarkdown = r.block;
                new Notice(`Top-hub block regenerated: ${r.hubs.length} hubs.`);
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
            new Notice('Nothing migrated. Destination already had identical files.');
        } else {
            new Notice(
                `Migrated ${summaryParts.join(', ')}. Reload Obsidian so the knowledge and memory databases open at the new location.`,
                15_000,
            );
        }
    }
}
