import { describe, it, expect } from 'vitest';
import {
    resolveStigmergyPrecedence,
    appendGuidanceText,
    buildStigmergyDecisionSnapshot,
} from '../precedenceResolver';
import type { StigmergyTurn } from '../StigmergyAdapter';

function makeFakeTurn(
    overrides: Partial<Pick<StigmergyTurn, 'enabled' | 'decisionMode'>> = {},
): StigmergyTurn {
    return {
        enabled: overrides.enabled ?? true,
        taskId: 'task-1',
        decisionMode: overrides.decisionMode ?? 'sequence',
        instrument: <T>(t: T[]) => t,
        orderTools: <T>(t: readonly T[]) => Array.from(t),
        pathGuidance: () => ({ path: [], text: '' }),
        emitInvoked: async () => undefined,
        emitReturned: async () => undefined,
        end: async () => undefined,
        accept: async () => undefined,
        iterate: async () => undefined,
        abandon: async () => undefined,
        surfaced: [],
    } as unknown as StigmergyTurn;
}

describe('resolveStigmergyPrecedence (FEAT-32-01 PR 1.3, ADR-131)', () => {
    it('suppresses guidance text when FastPath fired AND guidance text exists', () => {
        const r = resolveStigmergyPrecedence({
            fastPathFired: true,
            bestMatchRecipeId: 'rcp-42',
            guidanceText: 'Stigmergy has a pinned sequence for this kind of task...',
        });
        expect(r.suppressGuidanceText).toBe(true);
        expect(r.recipeWinner).toBe('rcp-42');
    });

    it('does NOT suppress guidance text when FastPath did not fire', () => {
        const r = resolveStigmergyPrecedence({
            fastPathFired: false,
            bestMatchRecipeId: 'rcp-42',
            guidanceText: 'Stigmergy hint',
        });
        expect(r.suppressGuidanceText).toBe(false);
        expect(r.recipeWinner).toBeNull();
    });

    it('does NOT suppress when FastPath fired but guidance text is empty (nothing to suppress)', () => {
        const r = resolveStigmergyPrecedence({
            fastPathFired: true,
            bestMatchRecipeId: 'rcp-42',
            guidanceText: '',
        });
        expect(r.suppressGuidanceText).toBe(false);
        expect(r.recipeWinner).toBe('rcp-42');
    });

    it('recipeWinner is null when no recipe ID is provided even if FastPath fired', () => {
        const r = resolveStigmergyPrecedence({
            fastPathFired: true,
            bestMatchRecipeId: null,
            guidanceText: 'Some hint',
        });
        expect(r.suppressGuidanceText).toBe(true);
        expect(r.recipeWinner).toBeNull();
    });

    it('returns clean defaults when nothing fired', () => {
        const r = resolveStigmergyPrecedence({
            fastPathFired: false,
            bestMatchRecipeId: null,
            guidanceText: '',
        });
        expect(r.suppressGuidanceText).toBe(false);
        expect(r.recipeWinner).toBeNull();
    });
});

describe('appendGuidanceText (FEAT-32-01 PR 1.3)', () => {
    it('returns the userMessage unchanged when guidanceText is empty', () => {
        expect(appendGuidanceText('hello', '')).toBe('hello');
        const arr = [{ type: 'text', text: 'hello' }];
        expect(appendGuidanceText(arr, '')).toBe(arr);
    });

    it('wraps a string userMessage into an array with two text blocks', () => {
        const out = appendGuidanceText('user prompt', 'guidance hint');
        expect(Array.isArray(out)).toBe(true);
        expect(out).toEqual([
            { type: 'text', text: 'user prompt' },
            { type: 'text', text: 'guidance hint' },
        ]);
    });

    it('appends a text block to an existing array message without mutating the input', () => {
        const input = [
            { type: 'text', text: 'first block' },
            { type: 'image', text: undefined },
        ];
        const out = appendGuidanceText(input, 'guidance hint');
        expect(Array.isArray(out)).toBe(true);
        expect(out).toHaveLength(3);
        expect(out[2]).toEqual({ type: 'text', text: 'guidance hint' });
        expect(input).toHaveLength(2);
    });
});

describe('buildStigmergyDecisionSnapshot (FEAT-32-01 PR 1.3, ADR-133)', () => {
    it('builds a snapshot for a sequence-mode turn with FastPath fired', () => {
        const turn = makeFakeTurn({ enabled: true, decisionMode: 'sequence' });
        const snap = buildStigmergyDecisionSnapshot({
            turn,
            pinnedPath: ['search_files', 'read_file', 'write_file'],
            suppressGuidanceText: true,
            recipeWinner: 'rcp-42',
        });
        expect(snap).toEqual({
            enabled: true,
            mode: 'sequence',
            pinnedPath: ['search_files', 'read_file', 'write_file'],
            guidanceTextSuppressed: true,
            recipeWinner: 'rcp-42',
        });
    });

    it('builds a NOOP snapshot for a disabled turn', () => {
        const turn = makeFakeTurn({ enabled: false, decisionMode: 'none' });
        const snap = buildStigmergyDecisionSnapshot({
            turn,
            pinnedPath: [],
            suppressGuidanceText: false,
            recipeWinner: null,
        });
        expect(snap).toEqual({
            enabled: false,
            mode: 'none',
            pinnedPath: [],
            guidanceTextSuppressed: false,
            recipeWinner: null,
        });
    });

    it('snapshots the pinnedPath as a copy so later mutations do not leak', () => {
        const turn = makeFakeTurn();
        const input = ['a', 'b'];
        const snap = buildStigmergyDecisionSnapshot({
            turn,
            pinnedPath: input,
            suppressGuidanceText: false,
            recipeWinner: null,
        });
        input.push('c');
        expect(snap.pinnedPath).toEqual(['a', 'b']);
    });
});
