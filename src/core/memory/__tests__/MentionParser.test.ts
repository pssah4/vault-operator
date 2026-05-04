import { describe, it, expect } from 'vitest';
import { parseMentions } from '../MentionParser';

describe('MentionParser (PLAN-007 task A.1)', () => {
    it('returns [] for empty / null input', () => {
        expect(parseMentions('')).toEqual([]);
        expect(parseMentions(undefined as unknown as string)).toEqual([]);
    });

    describe('wikilinks', () => {
        it('extracts a bare wikilink and adds .md extension', () => {
            const out = parseMentions('See [[Notes/Foo]] for context.');
            expect(out).toHaveLength(1);
            expect(out[0].uri).toBe('vault://Notes/Foo.md');
            expect(out[0].source).toBe('wikilink');
            expect(out[0].label).toBe('Notes/Foo');
        });

        it('respects an existing .md extension', () => {
            const out = parseMentions('[[Notes/X.md]]');
            expect(out[0].uri).toBe('vault://Notes/X.md');
        });

        it('uses the alias as label when present', () => {
            const out = parseMentions('[[Notes/Tech|tech notes]]');
            expect(out[0].label).toBe('tech notes');
        });

        it('extracts multiple wikilinks', () => {
            const out = parseMentions('Both [[A]] and [[B/C]] matter.');
            expect(out.map(m => m.uri)).toEqual(['vault://A.md', 'vault://B/C.md']);
        });
    });

    describe('markdown links', () => {
        it('vault-relative path becomes vault://', () => {
            const out = parseMentions('See [the slide](Attachments/deck.pdf).');
            expect(out[0].uri).toBe('vault://Attachments/deck.pdf');
            expect(out[0].label).toBe('the slide');
            expect(out[0].source).toBe('markdown-link');
        });

        it('absolute path becomes file://', () => {
            const out = parseMentions('See [the file](/Users/seb/notes.txt).');
            expect(out[0].uri).toBe('file:///Users/seb/notes.txt');
            expect(out[0].scheme).toBe('file');
        });

        it('https / http link passes through', () => {
            const out = parseMentions('Read [the docs](https://example.com/api).');
            expect(out[0].uri).toBe('https://example.com/api');
            expect(out[0].scheme).toBe('https');
        });

        it('skips mailto / fragments / queries', () => {
            const out = parseMentions(
                '[mail](mailto:foo@bar.com) [anchor](#section) [query](?id=42)',
            );
            expect(out).toEqual([]);
        });
    });

    describe('bare URLs', () => {
        it('detects https:// and http:// in prose', () => {
            const out = parseMentions(
                'Check https://example.com and http://example.org for details.',
            );
            expect(out.map(m => m.uri)).toEqual(['https://example.com', 'http://example.org']);
        });

        it('strips trailing punctuation', () => {
            const out = parseMentions('See https://example.com.');
            expect(out[0].uri).toBe('https://example.com');
        });

        it('does not double-eat URLs already inside markdown-link parens', () => {
            const out = parseMentions('Read [docs](https://example.com/api).');
            expect(out).toHaveLength(1);
            expect(out[0].source).toBe('markdown-link');
        });
    });

    describe('mixed + dedup', () => {
        it('deduplicates the same URI regardless of pattern', () => {
            const out = parseMentions('[[Notes/X.md]] and [link](Notes/X.md)');
            expect(out).toHaveLength(1);
            expect(out[0].uri).toBe('vault://Notes/X.md');
        });

        it('returns mentions sorted by start offset', () => {
            const out = parseMentions(
                'Start with [[A]] then https://x.com then [b](B/C.md).',
            );
            expect(out.map(m => m.uri)).toEqual([
                'vault://A.md', 'https://x.com', 'vault://B/C.md',
            ]);
        });
    });
});
