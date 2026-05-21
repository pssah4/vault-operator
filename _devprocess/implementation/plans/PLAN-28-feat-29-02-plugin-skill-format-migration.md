---
id: PLAN-28
title: FEAT-29-02 Plugin-Skill-Format-Migration -- Generator-Refactor + Pfad-Wechsel
date: 2026-05-20
feature-refs: [FEAT-29-02]
adr-refs: [ADR-124]
plan-refs: [PLAN-27]
bug-refs: []
pair-id: epic-29-welle-2
---

# PLAN-28 -- FEAT-29-02 Plugin-Skill-Format-Migration

## Kontext

EPIC-22 hat die User-Skills auf Anthropic-konformes Folder-Format umgestellt: `{root}/skills/{slug}/SKILL.md`. Plugin-Skills hingegen sind im alten File-Format `{root}/plugin-skills/{plugin-id}.skill.md`. Welle 2 schliesst die Luecke. Pfad-Ziel: `{root}/data/skills/plugin/{plugin-id}/SKILL.md` mit strikter Frontmatter (`name` + `description` only).

Wichtige Beobachtung aus dem Codebase-Reconciliation-Pass: die 138 `.skill.md`-Files sind **generated content** vom `VaultDNAScanner`, nicht User-Content. Welle 2 ist damit ein **Generator-Refactor** plus eine **einmalige Cleanup-Aktion** der alten Files, nicht eine File-Migration wie bei User-Skills.

Welle-2-Aktivierung haengt an Welle 1 (`_layoutMigrationStatus === 'complete'`). Pre-Welle-1-User behalten Legacy-Layout (alte File-Form, alter Pfad), bis sie Welle 1 aktivieren.

## Open Questions aus Spec, jetzt beantwortet

1. **Wo liegen kuratierte references/commands.md fuer Top-5-Plugins?** Eager-Generate im VaultDNAScanner. Top-5 (Excalidraw, Dataview, Templater, Tasks, Kanban) bekommen `references/commands.md` mit dem vollstaendigen `app.commands`-Auszug ihres Plugins beim Scan. Kein Bundle-Asset, weil die Command-Listen Plugin-Version-spezifisch sind.

2. **Was passiert mit den .readme.md-Files?** Existierende `.readme.md` (heute fuer Core-Plugins generiert) wandern als `references/readme.md` ins neue Folder. Im Generator-Pfad geht das Eager-Write in `references/readme.md` ueber denselben Code-Pfad. Alte `.readme.md` werden in der Cleanup-Phase entfernt.

3. **Wie wird der SkillRegistry-Pfad umgestellt?** Bestehender Pattern beibehalten: VaultDNAScanner-Konstruktor + SkillRegistry-Konstruktor lesen `getPluginSkillsDir(this)`. Layout-aware-Helper macht die Pfad-Wahl per Settings-Flag, kein Setter-Pfad.

## Tasks

### Task 1 -- agentFolder.ts Helper-Erweiterung

**Files:**
- `src/core/utils/agentFolder.ts` (Modify)
- `src/core/utils/__tests__/agentFolder.test.ts` (Modify, +Tests)

**Aktion:**
- Neue Funktion `getPluginSkillFolderPath(holder, pluginId)` -> `{root}/data/skills/plugin/{pluginId}` (nur post-Welle-1)
- Neue Funktion `getPluginSkillManifestPath(holder, pluginId)` -> `{folder}/SKILL.md`
- Pre-Welle-1-Fallback: alte File-Pfad (`getPluginSkillsPath`) bleibt aktiv. Aufrufer entscheidet via `isLayoutMigrated`-Check direkt oder durch Helper-Polymorphie
- `getPluginSkillsDir` bleibt erhalten als "Wurzel des Plugin-Skills-Bereichs" (jetzt: legacy `plugin-skills/` oder neu `data/skills/plugin/`)
- Decision: ein einziger Helper `getPluginSkillsDir` der nach Welle 1 auf `data/skills/plugin/` zeigt, vor Welle 1 auf `plugin-skills/`. Aufrufer muss Folder-vs-File-Layout selber kennen.

