---
id: BUG-029
title: WriterLock-Klasse aus PLAN-03 ist nicht ins Plugin verdrahtet
priority: P2
severity: Medium
discovered: 2026-04-27
discovered-by: Live-Verifikation Phase 0.5
resolved: 2026-04-27
feature-refs: [FEAT-03-14]
adr-refs: [ADR-79]
plan-refs: [PLAN-03]
related:
  - _devprocess/implementation/plans/PLAN-03-feature-0314-knowledge-db-hardening.md
  - src/core/persistence/WriterLock.ts
  - src/core/knowledge/KnowledgeDB.ts
---

# BUG-029 -- WriterLock nicht verdrahtet

## Problem

`src/core/persistence/WriterLock.ts` existiert mit voller Test-Coverage in
`src/core/persistence/__tests__/WriterLock.test.ts`, ist aber nirgendwo im
Plugin importiert oder instanziiert. Akzeptanzkriterium 5 in PLAN-03
("Lock-File-Test: Zweiter Plugin-Start mit aktiver Lock -> Notice, kein
Schreibversuch") und das Coverage-Gate-Item "SC-05 (Cloud-Sync-Konflikt) /
ADR-79 Cloud-Sync-Abwehr" sind dadurch tatsaechlich offen, obwohl im Plan
als gruen markiert.

## Beweis

```
$ grep -rnE "new WriterLock|from '.+/WriterLock" src/ --include='*.ts' | grep -v __tests__
(keine Treffer)
```

Auch zur Laufzeit (Plugin lief beim Test mit `local`-Storage) keine
`.obsilo-lock`-Datei im Plugin-Datenverzeichnis.

## Root Cause

Im PLAN-03 Coverage-Gate steht `SC-05 ✓ WriterLock per PID, Notice bei
Konflikt`. Der Haken bezieht sich auf die Klasse + Tests, nicht auf die
Verdrahtung. Beim Implementieren ist die Acquire/Release-Stelle in
`KnowledgeDB` (oder `MemoryDB` / `HistoryDB`) am Setup-Klasse-B-Pfad
(`storageLocation === 'obsidian-sync'`) ausgelassen worden.

## Impact

- Sebastians Setup nutzt `local` ([main.ts:410](../../../src/main.ts#L410)) -- WriterLock waere fuer ihn
  ohnehin inaktiv. Kein Live-Schaden auf seiner Maschine.
- Setup-Klasse B (`obsidian-sync`-Storage) ist ohne Schutz gegen
  konkurrente Plugin-Instanzen auf zwei Geraeten. Genau der Cloud-Sync-Konflikt,
  der ADR-79 motiviert hat, wird heute nicht abgewehrt.
- BUG-012-Korruptionsklasse (parallele Writer auf gesyncter DB) bleibt
  fuer Setup-Klasse-B-Nutzer offen.

## Fix-Skizze

In `KnowledgeDB.open()` (bzw. der Init-Routine, die `storageLocation`
auswertet):

```ts
if (this.storageLocation === 'obsidian-sync') {
    this.writerLock = new WriterLock(path.dirname(this.absolutePath));
    const result = await this.writerLock.acquire();
    if (!result.acquired) {
        new Notice(`Knowledge-DB ist gesperrt von ${result.heldBy?.hostname} (PID ${result.heldBy?.pid}).`);
        throw new Error('WriterLock held by another instance');
    }
}
```

Plus `release()` in `close()` und im `unload()`-Pfad. Analog fuer
`MemoryDB` und `HistoryDB`, sobald die in Phase 1 dazukommen.

## Akzeptanz nach Fix

- Storage-Mode `obsidian-sync` aktiv, zweite Plugin-Instanz auf gleichem
  Host startet -> Notice, keine Writes.
- `release()` bei Plugin-Unload entfernt das Lock-File.
- Stale-Lock (PID tot) wird beim naechsten Start gebrochen, kein Hard-Block.

## PLAN-03 Korrektur

PLAN-03 Coverage-Gate Item "SC-05 / ADR-79 Cloud-Sync-Abwehr" wird auf
`partial` zurueckgesetzt (Klasse + Tests da, Verdrahtung offen). BUG-029
in den Change-Log aufgenommen als Folgearbeit.

## Resolution (2026-04-27)

WriterLock am `obsidian-sync`-Pfad in `KnowledgeDB.open()` verdrahtet.

- `WriterLockHeldError` aus `WriterLock.ts` exportiert (semantisch dort,
  re-export aus `KnowledgeDB.ts` fuer Konsumenten).
- `KnowledgeDB.open()`: vor dem WASM-Init wird der Lock auf `path.dirname(absolutePath)`
  acquired, falls `storageLocation === 'obsidian-sync'`. Bei `acquired=false`
  wirft die Methode `WriterLockHeldError` mit `heldBy`.
- `KnowledgeDB.close()`: `release()` mit Defensive-Catch nach DB-Save.
- `main.ts:415-420`: catched die Error und zeigt eine Notice (10 s),
  loggt zusaetzlich -- der bestehende `.catch`-Pfad disabled
  semantic features fuer die Session.

Tests:

- `WriterLock.test.ts`: zwei neue Cases ("release frees the lock for a
  subsequent acquire", `WriterLockHeldError` carries holder info) -- 6/6 gruen.
- Volle Suite: 481/481 gruen.

Cross-host-Locks bleiben advisory-only (PIDs nicht portabel ueber Geraete);
das ist Design der Lock-Klasse selbst und durch ihre Doku abgedeckt. Fuer
echte Cross-Host-Serialisierung ist Setup-Klasse C noetig.
