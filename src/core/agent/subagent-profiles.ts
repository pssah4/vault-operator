/**
 * Subagent profiles -- FEAT-24-04 / ADR-113.
 *
 * A profile is a lean alternative to the parent's mode + rules + skills
 * set for a `new_task`-spawned subagent. When the model calls
 * `new_task(profile='research', message='...')`, the subagent runs with
 * the profile's roleDefinition + a reduced tool allowlist, and the
 * Tier-4 justification (ADR-090) is skipped because the profile itself
 * is the explicit choice.
 *
 * Start small: one profile (`research`). Extending the registry is a
 * map addition; no new concept needed.
 */

import type { ToolName } from '../tools/types';
import type { ModelTier } from '../../types/settings';

export interface SubagentProfile {
    /** Short identifier used in `new_task({ profile })`. */
    name: string;
    /** Human-readable short description (shown in the new_task input schema). */
    description: string;
    /**
     * Tools the subagent may use. Subset of all registered tools. Profile-tools
     * replace the parent's mode tool set so the subagent's `tools` field stays
     * small (one of the goals of ADR-113).
     */
    allowedTools: ToolName[];
    /**
     * Lean role-definition that replaces `mode.roleDefinition` in the
     * subagent's system prompt. Keeps the profile prompt much shorter than
     * inheriting the parent's full mode definition.
     */
    roleDefinition: string;
    /**
     * EPIC-26 / ADR-120: pin the subagent to a tier on the active
     * provider instead of inheriting the parent's api handler. Used by
     * the research profile (fast tier, FEAT-24-04 cost story) and the
     * advisor profile (flagship tier, on-demand escalation).
     */
    tierOverride?: ModelTier;
    /**
     * EPIC-26 / ADR-120: hard cap on the subagent's visible output
     * tokens. Wins over the user's `advancedApi.subtaskTokenBudget`
     * setting so the advisor profile can guarantee a tight 3000-token
     * synthesis budget regardless of user config.
     */
    maxOutputTokens?: number;
}

const RESEARCH_PROFILE: SubagentProfile = {
    name: 'research',
    description: 'Read-only research subagent: searches and reads vault notes + web, returns a compact source-cited summary. No writes, no further subagents.',
    allowedTools: [
        'read_file',
        'read_document',
        'list_files',
        'search_files',
        'semantic_search',
        'search_history',
        'web_search',
        'web_fetch',
        'attempt_completion',
        'ask_followup_question',
    ],
    roleDefinition: [
        'You are a focused research subagent. Your only job is to gather',
        'information for your parent agent and deliver the concrete answer',
        'the parent asked for.',
        '',
        'Rules:',
        '- Do NOT write, edit, delete, or move any vault content.',
        '- Do NOT switch modes or spawn further subagents.',
        '- Keep your reasoning tight. Aim for 3 to 7 tool calls, not 20.',
        '- The attempt_completion call MUST contain the actual answer the',
        '  parent asked for, not a meta-acknowledgement. The parent NEVER',
        '  sees your intermediate tool calls, so the completion must stand',
        '  on its own.',
        '- If the parent asked for a list of N items with field A and B,',
        '  return that exact list in the completion -- all N items, with',
        '  both fields, citing the vault path inline.',
        '- "Compact" means concise wording, NOT abbreviated content. If the',
        '  parent asks for 5 items with 2-sentence summaries each, deliver',
        '  all 5 with their summaries.',
        '- Anti-pattern: do NOT write "Found 5 relevant notes" or "Research',
        '  complete, 5 items identified" as your completion. Write the 5',
        '  notes themselves with the requested fields.',
        '- If the question is ambiguous, call ask_followup_question once;',
        '  do not guess.',
    ].join('\n'),
    // EPIC-26: research stays on the fast tier so cost stays low; the
    // visible output budget keeps the user-configured subtaskTokenBudget.
    tierOverride: 'fast',
};

const ADVISOR_PROFILE: SubagentProfile = {
    name: 'advisor',
    description: 'Read-only advisor subagent on the flagship model. Used by consult_flagship for one-shot synthesis steps that need the strongest model. Hard 3000-token output cap.',
    allowedTools: [
        'read_file',
        'read_document',
        'search_files',
        'semantic_search',
        'web_fetch',
        'web_search',
        'attempt_completion',
    ],
    roleDefinition: [
        'You are an advisor subagent running on the flagship model. Your',
        'job is to think carefully about ONE problem the parent agent is',
        'stuck on and return a concrete, actionable answer.',
        '',
        'Rules:',
        '- Do NOT write, edit, delete, or move any vault content.',
        '- Do NOT spawn further subagents.',
        '- Use at most a handful of tool calls to confirm assumptions;',
        '  this is a synthesis pass, not a research pass.',
        '- Your attempt_completion MUST contain the actual decision /',
        '  approach / answer the parent asked for. The parent never sees',
        '  your intermediate work.',
        '- Be direct. State the recommended path first, then the briefest',
        '  reasoning that justifies it. Skip pleasantries.',
        '- Hard output budget: 3000 tokens. Stay well under it.',
    ].join('\n'),
    tierOverride: 'flagship',
    maxOutputTokens: 3000,
};

const PROFILES: Record<string, SubagentProfile> = {
    [RESEARCH_PROFILE.name]: RESEARCH_PROFILE,
    [ADVISOR_PROFILE.name]: ADVISOR_PROFILE,
};

export function getSubagentProfile(name: string): SubagentProfile | undefined {
    if (!name) return undefined;
    return PROFILES[name];
}

export function listSubagentProfileNames(): string[] {
    return Object.keys(PROFILES).sort();
}
