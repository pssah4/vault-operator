/**
 * RestoreCheckpointTool - roll a file (or full task) back to a snapshot
 *
 * Write operation:
 * - isWriteOperation = true
 * - Triggers the approval pipeline like every other write tool
 * - Pre-restore snapshot taken explicitly inside the tool so the user
 *   can undo the restore itself (the pipeline's auto-snapshot only
 *   covers toolCall.input.path, which is undefined in mode='task')
 *
 * Behaviour:
 * - mode='file' (default when `path` is set): write the snapshot content
 *   of `path` back into the vault. Does NOT touch other files in the
 *   checkpoint.
 * - mode='task' (default when `path` is omitted): full task rollback --
 *   restore every file in cp.filesChanged and trash every file in
 *   cp.newFiles. Equivalent to the sidebar's "Undo all" button.
 *
 * Part of IMP-01-07-01.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface RestoreCheckpointInput {
    commitOid: string;
    path?: string;
    mode?: 'file' | 'task';
}

function isVaultRelative(p: string): boolean {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (p.includes('..')) return false;
    if (p.includes('\0')) return false;
    if (p.startsWith('/')) return false;
    return true;
}

export class RestoreCheckpointTool extends BaseTool<'restore_checkpoint'> {
    readonly name = 'restore_checkpoint' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'restore_checkpoint',
            description:
                'Roll a vault file (or every file a task touched) back to a checkpoint snapshot. '
                + 'Use this after list_checkpoints + diff_checkpoint to recover an earlier version. '
                + 'Mode "file" restores just the path argument; mode "task" restores every file in '
                + 'the checkpoint AND trashes any files the task newly created. The tool takes its '
                + 'own pre-restore snapshot first so the restore can itself be undone via the next '
                + 'list_checkpoints entry.',
            input_schema: {
                type: 'object',
                properties: {
                    commitOid: {
                        type: 'string',
                        description: 'Checkpoint commit oid (40-char lowercase hex), from list_checkpoints.',
                    },
                    path: {
                        type: 'string',
                        description:
                            'Vault-relative file path to restore. Required when mode is "file" (the '
                            + 'default if path is given). Ignored when mode is "task".',
                    },
                    mode: {
                        type: 'string',
                        enum: ['file', 'task'],
                        description:
                            'Optional. "file" restores only `path`. "task" restores every file in the '
                            + 'checkpoint AND trashes newFiles. Default is inferred: "file" when path '
                            + 'is set, "task" when it is not.',
                    },
                },
                required: ['commitOid'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { commitOid, path, mode } = input as unknown as RestoreCheckpointInput;
        const { callbacks } = context;

        try {
            if (!commitOid) throw new Error('commitOid is required');
            const effectiveMode: 'file' | 'task' = mode ?? (path ? 'file' : 'task');
            if (effectiveMode === 'file') {
                if (!path) throw new Error('path is required when mode is "file"');
                if (!isVaultRelative(path)) {
                    throw new Error(`Refused path: ${JSON.stringify(path)} (must be vault-relative)`);
                }
            }

            const service = this.plugin.checkpointService;
            if (!service) throw new Error('Checkpoint service is not initialised.');

            const cp = await service.getCheckpointByOid(commitOid);
            if (!cp) {
                callbacks.pushToolResult(this.formatError(new Error(`Unknown checkpoint oid: ${commitOid}`)));
                return;
            }

            // Pre-restore snapshot: lets the user undo the restore itself. The
            // pipeline auto-snapshot only fires for toolCall.input.path, which
            // is undefined in mode='task' -- so we always run our own snapshot
            // here, covering the union of files we are about to touch.
            const affected = effectiveMode === 'task'
                ? Array.from(new Set([...cp.filesChanged, ...(cp.newFiles ?? [])]))
                : [path as string];
            const restoreTaskId = `restore-${Date.now()}`;
            try {
                await service.snapshot(restoreTaskId, affected, 'restore_checkpoint');
            } catch (e) {
                console.warn('[Checkpoints] Pre-restore snapshot failed (non-fatal):', e);
            }

            if (effectiveMode === 'task') {
                const result = await service.restore(cp);
                const ok = result.restored.length;
                const errs = result.errors.length;
                const summary = `Restored ${ok} file(s) from checkpoint ${commitOid.slice(0, 8)}`
                    + (errs > 0 ? `; ${errs} error(s):\n${result.errors.join('\n')}` : '');
                callbacks.pushToolResult(this.formatSuccess(summary));
                callbacks.log(`restore_checkpoint (task): ${ok} restored, ${errs} errors`);
                return;
            }

            // mode === 'file'
            if (!cp.filesChanged.includes(path as string)
                && !(cp.newFiles?.includes(path as string) ?? false)) {
                callbacks.pushToolResult(this.formatError(new Error(
                    `Path ${JSON.stringify(path)} is not part of checkpoint ${commitOid.slice(0, 8)}.`,
                )));
                return;
            }

            const content = await service.getSnapshotContent(cp, path as string);
            if (content === null) {
                callbacks.pushToolResult(this.formatError(new Error(
                    `Snapshot has no content for ${JSON.stringify(path)} -- file may have been new in the task; use mode="task" to trash it.`,
                )));
                return;
            }

            const existing = this.app.vault.getAbstractFileByPath(path as string);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.adapter.write(path as string, content);
            }

            callbacks.pushToolResult(this.formatSuccess(
                `Restored ${path} (${content.length} chars) from checkpoint ${commitOid.slice(0, 8)}.`,
            ));
            callbacks.log(`restore_checkpoint (file): ${path} from ${commitOid.slice(0, 8)}`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('restore_checkpoint', error);
        }
    }
}
