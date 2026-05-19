---
id: FIX-01-07-02
feature: FEAT-01-07
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-19
---

# FIX-01-07-02: Checkpoint-UI verschwindet beim Wieder-Oeffnen einer alten Chat-History

## Symptom

User berichtet 2026-05-19: in alten Chats sind keine Checkpoints
mehr sichtbar. Effekt:

- Beim Wieder-Oeffnen einer Chat-History aus der Sidebar wird weder
  die Diff-Review-Modal-Sektion noch die Undo-Bar zur Task gerendert.
- Der Agent hat (heute) keine Tools dafuer (siehe IMP-01-07-01).
- Konsequenz: die alten Inhalte sind nicht ueber das Plugin
  erreichbar, obwohl der Shadow-Repo unter
  `~/vault-operator-shared/checkpoints/` sie sehr wohl noch haelt.

## Root cause

Kette:

1. UI rendert Checkpoint-Markers + Undo-Bar nur im `taskCompleted`-
   Pfad: `src/ui/AgentSidebarView.ts:2278-2283`. Das ist der Moment
   direkt nach Abschluss eines Tasks im aktuellen Plugin-Lifecycle.
2. `showPostTaskReview(taskId)` (`AgentSidebarView.ts:4350`) liest
   `service.getCheckpointsForTask(taskId)` -- das ist die in-memory
   Map `taskCheckpoints` in `GitCheckpointService` (`GitCheckpointService.ts:75-76, 420-422`).
3. Diese Map wird ausschliesslich durch `snapshot()` befuellt
   (`GitCheckpointService.ts:245-247`). Beim Plugin-Reload ist sie
   leer, beim Wiederoeffnen einer alten History aus einer
   vorhergehenden Plugin-Session auch.
4. Es gibt zwar einen git-log-Fallback in `restoreLatestForTask`
   (`GitCheckpointService.ts:447-486`) -- der wird aber NUR vom
   Undo-Button aufgerufen. Den Undo-Button rendert die UI nur in
   2278-2283, also nicht beim History-Reload. Patt.

```
History-Open
  -> AgentSidebarView lays out messages
  -> no taskCompleted event for old tasks
  -> showPostTaskReview never fires
  -> getCheckpointsForTask returns [] (in-memory map empty)
  -> no DiffReviewModal, no Undo-Bar, kein Checkpoint-Eintrag
```

## Fix (geplant)

Zwei zusammenhaengende Aenderungen:

### A. Service: Rehydration aus dem Shadow-Repo

Neue Public-Methode auf `GitCheckpointService`:

```ts
async loadCheckpointsForTask(taskId: string): Promise<CheckpointInfo[]>
```

- Scant das Shadow-Repo via `git.log()` (kein depth-limit, gleiche
  Schleife wie in `restoreLatestForTask`).
- Filter auf Commit-Messages `checkpoint:${taskId}`.
- Pro Commit ein `CheckpointInfo` rekonstruieren via
  `parseFilesFromMessage(msg)` + NewFiles-Parsing.
- Map `taskCheckpoints.set(taskId, list)` fuellt die in-memory
  Cache, damit `getCheckpointsForTask` danach den gleichen Pfad
  nehmen kann wie nach einem frischen `snapshot()`.

Test:
- Snapshot, Plugin-Reload simulieren (neue Service-Instanz),
  `loadCheckpointsForTask(taskId)` -> Liste muss identisch sein.

### B. UI: Re-Render-Hook beim Chat-Reload

`AgentSidebarView`:

- Bei jedem Render einer Task-Gruppe in einer wiedereroeffneten
  Chat-History eine `loadCheckpointsForTask(taskId)` ausloesen
  (sicher idempotent, async, nicht-blockierend).
- Wenn das Ergebnis nicht-leer ist: Diff-Review-Eingang + Undo-Bar
  wie im taskCompleted-Pfad rendern.
- UI-Eingang darf nicht doppelt rendern, wenn die Task gerade aktiv
  in derselben Session lief -- per `hasRenderedCheckpoints`-Flag
  (existiert schon in 2278).

### Edge cases

- Task hat null Checkpoints (z.B. read-only-Task): UI rendert nichts,
  kein Marker -- gleiches Verhalten wie heute.
- Task hat nur `newFiles`, keine `filesChanged`: Diff-Review zeigt
  "neue Dateien aus Task" Sektion -- gibt es heute schon in
  `showPostTaskReview` (Loop ueber `cp.newFiles`, AgentSidebarView.ts:4385).
- Shadow-Repo unzugaenglich (FS-Error): Methode wirft einen sauberen
  Error, UI rendert eine kleine Warn-Pille statt Markers (kein Stack
  in der Chat-View).

## Verhaeltnis zu IMP-01-07-01

`loadCheckpointsForTask` ist die gemeinsame Service-Erweiterung, die
auch das Tool `list_checkpoints` benoetigt. Wer zuerst dran ist,
baut sie -- der zweite wired sie. Reihenfolge offen, beide PLAN-Items
sind unabhaengig planbar.

## Regression test

1. Task ausfuehren mit Write-Tools -> Plugin-Reload -> alte Chat
   wieder oeffnen -> Diff-Review + Undo-Bar muessen sichtbar sein,
   Undo muss funktionieren.
2. Task ohne Write-Tools -> Reload -> alte Chat -> keine UI-Pille,
   kein Lade-Spinner haengt.
3. Neue Task im selben Session -> Plugin-Reload -> alte und neue
   Chat zeigen jeweils ihre Checkpoints, kein Mismatch der taskIds.

## Status

See the backlog row for FIX-01-07-02 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
