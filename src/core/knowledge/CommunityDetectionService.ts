/**
 * CommunityDetectionService -- Louvain community detection on the knowledge graph.
 *
 * Builds a graphology Graph from GraphStore edges, runs Louvain to discover
 * emergent clusters, and stores results in OntologyStore (source='louvain').
 * Results are used by retrieval (FEATURE-2004), god-node analysis (FEATURE-2003),
 * and knowledge freshness (FEATURE-2006).
 *
 * FEATURE-2002, ADR-070: graphology + graphology-communities-louvain
 */

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { KnowledgeDB } from './KnowledgeDB';
import type { GraphStore } from './GraphStore';
import type { OntologyStore, OntologyEntry } from './OntologyStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommunityResult {
    communities: number;
    notes: number;
    durationMs: number;
}

export interface ClusterSummary {
    /** Louvain community ID (e.g. 'louvain-0') */
    id: string;
    /** confirmed = matches existing MOC cluster, emergent = new grouping */
    type: 'confirmed' | 'emergent';
    /** Number of notes in the cluster */
    memberCount: number;
    /** Top member note paths (up to 5) */
    topMembers: string[];
    /** Matching MOC cluster path (only for confirmed) */
    matchingMoc?: string;
}

// Max fraction of total nodes a single community may contain before splitting
const MAX_COMMUNITY_FRACTION = 0.25;
const MIN_SPLIT_SIZE = 10;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CommunityDetectionService {
    private knowledgeDB: KnowledgeDB;
    private graphStore: GraphStore;
    private ontologyStore: OntologyStore;

    constructor(knowledgeDB: KnowledgeDB, graphStore: GraphStore, ontologyStore: OntologyStore) {
        this.knowledgeDB = knowledgeDB;
        this.graphStore = graphStore;
        this.ontologyStore = ontologyStore;
    }

    /**
     * Run Louvain community detection on the knowledge graph.
     * Reads all edges, builds a graphology Graph, runs Louvain,
     * splits oversized communities, and stores results in OntologyStore.
     */
    detectCommunities(): CommunityResult {
        const start = Date.now();
        const db = this.knowledgeDB.getDB();

        // 1. Read all edges
        const edgeRows = db.exec(
            'SELECT source_path, target_path, confidence FROM edges',
        );

        if (edgeRows.length === 0 || edgeRows[0].values.length === 0) {
            this.ontologyStore.replaceLouvainClusters([]);
            return { communities: 0, notes: 0, durationMs: Date.now() - start };
        }

        // 2. Build graphology undirected graph
        const graph = new Graph({ type: 'undirected', allowSelfLoops: false });

        for (const row of edgeRows[0].values) {
            const source = row[0] as string;
            const target = row[1] as string;
            const confidence = row[2] as number;

            if (!graph.hasNode(source)) graph.addNode(source);
            if (!graph.hasNode(target)) graph.addNode(target);
            // Skip self-loops and duplicate edges (graphology throws on duplicates)
            if (source !== target && !graph.hasEdge(source, target)) {
                graph.addEdge(source, target, { weight: confidence });
            }
        }

        const totalNodes = graph.order;
        if (totalNodes < 3) {
            this.ontologyStore.replaceLouvainClusters([]);
            return { communities: 0, notes: totalNodes, durationMs: Date.now() - start };
        }

        // 3. Run Louvain
        const communityMap = louvain(graph);

        // 4. Group nodes by community
        const communities = new Map<number, string[]>();
        graph.forEachNode((node) => {
            const communityId = communityMap[node];
            const members = communities.get(communityId) ?? [];
            members.push(node);
            communities.set(communityId, members);
        });

        // 5. Post-processing: split oversized communities
        const maxSize = Math.max(MIN_SPLIT_SIZE, Math.floor(totalNodes * MAX_COMMUNITY_FRACTION));
        const finalCommunities = new Map<string, string[]>();
        let nextId = 0;

        for (const [, members] of communities) {
            if (members.length > maxSize) {
                // Build subgraph and re-run Louvain
                const subGraph = new Graph({ type: 'undirected', allowSelfLoops: false });
                for (const m of members) subGraph.addNode(m);
                for (const m of members) {
                    graph.forEachEdge(m, (edge, attrs, source, target) => {
                        if (subGraph.hasNode(source) && subGraph.hasNode(target) && !subGraph.hasEdge(source, target)) {
                            subGraph.addEdge(source, target, attrs);
                        }
                    });
                }

                if (subGraph.size > 0) {
                    const subCommunities = louvain(subGraph);
                    const subGroups = new Map<number, string[]>();
                    subGraph.forEachNode((node) => {
                        const cid = subCommunities[node];
                        const g = subGroups.get(cid) ?? [];
                        g.push(node);
                        subGroups.set(cid, g);
                    });
                    for (const [, subMembers] of subGroups) {
                        finalCommunities.set(`louvain-${nextId++}`, subMembers);
                    }
                } else {
                    finalCommunities.set(`louvain-${nextId++}`, members);
                }
            } else if (members.length >= 2) {
                // Only keep communities with 2+ members
                finalCommunities.set(`louvain-${nextId++}`, members);
            }
            // Singletons are dropped (not useful as clusters)
        }

        // 6. Convert to OntologyEntry[] and store
        const entries: OntologyEntry[] = [];
        for (const [clusterId, members] of finalCommunities) {
            for (const memberPath of members) {
                entries.push({
                    entityPath: memberPath,
                    cluster: clusterId,
                    role: 'member',
                    confidence: 1.0,
                    source: 'louvain',
                });
            }
        }

        this.ontologyStore.replaceLouvainClusters(entries);

        const result: CommunityResult = {
            communities: finalCommunities.size,
            notes: totalNodes,
            durationMs: Date.now() - start,
        };

        console.debug(
            `[CommunityDetection] ${result.communities} communities from ${result.notes} notes in ${result.durationMs}ms`,
        );

        return result;
    }

    /**
     * Compare Louvain clusters with existing MOC clusters.
     * Returns a summary of confirmed (overlap with MOC) and emergent (new) clusters.
     */
    getClusterSummary(): ClusterSummary[] {
        const db = this.knowledgeDB.getDB();

        // Get all Louvain clusters
        const louvainResult = db.exec(
            `SELECT cluster, GROUP_CONCAT(entity_path, '|') AS members
             FROM ontology WHERE source = 'louvain'
             GROUP BY cluster
             ORDER BY COUNT(*) DESC`,
        );
        if (louvainResult.length === 0) return [];

        // Get all MOC clusters for comparison
        const mocResult = db.exec(
            `SELECT cluster, GROUP_CONCAT(entity_path, '|') AS members
             FROM ontology WHERE source = 'moc'
             GROUP BY cluster`,
        );
        const mocClusters = new Map<string, Set<string>>();
        if (mocResult.length > 0) {
            for (const row of mocResult[0].values) {
                const cluster = row[0] as string;
                const members = new Set((row[1] as string).split('|'));
                mocClusters.set(cluster, members);
            }
        }

        const summaries: ClusterSummary[] = [];

        for (const row of louvainResult[0].values) {
            const clusterId = row[0] as string;
            const members = (row[1] as string).split('|');

            // Find best matching MOC cluster (highest overlap)
            let bestMoc: string | undefined;
            let bestOverlap = 0;

            for (const [mocCluster, mocMembers] of mocClusters) {
                const overlap = members.filter(m => mocMembers.has(m)).length;
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    bestMoc = mocCluster;
                }
            }

            // Confirmed if >50% of Louvain members are in the same MOC cluster
            const isConfirmed = bestMoc !== undefined && bestOverlap > members.length * 0.5;

            summaries.push({
                id: clusterId,
                type: isConfirmed ? 'confirmed' : 'emergent',
                memberCount: members.length,
                topMembers: members.slice(0, 5),
                matchingMoc: isConfirmed ? bestMoc : undefined,
            });
        }

        return summaries;
    }
}
