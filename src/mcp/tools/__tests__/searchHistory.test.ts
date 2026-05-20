/**
 * AUDIT-015 Eval-Coverage: searchHistory MCP-Handler.
 *
 * Wraps SQL LIKE-Search auf history_chunks. Plus ConversationStore-
 * Join fuer source_interface-Filter.
 */

import { describe, it, expect } from 'vitest';
import { handleSearchHistory } from '../searchHistory';
import type ObsidianAgentPlugin from '../../../main';

function plugin(opts: {
    open?: boolean;
    rows?: Array<[string, number, string, string, string]>;  // [session_id, chunk_idx, role, text, created_at]
    metas?: Array<{ id: string; title: string; sourceInterface?: string }>;
} = {}) {
    return {
        historyDB: {
            isOpen: () => opts.open ?? true,
            getDB: () => ({
                exec: (_sql: string, _params: unknown[]) => {
                    const rows = opts.rows ?? [];
                    return rows.length > 0 ? [{ values: rows }] : [];
                },
            }),
        },
        conversationStore: {
            list: () => opts.metas ?? [],
        },
    } as unknown as ObsidianAgentPlugin;
}

describe('handleSearchHistory (AUDIT-015 Eval-Coverage)', () => {
    it('rejects empty query', async () => {
        const r = await handleSearchHistory(plugin(), { query: '   ' });
        expect(r.isError).toBe(true);
    });

    it('reports DB unavailable when history_db is closed', async () => {
        const r = await handleSearchHistory(plugin({ open: false }), { query: 'x' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toMatch(/not available/i);
    });

    it('reports no matches when SQL returns nothing', async () => {
        const r = await handleSearchHistory(plugin({ rows: [] }), { query: 'unfound' });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toMatch(/No conversation messages matched/);
    });

    it('renders hits with obsidian://vault-operator-chat links', async () => {
        const r = await handleSearchHistory(plugin({
            rows: [['sess-1', 0, 'user', 'matching text', '2026-05-03T10:00:00Z']],
            metas: [{ id: 'sess-1', title: 'My chat', sourceInterface: 'claude-ai' }],
        }), { query: 'match' });
        expect(r.content[0].text).toContain('obsidian://vault-operator-chat?id=sess-1');
        expect(r.content[0].text).toContain('My chat');
        expect(r.content[0].text).toContain('claude-ai');
    });

    it('source_interface filter excludes non-matching sessions', async () => {
        const r = await handleSearchHistory(plugin({
            rows: [
                ['sess-A', 0, 'user', 'text A', '2026-05-03T10:00:00Z'],
                ['sess-B', 0, 'user', 'text B', '2026-05-03T11:00:00Z'],
            ],
            metas: [
                { id: 'sess-A', title: 'A', sourceInterface: 'claude-ai' },
                { id: 'sess-B', title: 'B', sourceInterface: 'chatgpt' },
            ],
        }), { query: 'text', source_interface: 'claude-ai' });
        expect(r.content[0].text).toContain('sess-A');
        expect(r.content[0].text).not.toContain('sess-B');
    });

    it('clamps top_k to [1, 30]', async () => {
        // smoke -- nicht direkt verifizierbar im Mock, aber kein Throw
        const r = await handleSearchHistory(plugin({ rows: [] }), { query: 'x', top_k: 999 });
        expect(r.isError).toBeUndefined();
    });

    describe('AUDIT-015 M-3: strictSourceIsolation', () => {
        function strictPlugin() {
            return {
                historyDB: { isOpen: () => true, getDB: () => ({ exec: () => [] }) },
                conversationStore: { list: () => [] },
                settings: { memory: { crossSurface: { strictSourceIsolation: true } } },
            } as unknown as Parameters<typeof handleSearchHistory>[0];
        }

        it('rejects call without source_interface when strict isolation is on', async () => {
            const r = await handleSearchHistory(strictPlugin(), { query: 'x' });
            expect(r.isError).toBe(true);
            expect(r.content[0].text).toMatch(/strictSourceIsolation/);
        });

        it('accepts call WITH source_interface when strict isolation is on', async () => {
            const r = await handleSearchHistory(strictPlugin(), { query: 'x', source_interface: 'claude-ai' });
            expect(r.isError).toBeUndefined();
        });
    });
});
