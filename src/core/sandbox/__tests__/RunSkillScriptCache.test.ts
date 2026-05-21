/**
 * FEAT-29-06 Task B unit tests for RunSkillScriptCache.
 *
 * RED first: cache class does not exist yet. After GREEN, the cache:
 *  - keys bundles by sha256(skill_name + script_name + source-text)
 *  - returns cached compiled bundle on hit
 *  - returns null (miss) when the key is unknown
 *  - evicts the least-recently-used entry once the LRU max is exceeded
 *  - invalidates a key when its source text changes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RunSkillScriptCache } from '../RunSkillScriptCache';

describe('RunSkillScriptCache (FEAT-29-06)', () => {
    let cache: RunSkillScriptCache;

    beforeEach(() => {
        cache = new RunSkillScriptCache({ maxEntries: 3 });
    });

    it('returns null on miss', () => {
        expect(cache.get('my-skill', 'hello', 'source-A')).toBeNull();
    });

    it('returns compiled bundle on hit (same skill, script, source)', () => {
        cache.set('my-skill', 'hello', 'source-A', 'compiled-A');
        expect(cache.get('my-skill', 'hello', 'source-A')).toBe('compiled-A');
    });

    it('invalidates when the source text changes (different hash)', () => {
        cache.set('my-skill', 'hello', 'source-A', 'compiled-A');
        // Same skill+script, but the source changed: must NOT return the old bundle
        expect(cache.get('my-skill', 'hello', 'source-B')).toBeNull();
    });

    it('isolates entries across skill names', () => {
        cache.set('skill-1', 'hello', 'source-X', 'compiled-1');
        cache.set('skill-2', 'hello', 'source-X', 'compiled-2');
        expect(cache.get('skill-1', 'hello', 'source-X')).toBe('compiled-1');
        expect(cache.get('skill-2', 'hello', 'source-X')).toBe('compiled-2');
    });

    it('isolates entries across script names within the same skill', () => {
        cache.set('my-skill', 'a', 'src', 'compiled-a');
        cache.set('my-skill', 'b', 'src', 'compiled-b');
        expect(cache.get('my-skill', 'a', 'src')).toBe('compiled-a');
        expect(cache.get('my-skill', 'b', 'src')).toBe('compiled-b');
    });

    it('evicts the least-recently-used entry when maxEntries is exceeded', () => {
        // maxEntries=3 from beforeEach. Insert 3, access 1, insert a 4th.
        cache.set('s1', 'k', 'src', 'c1');
        cache.set('s2', 'k', 'src', 'c2');
        cache.set('s3', 'k', 'src', 'c3');
        // Touch s1 -- moves it to most-recently-used.
        expect(cache.get('s1', 'k', 'src')).toBe('c1');
        // Adding s4 should evict s2 (LRU after the touch on s1).
        cache.set('s4', 'k', 'src', 'c4');

        expect(cache.get('s1', 'k', 'src')).toBe('c1'); // survived
        expect(cache.get('s2', 'k', 'src')).toBeNull();  // evicted
        expect(cache.get('s3', 'k', 'src')).toBe('c3'); // survived
        expect(cache.get('s4', 'k', 'src')).toBe('c4'); // newest
    });

    it('does not over-evict when at exact capacity', () => {
        cache.set('s1', 'k', 'src', 'c1');
        cache.set('s2', 'k', 'src', 'c2');
        cache.set('s3', 'k', 'src', 'c3');
        // Re-set s1 (already present, just update LRU position)
        cache.set('s1', 'k', 'src', 'c1-v2');

        // No eviction yet -- s1 update does not displace s2/s3.
        expect(cache.get('s1', 'k', 'src')).toBe('c1-v2');
        expect(cache.get('s2', 'k', 'src')).toBe('c2');
        expect(cache.get('s3', 'k', 'src')).toBe('c3');
    });

    it('reports size for telemetry', () => {
        expect(cache.size()).toBe(0);
        cache.set('s1', 'k', 'src', 'c1');
        cache.set('s2', 'k', 'src', 'c2');
        expect(cache.size()).toBe(2);
    });

    it('clears all entries', () => {
        cache.set('s1', 'k', 'src', 'c1');
        cache.set('s2', 'k', 'src', 'c2');
        cache.clear();
        expect(cache.size()).toBe(0);
        expect(cache.get('s1', 'k', 'src')).toBeNull();
    });

    it('handles maxEntries=1 edge case (every new entry evicts the previous)', () => {
        const tiny = new RunSkillScriptCache({ maxEntries: 1 });
        tiny.set('s1', 'k', 'src', 'c1');
        expect(tiny.get('s1', 'k', 'src')).toBe('c1');
        tiny.set('s2', 'k', 'src', 'c2');
        // s1 is gone -- only one slot, the new entry replaced it.
        expect(tiny.get('s1', 'k', 'src')).toBeNull();
        expect(tiny.get('s2', 'k', 'src')).toBe('c2');
        expect(tiny.size()).toBe(1);
    });

    it('defaults to maxEntries=20 when not specified', () => {
        const big = new RunSkillScriptCache();
        for (let i = 0; i < 20; i++) {
            big.set(`s${i}`, 'k', 'src', `c${i}`);
        }
        expect(big.size()).toBe(20);
        // Inserting #21 evicts #0.
        big.set('s20', 'k', 'src', 'c20');
        expect(big.size()).toBe(20);
        expect(big.get('s0', 'k', 'src')).toBeNull();
        expect(big.get('s20', 'k', 'src')).toBe('c20');
    });
});
