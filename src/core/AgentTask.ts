/**
 * AgentTask - The Conversation Loop
 *
 * Adapted from Kilo Code's src/core/task/Task.ts (strongly simplified).
 *
 * Handles the agentic loop:
 * 1. Send user message to LLM
 * 2. Stream response (text + tool calls)
 * 3. Execute tool calls via ToolExecutionPipeline
 * 4. Add tool results back to conversation
 * 5. Loop until no more tool calls (end_turn)
 */

import type { ApiHandler, MessageParam, ContentBlock, ToolResultContentBlock } from '../api/types';
import type { ToolRegistry } from './tools/ToolRegistry';
import type { ToolCallbacks, ToolName, ToolUse, ToolDefinition } from './tools/types';
import { ToolExecutionPipeline } from './tool-execution/ToolExecutionPipeline';
import { ToolRepetitionDetector } from './tool-execution/ToolRepetitionDetector';
import { buildSystemPromptForMode } from './systemPrompt';
import type { ModeService } from './modes/ModeService';
import type { ModeConfig, CustomModel } from '../types/settings';
import type { McpClient } from './mcp/McpClient';
import { BUILT_IN_MODES } from './modes/builtinModes';
import { QUALITY_GATES } from './tools/qualityGates';
import { sanitizeAndLog } from './utils/sanitizeHistoryForApi';
import { logInputBreakdown } from './utils/logInputBreakdown';
import { microcompactToolResults } from './context/MicroCompactor';
import { filterShadowedBuiltins } from './tools/shadowedByPlugin';
import { isDeferredTool } from './tools/toolMetadata';
import { getSubagentProfile, listSubagentProfileNames } from './agent/subagent-profiles';
import { getHelperApi } from './helper-api';
import { shouldRunTaskRouter } from './routing/TaskRouter';
import { resolveLeanFlags } from './prompts/leanFlags';
import { buildApiHandlerForModel } from '../api';
import { CompositionStackService } from './skills/CompositionStackService';
import {
    beginStigmergyTurn,
    registerCapabilitiesIfChanged as registerStigmergyCapabilitiesIfChanged,
    stigmergyMcpId,
    stigmergyPromptOf,
    stigmergySkillId,
    stigmergySubagentId,
    type CapabilityDescriptor,
    type McpCapabilityDescriptor,
    type StigmergyTurn,
} from './stigmergy/StigmergyAdapter';
import { withTimeout } from './utils/withTimeout';

/** FEAT-29-10: max composition-stack depth (skill -> skill / mcp chains). */
const COMPOSITION_MAX_DEPTH = 5;

export interface AgentTaskCallbacks {
    /** Called at the start of each agentic loop iteration (0 = first/user message, 1+ = after tools) */
    onIterationStart?: (iteration: number) => void;
    /** Called for each streamed text chunk */
    onText: (text: string) => void;
    /** Called for each streaming reasoning/thinking chunk (extended thinking models) */
    onThinking?: (text: string) => void;
    /** Called when a tool is about to be executed */
    onToolStart: (name: string, input: Record<string, unknown>) => void;
    /** Called when a tool has finished executing */
    onToolResult: (name: string, content: string, isError: boolean) => void;
    /** Called with intermediate progress messages from long-running tools (e.g. ingest_template phase banners) */
    onToolProgress?: (name: string, content: string) => void;
    /**
     * Called with cumulative token usage just before onComplete (Feature 6).
     *
     * EPIC-26 / FEAT-26-01 / ADR-120: optional `routingMode` tags WHY this
     * call ran on the reported `modelId`:
     *  - `auto`     (default): main loop on the resolved tier
     *  - `override` (Welle 2): user-pinned per-turn model
     *  - `advisor`           : consult_flagship escalation subagent
     *  - `subagent`          : research / other profile-spawned subagent
     */
    onUsage?: (
        inputTokens: number,
        outputTokens: number,
        cacheReadTokens?: number,
        cacheCreationTokens?: number,
        modelId?: string,
        routingMode?: 'auto' | 'override' | 'advisor' | 'subagent',
    ) => void;
    /** Called when the task is complete (attempt_completion or natural end) */
    onComplete: () => void;
    /** Called when attempt_completion fires — triggers todo auto-complete */
    onAttemptCompletion?: () => void;
    /** Called when ask_followup_question is invoked — pauses loop until resolved */
    onQuestion?: (question: string, options: string[] | undefined, resolve: (answer: string) => void, allowMultiple?: boolean) => void;
    /** Called when a write tool needs user approval — pauses loop until user decides */
    onApprovalRequired?: (toolName: string, input: Record<string, unknown>) => Promise<import('./tool-execution/ToolExecutionPipeline').ApprovalResult>;
    /** Called when update_todo_list publishes a new todo plan */
    onTodoUpdate?: (items: import('./tools/agent/UpdateTodoListTool').TodoItem[]) => void;
    /** Called when switch_mode changes the active mode */
    onModeSwitch?: (newModeSlug: string) => void;
    /**
     * FEAT-24-08 / ADR-114 Steering-Hook: drained at the start of every
     * iteration. Returns user-typed mid-run messages that should be appended
     * to the conversation history before the next assistant turn. Each entry
     * becomes its own user-role message so message order is preserved.
     * Empty array means no steering pending.
     *
     * The iteration index is passed in so the UI can show the user which
     * iteration actually picked up their correction (pending -> delivered
     * state flip on the steering bubble).
     */
    consumeSteeringMessages?: (iteration: number) => string[];
    /** Called when the conversation history was condensed (context summarized) - includes token counts before/after */
    onContextCondensed?: (prevTokens?: number, newTokens?: number) => void;
    /** Called when a checkpoint is saved before a write tool */
    onCheckpoint?: (checkpoint: import('./checkpoints/GitCheckpointService').CheckpointInfo) => void;
    /**
     * Called once per task in the finally-block with the complete episode
     * payload (FEAT-32-02 PR 2.2 / ADR-133). Replaces the pre-FEAT-32-02
     * success-only shape -- the callback now fires for every exit path
     * (success, iteration-cap, abort, error) so RecipePromotion sees the
     * full picture. Fields:
     *   - toolSequence / toolLedger: existing ADR-018 payload.
     *   - success: true when `stigmergyOutcome === 'accept'` AND
     *     `mistakesEncountered === 0` AND (`attemptCompletionFired` OR
     *     the turn was a clean natural exit -- streamed text, used at
     *     least one tool, no errors, no iteration-cap hit). The natural-
     *     exit branch covers read-only / question tasks where the prompt
     *     deliberately steers the model away from attempt_completion.
     *   - mistakesEncountered: total tool errors during the loop.
     *   - attemptCompletionFired: whether the model called attempt_completion.
     *   - fastPathFired: whether the ADR-061 FastPath block ran successfully.
     *   - stigmergy: Stigmergy decision snapshot for this turn (ADR-133).
     */
    onEpisodeData?: (data: {
        toolSequence: string[];
        toolLedger: string;
        success: boolean;
        mistakesEncountered: number;
        attemptCompletionFired: boolean;
        fastPathFired: boolean;
        stigmergy?: import('./mastery/EpisodicExtractor').EpisodeStigmergySnapshot;
    }) => void;
    /** Called before context condensing to flush important facts to memory (Phase 5) */
    onPreCompactionFlush?: (history: MessageParam[]) => Promise<void>;
    /** Called when an unrecoverable error occurs */
    onError: (error: Error) => void;
    /**
     * ADR-090 Lever 10: Telemetry hook fired exactly once per task at the very
     * end with all aggregated stats (tokens, tool sequence, outcome). The
     * receiver decides where to persist (typically TaskTelemetry.record).
     */
    onTaskTelemetry?: (data: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
        toolSequence: string[];
        iterations: number;
        outcome: 'completed' | 'aborted' | 'error';
        errorMessage?: string;
    }) => void;
}

/**
 * Configuration for AgentTask.run().
 * Replaces 15+ positional parameters with a structured config object.
 */
export interface AgentTaskRunConfig {
    userMessage: string | ContentBlock[];
    taskId: string;
    initialMode: string | ModeConfig;
    history: MessageParam[];
    abortSignal?: AbortSignal;
    globalCustomInstructions?: string;
    includeTime?: boolean;
    rulesContent?: string;
    /**
     * FEAT-24-09 / ADR-116: stable SKILLS directory for the cached
     * system-prompt prefix (name + description per skill, plus inventory
     * lines for self-authored skills). Replaces the per-message-classified
     * `skillsSection` and the dynamic `selfAuthoredSkillsSection`. The
     * model loads a skill body on demand via the `read_skill` tool.
     */
    skillDirectorySection?: string;
    mcpClient?: McpClient;
    allowedMcpServers?: string[];
    memoryContext?: string;
    pluginSkillsSection?: string;
    recipesSection?: string;
    configDir?: string;
    /** Active conversation ID for chat-linking frontmatter stamping (ADR-022) */
    conversationId?: string;
    /**
     * FEAT-24-04 / ADR-113: when set, this subagent runs with a profile
     * roleDefinition that REPLACES `mode.roleDefinition` in the system
     * prompt. Used only by spawnSubtask when `new_task` was called with
     * `profile='...'`.
     */
    subagentRoleOverride?: string;
    /**
     * FEAT-24-04 / ADR-113: when set, this subagent's tool list is
     * restricted to these names (subset of the parent's mode tool set).
     * Used only by spawnSubtask when `new_task` was called with `profile='...'`.
     */
    subagentAllowedTools?: ToolName[];
    /**
     * FEAT-32-01 PR 1.3 / ADR-131: pre-computed recipe matches for the user
     * message. When set, AgentTask uses these instead of calling
     * `recipeMatchingService.match()` itself, so the Sidebar and the
     * AgentTask see the SAME match (no embedding-lookup drift between
     * `recipesSection` build and FastPath gate). Optional: subagent paths
     * pass `undefined` and AgentTask falls back to an inline match.
     */
    recipeMatches?: import('./mastery/RecipeMatchingService').RecipeMatchResult[];
}

export class AgentTask {
    private api: ApiHandler;
    private toolRegistry: ToolRegistry;
    private taskCallbacks: AgentTaskCallbacks;
    private modeService?: ModeService;
    /** Stop after this many consecutive tool errors (0 = disabled). */
    private consecutiveMistakeLimit: number;
    /** Minimum ms to wait between iterations (0 = disabled). */
    private rateLimitMs: number;
    /** Enable automatic conversation condensing when context fills up. */
    private condensingEnabled: boolean;
    /** Trigger condensing when estimated tokens exceed this % of the model's context window. */
    private condensingThreshold: number;
    /**
     * Power Steering: inject a mode-reminder user message every N iterations (0 = disabled).
     * Helps the model stay on task during very long agentic loops.
     */
    private powerSteeringFrequency: number;
    /** Maximum iterations per message (prevents runaway loops). */
    private maxIterations: number;
    /** Current nesting depth (0 = root task, 1 = first child, etc.). */
    private depth: number;
    /** Maximum allowed sub-agent nesting depth. Children at this depth cannot spawn further. */
    private maxSubtaskDepth: number;
    /**
     * FEAT-24-02 (ADR-12 amendment): prune old tool_result contents to skeletons
     * at turn boundaries. Additive to the keep-first-last full condensing.
     */
    private microcompactionEnabled: boolean;
    /**
     * FEAT-24-02: fold the oldest part of the conversation into a running summary
     * once the estimated tokens exceed this % of the context window — earlier and
     * gentler than the keep-first-last full condensing (`condensingThreshold`).
     * Effective only when below `condensingThreshold`. Generous default so short
     * sessions are never touched.
     */
    private rollingSummaryThreshold: number;
    /**
     * EPIC-26 / FEAT-26-05 / ADR-120: per-turn user override active.
     * When true, the loop runs on an explicitly-chosen chat model
     * (not the tier-resolved default) AND `consult_flagship` is filtered
     * out of the tool schema for this task. Cost-log mode-tag becomes
     * `override`.
     */
    private modelOverrideActive: boolean;
    /**
     * FEAT-29-10 Composability: shared cycle + depth tracker for
     * invoke_skill / invoke_mcp_server. The top-level task creates a
     * new instance; spawned subtasks inherit the parent's stack by
     * reference so the chain is visible across hops.
     */
    private compositionStack: CompositionStackService;

    constructor(
        api: ApiHandler,
        toolRegistry: ToolRegistry,
        taskCallbacks: AgentTaskCallbacks,
        modeService?: ModeService,
        consecutiveMistakeLimit = 0,
        rateLimitMs = 0,
        condensingEnabled = true,
        condensingThreshold = 70,
        powerSteeringFrequency = 0,
        maxIterations = 25,
        depth = 0,
        maxSubtaskDepth = 2,
        microcompactionEnabled = true,
        rollingSummaryThreshold = 50,
        modelOverrideActive = false,
        compositionStack?: CompositionStackService,
    ) {
        this.api = api;
        this.toolRegistry = toolRegistry;
        this.taskCallbacks = taskCallbacks;
        this.modeService = modeService;
        this.consecutiveMistakeLimit = consecutiveMistakeLimit;
        this.rateLimitMs = rateLimitMs;
        this.condensingEnabled = condensingEnabled;
        this.condensingThreshold = condensingThreshold;
        this.powerSteeringFrequency = powerSteeringFrequency;
        this.maxIterations = maxIterations;
        this.depth = depth;
        this.maxSubtaskDepth = maxSubtaskDepth;
        this.microcompactionEnabled = microcompactionEnabled;
        this.rollingSummaryThreshold = rollingSummaryThreshold;
        this.modelOverrideActive = modelOverrideActive;
        this.compositionStack = compositionStack ?? new CompositionStackService(COMPOSITION_MAX_DEPTH);
    }

