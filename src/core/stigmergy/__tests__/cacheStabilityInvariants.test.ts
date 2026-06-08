import { describe, it, expect } from 'vitest';
import {
    appendGuidanceText,
    buildStigmergyDecisionSnapshot,
} from '../precedenceResolver';
import type { StigmergyTurn } from '../StigmergyAdapter';

/**
 * Cache-stability invariants enforced at the precedence-resolver layer
 * (FEAT-32-03 PR 3.3 / ADR-062 / ADR-131). These tests document the
 * structural contract that protects the cached System-Prompt-Prefix:
 *
 *   1. `appendGuidanceText` MUST NOT mutate the input array. Mutation would
 *      let a later guidance change leak into the in-flight cached prefix.
 *   2. The snapshot returned by `buildStigmergyDecisionSnapshot` MUST own
 *      its `pinnedPath` array (clone, not reference). Otherwise a later
 *      sub-task that mutates `guidance.path` would change a parent's
 *      already-recorded snapshot.
 *   3. `appendGuidanceText('user', '')` MUST return the input verbatim so
 *      no allocation is forced when no guidance applies (cache-key stable).
 *
 * Breaking any of these would force a System-Prompt-Prefix rebuild on
 * every turn and violate ADR-062.
 */

function makeFakeTurn(): StigmergyTurn {
    return {
        enabled: true,
        taskId: 't',
        decisionMode: 'sequence',
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

describe('Cache-stability invariants (FEAT-32-03 PR 3.3, ADR-062 / ADR-131)', () => {
    it('appendGuidanceText does not mutate the input array', () => {
        const input = [{ type: 'text', text: 'original' }];
        const inputCopy = JSON.parse(JSON.stringify(input));
        appendGuidanceText(input, 'guidance');
        expect(input).toEqual(inputCopy);
    });

    it('appendGuidanceText with empty guidance returns the input reference verbatim', () => {
        const arrInput = [{ type: 'text', text: 'msg' }];
        expect(appendGuidanceText(arrInput, '')).toBe(arrInput);
        const strInput = 'msg';
        expect(appendGuidanceText(strInput, '')).toBe(strInput);
    });

    it('buildStigmergyDecisionSnapshot clones the pinnedPath (no shared reference)', () => {
        const turn = makeFakeTurn();
        const path = ['search', 'read', 'write'];
        const snap = buildStigmergyDecisionSnapshot({
            turn,
            pinnedPath: path,
            suppressGuidanceText: false,
            recipeWinner: null,
        });
        expect(snap.pinnedPath).not.toBe(path);
        path[0] = 'mutated';
        expect(snap.pinnedPath[0]).toBe('search');
    });

    it('buildStigmergyDecisionSnapshot output is structurally stable across calls with same input', () => {
        const turn = makeFakeTurn();
        const a = buildStigmergyDecisionSnapshot({
            turn,
            pinnedPath: ['x', 'y'],
            suppressGuidanceText: true,
            recipeWinner: 'rcp',
        });
        const b = buildStigmergyDecisionSnapshot({
            turn,
            pinnedPath: ['x', 'y'],
            suppressGuidanceText: true,
            recipeWinner: 'rcp',
        });
        expect(a).toEqual(b);
        // Different objects (no shared internal references that could mutate)
        expect(a).not.toBe(b);
        expect(a.pinnedPath).not.toBe(b.pinnedPath);
    });
});
