/**
 * Typed graph edge labels for search result graph appendices.
 *
 * Frontmatter edges carry the property name they were extracted from
 * (GraphExtractor writes it to the edges table as property_name). The
 * renderers use that name as the edge label so the agent sees the real
 * predicate (for example "Themen" or "Teilnehmer") instead of a generic
 * "(link)". Body wikilinks render as "wikilink", implicit edges as
 * "similar". Properties that express a contradiction additionally set
 * the contradicts flag so renderers can prefix the line with a
 * "[contradicts] " marker.
 *
 * Used by SemanticSearchTool (agent tool) and handleSearchVault (MCP).
 */

import type { GraphNeighbor } from './GraphStore';

/** Matches German and English contradiction property names. */
const CONTRADICTS_PATTERN = /widersprich|widerspruch|contradict/i;

export interface GraphEdgeLabel {
    /** Edge label: frontmatter property name, 'wikilink' or 'similar'. */
    label: string;
    /** True when the property name denotes a contradiction relation. */
    contradicts: boolean;
}

export function getGraphEdgeLabel(edge: Pick<GraphNeighbor, 'linkType' | 'propertyName'>): GraphEdgeLabel {
    if (edge.linkType === 'implicit') {
        return { label: 'similar', contradicts: false };
    }
    if (edge.propertyName) {
        return { label: edge.propertyName, contradicts: CONTRADICTS_PATTERN.test(edge.propertyName) };
    }
    // Body wikilinks (and defensive fallback for explicit edges without
    // a property name, which only frontmatter edges ever carry).
    return { label: 'wikilink', contradicts: false };
}
