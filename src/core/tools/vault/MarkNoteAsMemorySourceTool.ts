/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * mark_note_as_memory_source -- FEAT-03-25 / ADR-109.
 *
 * Markiert eine Vault-Note als memory-source. Effekt: bei naechstem
 * FrontmatterIndexer-Pass auf der Note (oder beim ersten Aufruf
 * direkt nach Mark) wird Single-Call-Extraction der Note-Inhalte
 * getriggert. Idempotent: doppeltes Mark schadet nicht.
 *
 * Optional: setzt zusaetzlich `memory-source: true` im Frontmatter
 * der Note (Default true), damit der Marker auch ueber andere
 * Tools/UI-Ansichten sichtbar bleibt.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { validateVaultRelativePath } from './pathValidation';

interface Input {
    note_path: string;
    write_frontmatter?: boolean;
}

export class MarkNoteAsMemorySourceTool extends BaseTool<'mark_note_as_memory_source'> {
    readonly name = 'mark_note_as_memory_source' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) { super(plugin); }

    getDefinition(): ToolDefinition {
        return {
            name: 'mark_note_as_memory_source',
            description:
                'Mark a Vault note as memory-source. The note\'s content will be extracted into '
                + 'Memory v2 facts on the next indexer pass (and re-extracted incrementally when '
                + 'the note is edited). Idempotent. Optionally writes `memory-source: true` to the '
                + 'note frontmatter so the marker stays visible.',
            input_schema: {
                type: 'object',
                properties: {
                    note_path: { type: 'string', description: 'Vault-relative path to a markdown note.' },
                    write_frontmatter: {
                        type: 'boolean',
                        description: 'Default true: also write `memory-source: true` to the note frontmatter.',
                    },
                },
                required: ['note_path'],
            },
        };
    }

    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const { note_path, write_frontmatter = true } = input as unknown as Input;
        if (!note_path || typeof note_path !== 'string') {
            ctx.callbacks.pushToolResult(this.formatError('note_path is required'));
            return;
        }
        // AUDIT-016 L-5: shared validateVaultRelativePath -- gleicher
        // Schutz wie in IngestTriageTool (Windows backslashes, NUL,
        // url-encoded traversal).
        const safe = validateVaultRelativePath(note_path);
        if (!safe) {
            ctx.callbacks.pushToolResult(this.formatError(`Invalid note path: ${note_path}`));
            return;
        }

        const file = this.plugin.app.vault.getAbstractFileByPath(safe);
        if (!(file instanceof TFile) || file.extension !== 'md') {
            ctx.callbacks.pushToolResult(this.formatError(`Markdown note not found: ${safe}`));
            return;
        }

        const store = this.plugin.memorySourceStore;
        if (!store) {
            ctx.callbacks.pushToolResult(this.formatError('MemorySourceStore not available (memory.db not open).'));
            return;
        }

        store.upsert(safe, 'agent-tool');

        if (write_frontmatter) {
            try {
                await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
                    fm['memory-source'] = true;
                });
            } catch (e) {
                console.warn(`[mark_note_as_memory_source] frontmatter write failed for ${safe}:`, e);
            }
        }

        // Trigger indexer pass right away so the note is extracted
        // without waiting for the next vault.on(modify).
        try {
            await this.plugin.frontmatterIndexer?.indexNote(file);
        } catch (e) {
            console.debug(`[mark_note_as_memory_source] indexer pass failed for ${safe}:`, e);
        }

        ctx.callbacks.pushToolResult(this.formatSuccess(
            `Note "${safe}" marked as memory-source. Extraction will run on the next indexer pass.`,
        ));
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
