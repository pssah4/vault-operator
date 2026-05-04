---
id: IMP-19-20-01
feature: FEAT-19-20
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# IMP-19-20-01: Stufe3PeriodicJob state-Persistierung in DB

## Motivation

AUDIT-014 hat festgestellt, dass Stufe3PeriodicJob den Run-State nur in-memory haelt. Plugin-Reload verliert die letzte Run-Zeit und triggert direkt nach dem Restart erneut, statt den naechsten Slot abzuwarten.

## Aenderung

State (`lastRunAt`, `nextRunAt`) wird in der knowledge.db persistiert, beim Reload aus der DB geladen. Verhindert Doppel-Runs und macht das Backoff vorhersagbar.

## Verification

AUDIT-014 Re-Audit gruen. BACKLOG: Status Done.
