/**
 * InvokeSkillTool -- FEAT-29-10 Step B.
 *
 * Skill-to-skill composition. The agent calls this tool from within
 * one skill workflow to delegate part of the work to another skill.
 * The sub-skill runs as a subtask: own AgentTask, own message buffer,
 * own attempt_completion. Its final result is returned to the caller
 * as a tool_result.
 *
 * Safety:
 *   - skill_name validated via isSafePathSegment
 *   - Cycle-detection through the shared CompositionStackService
 *   - Max-depth enforcement (default 5) through the same service
 *   - Stack hygiene: entry is popped on success AND on error
 *
 * Approval: this is a `self-modify`-class tool because invoking a sub-
 * skill may indirectly trigger writes via the subtask. The usual
 * approval gates inside the subtask still fire for the subtask's own
 * tool calls -- spawning the subtask itself is gated by the user's
 * subtask-approval flow at the agent-task level.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext, ToolName } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { isSafePathSegment } from '../../utils/safePathName';
import {
    CompositionCycleError,
    CompositionDepthExceededError,
} from '../../skills/CompositionStackService';
import { stigmergySkillId } from '../../stigmergy/StigmergyAdapter';
import { emitStigmergyInvoked, emitStigmergyReturned } from '../../stigmergy/stigmergyEmitGate';

interface InvokeSkillArgs {
    skill_name: string;
    args?: Record<string, unknown>;
    max_iterations?: number;
}

/**
 * Default loop budget for invoke_skill spawns. Lower than the main loop's
 * 25 so a runaway sub-skill cannot quietly multiply the parent's cost.
 * Caller can raise per-call via `args.max_iterations`. Skills that
 * legitimately need more iterations than this default should split
 * themselves up; that's almost always the right answer.
 */
const DEFAULT_SUBSKILL_MAX_ITERATIONS = 12;
/** Hard upper bound on what a single skill body can request. */
const HARD_SUBSKILL_MAX_ITERATIONS = 25;

