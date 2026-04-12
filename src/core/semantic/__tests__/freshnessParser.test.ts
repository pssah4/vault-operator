import { describe, it, expect } from 'vitest';

/**
 * Tests for the freshness tag parsing logic used in SemanticIndexService.enrichChunkWithContext.
 * Tests the regex extraction pattern in isolation (FEATURE-2006).
 */

// Extract the parsing logic used in enrichChunkWithContext
function parseFreshnessFromResponse(rawPrefix: string): {
    freshnessClass: 'volatile' | 'evolving' | 'stable' | null;
    contextPrefix: string;
} {
    const freshnessMatch = rawPrefix.match(/^<freshness>(volatile|evolving|stable)<\/freshness>\s*/);
    if (freshnessMatch) {
        return {
            freshnessClass: freshnessMatch[1] as 'volatile' | 'evolving' | 'stable',
            contextPrefix: rawPrefix.slice(freshnessMatch[0].length).trim(),
        };
    }
    return {
        freshnessClass: null,
        contextPrefix: rawPrefix,
    };
}

// Majority vote logic used in storeFreshnessClass
function majorityVote(votes: Array<'volatile' | 'evolving' | 'stable'>): string {
    const counts = { volatile: 0, evolving: 0, stable: 0 };
    for (const v of votes) counts[v]++;
    return (Object.entries(counts) as Array<[string, number]>)
        .sort((a, b) => b[1] - a[1])[0][0];
}

describe('Freshness Parser (FEATURE-2006)', () => {
    describe('parseFreshnessFromResponse', () => {
        it('should extract volatile tag', () => {
            const result = parseFreshnessFromResponse(
                '<freshness>volatile</freshness>\nThis chunk discusses recent AI regulation changes.',
            );
            expect(result.freshnessClass).toBe('volatile');
            expect(result.contextPrefix).toBe('This chunk discusses recent AI regulation changes.');
        });

        it('should extract evolving tag', () => {
            const result = parseFreshnessFromResponse(
                '<freshness>evolving</freshness> This covers best practices for testing.',
            );
            expect(result.freshnessClass).toBe('evolving');
            expect(result.contextPrefix).toBe('This covers best practices for testing.');
        });

        it('should extract stable tag', () => {
            const result = parseFreshnessFromResponse(
                '<freshness>stable</freshness> This discusses Kant\'s categorical imperative.',
            );
            expect(result.freshnessClass).toBe('stable');
            expect(result.contextPrefix).toBe('This discusses Kant\'s categorical imperative.');
        });

        it('should handle missing tag gracefully', () => {
            const result = parseFreshnessFromResponse(
                'This chunk provides context about the document topic.',
            );
            expect(result.freshnessClass).toBeNull();
            expect(result.contextPrefix).toBe('This chunk provides context about the document topic.');
        });

        it('should handle tag with no context after it', () => {
            const result = parseFreshnessFromResponse('<freshness>stable</freshness>');
            expect(result.freshnessClass).toBe('stable');
            expect(result.contextPrefix).toBe('');
        });

        it('should not match tag in the middle of text', () => {
            const result = parseFreshnessFromResponse(
                'Some text <freshness>volatile</freshness> more text',
            );
            expect(result.freshnessClass).toBeNull(); // only matches at start
        });

        it('should not match invalid freshness values', () => {
            const result = parseFreshnessFromResponse(
                '<freshness>unknown</freshness> Some context.',
            );
            expect(result.freshnessClass).toBeNull();
        });
    });

    describe('majorityVote', () => {
        it('should return the most frequent class', () => {
            expect(majorityVote(['volatile', 'volatile', 'stable'])).toBe('volatile');
            expect(majorityVote(['stable', 'stable', 'evolving'])).toBe('stable');
            expect(majorityVote(['evolving', 'evolving', 'evolving'])).toBe('evolving');
        });

        it('should handle single vote', () => {
            expect(majorityVote(['volatile'])).toBe('volatile');
        });

        it('should handle tie by returning first in sort order', () => {
            // With equal counts, sort is stable -- result is deterministic
            const result = majorityVote(['volatile', 'stable']);
            expect(['volatile', 'stable']).toContain(result);
        });
    });
});
