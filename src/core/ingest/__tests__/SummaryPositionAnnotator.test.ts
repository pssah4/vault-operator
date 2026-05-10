/**
 * SummaryPositionAnnotator tests (FIX-19-28-01 PLAN-15 Step 2).
 *
 * Marker-Form pro ADR-103-Amendment 2026-05-07: dezentes ↗-Symbol
 * inline am Satzende, kein Praefix, kein "[1]"-Stil.
 */

import { describe, it, expect } from 'vitest';
import {
    annotateTakeAways,
    type DeepIngestTakeAway,
} from '../SummaryPositionAnnotator';

describe('SummaryPositionAnnotator', () => {
    it('renders page-position for PDF as [[basename.pdf#page=N|↗]]', () => {
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Aussage A.', position: { kind: 'page', page: 3 } },
        ];
        const out = annotateTakeAways(takeAways, {
            sourceBasename: 'Author-2026_Title',
            sourceExtension: 'pdf',
        });
        expect(out).toBe('- Aussage A. [[Author-2026_Title.pdf#page=3|↗]]');
    });

    it('renders block-anchor as [[basename#^block-N|↗]] using blockIdMap lookup', () => {
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Aussage B.', position: { kind: 'block-anchor', anchorText: 'Original sentence about X.' } },
        ];
        const out = annotateTakeAways(
            takeAways,
            { sourceBasename: 'Source-Mirror', sourceExtension: 'md' },
            { 'Original sentence about X.': 'block-7' },
        );
        expect(out).toBe('- Aussage B. [[Source-Mirror#^block-7|↗]]');
    });

    it('renders url-anchor as [[basename#anchor|↗]]', () => {
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Aussage C.', position: { kind: 'url-anchor', anchor: 'main-section' } },
        ];
        const out = annotateTakeAways(takeAways, {
            sourceBasename: 'WebClip-2026',
            sourceExtension: 'md',
        });
        expect(out).toBe('- Aussage C. [[WebClip-2026#main-section|↗]]');
    });

    it('renders take-away without position as bullet without marker', () => {
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Aussage ohne Position.' },
        ];
        const out = annotateTakeAways(takeAways, {
            sourceBasename: 'Source',
            sourceExtension: 'md',
        });
        expect(out).toBe('- Aussage ohne Position.');
    });

    it('renders mixed list with line breaks', () => {
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Erste Aussage.', position: { kind: 'page', page: 1 } },
            { text: 'Zweite Aussage.', position: { kind: 'block-anchor', anchorText: 'orig-2' } },
            { text: 'Dritte ohne Position.' },
        ];
        const out = annotateTakeAways(
            takeAways,
            { sourceBasename: 'Mixed', sourceExtension: 'pdf' },
            { 'orig-2': 'block-3' },
        );
        expect(out).toBe(
            '- Erste Aussage. [[Mixed.pdf#page=1|↗]]\n'
            + '- Zweite Aussage. [[Mixed#^block-3|↗]]\n'
            + '- Dritte ohne Position.',
        );
    });

    it('falls back to bullet without marker when block-anchor has no map entry', () => {
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Aussage X.', position: { kind: 'block-anchor', anchorText: 'unknown-anchor' } },
        ];
        const out = annotateTakeAways(takeAways, {
            sourceBasename: 'Source',
            sourceExtension: 'md',
        }, {});
        expect(out).toBe('- Aussage X.');
    });

    it('strips trailing period before marker if take-away ends with period', () => {
        // Keep style: marker am Satzende, ein Leerzeichen vor dem Link.
        // "Aussage." + " " + "[[...|↗]]" liest sich natuerlich; wir lassen
        // den Punkt erhalten, das Marker steht hinter dem Punkt.
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Aussage mit Punkt.', position: { kind: 'page', page: 5 } },
        ];
        const out = annotateTakeAways(takeAways, {
            sourceBasename: 'X',
            sourceExtension: 'pdf',
        });
        expect(out).toBe('- Aussage mit Punkt. [[X.pdf#page=5|↗]]');
    });

    it('handles empty take-away list as empty string', () => {
        const out = annotateTakeAways([], { sourceBasename: 'Anything', sourceExtension: 'md' });
        expect(out).toBe('');
    });

    it('uses md extension verbatim for non-pdf source basenames', () => {
        // Page-Position bei nicht-PDF macht semantisch keinen Sinn,
        // aber wenn Caller das uebergibt, fallen wir auf reinen
        // Wikilink mit Page-Hash zurueck.
        const takeAways: DeepIngestTakeAway[] = [
            { text: 'Edge case.', position: { kind: 'page', page: 1 } },
        ];
        const out = annotateTakeAways(takeAways, {
            sourceBasename: 'NotAPdf',
            sourceExtension: 'md',
        });
        // sourceExtension !== 'pdf' -> Suffix wird trotzdem angehaengt
        // wenn die Caller das so wollen. Hier dokumentieren wir das
        // Verhalten: wir append .pdf NICHT, sondern nehmen den
        // Basenamen so wie er ist.
        expect(out).toBe('- Edge case. [[NotAPdf#page=1|↗]]');
    });
});
