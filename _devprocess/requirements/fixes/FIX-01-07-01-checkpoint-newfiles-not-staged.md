---
id: FIX-01-07-01
feature: FEAT-01-07
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-08
issue: https://github.com/pssah4/obsilo-dev/issues/63
---

# FIX-01-07-01: Checkpoint-Snapshot legt neue Dateien nicht ab, "No files staged" trotz `newFiles=1`

## Symptom

Live-Test 2026-05-08 (`/ingest-deep` auf
`Attachements/enbw-geschaeftsbericht-2025.pdf`, branch
`feature/block-source-citations`). Direkt nach dem `write_file`-Tool-Call
fuer eine neue Datei zeigt die Konsole drei in sich widerspruechliche
Zeilen:

```
[Checkpoints] snapshot() called: taskId=task-1778192591841 tool=write_file files=Sources/EnBW-Geschaeftsbericht-2025-Mirror.md initialized=true
[Checkpoints] No files staged (newFiles=1)
[Checkpoints] Snapshot created for task task-1778192591841: none (1 checkpoints total)
[AgentTask] Successfully created file: Sources/EnBW-Geschaeftsbericht-2025-Mirror.md
```

Beobachtungen:

- Zeile 1: snapshot() wurde mit `files=Sources/EnBW-Geschaeftsbericht-2025-Mirror.md`
  aufgerufen (eine konkrete Datei).
- Zeile 2: `newFiles=1`, gleichzeitig `No files staged`.
- Zeile 3: `Snapshot created ... none (1 checkpoints total)` --
  Snapshot-ID `none`, aber Counter `1 total`.
- Zeile 4: AgentTask bestaetigt, dass die Datei tatsaechlich angelegt
  wurde.

## Root cause -- Hypothese (zu validieren)

Zwei moegliche Pfade, einer cosmetic, einer gefaehrlich:

1. **Logging-Bug (cosmetic).** Snapshot wurde korrekt erstellt
   (`1 checkpoints total`), aber das Status-Logging sagt faelschlich
   `No files staged` und `Snapshot ... none`. Counter und Status sind
   nicht konsistent. Dann ist nur der Log-Output irrefuehrend, nicht
   das Verhalten.

2. **Echter Snapshot-Bug.** Neue Dateien werden NICHT ins Snapshot-Set
   aufgenommen. Der Service unterscheidet zwischen Modifications
   (existierende Datei vorher/nachher) und Creations (Datei existiert
   nur nachher) und nimmt nur Modifications in den Diff-State. Effekt:
   bei einem Rollback von task-1778192591841 wird die neu angelegte
   Mirror-Note NICHT geloescht -- der User glaubt rueckgespult zu
   haben, hat aber die Datei noch in Vault.

Pfad 2 ist der gefaehrliche Fall. Risiko ist nicht Datenverlust,
sondern verlorenes User-Vertrauen in Rollback (Leak von neuen Dateien).

```
CheckpointService.snapshot(taskId, tool, files)
  -> staged = collectStagedDiffs(files)        // checkt nur Modifications?
  -> if staged.length == 0:
       log("No files staged (newFiles=N)")     // counter inkonsistent zur Aktion
       return "none"
  -> else:
       writeSnapshot(staged) -> id
       log("Snapshot created ... <id>")
```

## Fix

Offen. Vorschlag:

1. Checkpoint-Service identifizieren -- `grep -rn "CheckpointService\|snapshot()" src/`.
2. Logik pruefen: wie wird `newFiles` gezaehlt vs. `staged`? Unterscheidet
   der Service zwischen Modifications und Creations? Werden beide ins
   Diff-Set aufgenommen?
3. Manueller Rollback-Test, um Pfad 1 vs. Pfad 2 zu unterscheiden:
   Datei via `write_file` anlegen, Snapshot erstellen, Datei im
   Vault loeschen, Checkpoint zurueckspielen.
   - Wenn Datei wiederhergestellt wird -> Pfad 1 (Logging-Bug). Fix:
     Counter-Logging konsistent machen.
   - Wenn Datei NICHT wiederhergestellt wird -> Pfad 2 (echter Bug).
     Fix: newFiles ins Snapshot-Set aufnehmen.
4. Beide Pfade brauchen am Ende konsistente Logs (entweder
   `No files staged (newFiles=0)` oder
   `Snapshot created ... <id> (newFiles=N, modifiedFiles=M)`).

## Regression test

Pfad 1: Snapshot-Erstellung mit reinem `newFile`, anschliessend
Assertion `staged.length == 1` und Log enthaelt eine konkrete
Snapshot-ID, nicht `none`. Pfad 2: Rollback-Test, Datei muss nach
Restore wieder im Vault liegen.

## Status

See the backlog row for FIX-01-07-01 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).

## Tracking

GitHub Issue: https://github.com/pssah4/obsilo-dev/issues/63
