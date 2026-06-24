/**
 * ToolExecutionPipeline - Central execution and governance layer
 *
 * ⭐ CRITICAL COMPONENT (ASR-02)
 *
 * ALL tool executions (internal and MCP) MUST flow through this pipeline.
 * Ensures:
 * - Ignore/protected path validation (IgnoreService)
 * - Auto-approval or user-approval for write operations
 * - Checkpoint creation before writes (Sprint 1.4)
 * - Persistent operation logging (OperationLogger)
 * - Error handling
 */

import type ObsidianAgentPlugin from '../../main';
import type { ToolRegistry } from '../tools/ToolRegistry';
import type {
    ToolUse,
    ToolResult,
    ToolCallbacks,
    ToolExecutionContext,
    ValidationResult,
} from '../tools/types';
import type { IgnoreService } from '../governance/IgnoreService';
import type { OperationLogger } from '../governance/OperationLogger';
import { ResultExternalizer } from './ResultExternalizer';
import { VaultDataFileAdapter } from '../storage/VaultDataFileAdapter';
import { getTmpRoot } from '../utils/agentFolder';
import { findAllowedMethod } from '../tools/agent/pluginApiAllowlist';
import { scanUnreadSources } from '../quality-gates';
import type { StigmergyTurn } from '../stigmergy/StigmergyAdapter';
import type { ModeService } from '../modes/ModeService';
import {
    emitStigmergyInvoked,
    emitStigmergyReturned,
    type DispatchSource,
} from '../stigmergy/stigmergyEmitGate';

/**
 * FEAT-24-03 (ADR-63 amendment): hard ceiling on the characters of any single
 * tool result that reaches the conversation history. The externalizer is the
 * primary mechanism (large results -> tmp file + reference); this cap is the
 * floor for results the externalizer skips (read_file/read_document,
 * search_history, recall_memory, MCP tools) or where externalization failed.
 * Generous enough that normal results pass untouched (read_file is already
 * capped at 50000 chars by ReadFileTool).
 */
export const HARD_TOOL_OUTPUT_CAP_CHARS = 60_000;

/**
 * AUDIT-034 L-17 cross-module gate. Mirrors `TRUSTED_SKILL_SOURCES` in
 * `src/core/tools/agent/InvokeSkillTool.ts`. Duplicated here (instead of
 * imported) because InvokeSkillTool pulls heavy subtask-spawning + mode
 * registry deps that the Pipeline does not need; we keep the trust set
 * local and pin both sites with a comment so a future change has to update
 * both places. Sources NOT in this set are treated as imported content and
 * the autoApproval.skills flag is ignored for them -- the per-skill prompt
 * in InvokeSkillTool (sessionApprovedImportedSkills + askImportedSkillApproval)
 * remains the user-facing approval surface.
 *
 * Keep this set tight. Adding `agent`/`learned`/etc here would silently
 * widen the trust boundary for every `invoke_skill` auto-approval path.
 */
const PIPELINE_TRUSTED_SKILL_SOURCES: ReadonlySet<string> = new Set([
    'builtin',
    'bundled',
]);

/**
 * Cap an oversized tool-result string at {@link HARD_TOOL_OUTPUT_CAP_CHARS},
 * cutting on a line boundary when one is reasonably close, and append a notice
 * telling the agent how to fetch the rest. Returns the input unchanged when it
 * is within budget, is an error result, or is not a plain string (multimodal).
 */
export function capOversizedToolOutput(
    content: string | import('../../api/types').ToolResultContentBlock[],
    hadError: boolean,
    capChars: number = HARD_TOOL_OUTPUT_CAP_CHARS,
): { content: string | import('../../api/types').ToolResultContentBlock[]; capped: boolean; originalLength: number } {
    if (hadError || typeof content !== 'string' || content.length <= capChars) {
        return { content, capped: false, originalLength: typeof content === 'string' ? content.length : 0 };
    }
    const orig = content.length;
    const head = content.slice(0, capChars);
    const nl = head.lastIndexOf('\n');
    const kept = nl > capChars / 2 ? head.slice(0, nl) : head;
    return {
        content: kept +
            `\n\n[Output truncated: ${kept.length} of ${orig} chars shown. ` +
            `Narrow the request (a more specific query, a page/line range, fewer results) to see the rest — do not assume the omitted part is empty.]`,
        capped: true,
        originalLength: orig,
    };
}

/**
 * Approval group classification — determines how a tool call gets approved.
 *
 * NOT the same as the mode-level ToolGroup in settings.ts (which controls
 * tool availability per mode). This type controls the approval/governance path.
 */
type ApprovalGroup = 'read' | 'note-edit' | 'vault-change' | 'web' | 'agent' | 'subtask' | 'mcp' | 'skill' | 'plugin-api' | 'recipe' | 'sandbox' | 'self-modify';