export class InvokeSkillTool extends BaseTool<'invoke_skill'> {
    readonly name = 'invoke_skill' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'invoke_skill',
            description:
                'Run another self-authored or builtin skill as a sub-skill. '
                + 'Use this when one skill\'s workflow names another skill as a building block '
                + '("now run the meeting-summary skill on the active note"). The sub-skill executes '
                + 'in an isolated subtask: own conversation history, own attempt_completion. '
                + 'Its final result string is returned to you as the tool_result. '
                + 'Cycle detection and a max-depth limit (default 5) protect against runaway recursion.',
            input_schema: {
                type: 'object',
                properties: {
                    skill_name: {
                        type: 'string',
                        description: 'Name of the sub-skill (folder name under data/skills/).',
                    },
                    args: {
                        type: 'object',
                        description: 'JSON-serializable inputs passed to the sub-skill. '
                            + 'Inputs appear in the sub-skill\'s prompt under a "## Inputs" section.',
                        additionalProperties: true,
                    },
                    max_iterations: {
                        type: 'number',
                        description: `Per-call loop budget for the sub-skill (default ${DEFAULT_SUBSKILL_MAX_ITERATIONS}, hard cap ${HARD_SUBSKILL_MAX_ITERATIONS}). Lower keeps cost predictable. Raise only when the skill explicitly needs more iterations.`,
                    },
                },
                required: ['skill_name'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks, spawnSubtask, compositionStack } = context;
        const args = input as unknown as InvokeSkillArgs;
        const skillName = (args.skill_name ?? '').trim();
        const subArgs = args.args ?? {};

        // Input validation
        if (!skillName) {
            callbacks.pushToolResult(this.formatError(new Error('skill_name parameter is required')));
            return;
        }
        if (!isSafePathSegment(skillName)) {
            callbacks.pushToolResult(this.formatError(
                new Error(`invalid skill_name (path-traversal guard): ${JSON.stringify(skillName)}`),
            ));
            return;
        }

        // Subtask infrastructure must be available. At the deepest
        // subtask layer (maxSubtaskDepth) spawnSubtask is not wired, so
        // we cannot go deeper.
        if (!spawnSubtask) {
            callbacks.pushToolResult(this.formatError(
                new Error('Cannot invoke sub-skill: subtask spawning is not available at this depth.'),
            ));
            return;
        }
        if (!compositionStack) {
            callbacks.pushToolResult(this.formatError(
                new Error('Composition stack not configured on this AgentTask.'),
            ));
            return;
        }

        // Skill must exist in the loader
        const skillLoader = this.plugin.selfAuthoredSkillLoader;
        if (!skillLoader) {
            callbacks.pushToolResult(this.formatError(
                new Error('Skill loader not available.'),
            ));
            return;
        }
        const skill = skillLoader.getSkill(skillName);
        if (!skill) {
            callbacks.pushToolResult(this.formatError(
                new Error(`Skill not found: ${skillName}. Use read_skill or check the SKILLS directory in the system prompt.`),
            ));
            return;
        }

        // Push composition stack entry. Throws on cycle / depth-exceeded
        // BEFORE we spawn anything.
        try {
            compositionStack.push({ type: 'skill', id: skillName });
        } catch (e) {
            if (e instanceof CompositionCycleError || e instanceof CompositionDepthExceededError) {
                callbacks.pushToolResult(this.formatError(e));
                return;
            }
            callbacks.pushToolResult(this.formatError(e));
            return;
        }

        // Stigmergy: emit at the inner dispatch (the spawn itself) with a
        // namespaced skill id so the substrate sees `skill:<name>` as a
        // first-class capability and not just the outer `invoke_skill`
        // dispatcher star. Pipeline still emits `invoke_skill`
        // invoked/returned around the whole call.
        // FEAT-32-01 PR 1.2 / ADR-131: route emits through the gate helper so
        // the inner `skill:<name>` event respects the outer dispatchSource
        // (FastPath / planner -> no emit).
        const stigmergyTurn = context.stigmergyTurn;
        const dispatchSource = context.dispatchSource;
        const capId = stigmergySkillId(skillName);
        await emitStigmergyInvoked(stigmergyTurn, capId, dispatchSource);
        let invokedOk = false;
        try {
            const message = this.composeSubtaskMessage(skillName, skill.body, subArgs);
            // FEAT-29-10 follow-up: clamp args.max_iterations to the hard
            // cap, fall back to DEFAULT if absent or non-numeric.
            const requested = typeof args.max_iterations === 'number'
                ? Math.max(1, Math.floor(args.max_iterations))
                : DEFAULT_SUBSKILL_MAX_ITERATIONS;
            const maxIterations = Math.min(requested, HARD_SUBSKILL_MAX_ITERATIONS);
            // Skill frontmatter `allowedTools` -> subtask tool allowlist.
            // Empty array means "no opinion", let the subtask see the full set.
            const allowedTools = skill.allowedTools.length > 0
                ? (skill.allowedTools as ToolName[])
                : undefined;
            const subResult = await spawnSubtask('agent', message, undefined, {
                maxIterations,
                allowedTools,
            });
            callbacks.pushToolResult(this.formatSuccess(JSON.stringify({
                ok: true,
                skill: skillName,
                depth: compositionStack.depth(),
                maxIterations,
                allowedToolsCount: allowedTools?.length ?? null,
                result: subResult,
            }, null, 2)));
            callbacks.log(`Invoked sub-skill: ${skillName} (depth ${compositionStack.depth()}, maxIter=${maxIterations}, tools=${allowedTools?.length ?? 'inherit'})`);
            invokedOk = true;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            callbacks.pushToolResult(this.formatError(
                new Error(`Sub-skill ${skillName} failed: ${msg}`),
            ));
        } finally {
            // Pop unconditionally so a failed spawn does not leave the
            // stack in a bad state.
            compositionStack.pop();
            await emitStigmergyReturned(stigmergyTurn, capId, invokedOk, dispatchSource);
        }
    }

    private composeSubtaskMessage(
        skillName: string,
        body: string,
        args: Record<string, unknown>,
    ): string {
        const argsBlock = Object.keys(args).length > 0
            ? `\n\n## Inputs\n\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``
            : '';
        return [
            `You are running as a sub-skill. Follow the workflow below EXACTLY.`,
            `Skill name: ${skillName}`,
            ``,
            `${body}${argsBlock}`,
            ``,
            `Use attempt_completion when the workflow has finished. Your completion result is returned to the parent skill as the tool result.`,
        ].join('\n');
    }
}