    /**
     * FEAT-24-02: at a turn boundary, prune old tool_result contents to skeletons.
     * Idempotent and cheap (no LLM call). Logs when it actually freed something.
     */
    private microcompact(history: MessageParam[]): void {
        if (!this.microcompactionEnabled) return;
        const { prunedBlocks, freedCharsApprox } = microcompactToolResults(history);
        if (prunedBlocks > 0) {
            console.debug(
                `[Microcompact] pruned ${prunedBlocks} tool_result block(s), ` +
                `freed ~${Math.round(freedCharsApprox / 4)} tokens`,
            );
        }
    }

    /**
     * FEAT-24-02 second stage: when the history sits between the rolling-summary
     * mark and the full-condensing threshold, fold the oldest part into a summary
     * once (no retry loop — that's the keep-first-last path's job). Returns true
     * if a rolling summary ran.
     */
    private async maybeRollingSummary(
        history: MessageParam[],
        systemPrompt: string,
        estimatedTokens: number,
        threshold: number,
        contextWindow: number,
        abortSignal: AbortSignal | undefined,
        toolCallLedger: string | undefined,
    ): Promise<boolean> {
        if (!this.microcompactionEnabled || history.length < 7) return false;
        const rollingMark = Math.floor(contextWindow * (Math.min(this.rollingSummaryThreshold, this.condensingThreshold) / 100));
        if (estimatedTokens <= rollingMark || estimatedTokens > threshold) return false;
        await this.taskCallbacks.onPreCompactionFlush?.(history).catch((e) =>
            console.warn('[AgentTask] Pre-compaction flush (rolling) failed (non-fatal):', e)
        );
        console.debug(`[AgentTask] Rolling summary at ~${estimatedTokens}t (mark ${rollingMark}t, full threshold ${threshold}t)`);
        await this.condenseHistory(history, systemPrompt, abortSignal, toolCallLedger);
        return true;
    }

