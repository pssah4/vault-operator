/**
 * IngestDocumentTool helper tests (FIX-19-28-01 PLAN-15 Step 5).
 *
 * Verifiziert die Position-Marker-Check-Logik und das Page-Heading-
 * Counting im Tool-Output. Die Tool-Description-Aenderung wird nicht
 * via Test gegen den Definition-String verifiziert (zu fragiles
 * Plain-Text-Match), sondern via Code-Review.
 */

import { describe, it, expect } from 'vitest';
import { checkPositionMarkers, countPageHeadings, findDeadPageRefs, basenameOf } from '../IngestDocumentTool';

describe('IngestDocumentTool helpers', () => {
    describe('countPageHeadings', () => {
        it('zaehlt mehrere ## Page N im Text', () => {
            const text = '## Page 1\n\nA\n\n## Page 2\n\nB\n\n## Page 3\n\nC';
            expect(countPageHeadings(text)).toBe(3);
        });
        it('zaehlt 0 wenn keine Page-Headings', () => {
            expect(countPageHeadings('No pages here.')).toBe(0);
        });
        it('zaehlt nur Headings am Zeilenanfang', () => {
            const text = 'inline ## Page 1\n## Page 2';
            expect(countPageHeadings(text)).toBe(1);
        });
    });

    describe('checkPositionMarkers', () => {
        it('zaehlt Kernaussagen mit ↗-Markern korrekt', () => {
            const header = `# Note\n\n## Overview\n\nIntro.\n\n## Kernaussagen\n\n`
                + `- Aussage A. [[X.pdf#page=1|↗]]\n`
                + `- Aussage B. [[X.pdf#page=2|↗]]\n`
                + `- Aussage C ohne Marker.\n`;
            const r = checkPositionMarkers(header);
            expect(r.kernaussagen).toBe(3);
            expect(r.withMarker).toBe(2);
        });

        it('erkennt englische Section-Variante "Key Take-aways"', () => {
            const header = `## Key Take-aways\n\n- A. [[X#^block-1|↗]]\n- B. [[X#^block-2|↗]]\n`;
            const r = checkPositionMarkers(header);
            expect(r.kernaussagen).toBe(2);
            expect(r.withMarker).toBe(2);
        });

        it('liefert kernaussagen=0 wenn Section fehlt', () => {
            const header = `# Note\n\n## Overview\n\n- intro point\n`;
            const r = checkPositionMarkers(header);
            expect(r.kernaussagen).toBe(0);
        });

        it('zaehlt nur die Kernaussagen-Section, nicht andere Bullets', () => {
            const header = `## Overview\n\n- foo\n\n## Kernaussagen\n\n- A. [[X#page=1|↗]]\n\n## Notes\n\n- not counted\n`;
            const r = checkPositionMarkers(header);
            expect(r.kernaussagen).toBe(1);
            expect(r.withMarker).toBe(1);
        });

        it('akzeptiert sowohl - als auch * als Bullet', () => {
            const header = `## Kernaussagen\n\n- A. [[X#page=1|↗]]\n* B. [[X#page=2|↗]]\n`;
            const r = checkPositionMarkers(header);
            expect(r.kernaussagen).toBe(2);
            expect(r.withMarker).toBe(2);
        });

        // FIX-19-28-06: Karpathy-Pattern setzt Block-Anchor `^slug` als
        // Eigen-Anchor an jeden Bullet. Vor dem Fix matched die Regex
        // `\s*$` nach `]]` nicht und der Bullet zaehlte als ohne-Marker.
        it('zaehlt Marker auch wenn ein Block-Anchor folgt (Karpathy-Pattern)', () => {
            const header = `## Kernaussagen\n\n`
                + `- Aussage A. [[X#Page 1|↗]] ^seg-a\n`
                + `- Aussage B. [[X#Page 2|↗]] ^seg-b\n`
                + `- Aussage C. [[X#Page 3|↗]]\n`;
            const r = checkPositionMarkers(header);
            expect(r.kernaussagen).toBe(3);
            expect(r.withMarker).toBe(3);
        });
    });

    describe('basenameOf', () => {
        it('extrahiert Basename ohne .md', () => {
            expect(basenameOf('Notes/Webb-2026.md')).toBe('Webb-2026');
            expect(basenameOf('Webb-2026.md')).toBe('Webb-2026');
        });
        it('liefert den Stem auch ohne Ordner', () => {
            expect(basenameOf('EnBW Geschaeftsbericht 2025.md')).toBe('EnBW Geschaeftsbericht 2025');
        });
    });

    describe('findDeadPageRefs', () => {
        it('erkennt Page-Number > pageCount als dead', () => {
            const header = `## Kernaussagen\n\n- A. [[Webb-2026#Page 87|↗]]\n`;
            const dead = findDeadPageRefs(header, 'Webb-2026', 60);
            expect(dead).toHaveLength(1);
            expect(dead[0].reason).toContain('exceeds source pageCount 60');
        });

        it('erkennt Basename-Mismatch als dead', () => {
            const header = `## Kernaussagen\n\n- A. [[Wrong Basename#Page 5|↗]]\n`;
            const dead = findDeadPageRefs(header, 'Webb-2026', 100);
            expect(dead).toHaveLength(1);
            expect(dead[0].reason).toContain('does not match output basename');
        });

        it('akzeptiert valide Refs (Basename matcht, Page in Range)', () => {
            const header = `## Kernaussagen\n\n`
                + `- A. [[Webb-2026#Page 5|↗]]\n`
                + `- B. [[Webb-2026#Page 87|↗]] ^seg-b\n`;
            const dead = findDeadPageRefs(header, 'Webb-2026', 100);
            expect(dead).toHaveLength(0);
        });

        it('ignoriert Refs ausserhalb der Kernaussagen-Section', () => {
            const header = `## Overview\n\n- See [[Wrong#Page 999|↗]]\n\n## Kernaussagen\n\n- A. [[OK#Page 1|↗]]\n`;
            const dead = findDeadPageRefs(header, 'OK', 5);
            expect(dead).toHaveLength(0);
        });

        it('listet alle dead Refs auf, nicht nur den ersten', () => {
            const header = `## Kernaussagen\n\n`
                + `- A. [[Wrong#Page 87|↗]]\n`
                + `- B. [[Webb-2026#Page 999|↗]]\n`;
            const dead = findDeadPageRefs(header, 'Webb-2026', 60);
            expect(dead).toHaveLength(2);
        });

        it('skippt Block-Anchor-Refs (#^block-N) und URL-Anchor-Refs', () => {
            const header = `## Kernaussagen\n\n`
                + `- A. [[X#^block-1|↗]]\n`
                + `- B. [[X#anchor|↗]]\n`;
            const dead = findDeadPageRefs(header, 'X', 5);
            expect(dead).toHaveLength(0);
        });
    });
});
