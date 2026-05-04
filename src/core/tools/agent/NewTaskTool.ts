/**
 * NewTaskTool
 *
 * Spawns a child agent task and returns its response.
 * Available in Agent mode — enables agentic workflow patterns:
 *   Prompt Chaining, Orchestrator-Worker, Evaluator-Optimizer, Routing.
 *
 * The child task runs in the specified mode ('agent' or 'ask') with a fresh
 * conversation history and returns its complete response as the tool result.
 *
 * The parent resumes with the child's response as context for the next step.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { validateNewTaskInput } from './newTaskValidation';

export class NewTaskTool extends BaseTool<'new_task'> {
    readonly name = 'new_task' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'new_task',
            description:
                'Spawn a sub-agent. Tier 4 escalation -- VERY expensive (each sub-agent pays a fresh ~16k system prompt). ' +
                'Only use for one of three categories (must be named in `justification_category`): ' +
                'PARALLEL (3+ truly independent investigations to run simultaneously), ' +
                'SPECIALIST (sub-task needs a different mode/toolset), or ' +
                'ESCALATION (main loop is stuck for 3+ iterations on the same blocker). ' +
                'NOT for: "I am confused", "fresh perspective", routine read/write, file conversion. ' +
                'Only available in Agent mode.',
            input_schema: {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        description:
                            'Sub-agent mode: "agent" (full capabilities -- reading, writing, web) ' +
                            'or "ask" (read-only vault queries and search).',
                    },
                    message: {
                        type: 'string',
                        description:
                            'The task description for the sub-agent. Include all context needed -- ' +
                            'the sub-agent cannot see the current conversation.',
                    },
                    justification_category: {
                        type: 'string',
                        enum: ['PARALLEL', 'SPECIALIST', 'ESCALATION'],
                        description:
                            'Which of the three allowed categories applies. Refusing or guessing returns an error: spawn only when one truly applies.',
                    },
                    justification_reason: {
                        type: 'string',
                        description:
                            'One concrete sentence explaining the chosen category. Examples: ' +
                            '"PARALLEL: comparing 5 independent meeting notes to extract per-meeting decisions" / ' +
                            '"ESCALATION: edit_file failed twice, search_files cannot find the section, need fresh approach". ' +
                            'Generic phrases ("better context", "more thorough") are rejected.',
                    },
                },
                required: ['mode', 'message', 'justification_category', 'justification_reason'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;

        // ADR-090 Lever 4 + 7: full input + justification validation lives in
        // newTaskValidation.ts so the rules are unit-testable in isolation.
        const validation = validateNewTaskInput(input);
        if (!validation.ok) {
            callbacks.pushToolResult(this.formatError(new Error(validation.error)));
            return;
        }
        const { mode, message } = validation.value;

        // Only available in Agent mode.
        if (context.mode !== 'agent') {
            callbacks.pushToolResult(
                'new_task is only available in Agent mode. ' +
                'Switch to Agent mode to use sub-agent workflows.'
            );
            return;
        }

        // Depth-guard: if spawnSubtask is not wired, we are at max nesting depth.
        if (!context.spawnSubtask) {
            callbacks.pushToolResult(
                'Maximum sub-agent nesting depth reached. ' +
                'Execute this task directly using your available tools.'
            );
            return;
        }

        callbacks.log(`Spawning sub-agent in mode "${mode}": ${message.slice(0, 80)}…`);

        try {
            const result = await context.spawnSubtask(mode, message);
            callbacks.pushToolResult(
                `[Sub-agent completed — mode: ${mode}]\n\n${result || '(No response from sub-agent)'}`
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('new_task', error);
        }
    }
}