    /**
     * Run the agentic conversation loop.
     * Adapted from Kilo Code's Task.ts attemptApiRequest() and main loop.
     *
     * Accepts an AgentTaskRunConfig object for clean parameter passing.
     */
    async run(config: AgentTaskRunConfig): Promise<void> {
        const {
            userMessage,
            taskId,
            initialMode,
            history,
            abortSignal,
            globalCustomInstructions,
            includeTime,
            rulesContent,
            skillDirectorySection,
            mcpClient,
            allowedMcpServers,
            memoryContext,
            pluginSkillsSection,
            recipesSection,
            configDir,
            conversationId,
            subagentRoleOverride,
            subagentAllowedTools,
        } = config;
        // Resolve mode to ModeConfig
        let activeMode: ModeConfig = this.resolveMode(initialMode);

        // Create per-task pipeline instance (like Kilo Code creates per-task context)
        const pipeline = new ToolExecutionPipeline(
            this.toolRegistry.plugin,
            this.toolRegistry,
            taskId,
            activeMode.slug,
            this.api,
        );

        // FIX-H/I (ADR-090 follow-up): set of files read during this task.
        // Declared early so FastPath (which runs before the main loop) can
        // contribute to it. Pipeline mutates on each successful read.
        const readFiles = new Set<string>();

        // Stigmergy observability turn -- consult BEFORE the user message is
        // pushed to history, so we can append pathGuidance to it cache-safely
        // (the cached prefix is system + tools schema; the messages tail is
        // not cached, so appending here does not invalidate the cache).
        // Phase 1: the adapter NEVER hides a tool -- orderTools only reorders,
        // pathGuidance only emits text in pinned/enforce modes. When the
        // daemon is down or Stigmergy is toggled off, every call is a no-op
        // and the loop runs exactly as before. Capability registration is
        // hash-gated and re-runs only when the inventory actually changed.
        //
        // candidate_ids now span ALL FOUR explorable surfaces -- tools,
        // skills, MCP tools, subagent profiles -- so consult can rank them
        // jointly. Ids are namespaced (skill:*, mcp:server:*, subagent:*)
        // exactly the way the inner-dispatch emits encode them; that
        // alignment is what keeps the substrate from accumulating phantom
        // capability nodes that never see edges.
        //
        // VO/Stigmergy contract: candidate_ids MUST equal the registered
        // capability set (Cooperation Building Block 2). The mode-filtered
        // tool list excludes deferred tools (FEATURE-1600 / find_tool /
        // progressive disclosure), but those tools ARE registered with the
        // daemon. If consult only saw the mode-filtered set, a learned path
        // that runs through a deferred tool could never re-fire -- the
        // consult would never know that tool was a candidate. Use the full
        // registered tool set here so registration-superset == consult-set.
        //
        // The mode-filtered set still drives the prompt-cache `cachedTools`
        // surface the model sees (orderTools is applied there); deferred
        // tools stay deferred from the LLM until find_tool activates them.
        // Stigmergy is RECALL, not a second tool selector -- VO's own
        // progressive disclosure remains the precise default selector.
        const fullRegisteredTools = this.toolRegistry.getToolDefinitions();
        const stigmergyCandidates = fullRegisteredTools;

        const pluginForStigmergy = this.toolRegistry.plugin as unknown as {
            selfAuthoredSkillLoader?: { getAllSkills(): Array<{ name: string; description: string }> };
            skillsManager?: { discoverSkills(): Promise<Array<{ name: string; description: string }>> };
        };
        const stigmergySkillsList: CapabilityDescriptor[] = [];
        const seenSkillNames = new Set<string>();
        const addSkill = (name: string, description: string): void => {
            if (!name || seenSkillNames.has(name)) return;
            seenSkillNames.add(name);
            stigmergySkillsList.push({ name, description });
        };
        try {
            for (const s of pluginForStigmergy.selfAuthoredSkillLoader?.getAllSkills() ?? []) {
                addSkill(s.name, s.description);
            }
        } catch (e) {
            console.debug('[Stigmergy] self-authored skill enumeration failed (non-fatal):',
                e instanceof Error ? e.message : e);
        }
        try {
            // FEAT-32-03 PR 3.1: hard 1500ms ceiling on discoverSkills so a
            // haengende user-skill folder cannot block the Stigmergy turn
            // (Audit Finding 26). TimeoutError is logged at debug, self-
            // authored skills already loaded above stay registered.
            const discoverPromise = pluginForStigmergy.skillsManager?.discoverSkills();
            const userSkills = discoverPromise
                ? (await withTimeout(discoverPromise, 1500, 'skillsManager.discoverSkills')) ?? []
                : [];
            for (const s of userSkills) addSkill(s.name, s.description);
        } catch (e) {
            console.debug('[Stigmergy] user skill enumeration failed (non-fatal):',
                e instanceof Error ? e.message : e);
        }

        const stigmergyMcpList: McpCapabilityDescriptor[] = [];
        if (mcpClient) {
            try {
                const allowed = allowedMcpServers;
                const serverAllowed = (name: string): boolean =>
                    !allowed || allowed.length === 0 || allowed.includes(name);
                for (const { serverName, tool } of mcpClient.getAllTools()) {
                    if (!serverAllowed(serverName)) continue;
                    stigmergyMcpList.push({
                        server: serverName,
                        name: tool.name,
                        description: tool.description ?? '',
                    });
                }
            } catch (e) {
                console.debug('[Stigmergy] mcp tool enumeration failed (non-fatal):',
                    e instanceof Error ? e.message : e);
            }
        }

        const stigmergySubagentList: CapabilityDescriptor[] = listSubagentProfileNames()
            .map((name) => {
                const p = getSubagentProfile(name);
                return p ? { name: p.name, description: p.description } : null;
            })
            .filter((x): x is CapabilityDescriptor => x !== null);

        await registerStigmergyCapabilitiesIfChanged({
            tools: fullRegisteredTools,
            skills: stigmergySkillsList,
            mcp: stigmergyMcpList,
            subagents: stigmergySubagentList,
        });

        const stigmergyCandidateIds: string[] = [
            ...stigmergyCandidates.map((t) => t.name),
            ...stigmergySkillsList.map((s) => stigmergySkillId(s.name)),
            ...stigmergyMcpList.map((m) => stigmergyMcpId(m.server, m.name)),
            ...stigmergySubagentList.map((a) => stigmergySubagentId(a.name)),
        ];
        const stigmergyTurn: StigmergyTurn = await beginStigmergyTurn({
            taskId,
            prompt: stigmergyPromptOf(userMessage),
            candidateIds: stigmergyCandidateIds,
        });
        // Bind the turn to the per-task pipeline so the single-tool dispatch
        // point can emit capability_invoked / capability_returned around
        // tool.execute(). Without this, the daemon only sees START->tool
        // (from capability_loaded) and never tool->tool edges.
        pipeline.setStigmergyTurn(stigmergyTurn);

        // VO/Stigmergy contract: outcome grading (Cooperation Building Block 1).
        // The finally below MUST grade the turn, not unconditionally accept
        // it. A flailing run that ended in find_tool / tool errors must not
        // reinforce the same path the same way a clean attempt_completion
        // does -- otherwise consult would learn to recommend bad shortcuts.
        // Resolution rules (first matching wins, defaults to 'abandon'):
        //   - clean attempt_completion, no abort/error -> 'accept'
        //   - normal end without attempt_completion (iteration cap, hard
        //     limit recovery, model stopped early)             -> 'iterate'
        //   - abort, thrown error, circuit-breaker trip,
        //     network/API failure                              -> 'abandon'
        // Set at the three return sites in run(); the finally reads it.
        let stigmergyOutcome: 'accept' | 'abandon' = 'abandon';
        // FIX 2026-06-09 (Stigmergy substrate starvation RCA): a turn
        // graded 'iterate' previously called stigmergyTurn.iterate(),
        // which the upstream loop SDK uses to CANCEL the daemon's auto-
        // accept timer AND leak the response buffer without depositing
        // any edges in the substrate. With the prompt explicitly
        // forbidding attempt_completion for read-only / question tasks
        // (toolRules.ts:19, toolRouting.ts:33, AttemptCompletionTool.ts
        // description), every clean read-only turn ended on 'iterate'
        // and the substrate accumulated zero edges -- so no pin could
        // ever form and no RecipePromotion shortcut could ever fire.
        // The grading is now binary: a clean natural exit (streamed
        // text, no errors, didn't hit the cap) is reinforcement-worthy
        // (accept). Iteration-cap and error exits are negative evidence
        // (abandon). The 'iterate' state is gone.
        let cleanNaturalExit = false;

        // pathGuidance: when Stigmergy has a pinned sequence or pinned-set for
        // this task, append the hint as an extra text block on the SAME user
        // message. Two consecutive role:'user' messages would violate the
        // Anthropic alternation contract, so we merge into one. The text is
        // appended at the END of the content array, after the cached system +
        // tools schema, so the prompt cache stays valid.
        // The descOf map spans all four surfaces so a pinned `skill:*` /
        // `mcp:*` / `subagent:*` id in the guidance text gets a readable
        // description, not a bare id.
        const stigmergyDescById = new Map<string, string>();
        for (const t of stigmergyCandidates) {
            stigmergyDescById.set(t.name, t.description ?? '');
        }
        for (const s of stigmergySkillsList) {
            stigmergyDescById.set(stigmergySkillId(s.name), s.description);
        }
        for (const m of stigmergyMcpList) {
            stigmergyDescById.set(stigmergyMcpId(m.server, m.name), m.description);
        }
        for (const a of stigmergySubagentList) {
            stigmergyDescById.set(stigmergySubagentId(a.name), a.description);
        }
        const guidance = stigmergyTurn.pathGuidance((id) => stigmergyDescById.get(id));
        // STIGMERGY-PRECEDENCE-ANCHOR (FEAT-32-03 PR 3.3 / ADR-131 / ADR-062):
        // this region is where the precedence rule lives. Cross-references:
        //   - Doc: arc42 Sektion 8.16 (Stigmergy als externer Recall-Layer)
        //   - Helpers: src/core/stigmergy/precedenceResolver.ts (pure, tested)
        //   - Pipeline gate: src/core/stigmergy/stigmergyEmitGate.ts
        //   - Promotion gates: src/core/mastery/RecipePromotionService.ts:55
        // INVARIANTS (do not break without updating arc42 + ADR-131):
        //   1. recipesSection stays in the cached System-Prompt-Prefix.
        //   2. guidance.text appends only at the User-Message-Tail.
        //   3. guidance.path is always honoured for deferred-tool Pre-Activation.
        //   4. FastPath-Erfolg suppressed guidance.text (no double-hint).
        //   5. stigmergyDecisionSnapshot is closure-local; never leaks to subagents.
        // FEAT-32-01 PR 1.3 / ADR-131: precedence resolver. The user message
        // push moves DOWN to AFTER the FastPath block so we can decide whether
        // to append guidance.text only once the FastPath outcome is known.
        // guidance.path stays in scope for Pre-Activation (kept below); only
        // the textual hint is gated against Recipe + FastPath success.
        let precedenceFastPathFired = false;
        let precedenceRecipeWinner: string | null = null;
        let precedenceFastPathHistoryEntries: import('../api/types').MessageParam[] = [];
        const stigmergyGuidanceText = guidance.text;
        // FEAT-32-02 PR 2.2: hoisted detector so FastPath can feed it via
        // `recordForEpisodeOnly` BEFORE the main loop opens. Originally
        // declared in the main-loop-prep block ~150 lines below.
        const repetitionDetector = new ToolRepetitionDetector();
        // Phase 2 hook (intentionally inert): once we trust the ranking, swap
        // the candidate set to `stigmergyTurn.surfaced` here, gated behind a
        // user setting. Phase 1 keeps the full tool list so the daemon can
        // learn from the unbiased baseline.
        // const useSurfacedOnly = false;
        // if (useSurfacedOnly && stigmergyTurn.surfaced.length > 0) { ... }

        // v2.10.0: TaskRouter. Classify the user prompt; route simple
        // tool tasks onto the helper model so trivial xlsx / docx / file
        // ops do not consume the main-model rate. Only runs for the
        // top-level task (subtasks inherit the parent's api). Falls back
        // to the main api when the router is disabled, no helper model
        // is configured, or classification is not 'simple'.
        //
        // Logging is deliberately verbose: every code path that ends with
        // "no routing" emits an explanatory line so users can tell from
        // the console why routing did not happen (toggle off, no helper
        // model, classified as complex, etc).
        const mainApi = this.api;
        let routerDecision: 'simple' | 'complex' | 'unknown' | 'disabled' = 'disabled';
        if (shouldRunTaskRouter(this.depth, this.modelOverrideActive)) {
            try {
                const plugin = this.toolRegistry.plugin;
                const routerEnabled = plugin.settings.autoTaskRouter?.enabled ?? true;
                const helperModel = plugin.getHelperModel();
                if (!routerEnabled) {
                    console.debug('[TaskRouter] disabled (Settings > Loop > Auto-route simple tasks is off). Staying on main model.');
                } else if (!helperModel) {
                    console.debug('[TaskRouter] no helper model configured (Settings > Loop > Helper Model). Staying on main model.');
                } else {
                    const { TaskRouter } = await import('./routing/TaskRouter');
                    const router = new TaskRouter();
                    const promptText = typeof userMessage === 'string'
                        ? userMessage
                        : userMessage
                            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
                            .map(b => b.text)
                            .join(' ');
                    routerDecision = router.classifyByRegex(promptText);
                    if (routerDecision === 'simple') {
                        const { getHelperApi } = await import('./helper-api');
                        this.api = getHelperApi(plugin, this.api);
                        console.debug(
                            `[TaskRouter] classification=simple model=helper(${helperModel.name}) ` +
                            '-- routing this task to helper model. Escalates back to main on >= 2 errors.',
                        );
                    } else {
                        console.debug(`[TaskRouter] classification=${routerDecision} model=main(${this.api.getModel().id}) -- staying on main model.`);
                    }
                }
            } catch (e) {
                console.warn('[TaskRouter] router failed, staying on main api:', e);
            }
        } else if (this.depth === 0 && this.modelOverrideActive) {
            console.debug('[TaskRouter] skipped -- manual model override active. Staying on the picked model.');
        }

        // Escalation helper: switch back to main api after 2 consecutive errors.
        const escalateToMain = () => {
            if (this.api !== mainApi) {
                console.debug('[TaskRouter] Escalating to main model after consecutive errors.');
                this.api = mainApi;
            }
        };

        // ADR-061: Fast Path — if a recipe matches with high confidence,
        // execute tool steps as a batch before entering the normal loop.
        // The loop then handles presentation/completion in 1-2 iterations.
        if (recipesSection && this.depth === 0) {
            try {
                const { FastPathExecutor } = await import('./FastPathExecutor');
                // FEAT-32-01 PR 1.3: prefer pre-computed matches from the
                // Sidebar (same source as `recipesSection`); fall back to
                // inline match for subagent paths that do not pre-compute.
                const recipeMatch = config.recipeMatches
                    ?? this.toolRegistry.plugin.recipeMatchingService?.match(
                        typeof userMessage === 'string' ? userMessage : '', activeMode.slug,
                    );
                const bestMatch = recipeMatch?.[0];

                // FEATURE-0320 follow-up: when the user explicitly references
                // chats/conversations as the search source, the vault-centric
                // "Knowledge Search & Synthesis" recipe is the wrong answer --
                // it scans Notes and never calls search_history. Skip FastPath
                // so the agent picks search_history itself.
                const fpUserText = typeof userMessage === 'string' ? userMessage : '';
                const chatSourceRegex = /\b(chat|chats|gespr(ä|ae)ch|gespr(ä|ae)che|konversation|konversationen|unterhaltung|unterhaltungen|dialog|dialoge|history)\b/i;
                const targetsChatHistory = chatSourceRegex.test(fpUserText);

                if (bestMatch && targetsChatHistory) {
                    console.debug(`[FastPath] Skipped (chat-source query): "${fpUserText.slice(0, 80)}"`);
                }

                // FIX-F (ADR-090 follow-up, 2026-04-29): Recipe-Threshold von 0.3 auf 0.5 angehoben.
                // Bei score=0.33 matched "Metadata Tags Generation" auf eine reine Synthese-Aufgabe
                // und triggerte FastPath in den falschen Workflow. Niedriger Score = unsicheres Match
                // = lieber normalen Loop laufen lassen, der die Aufgabe sauber zerlegt.
                if (bestMatch && !targetsChatHistory && bestMatch.score >= 0.5 && bestMatch.recipe.source === 'learned' && bestMatch.recipe.successCount >= 3) {
                    console.debug(`[FastPath] Recipe match: ${bestMatch.recipe.name} (score=${bestMatch.score.toFixed(2)}, successes=${bestMatch.recipe.successCount})`);

                    // Build system prompt for planner (same params as normal loop)
                    const fpWebEnabled = this.modeService?.isWebEnabled() ?? false;
                    const fpPrompt = buildSystemPromptForMode({
                        mode: activeMode, globalCustomInstructions, includeTime, rulesContent,
                        skillDirectorySection, mcpClient, allowedMcpServers, memoryContext, pluginSkillsSection,
                        isSubtask: false, webEnabled: fpWebEnabled, recipesSection,
                        configDir: configDir ?? this.toolRegistry.plugin.app.vault.configDir,
                    });
                    const fpTools = this.modeService
                        ? this.modeService.getToolDefinitions(activeMode)
                        : this.toolRegistry.getToolDefinitions();

                    const fastPath = new FastPathExecutor(this.api, pipeline);
                    const fpCallbacks = {
                        pushToolResult: () => {},
                        pushProgress: () => {},
                        handleError: (tool: string, error: unknown) => {
                            console.warn(`[FastPath] Tool error in ${tool}:`, error);
                        },
                        log: (msg: string) => console.debug(`[FastPath] ${msg}`),
                    };

                    const msgText = typeof userMessage === 'string' ? userMessage : '';
                    const result = await fastPath.execute(
                        bestMatch.recipe,
                        msgText,
                        fpPrompt,
                        fpCallbacks,
                        abortSignal,
                        fpTools,
                        readFiles,
                        // FEAT-32-02 PR 2.2 / ADR-133: feed FastPath dispatches
                        // into the episodic detector so the toolSequence is
                        // complete. Iteration 0 marks pre-loop dispatches.
                        (tool, input, summary) =>
                            repetitionDetector.recordForEpisodeOnly(tool, input, summary, 0),
                    );

                    if (result.success && result.toolCallsExecuted > 0) {
                        console.debug(`[FastPath] Success: ${result.toolCallsExecuted} tools executed, collecting ${result.historyEntries.length} history entries for post-precedence push`);
                        // FEAT-32-01 PR 1.3 / ADR-131: do NOT push history yet.
                        // Collect FastPath entries so the precedence resolver
                        // below can push them AFTER the user message (which
                        // gets its guidance.text suppressed when FastPath
                        // fired). guidance.path Pre-Activation is unaffected.
                        precedenceFastPathHistoryEntries = [
                            ...result.historyEntries,
                            {
                                role: 'user',
                                content: `[Fast Path completed] The recipe "${bestMatch.recipe.name}" has been executed. `
                                    + `${result.toolCallsExecuted} tool calls completed successfully. `
                                    + `The search and read results are above. `
                                    + `Now: analyze the results and complete the task (write summary, present findings). `
                                    + `Do NOT re-search or re-read the same content -- use the results already in context.`,
                            },
                        ];
                        precedenceFastPathFired = true;
                        precedenceRecipeWinner = bestMatch.recipe.id;
                    } else {
                        console.debug('[FastPath] No success, continuing with normal loop');
                    }
                }
            } catch (e) {
                console.warn('[FastPath] Pre-loop check failed (non-fatal), continuing with normal loop:', e);
            }
        }

        // FEAT-32-01 PR 1.3 / ADR-131: precedence resolver. Decide guidance.text
        // suppression now that the FastPath outcome is known, then push:
        //   1) the user message (with conditional guidance.text)
        //   2) the FastPath history entries (assistant + tool_results + hint)
        // This order keeps the cached system-prompt-prefix invariant (ADR-062)
        // and ensures the agent never sees the recipesSection + guidance.text
        // double-hint when FastPath fired.
        const { resolveStigmergyPrecedence, appendGuidanceText, buildStigmergyDecisionSnapshot } =
            await import('./stigmergy/precedenceResolver');
        const precedence = resolveStigmergyPrecedence({
            fastPathFired: precedenceFastPathFired,
            bestMatchRecipeId: precedenceRecipeWinner,
            guidanceText: stigmergyGuidanceText,
        });
        const userMessageWithGuidance: typeof userMessage = precedence.suppressGuidanceText
            ? userMessage
            : (appendGuidanceText(userMessage, stigmergyGuidanceText) as typeof userMessage);
        history.push({ role: 'user', content: userMessageWithGuidance });
        for (const entry of precedenceFastPathHistoryEntries) {
            history.push(entry);
        }
        // Snapshot for ADR-132 / ADR-133 (consumed by FEAT-32-02 in finally).
        const stigmergyDecisionSnapshot = buildStigmergyDecisionSnapshot({
            turn: stigmergyTurn,
            pinnedPath: guidance.path,
            suppressGuidanceText: precedence.suppressGuidanceText,
            recipeWinner: precedence.recipeWinner,
        });
        if (precedence.suppressGuidanceText) {
            console.debug(
                `[Precedence] Recipe '${precedence.recipeWinner ?? '<unknown>'}' won; `
                + `Stigmergy guidance.text suppressed (mode=${stigmergyTurn.decisionMode}, `
                + `pathLen=${guidance.path.length})`,
            );
        } else if (stigmergyGuidanceText.length > 0) {
            console.debug(
                `[Precedence] No FastPath winner; Stigmergy guidance.text shown `
                + `(mode=${stigmergyTurn.decisionMode}, pathLen=${guidance.path.length})`,
            );
        }
        // FEAT-32-02 PR 2.2 / ADR-133: episode-recording closure counters.
        // All closure-local (not `this.*`) so a subagent re-entry of run()
        // does NOT inherit the parent's snapshot. Consumed in the finally
        // block at the end of run().
        let totalToolErrors = 0;
        let attemptCompletionFired = false;
        const fastPathFired = precedenceFastPathFired;

        const MAX_ITERATIONS = this.maxIterations;
        const SOFT_LIMIT = Math.floor(MAX_ITERATIONS * 0.6);

        // Tools that are safe to execute in parallel (pure reads, no side-effects).
        // Write tools and control-flow tools always run sequentially.
        const PARALLEL_SAFE = new Set([
            'read_file', 'list_files', 'search_files', 'get_frontmatter',
            'get_linked_notes', 'search_by_tag', 'get_vault_stats', 'get_daily_note',
            'web_fetch', 'web_search',
            'semantic_search', 'query_base', 'open_note',
        ]);

        // Feature 6: Accumulate token usage across all iterations
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCacheReadTokens = 0;
        let totalCacheCreationTokens = 0;
        // attempt_completion signal
        let completionResult: string | null = null;
        // Track whether the model streamed any text across all iterations.
        // Used to decide if the completion result should be rendered as fallback.
        let hasStreamedText = false;
        // Safety net: retry once if tools ran but model produced no visible response
        let hasRetriedEmpty = false;
        // switch_mode signal (checked at end of each iteration)
        let pendingModeSwitch: string | null = null;
        // Phase B: consecutive error tracking
        let consecutiveMistakes = 0;
        // FEAT-32-02 PR 2.2: `repetitionDetector` was hoisted up above so
        // FastPath can feed it via `recordForEpisodeOnly`; declaration kept
        // out of this block to avoid TDZ for FastPath.
        // ADR-090 Lever 10: count loop iterations for telemetry.
        let telemetryIterations = 0;

        // Wire up context extensions for agent-control tools
        const askQuestion = this.taskCallbacks.onQuestion
            ? (question: string, options?: string[], allowMultiple?: boolean): Promise<string> => {
                return new Promise<string>((resolve) => {
                    this.taskCallbacks.onQuestion!(question, options, resolve, allowMultiple);
                });
            }
            : undefined;

        const signalCompletion = (result: string) => {
            completionResult = result;
            // FEAT-32-02 PR 2.2 / ADR-133: track for the episode `success`
            // flag in the finally block.
            attemptCompletionFired = true;
        };

        const switchMode = (slug: string) => {
            pendingModeSwitch = slug;
        };

        // new_task: spawn a child AgentTask that runs in a fresh history and returns its result.
        // Depth-guard: children at maxSubtaskDepth get spawnSubtask = undefined (cannot nest further).
        const childDepth = this.depth + 1;
        const childCanSpawn = childDepth < this.maxSubtaskDepth;

        const spawnSubtask = async (
            childMode: string,
            childMessage: string,
            profileName?: string,
            overrides?: import('./tools/types').SubtaskSpawnOverrides,
        ): Promise<string> => {
            const childHistory: MessageParam[] = [];
            let childText = '';

            // FEAT-24-04 / ADR-113: optional subagent profile path. When a
            // profile is set, the subagent gets a lean role + reduced tool
            // allowlist and the parent's rules / mcp / plugin-skills set is
            // dropped (the profile is the explicit scope).
            const profile = profileName ? getSubagentProfile(profileName) : undefined;

            // FEAT-29-10 follow-up: per-spawn caps. `maxIterations` shortens
            // the child loop; `allowedTools` further narrows the child's tool
            // schema. Overrides win over profile defaults.
            const effectiveMaxIterations = overrides?.maxIterations ?? this.maxIterations;
            const effectiveAllowedTools = overrides?.allowedTools ?? profile?.allowedTools;

            // EPIC-26 / ADR-120: tier override + output cap. When the profile
            // pins a tier (research=fast, advisor=flagship), build a fresh
            // api handler from the active provider's tier slot. When the
            // active provider has no model for that tier (or no provider is
            // configured yet), fall back to the parent's api handler so the
            // pre-migration code path keeps working unchanged.
            let childApi: ApiHandler = this.api;
            if (profile?.tierOverride) {
                const pluginAny = this.toolRegistry.plugin as unknown as {
                    getTierModel?: (t: 'fast' | 'mid' | 'flagship') => CustomModel | null;
                };
                const tierModel = pluginAny.getTierModel?.(profile.tierOverride) ?? null;
                if (tierModel) {
                    const capped = profile.maxOutputTokens !== undefined
                        ? { ...tierModel, maxTokens: profile.maxOutputTokens }
                        : tierModel;
                    childApi = buildApiHandlerForModel(capped);
                }
            }

            const childTask = new AgentTask(
                childApi,
                this.toolRegistry,
                {
                    onText: (chunk) => { childText += chunk; },
                    onToolStart: (name, input) => {
                        this.taskCallbacks.onToolStart(`[subtask] ${name}`, input);
                    },
                    onToolResult: (name, content, isError) => {
                        this.taskCallbacks.onToolResult(`[subtask] ${name}`, content, isError);
                    },
                    onComplete: () => { /* handled via Promise resolution */ },
                    onError: (err) => { throw err; },
                    onUsage: (i, o, cr, cc, mid) => {
                        // Akkumuliere Subtask-Tokens in Parent-Totals
                        totalInputTokens += i;
                        totalOutputTokens += o;
                        totalCacheReadTokens += cr ?? 0;
                        totalCacheCreationTokens += cc ?? 0;
                        // EPIC-26: tag the forwarded usage so the parent's
                        // cost log shows WHY this call ran on the reported
                        // model. `advisor` for the consult_flagship profile,
                        // `subagent` for everything else profile-driven (eg
                        // research). Non-profile new_task spawns inherit the
                        // parent api and are accounted as part of the main
                        // loop's `auto` mode.
                        const routingMode: 'advisor' | 'subagent' | undefined =
                            profile?.name === 'advisor' ? 'advisor'
                            : profile ? 'subagent'
                            : undefined;
                        this.taskCallbacks.onUsage?.(i, o, cr, cc, mid, routingMode);
                    },
                    // K-1: Forward parent approval callback so subtask write ops are not
                    // auto-rejected by the fail-closed fallback in ToolExecutionPipeline.
                    onApprovalRequired: this.taskCallbacks.onApprovalRequired,
                },
                this.modeService,
                this.consecutiveMistakeLimit,
                this.rateLimitMs,
                // Subtasks don't condense or power-steer (keep child loops lean)
                false, 80, 0, effectiveMaxIterations,
                childDepth,             // propagate nesting depth
                this.maxSubtaskDepth,   // propagate limit
                this.microcompactionEnabled, // FEAT-24-02: cheap tool_result pruning still applies
                this.rollingSummaryThreshold, // unused while condensing is off, kept for completeness
                false, // modelOverrideActive: subtasks inherit, override flag is per-turn
                this.compositionStack, // FEAT-29-10: share stack by reference
            );

            // Stigmergy: emit at the inner dispatch when the spawn is a
            // PROFILE spawn -- those are the ones with a stable, namespaced
            // `subagent:<profile>` id the daemon can rank. Anonymous
            // new_task spawns have no canonical id (the child mode/message
            // are too freeform), so we leave them as their outer
            // `new_task`-tool emission and skip the subagent layer.
            // Captures the outer `stigmergyTurn` from the run() scope.
            const stigmergyOn = profile !== undefined && stigmergyTurn.enabled === true;
            const capId = profile !== undefined ? stigmergySubagentId(profile.name) : '';
            if (stigmergyOn) await stigmergyTurn.emitInvoked(capId);
            let subagentOk = false;
            try {
                await childTask.run({
                    userMessage: childMessage,
                    taskId: `${taskId}-sub-${Date.now()}`,
                    initialMode: profile ? 'agent' : childMode,
                    history: childHistory,
                    abortSignal,
                    globalCustomInstructions,
                    includeTime,
                    // Profile spawn: drop the parent's rules/mcp/plugin-skills set
                    // entirely. The profile's roleDefinition + allowedTools is the
                    // full scope.
                    rulesContent: profile ? undefined : rulesContent,
                    skillDirectorySection, // subtask-gated to '' inside buildSystemPromptForMode -- pass-through anyway
                    mcpClient: profile ? undefined : mcpClient,
                    allowedMcpServers: profile ? undefined : allowedMcpServers,
                    pluginSkillsSection: profile ? undefined : pluginSkillsSection,
                    subagentRoleOverride: profile?.roleDefinition,
                    subagentAllowedTools: effectiveAllowedTools,
                    configDir,
                });
                subagentOk = true;
            } finally {
                if (stigmergyOn) await stigmergyTurn.emitReturned(capId, subagentOk);
            }
            return childText;
        };

        // Cache system prompt + tool definitions — rebuilt only when the mode changes
        // or when settings that affect tool availability change (e.g. webTools.enabled).
        let cachedPromptMode = '';
        let cachedSystemPrompt = '';
        let cachedTools: ToolDefinition[] = [];
        let cacheInvalidated = false;
        // FEATURE-1600 (Deferred Tool Loading): tools that the LLM activated
        // via find_tool during this session. Injected into the prompt cache
        // until the task ends.
        const activatedDeferredTools = new Set<string>();

        // ADR-26 Recall-feeds-Retrieval: when consult returned a learned
        // `sequence` decision, pre-activate every DEFERRED TOOL on that
        // path so the schemas are already in the very first prompt and
        // find_tool is unnecessary for the path-tools. Only tool ids are
        // pre-activated -- skill:* / mcp:* / subagent:* ids are reached by
        // the agent through their own dispatch tools, not by schema
        // injection. We pre-activate even ids the daemon learned for tools
        // that are NOT currently deferred: the activated-set is a no-op for
        // already-visible tools (isDeferredTool gate inside the helper),
        // so the loop stays correct when the daemon's view drifts.
        for (const id of guidance.path) {
            if (isDeferredTool(id)) {
                activatedDeferredTools.add(id);
            }
        }

        // EPIC-26 / FEAT-26-01 / ADR-120: reminder is rebuilt as part of the
        // prompt cache. The closure captures the current value of
        // `consecutiveMistakes` (defined above) so a transition into
        // mistakes>=2 produces the hint, and a reset drops it again.
        const rebuildPromptCache = () => {
            const webEnabled = this.modeService?.isWebEnabled() ?? false;
            const advisorAvailable = !!(this.toolRegistry.plugin as unknown as {
                getAdvisorModel?: () => unknown;
            }).getAdvisorModel?.();
            cachedSystemPrompt = buildSystemPromptForMode({
                mode: activeMode,
                globalCustomInstructions,
                includeTime,
                rulesContent,
                skillDirectorySection,
                mcpClient,
                allowedMcpServers,
                memoryContext,
                pluginSkillsSection,
                isSubtask: this.depth > 0,
                webEnabled,
                recipesSection,
                configDir: configDir ?? this.toolRegistry.plugin.app.vault.configDir,
                // FEAT-24-04 / ADR-113: profile-spawn overrides; undefined on non-profile spawns.
                subagentRoleOverride,
                subagentAllowedTools,
                consultFlagshipReminderActive: consecutiveMistakes >= 2,
                consultFlagshipAvailable: advisorAvailable,
                // EPIC-26 / FEAT-26-06: prompt-slim. Lean cost-heuristics when
                // running on auto-mode (no override active). Lean plugin-skills
                // until a skill-group tool is actually invoked. Subtasks always
                // see lean cost-heuristics (their prompts are small anyway).
                // The "Lean system prompt" setting (#44) ORs into both
                // decisions to force the compact variants.
                ...resolveLeanFlags(
                    this.toolRegistry.plugin.settings.leanSystemPrompt ?? false,
                    this.modelOverrideActive,
                    recentPluginSkillUsage,
                ),
            });
            let baseTools = this.modeService
                ? this.modeService.getToolDefinitions(activeMode)
                : this.toolRegistry.getToolDefinitions();

            // FEAT-24-04 / ADR-113: subagent profile restricts the tool
            // schemas to the profile allowlist. Applied BEFORE the deferred-
            // tool and shadowed-builtin filters so the profile's small surface
            // wins regardless of the other policies.
            if (subagentAllowedTools && subagentAllowedTools.length > 0) {
                const allowSet = new Set<string>(subagentAllowedTools);
                baseTools = baseTools.filter((t) => allowSet.has(t.name));
            }

            // FEATURE-1600: by default hide deferred tools from the prompt.
            // The LLM can activate them via find_tool, which adds them to
            // activatedDeferredTools and invalidates the cache.
            cachedTools = baseTools.filter((t) => !isDeferredTool(t.name));

            // Inject activated deferred tools (if any were unlocked via find_tool).
            for (const name of activatedDeferredTools) {
                const extra = baseTools.find((t) => t.name === name);
                if (extra && !cachedTools.includes(extra)) {
                    cachedTools.push(extra);
                }
            }

            // REF-04 (2026-06-21): always-on meta-tools. find_tool (FEATURE-1600
            // discovery) and read_skill (FEAT-24-09 / ADR-116 "always-available")
            // were historically marked INTENTIONALLY_NOT_REACHABLE -- they only
            // hit by hallucination. FIX-29-99-01 added them to TOOL_GROUP_MAP.agent
            // so they ride through baseTools automatically when the active agent
            // includes the `agent` group. The injection below pulls them in even
            // for custom agents whose group list excludes 'agent' (or for subagent
            // profiles that restrict the surface): without this safety net,
            // disabling the meta-tools would silently disable progressive
            // disclosure for the whole task.
            const allFromRegistry = this.toolRegistry.getToolDefinitions();
            for (const name of ['find_tool', 'read_skill'] as const) {
                if (cachedTools.some((t) => t.name === name)) continue;
                const def = allFromRegistry.find((t) => t.name === name);
                if (!def) continue;
                // Respect subagent profile allowlists explicitly: if the profile
                // chose to exclude a meta-tool, do not override.
                if (subagentAllowedTools && subagentAllowedTools.length > 0
                    && !subagentAllowedTools.includes(name)) continue;
                cachedTools.push(def);
            }

            // BUG-018 Wave 2: hard tool-filter for plugin-shadowed built-ins.
            // If e.g. the Excalidraw community plugin is active, create_excalidraw
            // disappears from the schema entirely — the LLM cannot accidentally
            // pick it over the richer plugin route.
            const enabledPluginIds = (this.toolRegistry.plugin.app as unknown as {
                plugins?: { enabledPlugins?: Set<string> };
            }).plugins?.enabledPlugins ?? new Set<string>();
            cachedTools = filterShadowedBuiltins(cachedTools, enabledPluginIds);

            // EPIC-26 / FEAT-26-01 / ADR-120: hide `consult_flagship` from the
            // schema when no flagship-tier model is configured on the active
            // provider. The tool itself defends against this too (Task 7), but
            // dropping it here keeps the prompt clean and stops the model from
            // even considering it on pre-migration installs.
            // EPIC-26 / FEAT-26-05 extension: also hide when the chat-header
            // override is active (the user is explicitly running on a different
            // model for this turn, advisor pattern off by design).
            const pluginAny = this.toolRegistry.plugin as unknown as {
                getAdvisorModel?: () => unknown;
            };
            if (this.modelOverrideActive || !pluginAny.getAdvisorModel?.()) {
                cachedTools = cachedTools.filter((t) => t.name !== 'consult_flagship');
            }

            // ADR-26 / Recall-feeds-Retrieval contract: Stigmergy is NOT a
            // second tool selector and MUST NOT reorder the tool block --
            // VOs own find_tool / progressive disclosure is the precise
            // default selector. Reordering would compete with that selector,
            // could downgrade a good pick, and would break the prompt cache
            // because the model sees the tool array in a per-turn-dependent
            // order. cachedTools stays in VOs registered order.
            //
            // Stigmergy's surfacing signal is delivered earlier in run():
            // for a learned `sequence` decision, pathGuidance.path lists the
            // tools the daemon expects on this task; deferred tool ids in
            // that path are pre-activated via activateDeferredTool BEFORE
            // the prompt cache is built, so their schemas are already in
            // cachedTools when this builder runs. find_tool is unaffected
            // when the path is unknown.
            // Per-tool capability_invoked/returned events are emitted at the
            // real dispatch point in ToolExecutionPipeline.executeTool().

            cachedPromptMode = activeMode.slug;
            cacheInvalidated = false;
        };

        /** FEATURE-1600: activate a deferred tool for the rest of this task. */
        const activateDeferredTool = (toolName: string) => {
            if (!isDeferredTool(toolName)) return;
            if (activatedDeferredTools.has(toolName)) return;
            activatedDeferredTools.add(toolName);
            cacheInvalidated = true;
        };

        /** Called by UpdateSettingsTool when settings that affect tool availability change */
        const invalidateToolCache = () => { cacheInvalidated = true; };

        // Emergency condensing retry: if the API rejects with context overflow,
        // condense and retry the entire loop once instead of aborting.
        // ADR-061: Todo list as recency anchor (Manus Context Engineering).
        // Track current todo items so we can inject them at the end of context
        // before each LLM call, keeping task focus via recency bias.
        let currentTodoText = '';
        const originalTodoCallback = this.taskCallbacks.onTodoUpdate;
        this.taskCallbacks.onTodoUpdate = (items) => {
            originalTodoCallback?.(items);
            // Format todo list for injection
            if (items.length > 0) {
                currentTodoText = '[Current Task Plan]\n' + items.map((i) => {
                    const marker = i.status === 'done' ? 'x' : i.status === 'in_progress' ? '~' : ' ';
                    return `- [${marker}] ${i.text}`;
                }).join('\n');
            } else {
                currentTodoText = '';
            }
        };

        let emergencyRetried = false;

        // EPIC-26 / FEAT-26-01 / ADR-120: per-task advisor budget. Hard cap
        // of 3 consult_flagship calls; the 4th gets a tool_error so the
        // loop falls back to the current tier instead of stacking advisor
        // costs. Counter resets per task (each spawn of AgentTask runs its
        // own loop).
        const ADVISOR_LIMIT = 3;
        let advisorCallsUsed = 0;
        let lastReminderState = false;

        // EPIC-26 / FEAT-26-06: plugin-skill usage tracking. Starts false,
        // flips true on first invocation of a skill-group tool or when the
        // initial user message carries an @-plugin-mention. Once true, the
        // system prompt switches from lean to full plugin-skills section.
        const SKILL_GROUP_TOOLS = new Set<string>([
            'execute_command', 'execute_recipe', 'call_plugin_api',
            'resolve_capability_gap', 'enable_plugin',
        ]);
        let recentPluginSkillUsage = false;
        // Heuristic: detect @plugin-id mentions in the FIRST user message.
        // Conservative regex; the lean->full flip is fail-safe (false neg
        // just keeps the lean section longer).
        const firstUserMessage = history.find((m) => m.role === 'user')?.content;
        if (typeof firstUserMessage === 'string' && /@[a-z][a-z0-9-]{2,}/i.test(firstUserMessage)) {
            recentPluginSkillUsage = true;
        }
        const consumeAdvisorSlot = () => {
            if (advisorCallsUsed >= ADVISOR_LIMIT) {
                return { ok: false, used: advisorCallsUsed, limit: ADVISOR_LIMIT };
            }
            advisorCallsUsed++;
            return { ok: true, used: advisorCallsUsed, limit: ADVISOR_LIMIT };
        };

        // Rate limit retry: auto-retry on 429 errors with exponential backoff.
        // Max 3 retries with 30s, 60s, 120s waits.
        const RATE_LIMIT_MAX_RETRIES = 3;
        const RATE_LIMIT_BASE_WAIT_MS = 30_000;
        let rateLimitRetries = 0;

        try {
        while (true) {
        try {
            for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
                // ADR-063: Sync iteration counter for deterministic externalization file names
                pipeline.getExternalizer()?.nextIteration();

                // Early exit if task was cancelled between iterations
                if (abortSignal?.aborted) {
                    console.debug('[AgentTask] Abort signal detected at iteration start');
                    break;
                }

                // Apply any pending mode switch at the start of each iteration
                if (pendingModeSwitch !== null) {
                    const newMode = this.resolveMode(pendingModeSwitch);
                    if (newMode) {
                        activeMode = newMode;
                        if (this.modeService) {
                            void this.modeService.switchMode(pendingModeSwitch);
                        }
                        this.taskCallbacks.onModeSwitch?.(pendingModeSwitch);
                    }
                    pendingModeSwitch = null;
                    repetitionDetector.reset();
                    consecutiveMistakes = 0;
                }

                telemetryIterations++;
                this.taskCallbacks.onIterationStart?.(iteration);

                // Phase B: rate limiting — pause between iterations (skip on first)
                if (iteration > 0 && this.rateLimitMs > 0) {
                    await new Promise<void>((r) => window.setTimeout(r, this.rateLimitMs));
                }

                // Power Steering: inject a mode-role reminder on every Nth iteration
                if (
                    this.powerSteeringFrequency > 0
                    && iteration > 0
                    && iteration % this.powerSteeringFrequency === 0
                ) {
                    // FEAT-24-09: with the per-message skill classifier gone the
                    // task no longer ships a list of pre-active skill names. The
                    // skill the model loaded itself via read_skill is in the
                    // message stream (until microcompaction prunes it); the model
                    // can re-call read_skill if it lost the steps.
                    history.push({
                        role: 'user',
                        content: `[Power Steering Reminder]\n\nYou are operating in **${activeMode.name}** mode.\n\n${activeMode.roleDefinition}\n\nContinue the task.`,
                    });
                }

                // Soft limit: nudge the agent to wrap up at 60% of max iterations
                if (iteration === SOFT_LIMIT) {
                    history.push({
                        role: 'user',
                        content: '[System] You have used ' + iteration + ' of ' + MAX_ITERATIONS +
                            ' iterations. Wrap up now: deliver your final answer or call attempt_completion.',
                    });
                }

                // FEAT-24-08 / ADR-114 Steering-Hook: drain any user-typed
                // mid-run messages and prepend them to the next assistant
                // turn. Order is preserved (one history entry per queued
                // message). Cache is invalidated because the volatile tail
                // changed (stable prefix is unaffected per ADR-62). The
                // iteration index is passed to the callback so the UI can
                // flip the steering bubble from "queued" to "delivered at
                // iteration N".
                const steering = this.taskCallbacks.consumeSteeringMessages?.(iteration) ?? [];
                if (steering.length > 0) {
                    for (const msg of steering) {
                        history.push({ role: 'user', content: msg });
                    }
                    cacheInvalidated = true;
                }

                // EPIC-26 / FEAT-26-01 / ADR-120: re-render when the
                // mistakes counter crosses the reminder threshold. The
                // section lives below the cache marker so the stable
                // prefix stays cached even on transitions.
                const reminderShouldBeActive = consecutiveMistakes >= 2;
                if (reminderShouldBeActive !== lastReminderState) {
                    cacheInvalidated = true;
                    lastReminderState = reminderShouldBeActive;
                }

                // Rebuild system prompt + tool list when mode or tool availability changed
                if (activeMode.slug !== cachedPromptMode || cacheInvalidated) {
                    rebuildPromptCache();
                }
                const systemPrompt = cachedSystemPrompt;
                const tools = cachedTools;

                // ADR-061: Todo list as recency anchor — append to last user message.
                // Manus pattern: task plan at the end maximizes recency bias, prevents goal drift.
                // We temporarily extend the last user message content (not push+splice, which
                // would violate append-only and invalidate KV-cache).
                let todoOriginalContent: string | ContentBlock[] | undefined;
                if (currentTodoText && iteration > 0) {
                    for (let h = history.length - 1; h >= 0; h--) {
                        if (history[h].role === 'user' && typeof history[h].content === 'string') {
                            todoOriginalContent = history[h].content;
                            history[h] = { ...history[h], content: `${history[h].content as string}\n\n${currentTodoText}` };
                            break;
                        }
                    }
                }

                const toolUses: ContentBlock[] = [];
                const textParts: string[] = [];
                // FIX-04-03-07: persist reasoning text only when the provider
                // marks it for passback (currently the OpenAI-compatible provider
                // for DeepSeek deepseek-reasoner). Anthropic / Bedrock thinking
                // chunks lack signatures so they must not round-trip — they go
                // to onThinking for display only.
                const thinkingParts: string[] = [];
                // id -> actionable error message (from the provider). Kept as a Map
                // so the model receives the real "split the write / don't double-emit"
                // guidance as the tool_result, not a generic "retry with valid JSON".
                const toolErrors = new Map<string, string>();

                // Stream the LLM response (pass abort signal for cancellation)
                // BUG-017: drop orphan tool_use / tool_result blocks before send.
                // Anthropic returns 400 if any tool_use has no matching tool_result
                // and Claude-via-Copilot inherits the same constraint.
                const safeHistory = sanitizeAndLog(history, 'main-loop');
                logInputBreakdown('main-loop', systemPrompt, safeHistory, tools);
                for await (const chunk of this.api.createMessage(systemPrompt, safeHistory, tools, abortSignal)) {
                    if (chunk.type === 'thinking') {
                        this.taskCallbacks.onThinking?.(chunk.text);
                        if (chunk.requiresPassback) thinkingParts.push(chunk.text);
                    } else if (chunk.type === 'text') {
                        hasStreamedText = true;
                        textParts.push(chunk.text);
                        this.taskCallbacks.onText(chunk.text);
                    } else if (chunk.type === 'tool_use') {
                        toolUses.push({
                            type: 'tool_use',
                            id: chunk.id,
                            name: chunk.name,
                            input: chunk.input,
                        });
                        // Notify UI that a tool is starting
                        this.taskCallbacks.onToolStart(chunk.name, chunk.input);
                    } else if (chunk.type === 'tool_error') {
                        // BUG-3 / BUG-032: unparseable or truncated tool JSON — record
                        // in history, skip execution, and count it as a mistake so a
                        // repeated broken write trips consecutiveMistakeLimit instead
                        // of looping until the context overflows.
                        toolErrors.set(chunk.id, chunk.error);
                        toolUses.push({ type: 'tool_use', id: chunk.id, name: chunk.name, input: {} });
                        this.taskCallbacks.onToolStart(chunk.name, {});
                        this.taskCallbacks.onToolResult(chunk.name, chunk.error, true);
                        consecutiveMistakes++;
                        totalToolErrors++;
                    } else if (chunk.type === 'usage') {
                        // Feature 6: Accumulate tokens across all agentic iterations
                        totalInputTokens += chunk.inputTokens;
                        totalOutputTokens += chunk.outputTokens;
                        totalCacheReadTokens += chunk.cacheReadTokens ?? 0;
                        totalCacheCreationTokens += chunk.cacheCreationTokens ?? 0;
                    }
                }

                // Restore the original user message content (remove todo anchor)
                if (todoOriginalContent !== undefined) {
                    for (let h = history.length - 1; h >= 0; h--) {
                        if (history[h].role === 'user' && typeof history[h].content === 'string'
                            && (history[h].content as string).endsWith(currentTodoText)) {
                            history[h] = { ...history[h], content: todoOriginalContent };
                            break;
                        }
                    }
                }

                // Build the assistant message content. Thinking first (mirrors
                // the order the model produced: CoT before answer/tool), then
                // visible text, then tool_use blocks.
                //
                // AUDIT-037 L-1: the wire-side MAX_REASONING_CONTENT_CHARS cap
                // only trims what is RE-SENT to the API. Without a turn-side
                // cap the assistant history grew linearly with reasoning depth
                // until condensing kicked in at 70%. Cap each turn at
                // PER_TURN_THINKING_CAP characters so a max-effort session
                // does not stall on RAM long before condensing reacts.
                const assistantContent: ContentBlock[] = [];
                if (thinkingParts.length > 0) {
                    const joined = thinkingParts.join('');
                    const PER_TURN_THINKING_CAP = 50_000;
                    const capped = joined.length > PER_TURN_THINKING_CAP
                        ? joined.slice(0, PER_TURN_THINKING_CAP)
                            + `\n[thinking truncated: ${joined.length - PER_TURN_THINKING_CAP} chars dropped to keep history bounded]`
                        : joined;
                    assistantContent.push({ type: 'thinking', text: capped });
                }
                if (textParts.length > 0) {
                    assistantContent.push({ type: 'text', text: textParts.join('') });
                }
                assistantContent.push(...toolUses);
                history.push({ role: 'assistant', content: assistantContent });

                // If no tool calls, the LLM is done — run condensing on text-only turns
                if (toolUses.length === 0) {
                    // Safety net: if tools ran but model produced no visible response, retry once
                    if (iteration > 0 && textParts.length === 0 && !hasRetriedEmpty) {
                        hasRetriedEmpty = true;
                        history.push({
                            role: 'user',
                            content: '[System] You executed tools but produced no visible response. '
                                + 'You MUST respond to the user. Explain what you did, what happened, '
                                + 'and suggest next steps. If a plugin command opens a dialog, '
                                + 'tell the user what to do in the dialog.',
                        });
                        continue;
                    }
                    // FEAT-24-02: prune old tool_result contents before the task ends
                    // so the persisted conversation does not carry verbatim bulk.
                    this.microcompact(history);
                    if (iteration > 0 && this.condensingEnabled) {
                        const estimatedTokens = this.estimateTokens(history);
                        const contextWindow = this.getModelContextWindow();
                        const threshold = Math.floor(contextWindow * (this.condensingThreshold / 100));
                        if (estimatedTokens > threshold) {
                            // Pre-Compaction Memory Flush (Phase 5): extract important
                            // facts before they are compressed into a summary
                            await this.taskCallbacks.onPreCompactionFlush?.(history).catch((e) =>
                                console.warn('[AgentTask] Pre-compaction flush failed (non-fatal):', e)
                            );
                            await this.condenseHistory(history, systemPrompt, abortSignal, repetitionDetector.getLedger());
                            // onContextCondensed is called inside condenseHistory with token counts

                            // Validierung: Falls immer noch über Threshold, zweite Runde
                            let condensingRetries = 0;
                            const MAX_CONDENSING_RETRIES = 2;

                            while (condensingRetries < MAX_CONDENSING_RETRIES) {
                                const postTokens = this.estimateTokens(history);
                                if (postTokens <= threshold) break;

                                console.warn(
                                    `[AgentTask] Still over threshold after condensing (${postTokens} > ${threshold}). ` +
                                    `Retry ${condensingRetries + 1}/${MAX_CONDENSING_RETRIES}`
                                );

                                await this.condenseHistory(history, systemPrompt, abortSignal, repetitionDetector.getLedger());
                                // onContextCondensed is called inside condenseHistory with token counts
                                condensingRetries++;
                            }

                            if (condensingRetries > 0) {
                                console.debug(`[AgentTask] Required ${condensingRetries + 1} condensing passes to stay under threshold`);
                            }

                            // Condensing is housekeeping for future messages — the model
                            // already delivered its text answer, so we're done.
                            break;
                        }
                    }
                    break;  // Only break if NO condensing was needed
                }

                const validToolUses = toolUses.filter(
                    (t): t is ContentBlock & { type: 'tool_use' } =>
                        t.type === 'tool_use' && !toolErrors.has(t.id)
                );

                // Helper: extract display text from a tool result (string or multimodal array).
                // Used for UI callbacks that only accept strings.
                const extractTextContent = (content: string | ToolResultContentBlock[]): string => {
                    if (typeof content === 'string') return content;
                    return content
                        .filter((b): b is ToolResultContentBlock & { type: 'text' } => b.type === 'text')
                        .map((b) => b.text)
                        .join('\n');
                };

                // Helper: append a quality gate string to tool result content.
                const appendQualityGate = (
                    content: string | ToolResultContentBlock[],
                    gate: string | undefined,
                ): string | ToolResultContentBlock[] => {
                    if (!gate) return content;
                    if (typeof content === 'string') return content + '\n\n' + gate;
                    // For multimodal content, append gate as an additional text block
                    return [...content, { type: 'text' as const, text: '\n\n' + gate }];
                };

                // Helper: run a single tool through the pipeline and return its result.
                // Does NOT call onToolResult — caller is responsible for ordering.
                const runTool = async (toolUse: ContentBlock & { type: 'tool_use' }) => {
                    // Detect repetitive tool loops before execution (recoverable — no signalCompletion)
                    const repCheck = repetitionDetector.check(toolUse.name, toolUse.input);
                    if (repCheck.blocked) {
                        return { content: `<error>${repCheck.reason}</error>`, is_error: true as const };
                    }
                    // FIX-24-06-01: deferred-tool execution guard. The schema-side
                    // filter (rebuildPromptCache) hides deferred tools from the
                    // model. Without this guard, the model can still call them by
                    // hallucinating the name from training data or recipe text,
                    // and the call would run without schema-guided arguments,
                    // wasting budget on wrong-path retries.
                    if (isDeferredTool(toolUse.name) && !activatedDeferredTools.has(toolUse.name)) {
                        const msg =
                            `Tool "${toolUse.name}" is deferred and must be activated before use. ` +
                            `Call find_tool({ query: "<what you want to do>" }) first to discover and activate it.`;
                        return { content: `<error>${msg}</error>`, is_error: true as const };
                    }
                    const toolCallbacks: ToolCallbacks = {
                        pushToolResult: (content) => {
                            // Final result also updates the live progress display.
                            if (typeof content === 'string') {
                                this.taskCallbacks.onToolProgress?.(toolUse.name, content);
                            }
                        },
                        pushProgress: (content) => {
                            // Intermediate progress: UI-only, not in conversation history.
                            this.taskCallbacks.onToolProgress?.(toolUse.name, content);
                        },
                        handleError: (toolName, error) => {
                            console.error(`[AgentTask] Tool error in ${toolName}:`, error);
                        },
                        log: (message) => { console.debug(`[AgentTask] ${message}`); },
                    };
                    const toolCall: ToolUse = {
                        type: 'tool_use',
                        id: toolUse.id,
                        name: toolUse.name as ToolName,
                        input: toolUse.input,
                    };
                    const result = await pipeline.executeTool(toolCall, toolCallbacks, {
                        abortSignal,
                        askQuestion,
                        signalCompletion,
                        switchMode,
                        // Depth-guard: only wire spawnSubtask if this child is allowed to spawn
                        spawnSubtask: childCanSpawn ? spawnSubtask : undefined,
                        // FEAT-29-10: composability stack shared across the chain.
                        compositionStack: this.compositionStack,
                        consumeAdvisorSlot,
                        onApprovalRequired: this.taskCallbacks.onApprovalRequired,
                        updateTodos: this.taskCallbacks.onTodoUpdate,
                        onCheckpoint: this.taskCallbacks.onCheckpoint,
                        invalidateToolCache,
                        activateDeferredTool,
                        conversationId,
                        readFiles,
                    });
                    // Record successful calls in the ledger (for condensing preservation)
                    if (!result.is_error) {
                        repetitionDetector.record(
                            toolUse.name,
                            toolUse.input,
                            extractTextContent(result.content).slice(0, 200),
                            iteration,
                        );
                    }
                    // EPIC-26 / FEAT-26-06: flip plugin-skills lean -> full
                    // the first time a skill-group tool is invoked in this
                    // task. The next rebuildPromptCache picks up the change.
                    if (!recentPluginSkillUsage && SKILL_GROUP_TOOLS.has(toolUse.name)) {
                        recentPluginSkillUsage = true;
                        cacheInvalidated = true;
                    }
                    return result;
                };

                const allParallelSafe = validToolUses.length > 1
                    && validToolUses.every(t => PARALLEL_SAFE.has(t.name));

                const toolResultBlocks: ContentBlock[] = [];

                // BUG-3 / BUG-032: error results for tools with unparseable/truncated
                // JSON input — forward the provider's actionable message verbatim so
                // the model knows to split the write instead of retrying it.
                for (const [errId, errMsg] of toolErrors) {
                    toolResultBlocks.push({
                        type: 'tool_result',
                        tool_use_id: errId,
                        content: errMsg,
                        is_error: true,
                    });
                }

                if (allParallelSafe) {
                    // Execute all read tools in parallel; collect results in original order.
                    // onToolResult is called sequentially after all finish so the FIFO
                    // queue in AgentSidebarView assigns results to the correct UI elements.
                    const results = await Promise.all(validToolUses.map(runTool));

                    for (let i = 0; i < validToolUses.length; i++) {
                        const toolUse = validToolUses[i];
                        const result = results[i];

                        this.taskCallbacks.onToolResult(toolUse.name, extractTextContent(result.content), result.is_error ?? false);

                        if (result.is_error) { consecutiveMistakes++; totalToolErrors++; } else { consecutiveMistakes = 0; }
                        // v2.10.0 TaskRouter: escalate to main model after 2 errors
                        if (consecutiveMistakes >= 2) escalateToMain();
                        if (this.consecutiveMistakeLimit > 0 && consecutiveMistakes >= this.consecutiveMistakeLimit) {
                            throw new Error(
                                `Agent stopped after ${consecutiveMistakes} consecutive errors. ` +
                                `Check the tool results above or raise the limit in Settings → Advanced.`,
                            );
                        }

                        // Append quality gate checklist to LLM history (not UI)
                        const gate = !result.is_error ? QUALITY_GATES[toolUse.name] : undefined;
                        toolResultBlocks.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: appendQualityGate(result.content, gate),
                            is_error: result.is_error,
                        });
                    }
                } else {
                    // Sequential execution: required for writes, control-flow, and mixed batches.
                    for (const toolUse of validToolUses) {
                        const result = await runTool(toolUse);

                        this.taskCallbacks.onToolResult(toolUse.name, extractTextContent(result.content), result.is_error ?? false);

                        if (result.is_error) { consecutiveMistakes++; totalToolErrors++; } else { consecutiveMistakes = 0; }
                        // v2.10.0 TaskRouter: escalate to main model after 2 errors
                        if (consecutiveMistakes >= 2) escalateToMain();
                        if (this.consecutiveMistakeLimit > 0 && consecutiveMistakes >= this.consecutiveMistakeLimit) {
                            throw new Error(
                                `Agent stopped after ${consecutiveMistakes} consecutive errors. ` +
                                `Check the tool results above or raise the limit in Settings → Advanced.`,
                            );
                        }

                        // Append quality gate checklist to LLM history (not UI)
                        const gate = !result.is_error ? QUALITY_GATES[toolUse.name] : undefined;
                        toolResultBlocks.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: appendQualityGate(result.content, gate),
                            is_error: result.is_error,
                        });

                        if (completionResult !== null) break;
                    }
                }

