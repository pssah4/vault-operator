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
    // Vault: structured
    | 'create_canvas'
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
    // Web
    | 'web_fetch'
    | 'web_search'
    // Semantic
    | 'semantic_search'
    // Agent control
    | 'ask_followup_question'
    | 'attempt_completion'
    | 'switch_mode'
    | 'new_task'
    | 'update_todo_list'
    // MCP
    | 'use_mcp_tool'
    // Skill (PAS-1)
    | 'execute_command'
    | 'resolve_capability_gap'
    | 'enable_plugin'
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
    | 'manage_source';

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
     * Switch the active mode. Used by switch_mode tool.
     * The new mode takes effect from the next AgentTask iteration.
     */
    switchMode?: (slug: string) => void;

    /**
     * Spawn a child task and return its accumulated response text.
     * Used by new_task tool for multi-agent delegation.
     */
    spawnSubtask?: (mode: string, message: string) => Promise<string>;

    /**
     * Invalidate the cached system prompt and tool definitions.
     * Called when settings that affect tool availability change (e.g. webTools.enabled).
     */
    invalidateToolCache?: () => void;
}

/**
 * Validation result for tool operations
 */
export interface ValidationResult {
    allowed: boolean;
    reason?: string;
    requiresExplicitApproval?: boolean;
}
