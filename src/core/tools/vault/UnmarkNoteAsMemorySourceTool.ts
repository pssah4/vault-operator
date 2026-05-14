/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * unmark_note_as_memory_source -- FEAT-03-25 / ADR-109.
 *
 * Entfernt die Memory-Source-Markierung. Idempotent. Cascade-Delete
 * der abgeleiteten Facts ist Out-of-Scope dieses Tools (siehe
 * FEAT-03-22 Forget-Right). Optional: entfernt auch
 * `memory-source: true` aus dem Frontmatter.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { validateVaultRelativePath } from './pathValidation';

interface Input {
    note_path: string;
    clear_frontmatter?: boolean;
}

export class UnmarkNoteAsMemorySourceTool extends BaseTool<'unmark_note_as_memory_source'> {
    readonly name = 'unmark_note_as_memory_source' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) { super(plugin); }

    getDefinition(): ToolDefinition {
        return {
            name: 'unmark_note_as_memory_source',
            description:
                'Remove the memory-source marker from a Vault note. The note stays in the vault, '
                + 'but no further re-extractions will be triggered. Already-extracted facts stay '
                + 'until you delete them via the Memory v2 forget-right tools (FEAT-03-22). '
                + 'Optionally clears the `memory-source` frontmatter property as well. Idempotent.',
            input_schema: {
                type: 'object',
                properties: {
                    note_path: { type: 'string', description: 'Vault-relative path.' },
                    clear_frontmatter: {
                        type: 'boolean',
                        description: 'Default true: also remove `memory-source` from the note frontmatter.',
                    },
                },
                required: ['note_path'],
            },
        };
    }

    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const { note_path, clear_frontmatter = true } = input as unknown as Input;
        if (!note_path || typeof note_path !== 'string') {
            ctx.callbacks.pushToolResult(this.formatError('note_path is required'));
            return;
        }
        // AUDIT-016 L-5: shared validateVaultRelativePath
        const safe = validateVaultRelativePath(note_path);
        if (!safe) {
            ctx.callbacks.pushToolResult(this.formatError(`Invalid note path: ${note_path}`));
            return;
        }

        const store = this.plugin.memorySourceStore;
        if (!store) {
            ctx.callbacks.pushToolResult(this.formatError('MemorySourceStore not available.'));
            return;
        }

        const removed = store.remove(safe);

        if (clear_frontmatter) {
            const file = this.plugin.app.vault.getAbstractFileByPath(safe);
            if (file instanceof TFile && file.extension === 'md') {
                try {
                    await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
                        delete fm['memory-source'];
                        delete fm['memory_source'];
                        delete fm['memorySource'];
                    });
                } catch (e) {
                    console.warn(`[unmark_note_as_memory_source] frontmatter clear failed for ${safe}:`, e);
                }
            }
        }

        ctx.callbacks.pushToolResult(this.formatSuccess(
            removed
                ? `Note "${safe}" no longer marked as memory-source. Existing facts remain.`
                : `Note "${safe}" was not registered as memory-source (no-op).`,
        ));
    }
}