                // Add tool results as the next user message
                // IMPORTANT: condensing runs AFTER this push so history is always consistent
                // (every assistant tool_call has a matching tool_result before condensing)
                history.push({ role: 'user', content: toolResultBlocks });

                // Circuit breaker for malformed/truncated tool calls. The result
                // loops above only check the limit for tools that actually ran; a
                // turn whose only output was a broken tool call (the classic
                // "write_file cut off mid-JSON" loop) never reaches that check, so
                // do it here. consecutiveMistakes was already bumped per tool_error
                // in the streaming loop; it is reset by the first successful tool.
                if (toolErrors.size > 0 && this.consecutiveMistakeLimit > 0
                    && consecutiveMistakes >= this.consecutiveMistakeLimit) {
                    throw new Error(
                        `Agent stopped after ${consecutiveMistakes} consecutive errors -- the last was a malformed or truncated tool call. `
                        + `The model's tool call kept getting cut off before it finished. `
                        + `Fix: have the model split a large write into write_file (header + first section) then append_to_file for the rest, `
                        + `reduce the attached input, or raise Max output tokens in Settings -> Models.`,
                    );
                }

                // FEAT-24-02 (ADR-12 amendment): prune old tool_result contents to
                // skeletons now that the turn is closed and the history is consistent.
                // Cheap, idempotent, no LLM call — runs before the condensing checks
                // so their token estimate reflects the pruned state.
                this.microcompact(history);

