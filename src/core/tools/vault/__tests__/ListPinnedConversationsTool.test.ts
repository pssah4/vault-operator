/**
 * IMP-24-06-02 Eval-Coverage: ListPinnedConversationsTool.
 */

import { describe, it, expect, vi } from 'vitest';
import { ListPinnedConversationsTool } from '../ListPinnedConversationsTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

vi.mock('obsidian', () => ({ TFile: class {}, Notice: class {} }));

function ctx(): { ctx: ToolExecutionContext; results: string[] } {
    const results: string[] = [];
    return {
        ctx: { callbacks: { pushToolResult: (r: string) => { results.push(r); } } } as unknown as ToolExecutionContext,
        results,
    };
}

function mockPlugin(opts: {
    isOpen?: boolean;
    rows?: Array<[string, number]>;
    metas?: Array<{ id: string; title: string; updated?: string }>;
    throwOnExec?: boolean;
}): ObsidianAgentPlugin {
    const { isOpen = true, rows = [], metas = [], throwOnExec = false } = opts;
    const dbExec = (..._args: unknown[]) => {
        if (throwOnExec) throw new Error('synthetic db error');
        if (rows.length === 0) return [];
        return [{ columns: ['source_session_id', 'cnt'], values: rows }];
    };
    return {
        memoryDB: {
            isOpen: () => isOpen,
            getDB: () => ({ exec: dbExec }),
        },
        conversationStore: { list: () => metas },
    } as unknown as ObsidianAgentPlugin;
}

describe('ListPinnedConversationsTool (IMP-24-06-02)', () => {
    it('reports empty list when no pinned chats exist', async () => {
        const tool = new ListPinnedConversationsTool(mockPlugin({ rows: [] }));
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toMatch(/No conversations pinned/i);
    });

    it('renders rows with title + fact count + updated date', async () => {
        const tool = new ListPinnedConversationsTool(mockPlugin({
            rows: [['conv-1', 5], ['conv-2', 2]],
            metas: [
                { id: 'conv-1', title: 'Innovation Strategy', updated: '2026-05-12T08:00:00Z' },
                { id: 'conv-2', title: 'Vault Cleanup\nMore detail', updated: '2026-05-11T15:30:00Z' },
            ],
        }));
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        const out = results[0];
        expect(out).toContain('Innovation Strategy');
        expect(out).toContain('5 facts');
        expect(out).toContain('2026-05-12');
        // Multi-line title is trimmed to first line
        expect(out).toContain('Vault Cleanup');
        expect(out).not.toContain('More detail');
    });

    it('flags orphan facts (conversation deleted but facts remain)', async () => {
        const tool = new ListPinnedConversationsTool(mockPlugin({
            rows: [['orphan-id', 3]],
            metas: [], // No matching meta
        }));
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toContain('(deleted conversation)');
        expect(results[0]).toContain('orphan-id');
        expect(results[0]).toContain('3 facts');
    });

    it('reports Memory DB unavailable', async () => {
        const tool = new ListPinnedConversationsTool(mockPlugin({ isOpen: false }));
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toMatch(/Memory database is not available/i);
    });

    it('returns a generic tool_error when the DB query throws (AUDIT-023 L-2: no DB-error leakage)', async () => {
        const tool = new ListPinnedConversationsTool(mockPlugin({ throwOnExec: true }));
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toMatch(/Failed to query pinned conversations/i);
        // The raw exception message stays in the dev console, NOT in the tool result.
        expect(results[0]).not.toContain('synthetic db error');
    });

    it('respects the limit parameter (passed through to SQL)', async () => {
        let capturedLimit: unknown = null;
        const plugin = {
            memoryDB: {
                isOpen: () => true,
                getDB: () => ({
                    exec: (_sql: string, params: unknown[]) => {
                        capturedLimit = params[0];
                        return [];
                    },
                }),
            },
            conversationStore: { list: () => [] },
        } as unknown as ObsidianAgentPlugin;
        const tool = new ListPinnedConversationsTool(plugin);
        const { ctx: c } = ctx();
        await tool.execute({ limit: 10 }, c);
        expect(capturedLimit).toBe(10);
    });
});
