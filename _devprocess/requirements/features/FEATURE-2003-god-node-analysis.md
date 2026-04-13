# Feature: God-Node Analysis

**Status:** Implementiert (v2.4.3, 2026-04-12)

> **Feature ID**: FEATURE-2003
> **Epic**: EPIC-020 - Graph Intelligence
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Identifies hub notes that have accumulated an excessive number of connections (in-degree, out-degree) -- analogous to "god classes" in software engineering. These overloaded hubs reduce the signal-to-noise ratio of the knowledge graph because everything links to them, making them poor discriminators for retrieval. The analysis computes degree metrics per note, flags those above a configurable threshold (default: 50 connections), and suggests split points based on the cluster membership of their backlinks. Integrates as a new check type in the existing VaultHealthService.

## Benefits Hypothesis

**We believe that** identifying overloaded hub notes
**Delivers the following measurable outcomes:**
- Users recognize which topic notes need splitting before they become unmanageable
- Graph quality improves as overly generic hubs are refined into specific sub-topics

**We know we are successful when:**
- >80% of flagged nodes are confirmed by the user as "too large" (H-03)
- Users act on at least one split suggestion within the first month

## Jobs to be Done (from BA)

| Job Type | Job | Addressed in Story |
|----------|-----|-------------------|
| Functional | Know which hub notes are overloaded and should be split | Story 1 |
| Functional | Understand WHERE to split a large hub based on its connections | Story 2 |
| Emotional | Feel in control of vault complexity rather than overwhelmed by it | Story 3 |

## User Stories

### Story 1: Hub overload detection (Functional)
**As a** PKM user with mature topic notes
**I want to** be alerted when a topic note has accumulated too many connections
**so that** I can decide whether to split it into sub-topics

### Story 2: Split point suggestions (Functional)
**As a** PKM user facing an overloaded hub
**I want to** see which sub-groups its backlinks fall into
**so that** I know where to draw the line when splitting

### Story 3: Complexity control (Emotional)
**As a** knowledge worker
**I want to** receive prioritized, actionable maintenance suggestions
**so that** I feel in control of my growing vault rather than overwhelmed by a wall of findings

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | System identifies notes with excessive incoming connections | All notes above threshold flagged | Automated check |
| SC-02 | Flagged notes include actionable split suggestions based on connection patterns | Each flagged note shows 2-4 potential sub-groups | Manual review |
| SC-03 | Analysis results appear in the existing health check | New check type visible in health badge and repair modal | UI test |
| SC-04 | Connection threshold is user-configurable | Adjustable in settings | Settings UI test |

---

## Technical NFRs (for Architect)

### Performance
- **Computation**: Degree calculation is O(n) on edges table -- must complete in <1s for 5000 edges
- **No LLM call**: Degree metrics are pure computation, split suggestions use cluster data from FEATURE-2002

### Integration
- **VaultHealthService**: New check type alongside existing orphans, missing_backlinks, broken_links, weak_clusters, inconsistent_tags, category_mismatch
- **VaultHealthRepairModal**: New finding type displayed and (partially) actionable

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Must integrate with existing VaultHealthService check pipeline
- **Why ASR**: Consistency -- all health checks follow the same pattern (check -> findings -> repair)
- **Impact**: Must produce HealthFinding objects compatible with existing repair modal
- **Quality Attribute**: Maintainability

### Open Questions for Architect
- Should split suggestions be pre-computed (using Louvain clusters) or computed on-demand when user clicks a finding?
- Is betweenness centrality worth computing in addition to degree? It identifies bottleneck nodes but is O(n*m) which may be slow.

---

## Definition of Done

### Functional
- [ ] All user stories implemented
- [ ] All success criteria met
- [ ] Degree metrics computed for all notes
- [ ] Notes above threshold flagged as health findings
- [ ] Split suggestions based on cluster membership of backlinks
- [ ] Threshold configurable in settings

### Quality
- [ ] Unit tests for degree calculation
- [ ] Integration test with VaultHealthService
- [ ] Performance test: <1s on 5000-edge graph

### Documentation
- [ ] Feature spec updated (Status: Implemented)
- [ ] Backlog updated

---

## Hypothesis Validation

| Hypothesis (BA Ref) | Test Method | Success Criterion | Result |
|--------------------|-------------|-------------------|--------|
| H-03: God-node warning correlates with user-perceived overload | User reviews flagged nodes on real vault | >80% confirmed as "too large" | Open |

**If disproven:** Adjust threshold or switch to betweenness centrality instead of raw degree.

---

## Dependencies
- **FEATURE-2002** (Community Detection): Cluster membership needed for split suggestions
- **VaultHealthService**: Existing check infrastructure

## Assumptions
- Raw degree (in+out) is a sufficient proxy for "overloaded" (betweenness centrality optional)
- Default threshold of 50 connections is reasonable for most vaults

## Out of Scope
- Automatic splitting of hub notes (user must do this manually or with agent assistance)
- Visual highlighting in Obsidian graph view

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `src/core/knowledge/VaultHealthService.ts` | checkGodNodes -- Degree-Berechnung und Flagging |
