/**
 * EditFileTool - Diff-based file editing (Sprint 1.1)
 *
 * Replaces a specific string in a file with a new string.
 * Uses configurable fuzzy matching precision to tolerate minor formatting differences.
 * This is the primary edit mechanism - more precise than write_file (full overwrite).
 *
 * Inspired by Kilo Code's EditFileTool / search_replace approach.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface EditFileInput {
    path: string;
    old_str: string;
    new_str: string;
    expected_replacements?: number;
}

export class EditFileTool extends BaseTool<'edit_file'> {
    readonly name = 'edit_file' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'edit_file',
            description:
                'Edit a file by replacing a specific string with a new string. ' +
                'Use this to make targeted edits to existing notes without replacing the entire content. ' +
                'The old_str must exactly match the content in the file (including whitespace and newlines). ' +
                'For multi-line replacements, include enough surrounding context in old_str to make it unique. ' +
                'If you need to append content, use append_to_file instead. ' +
                'If you need to create a new file or replace all content, use write_file instead.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the file relative to vault root (e.g., "folder/note.md")',
                    },
                    old_str: {
                        type: 'string',
                        description:
                            'The exact string to find in the file. Must be unique within the file. ' +
                            'Include surrounding context if the string might appear multiple times.',
                    },
                    new_str: {
                        type: 'string',
                        description:
                            'The string to replace old_str with. Can be empty string to delete old_str.',
                    },
                    expected_replacements: {
                        type: 'number',
                        description:
                            'Number of replacements expected (default: 1). ' +
                            'Set to a higher number only if old_str intentionally appears multiple times.',
                    },
                },
                required: ['path', 'old_str', 'new_str'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { path, old_str, new_str, expected_replacements = 1 } = input as unknown as EditFileInput;
        const { callbacks } = context;

        try {
            if (!path) throw new Error('path parameter is required');
            if (old_str === undefined || old_str === null) throw new Error('old_str parameter is required');
            if (new_str === undefined || new_str === null) throw new Error('new_str parameter is required');

            // FEAT-29-05 follow-up: hidden folders (`.vault-operator/`,
            // `.obsidian/`, ...) live outside Obsidian's TFile index, so the
            // Vault API returns null. Fall back to the adapter -- it handles
            // raw filesystem paths regardless of whether Obsidian indexes
            // them. WriteFileTool and ReadFileTool already do this.
            const isHidden = path.split('/').some((seg) => seg.startsWith('.'));
            let content: string;
            let file: TFile | null = null;
            if (isHidden) {
                const adapter = this.app.vault.adapter;
                if (!(await adapter.exists(path))) {
                    throw new Error(`File not found: ${path}`);
                }
                content = await adapter.read(path);
            } else {
                const found = this.app.vault.getAbstractFileByPath(path);
                if (!found) throw new Error(`File not found: ${path}`);
                if (!(found instanceof TFile)) throw new Error(`Path is not a file: ${path}`);
                file = found;
                content = await this.app.vault.read(file);
            }

            // Count occurrences of old_str
            const occurrences = this.countOccurrences(content, old_str);

            if (occurrences === 0) {
                // Try normalized whitespace match as fallback
                const normalized = this.tryNormalizedMatch(content, old_str, new_str);
                if (normalized !== null) {
                    if (file) {
                        await this.app.vault.modify(file, normalized);
                    } else {
                        await this.app.vault.adapter.write(path, normalized);
                    }
                    const stats = this.diffStats(content, normalized);
                    const { added, removed } = this.diffNums(content, normalized);
                    callbacks.pushToolResult(
                        this.formatSuccess(`Edited ${path} (fuzzy match applied): ${stats}`) +
                        `\n<diff_stats added="${added}" removed="${removed}"/>`
                    );
                    return;
                }
                // BUG-032 / FIX-01-05-01: When new_str is large (>=1000 chars),
                // edit_file is the wrong tool -- the diff payload is brittle and
                // JSON-streaming can truncate the tool call. Live test 2026-05-21
                // showed the agent retried edit_file 5+ times on a missing old_str
                // because the steer was soft ("prefer write_file"). The threshold
                // dropped from 2000 to 1000 chars and the wording is now imperative.
                const newStrSize = (new_str ?? '').length;
                const sizeHint = newStrSize >= 1000
                    ? ` Note: new_str is ${newStrSize} chars. Use write_file instead to replace the whole file, or append_to_file to add at the end. edit_file is for targeted small edits, not large rewrites -- retrying with the same large new_str will keep failing.`
                    : '';
                throw new Error(
                    `old_str not found in file "${path}". ` +
                    `Read the file first to get the exact bytes (whitespace, blank lines, trailing newlines all count) and retry with a shorter, more unique old_str.${sizeHint}`
                );
            }

            if (occurrences > expected_replacements) {
                throw new Error(
                    `old_str appears ${occurrences} times in "${path}" but expected_replacements is ${expected_replacements}. ` +
                    `Add more surrounding context to old_str to make it unique, or increase expected_replacements.`
                );
            }

            // Perform the replacement(s)
            const newContent = this.replaceFirst(content, old_str, new_str, expected_replacements);
            if (file) {
                await this.app.vault.modify(file, newContent);
            } else {
                await this.app.vault.adapter.write(path, newContent);
            }

            const stats = this.diffStats(content, newContent);
            const replWord = expected_replacements === 1 ? 'replacement' : 'replacements';
            const { added, removed } = this.diffNums(content, newContent);
            callbacks.pushToolResult(
                this.formatSuccess(`Edited ${path} (${expected_replacements} ${replWord}): ${stats}`) +
                `\n<diff_stats added="${added}" removed="${removed}"/>`
            );
            callbacks.log(`Successfully edited file: ${path}`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('edit_file', error);
        }
    }

    /**
     * Count how many times needle appears in haystack (non-overlapping)
     */
    private countOccurrences(haystack: string, needle: string): number {
        if (!needle) return 0;
        let count = 0;
        let pos = 0;
        while ((pos = haystack.indexOf(needle, pos)) !== -1) {
            count++;
            pos += needle.length;
        }
        return count;
    }

    /**
     * Replace the first N occurrences of old_str with new_str
     */
    private replaceFirst(content: string, oldStr: string, newStr: string, count: number): string {
        let result = content;
        let replaced = 0;
        let searchFrom = 0;
        while (replaced < count) {
            const idx = result.indexOf(oldStr, searchFrom);
            if (idx === -1) break;
            result = result.substring(0, idx) + newStr + result.substring(idx + oldStr.length);
            searchFrom = idx + newStr.length;
            replaced++;
        }
        return result;
    }

    /**
     * Fallback: try matching after normalizing whitespace differences
     * Returns the modified content if match found, null otherwise.
     */
    private tryNormalizedMatch(content: string, oldStr: string, newStr: string): string | null {
        // Normalize: collapse multiple spaces/tabs to single space, trim line endings
        const normalize = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim();
        const normContent = normalize(content);
        const normOld = normalize(oldStr);

        if (normContent.includes(normOld)) {
            // Find approximate position in original content
            // Simple approach: rebuild using the normalized replacement
            const normNew = normalize(newStr);
            const replaced = normContent.replace(normOld, normNew);
            // Use the normalized replacement — whitespace is collapsed but the edit succeeds
            return replaced;
        }
        return null;
    }

    /**
     * Generate +N/-N diff stats string
     */
    private diffStats(before: string, after: string): string {
        const beforeLines = before.split('\n').length;
        const afterLines = after.split('\n').length;
        const diff = afterLines - beforeLines;
        if (diff > 0) return `+${diff} lines`;
        if (diff < 0) return `${diff} lines`;
        return 'same line count';
    }

    /**
     * Return numeric added/removed line counts for diff badge
     */
    private diffNums(before: string, after: string): { added: number; removed: number } {
        const beforeLines = before.split('\n').length;
        const afterLines = after.split('\n').length;
        return {
            added: Math.max(0, afterLines - beforeLines),
            removed: Math.max(0, beforeLines - afterLines),
        };
    }
}
