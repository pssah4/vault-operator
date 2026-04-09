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
                        enum: ['check', 'fix_backlinks', 'refresh'],
                        description: 'Action to perform. "check" (default): run health checks. "fix_backlinks": automatically fix all missing backlinks in one batch (no LLM cost, pure code). "refresh": re-extract graph + ontology before checking.',
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
                        this.plugin.ontologyStore.bootstrapFromEdges(
                            this.plugin.settings.mocPropertyNames ?? [],
                            this.plugin.settings.categoryProperty ?? 'Kategorie',
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
                const result = await healthService.fixMissingBacklinks(
                    this.plugin.settings.categoryProperty ? 'Notizen' : 'Notizen',
                );
                callbacks.pushToolResult(
                    `Missing backlinks fixed: ${result.entitiesFixed} entities updated, ${result.linksAdded} backlinks added.\n` +
                    `All changes have checkpoints and are reversible via Undo.\n` +
                    `Run vault_health_check with action "refresh" to see updated findings.`,
                );
                callbacks.log(`fix_backlinks: ${result.entitiesFixed} entities, ${result.linksAdded} links`);
            }
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }
}
