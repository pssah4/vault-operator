/**
 * BUG-021 regression: every user-facing tool must be reachable from at
 * least one built-in mode tool group. In the past tools shipped (e.g.
 * vault_health_check, ingest_document) but were never added to
 * TOOL_GROUP_MAP -- the agent then reported them as unavailable.
 *
 * Test is intentionally list-based instead of type-iterating: the
 * ToolName union lives in the type system, so we maintain an explicit
 * expected-tools list here. Adding a new user-facing tool is cheap;
 * forgetting to wire it into a group now fails the build instead of
 * being discovered months later.
 */

import { describe, it, expect } from 'vitest';
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
    // Edit
    'write_file', 'edit_file', 'append_to_file', 'create_folder', 'delete_file',
    'move_file', 'extract_zip', 'update_frontmatter', 'generate_canvas', 'create_excalidraw',
    'create_base', 'update_base', 'create_pptx', 'create_docx', 'create_xlsx',
    'plan_presentation', 'ingest_document', 'ingest_deep', 'ingest_triage',
    'restore_checkpoint',
    // Web
    'web_fetch', 'web_search',
    // Agent control
    'ask_followup_question', 'attempt_completion', 'update_todo_list',
    'new_task', 'consult_flagship', 'switch_agent', 'update_settings', 'configure_model',
    'read_agent_logs', 'manage_mcp_server',
    'evaluate_expression', 'manage_source',
    // MCP
    'use_mcp_tool', 'read_mcp_tool',
    // Vault (memory-related)
    'list_pinned_conversations',
    // Skill / PAS-1
    'execute_command', 'execute_recipe', 'call_plugin_api',
    'resolve_capability_gap', 'enable_plugin',
];

// Tools intentionally NOT in any group -- listed here so an ad-hoc
// reviewer can see the intent instead of grepping.
const INTENTIONALLY_NOT_REACHABLE: ToolName[] = [
    'create_drawio',   // accessed via plugin routing, not via mode groups
    'find_tool',       // meta-tool for deferred loading, not user-facing
];

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
});
