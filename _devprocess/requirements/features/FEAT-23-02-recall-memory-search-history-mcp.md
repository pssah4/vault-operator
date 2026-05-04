---
id: FEAT-23-02
title: recall_memory + search_history MCP-Tools (Lese-Pfad)
epic: EPIC-23
priority: P0
date: 2026-05-03
related-bas: BA-26
adr-refs: [ADR-107]
plan-refs: []
depends-on: [IMP-03-17-01]
---

# FEAT-23-02: recall_memory + search_history MCP-Tools

## Description

Zwei neue MCP-Tools fuer den Lese-Pfad: externe Chat-UIs koennen
ueber Obsilo Remote MCP Memory recallen und History durchsuchen.
Das interne `recall_memory`-Tool wird als MCP-Tool exposed; das
interne `search_history` ebenso.

## Benefits Hypothesis

Wenn jedes Chat-Tool Obsilo's Memory + History abfragen kann, dann
muss Sebastian nichts manuell wiederholen, was er schon einmal
festgehalten hat.

## User Stories

**US-01** -- Functional Job (Recall):
- **As** Sebastian, der in Claude Code arbeitet,
- **I want to** Memory-Treffer zu meinem aktuellen Topic abrufen,
- **so that** ich vergangene Insights aus anderen Tools nutze.

**US-02** -- Functional Job (Search-History):
- **As** Sebastian
- **I want to** in vergangenen Conversations (egal aus welchem Tool)
  nach einem Stichwort suchen,
- **so that** ich den passenden Kontext schnell finde.

## Success Criteria

| ID | Criterion | Measurement | Method |
|----|-----------|-------------|--------|
| SC-01 | recall_memory liefert Top-K Facts via Cosine ueber fact_embeddings | Eval | Test |
| SC-02 | Optional Filter auf source_interface | Eval | Test |
| SC-03 | search_history liefert Treffer aus history_chunks-Tabelle | Eval | Test |
| SC-04 | Externe Clients erhalten konsistentes JSON-Format (RecallHit-Schema) | Schema-Test | Test |

## Technical NFRs

- **Performance**: < 300ms p95 fuer recall_memory, < 200ms fuer
  search_history (LIKE-Search).
- **Vorbedingung**: IMP-03-17-01 (Cosine-Fix recall_memory) muss
  vorher geliefert sein, sonst liefert das Tool weiterhin Token-
  Overlap-Placeholder.

## ASRs

- **ASR-1 (Critical)**: MCP-Tool-Wrapper um die internen Tools.
  Kein eigener Retrieval-Code dupliziert.
- **ASR-2 (Moderate)**: Result-Format konsistent mit dem internen
  recall_memory-Output (RecallHit[]).

## Definition of Done

- [ ] Zwei MCP-Tools registriert
- [ ] Tools sind thin wrappers um interne Implementierungen
- [ ] source_interface-Filter funktioniert
- [ ] Tests gruen
- [ ] UAT: Cross-Tool-Recall (ChatGPT save -> Claude recall)

## Out of Scope

- Reranker-Integration (FEAT-03-17 bestehender Pfad)
- Edge-Walk via UnifiedGraphService
