---
id: PLAN-31
title: FEAT-29-11 Skill-Layout-Konsolidierung + Edit-Folder + Builtin + Readme-Drop + Export-ZIP
date: 2026-05-20
feature-refs: [FEAT-29-11]
adr-refs: [ADR-119, ADR-124, ADR-126]
plan-refs: [PLAN-27, PLAN-28, PLAN-29, PLAN-30]
bug-refs: []
pair-id: epic-29-welle-4-b
---

# PLAN-31 -- Skill-Layout-Konsolidierung + 4 weitere Aenderungen

## Kontext

Aus dem Live-Test von FEAT-29-06 (2026-05-20) sind 5 User-Findings entstanden, die nicht in den urspruenglichen Wellen-4-Plan passten und thematisch zusammenhaengen:

**0. Layout-Konsolidierung:** Welle 2 hat `data/skills/plugin/{id}/` als Subfolder fuer Plugin-Skills eingefuehrt. Sebastian's Argument: "Skill ist Skill", aus User-Sicht kein Grund fuer Trennung. Alle Skills landen jetzt unter `data/skills/{name}/`, Source-Diskriminator via `source:`-Frontmatter-Feld.

**A. Edit-Button -> Skill-Folder:** Aktuell oeffnet `editSkill` einen Modal mit SKILL.md-Inhalt. Bei Built-in-Skills wirft das "Failed to edit". Sebastian moechte: Edit-Click oeffnet den **Folder** (electron shell), nicht den Modal -- konsistent ueber alle Skill-Typen.

**B. Built-in Skills auf Folder-Layout:** Heute haben Bundled-Skills nur SKILL.md (esbuild scant kein nested-folder). Sebastian moechte: Built-ins haben gleiche Struktur wie User-Skills (scripts/, references/, assets/), werden im Release mitgeliefert und beim Plugin-Start in `data/skills/{name}/` materialisiert (read-only, Plugin-Reload ueberschreibt User-Edits).

**C. Plugin-Readmes konsolidieren:** Heute generiert VaultDNAScanner `references/readme.md` separat fuer Core-Plugins. Sebastian: Option (b) -- alles in den SKILL.md-Body packen. Bei Plugin-Reload wird das neu geschrieben, alte `references/readme.md` weg.

**D. Export ganzer Folder:** Heute exportiert `exportSkill` nur die SKILL.md als .md-File. Sebastian moechte: ZIP-Bundle aus dem ganzen Skill-Folder (SKILL.md + scripts/ + references/ + assets/).

## Source-Diskriminator-Entscheidung

`source`-Frontmatter-Feld pro Skill:

```yaml
---
name: dataview
description: ...
source: dataview        # Plugin-ID fuer plugin-managed Skills
---
```

Werte:
- `builtin` -- vom Plugin-Bundle materialisiert, read-only fuer User, Plugin-Reload ueberschreibt
- `user` -- vom User erstellt (skill-creator oder manueller Import), nicht von Plugin-Reload veraendert. **Default wenn `source` fehlt**.
- `<plugin-id>` (z.B. `dataview`, `obsidian-excalidraw-plugin`) -- vom VaultDNAScanner verwaltet, Cleanup bei Plugin-Disable, Re-Generate bei Plugin-Update

**Konflikt-Resolution:** wenn beim Plugin-Skill-Write ein Skill mit selbem Namen aber `source: user` oder `source: builtin` existiert, **wird der Plugin-Skill nicht geschrieben** -- der User-Override gewinnt. Notice loggt das.

## Tasks (TDD-strict)

### Step 0: Layout-Konsolidierung (Foundation)

**Files:**
- `src/core/utils/agentFolder.ts` (Modify) -- neue `getSkillFolder(holder, name)`, alte plugin-Subfolder-Helper deprecaten
- `src/core/utils/__tests__/agentFolder.test.ts` (Modify) -- Tests fuer neuen Pfad
- `src/core/skills/VaultDNAScanner.ts` (Modify) -- Pfad-Refactor, Cleanup-Phase fuer Welle-2-Layout
- `src/main.ts` (Modify) -- Migration-Phase: `data/skills/plugin/*` -> `data/skills/*`, dann `data/skills/plugin/` loeschen

**RED:**
- Test `getSkillFolder(holder, "dataview")` -> `.vault-operator/data/skills/dataview` (post-Welle-1)
- Test `getSkillManifestPath(holder, "dataview")` -> `.vault-operator/data/skills/dataview/SKILL.md`
- Tests laufen heute mit Welle-2-Pfad `data/skills/plugin/{id}/` -- failen erst nach Path-Aenderung

**GREEN:**
- `getSkillFolder` als zentrale Funktion
- Welle-2-Helper (`getPluginSkillFolderPath`, `getPluginSkillManifestPath`, `getPluginSkillReadmePath`, `getPluginSkillCommandsRefPath`) delegieren auf `getSkillFolder` und entfernen den `plugin/`-Sub-Segment
- Migration: in main.ts onload-Pfad pruefen ob `data/skills/plugin/` existiert, move sub-folders ins `data/skills/`, then rmdir

