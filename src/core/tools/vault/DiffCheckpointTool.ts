/**
 * DiffCheckpointTool - compare a snapshot to the current vault state
 *
 * Read-only:
 * - isWriteOperation = false
 * - No approval, no checkpoint of its own
 *
 * For a given commitOid: with `path` returns a line-level diff for the
 * single file, without `path` returns the service's existing summary
 * diff across all files in the checkpoint. Output is capped to keep the
 * model context bounded.
 *
 * Part of IMP-01-07-01.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface DiffCheckpointInput {
    commitOid: string;
    path?: string;
}

const MAX_DIFF_CHARS = 4000;

function isVaultRelative(p: string): boolean {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (p.includes('..')) return false;
    if (p.includes('\0')) return false;
    if (p.startsWith('/')) return false;
    return true;
}

export class DiffCheckpointTool extends BaseTool<'diff_checkpoint'> {
    readonly name = 'diff_checkpoint' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'diff_checkpoint',
            description:
                'Diff a checkpoint snapshot against the current vault state. '
                + 'Without path: a per-file summary across every file in the checkpoint. '
                + 'With path: a line-level diff for that single file. Use before restore_checkpoint '
                + 'to confirm what would change.',
            input_schema: {
                type: 'object',
                properties: {
                    commitOid: {
                        type: 'string',
                        description: 'Checkpoint commit oid (40-char lowercase hex), from list_checkpoints.',
                    },
                    path: {
                        type: 'string',
                        description: 'Optional vault-relative file path. Without it the tool returns the full per-file summary.',
                    },
                },
                required: ['commitOid'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { commitOid, path } = input as unknown as DiffCheckpointInput;
        const { callbacks } = context;

        try {
            if (!commitOid) throw new Error('commitOid is required');
            if (path !== undefined && !isVaultRelative(path)) {
                throw new Error(`Refused path: ${JSON.stringify(path)} (must be vault-relative)`);
            }

            const service = this.plugin.checkpointService;
            if (!service) throw new Error('Checkpoint service is not initialised.');

            const cp = await service.getCheckpointByOid(commitOid);
            if (!cp) {
                callbacks.pushToolResult(this.formatError(new Error(`Unknown checkpoint oid: ${commitOid}`)));
                return;
            }

            let body: string;
            if (path) {
                if (!cp.filesChanged.includes(path) && !(cp.newFiles?.includes(path) ?? false)) {
                    callbacks.pushToolResult(this.formatError(
                        new Error(`Path ${JSON.stringify(path)} is not part of checkpoint ${commitOid.slice(0, 8)}.`),
                    ));
                    return;
                }
                body = await this.singleFileDiff(cp.commitOid, path);
            } else {
                body = await service.diff(cp);
            }

            const truncated = body.length > MAX_DIFF_CHARS;
            const out = truncated
                ? `${body.slice(0, MAX_DIFF_CHARS)}\n... (truncated, use read_checkpoint for full content)`
                : body;

            callbacks.pushToolResult(this.formatContent(out, {
                oid: commitOid,
                taskId: cp.taskId,
                ...(path ? { path } : {}),
            }));
            callbacks.log(`diff_checkpoint: ${path ?? '(all files)'} from ${commitOid.slice(0, 8)} (${body.length} chars)`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('diff_checkpoint', error);
        }
    }

    private async singleFileDiff(commitOid: string, path: string): Promise<string> {
        const service = this.plugin.checkpointService;
        if (!service) return '(checkpoint service not initialised)';

        const snapshotContent = await service.getSnapshotContent({ commitOid } as { commitOid: string; taskId: string; timestamp: string; filesChanged: string[] }, path);
        if (snapshotContent === null) return `(no snapshot content for ${path})`;

        let currentContent = '';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            currentContent = await this.app.vault.read(file);
        } else if (await this.app.vault.adapter.exists(path)) {
            currentContent = await this.app.vault.adapter.read(path);
        } else {
            return `${path}: file no longer exists in the vault (snapshot has ${snapshotContent.length} chars)`;
        }

        if (snapshotContent === currentContent) {
            return `${path}: unchanged (${snapshotContent.length} chars)`;
        }

        const a = snapshotContent.split('\n');
        const b = currentContent.split('\n');
        const aSet = new Set(a);
        const bSet = new Set(b);
        const removed = a.filter((l) => !bSet.has(l));
        const added = b.filter((l) => !aSet.has(l));

        const lines: string[] = [];
        lines.push(`--- ${path} (snapshot ${commitOid.slice(0, 8)})`);
        lines.push(`+++ ${path} (current)`);
        for (const l of removed) lines.push(`- ${l}`);
        for (const l of added) lines.push(`+ ${l}`);
        return lines.join('\n');
    }
}
