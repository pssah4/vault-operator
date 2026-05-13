/**
 * Skill Directory Section (ADR-116, FEAT-24-09)
 *
 * Renders the **stable** SKILLS directory: name + description (and inventory
 * lines for self-authored skills) of every installed skill. The directory
 * lives in the cached system-prompt prefix above the CACHE_BREAKPOINT_MARKER,
 * so it does not invalidate the KV cache between turns.
 *
 * Replaces the previous per-message ACTIVE-SKILLS injection (see ADR-116
 * for the rationale): the model decides itself which skill to load and
 * fetches the full body via the `read_skill` tool. The body then lives in
 * the message stream and falls under microcompaction (ADR-12 amendment /
 * FEAT-24-02) like any other tool result.
 */

export function getSkillDirectorySection(directory?: string): string {
    if (!directory?.trim()) return '';

    return [
        '',
        '====',
        '',
        'SKILLS',
        '',
        'Skills are step-by-step workflows for specific task types. The directory below',
        'lists every installed skill (name + what it is for, plus its sidecars when present).',
        'When the current task matches a skill\'s purpose, call read_skill({ name: "<name>" })',
        'to load its full instructions as a tool result, then follow that workflow step by',
        'step -- it OVERRIDES default tool selection and general guidelines. If a skill says',
        '"ASK the user", you MUST ask and STOP. Do NOT load a skill that does not match the',
        'task. If no skill applies, proceed with normal tools and capabilities.',
        '',
        '<available_skills>',
        directory.trim(),
        '</available_skills>',
    ].join('\n');
}
