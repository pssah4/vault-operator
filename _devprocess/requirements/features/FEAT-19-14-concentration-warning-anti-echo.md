# Feature: Concentration-Warning UI plus Anti-Echo-Vorschlag

> **Feature ID**: FEAT-19-14
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.3, 11.4
> **Priority**: P1
> **Effort Estimate**: S

## Feature Description

Wenn Concentration-Score eines Clusters > 0.7 (default, konfigurierbar) plus min 5 Notes: Warning erscheint im Vault-Health-Modal mit Empfehlung "Suche aktiv Gegenpositionen aus alternativen Quellen". Klick auf "Anti-Echo-Suche starten" triggert Light-Web-Search mit Source-Filter (block dominante Domain). Findings landen als Triage-Vorschlaege in Inbox.

Trigger: beim Ingest neuer Notes (Re-Check des betroffenen Clusters) plus beim Vault-Health-Check (passiver SQL-Pass).

## Benefits Hypothesis

Wir glauben, dass Anti-Echo-Vorschlag in > 20% der Faelle dazu fuehrt, dass User aktiv Gegenpositionen sucht (BA-25 H-10). Folgende messbare Outcomes liefert: Source-Diversity pro Cluster steigt messbar (BA-25 KPI > 3 distinct Domains pro 10 Notes); Echo-Chamber-Effekt wird aktiv kontert.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Use mindestens eine Concentration-Warning durch User-Aktion aufgeloest wurde.

## User Stories

**Story 1:** Als Power-User moechte ich aktiv darauf hingewiesen werden, wenn ein Cluster einseitig wird, um meine Sicht nicht enger werden zu lassen.

**Story 2:** Als Power-User moechte ich auf Klick eine Web-Suche fuer Gegenpositionen starten, ohne meinen aktuellen Workflow zu verlassen.

**Story 3:** Als User moechte ich Warnings dismissen koennen, wenn Concentration-Detection im Einzelfall falsch greift.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Warning erscheint bei Concentration > Schwellwert | Threshold konfigurierbar | Unit-Test |
| SC-02 | Anti-Echo-Suche filtert dominante Domain | Source-Filter aktiv | Integration-Test |
| SC-03 | Findings landen als Triage-Vorschlag | Inbox-Workflow | Integration-Test |
| SC-04 | Warning kann dismissed werden | dismissed_health_findings reused | Unit-Test |
| SC-05 | Token-Kosten Web-Search analog Stufe-2-Lint | < 0.50 USD pro Anti-Echo-Suche | Telemetrie |

## Technical NFRs

- **Performance:** Warning-Detection beim Vault-Health-Pass (SQL-only, < 100ms).
- **Token-Kosten:** Anti-Echo-Suche optional, klick-getriggert.
- **UI:** Konsistent im Vault-Health-Modal.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Schwellwert-Default (0.7) und min-Notes (5) sind Sebastians Annahme, ADR-Bedarf fuer adaptive Heuristik.

## Definition of Done

- Detection-Pipeline (SQL auf cluster_source_stats).
- Modal-UI-Erweiterung mit Warning-Darstellung.
- Anti-Echo-Suche-Action (reuse Web-Search-Provider von FEAT-19-19).
- Dismiss-Action.
- Integration-Tests.
