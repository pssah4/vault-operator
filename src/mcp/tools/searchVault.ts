/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * search_vault -- 4-stage intelligence search: Semantic + Keyword + RRF +
 * Reranking + Graph Expansion + Implicit Connections.
 *
 * Capsules the entire EPIC-015 retrieval pipeline in one MCP call.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { wrapVaultContentForMcp } from '../McpBridge';

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
    const tagsFilter = Array.isArray(args.tags) ? (args.tags as string[]).map(t => t.replace(/^#/, '').toLowerCase()) : undefined;
    const searchK = Math.min(topK * 3, 40);

    // AUDIT-013 H-2: never return ignored paths to MCP clients. The
    // semantic index, keyword fallback, graph expansion and implicit
    // connections all bypass IgnoreService at retrieval time, so we must
    // filter every result stream here at the boundary.
    const ignoreService = plugin.ignoreService;
    const isIgnored = (p: string) => ignoreService.isIgnored(p);

    try {
        // Parallel: Semantic + Keyword search
        const [semanticResults, keywordResults] = await Promise.all([
            semanticIndex.search(query, searchK, undefined, { adjacentChunks: 1, adjacentThreshold: 0.3, maxPerFile: 2 }),
            semanticIndex.keywordSearch(query, searchK),
        ]);

        // RRF Fusion
        const RRF_K = 60;
        type FusedEntry = { path: string; excerpt: string; score: number; method: string };
        const fused = new Map<string, FusedEntry>();

        semanticResults.forEach((r, i) => {
            if (!fused.has(r.path)) {
                fused.set(r.path, { path: r.path, excerpt: r.excerpt, score: 1 / (RRF_K + i + 1), method: 'semantic' });
            }
        });
        keywordResults.forEach((r, i) => {
            const rrf = 1 / (RRF_K + i + 1);
            const existing = fused.get(r.path);
            if (existing) {
                existing.score += rrf;
                existing.method = 'hybrid';
            } else {
                fused.set(r.path, { path: r.path, excerpt: r.excerpt, score: rrf, method: 'keyword' });
            }
        });

        let results = Array.from(fused.values())
            .filter(r => !isIgnored(r.path))
            .sort((a, b) => b.score - a.score);

        // Metadata filters
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

        // Reranking
        const reranker = plugin.rerankerService;
        if (reranker?.isLoaded && plugin.settings.enableReranking && results.length > 1) {
            try {
                const toRerank = results.slice(0, plugin.settings.rerankCandidates ?? 20);
                const reranked = await reranker.rerank(query, toRerank.map(r => ({ path: r.path, text: r.excerpt, score: r.score })));
                results = reranked.map(r => ({ path: r.path, excerpt: r.text, score: r.rerankScore, method: 'reranked' }));
            } catch { /* fallback to original order */ }
        }

        results = results.slice(0, topK);

        // Graph Expansion
        const graphStore = plugin.graphStore;
        const graphLines: string[] = [];
        if (graphStore && plugin.settings.enableGraphExpansion) {
            const hops = Math.min(plugin.settings.graphExpansionHops ?? 1, 3);
            const topKPaths = new Set(results.map(r => r.path));
            for (const r of results) {
                if (graphLines.length >= 5) break;
                const neighbors = graphStore.getNeighbors(r.path, hops, 5);
                for (const n of neighbors) {
                    if (topKPaths.has(n.path) || graphLines.length >= 5) continue;
                    if (isIgnored(n.path)) continue; // AUDIT-013 H-2
                    topKPaths.add(n.path);
                    const chunks = await semanticIndex.getChunksByPath(n.path);
                    if (chunks.length === 0) continue;
                    const ctx = n.propertyName ? `via ${n.viaPath} (${n.propertyName})` : `via ${n.viaPath}`;
                    graphLines.push(`[graph] ${n.path} (${ctx})\n${wrapVaultContentForMcp(n.path, chunks[0].slice(0, 500))}`);
                }
            }
        }

        // Implicit Connections
        const implicitLines: string[] = [];
        const implicitService = plugin.implicitConnectionService;
        if (implicitService && plugin.settings.enableImplicitConnections) {
            for (const r of results) {
                if (implicitLines.length >= 3) break;
                const neighbors = implicitService.getImplicitNeighbors(r.path, 3);
                for (const n of neighbors) {
                    if (implicitLines.length >= 3) continue;
                    if (isIgnored(n.path)) continue; // AUDIT-013 H-2
                    const chunks = await semanticIndex.getChunksByPath(n.path);
                    if (chunks.length === 0) continue;
                    implicitLines.push(`[implicit] ${n.path} (similarity: ${n.similarity.toFixed(2)})\n${wrapVaultContentForMcp(n.path, chunks[0].slice(0, 500))}`);
                }
            }
        }

        // Format output. AUDIT-013 H-4: every excerpt drawn from user-
        // controlled vault content is wrapped in a trust-boundary tag so
        // the downstream agent does not treat it as instructions.
        const lines: string[] = [`Search results for: "${query}" (${results.length} results)\n`];
        for (const r of results) {
            lines.push(`--- ${r.path} (${r.method}, score: ${r.score.toFixed(4)}) ---`);
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

/* eslint-enable */
