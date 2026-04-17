# Plan Context: EPIC-022 Skill-Package Ecosystem

> **Purpose:** Technische Zusammenfassung fuer Claude Code
> **Created by:** Architect
> **Date:** 2026-04-17

---

## Technical Stack

**Runtime:**
- Sprache: TypeScript (strict)
- Framework: Obsidian Plugin API
- Build: esbuild
- Runtime: Electron (via Obsidian)

**Relevante bestehende Bausteine:**
- `SelfAuthoredSkillLoader` ([src/core/skills/SelfAuthoredSkillLoader.ts](../../src/core/skills/SelfAuthoredSkillLoader.ts)) scannt bereits `subfolder/SKILL.md`
- `SkillRegistry` ([src/core/skills/SkillRegistry.ts](../../src/core/skills/SkillRegistry.ts)) verwaltet Plugin-Skills, liefert System-Prompt-Section
- `getAgentFolderPath()` ([src/core/utils/agentFolder.ts](../../src/core/utils/agentFolder.ts)) aus ADR-072 liefert den Skills-Root
- `JSZip` schon im Bundle (DOCX/PPTX)
- Sandbox (`evaluate_expression`, ADR-021) fuer Script-Ausfuehrung

## Architecture Style

- Plugin-Monolith (Obsidian Plugin API)
- Qualitaetsziele:
  1. **Backward-Compat:** Alle bestehenden Skills laden unveraendert.
  2. **Anthropic-Kompatibilitaet:** [anthropics/skills](https://github.com/anthropics/skills) Zips laden out-of-box.
  3. **Security:** Zip-Whitelist, Path-Traversal-Schutz, kein Auto-Run von Scripts.
  4. **Token-Budget:** References / Assets on-demand, nie in System-Prompt.

## Key Architecture Decisions (ADR Summary)

| ADR | Titel | Vorgeschlagene Entscheidung | Impact |
|-----|-------|-----------------------------|--------|
| ADR-075 | Skill-Package-Architektur | Anthropic-kompatibles Folder-Format + `type: coordinator` Obsilo-Extension | High |

**Detail:**

1. **Ordner-Layout:** `SKILL.md` plus optionale `scripts/`, `references/`, `assets/` Subdirs, plus `*.skill.md` Sub-Rollen bei Coordinator.
2. **Frontmatter additiv:** `license`, `compatibility`, `metadata` (Anthropic) + `type`, `role` (Obsilo-Extension).
3. **Zip-Import:** JSZip + Whitelist-Pfade + 100MB-Limit + Path-Traversal-Check + Confirm-Modal bei Duplikat.
4. **Scripts:** nur TS/JS ueber bestehenden Sandbox-Executor; Python/Bash bleiben Referenz-Text.
5. **Coordinator:** explizites `type: coordinator` Flag; Sub-Rollen nur mit Frontmatter im System-Prompt, Body on-demand.

Siehe: [_devprocess/architecture/ADR-075-skill-package-architecture.md](../architecture/ADR-075-skill-package-architecture.md)

## Implementation Phases

### Phase 1: FEATURE-2201 Skill-Folder-Struktur (P0, M)

**Ziel:** Loader erkennt Sub-Dirs, Frontmatter akzeptiert Anthropic-Felder, Metadata enthaelt Inventory.

**Aenderungen:**
- [src/core/skills/SelfAuthoredSkillLoader.ts](../../src/core/skills/SelfAuthoredSkillLoader.ts): Scan-Pass erweitern um `scripts/`, `references/`, `assets/` Listing, Sub-Rollen-Frontmatter-Parse.
- Neuer Helper `SkillFolderScanner` (inline oder separate Datei).
- [src/core/skills/types.ts](../../src/core/skills/types.ts): `SkillInventory`, `SubRoleMeta` Typen.
- Frontmatter-Parser: unbekannte Felder akzeptieren, Obsilo-Pflichtfelder weiter validieren.
- Name-Validierung: `name` muss = Ordner-Name, Fallback auf Ordner-Name wenn fehlend.
- System-Prompt-Builder um Inventory-Block erweitern.

**Fixtures** (unter `src/core/skills/__tests__/fixtures/`):
- `single-file-skill/SKILL.md` (Backward-Compat)
- `with-references/SKILL.md` + `references/GUIDE.md`
- `with-scripts/SKILL.md` + `scripts/helpers.ts` + `scripts/extract.py`
- `with-assets/SKILL.md` + `assets/template.json`
- `with-anthropic-frontmatter/SKILL.md` (mit `license`, `compatibility`, `metadata`)
- `name-mismatch/SKILL.md` (Fehler-Fall)
- `coordinator/SKILL.md` + `writer.skill.md` + `reviewer.skill.md`

**Tests:**
- Loader parst alle Fixtures korrekt.
- Bestehende 9 bundled-skills smoke-test (Regression).
- `references/*.md` erscheint NICHT im System-Prompt-Output.
- Sub-Rollen-Frontmatter wird gelesen, Sub-Rollen-Body nicht.

### Phase 2: FEATURE-2202 .skill Zip-Import (P0, S)

**Ziel:** UI-Button in Skills-Tab, JSZip-basierte Extraktion mit Security-Checks.

**Aenderungen:**
- Neu: [src/core/skills/SkillPackageImporter.ts](../../src/core/skills/SkillPackageImporter.ts)
  - `import(buffer: ArrayBuffer, plugin: ObsiloPlugin): Promise<ImportResult>`
  - Whitelist-Liste hardgecoded (s. ADR).
  - Size-Limit 100MB (konfigurierbar via Settings).
  - Duplikat-Detection, Modal-Dispatch.
- [src/ui/settings/SkillsTab.ts](../../src/ui/settings/SkillsTab.ts): Button "Import skill package...", File-Input.
- Neu: `SkillImportConfirmModal` (Pattern: AgentFolderPickerModal).
- Nach Import: `SelfAuthoredSkillLoader.refresh()` triggern.

**Tests:**
- Unit: Whitelist-Filter (entry path matching).
- Unit: Path-Traversal Rejection (`../../etc/passwd`, `/abs/path`, null-bytes).
- Unit: Size-Limit (200MB -> reject).
- Unit: Fehlende `SKILL.md` -> reject.
- Unit: `name`-Mismatch -> reject.
- Manueller Integration-Test: Zip aus Anthropic-Repo (z.B. `pdf.skill`).

### Phase 3: FEATURE-2203 Scripts-im-Skill (P1, M)

**Ziel:** Scripts werden im System-Prompt gelistet; Ausfuehrung ueber bestehenden Sandbox-Pfad.

**Aenderungen:**
- System-Prompt-Builder: Script-Inventar mit Language-Tag (TS/JS = Sandbox-ausfuehrbar, andere = nur Referenz).
- Keine neue Script-Execution-Infra noetig -- Agent nutzt `evaluate_expression` mit Script-Content aus `read_file`.
- Dokumentation (README/Skill-Guide): "How to expose a script in your skill".

**Tests:**
- Agent-Task mit Skill, der Script hat: kann Script via `read_file` holen und via `evaluate_expression` ausfuehren (Approval feuert).
- Regression: Skills ohne Scripts unveraendert.

### Phase 4: FEATURE-2204 Coordinator-Skill (P1, M)

**Ziel:** `type: coordinator` Flag + Sub-Rollen im Prompt.

**Aenderungen:**
- Loader: erkenne `type: coordinator`, sammele Sub-Rollen (Frontmatter only).
- System-Prompt-Builder: "Available sub-roles:" Block fuer Coordinator.
- Name-Kollisions-Check: Sub-Rolle darf nicht denselben `name` wie Haupt-Skill haben.

**Tests:**
- Loader-Fixture: Coordinator + 2 Sub-Rollen -> Inventory korrekt.
- Prompt-Output enthaelt Sub-Rollen-Liste, nicht den Body.
- `*.skill.md` ausserhalb Coordinator-Ordner bleibt eigenstaendiger Skill (Backward-Compat fuer Plugin-Skills).

## Files to Touch (Uebersicht)

| Datei | Aenderung | Feature |
|-------|-----------|---------|
| [src/core/skills/SelfAuthoredSkillLoader.ts](../../src/core/skills/SelfAuthoredSkillLoader.ts) | Folder-Scan erweitert | 2201, 2204 |
| [src/core/skills/types.ts](../../src/core/skills/types.ts) | `SkillInventory`, `SubRoleMeta` | 2201, 2204 |
| [src/core/skills/SkillPackageImporter.ts](../../src/core/skills/SkillPackageImporter.ts) | Neu | 2202 |
| [src/ui/settings/SkillsTab.ts](../../src/ui/settings/SkillsTab.ts) | Import-Button | 2202 |
| `src/ui/settings/SkillImportConfirmModal.ts` | Neu | 2202 |
| `src/core/utils/agentFolder.ts` | `getSkillsDir()` Helper | 2201 |
| `src/core/prompts/SystemPromptBuilder.ts` (oder aequivalent) | Inventory-Block + Coordinator-Block | 2201, 2203, 2204 |
| [src/core/skills/__tests__](../../src/core/skills/__tests__) | Neue Fixtures + Tests | alle |

## Security Requirements (verbindlich)

1. **Zip-Import:**
   - Alle Pfade normalisieren und gegen Whitelist pruefen BEVOR geschrieben wird.
   - Zip-Bomb-Check: Summe `uncompressedSize` aller Entries vor Extraktion.
   - Keine Symlinks, keine Executable-Bits.
2. **Scripts:**
   - Nur `.ts` / `.js` werden als "Sandbox-ausfuehrbar" markiert.
   - Keine neue Execution-Pipeline. Ausschliesslich ueber `evaluate_expression`.
   - Approval ist nicht optional.
3. **Coordinator:**
   - Sub-Rollen-Body wird nie automatisch in den System-Prompt gezogen.
   - Kein Auto-Dispatch -- Agent entscheidet textuell.

## Nicht im Scope (Code-relevant)

- Kein Remote-Download von Zips.
- Keine Signatur-Verifikation.
- Keine Python-Runtime.
- Kein eigener Skill-Store / Registry.

## Verification / Definition of Done

- Build gruen (`npm run build`).
- Alle neuen Unit-Tests gruen.
- Alle 9 bundled-skills laden ohne Regression.
- Manueller Test: 1 Anthropic-Skill-Zip (z.B. `pdf.skill`) erfolgreich importiert und getriggert.
- Review-Bot: keine neuen Findings (`npm run lint:obsidian`).
- Security-Audit: Path-Traversal-Suite gruen.
