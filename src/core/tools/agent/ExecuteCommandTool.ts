/**
 * ExecuteCommandTool — Execute any Obsidian command by ID (PAS-1)
 *
 * Single tool that replaces per-command adapter tools.
 * The agent learns available commands from the PLUGIN SKILLS prompt section
 * and calls execute_command({ command_id: "plugin:command-name" }).
 *
 * FEAT-29-04 / ADR-125: wraps the executeCommandById call in NoticeCapture
 * so every Notice raised by the plugin during (and shortly after) the call
 * lands in the tool_result. Without this the Obsidian API returns only
 * true/false (was the command found) and the agent stays blind to silent
 * failures inside the plugin's handler.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { withNoticeCapture, type CapturedNotice } from '../../utils/NoticeCapture';

export class ExecuteCommandTool extends BaseTool<'execute_command'> {
    readonly name = 'execute_command' as const;
    readonly isWriteOperation = true; // Commands can modify vault state

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'execute_command',
            description:
                'Execute an Obsidian command by its command ID. Commands are registered by core and community plugins. ' +
                'Use this to leverage plugin capabilities: create daily notes, insert templates, run dataview queries, etc. ' +
                'Check the PLUGIN SKILLS section in your context for available command IDs. ' +
                'The tool_result is a JSON object with the command name, plus any Notices the plugin raised during ' +
                'the call (success messages, warnings, errors). When the notices look like a failure, do NOT assume ' +
                'success -- relay the message back to the user or pick a different approach.',
            input_schema: {
                type: 'object',
                properties: {
                    command_id: {
                        type: 'string',
                        description:
                            'The Obsidian command ID to execute (e.g., "daily-notes:open", "templater-obsidian:insert-template").',
                    },
                },
                required: ['command_id'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const commandId = (input.command_id as string ?? '').trim();

        if (!commandId) {
            callbacks.pushToolResult(this.formatError(new Error('command_id parameter is required')));
            return;
        }

        try {
            const commands = this.app.commands?.commands ?? {};

            if (!commands[commandId]) {
                // Suggest similar commands (same plugin prefix)
                const prefix = commandId.split(':')[0];
                const similar = Object.keys(commands)
                    .filter((id) => id.startsWith(prefix + ':'))
                    .slice(0, 5);
                const hint = similar.length > 0
                    ? ` Available commands with prefix "${prefix}:": ${similar.join(', ')}`
                    : '';
                callbacks.pushToolResult(
                    this.formatError(new Error(`Command not found: "${commandId}".${hint}`)),
                );
                return;
            }

            // FEAT-29-04: capture Notices the command raises so silent
            // failures surface in tool_result. Includes a 250ms async tail
            // window for plugins that raise their notice slightly after
            // executeCommandById returns.
            const capture = await withNoticeCapture(
                globalThis as { Notice?: unknown },
                async () => {
                    this.app.commands.executeCommandById(commandId);
                },
            );

            const cmdName = commands[commandId]?.name ?? commandId;
            const payload = {
                executed: true,
                command_id: commandId,
                command_name: cmdName,
                notices: capture.notices.map((n: CapturedNotice) => ({
                    text: n.text,
                    severity: n.likely_severity,
                    t_ms: n.t_ms,
                    ...(n.redacted ? { redacted: true } : {}),
                })),
                truncated: capture.truncated,
                ...(capture.capturedError
                    ? { error: capture.capturedError.message }
                    : {}),
                ...(capture.patchSkipped
                    ? { capture_skipped: 'Notice patch could not attach in this environment' }
                    : {}),
            };

            callbacks.pushToolResult(this.formatSuccess(JSON.stringify(payload, null, 2)));
            callbacks.log(
                `Executed Obsidian command: ${commandId} (${capture.notices.length} notice${capture.notices.length === 1 ? '' : 's'} captured)`,
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('execute_command', error);
        }
    }
}
