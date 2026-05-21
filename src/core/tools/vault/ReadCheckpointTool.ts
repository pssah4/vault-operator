/**
 * ReadCheckpointTool - read a vault file as it was in a specific snapshot
 *
 * Read-only:
 * - isWriteOperation = false
 * - No approval, no checkpoint of its own
 *
 * Resolves a checkpoint by commitOid via GitCheckpointService and returns
 * the snapshotted content of the requested path. The agent gets the oid
 * from a prior list_checkpoints call.
 *
 * Part of IMP-01-07-01.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface ReadCheckpointInput {
    commitOid: string;
    path: string;
}

/** Soft cap so a huge snapshot does not blow the model context. Mirrors
 *  ReadFileTool's MAX_CONTENT_CHARS budget. */
const MAX_CONTENT_CHARS = 50_000;

/** Mirrors GitCheckpointService.isVaultRelative -- reject path traversal
 *  and absolute paths defensively before handing the path to the service.
 *  Duplicated here so the tool can fail fast with a useful tool_error
 *  instead of relying on the service-internal warn-and-skip. */
function isVaultRelative(p: string): boolean {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (p.includes('..')) return false;
    if (p.includes('\0')) return false;
    if (p.startsWith('/')) return false;
    return true;
}

export class ReadCheckpointTool extends BaseTool<'read_checkpoint'> {
    readonly name = 'read_checkpoint' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'read_checkpoint',
            description:
                'Read the snapshot content of a single file from a specific checkpoint. '
                + 'Use this after list_checkpoints to inspect what a note looked like at the '
                + 'point a checkpoint was taken (before the matching write tool ran).',
            input_schema: {
                type: 'object',
                properties: {
                    commitOid: {
                        type: 'string',
                        description: 'Checkpoint commit oid (40-char lowercase hex), from list_checkpoints.',
                    },
                    path: {
                        type: 'string',
                        description: 'Vault-relative path of the file to read from the snapshot.',
                    },
                },
                required: ['commitOid', 'path'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { commitOid, path } = input as unknown as ReadCheckpointInput;
        const { callbacks } = context;

        try {
            if (!commitOid) throw new Error('commitOid is required');
            if (!path) throw new Error('path is required');
            if (!isVaultRelative(path)) throw new Error(`Refused path: ${JSON.stringify(path)} (must be vault-relative)`);

            const service = this.plugin.checkpointService;
            if (!service) throw new Error('Checkpoint service is not initialised.');

            const cp = await service.getCheckpointByOid(commitOid);
            if (!cp) {
                callbacks.pushToolResult(
                    this.formatError(new Error(`Unknown checkpoint oid: ${commitOid}`)),
                );
                return;
            }

            const content = await service.getSnapshotContent(cp, path);
            if (content === null) {
                callbacks.pushToolResult(
                    this.formatError(new Error(`Path ${JSON.stringify(path)} not found in checkpoint ${commitOid.slice(0, 8)}.`)),
                );
                return;
            }

            const originalLength = content.length;
            const body = originalLength > MAX_CONTENT_CHARS
                ? content.slice(0, MAX_CONTENT_CHARS)
                : content;
            const truncated = originalLength > MAX_CONTENT_CHARS;

            const result = this.formatContent(body, {
                oid: commitOid,
                taskId: cp.taskId,
                timestamp: cp.timestamp,
                path,
            });

            if (truncated) {
                callbacks.pushToolResult(
                    `${result}\n[Truncated: showing ${MAX_CONTENT_CHARS} of ${originalLength} chars.]`,
                );
            } else {
                callbacks.pushToolResult(result);
            }
            callbacks.log(`read_checkpoint: ${path} from ${commitOid.slice(0, 8)} (${content.length} chars)`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('read_checkpoint', error);
        }
    }
}
