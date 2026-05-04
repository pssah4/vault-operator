---
id: IMP-03-17-01
feature: FEAT-03-17
epic: EPIC-03
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# IMP-03-17-01: recall_memory queryFacts auf Cosine ueber fact_embeddings

## Problem

Die heutige Implementierung von `RecallMemoryTool.queryFacts` (siehe
[src/core/tools/memory/RecallMemoryTool.ts](../../../src/core/tools/memory/RecallMemoryTool.ts))
nutzt Token-Overlap-Scoring auf der `listLatest`-Liste der Facts. Der
Code-Kommentar markiert das selbst als "Phase-3 placeholder retrieval".

FEAT-03-17 SC-03 verlangt explizit Cosine-Similarity ueber die
`fact_embeddings`-Tabelle, identisch zum semantic_search-Pfad. Heute
liefert `recall_memory` daher schwaechere Ergebnisse als die Spec
verspricht und unterscheidet sich von `semantic_search` ohne Grund.

## Loesung

`queryFacts` ruft den vorhandenen `EmbeddingService` auf, embedded die
User-Query, fuehrt einen Cosine-Lookup gegen `fact_embeddings` aus und
sortiert die Top-N (default top_k=5) nach Score. Ergebnisformat bleibt
unveraendert (RecallHit[]). Token-Overlap bleibt als Fallback erhalten,
falls EmbeddingService nicht verfuegbar ist (offline / fehlende API-Key).

## Akzeptanzkriterien

- `queryFacts` erzeugt einen Embedding-Call und scort gegen
  `fact_embeddings` per Cosine.
- Top-K Sortierung deterministisch.
- Bestehender Snapshot-Test in
  [__tests__/RecallMemoryTool.test.ts](../../../src/core/tools/memory/__tests__/RecallMemoryTool.test.ts)
  weiter gruen oder mit fixed-mock-embedding angepasst.
- Neuer Test deckt einen Cosine-Treffer mit erwarteter Reihenfolge ab.
- Kein Schema-Change, keine neue Public-API.

## Definition of Done

- Code geliefert, Build gruen, Tests gruen.
- Backlog-Row auf Done.

## Out-of-Scope

- Reranker-Integration (Phase 4 / spaetere Iteration).
- Edge-Walk via UnifiedGraphService (deferred zur UCM-Initiative).
