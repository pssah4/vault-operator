/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * search_vault -- MCP entry point onto the same Wave-1 hybrid pipeline the
 * internal semantic_search tool uses (weighted RRF over semantic + keyword +
 * tag arms, opener-chunk excerpts, cross-encoder reranking, confidence-sorted
 * graph + implicit expansion). Capsules the full retrieval pipeline in one MCP
 * call so external clients see the same quality the in-plugin agent sees.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { wrapVaultContentForMcp } from '../McpBridge';
import { getGraphEdgeLabel } from '../../core/knowledge/graphEdgeLabel';
import { fuseHybridArms } from '../../core/semantic/weightedFusion';
import type { SemanticResult } from '../../core/semantic/SemanticIndexService';

export async function handleSearchVault(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const query = typeof args.query === 'string' ? args.query : '';
    if (!query.trim()) {
        return { content: [{ type: 'text', text: 'Error: query parameter is required' }], isError: true };
    }

    const semanticIndex = plugin.semanticIndex;
    if (!semanticIndex?.isIndexed) {
        return { content: [{ type: 'text', text: 'Semantic index not built. Enable and build the index in Vault Operator settings.' }], isError: true };
    }

    const topK = Math.min(Number(args.top_k) || 8, 20);
    const folderFilter = (args.folder as string)?.trim() || undefined;
    const tagsFilter = Array.isArray(args.tags)
        ? (args.tags as string[]).map(t => t.replace(/^#/, '').toLowerCase())
        : undefined;
    const sinceFilter: number | undefined = typeof args.since === 'string' && args.since
        ? new Date(args.since).getTime()
        : undefined;
    const hasFilter = !!(folderFilter || tagsFilter || sinceFilter);
    // Request more candidates when filters are active so we still return topK after filtering.
    const searchK = hasFilter ? Math.min(topK * 4, 80) : Math.min(topK * 3, 40);

    // AUDIT-013 H-2: never return ignored paths to MCP clients. The
    // semantic index, keyword fallback, graph expansion and implicit
    // connections all bypass IgnoreService at retrieval time, so we must
    // filter every result stream here at the boundary.
    const ignoreService = plugin.ignoreService;
    const isIgnored = (p: string) => ignoreService.isIgnored(p);

    try {
        // ── Hybrid search: three signals (semantic + keyword + tag) in parallel ──
        // tagMatchSearch is the Wave-1 third arm; it lifts notes whose tags
        // overlap the query tokens. Older callers ran two arms only, which let
        // a strong tag note miss entirely.
        const tagSearch = typeof semanticIndex.tagMatchSearch === 'function'
            ? semanticIndex.tagMatchSearch(query, searchK)
            : Promise.resolve([] as SemanticResult[]);
        const [semanticResults, keywordResults, tagResults] = await Promise.all([
            semanticIndex.search(query, searchK, undefined, { adjacentChunks: 1, adjacentThreshold: 0.3, maxPerFile: 2 }),
            semanticIndex.keywordSearch(query, searchK),
            tagSearch,
        ]);

        // Cache excerpts per path so the fused result can pick the best
        // available text. Prefer the opener chunk (chunkIndex 0) so the MCP
        // client sees the lede of a note instead of a random middle paragraph.
        // Results without chunkIndex (legacy code paths) only feed the fallback
        // map, which keeps the first-write-wins behavior (cosine > keyword > tag).
        const openerExcerptByPath = new Map<string, string>();
        const fallbackExcerptByPath = new Map<string, string>();
        const remember = (path: string, text: string, chunkIndex?: number) => {
            if (!text) return;
            if (chunkIndex === 0 && !openerExcerptByPath.has(path)) openerExcerptByPath.set(path, text);
            if (!fallbackExcerptByPath.has(path)) fallbackExcerptByPath.set(path, text);
        };
        for (const r of semanticResults) remember(r.path, r.excerpt, r.chunkIndex);
        for (const r of keywordResults) remember(r.path, r.excerpt, r.chunkIndex);
        for (const r of tagResults) remember(r.path, r.excerpt, r.chunkIndex);
        const excerptFor = (path: string): string =>
            openerExcerptByPath.get(path) ?? fallbackExcerptByPath.get(path) ?? '';
        // The chunk that actually matched the query (first-write-wins across
        // arms, the pre-wave behavior). The cross-encoder must judge THIS
        // text, not the opener lede promoted for display.
        const matchedExcerptFor = (path: string): string =>
            fallbackExcerptByPath.get(path) ?? openerExcerptByPath.get(path) ?? '';

        // Weighted RRF (Wave-1, item 4): tag arm down-weighted to 0.6 so a
        // tag-only hit can no longer outvote a real body match, plus a
        // bonus-only cosine blend that lifts dense-validated paths without
        // demoting keyword/tag-only ones. Flag-off reproduces plain 3-arm RRF.
        const weightedFusion = plugin.settings.weightedFusionEnabled !== false;
        const cosineByPath = new Map<string, number>();
        if (weightedFusion) {
            for (const r of semanticResults) {
                if (!Number.isFinite(r.score)) continue;
                const prev = cosineByPath.get(r.path);
                if (prev === undefined || r.score > prev) cosineByPath.set(r.path, r.score);
            }
        }
        const fused = fuseHybridArms(
            {
                semantic: semanticResults.map(r => r.path),
                keyword: keywordResults.map(r => r.path),
                tag: tagResults.map(r => r.path),
            },
            { weighted: weightedFusion, cosineByPath },
        );

        type FusedEntry = { path: string; excerpt: string; score: number; method: string; rerankScore?: number };
        const classify = (contribs: Record<string, number>): string => {
            const signals = Object.keys(contribs).filter(k => contribs[k] > 0);
            if (signals.length >= 2) return 'hybrid';
            if (signals[0] === 'semantic') return 'semantic';
            return 'keyword';
        };

        let results: FusedEntry[] = fused.map(f => ({
            path: f.id,
            excerpt: excerptFor(f.id),
            score: f.score,
            method: classify(f.contributions),
        }));

        // Drop ignored paths early so downstream slices and graph walks stay
        // inside the policy boundary.
        results = results.filter(r => !isIgnored(r.path));

        // ── Metadata filters ────────────────────────────────────────────────
        if (folderFilter) {
            const prefix = folderFilter.replace(/\/$/, '') + '/';
            results = results.filter(r => r.path.startsWith(prefix));
        }
        if (tagsFilter) {
            results = results.filter(r => {
                const file = plugin.app.vault.getFileByPath(r.path);
                if (!file) return false;
                const cache = plugin.app.metadataCache.getFileCache(file);
                const raw = cache?.frontmatter?.tags ?? [];
                const fileTags: string[] = (Array.isArray(raw) ? raw : [raw]).map((t: unknown) => String(t).replace(/^#/, '').toLowerCase());
                return tagsFilter.some(t => fileTags.includes(t));
            });
        }
        if (sinceFilter) {
            results = results.filter(r => {
                const file = plugin.app.vault.getFileByPath(r.path);
                return (file?.stat?.mtime ?? 0) >= sinceFilter;
            });
        }

        // ── Local Reranking: feed the matched excerpt so relevance is judged
        // against the chunk that actually matched, not the opener lede used
        // for display.
        const reranker = plugin.rerankerService;
        if (reranker?.isLoaded && plugin.settings.enableReranking && results.length > 1) {
            try {
                const toRerank = results.slice(0, plugin.settings.rerankCandidates ?? 20);
                const reranked = await reranker.rerank(
                    query,
                    toRerank.map(r => ({ path: r.path, text: matchedExcerptFor(r.path) || r.excerpt, score: r.score })),
                );
                // Keep the original fusion score in `score`; the cross-encoder
                // output rides along as `rerankScore`. Ordering still follows
                // the reranker (the service sorts by rerankScore). The rendered
                // excerpt keeps the opener preference.
                results = reranked.map(r => ({
                    path: r.path,
                    excerpt: excerptFor(r.path) || r.text,
                    score: r.score,
                    rerankScore: r.rerankScore,
                    method: 'reranked',
                }));
            } catch { /* fail-open: keep fused order */ }
        }

        results = results.slice(0, topK);

        // ── Graph expansion: confidence-weighted neighbor lookup (Wave-1).
        // getNeighborsWithImplicit() returns both explicit edges (confidence=1.0)
        // and implicit edges (confidence=cosine similarity); strongly connected
        // notes appear first.
        const graphStore = plugin.graphStore;
        const graphLines: string[] = [];
        if (graphStore && plugin.settings.enableGraphExpansion) {
            const hops = Math.min(plugin.settings.graphExpansionHops ?? 1, 3);
            const topKPaths = new Set(results.map(r => r.path));
            const seenGraph = new Set<string>();
            for (const r of results) {
                if (graphLines.length >= 5) break;
                const neighbors = typeof graphStore.getNeighborsWithImplicit === 'function'
                    ? graphStore.getNeighborsWithImplicit(r.path, hops, 10).slice().sort((a, b) => b.confidence - a.confidence)
                    : graphStore.getNeighbors(r.path, hops, 10);
                for (const n of neighbors) {
                    if (topKPaths.has(n.path) || seenGraph.has(n.path) || graphLines.length >= 5) continue;
                    if (isIgnored(n.path)) continue; // AUDIT-013 H-2
                    seenGraph.add(n.path);
                    const chunks = await semanticIndex.getChunksByPath(n.path);
                    if (chunks.length === 0) continue;
                    // Typed graph labels (Wave-1, item 5): frontmatter
                    // predicate or 'wikilink', plus contradiction marker.
                    const edgeLabel = getGraphEdgeLabel(n);
                    const marker = edgeLabel.contradicts ? '[contradicts] ' : '';
                    const confPart = typeof n.confidence === 'number' && Number.isFinite(n.confidence)
                        ? `, confidence: ${n.confidence.toFixed(2)}`
                        : '';
                    const ctx = `via ${n.viaPath} (${edgeLabel.label}${confPart})`;
                    graphLines.push(`[graph] ${marker}${n.path} (${ctx})\n${wrapVaultContentForMcp(n.path, chunks[0].slice(0, 500))}`);
                }
            }
        }

        // ── Implicit connections (similar notes with no direct link). Kept
        // as a separate appendix because the dedicated implicit service may
        // surface candidates the graph walk did not reach (e.g. across hops).
        const implicitLines: string[] = [];
        const implicitService = plugin.implicitConnectionService;
        if (implicitService && plugin.settings.enableImplicitConnections) {
            const shown = new Set<string>(results.map(r => r.path));
            for (const r of results) {
                if (implicitLines.length >= 3) break;
                const neighbors = implicitService.getImplicitNeighbors(r.path, 3);
                for (const n of neighbors) {
                    if (implicitLines.length >= 3) break;
                    if (shown.has(n.path)) continue;
                    if (isIgnored(n.path)) continue; // AUDIT-013 H-2
                    shown.add(n.path);
                    const chunks = await semanticIndex.getChunksByPath(n.path);
                    if (chunks.length === 0) continue;
                    implicitLines.push(`[implicit] ${n.path} (similarity: ${n.similarity.toFixed(2)})\n${wrapVaultContentForMcp(n.path, chunks[0].slice(0, 500))}`);
                }
            }
        }

        // Format output. AUDIT-013 H-4: every excerpt drawn from user-
        // controlled vault content is wrapped in a trust-boundary tag so the
        // downstream agent does not treat it as instructions.
        const lines: string[] = [`Search results for: "${query}" (${results.length} results)\n`];
        for (const r of results) {
            const scorePart = r.rerankScore !== undefined
                ? `score: ${r.score.toFixed(4)}, rerank: ${r.rerankScore.toFixed(4)}`
                : `score: ${r.score.toFixed(4)}`;
            lines.push(`--- ${r.path} (${r.method}, ${scorePart}) ---`);
            lines.push(wrapVaultContentForMcp(r.path, r.excerpt.slice(0, 1500)));
            lines.push('');
        }
        if (graphLines.length > 0) {
            lines.push('\n--- Graph-connected notes ---');
            lines.push(...graphLines);
        }
        if (implicitLines.length > 0) {
            lines.push('\n--- Implicitly related notes ---');
            lines.push(...implicitLines);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
        return { content: [{ type: 'text', text: `Search error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
