# Feature: Source-Folder vs Wissens-Folder Konfiguration

> **Feature ID**: FEAT-19-25
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.6
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

Settings fuer Folder-Layout: wo landen Original-Sources, wo Sense-Making-Notes (Modus 2 und 3), wo bibliographische Summary-Notes. Default-Vorschlag: `Sources/` fuer Original-Sources, Cluster-Match-Folder fuer Sense-Making-Notes (auto-detected aus Ontologie). Power-User kann eigene Konvention konfigurieren.

Optionaler Sub-Folder pro Source-Typ (`Sources/Articles`, `Sources/PDFs`, `Sources/Web`) als Open-Question fuer Architektur.

## Benefits Hypothesis

Wir glauben, dass User mit existierender Vault-Struktur das System ohne Re-Organisation nutzen koennen. Folgende messbare Outcomes liefert: Sebastians bestehende Folder-Struktur bleibt unangetastet; neue User bekommen sinnvollen Default ohne Setup.

Wir wissen, dass wir erfolgreich sind, wenn alle Output-Modi (FEAT-19-24) korrekt mit den konfigurierten Foldern arbeiten.

## User Stories

**Story 1:** Als Sebastian moechte ich meine bestehende Folder-Struktur (zB `00 Inbox`, `10 Quellen`, `20 Zettel`) konfigurieren koennen, ohne dass das System eigene Folder erzwingt.

**Story 2:** Als neuer User moechte ich einen sinnvollen Default-Layout bekommen, ohne mich mit Vault-Architektur beschaeftigen zu muessen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Folder-Pfade konfigurierbar in Settings | Source-Folder, Wissens-Folder | UI-Test |
| SC-02 | Default-Layout funktioniert ohne Konfiguration | Auto-Detect via Ontologie | Integration-Test |
| SC-03 | Folder werden bei Bedarf automatisch erstellt | Vault-API-Call | Unit-Test |
| SC-04 | Pfade werden validiert (existierender Vault-Pfad) | Pre-Save-Check | Unit-Test |
| SC-05 | Aenderung wirkt nur auf neue Ingests | Bestehende Notes bleiben | Integration-Test |

## Technical NFRs

- **Performance:** Folder-Lookup bei Ingest < 5ms.
- **Failure-Mode:** Wenn konfigurierter Folder nicht existiert, wird er erstellt oder Notification.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Source-Folder-Pfad als Open Question (dedicated Sub-Folder pro Source-Typ vs einziger Folder). ADR-Bedarf.

## Definition of Done

- Settings-Schema fuer drei Folder-Pfade (Source, Wissen, Bibliographie optional).
- Default-Auto-Detect-Logik.
- Folder-Validierung beim Save.
- Auto-Create bei Bedarf.
- Integration-Test mit Sebastians Folder-Layout.
