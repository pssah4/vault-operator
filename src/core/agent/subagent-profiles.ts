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
        'information for your parent agent and return a compact, well-structured,',
        'source-cited summary.',
        '',
        'Rules:',
        '- Do NOT write, edit, delete, or move any vault content.',
        '- Do NOT switch modes or spawn further subagents.',
        '- Keep your reasoning tight. Aim for 3 to 7 tool calls, not 20.',
        '- When the question is answered, call attempt_completion with a',
        '  short summary that cites the sources you read. The parent only',
        '  sees this summary, not your intermediate tool calls.',
        '- If the question is ambiguous, call ask_followup_question once;',
        '  do not guess.',
    ].join('\n'),
};

const PROFILES: Record<string, SubagentProfile> = {
    [RESEARCH_PROFILE.name]: RESEARCH_PROFILE,
};

export function getSubagentProfile(name: string): SubagentProfile | undefined {
    if (!name) return undefined;
    return PROFILES[name];
}

export function listSubagentProfileNames(): string[] {
    return Object.keys(PROFILES).sort();
}
