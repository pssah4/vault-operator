import { describe, it, expect } from 'vitest';
import { EmbeddingCache } from '../EmbeddingCache';

describe('EmbeddingCache', () => {
    it('returns undefined for a miss', () => {
        const c = new EmbeddingCache();
        expect(c.get('x')).toBeUndefined();
    });

    it('stores and retrieves an embedding', () => {
        const c = new EmbeddingCache();
        c.set('hello', [0.1, 0.2, 0.3]);
        expect(c.get('hello')).toEqual([0.1, 0.2, 0.3]);
    });

    it('trims whitespace consistently (hash key normalises trim)', () => {
        const c = new EmbeddingCache();
        c.set('  hello  ', [0.1]);
        expect(c.get('hello')).toEqual([0.1]);
    });

    it('does NOT store empty embeddings', () => {
        const c = new EmbeddingCache();
        c.set('x', []);
        expect(c.get('x')).toBeUndefined();
    });

    it('evicts the oldest entry past capacity', () => {
        const c = new EmbeddingCache({ capacity: 2 });
        c.set('a', [1]);
        c.set('b', [2]);
        c.set('c', [3]);
        expect(c.get('a')).toBeUndefined();
        expect(c.get('b')).toEqual([2]);
        expect(c.get('c')).toEqual([3]);
    });

    it('promotes entries on get (LRU)', () => {
        const c = new EmbeddingCache({ capacity: 2 });
        c.set('a', [1]);
        c.set('b', [2]);
        c.get('a'); // touch a -> b becomes LRU
        c.set('c', [3]);
        expect(c.get('a')).toEqual([1]);
        expect(c.get('b')).toBeUndefined();
        expect(c.get('c')).toEqual([3]);
    });

    it('clear() empties the cache', () => {
        const c = new EmbeddingCache();
        c.set('x', [1]);
        c.clear();
        expect(c.size).toBe(0);
        expect(c.get('x')).toBeUndefined();
    });
});
