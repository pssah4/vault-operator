# Feature: Bibliographische Summary-Note mit Base-Block fuer Multi-Zettel-Modus

> **Feature ID**: FEAT-19-30
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.6 Modus 3
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

Im Multi-Zettel-Modus (FEAT-19-24) wird zusaetzlich zum Original-Source-Note und den Multi-Zettel-Notes eine **bibliographische Summary-Note** erstellt:

- Frontmatter: Autor, Jahr, Titel, URL, Source-Typ, Keywords, Themen, Konzepte (Standard-Pipeline).
- Body: 1-Absatz-Abstract (auto), plus auto-generierter **Cross-Reference-Block via Obsidian Base** (`base`-Codeblock), der dynamisch alle Notes zeigt, die `source: [[bibliographische-summary-note]]` als Property haben.

Die einzelnen Multi-Zettel haben Frontmatter-Property `source: [[bibliographische-summary-note]]`. So bleibt die Bibliografie automatisch aktuell, auch wenn spaeter Zettel hinzukommen oder entfernt werden.

## Benefits Hypothesis

Wir glauben, dass die Bibliografie mit Base-Block selbst-aktualisierend bleibt und User keine manuelle Pflege erfordert (BA-25 H-23). Folgende messbare Outcomes liefert: Zwei Wege zur Gesamtsicht (Base-Block plus Backlinks-Panel); Source-Provenienz pro Zettel ist trace-bar.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Multi-Zettel-Use 10 Bibliografie-Notes ohne User-Eingriff aktuell bleiben.

## User Stories

**Story 1:** Als Sebastian moechte ich pro Source eine Bibliografie-Note haben, die alle abgeleiteten Zettel zeigt, ohne dass ich diese Liste manuell pflegen muss.

**Story 2:** Als Power-User moechte ich die Bibliografie-Note als Anker-Punkt nutzen, um Source-Provenienz sichtbar zu halten.

**Story 3:** Als User moechte ich, dass neue Zettel automatisch im Base-Block der Summary auftauchen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Bibliografie-Note wird im Multi-Zettel-Modus erstellt | 100% der Modus-3-Ingests | Integration-Test |
| SC-02 | Frontmatter enthaelt bibliografische Felder | Autor, Jahr, Titel, URL minimum | Unit-Test |
| SC-03 | Base-Block zeigt alle abgeleiteten Zettel | Live-Update bei Zettel-Add/Remove | Integration-Test |
| SC-04 | Multi-Zettel haben source-Property auf Bibliografie | 100% der Zettel | Unit-Test |
| SC-05 | Zwei Sicht-Wege funktionieren (Base + Backlinks) | UI-Test | Manueller Test |

## Technical NFRs

- **Performance:** Base-Block-Generierung einmalig beim Bibliografie-Note-Create.
- **Sync:** Base-Codeblock-Format muss Obsidian-Bases-Plugin-kompatibel sein.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Bibliografie-Schema (Frontmatter-Felder) als Standard oder Template-konfigurierbar pro User. ADR-Bedarf.
- **ASR-2 (Moderate):** Base-Codeblock-Standard-Query muss validiert sein gegen aktuelles Bases-Schema.

## Definition of Done

- Bibliografie-Note-Generator-Pipeline.
- Frontmatter-Schema (mit sinnvollem Default).
- Base-Codeblock-Template.
- Multi-Zettel-Source-Property-Verlinkung.
- Live-Test mit 5 Sources im Multi-Zettel-Modus.
