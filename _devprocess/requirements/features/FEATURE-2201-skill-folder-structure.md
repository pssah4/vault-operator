# Feature: Skill-Folder-Struktur (SKILL.md + Subfolders)

> **Feature ID**: FEATURE-2201
> **Epic**: EPIC-022 (Skill-Package Ecosystem)
> **Priority**: P0
> **Effort Estimate**: M
> **Status**: Geplant

## Feature Description

Obsilo akzeptiert Skills im Anthropic-Folder-Format: ein Skill ist ein Ordner mit
`SKILL.md` und optionalen Unterordnern `scripts/`, `references/`, `assets/`.
Der bestehende `SelfAuthoredSkillLoader` wird so erweitert, dass er diese
Sub-Strukturen wahrnimmt und fuer andere Tools (Sandbox, `read_file`)
auffindbar macht. Single-File-Skills (nur `SKILL.md` ohne Subfolders) bleiben
weiter gueltig — alles additiv, keine Breaking Changes.

## User Stories

### Story 1: Skill mit Referenz-Dokument
**Als** Skill-Autor
**moechte ich** einen langen Referenz-Text in eine separate `references/GUIDE.md`
auslagern
**um** den `SKILL.md` Haupt-Text (der in das Prompt-Metadata geladen wird)
schlank zu halten und Tokens zu sparen.

### Story 2: Skill mit Templates
**Als** Skill-Autor
**moechte ich** JSON-Schema-Templates oder Mermaid-Beispiele in `assets/`
ablegen
**um** sie per `read_file` zu referenzieren statt inline im Skill-Markdown.

### Story 3: Anthropic-Skill ohne Umbau
**Als** User
**moechte ich** einen Anthropic-Skill (z.B. aus [anthropics/skills](https://github.com/anthropics/skills))
in meinen `<agent-folder>/skills/` Ordner kopieren und er funktioniert ohne
Aenderung des Inhalts.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Skill-Ordner mit `SKILL.md` + `references/` wird korrekt geladen | 100% | Unit-Test mit Fixture |
| SC-02 | `references/*.md` erscheinen NICHT im System-Prompt, koennen aber per `read_file` gelesen werden | 100% | Agent-Prompt-Check + Read-Test |
| SC-03 | `scripts/*.py` erscheinen im Skill-Metadata als verfuegbare Script-Pfade | 100% | Schema-Inspection |
| SC-04 | `assets/*` werden als statische Resourcen gelistet | 100% | Loader-Test |
| SC-05 | Anthropic-Frontmatter-Felder (`license`, `compatibility`, `metadata`) werden geparst, ignorieren aber nicht obsilos eigene Felder (`trigger`, `requiredTools`) | 100% | Unit-Test |
| SC-06 | Alle 9 bestehenden Bundled-Skills laden weiter ohne Migration | 100% | Regression-Test |
| SC-07 | Skill-Ordner ohne `SKILL.md` wird mit klarer Fehlermeldung abgelehnt | 100% | Unit-Test |

## Architektur-Hinweise

- Loader scannt `<skillDir>/*/SKILL.md` statt nur lose `.md`-Files.
- Pro Skill-Load wird zusaetzlich erkannt: `scripts/` (Liste von Filenames),
  `references/` (Liste), `assets/` (Liste). Metadata-Objekt bekommt drei
  neue Felder: `scripts: string[]`, `references: string[]`, `assets: string[]`.
- Validation-Schicht: `name` muss mit Ordner-Name matchen (Anthropic-Regel),
  Frontmatter-Parser nimmt zusaetzliche Felder an ohne zu erroren.

## Out of Scope

- Script-Ausfuehrung (FEATURE-2203)
- Zip-Import (FEATURE-2202)
- Coordinator-Pattern (FEATURE-2204)

## Verifikation

1. Build: `npm run build` passiert.
2. Unit-Tests fuer Loader mit Fixtures: single-file, mit references, mit scripts, mit assets, mit falschem name/dir, mit Anthropic-Fields.
3. Regression: bestehende Skills smoke-test.
