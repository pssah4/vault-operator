/**
 * list_memory_source_notes -- FEAT-03-25 / ADR-109.
 *
 * Listet alle Vault-Notes, die als memory-source markiert sind.
 * Read-only, kein Schreibpfad. Output enthaelt path, marker-source,
 * dirty-Flag, fact-count, lastExtractedAt -- klein genug fuer
 * Token-Budget.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

export class ListMemorySourceNotesTool extends BaseTool<'list_memory_source_notes'> {
    readonly name = 'list_memory_source_notes' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) { super(plugin); }

    getDefinition(): ToolDefinition {
        return {
            name: 'list_memory_source_notes',
            description:
                'List all Vault notes registered as memory-source. Read-only. Returns path, '
                + 'marker source (frontmatter / agent-tool / settings-list), dirty flag, fact count, '
                + 'and last-extracted timestamp.',
            input_schema: {
                type: 'object',
                properties: {
                    only_dirty: {
                        type: 'boolean',
                        description: 'If true, only notes awaiting re-extraction are listed.',
                    },
                },
            },
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- ToolExecution interface contract: async signature shared with tools that do LLM calls
    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const onlyDirty = input.only_dirty === true;

        const store = this.plugin.memorySourceStore;
        if (!store) {
            ctx.callbacks.pushToolResult(this.formatError('MemorySourceStore not available.'));
            return;
        }

        const records = onlyDirty ? store.listDirty() : store.list();
        if (records.length === 0) {
            ctx.callbacks.pushToolResult(this.formatSuccess(
                onlyDirty
                    ? 'No memory-source notes awaiting re-extraction.'
                    : 'No notes registered as memory-source yet.',
            ));
            return;
        }

        const lines: string[] = [
            `Memory-source notes (${records.length}${onlyDirty ? ', only dirty' : ''}):`,
            '',
        ];
        for (const r of records) {
            const dirtyTag = r.dirty ? ' [dirty]' : '';
            const lastExt = r.lastExtractedAt ? ` last-extracted=${r.lastExtractedAt.slice(0, 10)}` : ' never-extracted';
            lines.push(`- ${r.notePath}${dirtyTag} (${r.markerSource}, ${r.factCount} facts,${lastExt})`);
        }
        ctx.callbacks.pushToolResult(this.formatSuccess(lines.join('\n')));
    }
}
