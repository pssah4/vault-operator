---
id: PLAN-32
title: FEAT-29-09 Skill-Versionierung mit Snapshot und Restore
date: 2026-05-21
feature-refs: [FEAT-29-09]
adr-refs: []
plan-refs: [PLAN-31]
bug-refs: []
pair-id: epic-29-welle-4-c
---

# PLAN-32 -- Skill-Versionierung mit Snapshot und Restore

## Kontext

FEAT-29-09 baut ein Sicherheitsnetz fuer Skill-Aenderungen. Heute kann der skill-creator iterieren, der User manuell editieren, oder ein zukuenftiger Skill-Translator (FEAT-29-08) konvertieren -- jede Aenderung uebersrhreibt die vorherige Version unwiderruflich. Das laesst User vorsichtig sein und blockt Experimentieren.

Vorbild: FEAT-01-07 Checkpoints (isomorphic-git Shadow-Repo). Wir machen es einfacher: jeder Skill kriegt einen `.versions/{timestamp}/`-Subfolder mit kompletten Datei-Kopien aller Skill-Files. Storage-Overhead ist gross pro Snapshot (~95% des Skills), aber Skills sind klein (typisch <10KB), und 20 Snapshots pro Skill = ~200KB. Vertretbar.

**Architektur-Entscheidungen (vom User abgesegnet):**

- **Snapshot-Format:** Volle Datei-Kopien (NICHT diff-chain). Einfacher, robuster, kein Chain-Korruptions-Risk.
- **Trigger:** Vault-Adapter-Pre-Hook. Schreibvorgaenge auf `data/skills/{name}/{file}` werden vor dem Write durch einen Wrapper gefuehrt, der zuerst einen Snapshot des aktuellen Stands anlegt, DANN das Write durchlaesst. Single point of enforcement, deckt WriteFileTool, EditFileTool, Sandbox-Bridge, und manuelle User-Edits via Obsidian-Editor ab.
- **Storage-Location:** `<skill-folder>/.versions/{ISO-timestamp}/`. Snapshots leben innerhalb des Skill-Folders, werden mit Export-ZIP (FEAT-29-11) mit-exportiert.
- **Retention:** Default 20 letzte, plus alle User-getaggten Versionen. Konfigurierbar via Settings.
- **Restore:** Restore legt selbst einen impliziten Snapshot des aktuellen Stands an (so dass restore selbst rueckholbar bleibt). Atomic: alle Dateien werden zuerst in Staging-Folder geschrieben, dann atomic gerename'd auf den Skill-Folder.

## Tasks (TDD-strict)

### Step A: SkillSnapshotService -- Core Logic

**Files:**
- `src/core/skills/SkillSnapshotService.ts` (NEU) -- Pure-logic service: snapshot, restore, list, tag, prune
- `src/core/skills/__tests__/SkillSnapshotService.test.ts` (NEU) -- TDD-first

**API:**
```typescript
class SkillSnapshotService {
  constructor(adapter: VaultAdapter, skillsRootDir: string);

  async snapshot(skillName: string, label?: 'auto' | 'pre-restore'): Promise<SnapshotMetadata>;
  async list(skillName: string): Promise<SnapshotMetadata[]>;
  async restore(skillName: string, snapshotId: string): Promise<void>;
  async tag(skillName: string, snapshotId: string, tag: string): Promise<void>;
  async untag(skillName: string, snapshotId: string): Promise<void>;
  async prune(skillName: string, retentionCount: number): Promise<{ removed: string[] }>;
}

interface SnapshotMetadata {
  id: string;            // ISO timestamp, e.g. 2026-05-21T10-30-00-000Z
  createdAt: string;     // ISO datetime
  label?: 'auto' | 'pre-restore';
  tags: string[];
  fileCount: number;
  totalBytes: number;
}
```

**RED-First-Tests:**
- `snapshot()` creates `.versions/{id}/` folder with full copy of SKILL.md + all subfolders
- `snapshot()` writes `.versions/{id}/snapshot.json` with metadata
- `list()` returns snapshots sorted newest-first
- `restore()` copies snapshot files back to skill folder, atomically via staging
- `restore()` creates a pre-restore snapshot first
- `tag()` adds to tags array in snapshot.json
- `untag()` removes from tags array
- `prune(n)` removes oldest auto snapshots beyond n, preserves tagged

