/**
 * IngestDocumentTool helper tests (FIX-19-28-01 PLAN-15 Step 5).
 *
 * Verifiziert die Position-Marker-Check-Logik und das Page-Heading-
 * Counting im Tool-Output. Die Tool-Description-Aenderung wird nicht
 * via Test gegen den Definition-String verifiziert (zu fragiles
 * Plain-Text-Match), sondern via Code-Review.
 */

import { describe, it, expect } from 'vitest';
import { checkPositionMarkers, countPageHeadings } from '../IngestDocumentTool';

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
    });
});
