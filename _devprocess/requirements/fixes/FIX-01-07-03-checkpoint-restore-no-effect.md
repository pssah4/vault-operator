---
id: FIX-01-07-03
feature: FEAT-01-07
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-22
---

# FIX-01-07-03: Editor-View-Cache uebermalt vault.modify (restore + edit/write/append)

## Symptom

Sebastian laesst den Agent das Frontmatter einer Note umbauen ("repariere das frontmatter in dieser note"). Der Pipeline-Hook erzeugt automatisch einen Pre-Write-Checkpoint, die Aenderung wird geschrieben. Sebastian klickt anschliessend in der Sidebar auf "Undo from here". Console-Log zeigt `[Checkpoints] restored via vault.modify` und `[Checkpoints] Restored 1 files for task task-1779486137419`. Trotzdem zeigt die Datei in Obsidian weiter den geaenderten Stand, die Frontmatter-Aenderung ist nicht zurueckgerollt.

Reproduktion: Note `Notes/Backpropagation (Fehlerrückführung).md` im NexusOS-Vault, frontmatter-cleanup Tool-Call, dann Undo-from-here.

## Root cause

**Bestaetigt 2026-05-23 via Repro-Logs nach Phase-1-Diagnose:** Editor-View-Cache uebermalt vault.modify-Schreibvorgaenge. Der Disk-Stand wird korrekt geschrieben (Read-Back nach vault.modify beweist das), aber der offene MarkdownView haelt seinen CodeMirror-Buffer mit dem Pre-Change-Stand. Beim naechsten Auto-Save oder Keystroke flusht der Editor seinen Buffer zurueck zur Disk und macht den restore (oder edit) silent rueckgaengig.

Diagnose-Logs aus dem 2026-05-23-Repro:

```
[Checkpoints] Restoring "...": 15348 chars from oid cba60da4 head="---\nZusammenfassung..."
[Checkpoints] "...": restored via vault.modify
[Checkpoints] "...": read-back 15348 chars head="---\nZusammenfassung..."   ← IDENTISCH
```

Read-Back stimmt exakt mit dem geschriebenen Inhalt ueberein -- der Disk-Stand ist korrekt restored. Gleichzeitig sieht Sebastian im Editor weder die Aenderung noch den Restore-Stand. Alle 5 Snapshots haben EXAKT 15348 chars ueber 4-5 Edit-Aufrufe, was beweist: jeder Edit + Restore wird vom Editor-Cache wieder ueberschrieben.

Damit fallen die fruehen Hypothesen:

```
agent edit -> pipeline pre-write snapshot (oid A)
            -> agent write_file (new content)
user clicks Undo from here
            -> service.snapshot(restore-..., files, 'undo_from_here') (oid 5b875779, 28192 chars)
            -> service.restore(commitOid=34dd329d, files=...)
            -> "restored via vault.modify"
            -> file content visible to user unchanged
```

Verdaechtig: snapshot vor Restore liest 28192 chars, restore schreibt 28192 chars von einem ANDEREN Oid. Wenn beide identisch lang sind, ist der Inhalt entweder zufaellig gleich (Frontmatter-Aenderung gleicht zeichen-neutral aus) oder der Pre-Change-Snapshot enthielt schon die Aenderung (z.B. weil pre-write-Snapshot zeitlich nach dem Edit lief).

- Hypothese 1 (falscher Pre-Change-Oid) -- falsch. Pipeline triggert snapshot vor jedem Write korrekt.
- Hypothese 2 (externes Plugin ueberschreibt) -- falsch. Read-Back zeigt korrekten Disk-Stand.
- Hypothese 3 (Editor-View-Cache) -- **bestaetigt**. CodeMirror-Buffer flusht den Pre-Change-Stand zurueck.

Wirkungsbereich groesser als zunaechst gedacht: nicht nur Restore, sondern auch `edit_file`, `write_file`, `append_to_file` sind betroffen (gleicher vault.modify-Pfad). Sebastians 2026-05-23-Repro mit Agent-Edits zeigte das gleiche Symptom: Tool meldet Erfolg, aber Editor zeigt unveraenderte Note.

## Fix

3-Phasen-Iteration ueber 2026-05-22/23, weil der erste Ansatz nur die Disk-Seite traf und nicht den Editor-View. Endstand:

Helper-Funktion `refreshOpenMarkdownViewsFor(app, file, content?)` in `src/core/utils/refreshMarkdownView.ts`. Nach jedem `vault.modify` auf einer Note wird jeder offenen MarkdownView fuer diese Datei `view.editor.setValue(content)` aufgerufen -- das schreibt das CodeMirror-Buffer direkt, forciert ein DOM-Repaint und synchronisiert den Buffer mit Disk, sodass die naechste Auto-Save ein No-Op statt eines Overwrite ist. Cursor + Scroll werden bestmoeglich erhalten (Clamping auf die neue Zeilenanzahl).

Phase-Iteration:
- **Phase 1 (Diagnose):** Read-Back nach `vault.modify` plus Content-Snippet. Zeigte: Disk wird korrekt geschrieben, aber Editor zeigt weiter alten Stand.
- **Phase 2 (erster Fix-Versuch):** `leaf.openFile(sameFile)` nach `vault.modify`. Wirkung: Disk-Persistenz stabil, Char-Count waechst (15348 -> 15984 -> 16049). Aber: `leaf.openFile(sameFile)` ist Obsidian-No-Op (skip re-bind wenn `view.file === file`), Editor zeigte weiter alt.
- **Phase 3 (final):** `view.editor.setValue(content)` direkt. Forciert DOM + Buffer-Sync.

Konsumenten:
- `GitCheckpointService.restore()` ([src/core/checkpoints/GitCheckpointService.ts](src/core/checkpoints/GitCheckpointService.ts)) -- delegiert an den Helper.
- `EditFileTool` ([src/core/tools/vault/EditFileTool.ts](src/core/tools/vault/EditFileTool.ts)) -- nach beiden vault.modify-Stellen (fuzzy + exact).
- `WriteFileTool` ([src/core/tools/vault/WriteFileTool.ts](src/core/tools/vault/WriteFileTool.ts)) -- nach modify im Existing-File-Pfad.
- `AppendToFileTool` ([src/core/tools/vault/AppendToFileTool.ts](src/core/tools/vault/AppendToFileTool.ts)) -- nach modify im Existing-File-Pfad.

Fallback im Helper: wenn `editor.setValue` throwt, fallback auf `leaf.openFile` (nicht ideal aber besser als Crash).

Zusaetzlich: Phase-1-Diagnose-Logging bleibt drin (read-back + Content-Snippet) damit zukuenftige Symptome schneller diagnostizierbar sind.

`update_frontmatter` ist nicht betroffen (nutzt Obsidians `fileManager.processFrontMatter`, was Editor-State korrekt synchronisiert). Bilder/Canvas/drawio/Excalidraw sind eigene Views, nicht MarkdownView.

Implementation pointer: PLAN-38 + Commits 92f78fdc + edf116dd + fe86c5ab + e355be76.

## Regression test

Manuelle Repro (datengetrieben statt synthetisch, da Editor-View-Interaktion):

1. Note in Obsidian oeffnen.
2. Agent edit_file/write_file/append_to_file ausfuehren lassen.
3. Erwartet: Editor zeigt nach Tool-Erfolg den neuen Inhalt sofort (ohne Note schliessen+oeffnen).
4. Erwartet: bei naechstem Agent-Edit liest der Pre-Change-Snapshot eine groessere Char-Anzahl (Disk wurde NICHT vom Editor zurueckgesetzt).
5. Erwartet bei restore: Editor zeigt den restored Stand und der naechste Edit/Auto-Save ueberschreibt ihn nicht.

Synthetischer Unit-Test schwer abzubilden weil CodeMirror-Buffer-Verhalten Obsidian-spezifisch ist. Konsole liefert die Marker `refreshed N open MarkdownView(s)` als positiv-Befund (nur im Restore-Pfad, Edit-Tools rufen silent).

**Verifikation 2026-05-23 (Sebastian):** Phase-3-Build deployt + Plugin reloaded + "entferne die GPS Daten beim Hotel" -> Editor zeigt sofort den neuen Stand ohne GPS-Koordinaten. Bestaetigt OK.

## Status

See the backlog row for FIX-01-07-03 in `_devprocess/context/BACKLOG.md`.
