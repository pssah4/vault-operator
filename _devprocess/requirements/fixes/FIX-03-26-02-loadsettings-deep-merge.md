---
id: FIX-03-26-02
feature: FEAT-03-26
epic: EPIC-03
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-04
---

# FIX-03-26-02: Top-Hub-Block + andere Settings-Toggles reagieren nach Privacy-Ack nicht (loadSettings shallow-merge)

## Symptom

Live-Bug: User klickt im Settings-Modal die Privacy-Acknowledgement-Checkbox fuer Top-Hub-Block, dann den Toggle. Nichts passiert. Beim naechsten Settings-Open ist die Checkbox wieder leer.

## Root Cause

`loadSettings()` in main.ts hat `Object.assign(DEFAULT_SETTINGS, saved)` benutzt -- shallow merge. Wenn der persistente data.json eine `vaultIngest`-Section hatte, aber den neuen `topHubBlock`-Sub-Key noch NICHT, ueberschrieb saved.vaultIngest die komplette Default-vaultIngest-Section. topHubBlock blieb undefined; der Toggle warf TypeError beim Click.

## Fix

Neuer `deepMergeSettings`-Helper in main.ts:
- Merged Sub-Objekte rekursiv
- Arrays bleiben replace-by-saved (kein Element-Merge)
- null in saved ueberschreibt object in defaults

`loadSettings()` ruft jetzt `deepMergeSettings(DEFAULT_SETTINGS, saved)` statt `Object.assign`.

## Verification

Test in `src/__tests__/deepMergeSettings.test.ts` (7 Cases inkl. Live-Bug-Repro). Manueller Live-Test: Privacy-Ack -> Toggle aktivierbar, ueberlebt Reload. BACKLOG: Status Done (commit e844e75).
