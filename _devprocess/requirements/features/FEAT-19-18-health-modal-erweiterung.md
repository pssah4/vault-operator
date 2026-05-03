# Feature: Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons

> **Feature ID**: FEAT-19-18
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 12.5
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Vault-Health-Modal wird erweitert um drei neue Check-Kategorien zusaetzlich zu den 7 bestehenden strukturellen Checks:

- **Freshness** (FEAT-19-16, Stufe 1)
- **Source-Concentration** (FEAT-19-17, Bias)
- **Update-Findings** (FEAT-19-19/20, Stufe 2/3 extern)

Plus Tab "Pending Triage" fuer Auto-Trigger (FEAT-19-27).
Plus Tab "Recent Ingests" fuer Auto-Modus-Review (FEAT-19-23).

UI-Konzept:
- Gruppierung nach Severity (Critical / Warning / Hint).
- Innerhalb Severity Gruppierung nach Kategorie.
- Pro Finding: Title, Cluster/Note-Referenz, kontext-spezifische Action-Buttons.
- Filter-Toggles fuer Kategorien.
- Bulk-Dismiss-Action.

## Benefits Hypothesis

Wir glauben, dass UI-Konsistenz im Vault-Health-Modal Time-to-Action um > 30% reduziert (BA-25 H-15). Folgende messbare Outcomes liefert: User hat eine zentrale Anlaufstelle fuer alle Wissens-Operationen; konsistente Action-Buttons reduzieren kognitive Last.

Wir wissen, dass wir erfolgreich sind, wenn User-Befragung das Modal als zentralen Hub bestaetigt.

## User Stories

**Story 1:** Als User moechte ich alle Vault-Probleme an einem Ort sehen, statt zwischen verschiedenen UIs hin- und herzuwechseln.

**Story 2:** Als User moechte ich Findings nach Severity priorisieren und Kategorien filtern koennen, weil die Liste lang werden kann.

**Story 3:** Als User moechte ich Bulk-Dismiss machen koennen, weil manche Findings irrelevant sind.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Alle drei neuen Kategorien rendern im Modal | UI-Test | Manueller Test |
| SC-02 | Severity-Sortierung (Critical -> Warning -> Hint) | UI-Test | Manueller Test |
| SC-03 | Filter-Toggles funktionieren | Per-Kategorie | UI-Test |
| SC-04 | Bulk-Dismiss verfuegbar | Pro Kategorie und global | Integration-Test |
| SC-05 | Kontext-spezifische Action-Buttons pro Finding | Action-Map korrekt | Manueller Test |

## Technical NFRs

- **Performance:** Modal-Open < 200ms bei 50 Findings.
- **Skalierung:** Modal handhabt > 100 Findings ohne UI-Lag (Virtualisierung optional).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Health-Modal-Severity-Modell (Sortierung, Threshold, Filter) ist ADR-Bedarf.

## Definition of Done

- UI-Komponente erweitert um drei Check-Kategorien plus zwei Tabs.
- Severity-Sortierung implementiert.
- Filter- und Bulk-Dismiss-Actions.
- Action-Button-Map pro Finding-Type.
- Integration-Tests mit Mock-Findings.
