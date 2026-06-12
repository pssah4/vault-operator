/**
 * Retrieval wave 1, item 5: typed graph labels.
 *
 * Graph appendix lines used to render every explicit edge as the generic
 * "(link)". Frontmatter edges already carry the property name in the edges
 * table (GraphExtractor stores property_name), so the renderers can show
 * the real predicate instead. These tests pin the label contract:
 *  - frontmatter edges -> property name (for example "Themen"),
 *  - body wikilinks -> "wikilink",
 *  - implicit edges -> "similar",
 *  - contradiction properties -> contradicts flag for the line marker.
 */

import { describe, it, expect } from 'vitest';
import { getGraphEdgeLabel } from '../graphEdgeLabel';

describe('getGraphEdgeLabel', () => {
    it('labels frontmatter edges with the real property name', () => {
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'Themen' }))
            .toEqual({ label: 'Themen', contradicts: false });
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'Teilnehmer' }))
            .toEqual({ label: 'Teilnehmer', contradicts: false });
    });

    it('labels body edges as wikilink', () => {
        expect(getGraphEdgeLabel({ linkType: 'body', propertyName: null }))
            .toEqual({ label: 'wikilink', contradicts: false });
    });

    it('labels implicit edges as similar', () => {
        expect(getGraphEdgeLabel({ linkType: 'implicit', propertyName: null }))
            .toEqual({ label: 'similar', contradicts: false });
    });

    it('falls back to wikilink when a frontmatter edge has no property name', () => {
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: null }))
            .toEqual({ label: 'wikilink', contradicts: false });
    });

    it('flags German contradiction properties', () => {
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'widerspricht' }))
            .toEqual({ label: 'widerspricht', contradicts: true });
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'Widerspruch' }).contradicts).toBe(true);
    });

    it('flags English contradiction properties case-insensitively', () => {
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'contradicts' }).contradicts).toBe(true);
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'Contradicted-By' }).contradicts).toBe(true);
    });

    it('does not flag ordinary properties as contradictions', () => {
        expect(getGraphEdgeLabel({ linkType: 'frontmatter', propertyName: 'related' }).contradicts).toBe(false);
        expect(getGraphEdgeLabel({ linkType: 'body', propertyName: null }).contradicts).toBe(false);
    });
});
