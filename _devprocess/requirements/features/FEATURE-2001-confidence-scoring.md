# Feature: Confidence Scoring

**Status:** Implementiert (v2.4.3, 2026-04-12)

> **Feature ID**: FEATURE-2001
> **Epic**: EPIC-020 - Graph Intelligence
> **Priority**: P0-Critical
> **Effort Estimate**: S

## Feature Description

Every edge in the knowledge graph receives a unified confidence score (0.0-1.0) that reflects how the connection was established and how strong it is. The knowledge graph stores edges in two separate tables today: `edges` (explicit wikilinks and frontmatter MOC properties set by the user) and `implicit_edges` (computed cosine-similarity between note embeddings, already carrying a `similarity REAL` value). The problem: when `getNeighbors()` joins both tables for graph expansion, there is no common score to weight results -- explicit edges have no score at all, implicit edges have similarity but it's not used as a weight.

The fix: add a `confidence REAL DEFAULT 1.0` column to the `edges` table. Explicit edges (body wikilinks, frontmatter properties) are always 1.0 -- the user set them intentionally, so they are fully trusted. Implicit edges already carry their cosine-similarity score (e.g. 0.62, 0.85) which naturally serves as their confidence. `getNeighbors()` then returns a unified `confidence` value regardless of edge source, enabling downstream features (retrieval weighting, cluster analysis, diagnostics) to treat all connections on a common scale.

## Benefits Hypothesis

**We believe that** adding confidence scores to graph edges
**Delivers the following measurable outcomes:**
- Users can distinguish between self-authored and system-inferred connections
- Agent retrieval quality improves by prioritizing high-confidence edges in graph expansion

**We know we are successful when:**
- Every edge in the graph carries a confidence value
- The agent can report the confidence distribution in conversation ("2000 authored, 500 inferred")

## Jobs to be Done (from BA)

| Job Type | Job | Addressed in Story |
|----------|-----|-------------------|
| Functional | Know which connections in my graph are trustworthy | Story 1 |
| Emotional | Trust my knowledge graph as a reflection of my own thinking | Story 2 |
| Functional | Provide the agent with reliable connection data for better retrieval | Story 3 |

## User Stories

### Story 1: Connection transparency (Functional)
**As a** PKM user
**I want to** see how many connections in my graph are user-authored versus system-inferred
**so that** I can assess the structural quality of my vault

### Story 2: Trust in graph integrity (Emotional)
**As a** knowledge worker
**I want to** know that my graph primarily reflects my own linking decisions
**so that** I feel confident the structure represents my thinking, not an algorithm's guesses

### Story 3: Weighted retrieval input (Functional)
**As a** user asking the agent a question
**I want to** receive answers based on strongly connected notes rather than weak associations
**so that** the context the agent uses is more relevant to my query

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Every connection in the knowledge graph carries a reliability grade | 100% coverage | Audit: no ungraded edges after rebuild |
| SC-02 | User can ask the agent for a connection reliability summary | Agent responds with authored vs. inferred counts | Manual test |
| SC-03 | Reliability grades are preserved across vault restarts | No data loss | Restart test |
| SC-04 | Grades are assigned without user intervention during normal vault usage | Fully automatic | Observation: no manual steps needed |

---

## Technical NFRs (for Architect)

### Performance
- **Grading speed**: All edges graded during graph extraction pass, no separate computation step
- **Storage overhead**: <1 byte per edge (REAL column in existing table)

### Scalability
- **Edge volume**: Must handle 10,000+ edges without performance impact
- **Incremental updates**: Re-grading only affected edges on file change, not full rebuild

### Data Integrity
- **Migration**: Existing edges receive retroactive grades based on their type (body=1.0, frontmatter=1.0, implicit=cosine score)
- **Schema versioning**: DB version bump with migration path

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Confidence scores must be computed during graph extraction without additional passes
- **Why ASR**: Performance -- adding a separate computation step would double extraction time
- **Impact**: GraphExtractor and ImplicitConnectionService must set confidence inline
- **Quality Attribute**: Performance

**MODERATE ASR #2**: Confidence must be queryable in SQL for health checks and analysis
- **Why ASR**: VaultHealthService and OntologyStore run SQL queries, not in-memory graph traversal
- **Impact**: Storage as column in edges/implicit_edges tables
- **Quality Attribute**: Maintainability

### Open Questions for Architect
- Migration strategy: ALTER TABLE with DEFAULT or recreate with new schema?
- Should `getNeighbors()` return a unified result type that includes `confidence` and `edgeSource` ('explicit' | 'implicit')?

---

## Definition of Done

### Functional
- [ ] All user stories implemented
- [ ] All success criteria met (verified)
- [ ] GraphExtractor writes confidence on every edge
- [ ] ImplicitConnectionService preserves similarity as confidence
- [ ] Agent can report confidence distribution in chat

### Quality
- [ ] Unit tests for confidence assignment (body, frontmatter, implicit)
- [ ] Migration test: existing DB upgraded without data loss
- [ ] Performance test: no measurable slowdown on 1000-note vault

### Documentation
- [ ] Feature spec updated (Status: Implemented)
- [ ] Backlog updated

---

## Dependencies
- **GraphStore schema**: Requires schema migration (column addition to `edges` table)
- **No change to `implicit_edges`**: The existing `similarity REAL` column already serves as confidence

## Assumptions
- `implicit_edges.similarity` is semantically equivalent to confidence and needs no transformation
- Explicit edges are always 1.0 because the user intentionally created them (wikilink or frontmatter property)

## Out of Scope
- Visual representation of confidence in Obsidian graph view (not possible via plugin API)
- User-adjustable confidence thresholds (deferred to FEATURE-2004)

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `src/core/knowledge/GraphStore.ts` | confidence column + scoring |
