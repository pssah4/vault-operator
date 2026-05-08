# IMP-19-15-01: Bulk-UI fuer Triage-Inbox-Tab

**Prioritaet:** P2
**Feature-Bezug:** FEAT-19-15 (Inbox-Workflow fuer Batch-Triage), EPIC-19

## Problem

FEAT-19-15 ist als Done markiert, aber der Inbox-Workflow ist heute
nur Backend: "Triage Inbox"-Command scannt passende Notes (Frontmatter-
Property-Match) und queued Triage-Aktionen. Es fehlt die User-sichtbare
Bulk-Aktion-UI aus BA-25 11.5: pro Note eine Triage-Karte mit
Schnell-Actions, oder Bulk-Action ("alle ergaenzenden ingesten, alle
nieder-priorisierten verschieben").

## Scope

1. Vault-Health-Modal-Tab "Pending Triage": Tabelle aller untriaged
   Notes mit Cluster-Match, Score, Empfehlung.
2. Pro Row: 3 Actions (Ingest / Spaeter / Verwerfen).
3. Header: Bulk-Action-Buttons (Ingest alle ergaenzenden, Verschieben
   alle nieder-priorisierten).
4. Multi-Select via Checkbox-Spalte.
5. Decision-Setzung schreibt direkt in den triage_log Store, queue
   ggf den Auto-Ingest oder Dialog-Trigger.

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | Tab zeigt alle untriaged Notes mit Triage-Karte |
| AC-02 | Single-Decision setzt Status korrekt im triage_log |
| AC-03 | Bulk-Decision wirkt auf Multi-Select-Subset |
| AC-04 | Refresh-Button laedt nach manueller Note-Aenderung neu |

## Files

- `src/ui/healthModal/PendingTriageTab.ts` (neu)
- `src/core/ingest/IngestTriageLogStore.ts`: bulk-API ergaenzen.
