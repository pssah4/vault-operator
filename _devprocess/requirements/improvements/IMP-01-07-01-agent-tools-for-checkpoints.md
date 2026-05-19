---
id: IMP-01-07-01
feature: FEAT-01-07
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-19
---

# IMP-01-07-01: Checkpoints als Agent-Tools (list / read / diff / restore)

## Motivation

Live 2026-05-19 (Sebastian, Note `Madrid & Fuerteventura 2026.md`):
Eine Notiz wurde durch eine Agent-Aktion ueberschrieben, der User
will die alten Inhalte zurueck. Er fragt den Agent "nutze die
Checkpoints" -- der Agent antwortet wahrheitsgemaess, dass er KEIN
Tool fuer Checkpoints kennt und schlaegt stattdessen Workarounds vor
(read_file, search_history, list_files).

Tatsaechlicher Zustand:

- `GitCheckpointService` (`src/core/checkpoints/GitCheckpointService.ts`)
  legt vor jedem Write-Tool automatisch einen Snapshot ins Shadow-Repo
  unter `~/vault-operator-shared/checkpoints/` (Branch
  `fix/move-plugin-data-out-of-vault`).
- Der Service hat bereits alle benoetigten Methoden:
  `getCheckpointsForTask`, `getSnapshotContent`, `diff`,
  `restoreLatestForTask`, `restore`.
- Die UI in `AgentSidebarView` ruft diese Methoden -- aber NUR die
  UI. Es gibt keinen Eintrag im `ToolRegistry`, der dem Agent diese
  Funktionalitaet zugaenglich macht.

Konsequenz: in dem Moment, in dem die Sidebar-Undo-UI nicht greift
(z.B. Plugin-Reload, alte Chat-History, anderer Task-Kontext --
siehe FIX-01-07-02), kann der User die alten Inhalte NICHT
zurueckholen. Er ist gestrandet zwischen einem funktionierenden
Service und einem Agent, der nichts davon weiss.

## Scope

User-Entscheidung 2026-05-19: Recovery-fokussierter Tool-Layer (4
Tools). Keine Schreib-Tools fuer Snapshots ausserhalb des
automatischen Pipeline-Triggers; kein cleanup/dedupe als
Agent-Surface.

### Tools

1. **`list_checkpoints`** (read-tool, kein Approval)
   - Args: `taskId?: string`, `path?: string`, `limit?: number` (default 50).
   - Liest aus dem Shadow-Repo via `isomorphic-git`-Log mit Filter auf
     Commit-Messages `checkpoint:${taskId}`. Ohne `taskId`: alle Tasks.
     Mit `path`: nur Checkpoints, deren `FilesJson` den Pfad enthaelt.
   - Returnt: Array aus `{ taskId, commitOid, timestamp, filesChanged[], newFiles[]?, toolName?, skipped[]? }`.
   - Output kompakt halten (token-effizient) -- pro Eintrag eine Zeile
     mit `oid8 | timestamp | task | tool | files...`. Volle Liste nur
     auf explicit Anfrage via `verbose: true`.

2. **`read_checkpoint`** (read-tool, kein Approval)
   - Args: `commitOid: string`, `path: string`.
   - Wrappt `getSnapshotContent(checkpoint, path)`. Erwartet, dass der
     Agent `commitOid` aus `list_checkpoints` mitbringt.
   - Returnt: `{ content: string, oid: string, path: string, timestamp: string }`.
   - Path-Validation: gleiches `isVaultRelative()` wie der Service.

3. **`diff_checkpoint`** (read-tool, kein Approval)
   - Args: `commitOid: string`, `path?: string`.
   - Ohne `path`: alle Files aus dem Checkpoint, Service-`diff()` Output.
   - Mit `path`: nur die genannte Datei (eigene unified-diff-Helfer-Funktion,
     da `diff()` heute alle `filesChanged` durchgeht).
   - Cap auf max 4000 chars Output (Token-Bloat), Rest abschneiden mit
     `... (truncated, use read_checkpoint for full content)`.

4. **`restore_checkpoint`** (write-tool, BRAUCHT Approval)
   - Args: `commitOid: string`, `path?: string`, `mode?: 'file' | 'task'`.
   - `mode='file'` (default wenn `path` gesetzt): nur die eine Datei
     restoren. Kein Loeschen von `newFiles` -- das macht nur `mode='task'`.
   - `mode='task'`: Service-`restore(checkpoint)` aufrufen -- restored
     alle `filesChanged` + loescht `newFiles`.
   - Returnt: `{ restored: string[], errors: string[] }`.
   - `isWriteOperation = true` -> Approval-Pipeline + neuer
     **Pre-Restore-Snapshot** ueber den aktuellen Vault-Zustand der
     betroffenen Datei(en), damit ein Restore selbst rueckgaengig gemacht
     werden kann. Das verhindert "Restore ist Einbahnstrasse".

### Implementation Skizze

```
src/core/tools/vault/
  ListCheckpointsTool.ts
  ReadCheckpointTool.ts
  DiffCheckpointTool.ts
  RestoreCheckpointTool.ts
```

- Alle 4 Tools haben einen `checkpointService: GitCheckpointService`
  als Constructor-Dep (analog zum existierenden Plugin-Wiring).
- `ToolRegistry`-Registrierung im `tools-vault`-Gruppe (Lesetools
  in `read`, `RestoreCheckpointTool` in `edit`).
- Path-Filter in `list_checkpoints` nutzt die existierende
  `parseFilesFromMessage`-Logik (private heute -- moeglicherweise
  als Public-Method `getCheckpointsForPath(path)` auf den Service
  heben, damit die Tools nicht in den Service-Internals fischen).

## Beruehrt FIX-01-07-02

Das parallele FIX-01-07-02 (Checkpoint-UI bei History-Reload) braucht
exakt dieselbe Service-Erweiterung -- "Liste aller Task-Checkpoints
aus dem Shadow-Repo" -- die wir hier brauchen, um `list_checkpoints`
ohne `taskId`-Filter zu bedienen. Wer zuerst implementiert, baut die
Service-Methode; der zweite Implementer wired sie nur ein.

## Success Criteria

- SC-1: Agent kann ohne UI-Eingriff aus einem neuen Chat heraus die
  Checkpoint-Historie einer Datei aufzaehlen und den passenden
  Snapshot zurueckspielen.
- SC-2: `list_checkpoints` ohne Argumente liefert die letzten 50
  Checkpoints global, nicht task-scoped.
- SC-3: `restore_checkpoint` macht VORHER einen Snapshot des aktuellen
  Zustands -- ein zurueckgespielter Restore kann selbst rueckgaengig
  gemacht werden.
- SC-4: Output von `list_checkpoints` und `diff_checkpoint` token-bounded
  (default kompakt, `verbose=true` opt-in).
- SC-5: Path-Traversal-Schutz in `read_checkpoint` und
  `restore_checkpoint` -- gleicher `isVaultRelative()`-Check wie im
  Service.
- SC-6: 1 Unit-Test pro Tool plus ein Integration-Test, der
  `list -> read -> diff -> restore` einmal durchspielt.

## Status

Planned. Siehe BACKLOG-Zeile in `_devprocess/context/BACKLOG.md`.
