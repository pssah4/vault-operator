/**
 * VaultHealthRepairModal -- Info + Repair + Undo for Vault Health findings.
 *
 * Badge click opens this modal (no Agent, no LLM, pure code).
 * Shows findings overview, user confirms repair, checkpoint is created,
 * fixes run in code, result is shown with undo button.
 *
 * FEATURE-1901: Vault Health Check
 */

import { Modal } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { HealthFinding } from '../../core/knowledge/VaultHealthService';
import type { CheckpointInfo } from '../../core/checkpoints/GitCheckpointService';
import { t } from '../../i18n';

export class VaultHealthRepairModal extends Modal {
    private plugin: ObsidianAgentPlugin;
    private findings: HealthFinding[];

    constructor(plugin: ObsidianAgentPlugin, findings: HealthFinding[]) {
        super(plugin.app);
        this.plugin = plugin;
        this.findings = findings;
    }

    onOpen(): void {
        this.showFindings();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    // -----------------------------------------------------------------------
    // Phase 1: Show findings overview
    // -----------------------------------------------------------------------

    private showFindings(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-health-modal');

        contentEl.createEl('h3', { text: t('modal.vaultHealth.title') });

        // Group findings by check type
        const grouped = new Map<string, HealthFinding[]>();
        for (const f of this.findings) {
            const list = grouped.get(f.check) ?? [];
            list.push(f);
            grouped.set(f.check, list);
        }

        const labels: Record<string, string> = {
            orphans: t('modal.vaultHealth.checkOrphans'),
            missing_backlinks: t('modal.vaultHealth.checkMissingBacklinks'),
            broken_links: t('modal.vaultHealth.checkBrokenLinks'),
            weak_clusters: t('modal.vaultHealth.checkWeakClusters'),
            inconsistent_tags: t('modal.vaultHealth.checkInconsistentTags'),
            category_mismatch: t('modal.vaultHealth.checkCategoryMismatch'),
            god_nodes: t('modal.vaultHealth.checkGodNodes'),
        };

        const list = contentEl.createEl('ul', { cls: 'vault-health-findings-list' });

        for (const [check, checkFindings] of grouped) {
            const totalPaths = checkFindings.reduce((sum, cf) => sum + cf.paths.length, 0);
            const severity = checkFindings[0].severity;
            const label = labels[check] ?? check;
            const li = list.createEl('li');
            li.createSpan({ cls: `vault-health-severity severity-${severity}`, text: severity });
            li.createSpan({ text: ` ${label}: ${totalPaths}` });
        }

        // Reparierbar info
        const repairableCount = this.getRepairableCount();
        if (repairableCount > 0) {
            contentEl.createEl('p', {
                cls: 'vault-health-repairable',
                text: t('modal.vaultHealth.repairableCount').replace('{{count}}', String(repairableCount)),
            });
        }

        // Buttons
        const btnRow = contentEl.createDiv('vault-health-btn-row');

        if (repairableCount > 0) {
            const repairBtn = btnRow.createEl('button', {
                text: t('modal.vaultHealth.repairBtn'),
                cls: 'mod-cta',
            });
            repairBtn.addEventListener('click', () => {
                repairBtn.disabled = true;
                repairBtn.setText(t('modal.vaultHealth.repairing'));
                void this.runRepair();
            });
        }

        const closeBtn = btnRow.createEl('button', { text: t('modal.vaultHealth.closeBtn') });
        closeBtn.addEventListener('click', () => this.close());
    }

    // -----------------------------------------------------------------------
    // Phase 2: Run repair with checkpoint
    // -----------------------------------------------------------------------

    private async runRepair(): Promise<void> {
        const { contentEl } = this;
        const healthService = this.plugin.vaultHealthService;
        if (!healthService) return;

        // Show progress
        contentEl.empty();
        contentEl.createEl('h3', { text: t('modal.vaultHealth.repairRunning') });
        const progress = contentEl.createEl('p', { cls: 'vault-health-progress' });

        // Collect affected paths for checkpoint
        progress.setText(t('modal.vaultHealth.creatingCheckpoint'));
        const taskId = `health-repair-${Date.now()}`;
        const affectedPaths = this.collectAffectedPaths();

        let checkpoint: CheckpointInfo | undefined;
        if (this.plugin.checkpointService && affectedPaths.length > 0) {
            try {
                const cp = await this.plugin.checkpointService.snapshot(
                    taskId, affectedPaths, 'vault_health_repair',
                );
                if (cp && cp.commitOid !== 'empty') {
                    checkpoint = cp;
                }
            } catch (e) {
                console.warn('[VaultHealthRepair] Checkpoint failed (non-fatal):', e);
            }
        }

        // Run fixes
        progress.setText(t('modal.vaultHealth.progressOrphanedEdges'));
        const edges = healthService.cleanupOrphanedEdges();

        progress.setText(t('modal.vaultHealth.progressBacklinks'));
        const backlinks = await healthService.fixMissingBacklinks(
            'Notizen',
            this.plugin.settings.categoryProperty ?? 'Kategorie',
        );

        progress.setText(t('modal.vaultHealth.progressCategories'));
        const categories = await healthService.fixCategoryMismatches();

        progress.setText(t('modal.vaultHealth.progressInvalidLinks'));
        const cleanup = await healthService.cleanupInvalidBacklinks(
            'Notizen',
            this.plugin.settings.categoryProperty ?? 'Kategorie',
        );

        // Re-extract graph data for affected files BEFORE re-checking.
        // Repairs modify frontmatter and create .base files -- the GraphExtractor
        // must see these changes or the re-check finds stale findings. (FIX-13)
        progress.setText(t('modal.vaultHealth.progressVerify'));
        if (this.plugin.graphExtractor) {
            this.plugin.graphExtractor.extractAll(this.app.vault);
            // Re-bootstrap ontology so backlink checks see the new edges
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

        // Show result
        this.showResult(edges, backlinks, categories, cleanup, newFindings, checkpoint);
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

        contentEl.createEl('h3', { text: t('modal.vaultHealth.repairDone') });

        const results = contentEl.createEl('ul', { cls: 'vault-health-results' });

        if (edges.edgesRemoved > 0) {
            results.createEl('li', { text: t('modal.vaultHealth.resultEdges').replace('{{count}}', String(edges.edgesRemoved)) });
        }
        if (backlinks.linksAdded > 0 || backlinks.basesCreated > 0) {
            results.createEl('li', {
                text: t('modal.vaultHealth.resultBacklinks')
                    .replace('{{entities}}', String(backlinks.entitiesFixed))
                    .replace('{{links}}', String(backlinks.linksAdded))
                    .replace('{{bases}}', String(backlinks.basesCreated)),
            });
        }
        if (categories.notesFixed > 0) {
            results.createEl('li', { text: t('modal.vaultHealth.resultCategories').replace('{{count}}', String(categories.notesFixed)) });
        }
        if (cleanup.linksRemoved > 0) {
            results.createEl('li', { text: t('modal.vaultHealth.resultInvalidLinks').replace('{{count}}', String(cleanup.linksRemoved)) });
        }

        const totalFixes = edges.edgesRemoved + backlinks.linksAdded + backlinks.basesCreated +
            categories.valuesMovied + cleanup.linksRemoved;

        if (totalFixes === 0) {
            contentEl.createEl('p', { text: t('modal.vaultHealth.noRepairsNeeded') });
        }

        // Updated findings count
        const highCount = newFindings.filter(f => f.severity === 'high').length;
        contentEl.createEl('p', {
            cls: 'vault-health-remaining',
            text: t('modal.vaultHealth.remaining')
                .replace('{{count}}', String(newFindings.length))
                .replace('{{critical}}', String(highCount)),
        });

        // Buttons
        const btnRow = contentEl.createDiv('vault-health-btn-row');

        if (checkpoint && totalFixes > 0) {
            const undoBtn = btnRow.createEl('button', {
                text: t('modal.vaultHealth.undoBtn'),
                cls: 'mod-warning',
            });
            undoBtn.addEventListener('click', () => {
                void this.runUndo(checkpoint);
            });
        }

        const doneBtn = btnRow.createEl('button', { text: t('modal.vaultHealth.doneBtn'), cls: 'mod-cta' });
        doneBtn.addEventListener('click', () => {
            // Update badge
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
        contentEl.createEl('h3', { text: t('modal.vaultHealth.restoring') });

        try {
            const result = await this.plugin.checkpointService.restore(checkpoint);

            contentEl.empty();
            contentEl.createEl('h3', { text: t('modal.vaultHealth.restored') });
            contentEl.createEl('p', {
                text: t('modal.vaultHealth.restoredCount').replace('{{count}}', String(result.restored.length)),
            });

            if (result.errors.length > 0) {
                contentEl.createEl('p', {
                    cls: 'vault-health-error',
                    text: t('modal.vaultHealth.errors')
                        .replace('{{count}}', String(result.errors.length))
                        .replace('{{errors}}', result.errors.join(', ')),
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

            // Re-run checks
            const findings = await this.plugin.vaultHealthService?.runChecks() ?? [];
            this.updateBadge(findings);

            const doneBtn = contentEl.createEl('button', { text: t('modal.vaultHealth.doneBtn'), cls: 'mod-cta' });
            doneBtn.addEventListener('click', () => this.close());
        } catch (e) {
            contentEl.empty();
            contentEl.createEl('h3', { text: t('modal.vaultHealth.restoreFailed') });
            contentEl.createEl('p', {
                cls: 'vault-health-error',
                text: e instanceof Error ? e.message : String(e),
            });
            const closeBtn = contentEl.createEl('button', { text: t('modal.vaultHealth.closeBtn') });
            closeBtn.addEventListener('click', () => this.close());
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private getRepairableCount(): number {
        return this.findings.filter(f =>
            f.check === 'missing_backlinks' ||
            f.check === 'category_mismatch' ||
            f.check === 'inconsistent_tags',
        ).length;
    }

    private collectAffectedPaths(): string[] {
        const paths = new Set<string>();
        for (const f of this.findings) {
            for (const p of f.paths) {
                if (p.endsWith('.md')) paths.add(p);
            }
        }
        return [...paths].slice(0, 100); // Limit checkpoint size
    }

    private updateBadge(findings: HealthFinding[]): void {
        const leaves = this.app.workspace.getLeavesOfType('obsilo-agent-sidebar');
        if (leaves.length > 0) {
            const view = leaves[0].view as unknown as { updateHealthBadge(count: number, severity: string | null): void };
            const highCount = findings.filter(f => f.severity === 'high').length;
            view.updateHealthBadge(highCount, highCount > 0 ? 'high' : null);
        }
    }
}
