/**
 * MCP search_vault: regression coverage for the Wave-1 hybrid pipeline.
 *
 * - Typed graph labels (Wave-1, item 5): frontmatter property name, "wikilink"
 *   fallback, "[contradicts] " marker on contradiction properties.
 * - Reranking call-site: keeps the fusion score in `score`, renders the
 *   cross-encoder output as a separate rerank value; fails open on throw.
 * - Three-arm hybrid (Wave-1): tagMatchSearch is called and its results feed
 *   the weighted RRF; opener excerpts (chunkIndex 0) win the display lede;
 *   graph expansion goes through getNeighborsWithImplicit; the new `since`
 *   filter drops notes whose mtime is older than the cutoff.
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
            // Lock weighted fusion off so test assertions on raw RRF scores
            // stay stable (weighted mode renormalizes to [0, 1] + cosine bonus).
            weightedFusionEnabled: false,
        },
        ignoreService: { isIgnored: () => false },
        rerankerService: undefined,
        implicitConnectionService: undefined,
        graphStore: { getNeighborsWithImplicit: () => neighbors, getNeighbors: () => neighbors },
        semanticIndex: {
            isIndexed: true,
            search: async () => [{ path: 'Notes/Meeting.md', excerpt: 'meeting excerpt', score: 0.9 }],
            keywordSearch: async () => [],
            tagMatchSearch: async () => [],
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
        expect(text).toContain('via Notes/Meeting.md (Themen');
    });

    it('labels body edges as wikilink', async () => {
        const r = await handleSearchVault(
            plugin([neighbor({ path: 'Notes/Other.md', linkType: 'body', propertyName: null })]),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        expect(text).toContain('via Notes/Meeting.md (wikilink');
    });

    it('prefixes contradiction edges with a [contradicts] marker', async () => {
        const r = await handleSearchVault(
            plugin([neighbor({ path: 'Notes/Contra.md', linkType: 'frontmatter', propertyName: 'widerspricht' })]),
            { query: 'test query' },
        );
        const text = r.content[0].text;
        expect(text).toContain('[graph] [contradicts] Notes/Contra.md');
        expect(text).toContain('(widerspricht');
    });
});

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
                weightedFusionEnabled: false,
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
                tagMatchSearch: async () => [],
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

// ───────────────────────────────────────────────────────────────────────────
// Wave-1 alignment: tag arm, opener excerpts, since filter,
// getNeighborsWithImplicit. These tests fail on the pre-alignment MCP and
// pass once the pipeline mirrors SemanticSearchTool.
// ───────────────────────────────────────────────────────────────────────────

describe('handleSearchVault Wave-1 alignment', () => {
    it('calls tagMatchSearch as the third arm and surfaces tag-only hits', async () => {
        let tagCallCount = 0;
        const p = {
            app: {},
            settings: {
                enableReranking: false,
                enableGraphExpansion: false,
                enableImplicitConnections: false,
                weightedFusionEnabled: false,
            },
            ignoreService: { isIgnored: () => false },
            rerankerService: undefined,
            implicitConnectionService: undefined,
            graphStore: undefined,
            semanticIndex: {
                isIndexed: true,
                search: async () => [],
                keywordSearch: async () => [],
                tagMatchSearch: async () => {
                    tagCallCount += 1;
                    return [{ path: 'Notes/TagOnly.md', excerpt: 'tag excerpt', score: 0.5 }];
                },
                getChunksByPath: async () => [],
            },
        } as unknown as ObsidianAgentPlugin;
        const r = await handleSearchVault(p, { query: 'roadmap' });
        expect(tagCallCount).toBe(1);
        const text = r.content[0].text;
        expect(text).toContain('Notes/TagOnly.md');
    });

    it('prefers the opener chunk (chunkIndex 0) for the displayed excerpt', async () => {
        const p = {
            app: {},
            settings: {
                enableReranking: false,
                enableGraphExpansion: false,
                enableImplicitConnections: false,
                weightedFusionEnabled: false,
            },
            ignoreService: { isIgnored: () => false },
            rerankerService: undefined,
            implicitConnectionService: undefined,
            graphStore: undefined,
            semanticIndex: {
                isIndexed: true,
                // dense arm matched a mid-paragraph chunk (chunkIndex 3)
                search: async () => [{ path: 'Notes/Long.md', excerpt: 'MID paragraph match', score: 0.9, chunkIndex: 3 }],
                // keyword arm later contributes the opener (chunkIndex 0)
                keywordSearch: async () => [{ path: 'Notes/Long.md', excerpt: 'OPENER lede', score: 0.5, chunkIndex: 0 }],
                tagMatchSearch: async () => [],
                getChunksByPath: async () => [],
            },
        } as unknown as ObsidianAgentPlugin;
        const r = await handleSearchVault(p, { query: 'q' });
        const text = r.content[0].text;
        expect(text).toContain('OPENER lede');
        expect(text).not.toContain('MID paragraph match');
    });

    it('drops results whose mtime is older than the since filter', async () => {
        const fileByPath: Record<string, { stat: { mtime: number } } | undefined> = {
            'Notes/Old.md': { stat: { mtime: new Date('2025-01-01').getTime() } },
            'Notes/Fresh.md': { stat: { mtime: new Date('2026-06-01').getTime() } },
        };
        const p = {
            app: {
                vault: { getFileByPath: (path: string) => fileByPath[path] },
                metadataCache: { getFileCache: () => ({}) },
            },
            settings: {
                enableReranking: false,
                enableGraphExpansion: false,
                enableImplicitConnections: false,
                weightedFusionEnabled: false,
            },
            ignoreService: { isIgnored: () => false },
            rerankerService: undefined,
            implicitConnectionService: undefined,
            graphStore: undefined,
            semanticIndex: {
                isIndexed: true,
                search: async () => [
                    { path: 'Notes/Old.md', excerpt: 'old', score: 0.9 },
                    { path: 'Notes/Fresh.md', excerpt: 'fresh', score: 0.8 },
                ],
                keywordSearch: async () => [],
                tagMatchSearch: async () => [],
                getChunksByPath: async () => [],
            },
        } as unknown as ObsidianAgentPlugin;
        const r = await handleSearchVault(p, { query: 'q', since: '2026-01-01' });
        const text = r.content[0].text;
        expect(text).toContain('Notes/Fresh.md');
        expect(text).not.toContain('Notes/Old.md');
    });

    it('uses getNeighborsWithImplicit and orders by confidence descending', async () => {
        const calls = { withImplicit: 0, plain: 0 };
        const n = (path: string, confidence: number): GraphNeighbor => ({
            path, hopDistance: 1, viaPath: 'Notes/Meeting.md', linkType: 'body', propertyName: null, confidence,
        });
        const p = {
            app: {},
            settings: {
                enableReranking: false,
                enableGraphExpansion: true,
                graphExpansionHops: 1,
                enableImplicitConnections: false,
                weightedFusionEnabled: false,
            },
            ignoreService: { isIgnored: () => false },
            rerankerService: undefined,
            implicitConnectionService: undefined,
            graphStore: {
                getNeighborsWithImplicit: () => {
                    calls.withImplicit += 1;
                    // intentionally unordered so the test catches the
                    // confidence-descending sort
                    return [n('Notes/Weak.md', 0.2), n('Notes/Strong.md', 0.9), n('Notes/Mid.md', 0.5)];
                },
                getNeighbors: () => {
                    calls.plain += 1;
                    return [];
                },
            },
            semanticIndex: {
                isIndexed: true,
                search: async () => [{ path: 'Notes/Meeting.md', excerpt: 'meeting', score: 0.9 }],
                keywordSearch: async () => [],
                tagMatchSearch: async () => [],
                getChunksByPath: async () => ['neighbor chunk'],
            },
        } as unknown as ObsidianAgentPlugin;
        const r = await handleSearchVault(p, { query: 'q' });
        expect(calls.withImplicit).toBe(1);
        expect(calls.plain).toBe(0);
        const text = r.content[0].text;
        // Strong (0.9) must precede Mid (0.5) must precede Weak (0.2)
        const iStrong = text.indexOf('Notes/Strong.md');
        const iMid = text.indexOf('Notes/Mid.md');
        const iWeak = text.indexOf('Notes/Weak.md');
        expect(iStrong).toBeGreaterThan(-1);
        expect(iMid).toBeGreaterThan(iStrong);
        expect(iWeak).toBeGreaterThan(iMid);
        // Confidence is part of the graph-line context line
        expect(text).toContain('confidence: 0.90');
        expect(text).toContain('confidence: 0.50');
        expect(text).toContain('confidence: 0.20');
    });
});
