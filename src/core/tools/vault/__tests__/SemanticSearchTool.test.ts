/**
 * Retrieval wave 1, item 1: prefer the opener chunk (chunkIndex 0) for
 * search excerpts so the agent sees the lede of a note instead of a
 * random middle paragraph.
 *
 * The excerpt bookkeeping in SemanticSearchTool used to be strictly
 * first-write-wins per path. These tests pin the new contract:
 *  - a result with chunkIndex === 0 provides the rendered excerpt even
 *    when a mid-document chunk arrived first, and
 *  - results without chunkIndex (older code paths, MCP) keep the old
 *    first-write-wins behavior.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { SemanticSearchTool } from '../SemanticSearchTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';
import type { SemanticResult } from '../../../semantic/SemanticIndexService';
import type { GraphNeighbor } from '../../../knowledge/GraphStore';

function ctx(): { ctx: ToolExecutionContext; results: string[]; logs: string[] } {
    const results: string[] = [];
    const logs: string[] = [];
    return {
        ctx: {
            callbacks: {
                pushToolResult: (r: string) => { results.push(r); },
                log: (m: string) => { logs.push(m); },
                handleError: async () => { /* no-op */ },
            },
        } as unknown as ToolExecutionContext,
        results,
        logs,
    };
}

type RerankerStub = {
    rerank: (
        query: string,
        cands: { path: string; text: string; score: number }[],
    ) => Promise<{ path: string; text: string; score: number; rerankScore: number }[]>;
};

function mockPlugin(opts: {
    semanticResults?: SemanticResult[];
    keywordResults?: SemanticResult[];
    tagResults?: SemanticResult[];
    weightedFusionEnabled?: boolean;
    graphNeighbors?: GraphNeighbor[];
    chunksByPath?: Record<string, string[]>;
    rerankerService?: RerankerStub;
}): ObsidianAgentPlugin {
    const { semanticResults = [], keywordResults = [], tagResults = [], graphNeighbors, chunksByPath = {} } = opts;
    return {
        app: {},
        settings: {
            hydeEnabled: false,
            enableReranking: opts.rerankerService !== undefined,
            enableGraphExpansion: graphNeighbors !== undefined,
            enableImplicitConnections: false,
            weightedFusionEnabled: opts.weightedFusionEnabled ?? false,
        },
        apiHandler: undefined,
        rerankerService: opts.rerankerService,
        graphStore: graphNeighbors !== undefined
            ? { getNeighborsWithImplicit: () => graphNeighbors }
            : undefined,
        ontologyStore: undefined,
        implicitConnectionService: undefined,
        semanticIndex: {
            isIndexed: true,
            search: async () => semanticResults,
            keywordSearch: async () => keywordResults,
            tagMatchSearch: async () => tagResults,
            getChunksByPath: async (p: string) => chunksByPath[p] ?? [],
        },
    } as unknown as ObsidianAgentPlugin;
}

