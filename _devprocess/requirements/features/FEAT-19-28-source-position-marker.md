# Feature: Source-Position-Marker (Block-Refs MD, Page-Refs PDF, Anchor URL)

> **Feature ID**: FEAT-19-28
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.2.1, 11.2.4
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Jeder Take-Away beim Ingest traegt einen Source-Position-Marker im Perplexity-Stil. Sense-Making-Notes referenzieren via klickbarem Link auf die genaue Position in der Source. Drei Source-Typen, drei Marker-Strategien:

- **Markdown:** Block-Reference Obsidian-Native `[[source-note#^block-id]]`. System setzt Block-IDs beim Source-Note-Schreiben.
- **PDF:** Page-Reference `[[source.pdf#page=N]]` (Obsidian-Native PDF-Page-Refs), plus optional Inline-Excerpt-Quote als Beleg.
- **URL/HTML:** Anchor-Link wenn Section-IDs vorhanden, sonst Quote-Block mit Original-Wortlaut als Beleg.

Im Chat-Sidebar werden Marker als "[1]", "[2]" gerendert, hover zeigt Source-Excerpt.

## Benefits Hypothesis

Wir glauben, dass klickbare Source-Position-Marker die Provenienz jedes Claims sichtbar machen. Folgende messbare Outcomes liefert: User kann pro Take-Away in Sekunden zur Source-Stelle navigieren (BA-25 H-21); Wissen bleibt grounded und nachvollziehbar.

Wir wissen, dass wir erfolgreich sind, wenn alle drei Source-Typen klickbar funktionieren auf Obsidian Desktop und Mobile.

## User Stories

**Story 1:** Als Power-User moechte ich pro Sense-Making-Aussage in einer Note auf die Source-Stelle klicken koennen, um den Kontext zu pruefen.

**Story 2:** Als User moechte ich Marker im Perplexity-Stil sehen ([1], [2]), weil das ein etabliertes UX-Pattern ist.

**Story 3:** Als System moechte ich Block-IDs deterministisch generieren, sodass dieselbe Source mehrmals dieselben Marker bekommt (Idempotenz).

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Markdown-Block-Refs sind klickbar in Obsidian | Desktop + Mobile | Manueller Test |
| SC-02 | PDF-Page-Refs oeffnen PDF an richtiger Page | Desktop + Mobile | Manueller Test |
| SC-03 | URL-Anchor oder Quote-Block als Fallback funktioniert | URL-Test-Cases | Integration-Test |
| SC-04 | Block-IDs sind deterministisch fuer dieselbe Source | Idempotenz-Test | Unit-Test |
| SC-05 | Marker im Chat als "[1]", "[2]" mit Hover-Excerpt | UI-Test | Manueller Test |

## Technical NFRs

- **Performance:** Block-ID-Generierung waehrend Source-Note-Write < 50ms.
- **Robustness:** Marker bleiben funktional wenn Source-Note umbenannt wird (Wikilink-Auto-Update).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Block-Reference-Konvention (System-generated `^block-N` vs LLM-Sprechende-IDs) ist ADR-Bedarf.
- **ASR-2 (Moderate):** PDF-Page-Reference-Format Plattform-Kompatibilitaet (Open Question fuer Obsidian-Sync auf iOS/Android).

## Definition of Done

- Block-ID-Generator (deterministisch).
- Source-Note-Writer mit Block-IDs.
- Marker-Renderer fuer Chat-Sidebar (mit Hover-Excerpt).
- Integration mit FEAT-19-22 (Dialog) und FEAT-19-23 (Auto).
- Cross-Platform-Test (Desktop, Mobile).
