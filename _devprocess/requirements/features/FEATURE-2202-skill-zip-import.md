# Feature: Universal Skill-Import (.md / Folder / .skill-Zip)

> **Feature ID**: FEATURE-2202
> **Epic**: EPIC-022 (Skill-Package Ecosystem)
> **Priority**: P0
> **Effort Estimate**: S
> **Status**: Implemented (core) 2026-04-18

## Feature Description

**Decision 2026-04-18 (user):** Ein einziger Import-Button, der alle Skill-
Formate versteht und die Komplexitaet fuer den User abstrahiert. Der bestehende
Einzel-Markdown-Import-Button in [SkillsTab.ts:78](../../../src/ui/settings/SkillsTab.ts#L78)
wird durch den universellen Import ersetzt.

Der neue Button **"Import skill…"** akzeptiert drei Eingabeformen und routet
sie automatisch anhand von Dateityp und Inhalt:

1. **Einzelne `.md`-Datei** → bestehender Flow (Frontmatter parsen, als
   Single-File-Skill anlegen).
2. **Ordner mit `SKILL.md` + optional `scripts/`, `references/`, `assets/`**
   (Electron Native Directory-Picker) → rekursiv pruefen, Whitelist anwenden,
   nach `<agent-folder>/skills/<slug>/` kopieren.
3. **`.skill`- oder `.zip`-Datei** → JSZip-basiert entpacken mit Whitelist,
   Path-Traversal-Check, Size-Limit, dann nach `<agent-folder>/skills/<slug>/`.

Nach jedem erfolgreichen Import wird der `SelfAuthoredSkillLoader` refreshed
und der Skill erscheint sofort in der Liste. Bei Duplikaten zeigt ein Modal
die bekannten Optionen "Replace / Rename / Cancel".

Anthropic definiert `.skill` als De-facto-Extension (nicht formell
spec'd, aber vom `skill-creator` Tool produziert), und Claude.ai akzeptiert
Uploads via Settings. Wir uebernehmen diese Konvention plus Obsilo-eigene
Markdown-/Ordner-Pfade fuer Backward-Compat.

## User Stories

### Story 1: Skill aus Anthropic-Repo importieren
**Als** User
**moechte ich** einen Skill aus [anthropics/skills](https://github.com/anthropics/skills)
als Zip herunterladen und in Obsilo importieren
**um** Formatkonvertierungen wie `pdf`, `pptx`, `skill-creator` direkt zu nutzen.

### Story 2: Skill-Update
**Als** User
**moechte ich** eine neuere Version desselben Skills importieren und Obsilo
fragt: "Replace or keep both?"
**um** nicht versehentlich meine Anpassungen zu verlieren.

### Story 3: Fehler-Toleranz
**Als** User
**moechte ich** dass beschaedigte Zips nicht mein Plugin crashen
**um** vertrauensvoll auch unbekannte Skill-Quellen probieren zu koennen.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | `.skill` Zip wird korrekt nach `<agent-folder>/skills/<slug>/` entpackt | 100% | Manueller Test |
| SC-02 | Nur whitelisted Unterordner (SKILL.md, scripts/, references/, assets/) werden entpackt | 100% | Security-Test mit Zip das extra files enthaelt |
| SC-03 | Path-Traversal (`../../`) wird abgelehnt | 100% | Security-Test mit malicious Zip |
| SC-04 | Zip-Bomben (> 100 MB entpackt) werden abgelehnt | 100% | Size-Limit-Test |
| SC-05 | Existierender Skill bei Import wird mit Confirm-Modal ersetzt oder umbenannt (User-Wahl) | 100% | UI-Test |
| SC-06 | Nach Import refreshed der Loader, Skill erscheint in Skill-Liste | 100% | Live-Test |
| SC-07 | Korrupter Zip gibt klare Fehlermeldung, crash nicht das Plugin | 100% | Fuzz-Test |
| SC-08 | Einzelne `.md`-Datei wird als Single-File-Skill importiert (Backward-Compat) | 100% | UI-Test |
| SC-09 | Ordner (Electron Directory-Picker) mit SKILL.md wird als Folder-Skill importiert | 100% | UI-Test |
| SC-10 | Import-Routing erkennt Typ automatisch, kein zweiter Button, keine Format-Nachfrage | 100% | UX-Review |

## Architektur-Hinweise

- JSZip ist schon Dependency (fuer PPTX/DOCX). Kein neuer Package-Overhead.
- Entpack-Helper in `src/core/skills/SkillPackageImporter.ts`.
- Whitelist der erlaubten Pfade pro Entry; alles andere wird verworfen.
- Groessenlimit 100 MB entpackt (konfigurierbar).
- Confirm-Modal analog zu `AgentFolderPickerModal` → bestehendes Pattern.
- **Universal-Import-Router** ([src/core/skills/SkillImportRouter.ts](../../../src/core/skills/SkillImportRouter.ts)):
  nimmt `File`-Objekt oder Directory-Path, erkennt Typ (Single-MD / Folder /
  Zip), ruft den passenden Sub-Importer auf. UI zeigt Notice je nach
  erkanntem Typ ("Imported single-file skill" / "Imported skill folder
  with 3 scripts" / "Imported skill package from zip, 5 files").
- **Directory-Picker:** Electron hat via `dialog.showOpenDialog` native
  Directory-Selection (siehe [AgentFolderPickerModal](../../../src/ui/settings/AgentFolderPickerModal.ts)
  Pattern). Der Button oeffnet einen kombinierten Picker (File+Directory)
  oder zeigt zwei Menu-Eintraege unter einem Dropdown-Button.

## Out of Scope

- Automatische Download aus Remote-URLs (User lokal Zip waehlen)
- Signatur-Verifikation (nicht jetzt, spaeter als eigener Feature-Stream)
- Registry / Skill-Store UI

## Verifikation

1. Build + Tests
2. Unit-Tests: Whitelist-Filter, Path-Traversal-Reject, Size-Limit.
3. Live-Test: Zip aus Anthropic-Repo (z.B. `pdf.skill`) importieren und laden.

## How It Works (post-implementation)

**Key files:**

- [src/core/skills/SkillPackageImporter.ts](../../../src/core/skills/SkillPackageImporter.ts):
  JSZip-basiertes Entpacken mit Whitelist
  (`SKILL.md`, `scripts/*`, `references/*`, `assets/*`, `*.skill.md`),
  Path-Traversal-Reject auf Raw-Entries, 100 MB Zip-Bomb-Limit,
  Duplikat-Erkennung mit Opt-in `overwrite`. Unterstuetzt zwei Layouts:
  Top-Dir-basiert (`pdf/SKILL.md`) und Root-basiert (`SKILL.md` am Root)
  mit Fallback-Slug aus dem Dateinamen.
- [src/core/skills/SkillFolderImporter.ts](../../../src/core/skills/SkillFolderImporter.ts):
  Rekursives Lesen via Node `fs/promises`, gleiche Whitelist + Size-Limit,
  Symlinks werden ignoriert. Ziel: Obsidian-Vault-Adapter.
- [src/core/skills/SkillImportRouter.ts](../../../src/core/skills/SkillImportRouter.ts):
  `importSkill()` dispatched auf Markdown / Zip / Folder,
  `detectSourceFromFile()` erkennt anhand Dateiendung (.md -> markdown,
  .zip/.skill -> zip, alles andere -> markdown fallback).
- [src/ui/settings/SkillsTab.ts](../../../src/ui/settings/SkillsTab.ts):
  bestehender Markdown-Import-Button ersetzt durch universellen
  Import-Button. Nutzt Electron `showOpenDialog` mit
  `properties: ['openFile', 'openDirectory']` fuer den native Picker,
  faellt auf HTML file input zurueck wenn kein Electron-Dialog verfuegbar.
  Loader `refresh()` wird nach jedem Import getriggert.

**Tests:**

- [SkillPackageImporter.test.ts](../../../src/core/skills/__tests__/SkillPackageImporter.test.ts):
  9 Tests (whitelist, path-traversal, zip-bomb, NO_SKILL_MD, DESTINATION_EXISTS,
  overwrite, root-based layout, absolute path reject, unknown file skip).
- [SkillImportRouter.test.ts](../../../src/core/skills/__tests__/SkillImportRouter.test.ts):
  9 Tests (detect-by-extension inkl. case-insensitive, markdown-file import,
  frontmatter-name wins over filename, fallback to filename,
  DESTINATION_EXISTS, zip-dispatch).

**Open follow-ups:**

- Duplikat-Modal (Replace / Rename / Cancel) ist noch nicht implementiert.
  Aktuell: Duplikat -> Notice + Abbruch. Modal folgt sobald BRAT-Feedback
  zeigt, dass der Flow wirklich gebraucht wird.
- Integration-Tests mit einem echten Anthropic-Skill-Zip (pdf.skill)
  kommen als manueller Live-Test beim v2.6.0-beta.1 Release-Gate.
