import { geminiOAuthChoices } from './geminiOAuthSettings';
import { App, Modal, Notice, Setting, setIcon, ButtonComponent } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { FolderInputSuggest } from './FolderInputSuggest';
import { ModelConfigModal } from './ModelConfigModal';
import { addInfoButton, addSectionHeading } from './utils';
import { PROVIDER_LABELS, PROVIDER_COLORS } from './constants';
import type { CustomModel } from '../../types/settings';
import { getModelKey, OKF_DEFAULTS } from '../../types/settings';
import type { SemanticIndexService } from '../../core/semantic/SemanticIndexService';
import { scheduleRecurring } from '../../util/scheduleRecurring';
import { renderSkipHintIfSkipped } from './skipHints';
import { t } from '../../i18n';
import { RerankerService } from '../../core/knowledge/RerankerService';
import { OLLAMA_RERANKER_DEFAULT_MODEL, OLLAMA_RERANKER_DEFAULT_URL } from '../../core/knowledge/OllamaReranker';

export class EmbeddingsTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.embeddings.introTitle') });
        infoText.createDiv({ text: t('settings.embeddings.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        renderSkipHintIfSkipped(containerEl, this.plugin, 'embedding-model');
        this.buildIntroSection(containerEl);
        addSectionHeading(containerEl, t('settings.embeddings.headingModels'), { body: t('settings.embeddings.sectionModelsInfo') });

        const desc = containerEl.createDiv('model-table-desc');
        desc.setText(t('settings.embeddings.modelsDesc'));

        // Table header
        const table = containerEl.createDiv('model-table embedding-table');
        const header = table.createDiv('model-row model-row-header');
        header.createDiv({ cls: 'mc-name', text: t('settings.embeddings.headerModel') });
        header.createDiv({ cls: 'mc-provider', text: t('settings.embeddings.headerProvider') });
        header.createDiv({ cls: 'mc-key', text: t('settings.embeddings.headerKey') });
        header.createDiv({ cls: 'mc-enable', text: t('settings.embeddings.headerActive') });
        header.createDiv({ cls: 'mc-actions' });

        // Built-in local model (always first)
        if ((this.plugin.settings.embeddingModels ?? []).length === 0) {
            const emptyRow = table.createDiv('model-row');
            emptyRow.createDiv('mc-name').createSpan({
                text: t('settings.embeddings.empty'),
                cls: 'mc-name-text setting-item-description',
            });
        }

        // User-added API models
        const models = this.plugin.settings.embeddingModels ?? [];
        models.forEach((model) => this.renderEmbeddingRow(table, model));

        const footer = containerEl.createDiv('model-table-footer');
        const addBtn = footer.createEl('button', { cls: 'mod-cta model-add-btn', text: t('settings.embeddings.addModel') });
        addBtn.addEventListener('click', () => {
            new ModelConfigModal(this.app, null, (newModel) => { void (async () => {
                const key = getModelKey(newModel);
                if ((this.plugin.settings.embeddingModels ?? []).some((m) => getModelKey(m) === key)) {
                    new Notice(t('settings.embeddings.alreadyExists', { name: newModel.name }));
                    return;
                }
                if (!this.plugin.settings.embeddingModels) this.plugin.settings.embeddingModels = [];
                this.plugin.settings.embeddingModels.push(newModel);
                if (!this.plugin.settings.activeEmbeddingModelKey) {
                    this.plugin.settings.activeEmbeddingModelKey = key;
                }
                await this.plugin.saveSettings();
                this.rerender();
            })(); }, true /* forEmbedding */, geminiOAuthChoices(this.plugin.settings.providerConfigs ?? [])).open();
        });

        // ── Semantic Index ────────────────────────────────────────────────────
        addSectionHeading(containerEl, t('settings.embeddings.headingIndex'), { body: t('settings.embeddings.sectionIndexInfo') });

        const activeEmbModel = this.plugin.getActiveEmbeddingModel();
        const embModelDesc = activeEmbModel
            ? t('settings.embeddings.usingModel', { name: activeEmbModel.displayName ?? activeEmbModel.name, provider: activeEmbModel.provider })
            : t('settings.embeddings.noEmbeddingModel');

        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.embeddings.indexDesc', { embModelDesc }),
        });

        if (!activeEmbModel) {
            const guide = containerEl.createDiv({ cls: 'setting-item-description agent-embed-guide' });
            guide.createEl('strong', { text: t('settings.embeddings.quickSetupTitle') });
            guide.createEl('br');
            guide.appendText(t('settings.embeddings.quickSetupStep1'));
            guide.createEl('br');
            guide.appendText(t('settings.embeddings.quickSetupStep2'));
            guide.createEl('br');
            guide.appendText(t('settings.embeddings.quickSetupStep3'));
            guide.createEl('br');
            guide.createEl('br');
            guide.createEl('strong', { text: t('settings.embeddings.quickSetupFreeTitle') });
            guide.appendText(' ' + t('settings.embeddings.quickSetupFreeDesc'));
        }

        const getIdx = (): SemanticIndexService | null => this.plugin.semanticIndex;
        // statusEl: declared here for closure scope, assigned below in "Build index" setting
        let statusEl: HTMLElement = undefined as unknown as HTMLElement;

        const semanticEnableSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.enableIndex'))
            .setDesc(t('settings.embeddings.enableIndexDesc'));
        addInfoButton(semanticEnableSetting, t('settings.embeddings.infoIndexTitle'), t('settings.embeddings.infoIndexBody'));
        semanticEnableSetting.addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.enableSemanticIndex ?? false).onChange(async (v) => {
                this.plugin.settings.enableSemanticIndex = v;
                await this.plugin.saveSettings();
                if (v) {
                    const { SemanticIndexService } = await import('../../core/semantic/SemanticIndexService');
                    const { KnowledgeDB } = await import('../../core/knowledge/KnowledgeDB');
                    const { VectorStore } = await import('../../core/knowledge/VectorStore');
                    const pluginDir = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
                    const knowledgeDB = new KnowledgeDB(
                        this.plugin.app.vault,
                        pluginDir,
                        'global', // ADR-050: knowledge.db is always global
                    );
                    await knowledgeDB.open().catch(console.warn);
                    const vectorStore = new VectorStore(knowledgeDB);
                    this.plugin.knowledgeDB = knowledgeDB;
                    this.plugin.vectorStore = vectorStore;
                    const svc = new SemanticIndexService(this.plugin.app.vault, knowledgeDB, vectorStore);
                    const embModel = this.plugin.getActiveEmbeddingModel();
                    if (embModel) svc.setEmbeddingModel(embModel);
                    this.plugin.semanticIndex = svc;
                    await svc.initialize().catch(console.warn);
                } else {
                    // Cancel any ongoing build before clearing the reference
                    this.plugin.semanticIndex?.cancelBuild();
                    this.plugin.semanticIndex = null;
                    void this.plugin.knowledgeDB?.close().catch(console.warn);
                    this.plugin.knowledgeDB = null;
                    this.plugin.vectorStore = null;
                }
                refreshStatus();
            }),
        );

        new Setting(containerEl)
            .setName(t('settings.embeddings.indexPdfs'))
            .setDesc(t('settings.embeddings.indexPdfsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.semanticIndexPdfs ?? false).onChange(async (v) => {
                    this.plugin.settings.semanticIndexPdfs = v;
                    getIdx()?.configure({ indexPdfs: v });
                    await this.plugin.saveSettings();
                }),
            );

        // IMP-06-01-01: one-shot reindex of all PDFs. Hidden once the user
        // has completed a reindex pass (semanticIndexPdfs must also be on,
        // otherwise the PDFs have nothing to point at). Pre-FIX-06-01-01
        // PDF embeddings carry the "PDF Parser is not installed" placeholder;
        // this CTA replaces them with the freshly-parsed text.
        if (this.plugin.settings.semanticIndexPdfs && !this.plugin.settings._pdfReindexCompleted) {
            const reindexSetting = new Setting(containerEl)
                .setName(t('settings.embeddings.pdfReindexName'))
                .setDesc(t('settings.embeddings.pdfReindexDesc'));
            const progressEl = reindexSetting.descEl.createDiv('agent-pdf-reindex-progress');
            reindexSetting.addButton((btn) => {
                btn.setButtonText(t('settings.embeddings.pdfReindexButton')).setCta();
                btn.onClick(async () => {
                    const idx = getIdx();
                    if (!idx) return;
                    btn.setDisabled(true);
                    progressEl.setText(t('settings.embeddings.pdfReindexStarting'));
                    try {
                        const result = await idx.reindexPdfsOnly((indexed, total, current) => {
                            const label = current ? current.split('/').pop() : '';
                            progressEl.setText(t('settings.embeddings.pdfReindexProgress', { indexed, total, label: label ?? '' }));
                        });
                        this.plugin.settings._pdfReindexCompleted = true;
                        await this.plugin.saveSettings();
                        progressEl.setText(
                            result.skipped > 0
                                ? t('settings.embeddings.pdfReindexDoneSkipped', { indexed: result.indexed, total: result.total, skipped: result.skipped })
                                : t('settings.embeddings.pdfReindexDone', { indexed: result.indexed, total: result.total }),
                        );
                    } catch (e) {
                        progressEl.setText(t('notice.reindexFailed', { error: e instanceof Error ? e.message : String(e) }));
                        btn.setDisabled(false);
                    }
                });
            });
        }

        new Setting(containerEl)
            .setName(t('settings.embeddings.contextualRetrieval'))
            .setDesc(t('settings.embeddings.contextualRetrievalDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableContextualRetrieval ?? true).onChange(async (v) => {
                    this.plugin.settings.enableContextualRetrieval = v;
                    getIdx()?.configure({ enableContextualRetrieval: v });
                    await this.plugin.saveSettings();
                    if (v) {
                        // Auto-start enrichment when toggled on (if index exists + model configured)
                        void this.triggerEnrichmentIfReady();
                    } else {
                        // Cancel enrichment when toggled off
                        getIdx()?.cancelEnrichment();
                    }
                }),
            );

        // FEAT-24-08 Welle A follow-up (2026-05-18): the explicit
        // Contextual-Model dropdown was removed. `getContextualModel()`
        // falls back to the active provider's fast tier when no override
        // is set; the legacy `activeModels[]` it used to enumerate from
        // is empty after the EPIC-26 migration. The setting field
        // `contextualModelKey` is preserved as a data field.

        const buildSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.buildIndexName'))
            .setDesc(t('settings.embeddings.buildIndexDesc'));
        statusEl = buildSetting.descEl.createDiv('agent-semantic-status');
        let cancelBtn: ButtonComponent | undefined;

        const refreshStatus = () => {
            statusEl.empty();
            if (!this.plugin.settings.enableSemanticIndex) {
                statusEl.setText(t('settings.embeddings.statusDisabled'));
                return;
            }
            const idx = getIdx();
            if (!idx) {
                statusEl.setText(t('settings.embeddings.statusNotInit'));
                return;
            }
            if (idx.building) {
                if (idx.cancelling) {
                    // Cancel was requested; don't fight the "Cancelling" hint the
                    // click handler wrote (the build loop hasn't seen the abort yet).
                    statusEl.setText(t('settings.embeddings.statusCancelling'));
                    cancelBtn?.setDisabled(true);
                    return;
                }
                const p = idx.progressIndexed ?? idx.docCount;
                const total = idx.progressTotal ?? '?';
                statusEl.setText(t('settings.embeddings.statusBuildingProgress', { indexed: p, total }));
                // Keep cancel button enabled while building (covers auto-index on startup)
                cancelBtn?.setDisabled(false);
                return;
            }
            // Build not running — disable cancel button (unless enrichment is running)
            cancelBtn?.setDisabled(!idx.enriching);
            if (idx.isIndexed) {
                const br = idx.lastBuildResult;
                const base = t('settings.embeddings.statusReady', { docCount: idx.docCount, builtAt: (idx.lastBuiltAt as Date).toLocaleString() });
                if (br && br.errors > 0) {
                    statusEl.setText(`${base} · ${t('settings.embeddings.statusSkipped', { count: br.errors })}`);
                } else {
                    statusEl.setText(base);
                }
                // Enrichment progress (Pass 2)
                if (idx.enriching) {
                    const ep = idx.getEnrichmentProgress();
                    statusEl.createDiv('agent-enrichment-status').setText(
                        t('settings.embeddings.statusEnriching', { processed: ep.processed, total: ep.total }),
                    );
                } else {
                    const unenriched = this.plugin.vectorStore?.getUnenrichedCount() ?? 0;
                    if (unenriched > 0) {
                        statusEl.createDiv('agent-enrichment-hint').setText(
                            t('settings.embeddings.statusPendingEnrichment', { count: unenriched }),
                        );
                    }
                }
            } else {
                statusEl.setText(t('settings.embeddings.statusNotBuilt'));
            }
        };
        refreshStatus();

        // FIX-PERF-06: only refresh while the index is actually building
        // or enriching. Outside of that the status is stable and the
        // per-second SQL query against knowledge.db was wasted work.
        // One extra refresh fires on the active->idle transition, otherwise
        // the final tick would leave the last "Building (X/Y)" text frozen
        // (builds started by auto-index/sidebar never repaint via the button).
        let pollWasActive = false;
        const pollHandle = scheduleRecurring(() => {
            const idx = getIdx();
            const active = !!idx && (idx.building || idx.enriching);
            if (!active && !pollWasActive) return;
            pollWasActive = active;
            refreshStatus();
        }, 1000);
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of Array.from(m.removedNodes)) {
                    if (node === containerEl || (node as HTMLElement).contains?.(containerEl)) {
                        pollHandle.stop();
                        observer.disconnect();
                    }
                }
            }
        });
        if (containerEl.parentElement) observer.observe(containerEl.parentElement, { childList: true });

        buildSetting.addButton((btn) => {
                btn.setButtonText(t('settings.embeddings.buildIndex')).onClick(async () => {
                    const idx = getIdx();
                    if (!idx) { new Notice(t('settings.embeddings.enableFirst')); return; }
                    if (idx.building) { new Notice(t('settings.embeddings.alreadyBuilding')); return; }
                    idx.setEmbeddingModel(this.plugin.getActiveEmbeddingModel() ?? null);
                    btn.setButtonText(t('settings.embeddings.building')).setDisabled(true);
                    cancelBtn?.setDisabled(false);
                    statusEl.setText(t('settings.embeddings.statusBuilding'));
                    try {
                        const result = await idx.buildIndex((indexed: number, total: number) => {
                            statusEl.setText(`${t('settings.embeddings.building')} (${indexed}/${total})`);
                        });
                        if (result.errors > 0) {
                            new Notice(t('settings.embeddings.indexBuilt', { indexed: result.indexed, total: result.total, errors: result.errors }));
                        }
                        refreshStatus();
                    } catch (e) {
                        statusEl.setText(t('settings.embeddings.statusBuildFailed', { error: (e as Error).message }));
                    } finally {
                        btn.setButtonText(t('settings.embeddings.buildIndex')).setDisabled(false);
                        cancelBtn?.setDisabled(true);
                    }
                });
            })
            .addButton((btn) => {
                btn.setButtonText(t('settings.embeddings.forceRebuild')).onClick(async () => {
                    const idx = getIdx();
                    if (!idx) { new Notice(t('settings.embeddings.enableFirst')); return; }
                    if (idx.building) { new Notice(t('settings.embeddings.alreadyBuilding')); return; }
                    idx.setEmbeddingModel(this.plugin.getActiveEmbeddingModel() ?? null);
                    btn.setButtonText(t('settings.embeddings.rebuilding')).setDisabled(true);
                    cancelBtn?.setDisabled(false);
                    statusEl.setText(t('settings.embeddings.statusForceRebuild'));
                    try {
                        const result = await idx.buildIndex((indexed: number, total: number) => {
                            statusEl.setText(`${t('settings.embeddings.rebuilding')} (${indexed}/${total})`);
                        }, true);
                        // Reclaim the pages freed by the delete-and-reinsert so
                        // the on-disk DB shrinks instead of staying inflated.
                        if (!result.cancelled) {
                            statusEl.setText(t('settings.embeddings.statusCompacting'));
                            await idx.compact();
                        }
                        if (result.errors > 0) {
                            new Notice(t('settings.embeddings.indexRebuilt', { indexed: result.indexed, total: result.total, errors: result.errors }));
                        }
                        refreshStatus();
                    } catch (e) {
                        statusEl.setText(t('settings.embeddings.statusRebuildFailed', { error: (e as Error).message }));
                    } finally {
                        btn.setButtonText(t('settings.embeddings.forceRebuild')).setDisabled(false);
                        cancelBtn?.setDisabled(true);
                    }
                });
            });

        new Setting(containerEl)
            .setName(t('settings.embeddings.cancelIndexing'))
            .setDesc(t('settings.embeddings.cancelIndexingDesc'))
            .addButton((btn) => {
                cancelBtn = btn;
                // Enable while build OR enrichment is running (cancelBuild cancels both).
                const idxNow = getIdx();
                const active = !!(idxNow && (idxNow.building || idxNow.enriching));
                btn.setButtonText(t('settings.embeddings.cancel'))
                    .setDisabled(!active)
                    .onClick(() => {
                        console.debug('[EmbeddingsTab] Cancel indexing clicked');
                        const idx = getIdx();
                        if (!idx) {
                            new Notice(t('settings.embeddings.enableFirst'));
                            return;
                        }
                        if (!idx.building && !idx.enriching) {
                            new Notice(t('settings.embeddings.alreadyBuilding'));
                            return;
                        }
                        idx.cancelBuild();
                        btn.setDisabled(true);
                        statusEl.setText(t('settings.embeddings.statusCancelling'));
                    });
            });

        new Setting(containerEl)
            .setName(t('settings.embeddings.deleteIndexName'))
            .setDesc(t('settings.embeddings.deleteIndexDesc'))
            .addButton((btn) => {
                btn.setButtonText(t('settings.embeddings.deleteIndex')).onClick(async () => {
                    console.debug('[EmbeddingsTab] Delete index clicked');
                    let confirmed = false;
                    try {
                        confirmed = await this.confirmDestructive(
                            t('settings.embeddings.deleteConfirmTitle'),
                            t('settings.embeddings.deleteConfirmMessage'),
                        );
                    } catch (e) {
                        console.warn('[EmbeddingsTab] Confirm modal failed:', e);
                        new Notice(String((e as Error).message ?? e));
                        return;
                    }
                    if (!confirmed) return;
                    const idx = getIdx();
                    if (!idx) {
                        new Notice(t('settings.embeddings.enableFirst'));
                        return;
                    }
                    try {
                        await idx.deleteIndex();
                    } catch (e) {
                        console.warn('[EmbeddingsTab] deleteIndex failed:', e);
                        new Notice(String((e as Error).message ?? e));
                    }
                    refreshStatus();
                });
            });

        // ── Index configuration ───────────────────────────────────────────────
        addSectionHeading(containerEl, t('settings.embeddings.headingConfig'), { body: t('settings.embeddings.sectionConfigInfo') });

        const batchSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.checkpointInterval'))
            .setDesc(t('settings.embeddings.checkpointIntervalDesc'));
        addInfoButton(batchSetting, t('settings.embeddings.infoCheckpointTitle'), t('settings.embeddings.infoCheckpointBody'));
        batchSetting.addSlider((s) =>
            s.setLimits(10, 200, 10)
                .setValue(this.plugin.settings.semanticBatchSize ?? 50)
                .onChange(async (v) => {
                    this.plugin.settings.semanticBatchSize = v;
                    getIdx()?.configure({ batchSize: v });
                    await this.plugin.saveSettings();
                }),
        );

        const chunkSizeSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.chunkSize'))
            .setDesc(t('settings.embeddings.chunkSizeDesc'));
        chunkSizeSetting.addDropdown((d) =>
            d.addOptions({
                '800':  t('settings.embeddings.chunkSmall'),
                '1200': t('settings.embeddings.chunkMedium'),
                '2000': t('settings.embeddings.chunkStandard'),
                '3000': t('settings.embeddings.chunkLarge'),
            })
                .setValue(String(this.plugin.settings.semanticChunkSize ?? 2000))
                .onChange(async (v) => {
                    const newSize = parseInt(v, 10);
                    this.plugin.settings.semanticChunkSize = newSize;
                    getIdx()?.configure({ chunkSize: newSize });
                    await this.plugin.saveSettings();
                    new Notice(t('settings.embeddings.chunkSizeUpdated'));
                }),
        );

        const hydeSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.hyde'))
            .setDesc(t('settings.embeddings.hydeDesc'));
        addInfoButton(hydeSetting, t('settings.embeddings.infoHydeTitle'), t('settings.embeddings.infoHydeBody'));
        hydeSetting.addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.hydeEnabled ?? false).onChange(async (v) => {
                this.plugin.settings.hydeEnabled = v;
                await this.plugin.saveSettings();
            }),
        );

        const autoIndexOnChangeSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.autoIndexOnChange'))
            .setDesc(t('settings.embeddings.autoIndexOnChangeDesc'));
        autoIndexOnChangeSetting.descEl.createDiv({
            cls: 'setting-risk-note',
            text: t('settings.embeddings.riskNote'),
        });
        addInfoButton(autoIndexOnChangeSetting, t('settings.embeddings.infoAutoChangeTitle'), t('settings.embeddings.infoAutoChangeBody'));
        autoIndexOnChangeSetting.addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.semanticAutoIndexOnChange ?? false).onChange(async (v) => {
                this.plugin.settings.semanticAutoIndexOnChange = v;
                await this.plugin.saveSettings();
                new Notice(v ? t('settings.embeddings.autoIndexEnabled') : t('settings.embeddings.autoIndexDisabled'));
            }),
        );

        // Issue #62: Ollama keeps the embedding model resident in VRAM for its
        // own 5min default after each request. VO cannot shorten that on the
        // OpenAI-compatible /v1 path, so offer an opt-in keep_alive that routes
        // Ollama embeddings to the native /api/embed endpoint. Only shown when
        // the active embedding model is served by Ollama.
        if (activeEmbModel?.provider === 'ollama') {
            const keepAliveSetting = new Setting(containerEl)
                .setName(t('settings.embeddings.ollamaKeepAlive'))
                .setDesc(t('settings.embeddings.ollamaKeepAliveDesc'));
            addInfoButton(keepAliveSetting, t('settings.embeddings.infoKeepAliveTitle'), t('settings.embeddings.infoKeepAliveBody'));
            keepAliveSetting.addText((text) =>
                text
                    .setPlaceholder('5m')
                    .setValue(this.plugin.settings.embeddingKeepAlive ?? '')
                    .onChange(async (v) => {
                        const value = v.trim();
                        this.plugin.settings.embeddingKeepAlive = value;
                        await this.plugin.saveSettings();
                        // Live-apply so the next embedding call honours it without a reload.
                        this.plugin.semanticIndex?.configure({ embeddingKeepAlive: value });
                    }),
            );
        }

        const autoIndexSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.autoIndexStrategy'))
            .setDesc(t('settings.embeddings.autoIndexStrategyDesc'));
        addInfoButton(autoIndexSetting, t('settings.embeddings.infoAutoStrategyTitle'), t('settings.embeddings.infoAutoStrategyBody'));
        autoIndexSetting.addDropdown((d) =>
            d.addOptions({
                never: t('settings.embeddings.autoIndexNever'),
                startup: t('settings.embeddings.autoIndexStartup'),
                'mode-switch': t('settings.embeddings.autoIndexModeSwitch'),
            })
                .setValue(this.plugin.settings.semanticAutoIndex ?? 'never')
                .onChange(async (v) => {
                    this.plugin.settings.semanticAutoIndex = v as 'startup' | 'mode-switch' | 'never';
                    await this.plugin.saveSettings();
                }),
        );

        const excludedSetting = new Setting(containerEl)
            .setName(t('settings.embeddings.excludedFolders'))
            .setDesc(t('settings.embeddings.excludedFoldersDesc'));
        addInfoButton(excludedSetting, t('settings.embeddings.infoExcludedTitle'), t('settings.embeddings.infoExcludedBody'));

        const excludedFolders = this.plugin.settings.semanticExcludedFolders ?? [];

        // Chip list as a separate row below the setting, full width
        const excludedListEl = containerEl.createDiv('excluded-folder-list');
        const renderExcludedList = () => {
            excludedListEl.empty();
            const current = this.plugin.settings.semanticExcludedFolders ?? [];
            for (const folder of current) {
                const chip = excludedListEl.createDiv('excluded-folder-chip');
                chip.createSpan({ text: folder });
                const removeBtn = chip.createSpan({ cls: 'excluded-folder-remove' });
                setIcon(removeBtn, 'x');
                removeBtn.addEventListener('click', () => {
                    this.plugin.settings.semanticExcludedFolders =
                        (this.plugin.settings.semanticExcludedFolders ?? []).filter((f) => f !== folder);
                    getIdx()?.configure({ excludedFolders: this.plugin.settings.semanticExcludedFolders });
                    void this.plugin.saveSettings();
                    renderExcludedList();
                });
            }
        };
        renderExcludedList();

        const folderInput = excludedSetting.controlEl.createEl('input', {
            cls: 'excluded-folder-input',
            attr: { type: 'text', placeholder: t('settings.embeddings.folderPlaceholder') },
        });

        // Folder suggest dropdown
        const suggest = new FolderInputSuggest(this.app, folderInput, excludedFolders);
        suggest.onPick = (folderPath: string) => { void (async () => {
            if (!this.plugin.settings.semanticExcludedFolders) this.plugin.settings.semanticExcludedFolders = [];
            if (!this.plugin.settings.semanticExcludedFolders.includes(folderPath)) {
                this.plugin.settings.semanticExcludedFolders.push(folderPath);
                getIdx()?.configure({ excludedFolders: this.plugin.settings.semanticExcludedFolders });
                await this.plugin.saveSettings();
                renderExcludedList();
            }
            folderInput.value = '';
        })(); };

        folderInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = folderInput.value.trim();
                if (val) {
                    void suggest.onPick(val);
                }
            }
        });

        // Storage location removed from UI (ADR-050: knowledge.db is always global)

        // ── Graph Expansion (FEATURE-1502) ─────────────────────────────────
        addSectionHeading(containerEl, t('settings.embeddings.headingGraph'), { body: t('settings.embeddings.sectionGraphInfo') });

        new Setting(containerEl)
            .setName(t('settings.embeddings.graphExpansion'))
            .setDesc(t('settings.embeddings.graphExpansionDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableGraphExpansion ?? true).onChange(async (v) => {
                    this.plugin.settings.enableGraphExpansion = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.embeddings.expansionHops'))
            .setDesc(t('settings.embeddings.expansionHopsDesc'))
            .addDropdown((d) => {
                d.addOption('1', t('settings.embeddings.hops1'));
                d.addOption('2', t('settings.embeddings.hops2'));
                d.addOption('3', t('settings.embeddings.hops3'));
                d.setValue(String(this.plugin.settings.graphExpansionHops ?? 1));
                d.onChange(async (v) => {
                    this.plugin.settings.graphExpansionHops = parseInt(v, 10);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(t('settings.embeddings.mocProperties'))
            .setDesc(t('settings.embeddings.mocPropertiesDesc'))
            .addText((text) => {
                text.setValue((this.plugin.settings.mocPropertyNames ?? []).join(', '));
                text.setPlaceholder(t('settings.embeddings.mocPropertiesPlaceholder'));
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    const names = text.getValue().split(',').map(s => s.trim()).filter(Boolean);
                    this.plugin.settings.mocPropertyNames = names;
                    // FIX-19-01-15: kein setMocProperties mehr -- der Extractor
                    // liest die Settings bei der naechsten Extraktion selbst.
                    await this.plugin.saveSettings();
                })(); });
            });

        // Knowledge Properties (FEATURE-1903). Property names are vault
        // schema following OKF (FIX-42-01-01), not UI language.
        new Setting(containerEl)
            .setName(t('settings.embeddings.categoryProperty'))
            .setDesc(t('settings.embeddings.categoryPropertyDesc'))
            .addText((text) => {
                text.setValue(this.plugin.settings.categoryProperty ?? OKF_DEFAULTS.categoryProperty);
                text.setPlaceholder(OKF_DEFAULTS.categoryProperty);
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    this.plugin.settings.categoryProperty = text.getValue().trim() || OKF_DEFAULTS.categoryProperty;
                    await this.plugin.saveSettings();
                })(); });
            });

        // FIX-19-01-01: backlinks property the Vault Health repair
        // writes the reverse-edge wikilinks into. Must match the
        // property name already used in user notes.
        new Setting(containerEl)
            .setName(t('settings.embeddings.backlinksProperty'))
            .setDesc(t('settings.embeddings.backlinksPropertyDesc'))
            .addText((text) => {
                text.setValue(this.plugin.settings.backlinksProperty ?? OKF_DEFAULTS.backlinksProperty);
                text.setPlaceholder(OKF_DEFAULTS.backlinksProperty);
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    this.plugin.settings.backlinksProperty = text.getValue().trim() || OKF_DEFAULTS.backlinksProperty;
                    await this.plugin.saveSettings();
                })(); });
            });

        new Setting(containerEl)
            .setName(t('settings.embeddings.summaryProperty'))
            .setDesc(t('settings.embeddings.summaryPropertyDesc'))
            .addText((text) => {
                text.setValue(this.plugin.settings.summaryProperty ?? OKF_DEFAULTS.summaryProperty);
                text.setPlaceholder(OKF_DEFAULTS.summaryProperty);
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    this.plugin.settings.summaryProperty = text.getValue().trim() || OKF_DEFAULTS.summaryProperty;
                    await this.plugin.saveSettings();
                })(); });
            });

        new Setting(containerEl)
            .setName(t('settings.embeddings.sourceNaming'))
            .setDesc(t('settings.embeddings.sourceNamingDesc'))
            .addText((text) => {
                text.setValue(this.plugin.settings.sourceNamingConvention ?? OKF_DEFAULTS.sourceNamingConvention);
                text.setPlaceholder(OKF_DEFAULTS.sourceNamingConvention);
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    this.plugin.settings.sourceNamingConvention = text.getValue().trim() || OKF_DEFAULTS.sourceNamingConvention;
                    await this.plugin.saveSettings();
                })(); });
            });

        // FIX-42-01-01: one-click reset for vaults migrated to the OKF
        // vocabulary. Persisted values are never auto-migrated because
        // existing notes match whatever names the user configured.
        new Setting(containerEl)
            .setName(t('settings.embeddings.okfReset'))
            .setDesc(t('settings.embeddings.okfResetDesc'))
            .addButton((btn) =>
                btn.setButtonText(t('settings.embeddings.okfResetButton')).onClick(() => { void (async () => {
                    this.plugin.settings.mocPropertyNames = [...OKF_DEFAULTS.mocPropertyNames];
                    this.plugin.settings.categoryProperty = OKF_DEFAULTS.categoryProperty;
                    this.plugin.settings.backlinksProperty = OKF_DEFAULTS.backlinksProperty;
                    this.plugin.settings.summaryProperty = OKF_DEFAULTS.summaryProperty;
                    this.plugin.settings.sourceNamingConvention = OKF_DEFAULTS.sourceNamingConvention;
                    await this.plugin.saveSettings();
                    new Notice(t('settings.embeddings.okfResetDone'));
                    this.rerender();
                })(); }),
            );

        // Graph statistics
        const graphStats = containerEl.createDiv('agent-settings-desc');
        if (this.plugin.graphStore) {
            const edges = this.plugin.graphStore.getEdgeCount();
            const tags = this.plugin.graphStore.getTagCount();
            graphStats.setText(t('settings.embeddings.graphStats', { edges, tags }));
        } else {
            graphStats.setText(t('settings.embeddings.graphNotInit'));
        }

        // ── Implicit Connections (FEATURE-1503) ──────────────────────────────
        addSectionHeading(containerEl, t('settings.embeddings.headingImplicit'), { body: t('settings.embeddings.sectionImplicitInfo') });

        new Setting(containerEl)
            .setName(t('settings.embeddings.implicitConnections'))
            .setDesc(t('settings.embeddings.implicitConnectionsDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableImplicitConnections ?? true).onChange(async (v) => {
                    this.plugin.settings.enableImplicitConnections = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.embeddings.similarityThreshold'))
            .setDesc(t('settings.embeddings.similarityThresholdDesc'))
            .addSlider((s) =>
                s.setLimits(0.5, 0.9, 0.05)
                    .setValue(this.plugin.settings.implicitThreshold ?? 0.7)
                    .onChange(async (v) => {
                        this.plugin.settings.implicitThreshold = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('settings.embeddings.suggestionBanner'))
            .setDesc(t('settings.embeddings.suggestionBannerDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableSuggestionBanner ?? true).onChange(async (v) => {
                    this.plugin.settings.enableSuggestionBanner = v;
                    await this.plugin.saveSettings();
                }),
            );

        const implicitStats = containerEl.createDiv('agent-settings-desc');
        const implicitCount = this.plugin.implicitConnectionService?.getCount() ?? 0;
        if (implicitCount > 0) {
            implicitStats.setText(t('settings.embeddings.implicitStats', { count: implicitCount }));
        } else if (this.plugin.implicitConnectionService?.computing) {
            implicitStats.setText(t('settings.embeddings.implicitComputing'));
        } else {
            implicitStats.setText(t('settings.embeddings.implicitNone'));
        }

        // ── Local Reranking (FEATURE-1504) ───────────────────────────────────
        addSectionHeading(containerEl, t('settings.embeddings.headingReranking'), { body: t('settings.embeddings.sectionRerankingInfo') });

        new Setting(containerEl)
            .setName(t('settings.embeddings.localReranking'))
            .setDesc(t('settings.embeddings.localRerankingDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableReranking ?? true).onChange(async (v) => {
                    this.plugin.settings.enableReranking = v;
                    await this.plugin.saveSettings();
                    if (!v) {
                        this.plugin.rerankerService?.unload();
                        this.plugin.rerankerService = null;
                    }
                    if (v && !this.plugin.rerankerService) {
                        const { RerankerService } = await import('../../core/knowledge/RerankerService');
                        this.plugin.rerankerService = new RerankerService(this.plugin);
                        void this.plugin.rerankerService.loadModel();
                    }
                }),
            );

        this.buildOllamaRerankerSettings(containerEl);

        // Reranker model asset (Phase 2: optional download instead of inline)
        void this.renderRerankerAssetBlock(containerEl);

        new Setting(containerEl)
            .setName(t('settings.embeddings.rerankCandidates'))
            .setDesc(t('settings.embeddings.rerankCandidatesDesc'))
            .addSlider((s) =>
                s.setLimits(10, 30, 5)
                    .setValue(this.plugin.settings.rerankCandidates ?? 20)
                    .onChange(async (v) => {
                        this.plugin.settings.rerankCandidates = v;
                        await this.plugin.saveSettings();
                    }),
            );

    }

    private resetReranker(localAssetRemoved = false): void {
        this.plugin.rerankerService?.unload();
        const available = this.plugin.settings.enableReranking && (!localAssetRemoved || this.plugin.settings.rerankerBackend === 'ollama');
        this.plugin.rerankerService = available ? new RerankerService(this.plugin) : null;
        if (this.plugin.rerankerService) void this.plugin.rerankerService.loadModel();
    }

    private buildOllamaRerankerSettings(containerEl: HTMLElement): void {
        const enabled = this.plugin.settings.rerankerBackend === 'ollama';
        new Setting(containerEl)
            .setName(t('settings.embeddings.ollamaReranker'))
            .setDesc(t('settings.embeddings.ollamaRerankerDesc'))
            .addToggle(toggle => toggle.setValue(enabled).onChange(async value => {
                this.plugin.settings.rerankerBackend = value ? 'ollama' : 'local';
                await this.plugin.saveSettings();
                this.resetReranker();
                this.rerender();
            }));
        if (!enabled) return;

        new Setting(containerEl).setName(t('settings.embeddings.ollamaRerankerUrl'))
            .addText(text => text.setPlaceholder(OLLAMA_RERANKER_DEFAULT_URL)
                .setValue(this.plugin.settings.ollamaRerankerUrl || OLLAMA_RERANKER_DEFAULT_URL)
                .onChange(async value => {
                    this.plugin.settings.ollamaRerankerUrl = value.trim();
                    await this.plugin.saveSettings();
                    this.resetReranker();
                }));
        new Setting(containerEl).setName(t('settings.embeddings.ollamaRerankerModel'))
            .addText(text => text.setPlaceholder(OLLAMA_RERANKER_DEFAULT_MODEL)
                .setValue(this.plugin.settings.ollamaRerankerModel || OLLAMA_RERANKER_DEFAULT_MODEL)
                .onChange(async value => {
                    this.plugin.settings.ollamaRerankerModel = value.trim();
                    await this.plugin.saveSettings();
                    this.resetReranker();
                }));
        const probe = new Setting(containerEl).setName(t('settings.embeddings.ollamaRerankerTest'))
            .setDesc(t('settings.embeddings.ollamaRerankerTestDesc'));
        const status = probe.descEl.createDiv();
        let testing = false;
        probe.addButton(button => button.setButtonText(t('settings.embeddings.ollamaRerankerTest')).onClick(async () => {
            if (testing) return;
            testing = true;
            button.setDisabled(true);
            status.setText(t('settings.embeddings.ollamaRerankerTesting'));
            try {
                // The service owns cancellation on settings changes and plugin unload.
                this.plugin.rerankerService ??= new RerankerService(this.plugin);
                await this.plugin.rerankerService.testOllamaConnection();
                status.setText(t('settings.embeddings.ollamaRerankerTestOk'));
            } catch (error) {
                status.setText(t('settings.embeddings.ollamaRerankerTestFailed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                }));
            } finally {
                testing = false;
                button.setDisabled(false);
            }
        }));
    }

    /**
     * Phase 2: Install/Remove block for the optional ONNX reranker model.
     * The asset lives in the user's vault, not in pluginDir, so the
     * plugin never patches its own folder. Install is explicit (button)
     * and verified by SHA256.
     */
    private async renderRerankerAssetBlock(containerEl: HTMLElement): Promise<void> {
        const { OptionalAssetManager, buildRerankerSpec } = await import('../../core/assets/OptionalAssetManager');
        const { RERANKER_WASM_SHA256 } = await import('../../core/assets/assetHashes');
        const manager = new OptionalAssetManager(this.plugin);
        const spec = buildRerankerSpec(this.plugin.manifest.version, RERANKER_WASM_SHA256);

        const setting = new Setting(containerEl)
            .setName(t('settings.embeddings.rerankerAssetName', { sizeMb: spec.sizeMb }))
            .setDesc(`${spec.description} ${t('settings.embeddings.rerankerAssetStorageNote')}`);

        const statusEl = setting.descEl.createDiv({ cls: 'reranker-asset-status' });
        statusEl.setCssStyles({ marginTop: '6px' });
        statusEl.setCssStyles({ fontSize: '0.85em' });
        statusEl.setCssStyles({ opacity: '0.8' });
        let installBtn: HTMLButtonElement | null = null;
        let removeBtn: HTMLButtonElement | null = null;

        const renderStatus = async (): Promise<void> => {
            const snap = await manager.snapshot(spec);
            statusEl.empty();
            if (snap.status === 'installed') {
                statusEl.setText(t('settings.embeddings.rerankerStatusInstalled'));
                statusEl.setCssStyles({ color: 'var(--text-success)' });
                if (installBtn) installBtn.setCssStyles({ display: 'none' });
                if (removeBtn) removeBtn.setCssStyles({ display: '' });
            } else if (snap.status === 'outdated') {
                statusEl.setText(t('settings.embeddings.rerankerStatusOutdated'));
                statusEl.setCssStyles({ color: 'var(--text-warning)' });
                if (installBtn) { installBtn.setCssStyles({ display: '' }); installBtn.setText(t('settings.embeddings.reinstall')); }
                if (removeBtn) removeBtn.setCssStyles({ display: '' });
            } else if (snap.status === 'error') {
                statusEl.setText(t('settings.embeddings.rerankerStatusError', { error: snap.errorMessage ?? t('settings.embeddings.rerankerErrorUnknown') }));
                statusEl.setCssStyles({ color: 'var(--text-error)' });
                if (installBtn) installBtn.setCssStyles({ display: '' });
                if (removeBtn) removeBtn.setCssStyles({ display: 'none' });
            } else {
                statusEl.setText(t('settings.embeddings.rerankerStatusNotInstalled'));
                statusEl.setCssStyles({ color: 'var(--text-muted)' });
                if (installBtn) { installBtn.setCssStyles({ display: '' }); installBtn.setText(t('settings.embeddings.install')); }
                if (removeBtn) removeBtn.setCssStyles({ display: 'none' });
            }
        };

        setting.addButton((btn) => {
            installBtn = btn.buttonEl;
            btn.setButtonText(t('settings.embeddings.install'))

                .onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText(t('settings.embeddings.downloading'));
                    try {
                        await manager.install(spec);
                        new Notice(t('notice.assets.installed', { label: spec.label }));
                        if (this.plugin.rerankerService) {
                            this.resetReranker();
                        }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        new Notice(t('notice.assets.installFailed', { error: msg }), 10_000);
                    } finally {
                        btn.setDisabled(false);
                        await renderStatus();
                    }
                });
        });

        setting.addButton((btn) => {
            removeBtn = btn.buttonEl;
            btn.setButtonText(t('settings.embeddings.removeModel'))

                .onClick(async () => {
                    const ok = await this.confirmDestructive(
                        t('settings.embeddings.rerankerRemoveConfirmTitle'),
                        t('settings.embeddings.rerankerRemoveConfirmMessage', { filename: spec.filename }),
                    );
                    if (!ok) return;
                    try {
                        await manager.remove(spec);
                        new Notice(t('notice.assets.rerankerRemoved'));
                        this.resetReranker(true);
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        new Notice(t('notice.assets.removeFailed', { error: msg }));
                    } finally {
                        await renderStatus();
                    }
                });
        });

        // File-picker fallback: useful when the GitHub release does not
        // ship the asset yet (e.g. local plugin-dev workflow).
        setting.addExtraButton((btn) => {
            btn.setIcon('upload')
                .setTooltip(t('settings.embeddings.installFromFileTooltip'))
                .onClick(async () => {
                    const { pickAndInstallAsset } = await import('./installFromFile');
                    pickAndInstallAsset(manager, spec, async () => {
                        if (this.plugin.rerankerService) {
                            this.resetReranker();
                        }
                        await renderStatus();
                    });
                });
        });

        await renderStatus();
    }

    /** Start background enrichment if all prerequisites are met. */
    private async triggerEnrichmentIfReady(): Promise<void> {
        const idx = this.plugin.semanticIndex;
        if (!idx || !idx.isIndexed || idx.enriching || idx.building) return;
        if (!this.plugin.settings.enableContextualRetrieval) return;

        // FEAT-24-08 Welle A: resolver falls back to active-provider
        // fast-tier when no explicit key is set, so enrichment survives
        // the EPIC-26 migration to provider-only config.
        const ctxModel = this.plugin.getContextualModel();
        if (!ctxModel) return;

        const { buildApiHandlerForModel } = await import('../../api/index');
        idx.setContextualApiHandler(buildApiHandlerForModel(ctxModel));
        void idx.runBackgroundEnrichment();
    }

    renderEmbeddingRow(table: HTMLElement, model: CustomModel): void {
        const key = getModelKey(model);
        const hasKey = !!model.apiKey || model.provider === 'ollama' || model.provider === 'lmstudio';
        const isActive = this.plugin.settings.activeEmbeddingModelKey === key;

        const row = table.createDiv(`model-row${isActive ? ' model-row-active' : ''}`);

        row.createDiv('mc-name').createSpan({ text: model.displayName ?? model.name, cls: 'mc-name-text' });

        const provEl = row.createDiv('mc-provider');
        const badge = provEl.createSpan({ cls: 'provider-badge', text: PROVIDER_LABELS[model.provider] ?? model.provider });
        badge.setCssProps({ '--provider-bg': PROVIDER_COLORS[model.provider] ?? '#607d8b' });

        const keyEl = row.createDiv('mc-key');
        const keyIcon = keyEl.createSpan('mc-key-icon');
        setIcon(keyIcon, hasKey ? 'check' : 'minus');
        keyEl.addClass(hasKey ? 'mc-key-ok' : 'mc-key-missing');

        // Active radio-style toggle
        const enableEl = row.createDiv('mc-enable');
        const toggle = enableEl.createEl('input', { attr: { type: 'radio', name: 'active-embedding' } });
        toggle.checked = isActive;
        toggle.addEventListener('change', () => { void (async () => {
            if (toggle.checked) {
                this.plugin.settings.activeEmbeddingModelKey = key;
                await this.plugin.saveSettings();
                this.rerender();
            }
        })(); });

        const actionsEl = row.createDiv('mc-actions');
        const configBtn = actionsEl.createEl('button', { cls: 'mc-action-btn', attr: { title: t('settings.embeddings.configureModel') } });
        setIcon(configBtn, 'settings');
        configBtn.addEventListener('click', () => {
            new ModelConfigModal(this.app, { ...model }, (updated) => { void (async () => {
                const idx = (this.plugin.settings.embeddingModels ?? []).findIndex((m) => getModelKey(m) === key);
                if (idx !== -1) this.plugin.settings.embeddingModels[idx] = updated;
                if (this.plugin.settings.activeEmbeddingModelKey === key) {
                    this.plugin.settings.activeEmbeddingModelKey = getModelKey(updated);
                }
                await this.plugin.saveSettings();
                this.rerender();
            })(); }, true /* forEmbedding */, geminiOAuthChoices(this.plugin.settings.providerConfigs ?? [])).open();
        });

        const delBtn = actionsEl.createEl('button', { cls: 'mc-action-btn mc-action-del', attr: { title: t('settings.embeddings.removeModel') } });
        setIcon(delBtn, 'trash');
        delBtn.addEventListener('click', () => { void (async () => {
            this.plugin.settings.embeddingModels = (this.plugin.settings.embeddingModels ?? []).filter(
                (m) => getModelKey(m) !== key,
            );
            if (this.plugin.settings.activeEmbeddingModelKey === key) {
                this.plugin.settings.activeEmbeddingModelKey = this.plugin.settings.embeddingModels[0]
                    ? getModelKey(this.plugin.settings.embeddingModels[0])
                    : '';
            }
            await this.plugin.saveSettings();
            this.rerender();
        })(); });
    }


    // ---------------------------------------------------------------------------
    // Web Search tab (under Providers)
    // ---------------------------------------------------------------------------

    // ---------------------------------------------------------------------------
    // Confirmation dialog for destructive actions
    // ---------------------------------------------------------------------------

    private confirmDestructive(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            // Modal.close() calls onClose() synchronously. If we called
            // this.close() before resolve(true), onClose's resolve(false)
            // would win and Delete Index would silently no-op. Latch the
            // decision first, then close.
            let decided = false;
            const decide = (result: boolean): void => {
                if (decided) return;
                decided = true;
                resolve(result);
            };
            const modal = new (class extends Modal {
                onOpen(): void {
                    const { contentEl } = this;
                    contentEl.createEl('h3', { text: title });
                    contentEl.createEl('p', { text: message, cls: 'agent-setting-confirm-message' });

                    const btnRow = contentEl.createDiv('agent-setting-confirm-buttons');
                    const cancelBtn = btnRow.createEl('button', { text: t('settings.embeddings.cancel') });
                    const confirmBtn = btnRow.createEl('button', {
                        text: t('settings.embeddings.deleteConfirmAccept'),
                        cls: 'mod-warning',
                    });
                    cancelBtn.addEventListener('click', () => { decide(false); this.close(); });
                    confirmBtn.addEventListener('click', () => { decide(true); this.close(); });
                }
                onClose(): void {
                    decide(false);
                }
            })(this.app);
            modal.open();
        });
    }
}

/** Suggest dropdown that lists vault folders, filtered by input text. */
