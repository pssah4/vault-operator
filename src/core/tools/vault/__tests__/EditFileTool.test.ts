/**
 * FIX-01-05-01 regression coverage for EditFileTool's large-rewrite steering.
 *
 * Live test 2026-05-21 (meeting-summary subskill) showed the agent retrying
 * edit_file 5+ times on a missing old_str with a 2397-char new_str because
 * the steer was soft ("prefer write_file") and only fired above 2000 chars.
 * The fix dropped the threshold to 1000 chars and made the wording an
 * imperative ("Use write_file instead"). These tests pin both the threshold
 * boundary and the wording so a future refactor cannot silently regress it.
 *
 * We drive execute() with a minimal fake plugin: the vault returns a TFile
 * whose content never contains old_str, so execution always lands in the
 * "old_str not found" branch where the size hint is decided. The error text
 * reaches the test through the captured pushToolResult callback.
 */

import { describe, it, expect } from 'vitest';
import { TFile } from 'obsidian';

import { EditFileTool } from '../EditFileTool';
import type { ToolCallbacks, ToolExecutionContext } from '../../types';
import type ObsidianAgentPlugin from '../../../../main';

/** A file whose content never matches the requested old_str. */
const FILE_CONTENT = 'The quick brown fox.\nNothing here matches the search.\n';

function makeTool(): EditFileTool {
    const file = new TFile();
    const plugin = {
        app: {
            vault: {
                getAbstractFileByPath: (_path: string) => file,
                read: (_file: TFile) => Promise.resolve(FILE_CONTENT),
            },
        },
    } as unknown as ObsidianAgentPlugin;
    return new EditFileTool(plugin);
}

function makeCapturedContext(): { context: ToolExecutionContext; results: string[] } {
    const results: string[] = [];
    const callbacks: ToolCallbacks = {
        pushToolResult(content) {
            results.push(typeof content === 'string' ? content : JSON.stringify(content));
        },
        handleError() { /* ignore */ },
        log() { /* ignore */ },
    };
    const context: ToolExecutionContext = {
        taskId: 'test-task',
        mode: 'agent',
        callbacks,
    };
    return { context, results };
}

describe('EditFileTool large-rewrite steering (FIX-01-05-01)', () => {
    it('steers a large new_str (>=1000 chars) without a match to write_file', async () => {
        const tool = makeTool();
        const { context, results } = makeCapturedContext();

        await tool.execute(
            { path: 'note.md', old_str: 'DOES NOT EXIST', new_str: 'x'.repeat(1500) },
            context,
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toContain('Use write_file instead');
        expect(results[0]).toContain('new_str is 1500 chars');
    });

    it('fires exactly at the 1000-char threshold', async () => {
        const tool = makeTool();
        const { context, results } = makeCapturedContext();

        await tool.execute(
            { path: 'note.md', old_str: 'DOES NOT EXIST', new_str: 'x'.repeat(1000) },
            context,
        );

        expect(results[0]).toContain('Use write_file instead');
    });

    it('does NOT add the write_file hint for a small new_str (<1000 chars)', async () => {
        const tool = makeTool();
        const { context, results } = makeCapturedContext();

        await tool.execute(
            { path: 'note.md', old_str: 'DOES NOT EXIST', new_str: 'x'.repeat(999) },
            context,
        );

        expect(results).toHaveLength(1);
        expect(results[0]).toContain('old_str not found');
        expect(results[0]).not.toContain('Use write_file instead');
    });
});