const TOOL_GROUPS: Record<string, ApprovalGroup> = {
    // Read-only vault tools
    read_file: 'read',
    list_files: 'read',
    search_files: 'read',
    get_frontmatter: 'read',
    get_linked_notes: 'read',
    get_vault_stats: 'read',
    search_by_tag: 'read',
    get_daily_note: 'read',
    query_base: 'read',
    semantic_search: 'read',
    render_presentation: 'read',
    // Note content edits (write_file, edit_file, append_to_file, update_frontmatter)
    write_file: 'note-edit',
    edit_file: 'note-edit',
    append_to_file: 'note-edit',
    update_frontmatter: 'note-edit',
    // Vault structural changes (create_folder, delete_file, move_file)
    create_folder: 'vault-change',
    delete_file: 'vault-change',
    move_file: 'vault-change',
    // BA-25 Karpathy-Wiki-Pattern: Triage schreibt nur ins Triage-Log,
    // kein Vault-Side-Effect ausser Decision-Persistierung -> als 'note-edit' kategorisiert
    ingest_triage: 'note-edit',
    // ingest_deep schreibt mehrere neue Notes in den Vault -> note-edit
    ingest_deep: 'note-edit',
    // anti_echo_search nutzt nur Web-Search-API (read-only)
    anti_echo_search: 'web',
    // FEAT-03-25 / ADR-109 Vault-zu-Memory-Bruecke
    mark_note_as_memory_source: 'note-edit',
    unmark_note_as_memory_source: 'note-edit',
    list_memory_source_notes: 'read',
    // IMP-24-06-02: read-only listing of conversations pinned to memory
    list_pinned_conversations: 'read',
    generate_canvas: 'vault-change',
    create_base: 'vault-change',
    update_base: 'vault-change',
    // FIX-29-99-05: pre-fix, the four Office-creation tools and several
    // meta-tools landed on the `note-edit` default. Office creates binary
    // files (pptx/docx/xlsx/drawio/excalidraw) -- semantically vault-change.
    // The agent/read meta-tools belong in the agent/read groups so
    // auto-approval respects their actual side-effect class.
    create_pptx: 'vault-change',
    create_docx: 'vault-change',
    create_xlsx: 'vault-change',
    create_excalidraw: 'vault-change',
    create_drawio: 'vault-change',
    plan_presentation: 'agent',
    extract_zip: 'vault-change',
    ingest_document: 'note-edit',
    // Checkpoint-restore touches every tracked file at once -- treated as
    // a structural change rather than a single note edit.
    restore_checkpoint: 'vault-change',
    // vault_health_check mutating actions are gated by a multi-file
    // snapshot inside the tool (FIX-19-99-04); classification stays at
    // vault-change so auto-approval picks up the right group.
    vault_health_check: 'vault-change',
    read_document: 'read',
    list_checkpoints: 'read',
    read_checkpoint: 'read',
    diff_checkpoint: 'read',
    // Meta-tools: discovery + skill-body fetch are read-only relative to
    // the vault. invoke_skill/invoke_mcp_server route to the same gate
    // their targets use -- treated as skill for now.
    find_tool: 'agent',
    read_skill: 'read',
    read_mcp_tool: 'read',
    invoke_skill: 'skill',
    invoke_mcp_server: 'skill',
    probe_plugin: 'skill',
    run_skill_script: 'skill',
    // EPIC-26 flagship escalation: still an LLM call but no vault edit.
    consult_flagship: 'agent',
    // Memory-v2 surfaces. recall is read-only; mark/update mutate the
    // memory store (not the vault) -- 'agent' keeps them auto-approvable
    // because the user opted into the memory system already.
    recall_memory: 'read',
    mark_for_memory: 'agent',
    update_soul: 'self-modify',
    inspect_self: 'read',
    search_history: 'read',
    // Web

    web_fetch: 'web',
    web_search: 'web',
    // Agent control (always auto-approved)
    ask_followup_question: 'agent',
    attempt_completion: 'agent',
    update_todo_list: 'agent',
    open_note: 'agent',
    // Agent switching (always auto-approved, agent-internal)
    switch_agent: 'agent',
    // Subtask spawning (respects autoApproval.subtasks)
    new_task: 'subtask',
    // MCP
    use_mcp_tool: 'mcp',
    // Plugin Skills (PAS-1)
    execute_command: 'skill',
    resolve_capability_gap: 'skill',
    enable_plugin: 'skill',
    // Plugin API + Recipe Shell (PAS-1.5)
    call_plugin_api: 'plugin-api',
    execute_recipe: 'recipe',
    // Settings & Model configuration (Onboarding)
    update_settings: 'agent',
    configure_model: 'agent',
    // Self-Development (Phase 1)
    read_agent_logs: 'agent',
    manage_mcp_server: 'agent',
    // Self-Development (Phase 2+3) — sandbox: always requires approval by default
    evaluate_expression: 'sandbox',
    // M-7: Self-modification tools always require human approval.
    // FEAT-29-05: manage_skill removed; skill authoring is now a builtin
    // skill that uses write_file/edit_file via the regular approval gate.
    manage_source: 'self-modify',
};

/** Result of an approval check — may include user-edited content */
export interface ApprovalResult {
    decision: 'auto' | 'approved' | 'rejected';
    /** User-edited final content (only for note-edit approvals via DiffReviewModal) */
    finalContent?: string;
}

/** Extra context injected by AgentTask for agent-control tools */
export interface ContextExtensions {
    /** Abort signal for the currently running task */
    abortSignal?: AbortSignal;
    askQuestion?: (question: string, options?: string[], allowMultiple?: boolean) => Promise<string>;
    signalCompletion?: (result: string) => void;
    /**
     * Request user approval for a tool call.
     * Returns an ApprovalResult with decision and optional edited content.
     */
    onApprovalRequired?: (toolName: string, input: Record<string, unknown>) => Promise<ApprovalResult>;
    /** Publish the current todo list to the UI */
    updateTodos?: (items: import('../tools/agent/UpdateTodoListTool').TodoItem[]) => void;
    /** Switch the active mode (called by switch_mode tool) */
    switchMode?: (slug: string) => void;
    /** Spawn a child task (called by new_task / invoke_skill tools) */
    spawnSubtask?: (
        mode: string,
        message: string,
        profileName?: string,
        overrides?: import('../tools/types').SubtaskSpawnOverrides,
    ) => Promise<string>;
    /**
     * FEAT-29-10 Composability: shared stack-tracker for invoke_skill /
     * invoke_mcp_server. Owned by the top-level AgentTask, passed by
     * reference into every spawned subtask so cycle-detection and
     * depth-limit work across the whole composition chain.
     */
    compositionStack?: import('../skills/CompositionStackService').CompositionStackService;
    /**
     * EPIC-26 / FEAT-26-01 / ADR-120: try to acquire one of the per-task
     * advisor slots. Used by ConsultFlagshipTool to enforce the 3-call
     * budget before spawning the flagship subagent.
     */
    consumeAdvisorSlot?: () => { ok: boolean; used: number; limit: number };
    /** Notify UI about a new checkpoint after a write operation */
    onCheckpoint?: (checkpoint: import('../checkpoints/GitCheckpointService').CheckpointInfo) => void;
    /** Invalidate cached tool definitions (e.g. after webTools.enabled changes) */
    invalidateToolCache?: () => void;
    /** FEATURE-1600: activate a deferred tool for the rest of the session. */
    activateDeferredTool?: (toolName: string) => void;
    /** Active conversation ID for chat-linking frontmatter stamping (ADR-022) */
    conversationId?: string;
    /**
     * FIX-H (ADR-090 follow-up): set of file paths the current task has read.
     * The pipeline mutates this on each successful read_file/read_document call;
     * UpdateTodoListTool reads it to verify done items reference actually-read files.
     */
    readFiles?: Set<string>;
}

