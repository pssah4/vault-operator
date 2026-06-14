import { describe, it, expect, vi } from 'vitest';
import { TokenBudgetGuard, localDateKey, type TokenBudgetState } from '../TokenBudgetGuard';

function makeGuard(initial: TokenBudgetState | null = null, today = '2026-04-28') {
    let state = initial;
    const saveState = vi.fn(async (s: TokenBudgetState) => { state = s; });
    const guard = new TokenBudgetGuard({
        loadState: () => state,
        saveState,
        thresholds: { dailyInputCap: 1000, dailyOutputCap: 200 },
        today: () => today,
    });
    return { guard, get state() { return state; }, saveState };
}

describe('TokenBudgetGuard (PLAN-007 task A.4)', () => {
    it('starts at zero on a fresh day', () => {
        const { guard } = makeGuard();
        expect(guard.snapshot()).toEqual({ day: '2026-04-28', inputTokens: 0, outputTokens: 0 });
    });

    it('record() accumulates tokens', async () => {
        const { guard } = makeGuard();
        await guard.record(100, 30);
        await guard.record(200, 70);
        expect(guard.snapshot()).toEqual({ day: '2026-04-28', inputTokens: 300, outputTokens: 100 });
    });

    it('persists every record via saveState', async () => {
        const { guard, saveState } = makeGuard();
        await guard.record(50, 10);
        expect(saveState).toHaveBeenCalledTimes(1);
        expect(saveState.mock.calls[0][0]).toEqual({
            day: '2026-04-28', inputTokens: 50, outputTokens: 10,
        });
    });

    it('clamps negative tokens to 0', async () => {
        const { guard } = makeGuard();
        await guard.record(-100, -50);
        expect(guard.snapshot()).toEqual({ day: '2026-04-28', inputTokens: 0, outputTokens: 0 });
    });

    it('auto-resets when the day changes', () => {
        const stale: TokenBudgetState = { day: '2026-04-27', inputTokens: 999, outputTokens: 199 };
        const { guard } = makeGuard(stale, '2026-04-28');
        expect(guard.snapshot()).toEqual({ day: '2026-04-28', inputTokens: 0, outputTokens: 0 });
    });

    describe('blockReason / isOverBudget', () => {
        it('blocks when input cap crossed', () => {
            const { guard } = makeGuard({ day: '2026-04-28', inputTokens: 1000, outputTokens: 0 });
            expect(guard.isOverBudget()).toBe(true);
            expect(guard.blockReason()).toMatch(/input cap/);
        });

        it('blocks when output cap crossed', () => {
            const { guard } = makeGuard({ day: '2026-04-28', inputTokens: 0, outputTokens: 200 });
            expect(guard.isOverBudget()).toBe(true);
            expect(guard.blockReason()).toMatch(/output cap/);
        });

        it('does not block under both caps', () => {
            const { guard } = makeGuard({ day: '2026-04-28', inputTokens: 999, outputTokens: 199 });
            expect(guard.isOverBudget()).toBe(false);
            expect(guard.blockReason()).toBeNull();
        });

        it('returns to unblocked the next day (auto-reset wins)', () => {
            const stale: TokenBudgetState = { day: '2026-04-27', inputTokens: 99999, outputTokens: 99999 };
            const { guard } = makeGuard(stale, '2026-04-28');
            expect(guard.blockReason()).toBeNull();
        });
    });

    // FIX-32-03-01: the helper is now exported so ContextComposer can share
    // the same day-key format. Lock the contract down with a few spot checks.
    describe('localDateKey export (FIX-32-03-01)', () => {
        it('returns YYYY-MM-DD for the local-time fields of the given Date', () => {
            // Construct the date from local-time components to dodge the UTC
            // vs local timezone ambiguity of the Date(year, month, day) form.
            const d = new Date(2026, 5, 14); // June (month is 0-indexed) 14, local
            expect(localDateKey(d)).toBe('2026-06-14');
        });

        it('pads single-digit months and days', () => {
            const d = new Date(2026, 0, 3); // January 3
            expect(localDateKey(d)).toBe('2026-01-03');
        });
    });
});
