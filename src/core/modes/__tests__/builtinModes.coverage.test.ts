/**
 * BUG-021 regression: every user-facing tool must be reachable from at
 * least one built-in mode tool group. In the past tools shipped (e.g.
 * vault_health_check, ingest_document) but were never added to
 * TOOL_GROUP_MAP -- the agent then reported them as unavailable.
 *
 * Two layers of guard:
 *   1. A manually maintained MUST_BE_REACHABLE list mirrors the agent-
 *      visible ToolName union and pins each entry to a group.
 *   2. A discovery-style test parses `tools/types.ts` and verifies every
 *      ToolName from the union is either in TOOL_GROUP_MAP or in
 *      INTENTIONALLY_NOT_REACHABLE / INTERNAL_TOOLS. New tools added to
 *      the type without group-wiring fail the build immediately.
 *
 * The drift pattern repeated five times before this guard landed
 * (vault_health_check, ingest_*, read_mcp_tool, anti_echo_search,
 * memory-source tools, find_tool, read_skill, probe_plugin,
 * run_skill_script). The auto-discovery test closes it structurally.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TOOL_GROUP_MAP } from '../builtinModes';
import type { ToolName } from '../../tools/types';

// Every tool in this list MUST appear in at least one group. Keep in
// alphabetical order; add new entries when a new user-facing tool ships.
const MUST_BE_REACHABLE: ToolName[] = [
    // Read
    'read_file', 'read_document', 'list_files', 'search_files',
    'list_checkpoints', 'read_checkpoint', 'diff_checkpoint',
    // Vault structured
    'get_frontmatter', 'search_by_tag', 'get_vault_stats', 'get_linked_notes',
    'get_daily_note', 'open_note', 'semantic_search', 'query_base',
    'vault_health_check',
    // Vault memory-source (FEAT-03-25 / ADR-109)
    'mark_note_as_memory_source', 'unmark_note_as_memory_source', 'list_memory_source_notes',
    // Edit
    'write_file', 'edit_file', 'append_to_file', 'create_folder', 'delete_file',
    'move_file', 'extract_zip', 'update_frontmatter', 'generate_canvas', 'create_excalidraw',
    'create_base', 'update_base', 'create_pptx', 'create_docx', 'create_xlsx',
    'plan_presentation', 'ingest_document', 'ingest_deep', 'ingest_triage',
    'restore_checkpoint',
    // Web
    'web_fetch', 'web_search', 'anti_echo_search',
    // Agent control
    'ask_followup_question', 'attempt_completion', 'update_todo_list',
    'new_task', 'consult_flagship', 'switch_agent', 'update_settings', 'configure_model',
    'read_agent_logs', 'manage_mcp_server',
    'evaluate_expression', 'manage_source',
    // Meta-tools (FEATURE-1600 find_tool, FEAT-24-09 read_skill / ADR-116)
    'find_tool', 'read_skill',
    // MCP
    'use_mcp_tool', 'read_mcp_tool',
    // Vault (memory-related)
    'list_pinned_conversations',
    // Memory v2 (recall, atomic, soul, history)
    'recall_memory', 'mark_for_memory', 'update_soul', 'inspect_self', 'search_history',
    // Composability (FEAT-29-10)
    'invoke_skill', 'invoke_mcp_server',
    // Skill / PAS-1
    'execute_command', 'execute_recipe', 'call_plugin_api',
    'resolve_capability_gap', 'enable_plugin',
    // FEAT-29 skill ecosystem (probe_plugin, run_skill_script)
    'probe_plugin', 'run_skill_script',
];

// Tools intentionally NOT in any group -- listed here so an ad-hoc
// reviewer can see the intent instead of grepping.
const INTENTIONALLY_NOT_REACHABLE: ToolName[] = [
    'create_drawio',   // accessed via plugin routing, not via mode groups
];

// Engine-internal tools that ship in the ToolName union for type-checking
// (ApiHandler.createMessage tool definitions) but are never registered
// with the agent ToolRegistry. They must not appear in TOOL_GROUP_MAP.
const INTERNAL_TOOLS: ToolName[] = [
    '_memory_atomize',
    '_memory_single_call',
];

/**
 * Parses `src/core/tools/types.ts` and returns every string literal from
 * the `ToolName` union. Deliberately string-based so the test does not
 * depend on a runtime mirror of the type.
 */
