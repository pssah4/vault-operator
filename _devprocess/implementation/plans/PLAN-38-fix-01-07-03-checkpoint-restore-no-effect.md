---
id: PLAN-38
title: FIX-01-07-03 Checkpoint-Restore no-effect (2-Phasen: Diagnose + Fix)
date: 2026-05-23
feature-refs: [FEAT-01-07]
adr-refs: []
fix-refs: [FIX-01-07-03]
imp-refs: []
pair-id: 38
---

# PLAN-38 -- FIX-01-07-03 Checkpoint-Restore no-effect

> Backlog row: `_devprocess/context/BACKLOG.md` -> PLAN-38
> Branch: `fix/fix-01-07-03-checkpoint-restore-no-effect`

## Context

Sebastian reproduziert auf NexusOS-Vault: Agent repariert Frontmatter einer Note, Checkpoint wird angelegt, Sebastian klickt Undo. Console zeigt `[Checkpoints] "...": restored via vault.modify` und `Restored 1 files for task ...`, aber die Datei behaelt den geaenderten Stand.

Critical Review hat den Pipeline-Pfad gegen Code abgeglichen:

- `ToolExecutionPipeline.ts:361-374` ruft `checkpointService?.snapshot(taskId, [path], toolCall.name)` BEVOR `tool.execute(...)` in Z.425. Pre-Change-Snapshot ist also korrekt sequenziell.
- `restore()` in `GitCheckpointService.ts:367-393` liest den Blob vom Ziel-Oid und ruft `vault.modify(existingFile, content)`. Kein expliziter Read-Back nach dem Write.

Daher faellt Hypothese 1 (falscher Pre-Change-Oid) durch. Verbleiben:

- **Hypothese 2 (wahrscheinlich):** externes Plugin (pretty-properties oder TaskNotes -- beide in Sebastians Vault aktiv) reagiert auf `vault.on('modify')` und schreibt Frontmatter sofort nach dem Restore wieder zurueck auf den "sauberen" Stand.
- **Hypothese 3 (sekundaer):** Editor-View-Cache zeigt veralteten Pufferinhalt, Disk-Stand ist korrekt restored. Sebastian sieht den Cache-Stand bis er die Note neu oeffnet.

Ohne Read-Back-Diagnose koennen wir nicht zwischen 2 und 3 trennen.

## Scope: 2 Phasen

### Phase 1: Diagnose-Logging

**Ziel:** klare Repro-Logs, die zeigen ob `vault.modify` durchgeht und ob der Disk-Stand danach noch dem Restored-Inhalt entspricht.

**Aenderungen:**

1. In `GitCheckpointService.snapshot()` ([Z.130 ff](src/core/checkpoints/GitCheckpointService.ts)): zusaetzlicher `console.debug` der die ersten 200 chars des gelesenen Vault-Contents zeigt (gehasht + first 200 chars, mit hex-Markierung fuer Whitespace).
2. In `GitCheckpointService.restore()` ([Z.342 ff](src/core/checkpoints/GitCheckpointService.ts)):
   - Vor `vault.modify`: `console.debug` der ersten 200 chars des Target-Contents.
   - Nach `vault.modify` und `vault.adapter.write`: `await this.vault.read(existingFile)` (bzw. `vault.adapter.read(vaultRelPath)` fuer adapter-Pfad), dann `console.debug` der ersten 200 chars des Read-Back-Contents.
   - Diff-Marker: wenn Read-Back-Length != Written-Length, `console.warn` mit beiden Werten und Marker `[restore-mismatch]`.

**Erfolgskriterium:**
- Build clean
- Nach Deploy + Sebastian-Repro liefert Console-Log ein klares Bild: identische Inhalte (= UI-Cache-Problem, Hypothese 3) oder unterschiedliche Inhalte (= externes Plugin ueberschreibt, Hypothese 2).

**TDD-Mode-Hinweis:** Diagnose-Logs werden nicht zwingend mit Tests abgesichert, weil sie reine Console-Aufrufe sind. Falls die diff-Marker-Logik komplexer wird (z.B. structured diff), wird sie als pure Helper-Funktion extrahiert und getestet.

