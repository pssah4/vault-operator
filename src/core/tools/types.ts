/**
 * Tool Types and Interfaces
 *
 * Defines the core types for the tool system, adapted from Kilo Code's architecture.
 */

/**
 * Tool names (will expand as we add more tools)
 */
export type ToolName =
    // Vault: read
    | 'read_file'
    | 'read_document'
    | 'list_files'
    | 'search_files'
    // Vault: write
    | 'write_file'
    | 'edit_file'
    | 'append_to_file'
    | 'create_folder'
    | 'delete_file'
    | 'move_file'
    // Vault: checkpoints (IMP-01-07-01)
    | 'list_checkpoints'
    | 'read_checkpoint'
    | 'diff_checkpoint'
    | 'restore_checkpoint'
    // Vault: structured
    | 'create_base'
    | 'update_base'
    | 'query_base'
    | 'get_frontmatter'
    | 'update_frontmatter'
    | 'get_linked_notes'
    | 'get_vault_stats'
    | 'vault_health_check'
    | 'search_by_tag'
    | 'get_daily_note'
    | 'open_note'
    | 'generate_canvas'
    | 'create_excalidraw'
    | 'create_drawio'
    // Vault: presentation planning
    | 'plan_presentation'
    // Vault: office document creation
    | 'create_pptx'
    | 'create_docx'
    | 'create_xlsx'
    // Vault: document ingest
    | 'ingest_document'
    // Vault: BA-25 Karpathy-Wiki-Pattern (FEAT-19-12, ADR-98)
    | 'ingest_triage'
    // Vault: BA-25 Deep-Ingest-Pipeline (FEAT-19-22/23/24/26/30 + 19-13 Caller)
    | 'ingest_deep'
    // Vault: BA-25 Anti-Echo Web-Search-Suche (FEAT-19-14)
    | 'anti_echo_search'
    // Vault: FEAT-03-25 / ADR-109 Vault-zu-Memory-Bruecke
    | 'mark_note_as_memory_source'
    | 'unmark_note_as_memory_source'
    | 'list_memory_source_notes'
    // IMP-24-06-02: pendant to list_memory_source_notes for pinned chats
    | 'list_pinned_conversations'
    // Web
    | 'web_fetch'
    | 'web_search'
    // Semantic
    | 'semantic_search'
    // Agent control
    | 'ask_followup_question'
    | 'attempt_completion'
    | 'switch_agent'
    | 'new_task'
    // EPIC-26 / FEAT-26-01 / ADR-120: on-demand flagship escalation.
    | 'consult_flagship'
    | 'find_tool'
    // FEAT-24-09 / ADR-116: load a SKILL.md body on demand.
    | 'read_skill'
    | 'update_todo_list'
    // MCP
    | 'use_mcp_tool'
    // FEAT-24-06 / ADR-118: read the full description + input-schema summary
    // of a single MCP tool on demand (companion to the truncated MCP listing
    // in the system prompt).
    | 'read_mcp_tool'
    // Skill (PAS-1)
    | 'execute_command'
    | 'resolve_capability_gap'
    | 'enable_plugin'
    // FEAT-29-03 / ADR-124: live probe of a plugin's commands and API methods
    | 'probe_plugin'
    // FEAT-29-06 / ADR-126: generic skill-script executor (replaces code_modules)
    | 'run_skill_script'
    // Plugin API + Recipe Shell (PAS-1.5)
    | 'call_plugin_api'
    | 'execute_recipe'
    // Settings & Model configuration (Onboarding)
    | 'update_settings'
    | 'configure_model'
    // Self-Development (Phase 1: Foundation)
    | 'read_agent_logs'
    | 'manage_mcp_server'
    // Self-Development (Phase 2+3: Skills with optional code modules)
    | 'manage_skill'
    // Self-Development (Phase 3: Expression evaluation)
    | 'evaluate_expression'
    // Self-Development (Phase 4: Core Self-Modification)
    | 'manage_source'
    // Memory v2 (Phase 3 / FEATURE-0317): cold-memory recall for the agent.
    | 'recall_memory'
    // Memory v2 (Phase 4 / FEATURE-0318): user-triggered manual extraction.
    | 'mark_for_memory'
    // Memory v2 (Phase 4.5 / FEATURE-0319b): agent-self layer.
    | 'update_soul'
    | 'inspect_self'
    // Memory v2 (Phase 6 / FEATURE-0320): history search.
    | 'search_history'
    // Memory v2 internal -- Engine-only tool schemas, never registered with
    // the agent ToolRegistry. Carried in ToolName so ApiHandler.createMessage
    // type-checks across the same ToolDefinition surface.
    | '_memory_atomize'
    | '_memory_single_call';

/**
 * Tool use request from LLM
 */
export interface ToolUse {
    type: 'tool_use';
    id: string;
    name: ToolName;
    input: Record<string, unknown>;
}