function extractToolNamesFromTypesSource(): string[] {
    const typesPath = resolve(__dirname, '../../tools/types.ts');
    const src = readFileSync(typesPath, 'utf-8');
    const start = src.indexOf('export type ToolName =');
    if (start < 0) {
        throw new Error('ToolName declaration not found in types.ts');
    }
    const end = src.indexOf(';', start);
    if (end < 0) {
        throw new Error('ToolName declaration missing terminator');
    }
    const body = src.slice(start, end);
    const names: string[] = [];
    // Only match union-arm string literals: a pipe (optionally as the first
    // token of a line after `=`) followed by 'tool_name'. Skips strings
    // sitting inside JSDoc/inline comments because those never appear
    // right after a `|`.
    const re = /\|\s*'([a-z_][a-z_0-9]*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        names.push(m[1]);
    }
    return names;
}

function reachableTools(): Set<ToolName> {
    const out = new Set<ToolName>();
    for (const tools of Object.values(TOOL_GROUP_MAP)) {
        for (const t of tools) out.add(t);
    }
    return out;
}

describe('TOOL_GROUP_MAP coverage', () => {
    it('assigns vault_health_check to the vault group (BUG-021)', () => {
        expect(TOOL_GROUP_MAP.vault).toContain('vault_health_check');
    });

    it('assigns ingest_document to the edit group (BUG-021)', () => {
        expect(TOOL_GROUP_MAP.edit).toContain('ingest_document');
    });

    it('assigns ingest_deep + ingest_triage to the edit group (FIX-19-28)', () => {
        expect(TOOL_GROUP_MAP.edit).toContain('ingest_deep');
        expect(TOOL_GROUP_MAP.edit).toContain('ingest_triage');
    });

    it('assigns read_mcp_tool to the mcp group (FIX-24-06-03)', () => {
        expect(TOOL_GROUP_MAP.mcp).toContain('read_mcp_tool');
    });

    it('lists every must-reachable tool in at least one group', () => {
        const reachable = reachableTools();
        const missing = MUST_BE_REACHABLE.filter((t) => !reachable.has(t));
        expect(missing, `Tools declared user-facing but missing from TOOL_GROUP_MAP: ${missing.join(', ')}`).toEqual([]);
    });

    it('does not double-register: intentionally unreachable tools stay out', () => {
        const reachable = reachableTools();
        const leaked = INTENTIONALLY_NOT_REACHABLE.filter((t) => reachable.has(t));
        expect(leaked, `Tools marked intentionally unreachable leaked into TOOL_GROUP_MAP: ${leaked.join(', ')}`).toEqual([]);
    });

    it('keeps engine-internal tools out of TOOL_GROUP_MAP', () => {
        const reachable = reachableTools();
        const leaked = INTERNAL_TOOLS.filter((t) => reachable.has(t));
        expect(leaked, `Engine-internal tools must not appear in any group: ${leaked.join(', ')}`).toEqual([]);
    });

    it('auto-discovers every ToolName from types.ts and pins coverage', () => {
        const declared = extractToolNamesFromTypesSource();
        // Every declared tool name must be classified: in MUST_BE_REACHABLE,
        // INTENTIONALLY_NOT_REACHABLE, or INTERNAL_TOOLS. Anything else is
        // an orphan and signals the same drift that broke vault_health_check,
        // ingest_*, anti_echo_search, memory-source tools, find_tool,
        // read_skill, probe_plugin, and run_skill_script in earlier waves.
        const classified = new Set<string>([
            ...(MUST_BE_REACHABLE as string[]),
            ...(INTENTIONALLY_NOT_REACHABLE as string[]),
            ...(INTERNAL_TOOLS as string[]),
        ]);
        const orphan = declared.filter((n) => !classified.has(n));
        expect(
            orphan,
            `Tools declared in ToolName union but not classified (must be in MUST_BE_REACHABLE, INTENTIONALLY_NOT_REACHABLE, or INTERNAL_TOOLS): ${orphan.join(', ')}`,
        ).toEqual([]);
    });
});
