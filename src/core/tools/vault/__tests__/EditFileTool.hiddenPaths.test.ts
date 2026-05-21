/**
 * FEAT-29-05 follow-up: EditFileTool must work on paths inside hidden
 * folders (.vault-operator/, .obsidian/, ...). Obsidian's TFile API
 * returns null for those paths so the tool falls back to the adapter
 * API for read+write.
 *
 * Pinning this because every skill-creator-via-edit_file iteration runs
 * through this code path -- if it regresses the agent loses the ability
 * to fix description mistakes after init.
 */

import { describe, it, expect } from 'vitest';
import { EditFileTool } from '../EditFileTool';
import type { ToolExecutionContext } from '../../types';

interface MockAdapter {
    exists: (p: string) => Promise<boolean>;
    read: (p: string) => Promise<string>;
    write: (p: string, content: string) => Promise<void>;
}

function makePlugin(initialFiles: Record<string, string>) {
    const files = new Map<string, string>(Object.entries(initialFiles));
    const adapter: MockAdapter = {
        exists: async (p) => files.has(p),
        read: async (p) => {
            const v = files.get(p);
            if (v === undefined) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        write: async (p, content) => {
            files.set(p, content);
        },
    };

    const plugin = {
        app: {
            vault: {
                adapter,
                // TFile API: hidden paths always return null (this is what
                // real Obsidian does for files under .vault-operator/).
                getAbstractFileByPath: (_p: string) => null,
                read: () => Promise.reject(new Error('TFile read should not be used for hidden paths')),
                modify: () => Promise.reject(new Error('TFile modify should not be used for hidden paths')),
            },
        },
    } as unknown as import('../../../../main').default;

    return { plugin, files };
}

function makeContext() {
    const pushed: string[] = [];
    const ctx = {
        callbacks: {
            pushToolResult: (s: string) => pushed.push(s),
            log: (_: string) => {},
            handleError: async (_tool: string, _e: unknown) => {},
        },
    } as unknown as ToolExecutionContext;
    return { ctx, pushed };
}

describe('EditFileTool hidden-path adapter fallback (FEAT-29-05)', () => {
    it('reads + writes via adapter when path lives under a hidden folder', async () => {
        const { plugin, files } = makePlugin({
            '.vault-operator/data/skills/x/SKILL.md':
                '---\nname: x\ndescription: "old desc"\n---\n\nBody',
        });
        const { ctx, pushed } = makeContext();
        const tool = new EditFileTool(plugin);

        await tool.execute({
            path: '.vault-operator/data/skills/x/SKILL.md',
            old_str: 'old desc',
            new_str: 'new desc',
        }, ctx);

        const updated = files.get('.vault-operator/data/skills/x/SKILL.md');
        expect(updated).toBeDefined();
        expect(updated).toContain('new desc');
        expect(updated).not.toContain('old desc');

        // Result is success, not an error
        expect(pushed.join('\n')).toMatch(/Edited|replacement/);
    });

    it('throws "File not found" when the hidden path does not exist', async () => {
        const { plugin } = makePlugin({});
        const { ctx, pushed } = makeContext();
        const tool = new EditFileTool(plugin);

        await tool.execute({
            path: '.vault-operator/data/skills/missing/SKILL.md',
            old_str: 'x',
            new_str: 'y',
        }, ctx);

        expect(pushed.join('\n')).toMatch(/File not found/);
    });

    it('detects hidden paths in any nested segment', async () => {
        const { plugin, files } = makePlugin({
            'Notes/.archive/old.md': 'before',
        });
        const { ctx, pushed } = makeContext();
        const tool = new EditFileTool(plugin);

        await tool.execute({
            path: 'Notes/.archive/old.md',
            old_str: 'before',
            new_str: 'after',
        }, ctx);

        expect(files.get('Notes/.archive/old.md')).toBe('after');
        expect(pushed.join('\n')).toMatch(/Edited|replacement/);
    });
});
