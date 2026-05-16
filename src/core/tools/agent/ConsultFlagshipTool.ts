/**
 * ConsultFlagshipTool (EPIC-26 / FEAT-26-01 / ADR-120).
 *
 * The Advisor-Pattern escalation handle: the agent loop runs on the mid
 * tier by default; when it hits a genuinely hard synthesis step, it calls
 * `consult_flagship` and a one-shot advisor subagent on the flagship tier
 * delivers a concrete answer. The subagent is read-only and capped to
 * 3000 output tokens (enforced by the `advisor` profile in
 * src/core/agent/subagent-profiles.ts).
 *
 * Hard rules:
 *  - Per-task budget of 3 calls (`context.consumeAdvisorSlot`).
 *  - Schema required-fields (problem, relevant_context, failed_attempts,
 *    constraints) with maxLength caps to keep the spawn payload tight.
 *  - Tool registers only when a flagship slot is filled on the active
 *    provider (filtered in AgentTask.ts).
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface ConsultInput {
    problem: string;
    relevant_context: string;
    failed_attempts: string;
    constraints: string;
}

const FIELD_LIMITS: Record<keyof ConsultInput, number> = {
    problem: 1500,
    relevant_context: 3000,
    failed_attempts: 1500,
    constraints: 500,
};

const DEFAULT_ADVISOR_LIMIT = 3;

export class ConsultFlagshipTool extends BaseTool<'consult_flagship'> {
    readonly name = 'consult_flagship' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'consult_flagship',
            description:
                'Escalate a hard synthesis step to a flagship-tier advisor (one shot, read-only, 3000-token answer cap). '
                + `Per-task limit: ${DEFAULT_ADVISOR_LIMIT} calls. `
                + 'Use when the mid-tier loop is stuck on a problem that needs a stronger model (architecture decision, '
                + 'subtle bug, ambiguous spec). The advisor returns a direct answer / recommendation, NOT tool calls. '
                + 'You provide a self-contained problem statement, the relevant context, what you already tried, and '
                + 'any constraints. The advisor does NOT see this conversation, so include everything it needs.',
            input_schema: {
                type: 'object',
                properties: {
                    problem: {
                        type: 'string',
                        description: `One concrete question (max ${FIELD_LIMITS.problem} chars). State exactly what answer you need.`,
                    },
                    relevant_context: {
                        type: 'string',
                        description: `Background the advisor needs to answer (max ${FIELD_LIMITS.relevant_context} chars). Excerpts, not full files.`,
                    },
                    failed_attempts: {
                        type: 'string',
                        description: `What you already tried and why it did not work (max ${FIELD_LIMITS.failed_attempts} chars). Avoid the advisor repeating the same paths.`,
                    },
                    constraints: {
                        type: 'string',
                        description: `Hard constraints on the answer (max ${FIELD_LIMITS.constraints} chars). E.g. "no new dependencies", "must work in browser".`,
                    },
                },
                required: ['problem', 'relevant_context', 'failed_attempts', 'constraints'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;

        const validation = this.validateInput(input);
        if (!validation.ok) {
            callbacks.pushToolResult(this.formatError(new Error(validation.error)));
            return;
        }
        const { problem, relevant_context, failed_attempts, constraints } = validation.value;

        // Hard precondition: flagship model must be configured. The
        // tool is normally filtered out of the schema in this case (see
        // Task 8 / AgentTask), but check defensively in case the model
        // somehow tries to call it anyway.
        const advisor = this.plugin.getAdvisorModel?.();
        if (!advisor) {
            callbacks.pushToolResult(this.formatError(new Error(
                'consult_flagship: no flagship-tier model configured on the active provider. '
                + 'Configure a flagship model in Settings -> Providers, or proceed without escalation.'
            )));
            return;
        }

        // Per-task budget. Re-rejects rather than throwing so the loop
        // can recover gracefully.
        const slot = context.consumeAdvisorSlot?.() ?? { ok: true, used: 1, limit: DEFAULT_ADVISOR_LIMIT };
        if (!slot.ok) {
            callbacks.pushToolResult(this.formatError(new Error(
                `consult_flagship: advisor budget exhausted for this task (${slot.used}/${slot.limit} calls used). `
                + 'Solve the remaining steps with the current tier or stop and ask the user.'
            )));
            return;
        }

        if (!context.spawnSubtask) {
            callbacks.pushToolResult(this.formatError(new Error(
                'consult_flagship: subagent spawning is disabled at the current nesting depth. '
                + 'Answer the question without escalation.'
            )));
            return;
        }

        const advisorMessage = [
            '## Problem',
            problem,
            '',
            '## Relevant context',
            relevant_context,
            '',
            '## Failed attempts',
            failed_attempts,
            '',
            '## Constraints',
            constraints,
            '',
            '## Your task',
            'Deliver a direct, actionable answer. Be concrete: name files, name decisions, name steps.',
            'No filler, no restating the question. Hard output budget: 3000 tokens.',
        ].join('\n');

        callbacks.log(`Consulting flagship advisor (${slot.used}/${slot.limit}): ${problem.slice(0, 80)}...`);

        try {
            const result = await context.spawnSubtask('agent', advisorMessage, 'advisor');
            callbacks.pushToolResult(
                `[Flagship advisor responded -- call ${slot.used}/${slot.limit}]\n\n${result || '(empty advisor response)'}`
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('consult_flagship', error);
        }
    }

    private validateInput(input: Record<string, unknown>): { ok: true; value: ConsultInput } | { ok: false; error: string } {
        const keys: (keyof ConsultInput)[] = ['problem', 'relevant_context', 'failed_attempts', 'constraints'];
        const out: Partial<ConsultInput> = {};
        for (const k of keys) {
            const v = input[k];
            if (typeof v !== 'string' || v.trim().length === 0) {
                return { ok: false, error: `consult_flagship: required field "${k}" must be a non-empty string.` };
            }
            if (v.length > FIELD_LIMITS[k]) {
                return {
                    ok: false,
                    error: `consult_flagship: field "${k}" exceeds the ${FIELD_LIMITS[k]}-char limit (got ${v.length}). Trim and retry.`,
                };
            }
            out[k] = v;
        }
        return { ok: true, value: out as ConsultInput };
    }
}
