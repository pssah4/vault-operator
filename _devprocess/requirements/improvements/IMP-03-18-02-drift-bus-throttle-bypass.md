---
id: IMP-03-18-02
feature: FEAT-03-18
epic: EPIC-03
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# IMP-03-18-02: DriftEventBus Subscriber in ExtractionQueue

## Problem

Der `DriftEventBus`
([src/core/memory/DriftEventBus.ts](../../../src/core/memory/DriftEventBus.ts))
hat heute genau einen Subscriber im Plugin-Onload, der nur Telemetry
schreibt. ContextComposer feuert Drift-Events, aber ExtractionQueue
ignoriert sie.

FEAT-03-18 SC-11 verlangt aber: bei Drift soll der 60s-Throttle der
ExtractionQueue umgangen werden, damit ein neuer Topic sofort
extrahiert werden kann (nicht erst nach Throttle-Window).

## Loesung

Ein zweiter Subscriber im Plugin-Onload abonniert
`drift.detected`-Events und ruft `extractionQueue.enqueueMemoryExtraction(
conversationId, { bypassThrottle: true })` auf. Cleanup ueber den
DriftEventBus-Unsubscribe-Handle.

Konkret in [src/main.ts](../../../src/main.ts) bei der bestehenden
DriftBus-Subscription erweitern.

## Akzeptanzkriterien

- Drift-Event ausgeloest -> Extraction wird ohne Throttle re-enqueued.
- Test mit Mock-DriftBus + Mock-ExtractionQueue verifiziert den Pfad.
- Keine Doppel-Trigger: wenn bereits ein Extraction-Job fuer dieselbe
  Conversation laeuft, wird der DriftBus-Trigger geschluckt
  (existing dedup in enqueueMemoryExtraction).

## Definition of Done

- Code geliefert, Build gruen, Tests gruen.
- Eval-Fixture (drift-Trigger-Szenario) ergaenzt.
- Backlog-Row auf Done.

## Out-of-Scope

- LLM-Drift-Detection-Tuning (das macht ContextComposer schon).
- Drift-UI-Indikator.
