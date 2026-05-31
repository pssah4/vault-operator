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

/**
 * Tool with a writable in-memory vault. The single file's content can be
 * customised per test; vault.modify captures the new content so assertions
 * can compare it against the expected post-edit shape.
 */
function makeWritableTool(initial: string): {
    tool: EditFileTool;
    file: TFile;
    captured: { content: string };
} {
    const file = new TFile();
    const captured = { content: initial };
    const plugin = {
        app: {
            vault: {
                getAbstractFileByPath: (_path: string) => file,
                read: (_f: TFile) => Promise.resolve(captured.content),
                modify: async (_f: TFile, content: string) => {
                    captured.content = content;
                },
            },
        },
    } as unknown as ObsidianAgentPlugin;
    return { tool: new EditFileTool(plugin), file, captured };
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

describe('EditFileTool fuzzy-match preserves untouched formatting (FIX-01-05-02)', () => {
    it('preserves tab-indented code fences outside the match region', async () => {
        const initial = [
            '# Title',
            '',
            '```ts',
            '\tfunction a() {',
            '\t\treturn 1;',
            '\t}',
            '```',
            '',
            'Some prose with   multiple   spaces that the agent wants to fix.',
            '',
            '```ts',
            '\tfunction b() {}',
            '```',
            '',
        ].join('\n');
        const { tool, captured } = makeWritableTool(initial);
        const { context } = makeCapturedContext();

        // Fuzzy match: old_str collapses internal whitespace, won't match exactly
        await tool.execute(
            {
                path: 'note.md',
                old_str: 'Some prose with multiple spaces that the agent wants to fix.',
                new_str: 'Some prose without extra spaces.',
            },
            context,
        );

        // Tab-indented code outside the match must remain byte-identical
        expect(captured.content).toContain('\tfunction a() {');
        expect(captured.content).toContain('\t\treturn 1;');
        expect(captured.content).toContain('\tfunction b() {}');
        // Match region replaced
        expect(captured.content).toContain('Some prose without extra spaces.');
        // Original variant gone
        expect(captured.content).not.toContain('Some prose with   multiple   spaces');
    });

    it('preserves CRLF line endings outside the match region', async () => {
        const initial = 'line one\r\nold text here\r\nline three\r\n';
        const { tool, captured } = makeWritableTool(initial);
        const { context } = makeCapturedContext();

        await tool.execute(
            {
                path: 'note.md',
                old_str: 'old  text  here', // double-space collapses to single via fuzzy
                new_str: 'new text here',
            },
            context,
        );

        // CRLF on other lines must remain
        expect(captured.content).toContain('line one\r\n');
        expect(captured.content).toContain('\r\nline three\r\n');
        expect(captured.content).toContain('new text here');
        expect(captured.content).not.toContain('old text here');
    });

    it('preserves leading and trailing whitespace of the file', async () => {
        const initial = '\n\n# Title\n\nold body content\n\n\n';
        const { tool, captured } = makeWritableTool(initial);
        const { context } = makeCapturedContext();

        await tool.execute(
            {
                path: 'note.md',
                old_str: 'old  body  content', // extra spaces, fuzzy match
                new_str: 'new body content',
            },
            context,
        );

        // Leading newlines + trailing newlines untouched
        expect(captured.content.startsWith('\n\n# Title')).toBe(true);
        expect(captured.content.endsWith('\n\n\n')).toBe(true);
        expect(captured.content).toContain('new body content');
    });

    it('rejects multi-match ambiguity instead of silently replacing the first occurrence', async () => {
        // Both "foo bar" instances would match after whitespace normalisation
        // even though old_str's exact form ("foo  bar") matches neither verbatim.
        const initial = 'first foo bar somewhere\nlater foo bar elsewhere\n';
        const { tool, captured } = makeWritableTool(initial);
        const { context, results } = makeCapturedContext();

        await tool.execute(
            { path: 'note.md', old_str: 'foo  bar', new_str: 'QUUX' },
            context,
        );

        // Content must NOT have been written
        expect(captured.content).toBe(initial);
        // Error result returned
        expect(results).toHaveLength(1);
        expect(results[0].toLowerCase()).toMatch(/match(es)? .* times|ambiguous/);
    });
});
