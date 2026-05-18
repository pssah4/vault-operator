/**
 * NewTaskTool
 *
 * Spawns a child agent task and returns its response.
 * Available in Agent mode — enables agentic workflow patterns:
 *   Prompt Chaining, Orchestrator-Worker, Evaluator-Optimizer, Routing.
 *
 * The child task runs as a sub-Agent (slug "agent" by default, or any custom Agent slug) with a fresh
 * conversation history and returns its complete response as the tool result.
 *
 * The parent resumes with the child's response as context for the next step.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { validateNewTaskInput } from './newTaskValidation';
import { listSubagentProfileNames } from '../../agent/subagent-profiles';

/**
 * FEAT-24-04 / ADR-113: hard fallback when settings.subtaskTokenBudget is
 * not yet migrated for an existing user. Mirrors the default in
 * settings.ts so the budget cannot be silently disabled.
 */
const DEFAULT_SUBTASK_TOKEN_BUDGET = 8000;

export class NewTaskTool extends BaseTool<'new_task'> {
    readonly name = 'new_task' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        const profileNames = listSubagentProfileNames();
        return {
            name: 'new_task',
            description:
                'Spawn a sub-agent. Two paths: '
                + '(1) profile="research" for multi-step read-only research (vault search + reads + web): '
                + 'the sub-agent runs with a lean read-only profile (no writes, no further sub-agents) '
                + 'and returns a compact summary; use when answering requires N>3 reads or searches. '
                + 'The Tier-4 justification is NOT required on this path. '
                + '(2) Without profile: Tier-4 escalation -- VERY expensive (each sub-agent pays a fresh ~16k system prompt). '
                + 'Only use for PARALLEL (3+ truly independent investigations), '
                + 'SPECIALIST (sub-task needs a different mode/toolset), or '
                + 'ESCALATION (main loop stuck for 3+ iterations on the same blocker). '
                + 'NOT for: "I am confused", "fresh perspective", routine read/write, file conversion. '
                + 'Only available in Agent mode.',
            input_schema: {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        description:
                            'Sub-agent slug. Use "agent" for the default Agent (full capabilities). ' +
                            'With profile="research", mode is ignored and the profile runs read-only.',
                    },
                    message: {
                        type: 'string',
                        description:
                            'The task description for the sub-agent. Include all context needed -- ' +
                            'the sub-agent cannot see the current conversation.',
                    },
                    profile: {
                        type: 'string',
                        enum: profileNames,
                        description:
                            'Optional. Pick a subagent profile for the lean path. With "research", the sub-agent gets a read-only tool allowlist and a short focused system prompt, and the Tier-4 justification is not required.',
                    },
                    justification_category: {
                        type: 'string',
                        enum: ['PARALLEL', 'SPECIALIST', 'ESCALATION'],
                        description:
                            'Required when no `profile` is set. One of PARALLEL, SPECIALIST, ESCALATION. Refusing or guessing returns an error.',
                    },
                    justification_reason: {
                        type: 'string',
                        description:
                            'Required when no `profile` is set. One concrete sentence explaining the chosen category. Examples: ' +
                            '"PARALLEL: comparing 5 independent meeting notes" / ' +
                            '"ESCALATION: edit_file failed twice, search_files cannot find the section". ' +
                            'Generic phrases ("better context", "more thorough") are rejected.',
                    },
                },
                required: ['mode', 'message'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;

        // ADR-090 Lever 4 + 7 + FEAT-24-04 / ADR-113 (profile path): full input
        // + justification validation lives in newTaskValidation.ts so the rules
        // are unit-testable in isolation.
        const validation = validateNewTaskInput(input);
        if (!validation.ok) {
            callbacks.pushToolResult(this.formatError(new Error(validation.error)));
            return;
        }
        const { mode, message, profile } = validation.value;

        // Only available in Agent mode.
        if (context.mode !== 'agent') {
            callbacks.pushToolResult(
                'new_task is only available in Agent mode. ' +
                'Switch to Agent mode to use sub-agent workflows.'
            );
            return;
        }

        // FEAT-24-04 / ADR-113: hard per-call token budget. Chars / 4 mirrors
        // the rule-of-thumb used in src/types/model-registry.ts; close enough
        // for an early-rejection check. Prevents a subagent from starting with
        // an already overfull request.
        const budget = this.plugin.settings.advancedApi?.subtaskTokenBudget ?? DEFAULT_SUBTASK_TOKEN_BUDGET;
        const estimatedTokens = Math.ceil(message.length / 4);
        if (estimatedTokens > budget) {
            callbacks.pushToolResult(this.formatError(new Error(
                `new_task message exceeds the per-call token budget: ${estimatedTokens} tokens > ${budget} budget. `
                + 'Shorten the message (drop unnecessary context, keep only what the sub-agent needs to answer the question) and call new_task again. '
                + 'The budget is configurable in Settings -> Advanced API -> subtaskTokenBudget.'
            )));
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

        const label = profile ? `profile=${profile}` : `mode=${mode}`;
        callbacks.log(`Spawning sub-agent (${label}): ${message.slice(0, 80)}…`);

        try {
            // Profile path passes `profile` as the third argument; the parent
            // AgentTask.spawnSubtask resolves it to a lean SubagentProfile.
            const result = await context.spawnSubtask(mode, message, profile || undefined);
            const header = profile
                ? `[Sub-agent completed -- profile: ${profile}]`
                : `[Sub-agent completed -- mode: ${mode}]`;
            callbacks.pushToolResult(
                `${header}\n\n${result || '(No response from sub-agent)'}`
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('new_task', error);
        }
    }
}