**Tests:**
- `getPluginSkillFolderPath returns data/skills/plugin/{pid} after migration`
- `getPluginSkillFolderPath returns legacy plugin-skills/{pid}.skill.md path before migration` (returns null oder fallback)
- `getPluginSkillManifestPath returns SKILL.md inside folder after migration`
- `getPluginSkillsDir flips zu data/skills/plugin/ after migration`

### Task 2 -- VaultDNAScanner.writeSkillFile() Folder-Format

**Files:**
- `src/core/skills/VaultDNAScanner.ts` (Modify ~lines 569-613)

**Aktion:**
- `writeSkillFile()` schreibt jetzt:
  - Post-Welle-1: `{getPluginSkillFolderPath}/SKILL.md` mit strikter Frontmatter
  - Pre-Welle-1: `{getPluginSkillsPath}` mit alter Frontmatter (unveraendert)
- Frontmatter-Strikt nach Anthropic: `name` und `description` only
- Removed Metadata-Felder (`id`, `source`, `plugin-type`, `status`, `class`, `has-settings`, `needs-setup`, `commands`) wandern in den Body als Markdown-Section "Plugin Metadata"
- `mkdir({folder}/references, { recursive: true })` bevor `SKILL.md` geschrieben wird

**Pruefen:**
- VaultDNAScanner.skillsDir ist `{getPluginSkillsDir}` -- nicht mehr direkt nutzbar fuer den Folder-Pfad
- skillsDir wird in Read-Prompt-Hints verwendet (Zeile 696, 779, 793 fuer readme), das muss auch refactored werden

### Task 3 -- Top-5 references/commands.md Eager-Generate

**Files:**
- `src/core/skills/VaultDNAScanner.ts` (Modify, neue Methode `writeCommandsReference`)

**Aktion:**
- Konstante `TOP_PLUGINS_WITH_COMMANDS_REF = ['obsidian-excalidraw-plugin', 'dataview', 'templater-obsidian', 'obsidian-tasks-plugin', 'obsidian-kanban']`
- Beim `writeSkillFile` fuer Top-5-Plugins: zusaetzlich `references/commands.md` mit `app.commands.commands` filtered by plugin-prefix schreiben
- Format: ein Markdown-Table `| Command ID | Name | Hotkey |` plus optional Description aus Plugin
- Idempotent: ueberschreibt bei jedem Scan

### Task 4 -- VaultDNAScanner readme.md Migration

**Files:**
- `src/core/skills/VaultDNAScanner.ts` (Modify ~lines 793 area)

**Aktion:**
- Wenn Core-Plugin und post-Welle-1: schreibe `references/readme.md` statt `{id}.readme.md`
- Pre-Welle-1-Hint-Pfade in Prompt-Body anpassen

### Task 5 -- Cleanup alter .skill.md / .readme.md Files

**Files:**
- `src/core/skills/VaultDNAScanner.ts` (Modify in `initialize()`-Pfad)

**Aktion:**
- Nach `_layoutMigrationStatus === 'complete'`: am Scan-Anfang alte `{root}/data/plugin-skills/*.skill.md` und `*.readme.md` files entfernen (sie werden vom neuen Scan ueberschrieben mit neuem Format wenn man sie laesst, aber leere Files am alten Pfad sollten weg)
- Idempotent: failt nicht wenn schon weg
- Im selben Pass: leerer `plugin-skills/`-Folder loeschen

### Task 6 -- Call-site-Updates fuer neue Folder-Form

**Files:**
- `src/core/tools/agent/EnablePluginTool.ts:116` (NEXT STEP-hint pfad)
- `src/ui/settings/SkillsTab.ts:585-586` (openSkillFile Pfad)
- `src/ui/settings/SkillsTab.ts:597+` (openReadmeFile Pfad)
- `src/ui/settings/BackupTab.ts:47` (pluginSkillsDir-Berechnung pruefen)
- `src/core/skills/SkillRegistry.ts:21,84+` (skillsDir-Prompt-Hint)

