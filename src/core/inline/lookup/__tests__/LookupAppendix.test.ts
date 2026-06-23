import { describe, it, expect } from 'vitest';
import { renderLookupAppendix } from '../LookupAppendix';

describe('renderLookupAppendix', () => {
    it('returns empty string when nothing is supplied', () => {
        expect(renderLookupAppendix({ tier: 'empty', vaultSources: [], webResults: [], edges: [] })).toBe('');
    });

    it('renders Vault sources section', () => {
        const out = renderLookupAppendix({
            tier: 'strong',
            vaultSources: [{ notePath: 'foo/bar.md', excerpt: 'short text', confidence: 0.85 }],
            webResults: [],
            edges: [],
        });
        expect(out).toContain('**Vault sources**');
        expect(out).toContain('[[foo/bar]]');
        expect(out).toContain('(0.85)');
        expect(out).toContain('short text');
    });

    it('prefixes "Low confidence" italic when tier is weak AND vault sources exist', () => {
        const out = renderLookupAppendix({
            tier: 'weak',
            vaultSources: [{ notePath: 'foo.md', excerpt: 'x', confidence: 0.65 }],
            webResults: [],
            edges: [],
        });
        expect(out).toContain('*Low confidence -- vault match is partial.*');
    });

    it('does NOT show "Low confidence" when vault sources are empty', () => {
        const out = renderLookupAppendix({ tier: 'weak', vaultSources: [], webResults: [], edges: [] });
        expect(out).not.toContain('Low confidence');
    });

    it('renders Web sources as plain markdown links', () => {
        const out = renderLookupAppendix({
            tier: 'empty',
            vaultSources: [],
            webResults: [{ title: 'Wikipedia', url: 'https://en.wikipedia.org/x', snippet: 'A summary.', score: 1 }],
            edges: [],
        });
        expect(out).toContain('**Web sources**');
        expect(out).toContain('[Wikipedia](https://en.wikipedia.org/x)');
        expect(out).toContain('A summary.');
    });

    it('splits explicit vs implicit edges into separate sections', () => {
        const out = renderLookupAppendix({
            tier: 'strong',
            vaultSources: [],
            webResults: [],
            edges: [
                { targetPath: 'a.md', score: 1, type: 'backlink', reason: 'Links to x' },
                { targetPath: 'b.md', score: 0.7, type: 'implicit-similarity', reason: 'Semantic similarity 70%' },
                { targetPath: 'c.md', score: 0.4, type: 'tag-cooccurrence', reason: 'Shares #tag' },
            ],
        });
        expect(out).toContain('**Explicit connections**');
        expect(out).toContain('[[a]]');
        expect(out).toContain('[[c]]');
        expect(out).toContain('**Implicit connections**');
        expect(out).toContain('[[b]]');
        // Implicit section appears AFTER explicit.
        const idxExp = out.indexOf('**Explicit connections**');
        const idxImp = out.indexOf('**Implicit connections**');
        expect(idxExp).toBeLessThan(idxImp);
    });

    it('omits sections that have no content', () => {
        const out = renderLookupAppendix({
            tier: 'strong',
            vaultSources: [{ notePath: 'a.md', excerpt: 'x', confidence: 0.9 }],
            webResults: [],
            edges: [],
        });
        expect(out).not.toContain('**Web sources**');
        expect(out).not.toContain('**Explicit connections**');
        expect(out).not.toContain('**Implicit connections**');
    });
});
