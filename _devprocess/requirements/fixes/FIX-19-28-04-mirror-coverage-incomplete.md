---
id: FIX-19-28-04
feature: FEAT-19-28
epic: EPIC-19
adr-refs: [ADR-103]
plan-refs: []
depends-on: []
created: 2026-05-08
---

# FIX-19-28-04: PdfMarkdownMirror deckt nur Teil der PDF ab (1-135 von 410)

## Symptom

Live-Test 2026-05-08 mit
`Attachements/enbw-geschaeftsbericht-2025.pdf` (410 Seiten). Der
generierte Mirror `Sources/EnBW-Geschaeftsbericht-2025-Mirror.md`
endet mit `Mirror erstellt: 2026-05-07 | Seiten abgedeckt: 1-135
(strategisch relevante Abschnitte)` und enthaelt 43 Block-Anchors
(`^block-1` bis `^block-43`).

User-Erwartung (bestaetigt 2026-05-08): vollstaendiger Mirror aller
410 Seiten, damit jede spaetere Sense-Making-Frage einen Anker findet.
Aktuelles Verhalten ist nicht dokumentiert (kein Setting, kein
Hinweis, kein Skill-Step), wirkt fuer den User wie ein willkuerlicher
Cut-off.

## Root cause -- konsolidiert mit FIX-19-28-01

Diagnose 2026-05-08: gemeinsame Wurzel mit FIX-19-28-01 und
FIX-19-28-03. Der `/ingest-deep`-Skill instruiert `ingest_deep` als
Tool-Call, das ist aber nicht in `TOOL_GROUP_MAP`. Der LLM faellt auf
`read_document`-Aufrufe zurueck und entscheidet selbst, welche Pages
er liest. Im Live-Test sind nur zwei `read_document`-Aufrufe sichtbar
(Pages 1-8 und 9-20), gefolgt von einem manuellen "Wirtschaftsbericht
und Prognosebericht" Read, dann Mirror-Schreiben.

Der LLM destilliert daraus "1-135 strategisch relevant" -- der
Wortlaut im Mirror-Footer ("strategisch relevante Abschnitte") ist
LLM-Sprache, kein deterministisches Tool-Output-Format.

```
LLM bekommt PDF mit 410 Seiten
  -> ohne ingest_deep-Tool faellt er auf read_document
  -> liest 2-4 Page-Ranges, max ~50 Pages real gelesen
  -> destilliert daraus selbst Take-Aways + Mirror
  -> Mirror enthaelt nur das, was der LLM relevant fand
  -> Footer "1-135 strategisch relevant" ist LLM-Halluzination,
     keine echte Coverage-Garantie
```

Der deterministische Pfad `PdfMarkdownMirror.ts` waere unauffaellig:
`parseDocument` liefert den vollen PDF-Text, der wird ohne Filter in
`vault.create` geschrieben. Die ganze PDF landet im Mirror, mit
`## Page N`-Headings als deterministische Anker.

Mit dem Tool-Group-Fix aus FIX-19-28-01 wird `ingest_deep` aufgerufen,
PdfMarkdownMirror erzeugt vollstaendigen Mirror, Coverage-Bug
verschwindet automatisch.

## Fix

Offen. Vorschlag:

- Pruefen ob der Skill-Workflow eine deterministische "alle Seiten
  lesen"-Schleife hat oder LLM-getrieben ist.
- Falls LLM-getrieben: Skill-Description anpassen mit klarer Anweisung
  "Mirror MUSS jede Seite enthalten, kein selektiver Filter".
- Falls deterministisch mit Cap: Cap konfigurierbar machen oder
  entfernen, mindestens aber Footer mit ehrlichem Cap-Hinweis schreiben
  ("abgebrochen bei N von M Seiten wegen Token-Cap, naechste Seiten
  separat ingestieren").
- Ggf. Setting `vaultIngest.mirrorMode`: `full` (Default) | `selective`
  (LLM-Filter) | `paginated` (manueller Re-Run pro Block).

Implementation pointer: erst nach Diagnose-Pass durch
`src/core/ingest/PdfMarkdownMirror.ts` und Skill-Spec
`_devprocess/architecture/skills/ingest-deep.skill.md`.

## Regression test

Smoke-Test mit dem EnBW-Bericht: `/ingest-deep` muss Mirror mit
mindestens 90% der PDF-Seitenzahl als Block-Anchors produzieren, oder
explizit dokumentierten Cut-off mit Hinweis im Footer.

## Status

See the backlog row for FIX-19-28-04 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
