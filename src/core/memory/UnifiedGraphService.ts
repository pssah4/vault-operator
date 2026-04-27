/**
 * UnifiedGraphService -- thin orchestrator over EdgeStore + AdapterRegistry
 * + KnowledgeGraphAdapter.
 *
 * Walks the cross-DB knowledge graph that spans `memory.db` (facts +
 * fact_edges) and the host's vault index (`knowledge.db` directly via
 * LocalKnowledgeAdapter, or RPC via McpKnowledgeAdapter -- swap-in
 * decided at registration time).
 *
 * Stale-Edge-Lazy-Detection (FEATURE-0317 DoD): resolution failures
 * mark the offending edge with `metadata.stale=true` via EdgeStore, but
 * never delete it. Stale hits keep their URI as a reference token; the
 * Phase-3 ContextRanker scales their score down so they sit at the
 * bottom of the result list.
 *
 * Constructor-Injection only, no obsidian, no plugin globals.
 *
 * FEATURE-0317 / PLAN-006 tasks 5 + 7.
 */

import type { EdgeStore, FactEdge } from './EdgeStore';
import type { FactStore, Fact } from './FactStore';
import type { AdapterRegistry } from './AdapterRegistry';
import type { KnowledgeGraphAdapter } from './KnowledgeGraphAdapter';
import type { RecallHit } from './RecallHit';

export interface WalkOptions {
    /** Number of hops to traverse over fact_edges + implicit_edges. Default 1. */
    hops?: number;
    /** Cap on the total number of hits returned. Default 20. */
    limit?: number;
    /** Restrict edge types to this allow-list (defaults to all). */
    types?: string[];
    /**
     * When true, resolution failures call EdgeStore.markStale and the
     * resulting hit gets `stale=true`. Default true; tests can disable.
     */
    detectStaleEdges?: boolean;
}

export class UnifiedGraphService {
    constructor(
        private readonly factStore: FactStore,
        private readonly edgeStore: EdgeStore,
        private readonly knowledgeAdapter: KnowledgeGraphAdapter,
        private readonly adapterRegistry: AdapterRegistry,
    ) {}

    /**
     * Starting from one fact, return RecallHits for the connected
     * neighbours: other facts via fact_edges, vault notes via
     * fact_edges.to_external_ref + implicit_edges expansion.
     */
    async walkFromFact(seedFactId: number, opts: WalkOptions = {}): Promise<RecallHit[]> {
        const seed = this.factStore.getById(seedFactId);
        if (!seed) return [];
        const hops = Math.max(1, Math.min(opts.hops ?? 1, 3));
        const limit = opts.limit ?? 20;
        const detectStale = opts.detectStaleEdges ?? true;

        const visitedFacts = new Set<number>([seedFactId]);
        const hitsByUri = new Map<string, RecallHit>();
        const queue: Array<{ factId: number; depth: number }> = [{ factId: seedFactId, depth: 0 }];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current.depth >= hops) continue;
            const edges = this.filterByType(this.edgeStore.getEdgesFrom(current.factId), opts.types);
            for (const edge of edges) {
                await this.handleEdge(edge, current.depth, hitsByUri, visitedFacts, queue, detectStale);
                if (hitsByUri.size >= limit) break;
            }
            if (hitsByUri.size >= limit) break;
        }

        return [...hitsByUri.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Resolve a URI through the AdapterRegistry. Returns the resolved
     * payload or null if no adapter handles the scheme / the resource
     * is missing. Stale-detection lives in `walkFromFact`.
     */
    async resolveUri(uri: string) {
        return this.adapterRegistry.resolve(uri);
    }

    private filterByType(edges: FactEdge[], allow: string[] | undefined): FactEdge[] {
        if (!allow || allow.length === 0) return edges;
        const allowSet = new Set(allow);
        return edges.filter(e => allowSet.has(e.edgeType));
    }

    private async handleEdge(
        edge: FactEdge,
        currentDepth: number,
        hitsByUri: Map<string, RecallHit>,
        visitedFacts: Set<number>,
        queue: Array<{ factId: number; depth: number }>,
        detectStale: boolean,
    ): Promise<void> {
        if (edge.toFactId !== undefined) {
            const factHit = this.materialiseFactHit(edge);
            if (factHit && !hitsByUri.has(factHit.uri)) {
                hitsByUri.set(factHit.uri, factHit);
                if (!visitedFacts.has(edge.toFactId)) {
                    visitedFacts.add(edge.toFactId);
                    queue.push({ factId: edge.toFactId, depth: currentDepth + 1 });
                }
            }
            return;
        }

        if (!edge.toExternalRef) return;
        const uri = edge.toExternalRef;
        if (hitsByUri.has(uri)) return;

        let stale = false;
        const resolved = await this.adapterRegistry.resolve(uri);
        if (!resolved) {
            // Resolution failure -- treat as stale per FEATURE-0317
            // and downgrade the edge in storage so future walks pay
            // less attention to it.
            stale = true;
            if (detectStale) {
                this.edgeStore.markStale?.(edge.id, 'unresolved');
            }
        }

        const baseScore = edge.weight;
        hitsByUri.set(uri, {
            uri,
            text: resolved?.content ?? resolved?.title ?? uri,
            score: baseScore,
            topics: [],
            stale: stale || undefined,
            contributions: { 'edge-walk': baseScore },
        });
    }

    private materialiseFactHit(edge: FactEdge): RecallHit | null {
        if (edge.toFactId === undefined) return null;
        const fact = this.factStore.getById(edge.toFactId);
        if (!fact) return null;
        return {
            uri: `fact:${fact.id}`,
            text: fact.text,
            score: edge.weight * (1 + fact.importance),
            topics: fact.topics,
            kind: fact.kind,
            contributions: { 'edge-walk': edge.weight },
        };
    }
}

/** Helper for tests / callers that need fact-typed hits without an Edge. */
export function factToHit(fact: Fact, score = 1.0): RecallHit {
    return {
        uri: `fact:${fact.id}`,
        text: fact.text,
        score,
        topics: fact.topics,
        kind: fact.kind,
        contributions: { 'direct': score },
    };
}
