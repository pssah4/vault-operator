---
id: FIX-01-05-01
feature: FEAT-01-05
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-21
---

# FIX-01-05-01: edit_file steht zu schwach bei grossen Rewrites

## Symptom

Im FEAT-29-10 Live-Smoke 2026-05-21 (meeting-summary Subskill auf Notes/Effizienzprogramm EnBW.md) feuerte `edit_file` 5+ mal mit:

```
Tool error in edit_file: Error: old_str not found in file "Notes/Effizienzprogramm EnBW.md". Read the file first to get the exact bytes (whitespace, blank lines, trailing newlines all count) and retry with a shorter, more unique old_str. Note: new_str is 2397 chars. For large insertions or full rewrites prefer write_file (replace whole file) or append_to_file (add at end) -- edit_file is meant for targeted small changes.
```

Der Agent ignorierte den sizeHint und retried `edit_file` weiter, statt umzuschalten auf `write_file`. Resultat: Subskill brauchte 28+ Iterationen, kostete 0.51 EUR fuer eine einfache Note-Summarization.

## Cause

Zwei zusammenwirkende Faktoren:

1. **Schwelle zu hoch.** Der sizeHint ("prefer write_file") feuert erst ab `new_str.length > 2000`. Bei 2397 chars fiel der Hint genau noch rein, aber bei 1500-2000 chars (typischer Mittelbereich) faellt er weg, obwohl auch dort `edit_file` schon brittle ist (JSON-Streaming-Truncation, diff-Payload-Groesse).
2. **Sprache zu weich.** "prefer write_file" sounded wie ein Vorschlag. Das Modell nahm es als optional und retried die gleiche Strategie. Direkter waere "Use write_file instead. edit_file is not designed for this."

Ergaenzend: das Modell hat den exakten `old_str` aus dem Memory geraten, ohne vorher die Datei zu lesen. Ein erster diagnostischer Hinweis wo `old_str` zu divergieren beginnt waere wertvoll (longest-common-prefix vs. file content) - macht aber den Error verbose und ist optional.

## Fix

1. Schwelle von 2000 chars auf **1000 chars** senken in EditFileTool.ts (Zeile ~127). Das sieht typische Wiki-Section-Einfuegungen als "rewrite" und steuert frueher um.
2. Wording von `"prefer write_file (replace whole file) or append_to_file (add at end) -- edit_file is meant for targeted small changes"` auf `"Use write_file instead to replace the whole file, or append_to_file to add at the end. edit_file is for targeted small edits, not large rewrites."` (klare Imperative statt soft-prefer).
3. Optional: longest-common-prefix-Diagnostic. Berechnen wo `old_str` in `content` zu divergieren beginnt (max. erste 200 chars matchen), zeigen wie der content an der Stelle weitergeht. Beispiel: `"old_str matches first 87 chars, then diverges: file has '...continued with X', old_str expected '...continued with Y'"`. Macht den Error groesser, hilft dem Agent aber das Memory-Drift sofort zu sehen.

## Regression test

Vitest in `EditFileTool.test.ts`:

- `large new_str (>=1000 chars) without match -> error message contains "Use write_file instead"` 
- `small new_str (<1000 chars) without match -> error message NOT containing write_file hint`
- `(optional) longest-common-prefix hint -> error message contains "matches first N chars"`

## How tested

1. Build + Test gruen, kein Regression.
2. Live-Smoke: meeting-summary Subskill auf eine Note, beobachten ob `edit_file` jetzt nach erstem Fehlschlag korrekt auf `write_file` umschwenkt.