### Step B: Built-in-Folder + Materialisierung

**Files:**
- `esbuild.config.mjs` (Modify) -- recursive scan von `bundled-skills/{name}/**`, files mit relative-path als Key
- `src/core/skills/SelfAuthoredSkillLoader.ts:scanBundledSkillsFromConstant` (Modify) -- Inventory aus sub-files
- `src/main.ts` (Modify) -- Builtin-Materialisierung beim onload (BUNDLED_SKILLS -> `data/skills/{name}/` mit `source: builtin`)

**RED:**
- Test: `BUNDLED_SKILLS["humanizer"]` enthaelt nicht nur `"SKILL.md"` sondern auch `"scripts/foo.js"` falls vorhanden (bei kuenstlich angelegtem Test-Skill)
- Test: nach onload landet `humanizer` in `data/skills/humanizer/SKILL.md` mit `source: builtin`

### Step A: Edit-Button -> Skill-Folder

**Files:**
- `src/ui/settings/SkillsTab.ts` (Modify) -- `editSkill` ersetzen durch `openSkillFolder`, electron `shell.openPath()` aufrufen
- Edit-Button-Icon: `pencil` -> `folder-open`

**RED:**
- Test: `openSkillFolder` ruft electron-shell-API mit absolutem Pfad auf

### Step C: Plugin-Readme-Drop + Body-Konsolidierung

**Files:**
- `src/core/skills/VaultDNAScanner.ts` (Modify):
  - `writeCorePluginReadmes` entfernen
  - `generateSkeletonBody` / `enrichCoreBody`: Readme-Inhalt (Description, Commands-Liste, Configuration, Usage-Notes) im Body inlinen
  - Cleanup-Phase: bei jedem Scan existierende `references/readme.md` loeschen
- `src/core/prompts/sections/toolRouting.ts:29` (Modify) -- `.readme.md`-Referenz weg
- `src/core/prompts/sections/toolDecisionGuidelines.ts:22` (Modify) -- analog

### Step D: Export-ZIP

**Files:**
- `src/ui/settings/SkillsTab.ts:exportSkill` (Modify)
- Nutzt `jszip` (schon in deps)
- Sammelt alle Files im Skill-Folder rekursiv, baut ZIP
- Output: Download-Trigger mit `{skill-name}.zip`

### Step E: Verify + Commit

- `npx tsc --noEmit -skipLibCheck` clean
- `npx vitest run` 1880+N passing
- `npm run build` exit 0
- Live-Test auf Sebastian's Vault: Plugin-Reload, dann pruefen ob:
  - `data/skills/plugin/` weg
  - `data/skills/{plugin-id}/SKILL.md` da
  - `data/skills/humanizer/SKILL.md` (builtin) da mit `source: builtin`
  - Edit-Click oeffnet Skill-Folder im macOS-Finder
  - Export liefert .zip

## Coverage Gate

| SC | Beschreibung | Task |
|---|---|---|
| Layout-Konsolidierung | Step 0 |
| Edit-Button -> Folder | Step A |
| Builtin-Folder-Layout | Step B |
| Plugin-Readme weg | Step C |
| Export-ZIP | Step D |

## Change Log

### 2026-05-20 -- initial draft
PLAN-31 angelegt nach Sebastian's Live-Test-Feedback (5 Findings). TDD-strict. Welle 4 zweites Feature.

### 2026-05-21 -- Steps B/C/D done, ready for commit

**Step B (Builtin-Folder + Materialisierung):**
- `esbuild.config.mjs` `generateInlineAssets()` Skills-Block: recursive scan
  via `walkSkill()`. Keys sind POSIX-Pfade relativ zum Skill-Folder
  (z.B. `"SKILL.md"`, `"scripts/foo.js"`). Binaerdateien werden als base64
  mit Suffix `__b64__` am Key kodiert; Textformate (.md/.txt/.json/.js/.ts/.yaml/.html/.css/.xml/.csv) bleiben Plaintext. Aktuell ship kein Bundled-Skill Sidecars, der recursive Scan greift erst wenn welche dazu kommen.
- Neue Klasse `BuiltinSkillMaterializer` in `src/core/skills/`. Konstruktor `(adapter, skillsRoot)`. `materializeAll(bundle)` schreibt jeden Skill nach `<skillsRoot>/<name>/`. SKILL.md-Frontmatter wird auf `source: builtin` normalisiert (auch wenn das Bundle `source: bundled` mitschickt -- single normalization point). Bestehende User-Overrides (`source: user`) und Plugin-Overrides (`source: <plugin-id>`) werden geskippt mit `report.skipped`. Bei jedem Lauf wird der bestehende Builtin-Folder rekursiv geleert, damit aus dem Release entfernte Files nicht stehen bleiben.
- 10 TDD-Tests in `BuiltinSkillMaterializer.test.ts`, alle gruen (RED zuerst, dann GREEN).
- main.ts wiring: nach `migrateLegacySkillsIfNeeded`, vor `selfAuthoredSkillLoader.loadAll()`. Folge: der Loader liest Built-ins nun ueber die normale Disk-Scan-Phase aus `data/skills/{name}/`, einheitlich mit User- und Plugin-Skills.
- `SelfAuthoredSkillLoader.scanBundledSkillsFromConstant` entfernt (dead code). `loadAll` macht jetzt nur noch einen Disk-Scan via `scanSkillsFrom(getUserSkillsDir())`. Type `SelfAuthoredSkill.source` von Enum auf `string` geweitet, weil ab jetzt auch Plugin-IDs als Source-Wert vorkommen.

