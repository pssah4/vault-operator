import { describe, it, expect } from 'vitest';
import {
    parseWikilinks,
    extractWikilinkTargets,
    pathsToBasenames,
    stripWikilinkExtension,
    looksLikeDocumentReference,
} from '../wikilinks';

describe('parseWikilinks', () => {
    it('parses bare wikilinks', () => {
        expect(parseWikilinks('Hello [[Note]] world').map((w) => w.target)).toEqual(['Note']);
    });

    it('parses target|alias', () => {
        const w = parseWikilinks('See [[Note Name|the note]]')[0];
        expect(w.target).toBe('Note Name');
        expect(w.alias).toBe('the note');
        expect(w.heading).toBeUndefined();
    });

    it('parses target#heading', () => {
        const w = parseWikilinks('See [[Note#Section]]')[0];
        expect(w.target).toBe('Note');
        expect(w.heading).toBe('Section');
        expect(w.alias).toBeUndefined();
    });

    it('parses target#heading|alias', () => {
        const w = parseWikilinks('See [[Note#Section|click]]')[0];
        expect(w.target).toBe('Note');
        expect(w.heading).toBe('Section');
        expect(w.alias).toBe('click');
    });

    it('skips multiline brackets', () => {
        expect(parseWikilinks('[[Note\nname]]').length).toBe(0);
    });

    it('skips empty targets', () => {
        expect(parseWikilinks('[[]]').length).toBe(0);
    });

    it('handles unclosed brackets', () => {
        expect(parseWikilinks('[[Open without close').length).toBe(0);
    });

    it('handles many wikilinks in one string', () => {
        const targets = parseWikilinks('[[A]] [[B]] [[C|alias]]').map((w) => w.target);
        expect(targets).toEqual(['A', 'B', 'C']);
    });

    it('records correct byte offsets', () => {
        const text = 'foo [[Bar]] baz';
        const w = parseWikilinks(text)[0];
        expect(text.slice(w.start, w.end)).toBe('[[Bar]]');
    });
});

describe('extractWikilinkTargets', () => {
    it('deduplicates targets while preserving order', () => {
        expect(extractWikilinkTargets('[[A]] [[B]] [[A|alias]]')).toEqual(['A', 'B']);
    });
});

describe('pathsToBasenames', () => {
    it('strips folders and extensions', () => {
        const set = pathsToBasenames(['Inbox/Foo.md', 'Folder/Sub/Bar.md', 'Plain']);
        expect(set.has('Foo')).toBe(true);
        expect(set.has('Bar')).toBe(true);
        expect(set.has('Plain')).toBe(true);
    });
});

describe('stripWikilinkExtension', () => {
    it('strips .md', () => {
        expect(stripWikilinkExtension('My Note.md')).toBe('My Note');
    });

    it('keeps targets without an extension', () => {
        expect(stripWikilinkExtension('My Note')).toBe('My Note');
    });

    it('does not strip extensions longer than 5 chars', () => {
        expect(stripWikilinkExtension('Some.thing-longer')).toBe('Some.thing-longer');
    });

    it('does not strip dots in the middle', () => {
        expect(stripWikilinkExtension('Foo.Bar.docx')).toBe('Foo.Bar');
    });
});

describe('looksLikeDocumentReference', () => {
    it.each([
        ['GenAI Push Interview - Asset Radar', true],
        ['Meeting Notes 2024-12-03', true],
        ['Use Case Chatbot', true],
        ['Bericht zur Lage', true],
        ['Magda Krumova', false],
        ['Some Person', false],
        ['Random Concept', false],
    ])('classifies %p as %p', (target, expected) => {
        expect(looksLikeDocumentReference(target)).toBe(expected);
    });
});