describe('SemanticSearchTool excerpt selection (opener chunk preference)', () => {
    it('prefers the opener excerpt (chunkIndex 0) over a mid-document chunk that arrived first', async () => {
        const plugin = mockPlugin({
            // Mid-document chunk arrives first (semantic arm is remembered first)
            semanticResults: [
                { path: 'Notes/A.md', excerpt: 'MIDDLE PARAGRAPH from chunk five', score: 0.9, chunkIndex: 5 },
            ],
            // Opener chunk arrives second (keyword arm)
            keywordResults: [
                { path: 'Notes/A.md', excerpt: 'OPENER LEDE from chunk zero', score: 0.8, chunkIndex: 0 },
            ],
        });
        const tool = new SemanticSearchTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('Notes/A.md');
        expect(out).toContain('OPENER LEDE from chunk zero');
        expect(out).not.toContain('MIDDLE PARAGRAPH from chunk five');
    });

    it('keeps first-write-wins behavior when chunkIndex is undefined (graceful degradation)', async () => {
        const plugin = mockPlugin({
            semanticResults: [
                { path: 'Notes/A.md', excerpt: 'FIRST SEEN excerpt', score: 0.9 },
            ],
            keywordResults: [
                { path: 'Notes/A.md', excerpt: 'SECOND SEEN excerpt', score: 0.8 },
            ],
        });
        const tool = new SemanticSearchTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('FIRST SEEN excerpt');
        expect(out).not.toContain('SECOND SEEN excerpt');
    });

    it('prefers the opener excerpt over an undefined-chunkIndex excerpt that arrived first', async () => {
        const plugin = mockPlugin({
            semanticResults: [
                { path: 'Notes/A.md', excerpt: 'LEGACY excerpt without chunk index', score: 0.9 },
            ],
            tagResults: [
                { path: 'Notes/A.md', excerpt: 'OPENER from tag arm', score: 0.5, chunkIndex: 0 },
            ],
        });
        const tool = new SemanticSearchTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('OPENER from tag arm');
        expect(out).not.toContain('LEGACY excerpt without chunk index');
    });

    it('uses the opener excerpt of each path independently across multiple results', async () => {
        const plugin = mockPlugin({
            semanticResults: [
                { path: 'Notes/A.md', excerpt: 'A middle chunk', score: 0.9, chunkIndex: 3 },
                { path: 'Notes/B.md', excerpt: 'B opener chunk', score: 0.8, chunkIndex: 0 },
            ],
            keywordResults: [
                { path: 'Notes/A.md', excerpt: 'A opener chunk', score: 0.7, chunkIndex: 0 },
                { path: 'Notes/B.md', excerpt: 'B middle chunk', score: 0.6, chunkIndex: 4 },
            ],
        });
        const tool = new SemanticSearchTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('A opener chunk');
        expect(out).toContain('B opener chunk');
        expect(out).not.toContain('A middle chunk');
        expect(out).not.toContain('B middle chunk');
    });
});

/**
 * Retrieval wave 1, item 4: weighted RRF fusion behind weightedFusionEnabled.
 *
 * Shared scenario:
 *  - Dense.md: semantic rank 1 + keyword rank 1 (strong dense+keyword hit)
 *  - Contested.md: keyword rank 2 only
 *  - TagOnly.md: tag rank 1 only
 *
 * Plain RRF ranks TagOnly (1/61) above Contested (1/62). With the tag arm
 * weighted at 0.6 the real keyword match wins.
 */
describe('SemanticSearchTool weighted fusion flag', () => {
    function fusionPlugin(weightedFusionEnabled: boolean): ObsidianAgentPlugin {
        return mockPlugin({
            weightedFusionEnabled,
            semanticResults: [
                { path: 'Notes/Dense.md', excerpt: 'dense excerpt', score: 0.9, chunkIndex: 0 },
            ],
            keywordResults: [
                { path: 'Notes/Dense.md', excerpt: 'dense excerpt', score: 0.8, chunkIndex: 0 },
                { path: 'Notes/Contested.md', excerpt: 'contested excerpt', score: 0.5, chunkIndex: 0 },
            ],
            tagResults: [
                { path: 'Notes/TagOnly.md', excerpt: 'tag only excerpt', score: 1.0, chunkIndex: 0 },
            ],
        });
    }

    it('flag off keeps the old ordering (tag-only rank 1 above keyword rank 2)', async () => {
        const tool = new SemanticSearchTool(fusionPlugin(false));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out.indexOf('Notes/Dense.md')).toBeGreaterThan(-1);
        expect(out.indexOf('Notes/TagOnly.md')).toBeGreaterThan(-1);
        expect(out.indexOf('Notes/Contested.md')).toBeGreaterThan(-1);
        // Legacy plain RRF: TagOnly (1/61) renders before Contested (1/62).
        expect(out.indexOf('Notes/TagOnly.md')).toBeLessThan(out.indexOf('Notes/Contested.md'));
    });

    it('flag on: tag-only hit no longer outranks the keyword hit', async () => {
        const tool = new SemanticSearchTool(fusionPlugin(true));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out.indexOf('Notes/Dense.md')).toBeGreaterThan(-1);
        expect(out.indexOf('Notes/TagOnly.md')).toBeGreaterThan(-1);
        expect(out.indexOf('Notes/Contested.md')).toBeGreaterThan(-1);
        // Weighted: Contested (1/62) renders before TagOnly (0.6/61).
        expect(out.indexOf('Notes/Contested.md')).toBeLessThan(out.indexOf('Notes/TagOnly.md'));
        // The strong dense+keyword hit stays on top.
        expect(out.indexOf('Notes/Dense.md')).toBeLessThan(out.indexOf('Notes/Contested.md'));
    });

    it('flag on keeps tag recall (tag-only hit still listed)', async () => {
        const tool = new SemanticSearchTool(fusionPlugin(true));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        expect(results[0]).toContain('Notes/TagOnly.md');
    });
});

