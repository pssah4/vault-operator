import { describe, it, expect, vi } from 'vitest';
import { TokenBudgetGuard, type TokenBudgetState } from '../TokenBudgetGuard';

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
});