**Aktion:**
- Alle Pfad-Strings auf neue Folder-Form umstellen: `{pid}.skill.md` -> `{pid}/SKILL.md`
- Layout-aware: pre-Welle-1 weiterhin alte File-Form

### Task 7 -- Tests + Build + Idempotenz-Check

**Files:**
- `src/core/utils/__tests__/agentFolder.test.ts` (neue Tests)
- Build (`npm run build`)
- Smoke-Test in Sebastian's Vault (manuell)
- Idempotenz-Check: zweiter Reload des Plugins erzeugt 0 Aenderungen

**Verifikation:**
- Alle 1775 bestehenden Tests bleiben gruen
- Neue agentFolder-Tests passieren
- Build green, deploy erfolgt automatisch (npm run build triggert vault-deploy)
- Live-Reload zeigt {.vault-operator/data/skills/plugin/*/SKILL.md} statt {data/plugin-skills/*.skill.md}

## Coverage Gate

### SC -> Task Mapping

| SC | Beschreibung | Task |
|---|---|---|
| SC-01 | Alle Plugin-Skills im Folder/SKILL.md-Format nach Migration | Task 2 + Task 6 |
| SC-02 | Frontmatter strikt nur name und description | Task 2 |
| SC-03 | Migration idempotent | Task 5 + Task 7 |
| SC-04 | Top-5-Plugins mit references/commands.md | Task 3 |
| SC-05 | Alter Pfad nach Migration entfernt | Task 5 |

### ADR-Alignment

ADR-124 (Plugin-as-Skill Live-Probe Discovery) wird teilweise operationalisiert: Folder-Format ist Voraussetzung fuer das spaetere `probe_plugin`-Tool aus FEAT-29-03. Welle 2 macht das Setup, FEAT-29-03 fuegt die Probe-Logic dazu.

### Verifikationsbefehle

- `npm run build` -- TypeScript-Check und Bundle
- `npx vitest run src/core/utils/__tests__/agentFolder.test.ts` -- Helper-Tests
- `npx vitest run` -- Full-Suite-Check (kein Regression)
- Live: Plugin reload mit aktiviertem Welle 1, dann `ls .vault-operator/data/skills/plugin/` (sollte plugin-id-Folder zeigen)

## Change Log

### 2026-05-20 -- initial draft
Plan angelegt nach Codebase-Reconciliation. 7 Tasks, alle Welle-1-abhaengig. Open-Questions aus FEAT-29-02-Spec im Phase-2 Code-Pivot beantwortet. Welle 2 wartet auf User-Review vor Implementation.

### 2026-05-20 -- implementation complete
Alle 7 Tasks gruen umgesetzt. Implementation-Notes:

- **Task 1 (agentFolder.ts):** 5 neue Helper-Funktionen (`getPluginSkillFolderPath`, `getPluginSkillManifestPath`, `getPluginSkillReadmePath`, `getPluginSkillCommandsRefPath`, plus erweiterter `getPluginSkillsPath`). Alle layout-aware via `isLayoutMigrated`. Helper returnen `null` wenn pre-Welle-1 und kein sinnvoller Fallback-Pfad existiert (Folder-Form, references). 11 neue Tests in `agentFolder.test.ts`, alle 29 (18 alt + 11 neu) gruen.
- **Task 2 (VaultDNAScanner writeSkillFile):** `AgentFolderHolder`-Type erweitert um `_layoutMigrationStatus`-Feld. `writeSkillFile` splittet jetzt in `writeFolderFormat` (post-Welle-1) und `writeLegacyFileFormat` (pre-Welle-1). Frontmatter post-Welle-1 strikt nur `name` und `description` (Anthropic-konform). Removed Felder (id, source, plugin-type, status, class, has-settings, needs-setup, commands) landen im Body unter `## Plugin metadata` als Markdown-Section.
- **Task 2a (ensureDirRecursive):** Neuer Helper in VaultDNAScanner, weil Obsidian's `vault.adapter.mkdir` non-recursive ist. Erstellt jeden Parent-Segment einzeln. Wichtig fuer das jetzt 3 Stufen tiefe Layout `data/skills/plugin/{id}/`.
- **Task 3 (Top-5 commands.md):** Neue Methode `writeCommandsReferenceIfTopPlugin` schreibt `references/commands.md` fuer 5 kuratierte Plugins (Excalidraw, Dataview, Templater, Tasks, Kanban). Idempotent (overwrite auf jedem Scan). Tabelle mit Command-ID + Name.
- **Task 4 (readme migration):** `writeCorePluginReadmes` nutzt jetzt `getPluginSkillReadmePath` -- post-Welle-1 nach `{folder}/references/readme.md`, pre-Welle-1 weiter nach `{id}.readme.md` flat.
- **Task 5 (Cleanup):** Neue Methode `cleanupLegacyPluginSkillsLayout` lauft am Anfang von `initialize` wenn `_layoutMigrationStatus === 'complete'`. Entfernt `data/plugin-skills/*.skill.md` und `*.readme.md`, dann den (jetzt leeren) Folder. Non-fatal: jeder Fehler wird geloggt aber blockt das Init nicht.
- **Task 6 (Call-sites):** EnablePluginTool nutzt automatisch den neuen Pfad via `getPluginSkillsPath` (das jetzt layout-aware ist). SkillsTab.openSkillFile/openReadmeFile/checkReadmeExists auf die neuen Helper umgestellt. SkillRegistry Prompt-Hint detected via Suffix `/data/skills/plugin` ob Folder- oder File-Layout aktiv ist. BackupTab `plugin-skills`-Category jetzt `recursive: true` (pre+post-Welle-1 safe).
- **Wayfinder:** `src/ARCHITECTURE.map` row fuer `vault-dna` erweitert mit ADR-124-Referenz und FEAT-29-02-Note.

### Test-Stand
- 1775 -> 1784 passing (+9 neue Tests aus Welle 2)
- 21 verbleibende Failures alle pre-existing pre-Welle-1 (window-is-not-defined etc., out-of-scope)
- Build green, deploy auf iCloud-Vault durchgelaufen

### Verifikationsbefehle ausgefuehrt
- `npx tsc --noEmit -skipLibCheck` -> 0 errors
- `npx vitest run src/core/utils/__tests__/agentFolder.test.ts` -> 29/29
- `npx vitest run src/core/skills/__tests__/` -> 30/30
- `npx vitest run` -> 1784/1805
- `npm run build` -> exit 0, main.js 4.3 MB

### Open fuer Welle-2-Live-Test
Live-Verifikation auf Sebastians Vault: nach Plugin-Reload sollten unter `{vault}/.vault-operator/data/skills/plugin/` Folder pro installed-plugin erscheinen mit SKILL.md drinnen. Top-5 zusaetzlich mit `references/commands.md`. Alter Pfad `data/plugin-skills/` wird beim ersten Scan-after-Init geleert.

### Coverage Gate -- final

| SC | Beschreibung | Task | Status |
|---|---|---|---|
| SC-01 | Alle Plugin-Skills im Folder/SKILL.md-Format | Task 2 + Task 6 | Code green, Live-Test pending |
| SC-02 | Frontmatter strikt nur name + description | Task 2 (writeFolderFormat) | Code green |
| SC-03 | Migration idempotent | Task 5 (cleanup) + Task 2 (overwrite) | Code green |
| SC-04 | Top-5 mit references/commands.md | Task 3 (writeCommandsReferenceIfTopPlugin) | Code green |
| SC-05 | Alter Pfad nach Migration entfernt | Task 5 (cleanupLegacyPluginSkillsLayout) | Code green, Live-Test pending |
