# Feature: Cluster-Source-Stats fuer Source-Diversity-Tracking

> **Feature ID**: FEAT-15-11
> **Epic**: EPIC-15 - Knowledge Layer
> **Source**: BA-25 Section 11.3
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

Eine neue Tabelle `cluster_source_stats` (Schema: cluster, source_domain, note_count, first_seen_at, last_seen_at) zaehlt pro Cluster den Anteil pro Source-Domain. Wird beim Ingest aktualisiert, ermoeglicht Concentration-Score-Berechnung (max(note_count) / sum(note_count)) und Diversity-Score (Shannon-Entropy).

Basis fuer Source-Concentration-Lint (FEAT-19-17) und Anti-Echo-Vorschlag (FEAT-19-14). Optionaler Author-Level-Tracking als spaetere Iteration.

## Benefits Hypothesis

Wir glauben, dass strukturiertes Source-Tracking Concentration-Cases mit > 80% Precision identifiziert (BA-25 H-08). Folgende messbare Outcomes liefert: System kann pro Cluster verlaesslich sagen welche Domains dominieren; Bias-Hints werden datenbasiert generiert, nicht geraten.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Use erste Concentration-Warning korrekt feuert (BA-25 KPI).

## User Stories

**Story 1:** Als System moechte ich pro Cluster die Source-Verteilung in Millisekunden abfragen koennen, um Bias-Lint und Anti-Echo-Vorschlaege zu betreiben.

**Story 2:** Als Power-User moechte ich in Settings sehen koennen, welche Cluster konzentriert sind, um meine Source-Diversity bewusst steuern zu koennen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Pro Ingest wird Stats aktualisiert | 100% der Ingests | Unit-Test |
| SC-02 | Concentration-Score berechenbar in < 10ms pro Cluster | SQL-Query | Performance-Test |
| SC-03 | Diversity-Score (Shannon) berechenbar | Math-Korrektheit | Unit-Test |
| SC-04 | Source-Domain-Identifikation robust | URL-parse mit Edge-Cases | Unit-Test |
| SC-05 | Stats sind cluster-isoliert | Keine Cross-Contamination | Integration-Test |

## Technical NFRs

- **Performance:** SQL-Update beim Ingest < 5ms.
- **Storage:** Schema-Migration v9 -> v10 (gemeinsam mit FEAT-15-09/10/12).
- **Domain-Normalisierung:** http vs https vs www-Subdomain konsistent behandeln.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Source-Identitaet ist Open Question (Domain-only fuer MVP, Author-Level spaeter). ADR-Bedarf.

## Definition of Done

- Migration v9 -> v10 (Bundle).
- Tabelle plus Read/Write-API.
- Concentration- und Diversity-Score-Helper.
- Update-Hook im Ingest-Pipeline.
- Unit-Tests fuer Score-Berechnung.
