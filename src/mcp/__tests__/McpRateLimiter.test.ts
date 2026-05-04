/**
 * AUDIT-015 M-1: McpRateLimiter tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRateLimiter, classifyTool, TOOL_RATE_CLASS } from '../McpRateLimiter';

describe('McpRateLimiter (AUDIT-015 M-1)', () => {
    let limiter: McpRateLimiter;
    beforeEach(() => { limiter = new McpRateLimiter(); vi.useRealTimers(); });

    it('allows under-limit calls', () => {
        for (let i = 0; i < 10; i++) {
            expect(limiter.consume('caller-A', 'expensive').allowed).toBe(true);
        }
    });

    it('denies the 11th expensive call within the same minute', () => {
        for (let i = 0; i < 10; i++) {
            limiter.consume('caller-A', 'expensive');
        }
        const denied = limiter.consume('caller-A', 'expensive');
        expect(denied.allowed).toBe(false);
        expect(denied.retryAfterSec).toBeGreaterThan(0);
        expect(denied.remainingInWindow).toBe(0);
        expect(denied.limitInWindow).toBe(10);
    });

    it('different callers have independent buckets', () => {
        for (let i = 0; i < 10; i++) limiter.consume('caller-A', 'expensive');
        const otherCaller = limiter.consume('caller-B', 'expensive');
        expect(otherCaller.allowed).toBe(true);
    });

    it('different rate classes count separately', () => {
        for (let i = 0; i < 10; i++) limiter.consume('caller-A', 'expensive');
        const cheap = limiter.consume('caller-A', 'cheap');
        const medium = limiter.consume('caller-A', 'medium');
        expect(cheap.allowed).toBe(true);
        expect(medium.allowed).toBe(true);
    });

    it('window expires and slots free up', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-03T12:00:00Z'));
        for (let i = 0; i < 10; i++) limiter.consume('caller-A', 'expensive');
        expect(limiter.consume('caller-A', 'expensive').allowed).toBe(false);
        vi.setSystemTime(new Date('2026-05-03T12:01:01Z'));  // 61s later
        expect(limiter.consume('caller-A', 'expensive').allowed).toBe(true);
    });

    it('check() does not consume; consume() does', () => {
        for (let i = 0; i < 9; i++) limiter.consume('caller-A', 'expensive');
        const probe1 = limiter.check('caller-A', 'expensive');
        const probe2 = limiter.check('caller-A', 'expensive');
        expect(probe1.allowed).toBe(true);
        expect(probe2.allowed).toBe(true);  // probe didn't consume the 10th slot
        const real = limiter.consume('caller-A', 'expensive');
        expect(real.allowed).toBe(true);
        const denied = limiter.consume('caller-A', 'expensive');
        expect(denied.allowed).toBe(false);
    });

    it('cleanup removes expired empty buckets', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-03T12:00:00Z'));
        limiter.consume('caller-A', 'cheap');
        limiter.consume('caller-B', 'medium');
        expect(limiter.size()).toBe(2);
        vi.setSystemTime(new Date('2026-05-03T12:02:00Z'));  // 2 min later
        limiter.cleanup();
        expect(limiter.size()).toBe(0);
    });
});

describe('classifyTool', () => {
    it('classifies known tools per the table', () => {
        expect(classifyTool('save_conversation')).toBe('expensive');
        expect(classifyTool('recall_memory')).toBe('medium');
        expect(classifyTool('read_notes')).toBe('cheap');
    });
    it('unknown tools default to "cheap" (defensive: explicit add to step up)', () => {
        expect(classifyTool('totally-bogus-tool')).toBe('cheap');
    });
    it('all EPIC-23 tools are classified', () => {
        expect(TOOL_RATE_CLASS['save_to_memory']).toBeDefined();
        expect(TOOL_RATE_CLASS['save_conversation']).toBeDefined();
        expect(TOOL_RATE_CLASS['recall_memory']).toBeDefined();
        expect(TOOL_RATE_CLASS['search_history']).toBeDefined();
        expect(TOOL_RATE_CLASS['close_conversation']).toBeDefined();
        expect(TOOL_RATE_CLASS['mark_note_as_memory_source']).toBeDefined();
    });
});
