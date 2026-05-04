/**
 * AUDIT-015 Eval-Coverage: ListMemorySourceNotesTool.
 */

import { describe, it, expect, vi } from 'vitest';
import { ListMemorySourceNotesTool } from '../ListMemorySourceNotesTool';
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

describe('ListMemorySourceNotesTool (AUDIT-015 Eval-Coverage)', () => {
    it('reports empty list', async () => {
        const plugin = {
            memorySourceStore: { list: () => [], listDirty: () => [] },
        } as unknown as ObsidianAgentPlugin;
        const tool = new ListMemorySourceNotesTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toMatch(/No notes registered/i);
    });

    it('renders rows with marker source + fact count', async () => {
        const plugin = {
            memorySourceStore: {
                list: () => [
                    { notePath: 'Notes/A.md', markerSource: 'frontmatter', dirty: false, factCount: 3, lastExtractedAt: '2026-05-03T10:00:00Z' },
                    { notePath: 'Notes/B.md', markerSource: 'agent-tool', dirty: true, factCount: 0, lastExtractedAt: null },
                ],
                listDirty: () => [],
            },
        } as unknown as ObsidianAgentPlugin;
        const tool = new ListMemorySourceNotesTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toContain('Notes/A.md');
        expect(results[0]).toContain('frontmatter');
        expect(results[0]).toContain('3 facts');
        expect(results[0]).toContain('Notes/B.md');
        expect(results[0]).toContain('[dirty]');
        expect(results[0]).toContain('never-extracted');
    });

    it('only_dirty filters to dirty=true rows', async () => {
        const plugin = {
            memorySourceStore: {
                list: () => [],
                listDirty: () => [
                    { notePath: 'Notes/Dirty.md', markerSource: 'agent-tool', dirty: true, factCount: 0, lastExtractedAt: null },
                ],
            },
        } as unknown as ObsidianAgentPlugin;
        const tool = new ListMemorySourceNotesTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ only_dirty: true }, c);
        expect(results[0]).toContain('Notes/Dirty.md');
        expect(results[0]).toContain('only dirty');
    });

    it('reports MemorySourceStore unavailable', async () => {
        const plugin = { memorySourceStore: null } as unknown as ObsidianAgentPlugin;
        const tool = new ListMemorySourceNotesTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({}, c);
        expect(results[0]).toMatch(/not available/i);
    });
});
