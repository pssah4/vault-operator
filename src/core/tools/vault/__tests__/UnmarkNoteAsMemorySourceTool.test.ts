/**
 * AUDIT-015 Eval-Coverage: UnmarkNoteAsMemorySourceTool.
 */

import { describe, it, expect, vi } from 'vitest';
import { UnmarkNoteAsMemorySourceTool } from '../UnmarkNoteAsMemorySourceTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

vi.mock('obsidian', () => ({
    TFile: class { extension = 'md'; constructor(public path: string) {} },
    Notice: class {},
}));

function ctx(): { ctx: ToolExecutionContext; results: string[] } {
    const results: string[] = [];
    return {
        ctx: { callbacks: { pushToolResult: (r: string) => { results.push(r); } } } as unknown as ToolExecutionContext,
        results,
    };
}

describe('UnmarkNoteAsMemorySourceTool (AUDIT-015 Eval-Coverage)', () => {
    it('reports already-unmarked when remove returns false', async () => {
        const plugin = {
            app: {
                vault: { getAbstractFileByPath: () => null },
                fileManager: { processFrontMatter: vi.fn() },
            },
            memorySourceStore: { remove: vi.fn(() => false) },
        } as unknown as ObsidianAgentPlugin;
        const tool = new UnmarkNoteAsMemorySourceTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ note_path: 'Notes/X.md', clear_frontmatter: false }, c);
        expect(results[0]).toMatch(/not registered/);
    });

    it('reports success when remove returns true', async () => {
        const plugin = {
            app: {
                vault: { getAbstractFileByPath: () => null },
                fileManager: { processFrontMatter: vi.fn() },
            },
            memorySourceStore: { remove: vi.fn(() => true) },
        } as unknown as ObsidianAgentPlugin;
        const tool = new UnmarkNoteAsMemorySourceTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ note_path: 'Notes/X.md', clear_frontmatter: false }, c);
        expect(results[0]).toMatch(/no longer marked/);
    });

    it('rejects empty note_path', async () => {
        const plugin = { memorySourceStore: { remove: vi.fn() } } as unknown as ObsidianAgentPlugin;
        const tool = new UnmarkNoteAsMemorySourceTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ note_path: '' }, c);
        expect(results[0]).toMatch(/required/i);
    });
});
