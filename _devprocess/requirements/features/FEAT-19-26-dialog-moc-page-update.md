# Feature: Dialog-getriebener MOC-Page-Update beim Ingest

> **Feature ID**: FEAT-19-26
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.2.1
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

Im Dialog-Modus (FEAT-19-22) zeigt das System im Update-Plan auch welche MOC-Pages durch den Ingest beruehrt werden. Bei aktiver MOC-Pflege (FEAT-19-11) generiert das System Vorschlaege fuer MOC-Page-Aenderungen (neue Verlinkungen, Cluster-Hub-Updates), die der User pro MOC approven oder dismissen kann.

Karpathys "single source might touch 10-15 wiki pages" wird im Dialog-Modus sichtbar gemacht.

## Benefits Hypothesis

Wir glauben, dass MOC-Updates im Dialog die Karpathy-Erwartung "10-15 wiki pages touched" sichtbar erfuellen. Folgende messbare Outcomes liefert: User sieht aktiv wie sich Vault durch Ingest weiterentwickelt; MOC-Pflege bleibt User-controlled, nicht vollautomatisch.

Wir wissen, dass wir erfolgreich sind, wenn pro Ingest mehrere (3-15) MOC-Updates vorgeschlagen werden und User > 50% approved.

## User Stories

**Story 1:** Als Power-User mit MOC-Praxis moechte ich beim Ingest sehen, welche MOC-Pages durch die neue Source aktualisiert werden, um Auswirkung auf mein Wissensnetz zu verstehen.

**Story 2:** Als Power-User moechte ich pro MOC-Update entscheiden koennen, statt dass das System bulk schreibt.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | MOC-Updates werden im Update-Plan gelistet | Pro Source mehrere MOCs sichtbar | UI-Test |
| SC-02 | User kann pro MOC approven oder dismissen | Per-MOC-Steuerung | Manueller Test |
| SC-03 | MOC-Update ist konsistent mit FEAT-19-11 Marker-Konvention | Marker-Block respektiert | Integration-Test |
| SC-04 | Wenn FEAT-19-11 nicht aktiv: MOC-Updates als Vorschlag, nicht Write | Setting-Abhaengigkeit | Unit-Test |
| SC-05 | Dialog-Pause moeglich zwischen MOC-Decisions | Resume-Faehigkeit | Integration-Test |

## Technical NFRs

- **Performance:** MOC-Update-Vorschlaege batch-LLM-Call, nicht pro MOC einzeln.
- **Token-Kosten:** integriert in Dialog-Ingest-Budget (FEAT-19-22).

## Definition of Done

- MOC-Detection-Pipeline (welche MOCs sind durch Cluster-Match betroffen).
- Update-Plan-Erweiterung um MOC-Section.
- Per-MOC-Approval-UI.
- Integration mit FEAT-19-11 (Marker-Konvention).
- Integration-Test im Dialog-Modus.
