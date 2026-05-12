# Feature: Skill-Folder-Struktur (SKILL.md + Subfolders)

> **Feature ID**: FEAT-22-01
> **Epic**: EPIC-22 (Skill-Package Ecosystem)
> **Priority**: P0
> **Effort Estimate**: M
> **Note**: Released v2.6.0 (2026-04-19)

## Feature Description

Vault Operator akzeptiert Skills im Anthropic-Folder-Format: ein Skill ist ein Ordner mit
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
| SC-08 | Bestehende User-Skills unter `.obsilo-sync/skills/` werden einmalig nach `getAgentFolderPath()/skills/` migriert (Decision 2026-04-18) | 100% | Migrations-Test mit Fixture |
| SC-09 | Nach Migration bleibt ein Marker (`.migrated`) zurueck, damit die Migration nicht doppelt laeuft | 100% | Idempotenz-Test |

## Architektur-Hinweise

- Loader scannt `<skillDir>/*/SKILL.md` statt nur lose `.md`-Files.
- Pro Skill-Load wird zusaetzlich erkannt: `scripts/` (Liste von Filenames),
  `references/` (Liste), `assets/` (Liste). Metadata-Objekt bekommt drei
  neue Felder: `scripts: string[]`, `references: string[]`, `assets: string[]`.
- Validation-Schicht: `name` muss mit Ordner-Name matchen (Anthropic-Regel),
  Frontmatter-Parser nimmt zusaetzliche Felder an ohne zu erroren.
- **Skill-Pfad-Migration (Decision 2026-04-18):** Self-Authored-Skill-Dir wird
  `getAgentFolderPath()/skills/` (konfigurierbar via ADR-72) statt des
  hart verdrahteten `.obsilo-sync/skills/`. Beim Plugin-Start prueft ein
  einmaliger Migrations-Schritt: wenn Legacy-Dir existiert und Ziel-Dir
  leer ist, kopiert er die Skill-Ordner und schreibt einen
  `.migrated`-Marker in den Legacy-Ordner. Defensive Kopie (Original
  bleibt erhalten) analog zu FEAT-05-08 P2.

## Out of Scope

- Script-Ausfuehrung (FEAT-22-03)
- Zip-Import (FEAT-22-02)
- Coordinator-Pattern (FEAT-22-04)

## Verifikation

1. Build: `npm run build` passiert.
2. Unit-Tests fuer Loader mit Fixtures: single-file, mit references, mit scripts, mit assets, mit falschem name/dir, mit Anthropic-Fields.
3. Regression: bestehende Skills smoke-test.

## How It Works (post-implementation)

**Key files:**

- [src/core/skills/types.ts](../../../src/core/skills/types.ts): `SkillInventory`,
  `SkillScriptFile`, `SkillSubRole`, `SkillMigrationResult` Types (EPIC-22 block).
- [src/core/skills/SelfAuthoredSkillLoader.ts](../../../src/core/skills/SelfAuthoredSkillLoader.ts):
  - `SelfAuthoredSkill` extended with `inventory` und `isCoordinator`.
  - `loadSkillInventory()` scannt `scripts/`, `references/`, `assets/`,
    sowie `*.skill.md` Sub-Rollen fuer Coordinatoren.
  - `renderSkillSummary()` + `renderInventoryLines()` erweitern den
    System-Prompt um Inventory-Eintraege (Progressive Disclosure: nur
    Dateinamen, keine Inhalte).
  - Neue `refresh()` Methode fuer Import-Flows.
  - `getUserSkillsDir()` ersetzt `this.syncSkillsDir` -- loest dynamisch via
    `getSelfAuthoredSkillsDir(plugin)` auf, respektiert ADR-72.
- [src/core/skills/SkillMigration.ts](../../../src/core/skills/SkillMigration.ts):
  `migrateLegacySkillsIfNeeded()` kopiert `.obsilo-sync/skills/*` einmalig
  nach `getSelfAuthoredSkillsDir(plugin)`. Defensive Kopie, `.migrated`
  Marker fuer Idempotenz.
- [src/core/utils/agentFolder.ts](../../../src/core/utils/agentFolder.ts):
  neuer Helper `getSelfAuthoredSkillsDir(holder)` + Konstante
  `LEGACY_SELF_AUTHORED_SKILLS_DIR`.
- [src/main.ts](../../../src/main.ts): wiring: Migration laeuft vor erstem
  `loadAll()`.

**Tests:**

- [src/core/skills/__tests__/SkillMigration.test.ts](../../../src/core/skills/__tests__/SkillMigration.test.ts):
  6 Tests (null wenn Legacy-Dir fehlt, Kopie, Idempotenz via Marker,
  Skip bei existierendem Ziel, No-op wenn Source==Target, Recursive-Copy
  fuer scripts/).

**Open follow-ups:**

- Dedizierte Inventory-Tests mit Fixtures fuer `loadSkillInventory()` folgen
  mit FEAT-22-02 Integration-Tests (dort wird ein voll-strukturierter
  Skill-Ordner ohnehin entpackt und geladen).
- Anthropic-Frontmatter-Felder (license, compatibility, metadata) werden
  durch den permissiven `parseFrontmatter` bereits akzeptiert; SC-05 ist
  damit implizit erfuellt und braucht nur noch einen bestaetigenden
  Unit-Test, der in der FEAT-22-02-Test-Suite mitlaeuft.
