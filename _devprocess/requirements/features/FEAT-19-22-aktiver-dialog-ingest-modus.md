# Feature: Aktiver Dialog-Ingest-Modus (Modus A)

> **Feature ID**: FEAT-19-22
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.2.1
> **Priority**: P0
> **Effort Estimate**: L

## Feature Description

Karpathys Default-Pattern: nach Triage-Decision "Ingest" startet ein Multi-Turn-Dialog im Chat-Sidebar. LLM zeigt Key-Take-Aways, fragt User welche wichtig sind und was betont werden soll. User leitet Sense-Making-Prozess. LLM schlaegt Update-Plan vor (welche Notes neu, welche beruehrt, geschaetzte Anzahl Vault-Aenderungen). User approved pro Note oder bulk.

Token-Kosten Ziel: 0.30-1.00 USD pro Source. User-Time: 5-15 Minuten. System-Default-Modus laut User-Praeferenz.

## Benefits Hypothesis

Wir glauben, dass aktiver Dialog-Ingest hoehere Note-Qualitaet liefert als Auto-Modus, weil User-Betonung einfliesst (BA-25 H-18). Folgende messbare Outcomes liefert: > 60% Power-User waehlen Dialog-Modus als Default (BA-25 H-16); Sense-Making-Notes bewertet User > 7 NPS.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Use Sebastian Dialog-Modus aktiv nutzt und Sense-Making-Notes als wertvoll markiert.

## User Stories

**Story 1:** Als Sebastian moechte ich beim Ingest aktiv mitgestalten was im Vault landet, weil Sense-Making meine Aufgabe ist und ich nur LLM-Hilfe aus Dialog akzeptiere.

**Story 2:** Als Power-User moechte ich vor Vault-Aenderung sehen, welche Notes beruehrt werden, um Trust aufzubauen und Plan editieren zu koennen.

**Story 3:** Als User moechte ich pro Note approven oder bulk-approven, um Effizienz mit Kontrolle zu balancieren.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Dialog laeuft im Chat-Sidebar (kein Modal-Lock) | UI-Test | Manueller Test |
| SC-02 | Key-Take-Aways werden mit Block-Refs gerendert | Klickbare Source-Links | Integration-Test |
| SC-03 | User-Antworten beeinflussen Update-Plan messbar | Plan-Variation pro User-Input | Sample-Test |
| SC-04 | Update-Plan zeigt alle beruehrten Notes vor dem Schreiben | Approval-Schritt | UI-Test |
| SC-05 | Pro-Note- und Bulk-Approval funktionieren | Beide Pfade | Integration-Test |

## Technical NFRs

- **Performance:** Multi-Turn-Dialog bleibt responsiv (< 5s LLM-Antwort pro Turn).
- **Token-Kosten:** 0.30-1.00 USD pro Source (mehrere LLM-Passes).
- **State-Management:** Dialog-State zwischen Turns persistiert.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Dialog-State-Persistenz ist Open Question (Conversation, eigene Tabelle, Memory-v2). ADR-Bedarf.
- **ASR-2 (Moderate):** Plan-Editing-UI muss reversibel sein (jede User-Korrektur wirkt sofort).

## Definition of Done

- Dialog-State-Machine implementiert.
- Chat-Sidebar-Integration mit Multi-Turn-Support.
- Update-Plan-Render-Komponente plus Approval-UI.
- Live-Test mit Sebastians Sample-Source.
- Telemetrie pro Dialog-Session (Turns, Token, Time).
