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

/**
 * Retrieval wave 1, item 6: reranker call-site keeps the original fusion
 * score in `score` and renders the cross-encoder output as a separate
 * rerank value. Ordering still follows the reranker (rerank wins when
 * present), and a throwing reranker stays fail-open (fused order).
 */
describe('handleSearchVault reranking call-site', () => {
    function rerankPlugin(
        rerankScoreByPath: Record<string, number>,
        opts?: { throwOnRerank?: boolean },
    ): ObsidianAgentPlugin {
        return {
            app: {},
            settings: {
                enableReranking: true,
                enableGraphExpansion: false,
                enableImplicitConnections: false,
            },
            ignoreService: { isIgnored: () => false },
            rerankerService: {
                isLoaded: true,
                rerank: (_q: string, cands: { path: string; text: string; score: number }[]) => {
                    if (opts?.throwOnRerank) return Promise.reject(new Error('rerank boom'));
                    return Promise.resolve(
                        cands
                            .map((c) => ({ ...c, rerankScore: rerankScoreByPath[c.path] ?? 0 }))
                            .sort((a, b) => b.rerankScore - a.rerankScore),
                    );
                },
            },
            implicitConnectionService: undefined,
            graphStore: undefined,
            semanticIndex: {
                isIndexed: true,
                search: async () => [
                    { path: 'Notes/A.md', excerpt: 'excerpt A', score: 0.9 },
                    { path: 'Notes/B.md', excerpt: 'excerpt B', score: 0.8 },
                ],
                keywordSearch: async () => [],
                getChunksByPath: async () => [],
            },
        } as unknown as ObsidianAgentPlugin;
    }

    it('orders by rerank score and renders fusion score plus rerank score', async () => {
        const r = await handleSearchVault(
            rerankPlugin({ 'Notes/A.md': 0.2, 'Notes/B.md': 0.9 }),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        // Reranker output wins the ordering: B before A
        expect(text.indexOf('Notes/B.md')).toBeGreaterThan(-1);
        expect(text.indexOf('Notes/B.md')).toBeLessThan(text.indexOf('Notes/A.md'));
        // Fusion score stays in the score field (RRF: rank 1 = 1/61, rank 2 = 1/62),
        // the rerank output is rendered separately
        expect(text).toContain(`score: ${(1 / 62).toFixed(4)}, rerank: 0.9000`);
        expect(text).toContain(`score: ${(1 / 61).toFixed(4)}, rerank: 0.2000`);
    });

    it('falls back to the fused order when the reranker throws (fail-open)', async () => {
        const r = await handleSearchVault(
            rerankPlugin({}, { throwOnRerank: true }),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        expect(text.indexOf('Notes/A.md')).toBeGreaterThan(-1);
        expect(text.indexOf('Notes/A.md')).toBeLessThan(text.indexOf('Notes/B.md'));
        // No rerank part rendered for un-reranked results
        expect(text).toContain(`score: ${(1 / 61).toFixed(4)})`);
        expect(text).not.toContain('rerank:');
    });
});
