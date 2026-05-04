---
id: IMP-23-04-05
feature: FEAT-23-04
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# IMP-23-04-05: relay /poll partitioniert pro Plugin-Session (AUDIT-016 L-4, deferred)

## Motivation

AUDIT-016 L-4: Der Cloudflare-Worker /poll-Endpoint serviert alle Plugin-Sessions ueber denselben Long-Polling-Pfad. Bei Trafic-Spitzen konkurrieren mehrere Plugin-Instanzen um denselben Slot, Latenz steigt nichtlinear.

## Aenderung (geplant)

Partitionierung des Poll-Pfads pro Plugin-Token (Hash-basiert auf eine Cloudflare-Durable-Object-ID), damit jede Plugin-Instanz ihre eigene Poll-Queue bekommt.

## Status

Bewusst deferred nach Phase 7. Aktuell kein User-impact gemessen; bei steigender Adoption neu bewerten.

## Verification

Pending. BACKLOG: Status Planned.
