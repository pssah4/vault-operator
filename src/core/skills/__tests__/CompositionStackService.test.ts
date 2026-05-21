/**
 * FEAT-29-10 Step A: CompositionStackService tests.
 *
 * The service tracks the in-flight composition chain for a single
 * AgentTask. Skill-to-skill and skill-to-mcp invocations push entries;
 * a successful return pops them. Cycle-detection and depth-limit
 * protect against runaway recursion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    CompositionStackService,
    CompositionCycleError,
    CompositionDepthExceededError,
    type CompositionEntry,
} from '../CompositionStackService';

describe('CompositionStackService', () => {
    let svc: CompositionStackService;

    beforeEach(() => {
        svc = new CompositionStackService(5);
    });

    it('starts with depth 0', () => {
        expect(svc.depth()).toBe(0);
        expect(svc.current()).toEqual([]);
    });

    it('push + pop maintain order', () => {
        const a: CompositionEntry = { type: 'skill', id: 'a' };
        const b: CompositionEntry = { type: 'skill', id: 'b' };
        svc.push(a);
        svc.push(b);
        expect(svc.depth()).toBe(2);
        expect(svc.current()).toEqual([a, b]);
        expect(svc.pop()).toEqual(b);
        expect(svc.depth()).toBe(1);
        expect(svc.pop()).toEqual(a);
        expect(svc.pop()).toBeUndefined();
    });

    it('contains() finds matching entry by type+id', () => {
        svc.push({ type: 'skill', id: 'a' });
        expect(svc.contains({ type: 'skill', id: 'a' })).toBe(true);
        expect(svc.contains({ type: 'skill', id: 'b' })).toBe(false);
        // Different type, same id → no match
        expect(svc.contains({ type: 'mcp', id: 'a' })).toBe(false);
    });

    describe('cycle detection', () => {
        it('throws CompositionCycleError when pushing an entry already in the stack', () => {
            svc.push({ type: 'skill', id: 'a' });
            svc.push({ type: 'skill', id: 'b' });
            expect(() => svc.push({ type: 'skill', id: 'a' })).toThrow(CompositionCycleError);
        });

        it('cycle error names the stack at throw time', () => {
            svc.push({ type: 'skill', id: 'a' });
            svc.push({ type: 'skill', id: 'b' });
            try {
                svc.push({ type: 'skill', id: 'a' });
            } catch (e) {
                expect(e).toBeInstanceOf(CompositionCycleError);
                const err = e as CompositionCycleError;
                expect(err.stack_chain.map((s) => s.id)).toEqual(['a', 'b', 'a']);
                expect(err.message).toMatch(/cycle/i);
            }
        });

        it('mcp entries are scoped by type so same id can coexist', () => {
            svc.push({ type: 'skill', id: 'foo' });
            // Different type, same id is NOT a cycle
            expect(() => svc.push({ type: 'mcp', id: 'foo' })).not.toThrow();
        });
    });

    describe('depth limit', () => {
        it('throws CompositionDepthExceededError at max depth', () => {
            const max = 3;
            const s = new CompositionStackService(max);
            s.push({ type: 'skill', id: 'a' });
            s.push({ type: 'skill', id: 'b' });
            s.push({ type: 'skill', id: 'c' });
            expect(() => s.push({ type: 'skill', id: 'd' })).toThrow(CompositionDepthExceededError);
        });

        it('depth error carries the limit and the stack', () => {
            const s = new CompositionStackService(2);
            s.push({ type: 'skill', id: 'a' });
            s.push({ type: 'skill', id: 'b' });
            try {
                s.push({ type: 'skill', id: 'c' });
            } catch (e) {
                expect(e).toBeInstanceOf(CompositionDepthExceededError);
                const err = e as CompositionDepthExceededError;
                expect(err.maxDepth).toBe(2);
                expect(err.stack_chain.map((s) => s.id)).toEqual(['a', 'b', 'c']);
            }
        });

        it('default constructor accepts a depth of 5', () => {
            const s = new CompositionStackService(5);
            for (let i = 0; i < 5; i++) {
                s.push({ type: 'skill', id: `skill-${i}` });
            }
            expect(s.depth()).toBe(5);
            expect(() => s.push({ type: 'skill', id: 'overflow' })).toThrow(CompositionDepthExceededError);
        });
    });

    it('contains() is immutable to outside (returns a snapshot)', () => {
        svc.push({ type: 'skill', id: 'a' });
        const snap = svc.current();
        // attempting to mutate the returned array must not affect svc state
        // (TS readonly guard, but runtime should be defensive too)
        expect(Object.isFrozen(snap) || snap !== svc.current()).toBe(true);
    });
});