/**
 * Tool result response.
 * content is normally a string. Tools that return multimodal data (e.g. rendered
 * slide images) may return an array of ToolResultContentBlock instead.
 */
export interface ToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string | import('../../api/types').ToolResultContentBlock[];
    is_error?: boolean;
}

/**
 * Tool definition (schema) for LLM
 */
export interface ToolDefinition {
    name: ToolName;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * Tool callbacks for communicating results
 */
export interface ToolCallbacks {
    /**
     * Push the FINAL result to be sent back to the LLM (goes into conversation history).
     * Pass a ToolResultContentBlock[] for multimodal results (text + images).
     * Use pushProgress for intermediate status messages.
     */
    pushToolResult(content: string | import('../../api/types').ToolResultContentBlock[]): void;

    /**
     * Push an intermediate progress/status message to the UI.
     * Does NOT go into conversation history — keeps the LLM context lean.
     * Use this for phase banners, heartbeats, batch progress etc.
     */
    pushProgress?(content: string): void;

    /**
     * Handle an error during tool execution
     */
    handleError(toolName: string, error: unknown): void | Promise<void>;

    /**
     * Log a message (for debugging)
     */
    log(message: string): void;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
    /**
     * The API handler used by the current AgentTask.
     * Tools should use this instead of building their own handler from plugin.getActiveModel(),
     * because the AgentTask may be using a mode-specific model that differs from the global setting.
     */
    apiHandler?: import('../../api/types').ApiHandler;

    /**
     * Current task ID
     */
    taskId: string;

    /**
     * Current mode
     */
    mode: string;

    /**
     * Abort signal for the currently running agent task.
     * Long-running tools should observe this and stop promptly when aborted.
     */
    abortSignal?: AbortSignal;

    /**
     * Callbacks for results
     */
    callbacks: ToolCallbacks;

    /**
     * Ask the user a followup question and wait for their answer.
     * Used by ask_followup_question tool.
     */
    askQuestion?: (question: string, options?: string[], allowMultiple?: boolean) => Promise<string>;

    /**
     * Signal that the task is complete with a result summary.
     * Used by attempt_completion tool.
     */
    signalCompletion?: (result: string) => void;

    /**
     * Publish the current todo list to the UI.
     * Used by update_todo_list tool.
     */
    updateTodos?: (items: import('../tools/agent/UpdateTodoListTool').TodoItem[]) => void;

    /**
     * FIX-H (ADR-090 follow-up): Return the set of file paths the agent has
     * read in the current task (via read_file / read_document / FastPath stage 2).
     * UpdateTodoListTool uses this to detect done items that reference unread
     * files -- prevents the "I marked it done but never opened the file"
     * hallucination pattern.
     */
    getReadFiles?: () => Set<string>;

    /**
     * Switch the active agent (formerly "mode"). Used by switch_agent tool.
     * The new agent's roleDefinition + toolGroups take effect from the next
     * AgentTask iteration. The underlying slug `currentMode` is preserved
     * for back-compat with stored settings.
     */
    switchMode?: (slug: string) => void;

    /**
     * Spawn a child task and return its accumulated response text.
     * Used by new_task tool for multi-agent delegation.
     *
     * FEAT-24-04 / ADR-113: optional `profileName` selects a lean subagent
     * profile (see src/core/agent/subagent-profiles.ts). When set, the
     * subagent runs with the profile's roleDefinition + allowedTools
     * instead of inheriting the parent's mode/rules/skills set.
     */
    spawnSubtask?: (mode: string, message: string, profileName?: string) => Promise<string>;

    /**
     * EPIC-26 / FEAT-26-01 / ADR-120: try to acquire one of the per-task
     * advisor slots (default limit: 3). Returns `{ ok: true, used, limit }`
     * when the slot was granted; the tool then proceeds with the spawn.
     * Returns `{ ok: false, used, limit }` when the budget is exhausted;
     * the tool reports a tool_error and the loop continues without the
     * advisor result.
     */
    consumeAdvisorSlot?: () => { ok: boolean; used: number; limit: number };

    /**
     * Invalidate the cached system prompt and tool definitions.
     * Called when settings that affect tool availability change (e.g. webTools.enabled).
     */
    invalidateToolCache?: () => void;

    /**
     * FEATURE-1600: add a deferred tool to the active set for the rest of the
     * session. Called by the `find_tool` meta-tool after it matches a deferred
     * tool. The AgentTask injects the activated tool's schema into the next
     * rebuildPromptCache. No-op if the tool is already active or not deferred.
     */
    activateDeferredTool?: (toolName: string) => void;
}

/**
 * Validation result for tool operations
 */
export interface ValidationResult {
    allowed: boolean;
    reason?: string;
    requiresExplicitApproval?: boolean;
}
