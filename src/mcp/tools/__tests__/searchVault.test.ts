/**
 * Retrieval wave 1, item 5: typed graph labels in the MCP search_vault
 * graph appendix. Mirrors the SemanticSearchTool change: frontmatter
 * edges show the real property name, body edges show "wikilink", and
 * contradiction properties get a "[contradicts] " marker.
 */

import { describe, it, expect } from 'vitest';
import { handleSearchVault } from '../searchVault';
import type ObsidianAgentPlugin from '../../../main';
import type { GraphNeighbor } from '../../../core/knowledge/GraphStore';

function plugin(neighbors: GraphNeighbor[]): ObsidianAgentPlugin {
    return {
        app: {},
        settings: {
            enableReranking: false,
            enableGraphExpansion: true,
            graphExpansionHops: 1,
            enableImplicitConnections: false,
        },
        ignoreService: { isIgnored: () => false },
        rerankerService: undefined,
        implicitConnectionService: undefined,
        graphStore: { getNeighbors: () => neighbors },
        semanticIndex: {
            isIndexed: true,
            search: async () => [{ path: 'Notes/Meeting.md', excerpt: 'meeting excerpt', score: 0.9 }],
            keywordSearch: async () => [],
            getChunksByPath: async (p: string) => (p === 'Notes/Meeting.md' ? [] : ['neighbor chunk']),
        },
    } as unknown as ObsidianAgentPlugin;
}

function neighbor(overrides: Partial<GraphNeighbor>): GraphNeighbor {
    return {
        path: 'Notes/Neighbor.md',
        hopDistance: 1,
        viaPath: 'Notes/Meeting.md',
        linkType: 'body',
        propertyName: null,
        confidence: 1.0,
        ...overrides,
    };
}

describe('handleSearchVault graph appendix labels (typed predicates)', () => {
    it('labels frontmatter edges with the real property name', async () => {
        const r = await handleSearchVault(
            plugin([neighbor({ path: 'Notes/Projekt X.md', linkType: 'frontmatter', propertyName: 'Themen' })]),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        expect(text).toContain('via Notes/Meeting.md (Themen)');
    });

    it('labels body edges as wikilink', async () => {
        const r = await handleSearchVault(
            plugin([neighbor({ path: 'Notes/Other.md', linkType: 'body', propertyName: null })]),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        expect(text).toContain('via Notes/Meeting.md (wikilink)');
    });

    it('prefixes contradiction edges with a [contradicts] marker', async () => {
        const r = await handleSearchVault(
            plugin([neighbor({ path: 'Notes/Contra.md', linkType: 'frontmatter', propertyName: 'widerspricht' })]),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        expect(text).toContain('[graph] [contradicts] Notes/Contra.md');
        expect(text).toContain('(widerspricht)');
    });
});