**Step C (Plugin-Readme-Drop + Body-Konsolidierung):**
- C1+C2: VaultDNAScanner -- `writeCorePluginReadmes`, `writeCommandsReferenceIfTopPlugin`, `TOP_PLUGINS_WITH_COMMANDS_REF`, `escapeMarkdownTableCell` alle entfernt. `writeFolderFormat` schreibt `source: <plugin-id>` ins SKILL.md-Frontmatter. cleanupLegacyPluginSkillsLayout Stage 3: bei jedem Scan werden `references/`-Unterordner fuer scanner-managed Skills (erkannt am source-Marker) geloescht. 15/15 Tests in `VaultDNAScanner-writeSkillFile.test.ts` gruen.
- C3: SkillsTab -- README-Button + `openReadmeFile` + `checkReadmeExists` weg. Edit-Icon zeigt jetzt nur noch den Folder-Open-Button bei Plugin-Skills.
- C4: `toolRouting.ts` Zeile 29 + `toolDecisionGuidelines.ts` Zeile 22 -- `.readme.md`-Referenzen ersetzt durch "Read the plugin's SKILL.md". Der Settings-Schema-Hinweis steht jetzt im Body, nicht in einem separaten Readme.

**Step D (Export-ZIP):**
- `SkillsTab.exportSkill` ersetzt: nutzt jszip, packt rekursiv den ganzen Skill-Folder (SKILL.md + scripts/ + references/ + assets/ + sub-roles). Binary-Files (alles ausser den gelisteten Text-Extensions) werden via `adapter.readBinary` als ArrayBuffer eingelesen. Fallback fuer SkillsManager-only-Skills: 1-File-ZIP. Download-Filename `{skill-name}.zip` statt `SKILL-{name}.md`.

**Test-Stand:** 1888/1909 passing (alle 21 verbleibenden sind pre-existing baseline failures: VaultHealth, ExtractionQueue, WriterLock, ResultExternalizer, deferredToolLoading, toolMetadataConsistency, executeVaultOp). Build green (main.js 4.4 MB). Deploy auf iCloud-Vault.

### 2026-05-20 -- Step 0 + Step A done, B/C/D deferred

**Step 0 (Layout-Konsolidierung):**
- agentFolder.ts: 5 Helper auf unified `data/skills/{name}/` umgestellt -- `plugin/`-Subfolder weg.
- 7 RED-First-Tests in agentFolder.test.ts verified rot, dann gruen nach Refactor. Test-Stand 37/37 in dieser Datei.
- VaultDNAScanner.cleanupLegacyPluginSkillsLayout um Stage-2-Migration erweitert: `data/skills/plugin/{id}/` Sub-Folder werden rekursiv nach `data/skills/{id}/` gerename'd, dann das jetzt-leere `plugin/`-Verzeichnis gedroppt. Conflict-Detection: wenn am Ziel schon ein Skill existiert (user-managed), wird der Plugin-Skill *nicht* ueberschrieben -- Notice loggt das, User-Override gewinnt.
- VaultDNAScanner-writeSkillFile-Tests (17/17) gruen nach Pfad-Update.
- Adapter-Stub um `rename` erweitert fuer die Migration-Tests.

**Step A (Edit-Button -> Skill-Folder):**
- `SkillsTab.editSkill` ersetzt durch `openSkillFolder` (User/Learned/Builtin) und `openPluginSkillFolder` (Plugin-Skills). Beide nutzen `electron.shell.openPath()` mit absolutem Pfad via `adapter.getFullPath`. Edit-Icon `pencil` -> `folder-open`.
- ContentEditorModal-Pfad fuer Edit ist komplett weg. Falls Plugin-/Builtin-Skill nicht editierbar war ("Failed to edit skill"), oeffnet sich jetzt einfach der Folder im OS-File-Manager.

**Deferred fuer naechste Session:**
- Step B: esbuild recursive scan fuer bundled-skills + Builtin-Materialisierung
- Step C: Plugin-Readme-Drop, Inhalt in SKILL.md-Body
- Step D: Export-ZIP via jszip
- Step E: Build + Tests + Phase-end commit (jetzt schon mit Zwischenstand-commit)

**Test-Stand:** 1880/1901 passing, identisch zu Pre-Step-0. Build green, Deploy auf iCloud-Vault.
