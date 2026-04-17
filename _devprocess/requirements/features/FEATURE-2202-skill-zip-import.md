# Feature: `.skill` Zip-Import

> **Feature ID**: FEATURE-2202
> **Epic**: EPIC-022 (Skill-Package Ecosystem)
> **Priority**: P0
> **Effort Estimate**: S
> **Status**: Geplant

## Feature Description

Neuer UI-Button in Settings → Skills Tab: **"Import skill package…"**. Der User
waehlt eine `.skill`-Datei (Zip-Archiv) oder eine `.zip` und Obsilo entpackt
den Inhalt nach `<agent-folder>/skills/<skill-name>/`. Anschliessend wird der
Loader refreshed und der Skill ist sofort verfuegbar.

Anthropic definiert `.skill` als De-facto-Extension (nicht formell
spec'd, aber vom `skill-creator` Tool produziert), und Claude.ai akzeptiert
Uploads via Settings. Wir uebernehmen diese Konvention.

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

## Architektur-Hinweise

- JSZip ist schon Dependency (fuer PPTX/DOCX). Kein neuer Package-Overhead.
- Entpack-Helper in `src/core/skills/SkillPackageImporter.ts`.
- Whitelist der erlaubten Pfade pro Entry; alles andere wird verworfen.
- Groessenlimit 100 MB entpackt (konfigurierbar).
- Confirm-Modal analog zu `AgentFolderPickerModal` → bestehendes Pattern.

## Out of Scope

- Automatische Download aus Remote-URLs (User lokal Zip waehlen)
- Signatur-Verifikation (nicht jetzt, spaeter als eigener Feature-Stream)
- Registry / Skill-Store UI

## Verifikation

1. Build + Tests
2. Unit-Tests: Whitelist-Filter, Path-Traversal-Reject, Size-Limit.
3. Live-Test: Zip aus Anthropic-Repo (z.B. `pdf.skill`) importieren und laden.