/**
 * Retrieval wave 1, item 5: typed graph labels in the graph appendix.
 *
 * Graph neighbors used to render as "via [[X]] (link, confidence: 1.00)"
 * even though frontmatter edges carry the property name in the DB. The
 * appendix now shows the real predicate (for example "Themen"), labels
 * body wikilinks as "wikilink" and marks contradiction edges with a
 * "[contradicts] " prefix.
 */
describe('SemanticSearchTool graph appendix labels (typed predicates)', () => {
    function graphPlugin(neighbor: GraphNeighbor): ObsidianAgentPlugin {
        return mockPlugin({
            semanticResults: [
                { path: 'Notes/Meeting.md', excerpt: 'meeting excerpt', score: 0.9, chunkIndex: 0 },
            ],
            graphNeighbors: [neighbor],
            chunksByPath: { [neighbor.path]: ['neighbor chunk content'] },
        });
    }

    it('labels frontmatter edges with the real property name instead of link', async () => {
        const tool = new SemanticSearchTool(graphPlugin({
            path: 'Notes/Projekt X.md',
            hopDistance: 1,
            viaPath: 'Notes/Meeting.md',
            linkType: 'frontmatter',
            propertyName: 'Themen',
            confidence: 1.0,
        }));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('(Themen, confidence: 1.00)');
        expect(out).not.toContain('(link,');
    });

    it('labels body edges as wikilink', async () => {
        const tool = new SemanticSearchTool(graphPlugin({
            path: 'Notes/Other.md',
            hopDistance: 1,
            viaPath: 'Notes/Meeting.md',
            linkType: 'body',
            propertyName: null,
            confidence: 1.0,
        }));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('(wikilink, confidence: 1.00)');
        expect(out).not.toContain('(link,');
    });

    it('prefixes contradiction edges with a [contradicts] marker', async () => {
        const tool = new SemanticSearchTool(graphPlugin({
            path: 'Notes/Contra.md',
            hopDistance: 1,
            viaPath: 'Notes/Meeting.md',
            linkType: 'frontmatter',
            propertyName: 'widerspricht',
            confidence: 1.0,
        }));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('[contradicts] [[Contra]]');
        expect(out).toContain('(widerspricht, confidence: 1.00)');
    });

    it('keeps the similar label for implicit edges', async () => {
        const tool = new SemanticSearchTool(graphPlugin({
            path: 'Notes/Sim.md',
            hopDistance: 1,
            viaPath: 'Notes/Meeting.md',
            linkType: 'implicit',
            propertyName: null,
            confidence: 0.83,
        }));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out).toContain('(similar, confidence: 0.83)');
        expect(out).not.toContain('[contradicts]');
    });
});

/**
 * Retrieval wave 1, item 6: reranker call-site keeps the original fusion
 * score in `score`, carries the cross-encoder output in `rerankScore`,
 * and orders results by the reranker output (rerank wins when present).
 * A throwing reranker stays fail-open: the fused order passes through.
 */