export class ToolExecutionPipeline {
    private plugin: ObsidianAgentPlugin;
    private toolRegistry: ToolRegistry;

    /**
     * FEAT-24-07 / ADR-115: read-only accessor for the parent plugin.
     * Used by FastPathExecutor.getInternalApi to look up the configured
     * helper model without exposing the private field directly.
     */
    getPlugin(): ObsidianAgentPlugin {
        return this.plugin;
    }
    private taskId: string;
    private mode: string;
    private apiHandler?: import('../../api/types').ApiHandler;

    /** Per-task result cache for read-only tools. Key = tool:sortedJSON(input). */
    private resultCache = new Map<string, string>();

    /** ADR-063: Context Externalization — large results written to temp files. */
    private resultExternalizer: ResultExternalizer | null = null;

    /**
     * Active Stigmergy turn for this task (set once after `loop.beginTurn`).
     * The pipeline emits `capability_invoked` / `capability_returned` around
     * each single-tool dispatch so the daemon can learn real tool->tool
     * trails (not just START->tool stars). Undefined or `enabled=false`
     * means observe-only mode is off and emits are skipped on the fast path.
     */
    private stigmergyTurn?: StigmergyTurn;

    /**
     * AUDIT-034 M-9: ModeService used to enforce mode.toolGroups at the
     * execution layer (not just in the schema). When set, executeTool
     * rejects model-driven and MCP-driven dispatches of tools the active
     * mode does not allow. FastPath / planner dispatches bypass the gate
     * because recipes are user-authored.
     *
     * Optional: when undefined (legacy callers, MCP boundary that wires
     * its own check), the pipeline falls back to the registry-only check.
     */
    private modeService?: ModeService;

    /**
     * AUDIT-034 H-3: when this pipeline serves a SUBTASK with a
     * profile-restricted tool surface, the parent passes the same
     * allowlist here. The runtime gate then rejects model dispatches of
     * any tool outside the allowlist, regardless of whether the registry
     * or active mode happens to include it. undefined / [] keeps the
     * legacy behaviour (no extra restriction).
     */
    private subagentAllowedTools?: Set<string>;


    /** Tools eligible for result caching (read-only, deterministic within a task). */
    private static readonly CACHEABLE = new Set([
        'read_file', 'list_files', 'search_files', 'get_frontmatter',
        'get_linked_notes', 'search_by_tag', 'get_vault_stats',
        'semantic_search', 'query_base',
    ]);


    constructor(
        plugin: ObsidianAgentPlugin,
        toolRegistry: ToolRegistry,
        taskId: string,
        mode: string,
        apiHandler?: import('../../api/types').ApiHandler,
    ) {
        this.plugin = plugin;
        this.toolRegistry = toolRegistry;
        this.taskId = taskId;
        this.mode = mode;
        this.apiHandler = apiHandler;

        // ADR-063: Initialize result externalizer for large tool results.
        // BUG-014 / FEATURE-1803: Use the vault adapter (not globalFs) so that
        // externalised files land inside the vault and read_file() can resolve
        // the same relative path the agent receives in references.
        // FEATURE-0507: tmp root honors the configurable agentFolderPath setting.
        const vaultFs = new VaultDataFileAdapter(plugin.app.vault.adapter);
        this.resultExternalizer = new ResultExternalizer(vaultFs, taskId, getTmpRoot(plugin));
    }

    /** ADR-063: Get the externalizer (for Fast Path to disable during batch). */
    getExternalizer(): ResultExternalizer | null {
        return this.resultExternalizer;
    }

    /**
     * Bind the Stigmergy turn used to instrument the single-tool dispatch.
     * Called by AgentTask right after `loop.beginTurn(...)` returns. The
     * turn carries its own enabled-gate, so passing a no-op turn (daemon
     * down / SDK missing / Studio toggle off) is safe.
     */
    setStigmergyTurn(turn: StigmergyTurn): void {
        this.stigmergyTurn = turn;
    }

    /**
     * AUDIT-034 M-9: bind the ModeService so executeTool can enforce the
     * active mode's toolGroups at dispatch time. Called by AgentTask after
     * pipeline construction so the schema filter and the runtime check use
     * the same source of truth. No-op when modeService is undefined.
     */
    setModeService(modeService: ModeService): void {
        this.modeService = modeService;
    }

