import { describe, it, expect } from 'vitest';
import { normalizeTopicSlug, normalizeTopics } from '../topicSlug';

/**
 * FEAT-32-03 PR 3.2 / Audit Finding 17: topic slug normalization. Drift
 * between `Plan Mode`, `planMode`, ` plan-mode `, `Plan-Mode` etc. breaks
 * memory recall because the search query never matches all variants.
 */
describe('normalizeTopicSlug (FEAT-32-03 PR 3.2)', () => {
    it('lowercases and trims', () => {
        expect(normalizeTopicSlug(' Plan Mode ')).toBe('plan-mode');
    });
    it('converts whitespace runs to single hyphens', () => {
        expect(normalizeTopicSlug('vault   operator   loop')).toBe('vault-operator-loop');
    });
    it('preserves already-normalized slugs unchanged', () => {
        expect(normalizeTopicSlug('plan-mode')).toBe('plan-mode');
    });
    it('handles unicode (German Umlaute) without crash and lowercases', () => {
        expect(normalizeTopicSlug('Bücher Listen')).toBe('bücher-listen');
    });
    it('returns empty string for empty input', () => {
        expect(normalizeTopicSlug('   ')).toBe('');
    });
});

describe('normalizeTopics (FEAT-32-03 PR 3.2)', () => {
    it('normalizes every topic in the array', () => {
        expect(normalizeTopics(['Plan Mode', 'memory', ' MCP server '])).toEqual([
            'plan-mode',
            'memory',
            'mcp-server',
        ]);
    });
    it('filters out empties after normalization', () => {
        expect(normalizeTopics(['valid', '   ', '\t'])).toEqual(['valid']);
    });
    it('dedupes equal normalized values while preserving first-seen order', () => {
        expect(normalizeTopics(['Plan Mode', 'plan-mode', 'planMode']))
            .toEqual(['plan-mode', 'planmode']);
    });
    it('returns empty array for empty input', () => {
        expect(normalizeTopics([])).toEqual([]);
    });
});
