/**
 * Hallucination Brake regression tests (FEATURE-1804 / ADR-090).
 *
 * Reproduces the GenAI-Push-Synthese run where the agent wrote a Quellen:
 * frontmatter listing 7 wikilinks but had only read 4 files. The brake must
 * report exactly the unread 3 -- not over-match via substring fallback,
 * not under-match because of YAML quoting / indentation.
 */

import { describe, it, expect } from 'vitest';
import { scanUnreadSources } from '..';

describe('scanUnreadSources (FEATURE-1804 / ADR-090)', () => {
    const readFiles = new Set<string>([
        'Inbox/GenAI Push Interview - Asset Radar.md',
        'Inbox/GenAI Push Interview - Erzeugung Hochspannung.md',
        'Inbox/GenAI Push Interview - Use Case Answer AI (Nele App).md',
        'Inbox/GenAI Push Interview Insights.md',
    ]);

    it('flags unread Quellen wikilinks in YAML frontmatter (the actual regression)', () => {
        const content = `---
Zusammenfassung: Konsolidierte Synthese
Quellen:
  - "[[GenAI Push Interview - Asset Radar]]"
  - "[[GenAI Push Interview - Erzeugung Hochspannung]]"
  - "[[GenAI Push Interview - Use Case Answer AI (Nele App)]]"
  - "[[GenAI Push Interview - Use Case Chatbot Netze]]"
  - "[[GenAI Push Interview - Use Case Enny HR-Chatbot]]"
  - "[[GenAI Push Interview - Use Case Genehmigungsmanagement (Erzeugung)]]"
  - "[[GenAI Push Interview - Use Case NKB Vision]]"
  - "[[GenAI Push Interview Insights]]"
Kategorie:
  - Notiz
---

# Synthese`;
        const unread = scanUnreadSources({ path: 'Inbox/x.md', content }, readFiles);
        expect(unread).toContain('GenAI Push Interview - Use Case Chatbot Netze');
        expect(unread).toContain('GenAI Push Interview - Use Case Enny HR-Chatbot');
        expect(unread).toContain('GenAI Push Interview - Use Case Genehmigungsmanagement (Erzeugung)');
        expect(unread).toContain('GenAI Push Interview - Use Case NKB Vision');
        expect(unread).not.toContain('GenAI Push Interview - Asset Radar');
        expect(unread).not.toContain('GenAI Push Interview Insights');
        expect(unread).toHaveLength(4);
    });

    it('does not over-match via substring (no false positives)', () => {
        const content = `---
Quellen:
  - "[[Use Case Chatbot]]"
---`;
        const reads = new Set(['Inbox/Some Other Note Use Case Chatbot is mentioned here.md']);
        const unread = scanUnreadSources({ content }, reads);
        // The previous bug matched via p.includes(ref) -- now it must flag.
        expect(unread).toContain('Use Case Chatbot');
    });

    it('returns empty when there is no Quellen block', () => {
        const content = `---\nfoo: bar\n---\n# Hello`;
        expect(scanUnreadSources({ content }, readFiles)).toEqual([]);
    });

    it('handles update_frontmatter inputs (updates.Quellen array)', () => {
        const input = {
            path: 'x.md',
            updates: {
                Quellen: ['[[GenAI Push Interview - Asset Radar]]', '[[GenAI Push Interview - Use Case NKB Vision]]'],
            },
        };
        const unread = scanUnreadSources(input, readFiles);
        expect(unread).toContain('GenAI Push Interview - Use Case NKB Vision');
        expect(unread).not.toContain('GenAI Push Interview - Asset Radar');
    });

    it('strips a trailing .md from a wikilink target', () => {
        const content = `---\nQuellen:\n  - "[[GenAI Push Interview - Asset Radar.md]]"\n---`;
        expect(scanUnreadSources({ content }, readFiles)).toEqual([]);
    });

    it('flags document-shaped wikilinks under a "## Quellen" heading in body', () => {
        const content = `---
Zusammenfassung: x
---

# Synthese

## Quellen

- [[GenAI Push Interview - Asset Radar]]
- [[GenAI Push Interview - Use Case Chatbot Netze]]
- [[Magda Krumova]]
`;
        const unread = scanUnreadSources({ content }, readFiles);
        // Asset Radar IS read, Chatbot Netze is NOT
        expect(unread).toContain('GenAI Push Interview - Use Case Chatbot Netze');
        expect(unread).not.toContain('GenAI Push Interview - Asset Radar');
        // Person wikilink should NOT be flagged in body (not document-shaped)
        expect(unread).not.toContain('Magda Krumova');
    });

    it('flags document-shaped wikilinks in citation-table columns', () => {
        const content = `---
Zusammenfassung: x
---

| # | Use Case | Gesprächspartner | Status |
|---|----------|-------------------|--------|
| 1 | Asset Radar | [[GenAI Push Interview - Asset Radar]] | done |
| 2 | NKB Vision | [[GenAI Push Interview - Use Case NKB Vision]] | wip |
| 3 | Person | [[Magda Krumova]] | done |
`;
        const unread = scanUnreadSources({ content }, readFiles);
        expect(unread).toContain('GenAI Push Interview - Use Case NKB Vision');
        expect(unread).not.toContain('GenAI Push Interview - Asset Radar');
        // Person wikilinks must not be flagged from body table
        expect(unread).not.toContain('Magda Krumova');
    });

    it('does NOT flag random body wikilinks outside citation contexts', () => {
        const content = `---
Zusammenfassung: x
---

# Random text

See also [[GenAI Push Interview - Use Case NKB Vision]] for context.
`;
        // Should NOT flag -- not in a citation section
        const unread = scanUnreadSources({ content }, readFiles);
        expect(unread).toEqual([]);
    });

    it('also matches Sources / References / Referenzen headers', () => {
        const content = `---
Sources:
  - "[[Note A]]"
References:
  - "[[Note B]]"
Referenzen:
  - "[[Note C]]"
---`;
        const unread = scanUnreadSources({ content }, new Set());
        expect(unread).toEqual(expect.arrayContaining(['Note A', 'Note B', 'Note C']));
    });
});
