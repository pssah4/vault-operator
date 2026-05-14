/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * VaultHealthCheckTool -- Run vault health checks and report findings.
 *
 * Executes SQL-based health checks (orphaned notes, missing backlinks,
 * broken links, weak clusters, inconsistent tags) and returns findings
 * formatted for the agent to suggest fixes.
 *
 * ADR-067: Lint Architecture
 * FEATURE-1901: Vault Health Check
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

export class VaultHealthCheckTool extends BaseTool<'vault_health_check'> {
    readonly name = 'vault_health_check' as const;
    // Write when fix action is used, read-only for check
    get isWriteOperation(): boolean { return false; }

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'vault_health_check',
            description:
                'Run structural health checks on the vault: orphaned notes (no incoming links), missing backlinks (one-directional MOC links), broken links (target does not exist), weak clusters (semantically similar but not linked), inconsistent tags (spelling variants). Returns findings with suggested fixes. Use this proactively to maintain vault quality.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['check', 'fix_backlinks', 'cleanup', 'fix_categories', 'cleanup_edges', 'refresh'],
                        description: 'Action to perform. "check" (default): run health checks. "fix_backlinks": fix missing backlinks. "cleanup": remove invalid backlinks. "fix_categories": move values from wrong property to correct (e.g. Thema in Konzepte → Themen). "refresh": re-extract graph + ontology before checking.',
                    },
                },
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;

        const healthService = this.plugin.vaultHealthService;
        if (!healthService) {
            callbacks.pushToolResult('Vault health check is not available. The semantic index must be built first (Settings > Embeddings > Build Index).');
            return;
        }

        const action = (input.action as string) || 'check';

        try {
            if (action === 'refresh' || action === 'check') {
                // Refresh graph + ontology (always for refresh, before check to get fresh data)
                if (action === 'refresh') {
                    const vault = this.plugin.app.vault;
                    if (this.plugin.graphExtractor) {
                        this.plugin.graphExtractor.extractAll(vault);
                        callbacks.log('Graph re-extracted');
                    }
                    if (this.plugin.ontologyStore) {
                        const catProp = this.plugin.settings.categoryProperty ?? 'Kategorie';
                        const categoryMap = new Map<string, string>();
                        for (const file of vault.getMarkdownFiles()) {
                            const cache = this.plugin.app.metadataCache.getFileCache(file);
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
                        callbacks.log('Ontology rebuilt');
                    }
                }

                const findings = await healthService.runChecks();
                const formatted = healthService.formatFindings(findings);
                callbacks.pushToolResult(formatted);
                callbacks.log(`Vault health check: ${findings.length} finding(s)`);

            } else if (action === 'fix_backlinks') {
                // Batch-fix all missing backlinks in pure code (0 LLM tokens)
                // Uses Base-strategy: Thema/Konzept get embedded Base, others get frontmatter (max 10)
                const result = await healthService.fixMissingBacklinks(
                    'Notizen',
                    this.plugin.settings.categoryProperty ?? 'Kategorie',
                );
                callbacks.pushToolResult(
                    `Missing backlinks fixed: ${result.entitiesFixed} entities updated, ` +
                    `${result.linksAdded} frontmatter backlinks, ${result.basesCreated} embedded Bases created.\n` +
                    `Strategy: Thema/Konzept notes get dynamic Base views, others get frontmatter links (max 10).\n` +
                    `All changes are reversible via Undo. Run vault_health_check with action "refresh" to verify.`,
                );
                callbacks.log(`fix_backlinks: ${result.entitiesFixed} entities, ${result.linksAdded} links`);

            } else if (action === 'cleanup') {
                // Remove invalid backlinks from frontmatter (non-.md, broken, duplicates)
                // Also clears Notizen for Thema/Konzept notes (Bases handle those)
                const result = await healthService.cleanupInvalidBacklinks(
                    'Notizen',
                    this.plugin.settings.categoryProperty ?? 'Kategorie',
                );
                callbacks.pushToolResult(
                    `Cleanup complete: ${result.notesProcessed} notes processed, ${result.linksRemoved} invalid links removed.\n` +
                    `Thema/Konzept notes: Notizen property cleared (Bases handle backlinks).\n` +
                    `Other notes: non-.md links and duplicates removed.\n` +
                    `All changes are reversible via Undo.`,
                );
                callbacks.log(`cleanup: ${result.notesProcessed} notes, ${result.linksRemoved} removed`);

            } else if (action === 'fix_categories') {
                try {
                    const result = await healthService.fixCategoryMismatches();
                    callbacks.pushToolResult(
                        `Category mismatches fixed: ${result.notesFixed} notes updated, ${result.valuesMovied} values moved.\n` +
                        `Thema/Konzept values moved to correct property.\n` +
                        `All changes are reversible via Undo.`,
                    );
                    callbacks.log(`fix_categories: ${result.notesFixed} notes, ${result.valuesMovied} moved`);
                } catch (catErr) {
                    const msg = catErr instanceof Error ? catErr.message : String(catErr);
                    callbacks.pushToolResult(`fix_categories failed: ${msg}`);
                    console.warn('[VaultHealthCheck] fix_categories error:', catErr);
                }

            } else if (action === 'cleanup_edges') {
                const result = healthService.cleanupOrphanedEdges();
                callbacks.pushToolResult(
                    `Orphaned edges cleaned: ${result.edgesRemoved} edges removed from deleted/trashed notes.\n` +
                    `Run vault_health_check with action "check" to verify.`,
                );
                callbacks.log(`cleanup_edges: ${result.edgesRemoved} removed`);
            }
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }
}