**Storage layout:**
```
<skill-folder>/
├── SKILL.md
├── scripts/foo.js
└── .versions/
    ├── 2026-05-21T10-30-00-000Z/
    │   ├── SKILL.md
    │   ├── scripts/foo.js
    │   └── snapshot.json   # { id, createdAt, label, tags, fileCount, totalBytes }
    └── 2026-05-21T11-00-00-000Z/
        └── ...
```

### Step B: Vault-Adapter Pre-Hook

**Files:**
- `src/core/skills/SkillWriteInterceptor.ts` (NEU) -- wraps app.vault.adapter.write/writeBinary for skill-folder paths
- `src/main.ts` (Modify) -- install interceptor on plugin onload

**Logic:**
```typescript
class SkillWriteInterceptor {
  install(plugin: ObsidianAgentPlugin, snapshotService: SkillSnapshotService): void;
  // Monkey-patches adapter.write/writeBinary on the in-memory Adapter instance.
  // For paths matching `<skillsRoot>/{name}/...`, takes a snapshot of {name}
  // BEFORE delegating to the original write. The first write for a given skill
  // in a session triggers; subsequent writes within a 5-second window share the
  // same snapshot (debounce) so multi-file-edits are atomic from the user's POV.
}
```

**RED-First-Tests:**
- Write to `<skillsRoot>/foo/SKILL.md` triggers snapshot of foo
- Write to non-skill path (e.g. Notes/abc.md) does NOT trigger snapshot
- Write to `<skillsRoot>/foo/.versions/...` does NOT recursively trigger snapshot
- Two writes within 5s share the same snapshot
- Excluding `.versions/` and `.gitkeep` paths from triggering
- Excluding `assets/` binary files larger than 1MB (to avoid snapshot bloat)

### Step C: UI -- Versions-Button + SkillVersionsModal

**Files:**
- `src/ui/settings/SkillsTab.ts` (Modify) -- add `history` icon button per skill row, opens modal
- `src/ui/modals/SkillVersionsModal.ts` (NEU) -- modal with list + Restore + Tag actions

**RED-First-Tests:**
- Modal renders snapshot list newest-first
- Restore button calls SkillSnapshotService.restore
- Tag button prompts for tag name, calls SkillSnapshotService.tag
- Empty state when no snapshots

### Step D: Retention config + Settings

**Files:**
- `src/types/settings.ts` (Modify) -- add `skillVersioning.retentionCount` (default 20)
- `src/ui/settings/SkillsTab.ts` (Modify) -- add retention slider in section header
- `src/main.ts` (Modify) -- periodic prune (every plugin load + after every snapshot)

### Step E: Verify + Commit

- `npx tsc --noEmit -skipLibCheck` clean
- `npx vitest run` 1936/1957 + N new tests passing
- `npm run build` exit 0
- Live-Test:
  - Plugin reload
  - Edit `data/skills/skill-creator/SKILL.md` manually in Obsidian → expect `.versions/{ts}/` to appear
  - Open SkillsTab → history button on skill row → modal opens → see snapshot
  - Restore → previous content comes back; new pre-restore snapshot added
  - Tag a version "good" → next prune leaves it alone

## Coverage Gate

| SC | Beschreibung | Task |
|---|---|---|
| SC-01 | Snapshot bei jedem Schreibvorgang | Step B (Adapter-Hook) |
| SC-02 | Restore unter 2 Sekunden | Step A (Performance-Test) |
| SC-03 | Storage-Overhead unter 5% | by-design pruned 20 snapshots |
| SC-04 | Restore rueckholbar via pre-restore Snapshot | Step A |
| SC-05 | Tagged Versionen ueberleben Retention | Step A (prune()) + Step D |

## Change Log

### 2026-05-21 -- initial draft

PLAN-32 angelegt. Strict TDD. Volle Datei-Kopien (nicht diff-chain). Vault-Adapter Pre-Hook als Trigger. Skill-internes `.versions/`-Folder.
