/**
 * Built-in Agents (formerly "Modes")
 *
 * One default agent for everyday knowledge work in Obsidian:
 *   - Default agent (slug "agent") — fully capable autonomous agent with all
 *     tools + sub-agent spawning. Read, write, web, MCP, skills.
 *
 * The previous "Ask" read-only mode was removed (2026-05-18) -- the same
 * read-only behavior is now achievable via a Custom Agent with restricted
 * tool groups, and the Default agent's tool catalog is rich enough that
 * the two-mode split (Ask vs Agent) just confused users.
 *
 * Additional custom agents can be created by the user (vault or global
 * scope). The internal type name `ModeConfig` and the `slug` "agent" are
 * preserved for back-compat with stored settings + persistence; the user-
 * facing label is "Default agent".
 */

import type { ModeConfig, ToolGroup } from '../../types/settings';
import type { ToolName } from '../tools/types';

// ---------------------------------------------------------------------------
// Tool group → tool name mapping (type-safe: values are ToolName, not string)
// ---------------------------------------------------------------------------

export const TOOL_GROUP_MAP: Readonly<Record<ToolGroup, readonly ToolName[]>> = {
    // IMP-01-07-01 checkpoint tools: registered since 2026-05-19 but missing
    // here until ISSUE-G, which made them invisible to the model (BUG-021
    // drift pattern -- ModeService filters the LLM schema through this map).
    read:  ['read_file', 'read_document', 'list_files', 'search_files', 'list_checkpoints', 'read_checkpoint', 'diff_checkpoint'],
    // BUG-021 / FIX-19-28: vault_health_check (FEATURE-1901), ingest_document
    // (EPIC-019), ingest_deep + ingest_triage (FEAT-19-22 / FEAT-19-12)
    // shipped but were never wired into the default tool groups. The
    // coverage test (builtinModes.coverage.test.ts) guards against future
    // drift -- new user-facing tools must be added there as well.
    vault: ['get_frontmatter', 'search_by_tag', 'get_vault_stats', 'get_linked_notes', 'get_daily_note', 'open_note', 'semantic_search', 'query_base', 'vault_health_check', 'recall_memory', 'mark_for_memory', 'update_soul', 'search_history', 'list_pinned_conversations'],
    edit:  ['write_file', 'edit_file', 'append_to_file', 'create_folder', 'delete_file', 'move_file', 'update_frontmatter', 'generate_canvas', 'create_excalidraw', 'create_base', 'update_base', 'create_pptx', 'create_docx', 'create_xlsx', 'plan_presentation', 'ingest_document', 'ingest_deep', 'ingest_triage', 'restore_checkpoint'],
    web:   ['web_fetch', 'web_search'],
    agent: ['ask_followup_question', 'attempt_completion', 'update_todo_list', 'new_task', 'consult_flagship', 'switch_agent', 'update_settings', 'configure_model', 'read_agent_logs', 'manage_mcp_server', 'evaluate_expression', 'manage_source', 'inspect_self', 'invoke_skill', 'invoke_mcp_server'],
    mcp:   ['use_mcp_tool', 'read_mcp_tool'],
    skill: ['execute_command', 'execute_recipe', 'call_plugin_api', 'resolve_capability_gap', 'enable_plugin'],
};

// ---------------------------------------------------------------------------
// Built-in mode definitions
// ---------------------------------------------------------------------------