describe('SemanticSearchTool reranking call-site', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function rerankStub(rerankScoreByPath: Record<string, number>): RerankerStub & {
        received: { path: string; text: string; score: number }[][];
    } {
        const received: { path: string; text: string; score: number }[][] = [];
        return {
            received,
            rerank: (_q: string, cands: { path: string; text: string; score: number }[]) => {
                received.push(cands.map((c) => ({ ...c })));
                return Promise.resolve(
                    cands
                        .map((c) => ({ ...c, rerankScore: rerankScoreByPath[c.path] ?? 0 }))
                        .sort((a, b) => b.rerankScore - a.rerankScore),
                );
            },
        };
    }

    function twoResultPlugin(reranker: RerankerStub): ObsidianAgentPlugin {
        return mockPlugin({
            semanticResults: [
                { path: 'Notes/A.md', excerpt: 'excerpt A', score: 0.9, chunkIndex: 0 },
                { path: 'Notes/B.md', excerpt: 'excerpt B', score: 0.8, chunkIndex: 0 },
            ],
            rerankerService: reranker,
        });
    }

    it('orders results by rerank score (rerank wins when present)', async () => {
        const stub = rerankStub({ 'Notes/A.md': 0.1, 'Notes/B.md': 0.9 });
        const tool = new SemanticSearchTool(twoResultPlugin(stub));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out.indexOf('Notes/B.md')).toBeGreaterThan(-1);
        expect(out.indexOf('Notes/B.md')).toBeLessThan(out.indexOf('Notes/A.md'));
    });

    it('passes the original fusion scores into the reranker', async () => {
        const stub = rerankStub({ 'Notes/A.md': 0.1, 'Notes/B.md': 0.9 });
        const tool = new SemanticSearchTool(twoResultPlugin(stub));
        const { ctx: c } = ctx();
        await tool.execute({ query: 'test query' }, c);

        // Plain RRF (flag off in mockPlugin): semantic rank 1 = 1/61, rank 2 = 1/62
        expect(stub.received).toHaveLength(1);
        expect(stub.received[0][0].path).toBe('Notes/A.md');
        expect(stub.received[0][0].score).toBeCloseTo(1 / 61, 10);
        expect(stub.received[0][1].score).toBeCloseTo(1 / 62, 10);
    });

    it('keeps the fused order when the reranker throws (fail-open)', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const throwing: RerankerStub = {
            rerank: () => Promise.reject(new Error('rerank boom')),
        };
        const tool = new SemanticSearchTool(twoResultPlugin(throwing));
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        const out = results[0];
        expect(out.indexOf('Notes/A.md')).toBeGreaterThan(-1);
        expect(out.indexOf('Notes/A.md')).toBeLessThan(out.indexOf('Notes/B.md'));
    });
});

/**
 * Post-review fix (retrieval wave 1): the cross-encoder must judge the
 * chunk that actually matched the query, not the opener lede that item 1
 * promotes for display. Feeding the opener to the reranker would make it
 * score query relevance against the wrong passage for long notes whose
 * best hit sits mid-document.
 */
describe('SemanticSearchTool reranker input (matched chunk, not opener)', () => {
    it('feeds the matched chunk to the cross-encoder and still renders the opener', async () => {
        const received: { path: string; text: string; score: number }[][] = [];
        const rerankerService: RerankerStub = {
            rerank: (_q: string, cands: { path: string; text: string; score: number }[]) => {
                received.push(cands.map((c) => ({ ...c })));
                return Promise.resolve(cands.map((c) => ({ ...c, rerankScore: 0.5 })));
            },
        };
        const plugin = mockPlugin({
            // Semantic arm matched a mid-document chunk (first write, so it
            // is the fallback/matched excerpt). The keyword arm contributes
            // the opener for display.
            semanticResults: [
                { path: 'Notes/A.md', excerpt: 'MATCHED middle chunk', score: 0.9, chunkIndex: 5 },
            ],
            keywordResults: [
                { path: 'Notes/A.md', excerpt: 'OPENER lede chunk', score: 0.8, chunkIndex: 0 },
                { path: 'Notes/B.md', excerpt: 'B matched chunk', score: 0.5, chunkIndex: 2 },
            ],
            rerankerService,
        });
        const tool = new SemanticSearchTool(plugin);
        const { ctx: c, results } = ctx();
        await tool.execute({ query: 'test query' }, c);

        // Cross-encoder input is the matched chunk, not the opener.
        expect(received).toHaveLength(1);
        const texts = received[0].map((cand) => cand.text);
        expect(texts).toContain('MATCHED middle chunk');
        expect(texts).not.toContain('OPENER lede chunk');
        // Rendered output still prefers the opener for display.
        expect(results[0]).toContain('OPENER lede chunk');
        expect(results[0]).not.toContain('MATCHED middle chunk');
    });
});
