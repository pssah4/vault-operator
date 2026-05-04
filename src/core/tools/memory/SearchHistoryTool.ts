/**
 * search_history -- agent-facing keyword search across past
 * conversation messages.
 *
 * Phase 6 / FEATURE-0320. Backed by the history_chunks table that
 * HistoryIndexer fills on plugin onload + after every conversation
 * save. Matches use SQL LIKE for now -- FTS5 / cosine ranking can be
 * layered on later without changing the tool surface.
 *
 * Renders results as Markdown with clickable obsidian://obsilo-chat
 * links so the user can jump to the source conversation.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

export class SearchHistoryTool extends BaseTool<'search_history'> {
    readonly name = 'search_history' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'search_history',
            description:
                'Keyword-search past conversations for messages that match the query. Use when the user references "we talked about X earlier", "find that chat where I mentioned Y", or asks "what did I say about X in my chats" -- much narrower than recall_memory (which searches extracted facts). Returns up to top_k matching messages with their source conversation, role, timestamp, and a clickable obsidian://obsilo-chat link. ' +
                'IMPORTANT: when you synthesise the final answer, cite each referenced chat by including its obsidian://obsilo-chat link inline (e.g. "[Chat title](<obsidian://obsilo-chat?id=...>)") so the user can re-enter the source conversation. Do not replace these chat links with note links from other tools -- both kinds of sources can co-exist.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Keyword (or short phrase) to search message text for. Case-insensitive.',
                    },
                    top_k: {
                        type: 'number',
                        description: 'Max hits to return (default 10, max 30).',
                    },
                    role_filter: {
                        type: 'string',
                        enum: ['user', 'assistant', 'system', 'tool'],
                        description: 'Restrict to messages of one role. Most useful: role_filter=\'user\' to find your own past statements.',
                    },
                    session_filter: {
                        type: 'string',
                        description: 'Optional conversationId. Restrict to one conversation.',
                    },
                },
                required: ['query'],
            },
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- ToolExecution interface contract: async signature shared with tools that do LLM calls
    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const query = ((input.query as string) ?? '').trim();
        if (!query) {
            callbacks.pushToolResult(this.formatError(new Error('query parameter is required')));
            return;
        }

        const historyDB = this.plugin.historyDB;
        if (!historyDB?.isOpen()) {
            callbacks.pushToolResult('History database is not open. Conversation search is unavailable.');
            return;
        }

        const topK = Math.min(Math.max(Number(input.top_k) || 10, 1), 30);
        const roleFilter = typeof input.role_filter === 'string' ? input.role_filter : undefined;
        const sessionFilter = typeof input.session_filter === 'string' ? input.session_filter : undefined;

        try {
            const where: string[] = ['text LIKE ?'];
            const params: unknown[] = [`%${query}%`];
            if (roleFilter) { where.push('role = ?'); params.push(roleFilter); }
            if (sessionFilter) { where.push('session_id = ?'); params.push(sessionFilter); }
            params.push(topK);

            const result = historyDB.getDB().exec(
                `SELECT session_id, chunk_index, role, text, created_at
                   FROM history_chunks
                  WHERE ${where.join(' AND ')}
                  ORDER BY created_at DESC
                  LIMIT ?`,
                params,
            );
            const rows = result.length > 0 ? result[0].values : [];
            if (rows.length === 0) {
                callbacks.pushToolResult(`No conversation messages matched "${query}".`);
                return;
            }

            const md = this.renderMarkdown(query, rows, topK);
            callbacks.pushToolResult(md);
        } catch (e) {
            callbacks.pushToolResult(this.formatError(e));
        }
    }

    private renderMarkdown(query: string, rows: unknown[][], topK: number): string {
        const lines: string[] = [];
        lines.push(`History search: "${query}"`);
        lines.push(`(${rows.length} hit${rows.length === 1 ? '' : 's'}${rows.length === topK ? `, capped at top_k=${topK}` : ''})`);
        lines.push('');
        for (const row of rows) {
            const sessionId = row[0] as string;
            const role = row[2] as string;
            const text = (row[3] as string).replace(/\s+/g, ' ').trim();
            const createdAt = row[4] as string;
            const meta = this.plugin.conversationStore?.list().find(m => m.id === sessionId);
            const title = meta?.title?.trim() || `Conversation ${sessionId}`;
            const link = `obsidian://obsilo-chat?id=${encodeURIComponent(sessionId)}`;
            const snippet = text.length > 220 ? text.slice(0, 217) + '...' : text;
            const date = shortDate(createdAt);
            // Auto-link bracket <...> tells the CommonMark parser this is
            // a URL, not a vault-internal path. Without it Obsidian's
            // markdown renderer feeds the link to openLinkText() and the
            // ":" in the protocol scheme triggers a createFolder error.
            lines.push(`- **${role}** in [${title}](<${link}>) -- ${date}`);
            lines.push(`  > ${snippet}`);
        }
        lines.push('');
        lines.push(
            '_When you reference any of these messages in your reply, include the ' +
            'obsidian://obsilo-chat link inline so the user can re-open the source chat._',
        );
        return lines.join('\n');
    }
}

function shortDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}
