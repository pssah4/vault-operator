/**
 * SwitchAgentTool (formerly SwitchModeTool) -- switch the active Agent mid-task
 *
 * The agent calls this to change to a different Agent better suited for the
 * current task. Each Agent has its own roleDefinition + tool set; switching
 * replaces section 1 of the system prompt + the available tool catalogue
 * from the next iteration onward.
 *
 * The tool ID is `switch_agent` (user-facing); the underlying parameter
 * `mode_slug` keeps the historical name because the persisted setting is
 * `currentMode` and the data type is `ModeConfig`.
 *
 * File kept as SwitchModeTool.ts for stable git-history; class name kept as
 * SwitchModeTool to avoid churning all ToolRegistry references.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { BUILT_IN_MODES } from '../../modes/builtinModes';

interface SwitchModeInput {
    mode_slug: string;
    reason: string;
}

export class SwitchModeTool extends BaseTool<'switch_agent'> {
    readonly name = 'switch_agent' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        const allModes = [
            ...BUILT_IN_MODES,
            ...this.plugin.settings.customModes,
        ];
        const modeList = allModes
            .map((m) => `- ${m.slug}: ${m.description}`)
            .join('\n');

        return {
            name: 'switch_agent',
            description:
                'Switch to a different Agent when the current task is better handled by another. ' +
                'The new Agent takes effect from the next response. ' +
                'Available agents:\n' + modeList,
            input_schema: {
                type: 'object',
                properties: {
                    mode_slug: {
                        type: 'string',
                        description: 'The slug of the agent to switch to.',
                    },
                    reason: {
                        type: 'string',
                        description: 'Brief explanation of why you are switching agents.',
                    },
                },
                required: ['mode_slug', 'reason'],
            },
        };
    }

    execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { mode_slug, reason } = input as unknown as SwitchModeInput;
        const { callbacks } = context;

        if (!mode_slug) {
            callbacks.pushToolResult(this.formatError(new Error('mode_slug parameter is required')));
            return Promise.resolve();
        }

        // Validate the mode exists
        const allModes = [...BUILT_IN_MODES, ...this.plugin.settings.customModes];
        const targetMode = allModes.find((m) => m.slug === mode_slug);

        if (!targetMode) {
            const available = allModes.map((m) => m.slug).join(', ');
            callbacks.pushToolResult(
                this.formatError(new Error(`Unknown mode: "${mode_slug}". Available: ${available}`))
            );
            return Promise.resolve();
        }

        // Notify the task loop via context callback
        if (context.switchMode) {
            context.switchMode(mode_slug);
        }

        callbacks.pushToolResult(
            `<mode_switch from="${this.plugin.settings.currentMode}" to="${mode_slug}">` +
            `Switching to ${targetMode.name} mode. Reason: ${reason}` +
            `</mode_switch>`
        );
        callbacks.log(`Mode switched to: ${mode_slug} — ${reason}`);
        return Promise.resolve();
    }
}
