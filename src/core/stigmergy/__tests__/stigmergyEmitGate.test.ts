import { describe, it, expect, vi } from 'vitest';
import {
    shouldEmitToStigmergy,
    emitStigmergyInvoked,
    emitStigmergyReturned,
} from '../stigmergyEmitGate';
import type { StigmergyTurn } from '../StigmergyAdapter';

function makeFakeTurn(enabled: boolean): StigmergyTurn {
    return {
        enabled,
        taskId: 'test-task',
        decisionMode: 'none',
        instrument: <T>(t: T[]) => t,
        orderTools: <T>(t: readonly T[]) => Array.from(t),
        pathGuidance: () => ({ path: [], text: '' }),
        emitInvoked: vi.fn(async () => undefined),
        emitReturned: vi.fn(async () => undefined),
        end: vi.fn(async () => undefined),
        accept: vi.fn(async () => undefined),
        iterate: vi.fn(async () => undefined),
        abandon: vi.fn(async () => undefined),
        surfaced: [],
    } as unknown as StigmergyTurn;
}

describe('stigmergyEmitGate (FEAT-32-01 PR 1.2, ADR-131)', () => {
    describe('shouldEmitToStigmergy', () => {
        it('returns false when turn is undefined', () => {
            expect(shouldEmitToStigmergy(undefined, 'model')).toBe(false);
        });
        it('returns false when turn is disabled (NOOP)', () => {
            expect(shouldEmitToStigmergy(makeFakeTurn(false), 'model')).toBe(false);
        });
        it('returns true for enabled turn with source "model" (default)', () => {
            expect(shouldEmitToStigmergy(makeFakeTurn(true), 'model')).toBe(true);
        });
        it('returns true for enabled turn with source undefined (treated as model)', () => {
            expect(shouldEmitToStigmergy(makeFakeTurn(true), undefined)).toBe(true);
        });
        it('returns false for enabled turn with source "fastpath"', () => {
            expect(shouldEmitToStigmergy(makeFakeTurn(true), 'fastpath')).toBe(false);
        });
        it('returns false for enabled turn with source "planner"', () => {
            expect(shouldEmitToStigmergy(makeFakeTurn(true), 'planner')).toBe(false);
        });
    });

    describe('emitStigmergyInvoked', () => {
        it('calls turn.emitInvoked when gate is open (source=model)', async () => {
            const turn = makeFakeTurn(true);
            await emitStigmergyInvoked(turn, 'tool_x', 'model');
            expect(turn.emitInvoked).toHaveBeenCalledWith('tool_x');
        });
        it('does NOT call turn.emitInvoked when source is fastpath', async () => {
            const turn = makeFakeTurn(true);
            await emitStigmergyInvoked(turn, 'tool_x', 'fastpath');
            expect(turn.emitInvoked).not.toHaveBeenCalled();
        });
        it('does NOT call turn.emitInvoked when turn is disabled', async () => {
            const turn = makeFakeTurn(false);
            await emitStigmergyInvoked(turn, 'tool_x', 'model');
            expect(turn.emitInvoked).not.toHaveBeenCalled();
        });
        it('is a no-op when turn is undefined', async () => {
            await expect(emitStigmergyInvoked(undefined, 'tool_x', 'model')).resolves.toBeUndefined();
        });
    });

    describe('emitStigmergyReturned', () => {
        it('calls turn.emitReturned with success flag when gate is open', async () => {
            const turn = makeFakeTurn(true);
            await emitStigmergyReturned(turn, 'tool_x', true, 'model');
            expect(turn.emitReturned).toHaveBeenCalledWith('tool_x', true);
        });
        it('does NOT call turn.emitReturned when source is fastpath', async () => {
            const turn = makeFakeTurn(true);
            await emitStigmergyReturned(turn, 'tool_x', true, 'fastpath');
            expect(turn.emitReturned).not.toHaveBeenCalled();
        });
        it('propagates success=false to substrate', async () => {
            const turn = makeFakeTurn(true);
            await emitStigmergyReturned(turn, 'tool_x', false, 'model');
            expect(turn.emitReturned).toHaveBeenCalledWith('tool_x', false);
        });
    });
});
