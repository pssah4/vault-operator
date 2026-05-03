---
id: PLAN-14
title: BA-25 Phase 5 Erweiterte Schichten (Stufe-3 + Top-Hub-Block)
date: 2026-05-03
status: Active
feature-refs: [FEAT-19-11, FEAT-19-15, FEAT-19-20, FEAT-03-26]
adr-refs: [ADR-96, ADR-97, ADR-105]
pair-id: sebastian-opus-4.7
---

# PLAN-14: BA-25 Phase 5 Erweiterte Schichten

## Kontext

Telemetrie-getriebene P2-Features. Backend-Layer fuer Stufe-3 Periodischen Job und Top-Hub-Block-Generator. UI/Wiring-Aufgaben (MOC-Auto-Updater, Inbox-View) deferred zu spaeterem Wiring-Pass.

## Tasks

| Task | Status | Files |
|------|--------|-------|
| 1 Stufe3PeriodicJob mit Hard-Budget (ADR-105) | Done | Stufe3PeriodicJob.ts + Tests |
| 2 TopHubBlockGenerator (ADR-97) | Done | TopHubBlockGenerator.ts + Tests |
| 3 MOCMaintainer-Wiring fuer aktive Pflege (FEAT-19-11) | Deferred | Plugin-Wiring |
| 4 Inbox-Workflow UI (FEAT-19-15) | Deferred | UI-Layer |

## Coverage Gate

| SC | Mapped to Task |
|----|----|
| FEAT-19-11 SC-01..05 (MOC-Pflege) | Helper in PLAN-13 vorhanden, Wiring deferred |
| FEAT-19-15 SC-01..05 (Inbox-Workflow) | Backend-Stores vorhanden (Triage-Log, Sessions). UI deferred |
| FEAT-19-20 SC-01..05 (Stufe-3 Periodisch + Hard-Budget) | Task 1 |
| FEAT-03-26 SC-01..05 (Top-Hub-Block) | Task 2 |

## ADR-Alignment

- ADR-96 (MOC-Marker): bereits Accepted (PLAN-13).
- ADR-97 (KV-Cache-Block-Lifecycle): operationalisiert via TopHubBlockGenerator.generateIfNeeded mit Hash-Compare plus Cooldown.
- ADR-105 (Stufe-3 Job-Runner + Token-Budget): operationalisiert via Stufe3PeriodicJob mit Hard-Cap, 80%-Notification, kalender-wochentlich Reset (mondayOfWeek-Helper).

## Implementation Notes

**Test-Count-Delta:** +11 (5 Stufe3PeriodicJob + 5 TopHubBlockGenerator + 1 mondayOfWeek).

**ADR-Status:**
- ADR-97: Proposed -> Accepted.
- ADR-105: Proposed -> Accepted.
