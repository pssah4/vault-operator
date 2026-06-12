/**
 * Unit tests for the keyword tokenizer folding helpers exported from
 * SemanticIndexService: foldToken(), ACRONYM_ALLOWLIST and the folded
 * KEYWORD_STOP_WORDS set.
 *
 * Folding contract: lowercase input, German sharp s mapped to "ss",
 * NFKD decomposition with combining marks stripped (u-umlaut becomes u),
 * and the German transliteration digraphs ae/oe/ue collapsed to a/o/u
 * so the umlaut spelling and its ASCII transliteration produce the same
 * token. The fold is applied identically to query tokens and to
 * chunk/filename/tag tokens; these tests pin the shared helper.
 */

import { describe, it, expect } from 'vitest';
import { foldToken, ACRONYM_ALLOWLIST, KEYWORD_STOP_WORDS } from '../SemanticIndexService';

describe('foldToken: umlaut and sharp s folding', () => {
    it('strips umlaut combining marks via NFKD', () => {
        expect(foldToken('über')).toBe('uber');
        expect(foldToken('läuft')).toBe('lauft');
        expect(foldToken('öl')).toBe('ol');
    });

    it('collapses German transliteration digraphs to the same form', () => {
        expect(foldToken('ueber')).toBe('uber');
        expect(foldToken('aendern')).toBe('andern');
        expect(foldToken('oel')).toBe('ol');
    });

    it('folds umlaut spelling and transliteration to an identical token', () => {
        expect(foldToken('über')).toBe(foldToken('ueber'));
        expect(foldToken('ändern')).toBe(foldToken('aendern'));
        expect(foldToken('können')).toBe(foldToken('koennen'));
    });

    it('maps German sharp s to ss', () => {
        expect(foldToken('straße')).toBe('strasse');
        expect(foldToken('größe')).toBe('grosse');
    });

    it('keeps "ue" after q or a vowel (no over-folding)', () => {
        expect(foldToken('quelle')).toBe('quelle');
        expect(foldToken('neue')).toBe('neue');
        expect(foldToken('frauen')).toBe('frauen');
    });

    it('leaves plain ASCII tokens unchanged', () => {
        expect(foldToken('plugin')).toBe('plugin');
        expect(foldToken('zettelkasten')).toBe('zettelkasten');
    });
});

describe('ACRONYM_ALLOWLIST', () => {
    it('contains the agreed short acronyms in lowercase', () => {
        const expected = ['ki', 'ai', 'os', 'ba', 'js', 'db', 'ml', 'ui', 'ux', 'ci', 'it'];
        for (const acro of expected) {
            expect(ACRONYM_ALLOWLIST.has(acro), `missing acronym: ${acro}`).toBe(true);
        }
        expect(ACRONYM_ALLOWLIST.size).toBe(expected.length);
    });

    it('does not contain "re" (would flood the index via hyphen-split re-* words)', () => {
        // tokenize() splits on hyphens, so "re-index", "re-test", "re-run"
        // all shed a "re" token. Allowlisting it would index that noise
        // term in nearly every technical note.
        expect(ACRONYM_ALLOWLIST.has('re')).toBe(false);
    });
});

describe('KEYWORD_STOP_WORDS after folding', () => {
    it('treats folded forms of German stopwords as stopwords', () => {
        expect(KEYWORD_STOP_WORDS.has(foldToken('fuer'))).toBe(true);
        expect(KEYWORD_STOP_WORDS.has(foldToken('für'))).toBe(true);
        expect(KEYWORD_STOP_WORDS.has(foldToken('koennen'))).toBe(true);
        expect(KEYWORD_STOP_WORDS.has(foldToken('können'))).toBe(true);
    });

    it('does not stop-word the folded "uber" (umlaut titles must stay findable)', () => {
        // "ueber" was removed from the stopword list on purpose: after
        // folding it collides with the content word "über" and would make
        // notes like "Über das Projekt" unfindable (bench cases C5 to C7).
        expect(KEYWORD_STOP_WORDS.has('uber')).toBe(false);
        expect(KEYWORD_STOP_WORDS.has(foldToken('über'))).toBe(false);
    });

    it('does not collide with any allowlisted acronym', () => {
        for (const acro of ACRONYM_ALLOWLIST) {
            expect(KEYWORD_STOP_WORDS.has(acro), `stopword collides with acronym: ${acro}`).toBe(false);
        }
    });
});