                // Context Condensing: check only after history is fully consistent
                // (assistant tool_calls + tool_results both present, no orphaned calls)
                if (iteration > 0 && this.condensingEnabled && completionResult === null) {
                    const estimatedTokens = this.estimateTokens(history);
                    const contextWindow = this.getModelContextWindow();
                    const threshold = Math.floor(contextWindow * (this.condensingThreshold / 100));
                    if (estimatedTokens > threshold) {
                        // Pre-Compaction Memory Flush (Phase 5)
                        await this.taskCallbacks.onPreCompactionFlush?.(history).catch((e) =>
                            console.warn('[AgentTask] Pre-compaction flush failed (non-fatal):', e)
                        );
                        await this.condenseHistory(history, systemPrompt, abortSignal, repetitionDetector.getLedger());
                        // onContextCondensed is called inside condenseHistory with token counts

                        // Validierung: Falls immer noch über Threshold, zweite Runde
                        let condensingRetries = 0;
                        const MAX_CONDENSING_RETRIES = 2;

                        while (condensingRetries < MAX_CONDENSING_RETRIES) {
                            const postTokens = this.estimateTokens(history);
                            if (postTokens <= threshold) break;

                            console.warn(
                                `[AgentTask] Still over threshold after condensing (${postTokens} > ${threshold}). ` +
                                `Retry ${condensingRetries + 1}/${MAX_CONDENSING_RETRIES}`
                            );

                            await this.condenseHistory(history, systemPrompt, abortSignal, repetitionDetector.getLedger());
                            // onContextCondensed is called inside condenseHistory with token counts
                            condensingRetries++;
                        }

                        if (condensingRetries > 0) {
                            console.debug(`[AgentTask] Required ${condensingRetries + 1} condensing passes to stay under threshold`);
                        }
                    } else {
                        // FEAT-24-02 second stage: earlier, gentler rolling summary.
                        await this.maybeRollingSummary(
                            history, systemPrompt, estimatedTokens, threshold, contextWindow,
                            abortSignal, repetitionDetector.getLedger(),
                        );
                    }
                }

