# Feature: Retrieval Quality Improvements


> **Feature ID**: FEAT-20-04
> **Epic**: EPIC-20 - Graph Intelligence
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Enhances the agent's ability to find relevant notes by incorporating confidence scores and cluster membership into the retrieval pipeline. Currently, graph expansion in semantic search treats all edges equally -- a strong wikilink has the same weight as a weak implicit connection. This feature introduces three improvements: (1) confidence-weighted graph expansion that prioritizes high-reliability connections, (2) cluster-aware retrieval that boosts notes sharing a cluster with top results, and (3) hub-context anchoring that uses hub notes as retrieval scopes for broad queries. These are agent-facing improvements -- the user experiences better answers without needing to know about the underlying mechanics.

## Benefits Hypothesis

**We believe that** incorporating confidence and cluster data into retrieval
**Delivers the following measurable outcomes:**
- Top-5 precision of semantic search improves by >15%
- Agent answers include more thematically coherent context

**We know we are successful when:**
- A/B comparison on 20 test queries shows measurable precision improvement (H-05)
- Users report that agent answers are more relevant (qualitative)

## Jobs to be Done (from BA)

| Job Type | Job | Addressed in Story |
|----------|-----|-------------------|
| Functional | Get more relevant answers from the agent by leveraging graph structure | Story 1 |
| Functional | Find thematically related notes even when embeddings don't match directly | Story 2 |
| Functional | Scope broad queries to relevant knowledge areas instead of searching the entire vault | Story 3 |

## User Stories

### Story 1: Better answers through connection quality (Functional)
**As a** user asking the agent a question
**I want to** the agent to prioritize notes connected through my own links over weak associations
**so that** the context it uses reflects my curated knowledge structure

### Story 2: Cluster-based discovery (Functional)
**As a** user exploring a topic
**I want to** the agent to surface notes that belong to the same thematic cluster
**so that** I discover relevant notes I might have missed through embedding search alone

### Story 3: Hub-scoped queries (Functional)
**As a** user asking a broad question like "what do I know about AI ethics?"
**I want to** the agent to identify the relevant hub note and search within its cluster
**so that** I get focused, relevant results instead of scattered matches from across the vault

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Search results prioritize strongly connected notes over weakly associated ones | Measurable rank improvement in controlled test | A/B comparison on 20 queries |
| SC-02 | Notes in the same thematic group as a top result receive a relevance boost | Cluster members appear in top-10 more often than without boost | Before/after comparison |
| SC-03 | Broad topic queries return focused results from the relevant knowledge area | Results scoped to hub cluster, not scattered across vault | Manual review of 5 broad queries |
| SC-04 | Retrieval improvements do not noticeably slow down search | Search completes within the same perceived time as before | User perception test |

---

## Technical NFRs (for Architect)

### Performance
- **Additional latency**: <100ms on top of existing search pipeline
- **No additional LLM calls**: All improvements are computation-based (SQL queries, score adjustments)

### Integration
- **SemanticSearchTool**: Extend existing `getNeighbors()` call to pass confidence weights
- **RRF fusion**: Integrate confidence as rank-boost factor alongside existing semantic + keyword scores
- **OntologyStore**: Query cluster membership for cluster-aware boosting

### Scalability
- **Cluster lookup**: O(1) per note via OntologyStore index
- **Hub identification**: Pre-computed during community detection (FEAT-20-02), cached

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Must not add LLM calls to the retrieval path
- **Why ASR**: Retrieval runs on every user message. Additional LLM calls would add latency and cost.
- **Impact**: All improvements must be computation-based (SQL, in-memory score adjustments)
- **Quality Attribute**: Performance, Cost

**MODERATE ASR #2**: Must be backwards-compatible with vaults that haven't run community detection
- **Why ASR**: Not all users will run Louvain clustering immediately. Retrieval must degrade gracefully.
- **Impact**: Cluster-aware boosting is additive -- if no clusters exist, fall back to current behavior
- **Quality Attribute**: Robustness

### Open Questions for Architect
- How to integrate confidence into RRF? Multiplicative boost on rank, or additive score adjustment?
- Should hub-context anchoring be automatic (agent detects broad query) or explicit (user says "search in topic X")?
- How to handle notes belonging to multiple clusters?

---

## Definition of Done

### Functional
- [ ] All user stories implemented
- [ ] All success criteria met
- [ ] Confidence-weighted graph expansion working
- [ ] Cluster-aware retrieval boosting working
- [ ] Hub-context anchoring working for broad queries
- [ ] Graceful fallback when no confidence/cluster data available

### Quality
- [ ] A/B precision test on 20 queries (before/after)
- [ ] Performance test: no measurable latency increase
- [ ] Integration test: works with and without Louvain clusters

### Documentation
- [ ] Feature spec updated (Status: Implemented)
- [ ] Backlog updated

---

## Hypothesis Validation

| Hypothesis (BA Ref) | Test Method | Success Criterion | Result |
|--------------------|-------------|-------------------|--------|
| H-05: Confidence-weighted expansion improves top-5 precision | A/B on 20 test queries: equal-weight vs. confidence-weight | >15% improvement | Open |

**If disproven:** Confidence weighting may not be discriminative enough. Consider using confidence as a filter (exclude edges below threshold) instead of a weight.

---

## Dependencies
- **FEAT-20-01** (Confidence Scoring): Required for confidence-weighted expansion
- **FEAT-20-02** (Community Detection): Required for cluster-aware boosting and hub-context anchoring
- **SemanticSearchTool**: Existing search pipeline to extend
- **GraphStore.getNeighbors()**: Existing graph expansion to modify -- NOTE: currently only queries `edges` table, does NOT include `implicit_edges`. Must be extended or supplemented with a new method.

## Codebase Review Notes (2026-04-12)

**Critical finding:** `getNeighbors()` only queries explicit edges. Implicit edges (cosine similarity) are stored in `implicit_edges` but never used in retrieval expansion -- only in `VaultHealthService.checkWeakClusters()`. This means the entire implicit connection infrastructure is invisible to the agent's search.

**Recommended approach:** Add `getNeighborsWithImplicit()` method to GraphStore that unions both tables with unified confidence. Keep existing `getNeighbors()` unchanged for backward compatibility. SemanticSearchTool switches to the new method.

## Assumptions
- Confidence scores are meaningful discriminators (not all edges have similar confidence)
- Louvain clusters are stable enough across runs to provide consistent retrieval boosting

## Out of Scope
- User-facing display of confidence/cluster data in search results (agent explains verbally if asked)
- Cluster-based filtering (excluding results outside a cluster)

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `src/core/tools/vault/SemanticSearchTool.ts` | Confidence-weighted sorting in Graph-Expansion |