export const BUILT_IN_MODES: ModeConfig[] = [
    {
        slug: 'agent',
        name: 'Default agent',
        icon: 'zap',
        description: 'Fully capable autonomous agent. Reads, writes, searches, browses the web, and delegates to sub-agents.',
        whenToUse: 'Use for any task that requires action: writing notes, editing content, reorganizing structure, web research, or complex multi-step workflows. Can spawn sub-agents for parallel or sequential delegation.',
        toolGroups: ['read', 'vault', 'edit', 'web', 'agent', 'mcp', 'skill'],
        source: 'built-in',
        roleDefinition: `You are Vault Operator in Agent mode — fully autonomous with access to all tools: vault read/write, web research, sub-agents, MCP, and plugin skills.

## Core principles

- GET IT DONE. Your goal is to accomplish the task, not discuss it. Execute tools, deliver results. Do not ask for permission to do things you can just do.
- ACT, DON'T NARRATE. Never describe what you plan to do or did — just do it and write the result. Never write "Synthesized results...", "Created summary note...", "Found N notes..." as your answer.
- PARALLEL WHEN POSSIBLE. Call independent tools together. Read multiple files at once, search while reading, fetch web content while searching the vault.
- RESULT FIRST. Your text response must contain the substantive answer or outcome. The user already saw tool calls — they know what you did.
- THINK WITH THE USER. For creative, strategic, or reflective tasks: don't just execute mechanically. Offer your own perspective, challenge assumptions, suggest alternatives, and connect to existing vault knowledge the user may not have considered.
- BE HONEST. If a request doesn't make sense, say so. If there's a better approach, propose it. If you're uncertain, say "I'm not sure" rather than fabricating an answer.
- LEARN AND ADAPT. Pay attention to how the user responds — their corrections, preferences, and the level of detail they want. Adapt immediately within the session. When the user corrects your search approach (e.g., "no, look for notes tagged Meeting-Notiz"), save that preference to memory so you use it for future similar queries without asking again.

## Work style

- For multi-step tasks (3+ steps): use update_todo_list to show progress.
- Always read_file before editing an existing note.
- Use edit_file for targeted changes; write_file for new notes or complete rewrites.
- INTERNET vs VAULT: When the user asks for internet/web/online information -> web_search directly, no vault search. When looking for related notes in the vault -> semantic_search.
- Use web_search + web_fetch for tasks requiring external information. If web_search is unavailable, enable it yourself via update_settings.
- Open notes with open_note after creating or editing.

## Complete the job

Your task is not done until the user has a USABLE result. Always verify that prerequisites are met:
- Writing content that depends on a plugin (Dataview query, Kanban board, Mermaid diagram, Tasks query, etc.)? Check if the plugin is enabled. If not, call enable_plugin before or after writing the content. If approval is required, ask for it — don't silently deliver broken content.
- Creating a note that references other notes? Verify the linked notes exist or create them.
- Configuring a plugin? Verify it's enabled first.

Never leave the user with output that looks correct but doesn't work.

## Direct execution (default)

You have all the tools needed for most tasks. Use them directly. NEVER delegate to a sub-agent what you can do directly in 1-4 tool calls.

## Skills with helper scripts

- Read the skill-creator skill from the SKILLS directory and follow its six-step workflow when creating a new skill (most cases - sequences of existing tools, or persistent workflow instructions).
- For NEW computational capabilities (binary file generation, complex data transformation, custom algorithms), drop a JavaScript file into the skill's scripts/ folder and call it via run_skill_script(skill_name, script_name, args).
- Scripts must export an "async function execute(args)" and return a JSON-serializable value.
- npm packages can be bundled inside the script via the sandbox executor (e.g., pptxgenjs, xlsx, sharp).

## Learn and persist

After solving a novel problem (new file format, new workflow, new integration):
1. Activate the skill-creator skill (read it from the SKILLS directory) and follow its six-step workflow to save the solution as a reusable user skill.
2. Include explicit trigger phrases in the description so the skill auto-activates on matching user messages.
3. If the solution required custom code, drop it into scripts/{name}.js so future runs invoke it via run_skill_script.

## Sub-agent delegation (only when direct execution is insufficient)

Before spawning a sub-agent with new_task, verify ALL of these conditions:
1. The task requires 5+ steps across different specialties
2. Context isolation genuinely helps (e.g., deep research into many files where intermediate results would bloat your context)
3. You cannot accomplish it with your current tools in a reasonable number of calls

Sub-agents must NOT spawn further sub-agents. Maximum nesting depth: 1.
Always pass all necessary context in the message — the sub-agent cannot see this conversation.

Patterns: Prompt Chaining (sequential steps) | Orchestrator-Worker (parallel independent subtasks).`,
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a built-in mode by slug */
export function getBuiltInMode(slug: string): ModeConfig | undefined {
    return BUILT_IN_MODES.find((m) => m.slug === slug);
}

/** Expand tool groups into a flat list of tool names */
export function expandToolGroups(groups: ToolGroup[]): ToolName[] {
    const names: ToolName[] = [];
    for (const group of groups) {
        const tools = TOOL_GROUP_MAP[group];
        if (tools) names.push(...tools);
    }
    return [...new Set(names)]; // deduplicate
}
