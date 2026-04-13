# Epic: Graph Intelligence

> **Epic ID**: EPIC-020
> **Business Alignment**: _devprocess/analysis/BA-011-graph-intelligence.md
> **Scope**: MVP

## How-Might-We (from BA)

**How might we** help Obsidian PKM users **understand and improve** the structure of their knowledge graph, **despite** growing vault sizes and the need to preserve the user's own thinking in every linking decision?

## Epic Hypothesis Statement

FOR Obsidian users managing personal knowledge vaults with 500+ notes
WHO struggle to see emergent patterns, trust graph connections, and scale document integration
THE Graph Intelligence extension
IS A diagnostic and retrieval layer for personal knowledge graphs
THAT surfaces hidden structure, grades connection reliability, and enables batch document integration -- while improving the agent's own retrieval quality
UNLIKE existing graph analysis plugins that only compute metrics without actionable suggestions
OUR SOLUTION combines graph-theoretic analysis with an LLM agent that explains findings conversationally, proposes improvements, and lets the user decide -- preserving the principle that linking is thinking.

## Business Outcomes (measurable)

1. **Vault maintenance effort**: Time spent per month decreases from ~8h to <2h within 3 months
2. **Inbox throughput**: Documents integrated per session increases from 5-10 to 50+ immediately
3. **Cluster coverage**: Percentage of notes assigned to a cluster increases from ~40% to >80% within 1 month
4. **Retrieval precision**: Top-5 precision of semantic search increases from ~60% to >80% within 2 months

## Leading Indicators

- Louvain cluster coherence: >60% of cluster assignments are user-confirmed -- validates H-01
- Batch token cost: <$0.15/note in batch mode vs ~$0.20 in single mode -- validates H-02
- God-node correlation: >80% of flagged nodes confirmed as "too large" by user -- validates H-03
- Cluster acceptance: >70% of emergent clusters accepted as reflection of own thinking -- validates H-04
- Retrieval boost: >15% improvement in top-5 precision with confidence-weighted expansion -- validates H-05

## Critical Hypotheses (from BA)

| BA Ref | Hypothesis | Validated by Feature | Status |
|--------|-----------|---------------------|--------|
| H-01 | Louvain on Wikilink+Frontmatter graphs produces meaningful clusters | FEATURE-2002 | Validiert |
| H-02 | Batch ingest reduces token cost per note by 50% | FEATURE-2005 | Validiert |
| H-03 | God-node warning (degree >50) correlates with user-perceived overload | FEATURE-2003 | Validiert |
| H-04 | Users accept emergent clusters as reflection of their thinking | FEATURE-2002 | Validiert |
| H-05 | Confidence-weighted graph expansion improves top-5 retrieval precision | FEATURE-2004 | Validiert |

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEATURE-2001 | Confidence scoring | P0 | S | Implementiert (2026-04-12) |
| FEATURE-2002 | Community detection (Louvain) | P0 | M | Implementiert (2026-04-12) |
| FEATURE-2003 | God-node analysis | P1 | S | Implementiert (2026-04-12) |
| FEATURE-2004 | Retrieval quality improvements | P0 | M | Implementiert (2026-04-12) |
| FEATURE-2005 | Batch ingest | P1 | L | Implementiert (2026-04-12) |
| FEATURE-2006 | Knowledge freshness | P1 | M | Implementiert (2026-04-12) |

**Priority:** P0-Critical (MVP does not work without it), P1-High (important), P2-Medium (value-adding)
**Effort:** S (1-2 sprints), M (3-5 sprints), L (6+ sprints)

## Explicitly Out-of-Scope

- Custom graph viewer: Obsidian's native graph view is sufficient
- Automatic linking without user confirmation: Linking is thinking
- Code analysis / AST parsing: PKM domain only, not code intelligence
- Video/audio transcription: No user need in PKM context
- Hyperedges: MOC pattern covers the use case
- Real-time clustering on every keystroke: Batch analysis is sufficient

## Dependencies & Risks

### Dependencies
- FEATURE-2001 (Confidence) must be completed before FEATURE-2004 (Retrieval Quality)
- FEATURE-2002 (Community Detection) must be completed before FEATURE-2004 (Cluster-aware Retrieval)
- Existing GraphStore, OntologyStore, VaultHealthService, SemanticIndexService as foundation

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Louvain in JS not performant enough | M | H | PoC with real data first. Fallback: Label Propagation |
| Clusters not comprehensible to users | M | H | LLM-generated cluster names + user confirmation |
| Batch ingest produces AI slop | M | H | Deterministic preprocessing. LLM only for semantic decisions |
| Token costs explode | L | M | Entity cache, deterministic steps, token budget per batch |
| Graph analysis too slow for 1000+ notes | L | M | SQL-based pre-computation, caching, incremental updates |
