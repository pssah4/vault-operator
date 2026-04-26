---
id: ADR-076
title: Episode-Fact-Boundary -- Trennung von Verhaltens-Outcomes und Wissens-Statements
status: Proposed
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-013-memory-architecture.md
  - ADR-018-episodic-task-memory.md
  - ADR-058-semantic-recipe-promotion.md
  - PLAN-001-memory-v2-master.md
---

# ADR-076 -- Episode-Fact-Boundary

## Context

Memory v2 fuehrt eine `facts`-Tabelle ein. Heute existieren bereits zwei verwandte Tabellen in `memory.db`:

- **`episodes`** (ADR-018): Task-Outcomes mit `mode`, `tool_sequence`, `result_summary`, `success`
- **`recipes`** (ADR-058): Semantische Promotion aus 3+ aehnlichen erfolgreichen Episodes

Ohne klare Boundary entstehen drei Risiken:

1. Doppelter LLM-Call pro Conversation (Episode + Fact extraction)
2. Redundanz: ein "Sebastian nutzt npm run dev"-Statement koennte Fact UND Episode-Bestandteil sein
3. Recipe-Promotion ignoriert die neue Fact-Welt, oder vermischt Verhaltens-Patterns mit Wissens-Statements

## Decision

Drei klar getrennte Domaenen mit unterschiedlichen Lifecycles:

| Tabelle | Inhalt | Lifecycle | Trigger |
|---|---|---|---|
| `episodes` | Was hat funktioniert (Verhaltens-Outcome) | Append-only, fuettert Recipe-Promotion | Bei jeder erfolgreichen Conversation, automatisch (ADR-018) |
| `recipes` | Wiederverwendbare Verhaltens-Patterns | Promote-on-Threshold, Use-Tracking | Wenn 3+ aehnliche Episodes (ADR-058) |
| `facts` | Atomic Wissens-Statements (Identity, Praeferenzen, Beziehungen, Projekte, Patterns als Aussagen) | Importance-Decay, Conflict-Resolution, Aging | Bei `memoryEligible=true` Conversations (Phase 5) |

**Boundary-Regel:** 

- *"Sebastian arbeitet bei EnBW"* -> Fact (Wissen)
- *"Bei Coding-Tasks dieser Art folgt Sebastian dem Plan-Mode-Pattern"* -> Episode (Outcome) + bei Wiederholung Recipe (Verhalten)
- *"Sebastian bevorzugt Plan-Mode bei nicht-trivialen Aenderungen"* -> Fact (Praeferenz, abstrahierter Sinn)

**Cross-Reference:** `fact_edges` mit Edge-Type `derived_from_episode` erlaubt Bruecken zwischen Domaenen, ohne sie zu vermischen.

**LLM-Call-Konsolidierung:** Single-Call-Extraction (PLAN-001 Phase 4) produziert in einem Pass:

- Session-Summary (heute SessionExtractor)
- Fact-Candidates mit Topics + Importance
- Episode-Outcome (heute EpisodicExtractor)
- Optional Recipe-Hints (wenn Pattern detected)

Statt 2-3 separate LLM-Calls heute -> 1 Call mit strukturiertem Output.

## Consequences

**Positiv:**

- Token-Reduktion ~50% pro Conversation (1 Call statt 2-3)
- Klare mentale Modelle: User weiss, was wo lebt
- Recipe-Promotion bleibt unangetastet, kein Refactor-Risiko
- Edge-Type `derived_from_episode` erlaubt spaetere Multi-Hop-Queries ("welche Facts entstanden aus Coding-Episodes?")

**Negativ:**

- Single-Call-Extraction-Output wird komplexer (mehr Felder, mehr Parsing-Risiko)
- Boundary-Entscheidung in Edge-Faellen ist subjektiv ("ist 'arbeitet auf Mac' eine Praeferenz oder eine Identity?") -> Eval-Test-Set muss diese Faelle abdecken

**Supersedes:** ADR-013 (Memory Architecture, 3-Tier-Modell) wird durch ADR-076 + ADR-077 + ADR-013-Update ersetzt. ADR-013 bleibt als historische Referenz.

## Alternatives Considered

1. **Episode-Tabelle abschaffen, alles in Facts** -- Verwirft ADR-018-Investition, Recipe-Promotion muss umgebaut werden, kein Gewinn ausser Schema-Reduktion.
2. **Facts in Episode-Tabelle integrieren** -- Macht Episode-Schema multi-purpose, brechen die ADR-018-Garantien (append-only, success-tracking).
3. **Vollkommen separate DBs** -- Verstreut Memory-Stacks, macht UCM-Engine unklarer.

## Open Questions

- Wie wird der Boundary-Test fuer einen LLM-Output formalisiert (Prompt-Engineering)?
- Welche Eval-Cases gehoeren ins Test-Set, um Edge-Cases abzudecken?
