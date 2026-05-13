/**
 * list_pinned_conversations -- IMP-24-06-02.
 *
 * Listet alle Chat-Konversationen die ueber den Star-Button (oder
 * mark_for_memory) zu Memory-Sources gemacht wurden. Datenquelle:
 * `facts.source_session_id` GROUP BY -- jeder Chat dessen Facts noch
 * latest und nicht deprecated sind, gilt als "pinned".
 *
 * Read-only. Komplementaer zu `list_memory_source_notes` (Vault-Notes
 * als Memory-Source). Beide Tools decken die beiden parallelen
 * Memory-Mechanismen ab:
 *
 *   - list_memory_source_notes: Vault-Notes mit Frontmatter / via
 *     mark_note_as_memory_source markiert (Auto-Extraktion beim Save).
 *   - list_pinned_conversations: Chats via Star-Button / mark_for_memory
 *     manuell gepinnt (Facts in der FactStore mit source_session_id).
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

export class ListPinnedConversationsTool extends BaseTool<'list_pinned_conversations'> {
    readonly name = 'list_pinned_conversations' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) { super(plugin); }

    getDefinition(): ToolDefinition {
        return {
            name: 'list_pinned_conversations',
            description:
                'List all chat conversations the user pinned to memory (via the Star button '
                + 'in History or via mark_for_memory). Read-only. Returns conversation id, title, '
                + 'fact count, and last-update timestamp. Use this for "which chats did I save to '
                + 'memory" questions. Complementary to list_memory_source_notes (which lists '
                + 'vault notes registered as memory-source).',
            input_schema: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'integer',
                        description: 'Optional max number of results (default: 50).',
                    },
                },
            },
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- ToolExecution interface contract: async signature shared with tools that do LLM calls
    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const limit = typeof input.limit === 'number' && input.limit > 0 ? input.limit : 50;

        const memoryDB = this.plugin.memoryDB;
        if (!memoryDB?.isOpen()) {
            ctx.callbacks.pushToolResult(this.formatError('Memory database is not available.'));
            return;
        }

        const rows: { sessionId: string; factCount: number }[] = [];
        try {
            const result = memoryDB.getDB().exec(
                `SELECT source_session_id, COUNT(*) as cnt
                   FROM facts
                  WHERE source_session_id IS NOT NULL
                    AND is_latest = 1
                    AND deprecated_at IS NULL
                  GROUP BY source_session_id
                  ORDER BY cnt DESC
                  LIMIT ?`,
                [limit],
            );
            if (result.length > 0) {
                for (const v of result[0].values) {
                    const id = v[0] as string;
                    const cnt = Number(v[1]);
                    if (id) rows.push({ sessionId: id, factCount: cnt });
                }
            }
        } catch (e) {
            // AUDIT-023 L-2: keep the raw exception text in the dev console
            // for diagnostics but do not surface DB error details (column
            // / table names) into the tool result.
            console.warn('[list_pinned_conversations] DB query failed:', e);
            ctx.callbacks.pushToolResult(this.formatError('Failed to query pinned conversations.'));
            return;
        }

        if (rows.length === 0) {
            ctx.callbacks.pushToolResult(this.formatSuccess(
                'No conversations pinned to memory yet. Use the Star button in History or call mark_for_memory while a chat is open.'
            ));
            return;
        }

        const metas = this.plugin.conversationStore?.list() ?? [];
        const metaById = new Map(metas.map((m) => [m.id, m]));

        const lines: string[] = [
            `Pinned conversations (${rows.length}):`,
            '',
        ];
        for (const r of rows) {
            const meta = metaById.get(r.sessionId);
            if (meta) {
                const title = meta.title?.replace(/\n.*/s, '').trim() || '(untitled)';
                const updated = meta.updated ? ` updated=${meta.updated.slice(0, 10)}` : '';
                lines.push(`- ${title} -- id=${r.sessionId}, ${r.factCount} facts,${updated}`);
            } else {
                // Fact exists but conversation meta is gone -- orphan, keep listed
                lines.push(`- (deleted conversation) -- id=${r.sessionId}, ${r.factCount} facts`);
            }
        }
        ctx.callbacks.pushToolResult(this.formatSuccess(lines.join('\n')));
    }
}
