/**
 * ListCheckpointsTool - browse automatic pre-write snapshots
 *
 * Read-only:
 * - isWriteOperation = false
 * - No approval, no checkpoint of its own
 *
 * Lets the agent enumerate snapshots from the GitCheckpointService shadow
 * repo so it can pick a commitOid for read_checkpoint / diff_checkpoint /
 * restore_checkpoint. Without arguments returns the most recent 50
 * checkpoints across all tasks; with `taskId` restricts to one task; with
 * `path` filters to commits that touched a specific file.
 *
 * Part of IMP-01-07-01.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { CheckpointInfo } from '../../checkpoints/GitCheckpointService';

interface ListCheckpointsInput {
    taskId?: string;
    path?: string;
    limit?: number;
    verbose?: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export class ListCheckpointsTool extends BaseTool<'list_checkpoints'> {
    readonly name = 'list_checkpoints' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'list_checkpoints',
            description:
                'List automatic pre-write snapshots from the checkpoint shadow repository. '
                + 'Each write-tool call (write_file, edit_file, append_to_file, ...) creates a snapshot '
                + 'before touching the vault. Use this to find a commitOid to pass to read_checkpoint, '
                + 'diff_checkpoint or restore_checkpoint when the user wants to recover an earlier '
                + 'version of a note.',
            input_schema: {
                type: 'object',
                properties: {
                    taskId: {
                        type: 'string',
                        description:
                            'Optional. Restrict the listing to a single task (e.g. "task-1700000000000"). '
                            + 'When omitted, the listing covers every task in the shadow repo.',
                    },
                    path: {
                        type: 'string',
                        description:
                            'Optional vault-relative path filter (e.g. "Notes/Madrid.md"). '
                            + 'Only checkpoints that touched this path (filesChanged or newFiles) are returned.',
                    },
                    limit: {
                        type: 'number',
                        description:
                            `Optional maximum number of commits to scan from the log. Default ${DEFAULT_LIMIT}, hard cap ${MAX_LIMIT}. Note: the limit applies BEFORE the path filter, so filtering by path may return fewer rows than the limit.`,
                    },
                    verbose: {
                        type: 'boolean',
                        description:
                            'Optional. When true, include full timestamp, full files array, and the newFiles list per entry. '
                            + 'Default false renders one compact line per checkpoint.',
                    },
                },
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { taskId, path, limit, verbose } = input as unknown as ListCheckpointsInput;
        const { callbacks } = context;

        try {
            const service = this.plugin.checkpointService;
            if (!service) {
                callbacks.pushToolResult(this.formatError(new Error('Checkpoint service is not initialised.')));
                return;
            }

            const cappedLimit = this.clampLimit(limit);

            let checkpoints: CheckpointInfo[];
            if (typeof taskId === 'string' && taskId.length > 0) {
                checkpoints = await service.loadCheckpointsForTask(taskId);
                // loadCheckpointsForTask returns chronological order (oldest first);
                // reverse so listing is consistently newest-first.
                checkpoints = [...checkpoints].reverse();
            } else {
                checkpoints = await service.listAllCheckpoints(cappedLimit);
            }

            const filtered = typeof path === 'string' && path.length > 0
                ? checkpoints.filter((cp) =>
                    cp.filesChanged.includes(path) || (cp.newFiles?.includes(path) ?? false),
                )
                : checkpoints;

            // Apply limit AFTER per-task filter (loadCheckpointsForTask has no
            // limit param). For the path filter we honour the limit on the
            // already-loaded set; the schema description warns about this.
            const limited = filtered.slice(0, cappedLimit);

            if (limited.length === 0) {
                callbacks.pushToolResult(
                    this.formatContent(
                        `No checkpoints match (taskId=${taskId ?? '*'}, path=${path ?? '*'}, scanned=${checkpoints.length}).`,
                        { count: '0' },
                    ),
                );
                callbacks.log(`list_checkpoints: 0 results (scanned ${checkpoints.length})`);
                return;
            }

            const rendered = verbose
                ? limited.map((cp) => renderVerbose(cp)).join('\n\n')
                : limited.map((cp) => renderCompact(cp)).join('\n');

            const header = `# ${limited.length} checkpoint(s)${path ? ` for ${path}` : ''}${taskId ? ` in ${taskId}` : ''}\n`;
            callbacks.pushToolResult(
                this.formatContent(`${header}${rendered}`, {
                    count: String(limited.length),
                    scanned: String(checkpoints.length),
                }),
            );
            callbacks.log(`list_checkpoints: ${limited.length} results`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('list_checkpoints', error);
        }
    }

    private clampLimit(raw: unknown): number {
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
        return Math.min(Math.floor(raw), MAX_LIMIT);
    }
}

function renderCompact(cp: CheckpointInfo): string {
    const oid = cp.commitOid.slice(0, 8);
    const ts = cp.timestamp;
    const tool = cp.toolName ?? '-';
    const fileCount = cp.filesChanged.length;
    const newCount = cp.newFiles?.length ?? 0;
    const firstFiles = cp.filesChanged.slice(0, 3).join(', ');
    const tail = fileCount > 3 ? ` +${fileCount - 3} more` : '';
    const newSuffix = newCount > 0 ? ` (+${newCount} new)` : '';
    return `${oid} | ${ts} | ${cp.taskId} | ${tool} | ${firstFiles}${tail}${newSuffix}`;
}

function renderVerbose(cp: CheckpointInfo): string {
    const lines: string[] = [];
    lines.push(`- oid:        ${cp.commitOid}`);
    lines.push(`  taskId:     ${cp.taskId}`);
    lines.push(`  timestamp:  ${cp.timestamp}`);
    if (cp.toolName) lines.push(`  tool:       ${cp.toolName}`);
    lines.push(`  files:      [${cp.filesChanged.map((f) => JSON.stringify(f)).join(', ')}]`);
    if (cp.newFiles && cp.newFiles.length > 0) {
        lines.push(`  newFiles:   [${cp.newFiles.map((f) => JSON.stringify(f)).join(', ')}]`);
    }
    if (cp.skipped && cp.skipped.length > 0) {
        lines.push(`  skipped:    [${cp.skipped.map((f) => JSON.stringify(f)).join(', ')}]`);
    }
    return lines.join('\n');
}
