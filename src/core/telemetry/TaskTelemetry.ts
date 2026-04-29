/**
 * TaskTelemetry -- Per-task token, cost, and tool-sequence logger (ADR-090, Lever 10)
 *
 * Records what the agent did for each task: prompt, iterations, tools used,
 * tokens consumed, EUR cost, outcome. Persists to a single JSON-lines file
 * so we can compare before/after when iterating on prompt heuristics.
 *
 * Storage: <vault>/.obsidian-agent/telemetry/tasks.jsonl
 * Append-only. Truncates to last N entries on each plugin start.
 */

import { computeCost, formatEur } from '../pricing/ModelPricing';
import type { FileAdapter } from '../storage/types';

const TELEMETRY_DIR = '.obsidian-agent/telemetry';
const TELEMETRY_FILE = `${TELEMETRY_DIR}/tasks.jsonl`;
const MAX_ENTRIES = 1000;

export interface TaskTelemetryEntry {
    /** ISO timestamp when the task started */
    startedAt: string;
    /** Wall-clock duration in milliseconds */
    durationMs: number;
    /** First 200 chars of the user message (privacy: full message stays in the chat) */
    promptPreview: string;
    /** Model id used */
    modelId: string;
    /** Mode the task ran in (ask, agent, ...) */
    mode: string;
    /** Iterations of the main ReAct loop */
    iterations: number;
    /** Ordered list of tool names called (with sub-agent calls flattened) */
    toolSequence: string[];
    /** Number of sub-agents spawned */
    subAgentCount: number;
    /** Token usage (totals across all iterations + sub-agents) */
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    /** Cost in USD and EUR */
    costUsd: number;
    costEur: number;
    /** "completed" | "aborted" | "error" */
    outcome: 'completed' | 'aborted' | 'error';
    /** Optional error message if outcome=error */
    errorMessage?: string;
}

export class TaskTelemetry {
    private fs: FileAdapter;
    private startedAt = Date.now();
    private toolSequence: string[] = [];
    private subAgentCount = 0;
    private iterations = 0;

    constructor(fs: FileAdapter) {
        this.fs = fs;
    }

    /** Call once per main-loop iteration (after the LLM responds). */
    bumpIteration(): void { this.iterations++; }

    /** Record a tool call. Sub-agent calls log "new_task[:childTool1,childTool2]". */
    recordTool(toolName: string): void {
        this.toolSequence.push(toolName);
        if (toolName === 'new_task') this.subAgentCount++;
    }

    /** Record a complete task at end of run. Best-effort persistence. */
    async record(args: {
        promptPreview: string;
        modelId: string;
        mode: string;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
        outcome: 'completed' | 'aborted' | 'error';
        errorMessage?: string;
    }): Promise<TaskTelemetryEntry> {
        const cost = computeCost(args.modelId, args.inputTokens, args.outputTokens, args.cacheReadTokens, args.cacheCreationTokens);
        const entry: TaskTelemetryEntry = {
            startedAt: new Date(this.startedAt).toISOString(),
            durationMs: Date.now() - this.startedAt,
            promptPreview: args.promptPreview.slice(0, 200),
            modelId: args.modelId,
            mode: args.mode,
            iterations: this.iterations,
            toolSequence: this.toolSequence,
            subAgentCount: this.subAgentCount,
            inputTokens: args.inputTokens,
            outputTokens: args.outputTokens,
            cacheReadTokens: args.cacheReadTokens,
            cacheCreationTokens: args.cacheCreationTokens,
            costUsd: cost.totalUsd,
            costEur: cost.totalEur,
            outcome: args.outcome,
            errorMessage: args.errorMessage,
        };

        try {
            await this.appendJsonLine(entry);
        } catch (e) {
            console.warn('[TaskTelemetry] persist failed (non-fatal):', e);
        }
        return entry;
    }

    private async appendJsonLine(entry: TaskTelemetryEntry): Promise<void> {
        if (!(await this.fs.exists(TELEMETRY_DIR))) {
            await this.fs.mkdir(TELEMETRY_DIR);
        }
        const line = JSON.stringify(entry) + '\n';
        let existing = '';
        if (await this.fs.exists(TELEMETRY_FILE)) {
            existing = await this.fs.read(TELEMETRY_FILE);
            // Truncate to last MAX_ENTRIES-1 lines so we stay bounded
            const lines = existing.split('\n').filter(Boolean);
            if (lines.length >= MAX_ENTRIES) {
                existing = lines.slice(-(MAX_ENTRIES - 1)).join('\n') + '\n';
            }
        }
        await this.fs.write(TELEMETRY_FILE, existing + line);
    }

    /** Read recent entries for the analytics view. */
    static async readRecent(fs: FileAdapter, n: number = 100): Promise<TaskTelemetryEntry[]> {
        if (!(await fs.exists(TELEMETRY_FILE))) return [];
        const raw = await fs.read(TELEMETRY_FILE);
        const lines = raw.split('\n').filter(Boolean).slice(-n);
        const entries: TaskTelemetryEntry[] = [];
        for (const line of lines) {
            try { entries.push(JSON.parse(line) as TaskTelemetryEntry); } catch { /* skip corrupt line */ }
        }
        return entries;
    }
}

/** UI helper: build a one-line cost summary for the footer. */
export function formatTelemetryFooter(args: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costEur: number;
    /** When true, append "(sub)" -- the user pays a flat subscription, this is the would-be API cost. */
    isSubscription?: boolean;
}): string {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let s = `${t}  ·  ${args.inputTokens.toLocaleString()} in · ${args.outputTokens.toLocaleString()} out`;
    if (args.cacheReadTokens > 0) s += ` · ${args.cacheReadTokens.toLocaleString()} cached`;
    s += ` · ${formatEur(args.costEur)}`;
    if (args.isSubscription) s += ' (~ via Sub)';
    return s;
}