### Phase 2: Echter Fix (nach Phase-1-Repro-Logs)

**Plan-Optionen, je nach Diagnose:**

- **Wenn Hypothese 2 bestaetigt (externes Plugin):**
  - Option A: Restore-Boundary-Lock -- temporaer einen Flag setzen der pretty-properties/TaskNotes-Hook unterdrueckt. Schwierig weil wir nicht die fremden Plugins kontrollieren.
  - Option B: Restore + Polling -- nach `vault.modify` warten und periodisch read-back. Wenn Diff erkannt, erneut write. 3-5 Iterationen. UI-Hinweis bei Persistent-Drift.
  - Option C: User-Warnung -- Modal: "Die Datei wird von [pretty-properties|TaskNotes] verwaltet. Restore koennte durch das Plugin ueberschrieben werden. Wenn das passiert, deaktiviere kurz das Plugin und versuche erneut." Pragmatisch, ehrlich, niedriges Risiko.
- **Wenn Hypothese 3 bestaetigt (Editor-Cache):**
  - Option D: nach `vault.modify` einen `app.workspace.onLayoutReady` triggern oder die Datei via Workspace-API schliessen und neu oeffnen. Erzwingt View-Refresh.

Phase 2 wird nach Phase 1 als separater Cycle geplant (eigener PLAN-Eintrag oder als Change-Log-Append in PLAN-38).

## Verifikation

- Phase 1: `npm run build` exit 0, Deploy gruen. Sebastians naechster Repro liefert vollstaendige Logs mit den neuen Markern.
- Phase 2: nach Implementation -- Sebastian reproduziert, sieht entweder erfolgreichen Restore oder klare Notice-Meldung.

## Coverage Gate

| SC aus FIX-01-07-03 | Mapped to |
|---|---|
| Restore-Operation ist beobachtbar verifizierbar (nicht nur "Logs sagen done") | Phase 1: Read-back-Logging |
| Datei behaelt nach Restore tatsaechlich den restored content | Phase 2 (loesungsabhaengig) |

| ADR aus adr-refs | Mapped to |
|---|---|
| (keine ADR-Refs) | n/a |

Coverage Gate Status:
- **SC coverage:** Phase 1 hat klares Mapping; Phase 2 ist disposition-abhaengig und wird im Folge-Plan-Eintrag konkretisiert.
- **ADR alignment:** keine ADR-Refs erforderlich (Bugfix in bestehender Architektur).
- **Codebase anchoring:** Aenderungen referenzieren konkrete Pfade ([GitCheckpointService.ts:130 ff, 342 ff](src/core/checkpoints/GitCheckpointService.ts)).
- **Verification gates:** `npm run build` benannt; Phase 1 hat keine Tests (reine Logs), Phase 2 wird tests-first wenn Code-Behavior geaendert wird.

## Change Log

| Date | Trigger | Summary |
|---|---|---|
| 2026-05-23 | initial | PLAN-38 angelegt. 2-Phasen-Fix-Strategie. Phase 1 Diagnose-Logging startet sofort. |
| 2026-05-23 | implementation | Phase 1 deployt. Repro-Logs bestaetigen Hypothese 3 (Editor-View-Cache), Hypothese 2 (Plugin-Overwrite) widerlegt. Read-Back zeigt identischen Disk-Stand zur restored-Length. |
| 2026-05-23 | scope-expand | Sebastians 2. Bug-Repro (Agent-Edits zeigen sich nicht im Editor) hat denselben Root Cause. Scope von PLAN-38 erweitert: Helper `refreshOpenMarkdownViewsFor` extrahiert, GitCheckpointService + EditFileTool (2 Stellen) + WriteFileTool + AppendToFileTool angepasst. FIX-01-04-01 separat erfasst fuer den orthogonalen Tool-Choice-Bug (read_file statt edit_file -> Duplikate). |

## Implementation Notes

(wird nach Phase 1 + Phase 2 gefuellt: per-Phase commit SHA, Repro-Log-Auszug, Phase-2-Entscheidung)
