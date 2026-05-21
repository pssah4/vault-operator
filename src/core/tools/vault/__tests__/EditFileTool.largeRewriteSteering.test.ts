/**
 * FIX-01-05-01: edit_file must steer the agent toward write_file when
 * old_str is missing AND new_str is large enough that the diff payload
 * is brittle anyway. Live test 2026-05-21 showed the previous threshold
 * (>2000 chars) and soft wording ("prefer write_file") caused 5+ retries
 * of the same failing edit_file call before the agent finally switched.
 *
 * New behaviour:
 *   - Threshold lowered to >=1000 chars.
 *   - Imperative wording: "Use write_file instead".
 *   - Below-threshold path stays unchanged (small targeted edit guidance).
 */

import { describe, it, expect } from 'vitest';
import { EditFileTool } from '../EditFileTool';
import type { ToolExecutionContext } from '../../types';

function makePlugin(initialFiles: Record<string, string>) {
    const files = new Map<string, string>(Object.entries(initialFiles));
    const adapter = {
        exists: async (p: string) => files.has(p),
        read: async (p: string) => {
            const v = files.get(p);
            if (v === undefined) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        write: async (p: string, content: string) => { files.set(p, content); },
    };
    return {
        app: {
            vault: {
                adapter,
                getAbstractFileByPath: (_p: string) => null,
                read: () => Promise.reject(new Error('TFile path should not be hit here')),
                modify: () => Promise.reject(new Error('TFile path should not be hit here')),
            },
        },
    } as unknown as import('../../../../main').default;
}

function makeContext() {
    const pushed: string[] = [];
    const ctx = {
        callbacks: {
            pushToolResult: (s: string) => pushed.push(s),
            log: () => {},
            handleError: async () => {},
        },
    } as unknown as ToolExecutionContext;
    return { ctx, pushed };
}

describe('EditFileTool: large-rewrite steering (FIX-01-05-01)', () => {
    it('refuses with strong write_file steering when new_str is >= 1000 chars and old_str misses', async () => {
        const plugin = makePlugin({ '.vault-operator/notes/x.md': 'original content here' });
        const tool = new EditFileTool(plugin);
        const { ctx, pushed } = makeContext();

        await tool.execute(
            {
                path: '.vault-operator/notes/x.md',
                old_str: 'this text does not exist in the file',
                new_str: 'X'.repeat(1500),
            },
            ctx,
        );

        const msg = pushed.join('\n');
        expect(msg).toMatch(/Use write_file instead/i);
        expect(msg).not.toMatch(/prefer write_file/i);
    });

    it('fires the steering hint at the new 1000 char threshold (was 2000)', async () => {
        const plugin = makePlugin({ '.vault-operator/notes/x.md': 'original' });
        const tool = new EditFileTool(plugin);
        const { ctx, pushed } = makeContext();

        await tool.execute(
            { path: '.vault-operator/notes/x.md', old_str: 'nope', new_str: 'A'.repeat(1500) },
            ctx,
        );

        expect(pushed.join('\n')).toContain('1500 chars');
        expect(pushed.join('\n')).toMatch(/write_file/);
    });

    it('does NOT emit the write_file steer when new_str is small (< 1000 chars)', async () => {
        const plugin = makePlugin({ '.vault-operator/notes/x.md': 'original' });
        const tool = new EditFileTool(plugin);
        const { ctx, pushed } = makeContext();

        await tool.execute(
            { path: '.vault-operator/notes/x.md', old_str: 'nope', new_str: 'a small replacement of 200 chars' },
            ctx,
        );

        const msg = pushed.join('\n');
        // Generic error stays: read first, retry with shorter old_str
        expect(msg).toMatch(/old_str not found/);
        expect(msg).toMatch(/Read the file first/);
        // But NO write_file steer
        expect(msg).not.toMatch(/write_file/);
    });
});