    /**
     * AUDIT-034 H-3: bind the subagent's tool allowlist so the pipeline
     * can reject hallucinated calls to tools outside the profile. The
     * parent task calls this for every subtask pipeline it constructs.
     * Pass undefined for the top-level pipeline (no extra restriction).
     */
    setSubagentAllowedTools(allowed: readonly string[] | undefined): void {
        if (allowed === undefined || allowed.length === 0) {
            this.subagentAllowedTools = undefined;
            return;
        }
        this.subagentAllowedTools = new Set(allowed);
    }

    /** ADR-063: Clean up temp files after task completion. */
    async cleanupExternalized(): Promise<void> {
        await this.resultExternalizer?.cleanup();
    }

    /** Stable cache key: tool name + sorted JSON of input parameters. */
    private cacheKey(name: string, input: Record<string, unknown>): string {
        const sortedKeys = Object.keys(input ?? {}).sort();
        return `${name}:${JSON.stringify(input, sortedKeys)}`;
    }

    /**
     * CENTRAL EXECUTION METHOD — all tools MUST flow through here.
     *
     * `opts.source` (FEAT-32-01 PR 1.2 / ADR-131) tags the dispatch origin so
     * the Pipeline can keep the Stigmergy substrate free of FastPath /
     * planner mechanics. Default `'model'` preserves existing behavior; the
     * FastPath executor passes `'fastpath'` so the substrate stays blind to
     * Recipe-driven batches (by design -- the agent did not pick the tool).
     */
    async executeTool(
        toolCall: ToolUse,
        callbacks: ToolCallbacks,
        extensions?: ContextExtensions,
        opts?: { source?: DispatchSource },
    ): Promise<ToolResult> {
        const startTime = Date.now();

        try {
            // 1. Validate tool exists
            const tool = this.toolRegistry.getTool(toolCall.name);
            if (!tool) {
                const msg = `Unknown tool: ${toolCall.name}`;
                return this.errorResult(toolCall.id, msg);
            }

            // 1a. AUDIT-034 H-3: enforce subagent allowlist BEFORE the mode
            // gate. A subskill's allowlist always wins over the broader mode
            // surface -- if the parent restricted the subskill to read-only,
            // a hallucinated write_file call must be rejected even when the
            // active mode normally allows it. Same dispatch-source bypass
            // logic as the mode gate.
            const dispatchSourceForGate: DispatchSource = opts?.source ?? 'model';
            const enforceModeGate = dispatchSourceForGate !== 'fastpath' && dispatchSourceForGate !== 'planner';
            if (enforceModeGate && this.subagentAllowedTools !== undefined) {
                if (this.subagentAllowedTools.has(toolCall.name) === false) {
                    const msg = `Tool "${toolCall.name}" is not in this subtask's allowlist.`;
                    console.warn(`[Pipeline] Subagent-gate denied: ${toolCall.name} (source=${dispatchSourceForGate})`);
                    await this.logOperation(toolCall, false, Date.now() - startTime, msg, undefined);
                    return this.errorResult(toolCall.id, msg);
                }
            }
            // 1b. AUDIT-034 M-9: enforce active-mode toolGroups at the
            // execution layer. Schema-only filtering (ModeService.getToolDefinitions)
            // does not stop a hallucinated or replayed tool name, and FastPath
            // / MCP / subtask dispatch paths bypass the schema entirely. The
            // runtime gate makes Custom Agents an actual security boundary.
            // Bypass for 'fastpath' and 'planner' sources because those are
            // user-authored recipes / internal classifiers, not model picks.
            // 'model' (and undefined for legacy callers) and any other source
            // are enforced.
            if (enforceModeGate && this.modeService) {
                const activeMode = this.modeService.getMode(this.mode) ?? this.modeService.getActiveMode();
                if (!this.modeService.modeHasTool(activeMode, toolCall.name)) {
                    const msg = `Tool "${toolCall.name}" is not available in mode "${activeMode.slug}". The active agent does not include this tool in its toolGroups.`;
                    console.warn(`[Pipeline] Mode-gate denied: ${toolCall.name} not in ${activeMode.slug} (source=${dispatchSourceForGate})`);
                    await this.logOperation(toolCall, false, Date.now() - startTime, msg, undefined);
                    return this.errorResult(toolCall.id, msg);
                }
            }

            // 2. Governance: ignore / protected path check
            const validation = this.validatePaths(toolCall, tool.isWriteOperation);
            if (!validation.allowed) {
                return this.errorResult(toolCall.id, validation.reason ?? 'Operation denied');
            }

            // 2b. Input schema validation (AUDIT-006 H-5)
            const definition = tool.getDefinition();
            if (definition.input_schema?.properties && toolCall.input) {
                const { validateToolInput } = await import('./inputSchemaValidator');
                const schemaErrors = validateToolInput(toolCall.input, definition.input_schema);
                if (schemaErrors.length > 0) {
                    const msg = schemaErrors.map(e => e.message).join('; ');
                    return this.errorResult(toolCall.id, `Input validation failed: ${msg}`);
                }
            }

            // 2c. Result cache: return cached content for identical read-only calls
            if (ToolExecutionPipeline.CACHEABLE.has(toolCall.name)) {
                const cKey = this.cacheKey(toolCall.name, toolCall.input);
                const cached = this.resultCache.get(cKey);
                if (cached !== undefined) {
                    callbacks.log(`[Cache HIT] ${toolCall.name}`);
                    await this.logOperation(toolCall, true, 0, undefined, '[cached]');
                    return { type: 'tool_result', tool_use_id: toolCall.id, content: cached, is_error: false };
                }
            }

            // 3. Auto-approve or request approval for write/mcp/mode/subtask operations
            // Web tools are always auto-approved when webTools.enabled is true (the only way they appear).
            const toolGroup = TOOL_GROUPS[toolCall.name];
            if (tool.isWriteOperation || toolGroup === 'mcp' || toolGroup === 'subtask' || toolGroup === 'sandbox') {
                const approval = await this.checkApproval(toolCall, extensions);
                if (approval.decision === 'rejected') {
                    return this.errorResult(toolCall.id, 'Operation denied by user');
                }
                // FEAT-29-07: when the user approves a dynamically-discovered
                // plugin-API call, count the approval. Once the per-method
                // threshold is reached AND the method name matches the read
                // heuristic, the method is auto-promoted into
                // safeMethodOverrides so future calls skip the prompt.
                // Only fires for genuine USER approvals -- auto-approved
                // calls (decision === 'auto') don't count, otherwise the
                // promotion would be trivial.
                if (
                    approval.decision === 'approved'
                    && toolCall.name === 'call_plugin_api'
                ) {
                    void this.maybeAutoPromotePluginApi(toolCall.input);
                }
            }

            // 3b. Cache invalidation: write tools invalidate cached reads for affected paths
            if (tool.isWriteOperation) {
                const affectedPath = toolCall.input?.path as string | undefined;
                if (affectedPath) {
                    const pathJson = JSON.stringify(affectedPath);
                    for (const [key] of this.resultCache) {
                        if (key.includes(pathJson)) this.resultCache.delete(key);
                    }
                }
            }

            // 4. Checkpoint before each write — snapshot the file BEFORE it is modified.
            //    Every write gets its own checkpoint for granular restore (Kilo Code pattern).
            if (tool.isWriteOperation && (this.plugin.settings.enableCheckpoints ?? true)) {
                const path = toolCall.input?.path as string | undefined;
                if (path) {
                    try {
                        const cp = await this.plugin.checkpointService?.snapshot(
                            this.taskId, [path], toolCall.name
                        );
                        if (cp && cp.commitOid !== 'empty' && extensions?.onCheckpoint) {
                            extensions.onCheckpoint(cp);
                        }
                    } catch (e) {
                        console.warn('[Pipeline] Checkpoint failed (non-fatal):', e);
                    }
                }
            }

            // 5. Execute the tool
            const collectedContent: string[] = [];
            let multimodalContent: import('../../api/types').ToolResultContentBlock[] | null = null;
            let executionHadError = false;

            const wrappedCallbacks: ToolCallbacks = {
                pushToolResult: (content: string | import('../../api/types').ToolResultContentBlock[]) => {
                    if (typeof content === 'string') {
                        collectedContent.push(content);
                        if (content.startsWith('<error>')) executionHadError = true;
                    } else {
                        // Multimodal content: store the array, extract text for logging
                        multimodalContent = content;
                        for (const block of content) {
                            if (block.type === 'text') {
                                collectedContent.push(block.text);
                                if (block.text.startsWith('<error>')) executionHadError = true;
                            }
                        }
                    }
                    callbacks.pushToolResult(content);
                },
                // Progress messages go to the UI only — NOT accumulated in conversation history.
                pushProgress: (content: string) => {
                    callbacks.pushToolResult(content);
                },
                handleError: (tool: string, error: unknown) => callbacks.handleError(tool, error),
                log: (msg: string) => callbacks.log(msg),
            };

            const context: ToolExecutionContext = {
                taskId: this.taskId,
                mode: this.mode,
                apiHandler: this.apiHandler,
                abortSignal: extensions?.abortSignal,
                callbacks: wrappedCallbacks,
                askQuestion: extensions?.askQuestion,
                signalCompletion: extensions?.signalCompletion,
                updateTodos: extensions?.updateTodos,
                switchMode: extensions?.switchMode,
                spawnSubtask: extensions?.spawnSubtask,
                compositionStack: extensions?.compositionStack,
                consumeAdvisorSlot: extensions?.consumeAdvisorSlot,
                invalidateToolCache: extensions?.invalidateToolCache,
                activateDeferredTool: extensions?.activateDeferredTool,
                getReadFiles: extensions?.readFiles ? () => extensions.readFiles! : undefined,
                // Stigmergy turn: dispatcher tools (use_mcp_tool, read_skill,
                // invoke_skill) emit additional namespaced events for the
                // inner capability (mcp:<server>:<tool>, skill:<name>) so
                // the substrate sees real tool->skill / tool->mcp edges,
                // not just dispatcher stars. The turn is a no-op when
                // Stigmergy is off / the daemon is down, so passing it
                // through unconditionally is safe.
                stigmergyTurn: this.stigmergyTurn,
                // FEAT-32-01 PR 1.2 / ADR-131: propagate the dispatch source
                // so dispatcher tools can suppress their inner emits when the
                // outer call came from FastPath / planner. Default `'model'`.
                dispatchSource: opts?.source ?? 'model',
            };

            // Stigmergy: emit capability_invoked BEFORE the dispatch and
            // capability_returned AFTER, so the daemon can build tool->tool
            // edges instead of only START->tool stars. The id MUST match what
            // we registered with registerCapability (toolCall.name == tool
            // definition name == capability id), otherwise phantom
            // capabilities would appear in the substrate.
            // The turn handle itself is non-fatal: emit failures are logged
            // and swallowed so they cannot mask the tool's own error.
            // `success=false` covers BOTH a throw AND the codebase's
            // pushToolResult('<error>...') convention (executionHadError),
            // since both are negative evidence for the substrate.
            // FEAT-32-01 PR 1.2 / ADR-131: route every emit through the gate
            // helper so the Pipeline cannot drift from the dispatchers. The
            // helper is a no-op when the source is `'fastpath'` / `'planner'`
            // or when the turn is missing / disabled.
            const stigmergyTurn = this.stigmergyTurn;
            const dispatchSource = context.dispatchSource;
            await emitStigmergyInvoked(stigmergyTurn, toolCall.name, dispatchSource);
            try {
                await tool.execute(toolCall.input, context);
            } catch (e) {
                await emitStigmergyReturned(stigmergyTurn, toolCall.name, false, dispatchSource);
                throw e;
            }
            await emitStigmergyReturned(stigmergyTurn, toolCall.name, !executionHadError, dispatchSource);

            // FIX-H: track successful file reads for todo-verification (ADR-090 follow-up)
            // Must happen BEFORE the hallucination scan below so this same call's
            // read counts toward the readFiles set if the user does read+write
            // in one batch (rare but possible).
            if (!executionHadError && extensions?.readFiles
                && (toolCall.name === 'read_file' || toolCall.name === 'read_document')) {
                const path = toolCall.input?.path;
                if (typeof path === 'string' && path.length > 0) {
                    extensions.readFiles.add(path);
                }
            }

            // FIX-I: hallucination brake on write tools. If the agent writes a
            // Quellen:/Sources: frontmatter block with [[wikilinks]] to notes
            // it has not read in this task, push a warning into collectedContent
            // BEFORE textContent is finalised so the agent sees it. (ADR-090)
            // Wrapped in try/catch so a scanner bug NEVER blocks tool execution.
            if (!executionHadError && extensions?.readFiles
                && (toolCall.name === 'write_file' || toolCall.name === 'append_to_file' || toolCall.name === 'update_frontmatter')) {
                try {
                    const unread = scanUnreadSources(toolCall.input, extensions.readFiles);
                    if (unread.length > 0) {
                        const warn = `\n[HALLUCINATION BRAKE] You wrote source references to notes you have not read in this task: ${unread.slice(0, 5).map((u) => `"${u}"`).join(', ')}${unread.length > 5 ? `, ... +${unread.length - 5} more` : ''}. Either read those notes now (read_file) and rewrite with verified content, or remove them from the Quellen/Sources frontmatter. Do not claim sources you have not opened.`;
                        collectedContent.push(warn);
                        console.debug(`[HallucinationBrake] ${toolCall.name}: ${unread.length} unread refs — ${unread.slice(0, 3).join(', ')}`);
                    }
                } catch (e) {
                    console.warn('[HallucinationBrake] scan failed (non-fatal, skipping):', e);
                }
            }

            // 6. Persistent operation log + cache write
            const durationMs = Date.now() - startTime;
            const textContent = collectedContent.join('\n');
            await this.logOperation(toolCall, !executionHadError, durationMs, undefined, textContent);

            // Cache successful read-only results for deduplication (text-only, FULL content)
            if (!executionHadError && ToolExecutionPipeline.CACHEABLE.has(toolCall.name)) {
                this.resultCache.set(this.cacheKey(toolCall.name, toolCall.input), textContent);
            }

            // 6b. ADR-063: Context Externalization — write large results to temp files
            // Must happen AFTER cache write (cache stores full content) and BEFORE return.
            // Multimodal content (images) is never externalized.
            let finalContent: string | import('../../api/types').ToolResultContentBlock[] = multimodalContent ?? textContent;
            if (!multimodalContent && this.resultExternalizer) {
                const ref = await this.resultExternalizer.maybeExternalize(
                    toolCall.name, toolCall.input, textContent, executionHadError,
                );
                if (ref !== null) {
                    finalContent = ref;
                }
            }

            // 6c. FEAT-24-03 (ADR-63 amendment): hard per-tool output cap — the
            // floor that catches anything the externalizer skipped or that slipped
            // through (e.g. an MCP tool with a huge response).
            {
                const capResult = capOversizedToolOutput(finalContent, executionHadError);
                if (capResult.capped) {
                    finalContent = capResult.content;
                    console.debug(`[Pipeline] Capped ${toolCall.name} output ${capResult.originalLength} -> ${(finalContent as string).length} chars`);
                }
            }

            // 7. Chat-Linking: track written .md paths for deferred frontmatter stamping (ADR-022)
            if (tool.isWriteOperation && !executionHadError && extensions?.conversationId) {
                const writePath = toolCall.input?.path as string | undefined;
                if (writePath) {
                    this.plugin.trackChatLinkPath(extensions.conversationId, writePath);
                }
            }

            return {
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: finalContent,
                is_error: executionHadError,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Pipeline] Tool execution failed: ${toolCall.name}`, error);
            await callbacks.handleError(toolCall.name, error);
            await this.logOperation(toolCall, false, Date.now() - startTime, errorMessage, undefined);
            return this.errorResult(toolCall.id, errorMessage);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * AUDIT-034 M-10: Per-tool path-key map for multi-path tools whose
     * vault-relevant inputs are NOT named `path`. Without this, move_file
     * (source/destination), extract_zip (zip_path/target_folder),
     * generate_canvas (source/output_path), plan_presentation (source) and
     * the other listed entries silently bypassed IgnoreService. Each entry
     * lists the input keys plus whether the key is read-only (only isIgnored
     * is enforced) or write-side (isIgnored + isProtected when isWrite).
     */
    private static readonly PATH_INPUT_KEYS: Record<string, Array<{ key: string; write: boolean }>> = {
        // single-path tools fall through to the default `path` handling below,
        // but listing them here keeps the contract explicit and is harmless.
        move_file: [
            { key: 'source', write: true },
            { key: 'destination', write: true },
        ],
        extract_zip: [
            { key: 'zip_path', write: false },
            { key: 'target_folder', write: true },
        ],
        generate_canvas: [
            { key: 'source', write: false },
            { key: 'output_path', write: true },
        ],
        plan_presentation: [
            { key: 'source', write: false },
        ],
        restore_checkpoint: [
            { key: 'path', write: true },
        ],
    };

    /**
     * Check ignore/protected rules for file-path tools.
     *
     * Default behaviour: inspect `input.path`. For multi-path tools that
     * declare their vault keys in PATH_INPUT_KEYS, iterate the declared
     * keys instead so move_file / extract_zip / generate_canvas /
     * plan_presentation / restore_checkpoint cannot bypass governance.
     */
    private validatePaths(toolCall: ToolUse, isWrite: boolean): ValidationResult {
        const ignoreService: IgnoreService | undefined = this.plugin.ignoreService;
        if (!ignoreService) return { allowed: true };

        const keys = ToolExecutionPipeline.PATH_INPUT_KEYS[toolCall.name];
        if (keys && keys.length > 0) {
            for (const entry of keys) {
                const value = toolCall.input?.[entry.key];
                if (typeof value !== 'string' || value.length === 0) continue;
                if (ignoreService.isIgnored(value)) {
                    return { allowed: false, reason: ignoreService.getDenialReason(value) };
                }
                if (entry.write && isWrite && ignoreService.isProtected(value)) {
                    return { allowed: false, reason: ignoreService.getDenialReason(value) };
                }
            }
            return { allowed: true };
        }

        const path = toolCall.input?.path as string | undefined;
        if (!path) return { allowed: true };

        if (ignoreService.isIgnored(path)) {
            return { allowed: false, reason: ignoreService.getDenialReason(path) };
        }

        if (isWrite && ignoreService.isProtected(path)) {
            return { allowed: false, reason: ignoreService.getDenialReason(path) };
        }

        return { allowed: true };
    }

    /**
     * Determine if this tool call needs approval and whether it's already granted.
     * Returns an ApprovalResult with the decision and optional edited content.
     */
    private async checkApproval(
        toolCall: ToolUse,
        extensions?: ContextExtensions,
    ): Promise<ApprovalResult> {
        const cfg = this.plugin.settings.autoApproval;
        const group = TOOL_GROUPS[toolCall.name] ?? 'note-edit';

        // Agent tools are normally auto-approved, EXCEPT update_settings when
        // touching autoApproval paths (AUDIT-006 H-3: prevent LLM self-escalation)
        // AUDIT-034 M-11: configure_model always requires user approval because
        // it can add a model + apiKey + baseUrl, switch the active model, or
        // overwrite credentials. Without this carve-out a compromised turn could
        // re-point the next createMessage payload to an attacker-controlled
        // account (validateProviderUrl catches the worst pivot but not a stolen
        // apiKey on a legitimate provider host).
        if (group === 'agent') {
            if (toolCall.name === 'update_settings') {
                const action = (toolCall.input?.action as string ?? '').trim();
                const settingsPath = (toolCall.input?.path as string ?? '').trim();
                const needsApproval =
                    action === 'apply_preset' ||
                    (action === 'set' && settingsPath.startsWith('autoApproval.'));
                if (needsApproval) {
                    if (!extensions?.onApprovalRequired) {
                        console.warn('[Pipeline] update_settings touching autoApproval -- denying (fail-closed)');
                        return { decision: 'rejected' };
                    }
                    return await extensions.onApprovalRequired(toolCall.name, toolCall.input);
                }
            }
            if (toolCall.name === 'configure_model') {
                if (!extensions?.onApprovalRequired) {
                    console.warn('[Pipeline] configure_model -- denying (fail-closed, always requires approval)');
                    return { decision: 'rejected' };
                }
                return await extensions.onApprovalRequired(toolCall.name, toolCall.input);
            }
            return { decision: 'auto' };
        }

        // Sandbox code execution (evaluate_expression) — requires explicit opt-in.
        // Default off because sandboxed code runs arbitrary JS/TS which could be
        // injected via prompt injection. User approval is the primary defense.
        if (group === 'sandbox') {
            if (cfg.enabled && cfg.sandbox) return { decision: 'auto' };
            if (cfg.sandbox && !cfg.enabled) {
                // Diagnostic for "I toggled sandbox on but it still asks": the
                // category bit is set, but the master switch above is off so
                // the gate refuses. The UI now hard-disables category toggles
                // while the master is off; this log is kept for legacy
                // data.json files where the combination persists.
                console.debug(
                    `[Pipeline] ${toolCall.name}: sandbox category is on, ` +
                    `but autoApproval.enabled (master) is off; falling back to user prompt.`,
                );
            }
            if (!extensions?.onApprovalRequired) {
                console.warn(`[Pipeline] Sandbox tool ${toolCall.name} — denying (requires approval)`);
                return { decision: 'rejected' };
            }
            return await extensions.onApprovalRequired(toolCall.name, toolCall.input);
        }

        // M-7: Self-modification tools (manage_source) ALWAYS require
        // human approval — no auto-approve bypass possible
        if (group === 'self-modify') {
            if (!extensions?.onApprovalRequired) {
                console.warn(`[Pipeline] Self-modify tool ${toolCall.name} — denying (always requires approval)`);
                return { decision: 'rejected' };
            }
            return await extensions.onApprovalRequired(toolCall.name, toolCall.input);
        }

        // Check if auto-approved by settings
        if (cfg.enabled) {
            if (group === 'read' && cfg.read) return { decision: 'auto' };
            if (group === 'note-edit' && cfg.noteEdits) return { decision: 'auto' };
            if (group === 'vault-change' && cfg.vaultChanges) return { decision: 'auto' };
            if (group === 'web' && cfg.web) return { decision: 'auto' };
            if (group === 'mcp' && cfg.mcp) return { decision: 'auto' };
            if (group === 'subtask' && cfg.subtasks) return { decision: 'auto' };
            if (group === 'skill' && cfg.skills) {
                // AUDIT-034 L-17 cross-module gate. The general
                // `autoApproval.skills` flag covers builtin/bundled skills
                // and the dispatcher tools that invoke them. Imported
                // skills (source != builtin/bundled) MUST still go through
                // the per-skill prompt in InvokeSkillTool even when the
                // user has the general skills auto-approval on, otherwise
                // a malicious imported skill body could ride the trust
                // boundary of the auto-approve toggle. Tools other than
                // `invoke_skill` (execute_command, resolve_capability_gap,
                // enable_plugin, probe_plugin, run_skill_script,
                // invoke_mcp_server) keep the existing auto-approve.
                if (toolCall.name !== 'invoke_skill') {
                    return { decision: 'auto' };
                }
                const rawName: unknown = toolCall.input?.skill_name;
                const targetName = typeof rawName === 'string' ? rawName.trim() : '';
                if (targetName.length === 0) {
                    // Malformed call -- let the tool itself reject it.
                    return { decision: 'auto' };
                }
                const targetSkill = this.plugin.selfAuthoredSkillLoader?.getSkill(targetName);
                const source = targetSkill?.source ?? 'user';
                if (PIPELINE_TRUSTED_SKILL_SOURCES.has(source)) {
                    return { decision: 'auto' };
                }
                // Untrusted source -- do not auto-approve. Fall through
                // to the standard onApprovalRequired modal below. The tool
                // layer (InvokeSkillTool.askImportedSkillApproval) caches
                // the per-skill decision in sessionApprovedImportedSkills,
                // so the user sees at most one prompt per skill per
                // session even though two gates fire.
            }
            if (group === 'plugin-api') {
                // Differentiate read vs write for plugin API calls
                const isWriteCall = this.isPluginApiWriteCall(toolCall);
                if (!isWriteCall && cfg.pluginApiRead) return { decision: 'auto' };
                if (isWriteCall && cfg.pluginApiWrite) return { decision: 'auto' };
            }
            if (group === 'recipe' && cfg.recipes) return { decision: 'auto' };
        }

        // No auto-approve config AND no approval callback — fail-closed.
        // Silently auto-approving writes when no callback is wired (e.g. subtasks) is a
        // security risk. Deny by default to prevent unauthorized vault changes.
        if (!extensions?.onApprovalRequired) {
            console.warn(`[Pipeline] No approval callback for ${toolCall.name} — denying (fail-closed)`);
            return { decision: 'rejected' };
        }

        // Ask for user approval
        return await extensions.onApprovalRequired(toolCall.name, toolCall.input);
    }

    /**
     * Write a log entry via OperationLogger (if available).
     */
    private async logOperation(
        toolCall: ToolUse,
        success: boolean,
        durationMs: number,
        errorMessage?: string,
        resultContent?: string,
    ): Promise<void> {
        const logger: OperationLogger | undefined = this.plugin.operationLogger;
        if (logger) {
            await logger.log({
                timestamp: new Date().toISOString(),
                taskId: this.taskId,
                mode: this.mode,
                tool: toolCall.name,
                params: toolCall.input,
                result: resultContent,
                success,
                durationMs,
                error: errorMessage,
            });
        } else {
            // Fallback: console only
            if (this.plugin.settings.debugMode) {
                console.debug(`[Pipeline] ${toolCall.name} — ${success ? 'ok' : 'error'} (${durationMs}ms)`);
            }
        }
    }

    /**
     * Determine if a call_plugin_api invocation is a write operation.
     * Built-in allowlist: use isWrite flag. Dynamic discovery: always write
     * unless user marked as safe.
     */
    private isPluginApiWriteCall(toolCall: ToolUse): boolean {
        const pluginId = (toolCall.input?.plugin_id as string ?? '').trim();
        const method = (toolCall.input?.method as string ?? '').trim();

        // Check built-in allowlist first
        const entry = findAllowedMethod(pluginId, method);
        if (entry) return entry.isWrite;

        // Dynamic discovery: check user overrides
        const overrideKey = `${pluginId}:${method}`;
        const overrides = this.plugin.settings.pluginApi?.safeMethodOverrides ?? {};
        if (overrides[overrideKey]) return false; // User marked as safe read

        return true; // Default: treat as write
    }

    /**
     * FEAT-29-07: count user-approvals of Tier-2 (dynamically discovered)
     * plugin-API methods. Fires recordApprovalAndMaybePromote which
     * mutates the settings and -- once the threshold + read-heuristic
     * line up -- adds the method to safeMethodOverrides so subsequent
     * calls are auto-approved.
     *
     * Non-blocking: saveSettings is awaited in a detached Promise so
     * the hot path returns immediately. Errors are swallowed: a failed
     * promotion never breaks the user's tool call.
     */
    private async maybeAutoPromotePluginApi(input: Record<string, unknown>): Promise<void> {
        const pluginId = ((input?.plugin_id as string) ?? '').trim();
        const method = ((input?.method as string) ?? '').trim();
        if (!pluginId || !method) return;

        // Only count Tier-2 methods (not in the built-in allowlist).
        // Tier-1 entries already have a static isWrite flag and need no promotion.
        const allowedEntry = findAllowedMethod(pluginId, method);
        if (allowedEntry) return;

        const { recordApprovalAndMaybePromote } = await import('../tools/agent/pluginApiAdaptive');
        const apiSettings = this.plugin.settings.pluginApi;
        if (!apiSettings) return;
        const result = recordApprovalAndMaybePromote(apiSettings, pluginId, method);
        try {
            await this.plugin.saveSettings();
            if (result.promoted) {
                console.debug(`[PluginApi] Auto-promoted ${pluginId}:${method} (count ${result.newCount})`);
            }
        } catch (e) {
            console.warn('[PluginApi] saveSettings after approval failed (non-fatal):', e);
        }
    }

    private errorResult(toolUseId: string, message: string): ToolResult {
        return {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: `<error>${message}</error>`,
            is_error: true,
        };
    }
}

