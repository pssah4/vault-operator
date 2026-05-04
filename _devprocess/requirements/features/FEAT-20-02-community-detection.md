# Feature: Community Detection (Louvain)


> **Feature ID**: FEAT-20-02
> **Epic**: EPIC-20 - Graph Intelligence
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Applies the Louvain community detection algorithm to the knowledge graph to discover emergent clusters of thematically related notes -- independent of manually created MOC properties. The system compares detected communities with existing MOC-based clusters from the OntologyStore and presents the delta conversationally: confirmed clusters (matching existing MOCs), emergent clusters (new groupings the user hasn't organized), and orphaned notes (not belonging to any cluster). The user decides which emergent clusters to formalize as topic notes. The detected communities also feed into retrieval quality improvements (FEAT-20-04).

## Benefits Hypothesis

**We believe that** running community detection on the knowledge graph
**Delivers the following measurable outcomes:**
- Cluster coverage increases from ~40% to >80% of vault notes
- Users discover thematic groupings they hadn't explicitly organized

**We know we are successful when:**
- >60% of detected clusters are confirmed as meaningful by the user (H-01)
- >70% of emergent clusters are accepted as reflections of the user's own thinking (H-04)

## Jobs to be Done (from BA)

| Job Type | Job | Addressed in Story |
|----------|-----|-------------------|
| Functional | Recognize structural patterns in my knowledge graph | Story 1 |
| Emotional | Discover patterns in my own thinking I hadn't noticed | Story 2 |
| Functional | Decide which emergent clusters deserve a dedicated topic note | Story 3 |

## User Stories

### Story 1: Cluster discovery (Functional)
**As a** PKM user with 500+ notes
**I want to** ask the agent "what clusters exist in my vault?"
**so that** I can see which thematic groups have emerged from my notes

### Story 2: Emergent pattern recognition (Emotional)
**As a** knowledge worker
**I want to** see clusters that formed organically from my writing
**so that** I experience the satisfaction of recognizing patterns in my own thinking -- not patterns an algorithm invented

### Story 3: Selective formalization (Functional)
**As a** PKM user
**I want to** choose which emergent clusters to turn into topic notes
**so that** my vault structure reflects my conscious decisions about what matters

### Story 4: Cluster context for retrieval (Functional)
**As a** user asking the agent a question
**I want to** the agent to consider cluster membership when finding relevant notes
**so that** thematically related notes are surfaced even if their embeddings aren't directly similar

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | System detects thematic groups without requiring manual organization | >5 clusters on a 500-note vault | Run on test vault |
| SC-02 | User can review detected groups conversationally in chat | Agent presents groups with names, members, and comparison to existing topics | Manual test |
| SC-03 | User can selectively approve groups for formalization | Approved groups become topic notes; rejected groups are dismissed | Manual test |
| SC-04 | Detection completes within acceptable time for large vaults | <5 seconds for 1000 notes | Performance test |
| SC-05 | Detected groups are available for retrieval improvements | Other features can query cluster membership | Integration test |

---

## Technical NFRs (for Architect)

### Performance
- **Computation time**: <5s for 1000-node graph, <1s for 500-node graph
- **Memory**: <50MB additional for graph analysis data structures

### Scalability
- **Graph size**: Must handle graphs with 10,000+ edges
- **Incremental updates**: Re-clustering after single-note changes should be faster than full rebuild

### Availability
- **Background execution**: Clustering runs in background, does not block UI
- **Resumable**: If interrupted, next run produces consistent results

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Louvain algorithm must run in the Obsidian renderer process (no external server)
- **Why ASR**: Obsidian plugins cannot start external processes (except sandboxed child processes). The algorithm must be available as a JS/WASM module.
- **Impact**: Determines library choice. If no JS Louvain implementation exists, a simpler algorithm (Label Propagation) must substitute.
- **Quality Attribute**: Feasibility

**CRITICAL ASR #2**: Cluster results must be stored in OntologyStore for reuse by retrieval and health checks
- **Why ASR**: Multiple features depend on cluster membership (FEAT-20-03, FEAT-20-04). In-memory-only results would require re-computation.
- **Impact**: OntologyStore schema may need extension for Louvain-sourced clusters vs. MOC-sourced clusters
- **Quality Attribute**: Reusability

### Open Questions for Architect
- Louvain in JS: Which library? Is `graphology` + `graphology-communities-leiden` suitable?
- How to distinguish MOC-sourced clusters from Louvain-sourced clusters in OntologyStore?
- Should LLM-generated cluster names be cached or regenerated each time?
- Incremental re-clustering: full rebuild or delta-based update?

---

## Definition of Done

### Functional
- [ ] All user stories implemented
- [ ] All success criteria met
- [ ] Louvain (or equivalent) runs on GraphStore edge data
- [ ] Results stored in OntologyStore with source='leiden'
- [ ] Agent presents clusters conversationally with names and members
- [ ] User can approve/dismiss clusters
- [ ] Approved clusters create topic notes via existing ingest skill

### Quality
- [ ] Unit tests for clustering algorithm integration
- [ ] Performance test: <5s for 1000 notes
- [ ] Integration test: cluster data available to FEAT-20-04

### Documentation
- [ ] Feature spec updated (Status: Implemented)
- [ ] Backlog updated

---

## Hypothesis Validation

| Hypothesis (BA Ref) | Test Method | Success Criterion | Result |
|--------------------|-------------|-------------------|--------|
| H-01: Louvain produces meaningful clusters | Run on 500+ note vault, user reviews | >60% confirmed as meaningful | Open |
| H-04: Users accept clusters as own thinking | Qualitative interview after usage | >70% accepted | Open |

**If disproven:** Fall back to simpler presentation: show "potentially related notes" without claiming cluster structure. Use only for retrieval boosting (FEAT-20-04), not user-facing diagnostics.

---

## Dependencies
- **FEAT-20-01** (Confidence Scoring): Confidence-weighted edges produce better clustering input
- **GraphStore**: Provides edge data for graph construction
- **OntologyStore**: Stores cluster results

## Assumptions
- A JS/WASM implementation of Louvain (or equivalent quality algorithm) is available
- Graphs with 200+ edges produce meaningful clusters (not degenerate)

## Out of Scope
- Custom visualization of clusters (Obsidian graph view only)
- Automatic cluster naming without LLM (requires LLM call for meaningful names)
- Real-time re-clustering on every file save

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `src/core/knowledge/CommunityDetectionService.ts` | Louvain Community Detection ueber graphology |
| `src/core/knowledge/OntologyStore.ts` | Cluster-Speicherung und -Abfrage |
