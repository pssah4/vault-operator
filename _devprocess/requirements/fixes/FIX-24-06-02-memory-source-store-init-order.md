---
id: FIX-24-06-02
feature: FEAT-24-06
epic: EPIC-24
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-24-06-02: MemorySourceStore wird nie initialisiert (Init-Order-Bug)

## Symptom

Im MESSLAUF Test 2 Teil D rief der Agent `list_memory_source_notes({})`
und bekam:

```
<error>Unknown error: MemorySourceStore not available.</error>
```

Gleicher Fehler waere auch bei `mark_note_as_memory_source` und
`unmark_note_as_memory_source` aufgetreten. Das Feature
"Notizen als Memory-Source registrieren" (FEAT-03-25 / ADR-109) ist
seit Release deployed aber komplett tot.

## Root cause

`src/main.ts:600-603` initialisiert `this.memorySourceStore` nur wenn
`this.memoryDB?.isOpen()` true ist. Aber: die `memoryDB`-Initialisierung
selbst (`new MemoryDB(...).open()`) passiert erst in `main.ts:1101`
-- also ~500 Zeilen SPAETER im gleichen `doLoad()`-Flow.

Folge: `this.memoryDB` ist zum Zeitpunkt des Checks bei Zeile 600
immer `null`, das Conditional ist immer false, `memorySourceStore`
bleibt fuer immer null. Die drei Memory-Source-Tools
(`list_memory_source_notes`, `mark_note_as_memory_source`,
`unmark_note_as_memory_source`) werfen alle "MemorySourceStore not
available".

Wahrscheinlich Refactoring-Artefakt: irgendwann wurde memoryDB-Init
nach hinten verschoben, der MemorySourceStore-Init-Block aber nicht
mitgezogen.

## Fix

`src/main.ts:1110` -- Second-Pass-Init direkt nach `memoryDB.open()`:

```ts
// FIX-24-06-02: ensure MemorySourceStore is initialised once memoryDB
// is open. The earlier init attempt around the FrontmatterIndexer
// setup runs BEFORE memoryDB opens (init-order is fixed by Obsidian
// plugin onload), so memorySourceStore stays null otherwise.
if (this.memoryDB?.isOpen() && !this.memorySourceStore) {
    const { MemorySourceStore } = await import('./core/knowledge/MemorySourceStore');
    this.memorySourceStore = new MemorySourceStore(this.memoryDB);
}
```

**Bewusste Begrenzung:** der `memorySourceHook` (Bridge zur
ExtractionQueue ueber FrontmatterIndexer, `main.ts:612-630`) wird
weiterhin null sein, da der Hook bei der FrontmatterIndexer-
Konstruktion festgenagelt wird (zu einem Zeitpunkt wo
memorySourceStore noch null ist). Das ist ein separater Bug
(Hook-Verdrahtung), den der Live-Test nicht aufdeckte. Fuer den
sofortigen Test-2-Teil-D-Fix reicht die Store-Initialisierung;
List/Mark/Unmark-Tools lesen `this.plugin.memorySourceStore` zur
Call-Zeit und sind damit unblocked.

## Regression test

Manueller Live-Check (MESSLAUF Test 2 Teil D nach Plugin-Reload):

1. Neuer Chat, Prompt "Welche meiner Notizen sind als Memory-Source
   registriert?"
2. Erwartet: `list_memory_source_notes({})` antwortet mit einer Liste
   (eventuell leer falls nichts markiert) statt mit
   "MemorySourceStore not available".

Kein automatischer Unit-Test: der Bug ist eine onload()-Reihenfolge,
nicht direkt isoliert testbar ohne kompletten Plugin-Mock.

## Followup (out of scope)

Der `memorySourceHook` (Vault-Source-Note-Auto-Extraction) bleibt
unbenutzt bis der Hook-Plumbing-Bug separat gefixt wird. Symptom:
markierte Notizen werden NICHT automatisch zu Facts extrahiert.
Workaround: User kann Memory-Source-Notes weiter listen / un-/marken;
nur die Auto-Extraktion fehlt. Eigenes FIX-Item folgt wenn das Feature
beim User in den Vordergrund tritt.

## Status

Done 2026-05-13. 1477 Tests gruen (keine Aenderung der Tests durch
diesen Fix). lint 0 errors, tsc clean, build + deploy gruen.
Manuelle Live-Verifikation via MESSLAUF Test 2 Teil D nach Reload
ausstehend.
