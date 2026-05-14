/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * VaultHealthRepairModal -- Findings view with selective repair, discuss, and skip.
 *
 * Shows each finding with checkboxes (repairable), discuss (all), and skip (all).
 * Discuss opens a new agent chat. Skip persists the dismissal in KnowledgeDB.
 *
 * FEATURE-1901: Vault Health Check
 * FIX-15: Detailed findings + selective repair
 */

import { Modal, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { VIEW_TYPE_AGENT_SIDEBAR } from '../AgentSidebarView';
import type { HealthFinding, HealthCheckType } from '../../core/knowledge/VaultHealthService';
import type { CheckpointInfo } from '../../core/checkpoints/GitCheckpointService';

const REPAIRABLE_CHECKS = new Set<HealthCheckType>([
    'missing_backlinks', 'category_mismatch', 'inconsistent_tags',
]);

const CHECK_LABELS: Record<string, string> = {
    orphans: 'Orphaned notes',
    missing_backlinks: 'Missing backlinks',
    broken_links: 'Broken links',
    weak_clusters: 'Semantically similar but unlinked',
    inconsistent_tags: 'Inconsistent tags',
    category_mismatch: 'Category mismatches',
    god_nodes: 'Overloaded hub notes',
    cluster_freshness: 'Cluster freshness (Karpathy-Lint)',
    source_concentration: 'Source concentration (Bias)',
};

type SeverityFilter = 'all' | 'high' | 'medium' | 'low';

export class VaultHealthRepairModal extends Modal {
    private plugin: ObsidianAgentPlugin;
    private findings: HealthFinding[];
    private selectedFindings = new Set<number>();
    private onDiscuss?: (prompt: string) => void;
    /** FEAT-19-18: severity filter pill (all/high/medium/low). Default 'all'. */
    private severityFilter: SeverityFilter = 'all';

    constructor(
        plugin: ObsidianAgentPlugin,
        findings: HealthFinding[],
        onDiscuss?: (prompt: string) => void,
    ) {
        super(plugin.app);
        this.plugin = plugin;
        this.findings = findings;
        this.onDiscuss = onDiscuss;
    }

    onOpen(): void {
        this.showFindings();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    // -----------------------------------------------------------------------
    // Phase 1: Detailed findings view
    // -----------------------------------------------------------------------

    private showFindings(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-health-modal');

        const repairableCount = this.findings.filter(f => REPAIRABLE_CHECKS.has(f.check)).length;
        const totalCount = this.findings.length;

        contentEl.createEl('h3', { text: `Vault health (${totalCount} findings)` });

        // FEAT-19-18: Severity filter tabs.
        const counts = {
            high: this.findings.filter(f => f.severity === 'high').length,
            medium: this.findings.filter(f => f.severity === 'medium').length,
            low: this.findings.filter(f => f.severity === 'low').length,
        };
        const filterRow = contentEl.createDiv('vault-health-filter-row');
        const tabs: Array<{ key: SeverityFilter; label: string }> = [
            { key: 'all', label: `All (${totalCount})` },
            { key: 'high', label: `High (${counts.high})` },
            { key: 'medium', label: `Medium (${counts.medium})` },
            { key: 'low', label: `Low (${counts.low})` },
        ];
        for (const tab of tabs) {
            const btn = filterRow.createEl('button', {
                text: tab.label,
                cls: 'vault-health-filter-tab' + (this.severityFilter === tab.key ? ' is-active' : ''),
            });
            btn.addEventListener('click', () => {
                this.severityFilter = tab.key;
                this.selectedFindings.clear();
                this.showFindings();
            });
        }

        // Apply filter
        const visibleFindings = this.severityFilter === 'all'
            ? this.findings
            : this.findings.filter(f => f.severity === this.severityFilter);

        // Group findings by check type
        const grouped = new Map<HealthCheckType, { findings: HealthFinding[]; indices: number[] }>();
        visibleFindings.forEach((f) => {
            const idx = this.findings.indexOf(f);
            const entry = grouped.get(f.check) ?? { findings: [], indices: [] };
            entry.findings.push(f);
            entry.indices.push(idx);
            grouped.set(f.check, entry);
        });

        // Render each check type as a collapsible section
        for (const [check, { findings: checkFindings, indices }] of grouped) {
            const isRepairable = REPAIRABLE_CHECKS.has(check);
            const label = CHECK_LABELS[check] ?? check;
            const severity = checkFindings[0].severity;

            const details = contentEl.createEl('details', { cls: 'vault-health-section' });
            if (isRepairable) details.setAttribute('open', '');

            const summary = details.createEl('summary', { cls: 'vault-health-section-header' });
            summary.createSpan({ cls: `vault-health-severity severity-${severity}`, text: severity });
            summary.createSpan({ text: ` ${label} (${checkFindings.length})` });
            if (!isRepairable) {
                summary.createSpan({ cls: 'vault-health-tag-info', text: ' (review recommended)' });
            }

            const content = details.createDiv('vault-health-section-content');

            for (let i = 0; i < checkFindings.length; i++) {
                const finding = checkFindings[i];
                const globalIdx = indices[i];

                const row = content.createDiv('vault-health-finding-row');

                // Checkbox (repairable only)
                if (isRepairable) {
                    const checkbox = row.createEl('input', { type: 'checkbox' });
                    checkbox.checked = true;
                    this.selectedFindings.add(globalIdx);
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            this.selectedFindings.add(globalIdx);
                        } else {
                            this.selectedFindings.delete(globalIdx);
                        }
                        this.updateRepairButton();
                    });
                }

                // Primary note (first path)
                const primaryPath = finding.paths[0];
                if (primaryPath) {
                    const noteLink = row.createSpan({ cls: 'vault-health-note-link' });
                    noteLink.setText(this.formatPath(primaryPath));
                    noteLink.addEventListener('click', () => {
                        this.close();
                        void this.app.workspace.openLinkText(primaryPath, '');
                    });
                }

                // Additional paths count
                if (finding.paths.length > 1) {
                    row.createSpan({
                        cls: 'vault-health-path-count',
                        text: ` + ${finding.paths.length - 1} related`,
                    });
                }

                // Action buttons (right side of row)
                const actions = row.createDiv('vault-health-finding-actions');

                // Discuss with agent (all finding types)
                const discussBtn = actions.createEl('button', {
                    cls: 'vault-health-icon-btn',
                    attr: { 'aria-label': 'Discuss with agent' },
                });
                setIcon(discussBtn, 'message-square');
                discussBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const prompt = this.buildFindingPrompt(finding);
                    this.close();
                    if (this.onDiscuss) {
                        this.onDiscuss(prompt);
                    }
                });

                // FEAT-19-18: BA-25 Action-Buttons fuer Lint-Findings.
                if (finding.check === 'source_concentration' && finding.cluster) {
                    const antiEchoBtn = actions.createEl('button', {
                        cls: 'vault-health-icon-btn',
                        attr: { 'aria-label': 'Run anti-echo search' },
                    });
                    setIcon(antiEchoBtn, 'search');
                    antiEchoBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const prompt = `Run anti_echo_search for cluster "${finding.cluster}" to surface alternative sources beyond the dominant domain.`;
                        this.close();
                        this.onDiscuss?.(prompt);
                    });
                }
                if (finding.check === 'cluster_freshness' && finding.cluster) {
                    const refreshBtn = actions.createEl('button', {
                        cls: 'vault-health-icon-btn',
                        attr: { 'aria-label': 'Discuss freshness update for this cluster' },
                    });
                    setIcon(refreshBtn, 'refresh-cw');
                    refreshBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const prompt = `Cluster "${finding.cluster}" ist ueber Halbwertszeit. Schlage einen Web-Search-Update-Pass und passende Source-Notes zum Deep-Ingest vor.`;
                        this.close();
                        this.onDiscuss?.(prompt);
                    });
                }

                // Skip/dismiss (all finding types)
                const skipBtn = actions.createEl('button', {
                    cls: 'vault-health-icon-btn',
                    attr: { 'aria-label': 'Dismiss this finding' },
                });
                setIcon(skipBtn, 'eye-off');
                skipBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    console.debug('[VaultHealth] Dismiss clicked:', finding.check, finding.paths[0]);
                    this.dismissFinding(finding, globalIdx, row, content, details, check, checkFindings.length);
                });

                // Fix preview or description
                const preview = content.createDiv('vault-health-fix-preview');
                if (isRepairable) {
                    preview.setText(this.getFixPreview(finding));
                } else {
                    preview.setText(this.getInfoText(finding));
                }
            }
        }

        // Bottom buttons
        const btnRow = contentEl.createDiv('vault-health-btn-row');

        if (repairableCount > 0) {
            const repairBtn = btnRow.createEl('button', {
                cls: 'mod-cta vault-health-repair-btn',
                text: `Repair selected (${this.selectedFindings.size})`,
            });
            repairBtn.addEventListener('click', () => {
                if (this.selectedFindings.size === 0) {
                    new Notice('No findings selected for repair.');
                    return;
                }
                repairBtn.disabled = true;
                repairBtn.setText('Repairing...');
                void this.runRepair();
            });
        }

        // Show dismissed findings button
        const dismissedCount = this.plugin.vaultHealthService?.getDismissedCount() ?? 0;
        if (dismissedCount > 0) {
            const dismissedBtn = btnRow.createEl('button', {
                text: `${dismissedCount} dismissed`,
                cls: 'vault-health-reset-btn',
            });
            dismissedBtn.addEventListener('click', () => {
                this.showDismissedList(contentEl);
            });
        }

        const closeBtn = btnRow.createEl('button', { text: 'Close' });
        closeBtn.addEventListener('click', () => this.close());
    }

    private updateRepairButton(): void {
        const btn = this.contentEl.querySelector('.vault-health-repair-btn');
        if (!(btn instanceof HTMLButtonElement)) return;
        btn.setText(`Repair selected (${this.selectedFindings.size})`);
    }

    // -----------------------------------------------------------------------
    // Dismiss a finding
    // -----------------------------------------------------------------------

    private dismissFinding(
        finding: HealthFinding,
        globalIdx: number,
        row: HTMLElement,
        content: HTMLElement,
        details: HTMLElement,
        check: HealthCheckType,
        originalCount: number,
    ): void {
        // Persist dismissal
        const path = finding.paths[0] ?? '';
        this.plugin.vaultHealthService?.dismissFinding(finding.check, path);

        // Remove from selected
        this.selectedFindings.delete(globalIdx);
        this.updateRepairButton();

        // Remove the row and its fix-preview
        const nextSibling = row.nextElementSibling;
        row.remove();
        if (nextSibling?.classList.contains('vault-health-fix-preview')) {
            nextSibling.remove();
        }

        // Update section header count
        const remaining = content.querySelectorAll('.vault-health-finding-row').length;
        if (remaining === 0) {
            details.remove();
        } else {
            const headerText = details.querySelector('.vault-health-section-header');
            if (headerText) {
                const label = CHECK_LABELS[check] ?? check;
                const spans = headerText.querySelectorAll('span');
                if (spans.length >= 2) {
                    spans[1].setText(` ${label} (${remaining})`);
                }
            }
        }

        // Update badge
        const allFindings = this.plugin.vaultHealthService?.getFindings() ?? [];
        this.updateBadge(allFindings);
    }

    /** Re-run health checks and refresh the findings view. */
    private async refreshAndShowFindings(): Promise<void> {
        const healthService = this.plugin.vaultHealthService;
        if (healthService) {
            await healthService.runChecks();
            this.findings = healthService.getFindings();
            this.selectedFindings.clear();
            this.updateBadge(this.findings);
        }
        this.showFindings();
    }

    // -----------------------------------------------------------------------
    // Dismissed findings list
    // -----------------------------------------------------------------------

    private showDismissedList(containerEl: HTMLElement): void {
        containerEl.empty();
        containerEl.createEl('h3', { text: 'Dismissed findings' });

        const dismissed = this.plugin.vaultHealthService?.getDismissedFindings() ?? [];
        if (dismissed.length === 0) {
            containerEl.createEl('p', { text: 'No dismissed findings.' });
            const backBtn = containerEl.createEl('button', { text: 'Back', cls: 'mod-cta' });
            backBtn.addEventListener('click', () => this.showFindings());
            return;
        }

        // Search input
        const searchRow = containerEl.createDiv('vault-health-search-row');
        const searchInput = searchRow.createEl('input', {
            type: 'text',
            placeholder: 'Filter...',
            cls: 'vault-health-search-input',
        });

        const listEl = containerEl.createDiv('vault-health-dismissed-list');

        const renderList = (filter: string) => {
            listEl.empty();
            const lowerFilter = filter.toLowerCase();
            const filtered = filter
                ? dismissed.filter(d => d.path.toLowerCase().includes(lowerFilter) || d.checkType.toLowerCase().includes(lowerFilter))
                : dismissed;

            for (const d of filtered) {
                const row = listEl.createDiv('vault-health-finding-row');

                const label = CHECK_LABELS[d.checkType] ?? d.checkType;
                row.createSpan({ cls: `vault-health-severity severity-medium`, text: label });
                row.createSpan({ cls: 'vault-health-note-link', text: ` ${this.formatPath(d.path)}` });

                const restoreBtn = row.createEl('button', {
                    cls: 'vault-health-icon-btn',
                    attr: { 'aria-label': 'Restore this finding' },
                });
                setIcon(restoreBtn, 'eye');
                restoreBtn.addClass('vault-health-icon-btn-visible');
                restoreBtn.addEventListener('click', () => {
                    this.plugin.vaultHealthService?.restoreDismissedFinding(d.checkType, d.path);
                    row.remove();
                    const remaining = listEl.querySelectorAll('.vault-health-finding-row').length;
                    if (remaining === 0) {
                        void this.refreshAndShowFindings();
                    }
                });
            }

            if (filtered.length === 0) {
                listEl.createEl('p', { cls: 'vault-health-empty', text: 'No matches.' });
            }
        };

        renderList('');
        searchInput.addEventListener('input', () => renderList(searchInput.value));

        // Bottom buttons
        const btnRow = containerEl.createDiv('vault-health-btn-row');

        const restoreAllBtn = btnRow.createEl('button', {
            text: 'Restore all',
        });
        restoreAllBtn.addEventListener('click', () => {
            this.plugin.vaultHealthService?.restoreDismissed();
            void this.refreshAndShowFindings();
        });

        const backBtn = btnRow.createEl('button', { text: 'Back', cls: 'mod-cta' });
        backBtn.addEventListener('click', () => {
            void this.refreshAndShowFindings();
        });
    }

    // -----------------------------------------------------------------------
    // Prompt builder for discuss
    // -----------------------------------------------------------------------

    private buildFindingPrompt(finding: HealthFinding): string {
        const label = CHECK_LABELS[finding.check] ?? finding.check;
        const paths = finding.paths.map(p => `[[${this.formatPath(p)}]]`).join(', ');

        // If finding has multiple paths (e.g. orphans with many notes), guide interactive walkthrough
        if (finding.paths.length > 3) {
            return (
                `Vault health: ${label}\n` +
                `${finding.description}\n\n` +
                `Affected: ${paths}\n\n` +
                `Walk me through these one by one. For each item:\n` +
                `1. Explain what it is and where it lives (vault note, database entry, or system artifact)\n` +
                `2. Show me the item and suggest what to do with it\n` +
                `3. Give me concrete options as followup suggestions (e.g. "delete", "link to X", "keep as is", "skip")\n` +
                `4. Wait for my choice before moving to the next item\n\n` +
                `Also offer "apply same action to all remaining" as a batch option.\n` +
                `No emojis. Be specific about file locations and what each item actually is.`
            );
        }

        return (
            `Vault health: ${label}\n` +
            `${finding.description}\n\n` +
            `Affected: ${paths}\n\n` +
            `Explain what this is (vault note, database entry, or system artifact), ` +
            `where it lives, and suggest a concrete fix with options as followup suggestions. ` +
            `After I pick one, implement it. No emojis.`
        );
    }

    // -----------------------------------------------------------------------
    // Fix preview text generators
    // -----------------------------------------------------------------------

    private getFixPreview(finding: HealthFinding): string {
        switch (finding.check) {
            case 'missing_backlinks': {
                const target = finding.paths[0];
                const sources = finding.paths.slice(1);
                if (sources.length > 10) {
                    return `Fix: Create backlinks base file for ${this.formatPath(target)} (${sources.length} notes)`;
                }
                return `Fix: Add backlink properties to ${this.formatPath(target)} from ${sources.slice(0, 3).map(s => this.formatPath(s)).join(', ')}${sources.length > 3 ? ` +${sources.length - 3} more` : ''}`;
            }
            case 'category_mismatch':
                return `Fix: Move ${this.formatPath(finding.paths[0])} to correct category property`;
            case 'inconsistent_tags':
                return `Fix: Unify tag spelling`;
            default:
                return finding.description.slice(0, 120);
        }
    }

    private getInfoText(finding: HealthFinding): string {
        switch (finding.check) {
            case 'orphans':
                return finding.description.split('\n')[0];
            case 'weak_clusters':
                return finding.description;
            case 'god_nodes':
                return finding.description;
            case 'broken_links':
                return `${this.formatPath(finding.paths[0])} is referenced but does not exist`;
            default:
                return finding.description.slice(0, 150);
        }
    }

    private formatPath(path: string): string {
        return path.replace(/\.md$/, '').split('/').pop() ?? path;
    }

    // -----------------------------------------------------------------------
    // Phase 2: Run repair (selected findings only)
    // -----------------------------------------------------------------------

    private async runRepair(): Promise<void> {
        const { contentEl } = this;
        const healthService = this.plugin.vaultHealthService;
        if (!healthService) return;

        contentEl.empty();
        contentEl.createEl('h3', { text: 'Repair in progress...' });
        const progress = contentEl.createEl('p', { cls: 'vault-health-progress' });

        // Checkpoint
        progress.setText('Creating checkpoint...');
        const taskId = `health-repair-${Date.now()}`;
        const affectedPaths = this.collectAffectedPaths();

        let checkpoint: CheckpointInfo | undefined;
        if (this.plugin.checkpointService && affectedPaths.length > 0) {
            try {
                const cp = await this.plugin.checkpointService.snapshot(
                    taskId, affectedPaths, 'vault_health_repair',
                );
                if (cp && cp.commitOid !== 'empty') checkpoint = cp;
            } catch (e) {
                console.warn('[VaultHealthRepair] Checkpoint failed (non-fatal):', e);
            }
        }

        // Determine which repair types are selected
        const selectedTypes = new Set<HealthCheckType>();
        for (const idx of this.selectedFindings) {
            selectedTypes.add(this.findings[idx].check);
        }

        let edgesResult = { edgesRemoved: 0 };
        let backlinksResult = { entitiesFixed: 0, linksAdded: 0, basesCreated: 0 };
        let categoriesResult = { notesFixed: 0, valuesMovied: 0 };
        let cleanupResult = { notesProcessed: 0, linksRemoved: 0 };

        if (selectedTypes.has('missing_backlinks') || selectedTypes.has('category_mismatch')) {
            progress.setText('Cleaning up orphaned edges...');
            edgesResult = healthService.cleanupOrphanedEdges();
        }

        if (selectedTypes.has('missing_backlinks')) {
            progress.setText('Inserting missing backlinks...');
            backlinksResult = await healthService.fixMissingBacklinks(
                'Notizen',
                this.plugin.settings.categoryProperty ?? 'Kategorie',
            );
        }

        if (selectedTypes.has('category_mismatch')) {
            progress.setText('Correcting category assignments...');
            categoriesResult = await healthService.fixCategoryMismatches();
        }

        if (selectedTypes.has('missing_backlinks')) {
            progress.setText('Cleaning up invalid links...');
            cleanupResult = await healthService.cleanupInvalidBacklinks(
                'Notizen',
                this.plugin.settings.categoryProperty ?? 'Kategorie',
            );
        }

        // Re-extract graph data before re-checking (FIX-13)
        progress.setText('Verifying...');
        if (this.plugin.graphExtractor) {
            this.plugin.graphExtractor.extractAll(this.app.vault);
            if (this.plugin.ontologyStore) {
                const catProp = this.plugin.settings.categoryProperty ?? 'Kategorie';
                const categoryMap = new Map<string, string>();
                for (const file of this.app.vault.getMarkdownFiles()) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.frontmatter?.[catProp]) {
                        const cat = Array.isArray(cache.frontmatter[catProp])
                            ? (cache.frontmatter[catProp][0] ?? '').toString().trim()
                            : cache.frontmatter[catProp].toString().trim();
                        if (cat) categoryMap.set(file.path, cat);
                    }
                }
                this.plugin.ontologyStore.bootstrapFromEdges(
                    this.plugin.settings.mocPropertyNames ?? [],
                    catProp,
                    categoryMap,
                );
            }
        }

        const newFindings = await healthService.runChecks();
        this.showResult(edgesResult, backlinksResult, categoriesResult, cleanupResult, newFindings, checkpoint);
    }

    // -----------------------------------------------------------------------
    // Phase 3: Show result + undo
    // -----------------------------------------------------------------------

    private showResult(
        edges: { edgesRemoved: number },
        backlinks: { entitiesFixed: number; linksAdded: number; basesCreated: number },
        categories: { notesFixed: number; valuesMovied: number },
        cleanup: { notesProcessed: number; linksRemoved: number },
        newFindings: HealthFinding[],
        checkpoint: CheckpointInfo | undefined,
    ): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h3', { text: 'Repair complete' });

        const results = contentEl.createEl('ul', { cls: 'vault-health-results' });

        if (edges.edgesRemoved > 0) {
            results.createEl('li', { text: `${edges.edgesRemoved} orphaned edges removed` });
        }
        if (backlinks.linksAdded > 0 || backlinks.basesCreated > 0) {
            results.createEl('li', {
                text: `${backlinks.entitiesFixed} entities: ${backlinks.linksAdded} backlinks, ${backlinks.basesCreated} bases created`,
            });
        }
        if (categories.notesFixed > 0) {
            results.createEl('li', { text: `${categories.notesFixed} notes: category assignment corrected` });
        }
        if (cleanup.linksRemoved > 0) {
            results.createEl('li', { text: `${cleanup.linksRemoved} invalid links removed` });
        }

        const totalFixes = edges.edgesRemoved + backlinks.linksAdded + backlinks.basesCreated +
            categories.valuesMovied + cleanup.linksRemoved;

        if (totalFixes === 0) {
            contentEl.createEl('p', { text: 'No repairs needed. All clean.' });
        }

        // Remaining findings
        const remainingRepairable = newFindings.filter(f => REPAIRABLE_CHECKS.has(f.check)).length;
        const totalRemaining = newFindings.length;
        contentEl.createEl('p', {
            cls: 'vault-health-remaining',
            text: `Remaining: ${totalRemaining} finding(s), ${remainingRepairable} repairable.`,
        });

        // Buttons
        const btnRow = contentEl.createDiv('vault-health-btn-row');

        if (checkpoint && totalFixes > 0) {
            const undoBtn = btnRow.createEl('button', {
                text: 'Undo',
                cls: 'mod-warning',
            });
            undoBtn.addEventListener('click', () => {
                void this.runUndo(checkpoint);
            });
        }

        const doneBtn = btnRow.createEl('button', { text: 'Done', cls: 'mod-cta' });
        doneBtn.addEventListener('click', () => {
            this.updateBadge(newFindings);
            this.close();
        });
    }

    // -----------------------------------------------------------------------
    // Undo
    // -----------------------------------------------------------------------

    private async runUndo(checkpoint: CheckpointInfo): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Restoring checkpoint...' });

        try {
            const result = await this.plugin.checkpointService.restore(checkpoint);

            contentEl.empty();
            contentEl.createEl('h3', { text: 'Restored' });
            contentEl.createEl('p', {
                text: `${result.restored.length} file(s) restored.`,
            });

            if (result.errors.length > 0) {
                contentEl.createEl('p', {
                    cls: 'vault-health-error',
                    text: `${result.errors.length} error(s): ${result.errors.join(', ')}`,
                });
            }

            // Re-extract graph after restore
            if (this.plugin.graphExtractor) {
                this.plugin.graphExtractor.extractAll(this.app.vault);
            }
            if (this.plugin.ontologyStore) {
                const catProp = this.plugin.settings.categoryProperty ?? 'Kategorie';
                const categoryMap = new Map<string, string>();
                for (const file of this.app.vault.getMarkdownFiles()) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.frontmatter?.[catProp]) {
                        const cat = Array.isArray(cache.frontmatter[catProp])
                            ? (cache.frontmatter[catProp][0] ?? '').toString().trim()
                            : cache.frontmatter[catProp].toString().trim();
                        if (cat) categoryMap.set(file.path, cat);
                    }
                }
                this.plugin.ontologyStore.bootstrapFromEdges(
                    this.plugin.settings.mocPropertyNames ?? [],
                    catProp,
                    categoryMap,
                );
            }

            const findings = await this.plugin.vaultHealthService?.runChecks() ?? [];
            this.updateBadge(findings);

            const doneBtn = contentEl.createEl('button', { text: 'Done', cls: 'mod-cta' });
            doneBtn.addEventListener('click', () => this.close());
        } catch (e) {
            contentEl.empty();
            contentEl.createEl('h3', { text: 'Restore failed' });
            contentEl.createEl('p', {
                cls: 'vault-health-error',
                text: e instanceof Error ? e.message : String(e),
            });
            const closeBtn = contentEl.createEl('button', { text: 'Close' });
            closeBtn.addEventListener('click', () => this.close());
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private collectAffectedPaths(): string[] {
        const paths = new Set<string>();
        for (const idx of this.selectedFindings) {
            const f = this.findings[idx];
            for (const p of f.paths) {
                if (p.endsWith('.md')) paths.add(p);
            }
        }
        return [...paths].slice(0, 100);
    }

    private updateBadge(findings: HealthFinding[]): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
        if (leaves.length > 0) {
            const view = leaves[0].view as unknown as { updateHealthBadge(count: number, severity: string | null): void };
            const highCount = findings.filter(f => f.severity === 'high').length;
            const count = findings.length;
            view.updateHealthBadge(count, highCount > 0 ? 'high' : (count > 0 ? 'medium' : null));
        }
    }
}
