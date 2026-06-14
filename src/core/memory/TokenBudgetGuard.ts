/**
 * TokenBudgetGuard -- daily token-spend safety net for the LLM-driven
 * memory pipeline (Single-Call extraction, atomiser, recall_memory).
 *
 * Counts input + output tokens per local calendar day and short-circuits
 * the next LLM call when either threshold is crossed. Resets at
 * midnight via auto-reset on the first record() of a new day. The
 * persistent state (counts + day key) lives in plugin settings under
 * `memory.tokenBudgetState`; the guard only reads/writes via the
 * injected `loadState` / `saveState` callbacks so tests stay
 * filesystem-free.
 *
 * FEATURE-0318 / PLAN-007 task A.4.
 */

export interface TokenBudgetState {
    /** Local-time `YYYY-MM-DD` key for the current bucket. */
    day: string;
    inputTokens: number;
    outputTokens: number;
}

export interface TokenBudgetThresholds {
    /** Default 1_000_000 input tokens / day. */
    dailyInputCap: number;
    /** Default 200_000 output tokens / day. */
    dailyOutputCap: number;
}

export interface TokenBudgetGuardOptions {
    loadState: () => TokenBudgetState | null;
    saveState: (state: TokenBudgetState) => Promise<void>;
    thresholds: TokenBudgetThresholds;
    /** Test seam for the calendar day. Default: real local-date. */
    today?: () => string;
}

export class TokenBudgetGuard {
    constructor(private readonly opts: TokenBudgetGuardOptions) {}

    /** Returns the live counter, auto-resetting at midnight. */
    snapshot(): TokenBudgetState {
        const today = this.opts.today?.() ?? localDateKey(new Date());
        const stored = this.opts.loadState();
        if (!stored || stored.day !== today) {
            return { day: today, inputTokens: 0, outputTokens: 0 };
        }
        return stored;
    }

    /** Add tokens consumed by a finished call. */
    async record(input: number, output: number): Promise<TokenBudgetState> {
        const next = this.snapshot();
        next.inputTokens += Math.max(0, input);
        next.outputTokens += Math.max(0, output);
        await this.opts.saveState(next);
        return next;
    }

    /** True iff either cap is already crossed. */
    isOverBudget(): boolean {
        const s = this.snapshot();
        return s.inputTokens >= this.opts.thresholds.dailyInputCap
            || s.outputTokens >= this.opts.thresholds.dailyOutputCap;
    }

    /**
     * Hard guard: returns the reason string when blocked, else null.
     * Callers that want to skip an LLM call use:
     *
     *     const blocked = guard.blockReason();
     *     if (blocked) { telemetry.log(...); return; }
     */
    blockReason(): string | null {
        const s = this.snapshot();
        const t = this.opts.thresholds;
        if (s.inputTokens >= t.dailyInputCap) {
            return `daily input cap reached (${s.inputTokens} >= ${t.dailyInputCap})`;
        }
        if (s.outputTokens >= t.dailyOutputCap) {
            return `daily output cap reached (${s.outputTokens} >= ${t.dailyOutputCap})`;
        }
        return null;
    }
}

/**
 * Local-time `YYYY-MM-DD` key for a Date. Exported so other modules
 * (ContextComposer pause-notice, ExtractionQueue health) can share the
 * exact same day-key format the budget guard uses internally.
 */
export function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
