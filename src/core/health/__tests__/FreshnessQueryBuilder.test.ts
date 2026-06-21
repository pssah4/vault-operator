import { describe, it, expect } from 'vitest';

import { FreshnessQueryBuilder } from '../FreshnessQueryBuilder';

/**
 * IMP-20-06-01 W2-T3.
 *
 * Builder turns a (note, cluster) pair into a single search query
 * capped at 400 chars (C-08 binding constraint). The query mixes
 * note title and the strongest entity mentions; long titles get
 * trimmed, never silently truncated mid-word.
 */

describe('FreshnessQueryBuilder (IMP-20-06-01 W2-T3)', () => {
    const builder = new FreshnessQueryBuilder();

    it('builds a short query from title and cluster', () => {
        const q = builder.build({
            notePath: 'Notes/openai-pricing.md',
            title: 'OpenAI Pricing 2026',
            cluster: 'AI pricing',
            topEntities: ['GPT-5', 'Claude Opus'],
        });

        expect(q).toContain('OpenAI Pricing 2026');
        expect(q).toContain('AI pricing');
        expect(q.length).toBeLessThanOrEqual(400);
    });

    it('caps queries at 400 characters with whole-word boundary', () => {
        const longTitle = 'A '.repeat(300);
        const q = builder.build({
            notePath: 'Notes/x.md',
            title: longTitle,
            cluster: 'physics',
            topEntities: [],
        });

        expect(q.length).toBeLessThanOrEqual(400);
        expect(q.endsWith(' ')).toBe(false);
    });

    it('omits entities when the query would exceed 400 chars', () => {
        const longTitle = 'X'.repeat(380);
        const q = builder.build({
            notePath: 'Notes/x.md',
            title: longTitle,
            cluster: 'c',
            topEntities: ['Alpha', 'Beta', 'Gamma'],
        });

        expect(q.length).toBeLessThanOrEqual(400);
    });

    it('uses path slug when title is empty', () => {
        const q = builder.build({
            notePath: 'Notes/llm-routing-strategy.md',
            title: '',
            cluster: 'llm',
            topEntities: [],
        });

        expect(q.toLowerCase()).toContain('llm-routing-strategy');
    });

    it('returns an empty string when there is no input at all', () => {
        const q = builder.build({
            notePath: '',
            title: '',
            cluster: '',
            topEntities: [],
        });

        expect(q).toBe('');
    });
});