                // Break loop if attempt_completion was signaled.
                // The result field is an internal log entry — NEVER render it
                // when the model already streamed its answer as text (which is
                // the intended flow). Only render as last-resort fallback for
                // models that skip text streaming entirely (e.g. GPT-5-mini).
                if (completionResult !== null) {
                    this.taskCallbacks.onAttemptCompletion?.();
                    if (!hasStreamedText) {
                        const resultText = completionResult as string;
                        if (resultText.trim()) {
                            this.taskCallbacks.onText?.(resultText);
                        }
                    }
                    break;
                }
            }

            // Hard limit recovery: if the loop exhausted iterations while the agent
            // was still working (last message is a tool_result), give it one final
            // text-only API call to deliver a response instead of silently stopping.
            if (completionResult === null && !abortSignal?.aborted) {
                const lastMsg = history[history.length - 1];
                const wasWorking = lastMsg?.role === 'user'
                    && Array.isArray(lastMsg.content)
                    && lastMsg.content.some((b) => b.type === 'tool_result');
                if (wasWorking) {
                    history.push({
                        role: 'user',
                        content: '[System] Iteration limit reached. Deliver your final answer NOW. Do NOT call any tools.',
                    });
                    try {
                        // BUG-017: same orphan-cleanup as the main loop.
                        const safeHistoryHardLimit = sanitizeAndLog(history, 'hard-limit-recovery');
                        logInputBreakdown('hard-limit-recovery', cachedSystemPrompt, safeHistoryHardLimit, []);
                        for await (const chunk of this.api.createMessage(cachedSystemPrompt, safeHistoryHardLimit, [], abortSignal)) {
                            if (chunk.type === 'text') {
                                hasStreamedText = true;
                                this.taskCallbacks.onText(chunk.text);
                            } else if (chunk.type === 'usage') {
                                totalInputTokens += chunk.inputTokens;
                                totalOutputTokens += chunk.outputTokens;
                                totalCacheReadTokens += chunk.cacheReadTokens ?? 0;
                                totalCacheCreationTokens += chunk.cacheCreationTokens ?? 0;
                            }
                        }
                    } catch (e) {
                        console.warn('[AgentTask] Hard limit recovery call failed (non-fatal):', e);
                    }
                }
            }

            // Feature 6: Report total token usage before completing.
            // v2.10.2: pass the model id from the api that actually served
            // this task so TaskMonitor can price the call correctly even
            // when TaskRouter routed it onto the helper model.
            if (totalInputTokens > 0 || totalOutputTokens > 0) {
                this.taskCallbacks.onUsage?.(
                    totalInputTokens,
                    totalOutputTokens,
                    totalCacheReadTokens > 0 ? totalCacheReadTokens : undefined,
                    totalCacheCreationTokens > 0 ? totalCacheCreationTokens : undefined,
                    this.api.getModel().id,
                    // EPIC-26 / FEAT-26-05: cost-log mode-tag at the root-task
                    // boundary. Subtask onUsage already tags advisor/subagent
                    // calls separately; here we mark whether the main loop ran
                    // on the chat-override path or the default tier-resolved path.
                    this.modelOverrideActive ? 'override' : 'auto',
                );
            }

            // FEAT-32-02 PR 2.2 / ADR-133: episode recording moved into the
            // finally block at the end of run() so iteration-cap and error
            // exits also produce an episode (telemetry-complete). The
            // ADR-018 contract (toolSequence + toolLedger) is preserved.

            // ADR-063: Clean up externalized temp files after task completion
            await pipeline.cleanupExternalized();

            // ADR-090 Lever 10: emit telemetry before completing
            this.taskCallbacks.onTaskTelemetry?.({
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                cacheReadTokens: totalCacheReadTokens,
                cacheCreationTokens: totalCacheCreationTokens,
                toolSequence: repetitionDetector.getToolSequence(),
                iterations: telemetryIterations,
                outcome: 'completed',
            });

            // VO/Stigmergy: grade the turn at the normal success-exit.
            // FIX 2026-06-09 (substrate starvation RCA): binary grading.
            // - clean attempt_completion -> accept (full reinforcement).
            // - clean natural exit (model streamed visible text, used at
            //   least one tool, no tool errors, didn't hit the iteration
            //   cap) -> accept. This is the read-only / question shape
            //   the prompt explicitly steers the model into; reaching it
            //   IS a successful turn from the user's POV and worth
            //   reinforcing.
            // - everything else at the success-exit (iteration cap hit,
            //   hard-limit recovery firing) -> abandon. The previous
            //   'iterate' grading triggered loop.iterate() which leaks
            //   the daemon buffer and deposits nothing, so it was a
            //   strictly-worse choice than abandon for our flow.
            const hitIterationCap = telemetryIterations >= MAX_ITERATIONS;
            const productiveToolWork = repetitionDetector.getToolSequence().length > 0;
            cleanNaturalExit =
                completionResult === null
                && hasStreamedText
                && productiveToolWork
                && totalToolErrors === 0
                && consecutiveMistakes === 0
                && !hitIterationCap;
            stigmergyOutcome =
                (completionResult !== null || cleanNaturalExit)
                    ? 'accept'
                    : 'abandon';

            this.taskCallbacks.onComplete();
            return;  // Success — exit the emergency retry loop
        } catch (error) {
            // AbortError is expected when user cancels — not a real error.
            // Also: when the abort signal is already triggered, ANY error
            // (including TypeError: Failed to fetch) is a cancellation side-effect.
            const isAbort = error instanceof Error && error.name === 'AbortError';
            const isAbortedSignal = abortSignal?.aborted === true;
            if (isAbort || isAbortedSignal) {
                console.debug('[AgentTask] Task cancelled by user');
                this.taskCallbacks.onTaskTelemetry?.({
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    cacheReadTokens: totalCacheReadTokens,
                    cacheCreationTokens: totalCacheCreationTokens,
                    toolSequence: repetitionDetector.getToolSequence(),
                    iterations: telemetryIterations,
                    outcome: 'aborted',
                });
                // VO/Stigmergy: abort is negative evidence -- no
                // reinforcement of whatever partial path the agent took.
                stigmergyOutcome = 'abandon';
                this.taskCallbacks.onComplete();
                return;
            }

            // Remove orphaned assistant tool_call messages from history.
            // These arise when an error occurs after the assistant message was pushed
            // but before tool results were added. Leaving them causes OpenAI 400 errors
            // ("assistant message with tool_calls must be followed by tool messages")
            // on the next user message in the same conversation.
            while (history.length > 0) {
                const last = history[history.length - 1];
                const isOrphaned = last.role === 'assistant'
                    && Array.isArray(last.content)
                    && last.content.some((b) => b.type === 'tool_use');
                if (isOrphaned) {
                    history.pop();
                } else {
                    break;
                }
            }

            const err = error instanceof Error ? error : new Error(String(error));

            // Emergency condensing on context overflow (400 "prompt too long" etc.)
            // Instead of failing, condense the history and let the user retry.
            const isContextOverflow =
                /context.?length|too.?long|too.?many.?tokens|max.?tokens|token.?limit|prompt.?too|content.?size|request.?too.?large/i
                    .test(err.message);
            if (isContextOverflow && history.length >= 7 && !emergencyRetried) {
                console.warn('[AgentTask] Context overflow detected — attempting emergency condensing');
                try {
                    // 6B: Pre-compaction memory flush before emergency condensing
                    await this.taskCallbacks.onPreCompactionFlush?.(history).catch((e) =>
                        console.warn('[AgentTask] Pre-compaction flush failed (non-fatal):', e)
                    );
                    await this.condenseHistory(history, cachedSystemPrompt, abortSignal);
                    // onContextCondensed is called inside condenseHistory with token counts
                    emergencyRetried = true;
                    console.debug('[AgentTask] Emergency condensing succeeded — retrying agent loop');
                    continue;  // 6A: Retry the agent loop with condensed history
                } catch {
                    // Condensing itself failed — fall through to normal error handling
                    console.warn('[AgentTask] Emergency condensing failed');
                }
            }

            // Rate limit retry: auto-retry on 429 with exponential backoff
            const isRateLimit = /rate.?limit|429/i.test(err.message);
            if (isRateLimit && rateLimitRetries < RATE_LIMIT_MAX_RETRIES) {
                rateLimitRetries++;
                const waitMs = RATE_LIMIT_BASE_WAIT_MS * Math.pow(2, rateLimitRetries - 1);
                const waitSec = Math.round(waitMs / 1000);
                console.warn(`[AgentTask] Rate limit hit — retry ${rateLimitRetries}/${RATE_LIMIT_MAX_RETRIES} in ${waitSec}s`);
                this.taskCallbacks.onText(`\n\n*Rate limit reached -- automatically retrying in ${waitSec} seconds (${rateLimitRetries}/${RATE_LIMIT_MAX_RETRIES})...*\n\n`);
                await new Promise<void>((r) => window.setTimeout(r, waitMs));
                // Check if cancelled during wait
                if (abortSignal?.aborted) {
                    console.debug('[AgentTask] Abort signal detected during rate limit wait');
                    this.taskCallbacks.onComplete();
                    return;
                }
                continue;  // Retry the agent loop
            }

            // ADR-090 Lever 10: telemetry for error outcomes too
            this.taskCallbacks.onTaskTelemetry?.({
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                cacheReadTokens: totalCacheReadTokens,
                cacheCreationTokens: totalCacheCreationTokens,
                toolSequence: repetitionDetector.getToolSequence(),
                iterations: telemetryIterations,
                outcome: 'error',
                errorMessage: err.message,
            });

            // Network errors (e.g. "Failed to fetch") get a friendlier message
            const isNetworkError = err instanceof TypeError
                && /failed to fetch|network|econnrefused/i.test(err.message);
            if (isNetworkError) {
                console.warn('[AgentTask] Network error:', err.message);
                this.taskCallbacks.onError(new Error(
                    'Connection to the API failed. Check your network and API key, then try again.',
                ));
            } else {
                console.error('[AgentTask] Task failed:', err);
                this.taskCallbacks.onError(err);
            }
            // VO/Stigmergy: thrown error (parse failure, circuit-breaker
            // trip from consecutive tool errors, API/network failure after
            // retries) is negative evidence -- no reinforcement.
            stigmergyOutcome = 'abandon';
            return;  // Error — exit the emergency retry loop
        }
        } // while (true) — emergency condensing retry loop
        } finally {
            // VO/Stigmergy: outcome-graded resolution. Binary: accept or
            // abandon. The default is 'abandon' so any unexpected exit
            // path (e.g. a future return someone forgets to grade) lands
            // on the safe side: no reinforcement of an unverified path.
            // accept and abandon are first-resolver-wins inside the
            // adapter, so re-entry is safe. `end()` is always called --
            // it just marks the turn as delivered; the resolution decides
            // what actually happens to the substrate.
            // FIX 2026-06-09: 'iterate' was previously a third option
            // but the upstream loop SDK uses iterate() to CANCEL the
            // auto-accept timer AND leak the response buffer with zero
            // deposits. With the prompt forbidding attempt_completion
            // for read-only tasks, every clean read-only turn ended on
            // iterate -> substrate accumulated zero edges -> no pin
            // could ever form. The grading is now binary.
            await stigmergyTurn.end();
            if (stigmergyOutcome === 'accept') {
                await stigmergyTurn.accept(totalInputTokens + totalOutputTokens);
            } else {
                await stigmergyTurn.abandon();
            }

            // FEAT-32-02 PR 2.2 / ADR-133: episode recording (single source
            // of truth for the episode payload). Fires for every exit path
            // -- success, iteration-cap, abort, error -- so RecipePromotion
            // sees the complete picture. `success` is derived from the
            // already-graded stigmergyOutcome plus the closure counters.
            try {
                const toolSeq = repetitionDetector.getToolSequence();
                if (toolSeq.length > 0) {
                    // FIX 2026-06-09 (Stigmergy substrate starvation RCA):
                    // mirror the grading relaxation so RecipePromotion
                    // (ADR-058 Gate 3 organic 3-similar) is no longer
                    // starved on the read-only / question task shape that
                    // the prompt explicitly steers into. A clean natural
                    // exit counts as success for episode-recording too,
                    // not just an explicit attempt_completion.
                    const episodeSuccess =
                        stigmergyOutcome === 'accept'
                        && totalToolErrors === 0
                        && (attemptCompletionFired || cleanNaturalExit);
                    this.taskCallbacks.onEpisodeData?.({
                        toolSequence: toolSeq,
                        toolLedger: repetitionDetector.getLedger(),
                        success: episodeSuccess,
                        mistakesEncountered: totalToolErrors,
                        attemptCompletionFired,
                        fastPathFired,
                        stigmergy: stigmergyDecisionSnapshot,
                    });
                }
            } catch (e) {
                console.warn('[AgentTask] onEpisodeData hook failed (non-fatal):', e);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Context Condensing helpers
    // -------------------------------------------------------------------------

    /**
     * Improved token estimate that accounts for structured content blocks.
     * ~4 chars/token for text, +150 for tool_use overhead, +50 for tool_result overhead.
     */
    private estimateTokens(messages: MessageParam[]): number {
        let count = 0;
        for (const m of messages) {
            if (Array.isArray(m.content)) {
                for (const block of m.content) {
                    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
                        count += Math.ceil(block.text.length / 4);
                    } else if (block.type === 'thinking' && 'text' in block && typeof block.text === 'string') {
                        // FIX-04-03-07: thinking persists on assistant messages
                        // for DeepSeek reasoner round-trip. Counted at chars/4
                        // so condensing fires on time when reasoning accumulates.
                        count += Math.ceil(block.text.length / 4);
                    } else if (block.type === 'tool_use') {
                        // tool_use overhead: id, name, type fields ~150 tokens
                        count += 150;
                        // input JSON payload
                        if ('input' in block && block.input) {
                            count += Math.ceil(JSON.stringify(block.input).length / 4);
                        }
                    } else if (block.type === 'tool_result') {
                        // tool_result overhead: tool_use_id, type, is_error ~50 tokens
                        count += 50;
                        // content payload — string or multimodal array
                        if ('content' in block) {
                            if (typeof block.content === 'string') {
                                count += Math.ceil(block.content.length / 4);
                            } else if (Array.isArray(block.content)) {
                                for (const sub of block.content) {
                                    if (sub.type === 'text') count += Math.ceil(sub.text.length / 4);
                                    else if (sub.type === 'image') count += 1000;
                                }
                            }
                        }
                    } else if (block.type === 'image') {
                        // Image tokens (flat estimate)
                        count += 1000;
                    }
                }
            } else if (typeof m.content === 'string') {
                count += Math.ceil(m.content.length / 4);
            }
        }
        return count;
    }

    /** Approximate context window for the active model (tokens). */
    private getModelContextWindow(): number {
        const model = this.api.getModel();
        // getModel() returns { id: string; info: ModelInfo } — extract the id string
        const modelId: string = typeof model === 'string' ? model : (model?.id ?? '');
        // Use the provider-reported context window when available
        if (model?.info?.contextWindow) return model.info.contextWindow;
        if (modelId.includes('claude')) return 200_000;
        if (modelId.includes('gpt-4') || modelId.includes('gpt-5')) return 128_000;
        return 128_000;
    }

    /**
     * Condense history in-place using a separate LLM summarization call.
     * Keeps the first message (original task) + last 4 messages intact;
     * replaces everything in between with a single summary block.
     */
    private async condenseHistory(
        history: MessageParam[],
        systemPrompt: string,
        abortSignal?: AbortSignal,
        toolCallLedger?: string,
    ): Promise<void> {
        // Need at least first + 4 tail + some middle to condense
        if (history.length < 7) return;

        const firstMsg = history[0];

        // Smart tail: collect messages from end until 10k tokens or min 2 messages.
        // IMPORTANT: We must never split a tool_use / tool_result pair across the
        // condensing boundary — Anthropic requires every tool_use block to be
        // immediately followed by a tool_result in the next message.
        const MAX_TAIL_TOKENS = 10_000;
        const MIN_TAIL_MESSAGES = 2;
        const tail: MessageParam[] = [];
        let tailTokens = 0;

        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            const msgTokens = this.estimateTokens([msg]);

            if (tail.length >= MIN_TAIL_MESSAGES && tailTokens + msgTokens > MAX_TAIL_TOKENS) {
                break;
            }

            tail.unshift(msg);  // Prepend to maintain order
            tailTokens += msgTokens;
        }

        // Guarantee min 2 messages (last user+assistant pair)
        if (tail.length < MIN_TAIL_MESSAGES && history.length >= MIN_TAIL_MESSAGES) {
            const fallbackTail = history.slice(-MIN_TAIL_MESSAGES);
            tail.splice(0, tail.length, ...fallbackTail);
        }

        // Fix tool_use / tool_result boundary: Anthropic requires every assistant
        // tool_use block to be immediately followed by a user tool_result message.
        // The tail boundary must never split such a pair. We also need to ensure
        // that toSummarize (sent to the condensing API) doesn't end with an
        // orphaned tool_use or tool_result.
        const tailStartIdx = history.length - tail.length;
        if (tailStartIdx > 0 && tail.length > 0) {
            const firstTailMsg = tail[0];
            const contentArr = Array.isArray(firstTailMsg.content) ? firstTailMsg.content : [];

            if (firstTailMsg.role === 'user'
                && contentArr.some((b: ContentBlock) => b.type === 'tool_result')) {
                // Case 1: Tail starts with tool_result — pull preceding assistant(tool_use) in
                const prevMsg = history[tailStartIdx - 1];
                tail.unshift(prevMsg);
                tailTokens += this.estimateTokens([prevMsg]);
            }
        }

        // After adjusting for Case 1, recompute the split point
        const toSummarize = history.slice(0, history.length - tail.length);

        // Case 2: toSummarize ends with assistant(tool_use) — the condensing API
        // call would receive tool_use without tool_result, causing a 400 error.
        // Move the trailing tool_use assistant + its tool_result user into the tail.
        while (toSummarize.length > 1) {
            const lastSumMsg = toSummarize[toSummarize.length - 1];
            const lastContent = Array.isArray(lastSumMsg.content) ? lastSumMsg.content : [];
            const endsWithToolUse = lastSumMsg.role === 'assistant'
                && lastContent.some((b: ContentBlock) => b.type === 'tool_use');

            if (!endsWithToolUse) break;

            // Move the assistant(tool_use) and its following user(tool_result) to the tail
            const moved = toSummarize.splice(-1, 1);
            tail.unshift(...moved);
            // If tail now starts with assistant(tool_use), the tool_result should
            // already be the next element in the original tail — no further action needed.

            // Re-check: the new last element might also be a user(tool_result) whose
            // assistant(tool_use) was already moved, creating another orphan. Loop handles this.
        }

        // Case 3: toSummarize ends with user(tool_result) — the condensing API
        // would have tool_result without the preceding tool_use, causing a 400.
        while (toSummarize.length > 1) {
            const lastSumMsg = toSummarize[toSummarize.length - 1];
            const lastContent = Array.isArray(lastSumMsg.content) ? lastSumMsg.content : [];
            const endsWithToolResult = lastSumMsg.role === 'user'
                && lastContent.some((b: ContentBlock) => b.type === 'tool_result');

            if (!endsWithToolResult) break;

            // Move this tool_result and the preceding assistant(tool_use) to the tail
            const movedResult = toSummarize.splice(-1, 1);
            tail.unshift(...movedResult);
            // Also move the preceding assistant message (should contain tool_use)
            if (toSummarize.length > 1) {
                const movedAssistant = toSummarize.splice(-1, 1);
                tail.unshift(...movedAssistant);
            }
        }

        // After boundary adjustments, toSummarize might be too small to condense
        if (toSummarize.length < 3) {
            console.debug('[AgentTask] toSummarize too small after boundary fix — skipping condensing');
            return;
        }

        // Pre-condensing logging
        const preMessageCount = history.length;
        const preTokens = this.estimateTokens(history);
        console.debug(
            `[AgentTask] Context condensing triggered:\n` +
            `  Messages: ${preMessageCount}\n` +
            `  Estimated tokens: ${preTokens}\n` +
            `  Threshold: ${Math.floor(this.getModelContextWindow() * (this.condensingThreshold / 100))} (${this.condensingThreshold}%)`
        );

        const condensingInstruction =
            'Summarize this conversation compactly. Preserve:\n' +
            '- The original task and goal\n' +
            '- Key decisions made\n' +
            '- Files read, created, or modified (include exact paths)\n' +
            '- Important findings, code snippets, or facts discovered\n' +
            '- ALL tool calls that were executed and their outcomes\n' +
            '- Search queries performed and their result summaries\n' +
            '- Errors encountered and how they were resolved\n\n' +
            (toolCallLedger ? toolCallLedger + '\n\n' : '') +
            'IMPORTANT: After condensing, the agent MUST NOT repeat tool calls listed above.\n\n' +
            'Output only the summary — no preamble or meta-commentary.';

        // Build the message list for the condensing API call.
        // Ensure proper role alternation: if toSummarize ends with a user message,
        // merge the condensing instruction into it instead of appending a second user message.
        const condensingMessages = [...toSummarize];
        const lastMsg = condensingMessages[condensingMessages.length - 1];
        if (lastMsg.role === 'user') {
            // Merge: append instruction to existing user message
            const existingContent = typeof lastMsg.content === 'string'
                ? lastMsg.content
                : lastMsg.content.filter(b => b.type === 'text').map(b => 'text' in b ? b.text : '').join('\n');
            condensingMessages[condensingMessages.length - 1] = {
                role: 'user',
                content: existingContent + '\n\n---\n\n' + condensingInstruction,
            };
        } else {
            // toSummarize ends with assistant — safe to append a user message
            condensingMessages.push({ role: 'user', content: condensingInstruction });
        }

        let summary = '';
        try {
            // BUG-017: condensing has its own pairing-fix higher up, but apply
            // the generic sanitize as well so any new edge case is caught.
            const safeCondensingMessages = sanitizeAndLog(condensingMessages, 'condensing');
            logInputBreakdown('condensing', systemPrompt, safeCondensingMessages, []);
            // FEAT-24-07 / ADR-115: route condensing through the optional helper model.
            const condensingApi = getHelperApi(this.toolRegistry.plugin, this.api);
            for await (const chunk of condensingApi.createMessage(
                systemPrompt,
                safeCondensingMessages,
                [],
                abortSignal,
            )) {
                if (chunk.type === 'text') summary += chunk.text;
            }
        } catch {
            // Condensing failure is non-fatal — keep history unchanged
            return;
        }

        if (!summary.trim()) return;

        // Splice history in-place
        history.splice(
            0,
            history.length,
            firstMsg,
            {
                role: 'assistant',
                content: [{ type: 'text', text: `[Conversation Summary]\n\n${summary.trim()}` }],
            },
            {
                role: 'user',
                content: '[Context condensed to save space. Continue the task from here.]',
            },
            ...tail,
        );

        // Post-condensing logging
        const postMessageCount = history.length;
        const postTokens = this.estimateTokens(history);
        const contextWindow = this.getModelContextWindow();
        const threshold = Math.floor(contextWindow * (this.condensingThreshold / 100));
        const percentUsed = contextWindow > 0 ? Math.round((postTokens / contextWindow) * 100) : 0;

        console.debug(
            `[AgentTask] Context condensed:\n` +
            `  Before: ${preMessageCount} msgs, ~${preTokens} tokens\n` +
            `  After:  ${postMessageCount} msgs, ~${postTokens} tokens\n` +
            `  Saved:  ~${preTokens - postTokens} tokens (${Math.round(((preTokens - postTokens) / preTokens) * 100)}%)\n` +
            `  Threshold: ${threshold} tokens (${this.condensingThreshold}%)\n` +
            `  Status: ${percentUsed}% of context window used`
        );

        // Notify callback with token counts
        this.taskCallbacks.onContextCondensed?.(preTokens, postTokens);
    }

    /** Resolve a mode slug or ModeConfig to a ModeConfig */
    private resolveMode(mode: string | ModeConfig): ModeConfig {
        if (typeof mode !== 'string') return mode;

        if (this.modeService) {
            return this.modeService.getMode(mode) ?? this.modeService.getActiveMode();
        }

        // Fallback: use builtinModes directly
        return BUILT_IN_MODES.find((m: ModeConfig) => m.slug === mode)
            ?? BUILT_IN_MODES[0];
    }
}
