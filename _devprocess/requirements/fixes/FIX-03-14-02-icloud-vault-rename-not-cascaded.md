---
id: BUG-030
title: VaultRenameHandler greift nicht bei iCloud-Vaults (Fehldiagnose -- echte Ursache war Settings-Gate)
priority: P2
severity: Medium
discovered: 2026-04-27
discovered-by: Live-Verifikation Phase 0.5 AK 6
resolved: 2026-04-27
feature-refs: [FEAT-03-14]
adr-refs: [ADR-79]
plan-refs: [PLAN-03]
related:
  - _devprocess/implementation/plans/PLAN-03-feature-0314-knowledge-db-hardening.md
  - src/core/knowledge/VaultRenameHandler.ts
  - src/main.ts
---

# BUG-030 -- iCloud-Vault Rename nicht cascadiert

## Problem

Auf einem iCloud-resident Vault (Sebastians Setup:
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/NexusOS/`)
hat ein Live-Rename einer Note (`Notes/Erstellung Infrastruktur- und
Capability Map Agent Factory.md` -> `... CASCADE-TEST.md` und zurueck)
**keinen Cascade** in der knowledge.db ausgeloest. DB hatte vor und nach
dem Rename identische Reihen auf dem alten Pfad (128 vectors, 5 tags,
1 note_freshness, 75+96 implicit_edges, 6+4 edges, 7 ontology), und 0
auf dem neuen Pfad.

Console-Stack der parallelen `Can not update metadata containers`-Errors
zeigt `e.reconcileFileCreation @ app.js:1` und `e.reconcileFile @ app.js:1`
-- das ist Obsidians Sync-Reconciliation-Pfad, nicht der klassische
`vault.on('rename')`-Trigger.

## Root Cause (Hypothese)

Wenn ein Rename auf der Filesystem-Ebene "von aussen" passiert (Finder,
iCloud-Sync von einem anderen Geraet, `mv` im Terminal), liefert macOS dem
Obsidian-Watcher zwei separate Events: ein Delete fuer den alten Pfad und
ein Create fuer den neuen. Obsidian feuert dann **kein** `vault.on('rename')`,
sondern `vault.on('delete')` + `vault.on('create')`.

`VaultRenameHandler.cascadeFileRename()` haengt am rename-Event in
[main.ts:595-608](../../../src/main.ts#L595-L608) und wird daher nie
aufgerufen. Folge:

- Vectors auf altem Pfad bleiben (semanticIndex.removeFile in
  delete-Listener ist ja korrekt registriert -- aber im rename-Pfad).
- Edges, tags, ontology-Reihen werden nie mit-aktualisiert.
- Search-Hits ueber den alten Pfad zeigen Reihen, die im Vault nicht mehr
  existieren -- exakt das Problem, das ADR-79 / FEAT-03-14 beheben sollte.

Auf einem **lokalen** Vault (kein iCloud) und bei einem Rename via Obsidian-UI
(File-Explorer Rechtsklick -> Rename) feuert `vault.on('rename')` korrekt;
das beweist die Vitest-Suite (4 Tests in [VaultRenameHandler.test.ts](../../../src/core/knowledge/__tests__/VaultRenameHandler.test.ts)).
Auf iCloud-Vaults greift Obsidian beim Rename teilweise auf die Sync-
Reconciliation zurueck -- selbst bei UI-Rename -- weil iCloud die
Filesystem-Operationen orchestriert.

## Beweis

Live-Test auf Sebastians Setup, 2026-04-27 17:20-17:32:

```
Pre-Snapshot (DB):    OLD=128 vectors, NEW=0
Rename in Obsidian:   Notes/.../Factory.md -> Notes/.../Factory CASCADE-TEST.md
Rename zurueck:       ... CASCADE-TEST.md -> ... Factory.md
Console-Output:       keine VaultRenameHandler-Spur,
                      keine semanticIndex.removeFile-Spur,
                      nur reconcileFileCreation + pretty-properties-Spam
Post-Snapshot (DB):   OLD=128 vectors, NEW=0  (unveraendert)
mtime knowledge.db:   17:25:01 (von einer parallelen Research-Task,
                      nicht vom Rename)
```

Vitest-Suite: VaultRenameHandler.test.ts laeuft 4/4 gruen, weil dort die
Cascade-Methode direkt aufgerufen wird ohne Obsidian-Event-Pfad.

## Impact

- Jeder iCloud-Vault-User leidet unter dieser Luecke.
- Stale-Search-Hits auf alte Pfade (das Hauptmotiv von ADR-79).
- Vermutlich auch auf `obsidian-sync`-Setup (Setup-Klasse B), nicht
  empirisch verifiziert.
- Nicht betroffen: lokale Vaults ausserhalb iCloud.

## Fix-Optionen

### Option A: delete+create-Paerchen-Erkennung im Plugin

In [main.ts:589-594](../../../src/main.ts#L589-L594) und ab Zeile 595:
einen kurzen Buffer (Map<oldPath, {ts, hash?}>) im Memory halten, in dem
delete-Events fuer max. 500ms gepuffert werden. Wenn innerhalb dieses
Fensters ein create-Event kommt mit gleichem Inhalt-Hash oder gleicher
Stat-Groesse, behandle es als Rename und ruf `cascadeFileRename(deletedPath, createdPath)`
auf.

Pro: deckt jeden Filesystem-Rename ab, unabhaengig von der Quelle.
Contra: Heuristik kann false-positives produzieren (zwei zufaellige
Operationen im 500ms-Fenster). Hash-Vergleich kostet I/O bei jedem delete.

### Option B: Pfad-Praefix-Detection im delete-Listener

Wenn ein delete-Event kommt, kurz warten und pruefen ob im
`vault.adapter` eine Datei mit identischer Groesse + mtime auf einem
neuen Pfad auftaucht. Wenn ja: cascade.

Pro: keine in-memory-Buffer-Komplexitaet.
Contra: noch heuristischer, viel I/O.

### Option C: Akzeptieren als Limitation, dokumentieren

Notice an User wenn iCloud-Vault detected: "Renames extern (Finder, anderes
Geraet) werden nicht automatisch im Index aktualisiert -- bitte Reindex
laufen lassen oder rename direkt in Obsidian machen".

Pro: kein zusaetzlicher Code, kein false-positive-Risiko.
Contra: schlechte UX, Stale-Hits bleiben.

### Empfehlung

Option A mit konservativem 200ms-Fenster und Hash-Vergleich. Hash kann
billig sein (nur Stat-Groesse + mtime, kein Content-Read).

## Akzeptanz nach Fix

- Live-Rename in Obsidian-UI auf iCloud-Vault triggert cascadeFileRename.
- Live-Rename via Finder oder iPhone-Sync auf gleichem iCloud-Vault
  triggert cascadeFileRename via delete+create-Paerchen-Erkennung.
- DB-Reihen auf altem Pfad sind weg, neue Reihen am neuen Pfad.

## PLAN-03 Korrektur

PLAN-03 AK 6 (Cascade-Test) bleibt formal gruen via Unit-Tests, aber
eine zusaetzliche Notiz im Coverage-Gate:

> SC-02 (Rename-Cascade): Code via 4 Unit-Tests verifiziert; Live-Verifikation
> auf iCloud-Vault zeigt iCloud-Sync-Edge-Case (BUG-030). Behebung als
> Folge-IMP nach Phase 0.5.

## Korrektur 2026-04-27: Fehldiagnose

Initiale Diagnose **war falsch**. Aus den Console-Stack-Traces der
parallelen `pretty-properties`-Errors mit `reconcileFileCreation` habe
ich auf "iCloud rename als delete+create-Paerchen" geschlossen. Das
ist als iCloud-Verhalten zwar dokumentiert moeglich, war aber **nicht
die Ursache** des Live-Test-Fehlschlags.

Echte Ursache: in `data.json` war
`"semanticAutoIndexOnChange": false`. Dadurch wurde der gesamte
Listener-Block in `main.ts` (vault.on('modify' / 'create' / 'delete' /
'rename')) im `if (...semanticAutoIndexOnChange)`-Gate uebersprungen.
Der `vault.on('rename')`-Listener wurde nie registriert, also rief
nichts den `vaultRenameHandler` auf.

Lehre festgehalten in der Claude-Memory (`feedback_check_settings_first`):
"Bei Live-Test-Fehlschlaegen ZUERST `data.json` pruefen, bevor Code
diagnostiziert wird."

## Resolution (2026-04-27, korrigiert)

Listener-Block aus dem `semanticAutoIndexOnChange`-Gate herausgezogen.
Cascade-Updates sind orthogonal zu Auto-Indexing -- sie schreiben nur
Pfad-Spalten um, kein Re-Embedding -- und laufen jetzt immer wenn
`knowledgeDB` und `vaultRenameHandler` da sind. Die Auto-Reindex-Logik
(scheduleFileIndex, graphExtractor.extractFile, etc.) bleibt im
`autoIndex`-Boolean gegated, aber innerhalb der gleichen Listener.

**Live-Verifikation** mit `Notes/Dominik Klumpp.md`:

```
Pre:  57 Reihen auf "Dominik Klumpp.md" (vec=11, tag=15, frs=1,
       e_s=7, e_t=15, ont=8)
Rename in Obsidian: "Dominik Klumpp.md" -> "Dominik Klumpp CASCADE-TEST.md"
Post: 0 Reihen auf alten Pfad, 57 Reihen auf neuem Pfad -- alle 6 mit
      Treffern abgedeckten Spalten korrekt cascadiert.
```

**Tests:** 470/470 gruen (4 VaultRenameHandler-Unit-Tests + neue
WriterLockHeldError + WriterLock-Lifecycle-Tests). Volle Suite ohne
Regression.

**RenamePairDetector zurueckgerollt:** Die ursprueglich gebaute
delete+create-Paerchen-Erkennung war auf der Fehldiagnose aufgesetzt.
Datei + Tests entfernt, Verdrahtung in main.ts entfernt. Falls
extern-initiierte Renames auf iCloud-Vaults spaeter wirklich als
delete+create-Sequenzen zu Plugin-Bugs fuehren, wird das als neuer
Bug aufgenommen und vor dem Code-Fix per Live-Reproduktion belegt.
