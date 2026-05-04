/**
 * AntiEchoSearchTool (FEAT-19-14)
 *
 * Stufe-2 Anti-Echo-Web-Suche: bei Concentration-Warning sucht das
 * Tool aktiv nach Gegenpositionen aus alternativen Source-Domains.
 * Reuse des existing WebSearchTool ueber dessen execute()-Pfad mit
 * Source-Filter (block dominant domain via -site:domain.com).
 *
 * Tool ist ein Convenience-Wrapper plus Concentration-Lookup.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface AntiEchoInput {
    cluster: string;
    /** Optional: konkrete Anfrage zum Cluster-Topic. */
    query?: string;
}

export class AntiEchoSearchTool extends BaseTool<'anti_echo_search'> {
    readonly name = 'anti_echo_search' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) { super(plugin); }

    getDefinition(): ToolDefinition {
        return {
            name: 'anti_echo_search',
            description:
                'Aktive Web-Suche nach Gegenpositionen zu einem Cluster, der von einer Source-Domain '
                + 'dominiert ist. Blockiert die dominante Domain in der Suche, gibt 5 Top-Treffer aus '
                + 'alternativen Quellen zurueck. Nutzt den konfigurierten Web-Search-Provider (BYOK, ADR-104).',
            input_schema: {
                type: 'object',
                properties: {
                    cluster: { type: 'string', description: 'Cluster-Name fuer den Anti-Echo-Pass.' },
                    query: { type: 'string', description: 'Optional: konkrete Suchanfrage. Sonst wird aus Cluster-Name abgeleitet.' },
                },
                required: ['cluster'],
            },
        };
    }

    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const { cluster, query } = input as unknown as AntiEchoInput;
        const stats = this.plugin.clusterSourceStatsStore?.getStatsForCluster(cluster) ?? [];
        if (stats.length === 0) {
            ctx.callbacks.pushToolResult(this.formatError(`Cluster "${cluster}" hat keine Source-Stats. Anti-Echo nicht moeglich.`));
            return;
        }
        const dominantDomain = stats[0].sourceDomain;
        const total = stats.reduce((s, x) => s + x.noteCount, 0);
        const conc = stats[0].noteCount / total;
        const searchQuery = query
            ?? `Critical perspectives on ${cluster} alternative viewpoints`;

        // Reuse WebSearchTool via Tool-Registry-Lookup
        const webSearchTool = this.plugin.toolRegistry?.getTool('web_search');
        if (!webSearchTool) {
            ctx.callbacks.pushToolResult(this.formatError('web_search-Tool nicht verfuegbar. Bitte Provider in Settings konfigurieren.'));
            return;
        }
        // Source-Filter: dominante Domain blockieren
        const filteredQuery = `${searchQuery} -site:${dominantDomain}`;

        const captured: string[] = [];
        const subCtx: ToolExecutionContext = {
            ...ctx,
            callbacks: {
                ...ctx.callbacks,
                pushToolResult: (r: string) => { captured.push(r); },
            },
        };
        await webSearchTool.execute({ query: filteredQuery, max_results: 5 }, subCtx);

        const intro = [
            `## Anti-Echo-Suche fuer Cluster "${cluster}"`,
            `- Dominante Domain im Cluster: **${dominantDomain}** (${(conc * 100).toFixed(0)}% von ${total} Notes)`,
            `- Suche mit Source-Filter: \`${filteredQuery}\``,
            '',
            '### Treffer (alternative Quellen):',
            '',
            captured.join('\n\n'),
        ];
        ctx.callbacks.pushToolResult(this.formatSuccess(intro.join('\n')));
    }
}
