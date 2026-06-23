/**
 * InlineSkillAction -- adapts a Skill as an InlineAction (FEAT-33-08).
 *
 * Wraps a SkillEntry into the InlineAction contract so the Skill
 * appears in the Floating-Menu / Command-Palette. Execution is
 * delegated to a SkillInvoker callback supplied by the plugin
 * entry-point (which knows how to call the existing Skill-Engine).
 */

import type { AgentTaskCallbacks } from '../../AgentTask';
import type { InlineAction } from '../InlineActionRegistry';
import type { InlineTriggerContext } from '../InlineTriggerContext';
import type { SkillEntry } from './InlineSkillFilter';

export type SkillInvoker = (
    skill: SkillEntry,
    ctx: InlineTriggerContext,
    callbacks: AgentTaskCallbacks,
) => Promise<void>;

export interface InlineSkillActionOptions {
    entry: SkillEntry;
    invoker: SkillInvoker;
}

export class InlineSkillAction implements InlineAction {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    private readonly entry: SkillEntry;
    private readonly invoker: SkillInvoker;

    constructor(options: InlineSkillActionOptions) {
        this.entry = options.entry;
        this.invoker = options.invoker;
        this.id = `skill:${options.entry.id}`;
        this.label = options.entry.label;
        this.description = options.entry.description;
    }

    isEligible(ctx: InlineTriggerContext): boolean {
        const cap = this.entry.capability;
        if (cap === undefined || cap.eligible !== true) return false;
        if (cap.max_selection_chars !== undefined && ctx.selectionText.length > cap.max_selection_chars) return false;
        return true;
    }

    async execute(ctx: InlineTriggerContext, callbacks: AgentTaskCallbacks): Promise<void> {
        // Defense-in-depth: re-check the capability gate before
        // invoking the skill engine. Floating-menu and Command-Palette
        // both run isEligible upfront, but a malicious caller (or a
        // skill manifest mutated between filter and execute) could
        // otherwise bypass the eligibility constraints. AUDIT-EPIC-33 M-05.
        if (this.isEligible(ctx) !== true) {
            callbacks.onError(new Error(
                `InlineSkillAction '${this.entry.id}' rejected -- capability check failed at execute-time`,
            ));
            return;
        }
        try {
            await this.invoker(this.entry, ctx, callbacks);
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            callbacks.onError(err);
        }
    }
}
