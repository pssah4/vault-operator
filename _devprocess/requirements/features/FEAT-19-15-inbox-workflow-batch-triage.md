# Feature: Inbox-Workflow fuer Batch-Triage

> **Feature ID**: FEAT-19-15
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.5
> **Priority**: P2
> **Effort Estimate**: M

## Feature Description

Webclipper-Inbox-Folder wird vom System ueberwacht. "Triage Inbox"-Command zeigt Liste aller untriaged Notes mit Triage-Karten plus Schnell-Actions. User kann pro Note entscheiden oder Bulk-Action (alle ergaenzenden ingesten, alle nieder-priorisierten verschieben).

Bei Bulk-Ingest: Modus B (Auto, FEAT-19-23) ist Default. Einzelne Sources koennen auf Modus A (Dialog, FEAT-19-22) geschoben werden.

## Benefits Hypothesis

Wir glauben, dass ein Inbox-Workflow den Backlog-Schmerz fuer User mit aktivem Webclipper loest, weil Triage in einer Sitzung statt verstreut moeglich ist. Folgende messbare Outcomes liefert: Inbox-Backlog wird systematisch aufgeloest statt unbegrenzt zu wachsen.

Wir wissen, dass wir erfolgreich sind, wenn Power-User mit Webclipper-Workflow das Feature regelmaessig nutzen.

## User Stories

**Story 1:** Als Power-User mit Webclipper moechte ich periodisch durch meine Inbox gehen und in einer Sitzung alle gesammelten Sources entscheiden, statt jede einzeln im Dialog zu pflegen.

**Story 2:** Als Power-User moechte ich eine Bulk-Action "alle ergaenzenden Sources auto-ingesten", um Routine-Aufnahme zu beschleunigen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Inbox-Folder ist konfigurierbar | Settings-Pfad | Manueller Test |
| SC-02 | Liste aller untriaged Notes wird angezeigt | Sortierbar | UI-Test |
| SC-03 | Pro Note wird Triage-Karte gerendert | Lazy-Load fuer Performance | UI-Test |
| SC-04 | Bulk-Actions funktionieren | "Alle ergaenzenden ingesten", "Alle nieder verschieben" | Integration-Test |
| SC-05 | Einzelne Sources koennen auf Dialog-Modus geschoben werden | Per-Note-Override | Manueller Test |

## Technical NFRs

- **Performance:** Lazy-Load der Triage-Karten, max 20 gleichzeitig sichtbar.
- **Token-Kosten:** Triage pro Note < 0.05 USD, Bulk-Limit konfigurierbar.

## Definition of Done

- Inbox-Folder-Konfiguration in Settings.
- Inbox-Command plus UI-Komponente.
- Bulk-Action-Handler.
- Per-Note-Modus-Override.
- Integration-Test mit 10 Mock-Inbox-Notes.
