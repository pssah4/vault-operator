/**
 * AgentTaskRunner -- Sidebar-Independence Entry Point (EPIC-33, ADR-138 Tier 1).
 *
 * Wraps AgentTask's 16-parameter positional constructor in a single
 * options object. The Runner is the canonical entry point for any
 * caller that wants to drive the agent loop, including inline-actions
 * that run without an open chat sidebar.
 *
 * Concept (ADR-138):
 *   const runner = new AgentTaskRunner({ api, toolRegistry, callbacks })
 *   await runner.execute(config)
 *
 * AgentTaskCallbacks is already abstract in AgentTask.ts; this Runner
 * does not duplicate it. The contract is: any object implementing
 * AgentTaskCallbacks (DOM-adapter, headless mock, log-only consumer)
 * is a valid caller, no Obsidian View required.
 *
 * Sidebar today still constructs AgentTask directly (see Spike A
 * inventory in plan-context-epic-33.md). Migrating the sidebar
 * callbacks into a SidebarMessageRenderer is the next refactor step
 * (PR-1.2 in PLAN-42) and is deliberately deferred to its own
 * session because the existing callbacks carry extensive closure
 * captures over view-local mutable state.
 *
 * Architecture-map concept: agent-task-runner
 * Related: ADR-138 (Sidebar-Independence), AgentTask, AgentTaskCallbacks
 */

import { AgentTask, type AgentTaskCallbacks, type AgentTaskRunConfig } from '../AgentTask';
import type { ApiHandler } from '../../api/types';
import type { ToolRegistry } from '../tools/ToolRegistry';
import type { ModeService } from '../modes/ModeService';
import type { CompositionStackService } from '../skills/CompositionStackService';

/**
 * Construction options for the AgentTaskRunner. Mirrors the AgentTask
 * constructor's positional parameters in a structured shape so callers
 * do not have to remember the order of 16 arguments.
 */
export interface AgentTaskRunnerOptions {
    /** LLM provider handler (Anthropic, OpenAI, Bedrock, ...). */
    api: ApiHandler;
    /** Registry of available tools for this run. */
    toolRegistry: ToolRegistry;
    /**
     * Callbacks driving the agent loop. AgentTaskCallbacks is the
     * sidebar-independent contract: any caller providing pure functions
     * over typed inputs can drive the loop, no Obsidian View required.
     */
    callbacks: AgentTaskCallbacks;

    // Optional tuning parameters (defaults mirror AgentTask defaults).

    modeService?: ModeService;
    consecutiveMistakeLimit?: number;
    rateLimitMs?: number;
    condensingEnabled?: boolean;
    condensingThreshold?: number;
    powerSteeringFrequency?: number;
    maxIterations?: number;
    depth?: number;
    maxSubtaskDepth?: number;
    microcompactionEnabled?: boolean;
    rollingSummaryThreshold?: number;
    /**
     * EPIC-26 / FEAT-26-05 / ADR-120: per-turn user override active.
     * When true, the loop runs on an explicitly-chosen chat model
     * and `consult_flagship` is filtered out for this task.
     */
    modelOverrideActive?: boolean;
    /**
     * FEAT-29-10 Composability: shared cycle + depth tracker for
     * invoke_skill / invoke_mcp_server. Spawned subtasks pass the
     * parent's stack so the chain stays visible across hops.
     */
    compositionStack?: CompositionStackService;
}

export class AgentTaskRunner {
    private readonly task: AgentTask;

    constructor(options: AgentTaskRunnerOptions) {
        this.task = new AgentTask(
            options.api,
            options.toolRegistry,
            options.callbacks,
            options.modeService,
            options.consecutiveMistakeLimit ?? 0,
            options.rateLimitMs ?? 0,
            options.condensingEnabled ?? true,
            options.condensingThreshold ?? 70,
            options.powerSteeringFrequency ?? 0,
            options.maxIterations ?? 25,
            options.depth ?? 0,
            options.maxSubtaskDepth ?? 2,
            options.microcompactionEnabled ?? true,
            options.rollingSummaryThreshold ?? 50,
            options.modelOverrideActive ?? false,
            options.compositionStack,
        );
    }

    /**
     * Drive the agent loop. Delegates to AgentTask.run with the
     * provided run config.
     *
     * Sidebar-Independence contract (ADR-138, H-06): this method must
     * complete successfully without any Obsidian workspace view being
     * open. The caller's AgentTaskCallbacks determine where output
     * lands (sidebar DOM, inline editor decorations, log file, ...).
     */
    async execute(config: AgentTaskRunConfig): Promise<void> {
        await this.task.run(config);
    }

    /**
     * Expose the underlying AgentTask for advanced callers (e.g. the
     * sidebar still wires checkpoint observers and abort signals into
     * the task directly). New callers should prefer execute() and the
     * callback surface. This escape hatch will be tightened as the
     * sidebar refactor progresses.
     */
    get underlying(): AgentTask {
        return this.task;
    }
}
