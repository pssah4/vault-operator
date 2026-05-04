---
id: IMP-03-18-01
feature: FEAT-03-18
epic: EPIC-03
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# IMP-03-18-01: AgingService Daily-Scheduler

## Problem

`AgingService.runAgingCycle()` ist in
[src/core/memory/AgingService.ts](../../../src/core/memory/AgingService.ts)
implementiert und in
[src/main.ts:1217](../../../src/main.ts) wird `runAgingSweep()` einmal
beim Plugin-Onload aufgerufen.

Das ist nicht Daily, sondern **per-Plugin-Reload**. Power-User mit
Obsidian-Sessions ueber Tage oder Wochen triggern Aging praktisch nie.
Two-Tier-Decay (FEAT-03-19) wirkt damit nicht.

## Loesung

Im Plugin-Onload zusaetzlich zum bestehenden Single-Run einen
`setInterval`-Wrapper aufsetzen, der alle 6h prueft, ob seit dem
letzten Aging-Sweep mehr als 24h vergangen sind. Cooldown-Logik im
AgingService bleibt unveraendert (idempotent). Cleanup im onunload.

```
- start: setInterval(checkAndRunAging, 6h)
- checkAndRunAging:
  - if Date.now() - settings.memory.lastAgingRunAt < 24h: skip
  - else: await runAgingSweep()
- onunload: clearInterval
```

## Akzeptanzkriterien

- Interval-Handle als Property, sauberer Cleanup.
- AgingService laeuft bei laufendem Plugin spaetestens 24h+6h nach
  letztem Sweep.
- Test mit virtueller Zeit (vi.useFakeTimers) stellt Trigger nach 24h
  sicher.

## Definition of Done

- Code geliefert, Build gruen, Tests gruen.
- Backlog-Row auf Done.

## Out-of-Scope

- Background-Job-Framework. Wir bleiben bei setInterval.
- UI-Status-Anzeige fuer letzten Aging-Run.
