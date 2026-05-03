/**
 * search_history -- BA-26 / FEAT-23-02.
 *
 * MCP exposure of the agent-internal SearchHistoryTool. Wraps SQL
 * LIKE-search against history_chunks. Optional source_interface and
 * role filters; returns clickable obsidian://obsilo-chat links so
 * the user can re-enter the source conversation.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import {
    validateSourceInterface,
    type SourceInterface,
} from '../../core/memory/SourceInterface';

export async function handleSearchHistory(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return errorResult('query is required');

    const historyDB = plugin.historyDB;
    if (!historyDB?.isOpen()) {
        return errorResult('History database is not available');
    }

    const topK = clamp(Number(args.top_k) || 10, 1, 30);
    const roleFilter = typeof args.role === 'string'
        && ['user', 'assistant', 'system', 'tool'].includes(args.role)
            ? args.role : undefined;
    let sourceFilter: SourceInterface | undefined = args.source_interface !== undefined
        ? validateSourceInterface(args.source_interface)
        : undefined;

    // AUDIT-015 M-3: strictSourceIsolation erzwingt source_interface
    // Filter, sonst Read-Verweigerung.
    const crossSurface = plugin.settings?.memory?.crossSurface;
    if (crossSurface?.strictSourceIsolation && !sourceFilter) {
        return errorResult(
            'strictSourceIsolation is enabled in Settings -- search_history requires '
            + 'an explicit source_interface argument to scope the read.',
        );
    }

    try {
        const where: string[] = ['text LIKE ?'];
        const params: unknown[] = [`%${query}%`];
        if (roleFilter) { where.push('role = ?'); params.push(roleFilter); }
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
            return { content: [{ type: 'text', text: `No conversation messages matched "${query}".` }] };
        }

        // Source-Filter happens against ConversationStore meta because
        // history_chunks does not carry source_interface today.
        const conversationMetas = plugin.conversationStore?.list() ?? [];
        const metaById = new Map(conversationMetas.map((m) => [m.id, m]));
        type Hit = { sessionId: string; role: string; text: string; created: string; title: string; source: SourceInterface };
        const hits: Hit[] = [];
        for (const row of rows) {
            const sessionId = row[0] as string;
            const meta = metaById.get(sessionId);
            const source = (meta?.sourceInterface ?? 'obsilo') as SourceInterface;
            if (sourceFilter && source !== sourceFilter) continue;
            hits.push({
                sessionId,
                role: row[2] as string,
                text: (row[3] as string).slice(0, 600),
                created: row[4] as string,
                title: meta?.title ?? 'Conversation',
                source,
            });
        }
        if (hits.length === 0) {
            return { content: [{ type: 'text', text: `No matches after source filter "${sourceFilter ?? '*'}".` }] };
        }

        const lines: string[] = [`History matches for "${query}" (${hits.length} hits):`, ''];
        for (const h of hits) {
            const link = `obsidian://obsilo-chat?id=${encodeURIComponent(h.sessionId)}`;
            lines.push(`- [${h.title}](<${link}>) -- ${h.role} (${h.source}, ${h.created.slice(0, 10)})`);
            lines.push(`  > ${h.text.replace(/\n/g, ' ')}`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
        return errorResult(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

function clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max);
}

function errorResult(text: string): McpToolResult {
    return { content: [{ type: 'text', text: 'Error: ' + text }], isError: true };
}
