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

    /**
     * SC-01: "Skill-to-skill call works over at least two levels."
     *
     * The shared CompositionStackService is the mechanism that lets a hop
     * chain (A -> B -> C) be tracked across spawned subtasks: AgentTask
     * passes the same service instance into the subtask, which in turn
     * pushes its own entry. This test asserts the chain holds across
     * three hops and unwinds in LIFO order on return.
     */
    describe('SC-01: skill-to-skill chain across multiple levels', () => {
        it('tracks a three-level skill chain (A -> B -> C) and unwinds LIFO on return', () => {
            const s = new CompositionStackService(5);

            // hop 1: parent skill enters
            s.push({ type: 'skill', id: 'wochenreport' });
            expect(s.depth()).toBe(1);
            expect(s.current().map((e) => e.id)).toEqual(['wochenreport']);

            // hop 2: parent invokes a sub-skill (still on the shared stack)
            s.push({ type: 'skill', id: 'meeting-summary' });
            expect(s.depth()).toBe(2);
            expect(s.current().map((e) => e.id)).toEqual(['wochenreport', 'meeting-summary']);

            // hop 3: sub-skill invokes a sub-sub-skill
            s.push({ type: 'skill', id: 'ingest-deep' });
            expect(s.depth()).toBe(3);
            expect(s.current().map((e) => e.id)).toEqual(['wochenreport', 'meeting-summary', 'ingest-deep']);

            // returns unwind in reverse order
            expect(s.pop()?.id).toBe('ingest-deep');
            expect(s.pop()?.id).toBe('meeting-summary');
            expect(s.pop()?.id).toBe('wochenreport');
            expect(s.depth()).toBe(0);
        });

        it('mixes skill and mcp hops on the same chain', () => {
            const s = new CompositionStackService(5);
            s.push({ type: 'skill', id: 'wochenreport' });
            s.push({ type: 'mcp', id: 'notion:search_page' });
            s.push({ type: 'skill', id: 'management-briefing' });
            expect(s.depth()).toBe(3);
            expect(s.current().map((e) => `${e.type}:${e.id}`)).toEqual([
                'skill:wochenreport',
                'mcp:notion:search_page',
                'skill:management-briefing',
            ]);
        });
    });

    /**
     * SC-02: "Cycle detection triggers at level 6."
     *
     * With the default max depth of 5, the 6th push must be rejected
     * with a clear error and a non-hanging code path. This is the
     * synthetic-loop test the spec calls for.
     */
    describe('SC-02: cycle / depth protection at level 6 (default max depth = 5)', () => {
        it('refuses the 6th push with CompositionDepthExceededError when max=5', () => {
            const s = new CompositionStackService(5);
            for (let level = 1; level <= 5; level++) {
                s.push({ type: 'skill', id: `level-${level}` });
            }
            expect(s.depth()).toBe(5);

            // level 6 must fail synchronously with a typed error -- not hang
            const start = Date.now();
            expect(() => s.push({ type: 'skill', id: 'level-6' })).toThrow(
                CompositionDepthExceededError,
            );
            // sanity: the throw was synchronous (no event-loop yield needed)
            expect(Date.now() - start).toBeLessThan(50);

            // the error carries the depth, the limit, and the full attempted stack
            try {
                s.push({ type: 'skill', id: 'level-6' });
            } catch (e) {
                expect(e).toBeInstanceOf(CompositionDepthExceededError);
                const err = e as CompositionDepthExceededError;
                expect(err.maxDepth).toBe(5);
                expect(err.stack_chain).toHaveLength(6);
                expect(err.stack_chain[5].id).toBe('level-6');
                expect(err.message).toMatch(/depth/i);
            }
        });

        it('synthetic A -> B -> A cycle is rejected before reaching the depth limit', () => {
            const s = new CompositionStackService(5);
            s.push({ type: 'skill', id: 'A' });
            s.push({ type: 'skill', id: 'B' });
            // attempting to re-enter A is a cycle, not a depth overflow
            expect(() => s.push({ type: 'skill', id: 'A' })).toThrow(
                CompositionCycleError,
            );
        });
    });

    /**
     * SC-04: "Max depth is configurable; default is 5."
     *
     * The service accepts the limit as a constructor argument. AgentTask
     * passes COMPOSITION_MAX_DEPTH = 5 by default (verified by call-site
     * convention in AgentTask.ts), so the contract here is: arbitrary
     * positive integers are accepted and respected at runtime.
     */
    describe('SC-04: max depth is configurable via constructor', () => {
        it('honours a depth of 3 (custom)', () => {
            const s = new CompositionStackService(3);
            s.push({ type: 'skill', id: 'a' });
            s.push({ type: 'skill', id: 'b' });
            s.push({ type: 'skill', id: 'c' });
            expect(() => s.push({ type: 'skill', id: 'd' })).toThrow(
                CompositionDepthExceededError,
            );
        });

        it('honours a depth of 10 (custom higher)', () => {
            const s = new CompositionStackService(10);
            for (let i = 0; i < 10; i++) s.push({ type: 'skill', id: `s${i}` });
            expect(s.depth()).toBe(10);
            expect(() => s.push({ type: 'skill', id: 'overflow' })).toThrow(
                CompositionDepthExceededError,
            );
        });

        it('honours a depth of 1 (minimum useful)', () => {
            const s = new CompositionStackService(1);
            s.push({ type: 'skill', id: 'only' });
            expect(() => s.push({ type: 'skill', id: 'second' })).toThrow(
                CompositionDepthExceededError,
            );
        });
    });
});
