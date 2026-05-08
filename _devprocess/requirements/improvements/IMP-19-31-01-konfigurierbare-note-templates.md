# IMP-19-31-01: User-konfigurierbare Note-Templates fuer Ingest-Skills

**Prioritaet:** P1 (Live-Test 2026-05-07: agent generiert Frontmatter ad-hoc, ignoriert User-Konventionen)
**Feature-Bezug:** FEAT-19-31 (Skill-Suite), EPIC-19
**Verwandt:** FEAT-19-27 (Auto-Trigger via Frontmatter-Property)

## Problem

Im Live-Test mit dem EnBW-Geschaeftsbericht hat das `/ingest-deep`-
Skill ein Frontmatter-Schema improvisiert (`title`, `type`,
`source-type`, `author`, `publisher`, ...) statt das im Vault
existierende `Quelle Template.md` zu nutzen
(`Tools & Settings/Templates/Quelle Template.md`). Folgen:

- Frontmatter-Konventionen werden gebrochen (`Kategorie: [Quelle]`
  fehlte -- Auto-Trigger FEAT-19-27 greift damit nicht).
- Inkonsistente Properties (DE-Felder wie `Autor` vs EN-Felder wie
  `author` mischen sich im Vault).
- User-Erwartung "wie bei meinen anderen Quellen" wird verletzt.

## Scope

User soll in den Settings drei Felder konfigurieren koennen:

1. `vaultIngest.templates.ingestNoteTemplate` (vault-relativer
   Pfad zu einer Markdown-Datei).
2. `vaultIngest.templates.ingestDeepNoteTemplate`.
3. `vaultIngest.templates.meetingSummaryTemplate`.

Jedes Skill liest beim Start den eingestellten Pfad, liest das File,
extrahiert das YAML-Frontmatter und nutzt es als Basis fuer die
generierte Note. Werte werden aus der Quelle gefuellt; das Schema
bleibt vom Template gesteuert.

Default-Templates werden mit dem Plugin gebuendelt
(`bundled-templates/notes/`) und auf Build-Time ins
`<plugin-folder>/note-templates/` deployed. Ein leerer Setting-Wert
faellt auf einen inline-Default in der Skill-Beschreibung zurueck
(damit auch ohne Vault-Datei funktioniert).

## Akzeptanzkriterien

| ID | Criterion | Status |
|---|---|---|
| AC-01 | VaultIngestSettings traegt das Feld `templates` mit drei String-Pfaden | done |
| AC-02 | DEFAULT_VAULT_INGEST_SETTINGS hat alle drei Pfade als leeren String | done |
| AC-03 | Settings-UI zeigt 3 Text-Inputs unter "Note templates for ingest skills" | done |
| AC-04 | bundled-templates/notes/quelle-template.md (DE) existiert | done |
| AC-05 | bundled-templates/notes/meeting-notiz-template.md (DE) existiert ohne Code-Block-Wrapper | done |
| AC-06 | esbuild embed-assets schreibt die Templates ins JSON | done |
| AC-07 | esbuild vault-deploy kopiert die Templates ins Plugin-Folder | done |
| AC-08 | Skill-Anleitungen `/ingest`, `/ingest-deep`, `/meeting-summary` lesen das Setting und fallen auf inline-Default zurueck | done |

## Out of Scope

- File-Picker-UI mit Vault-Autocomplete (bleibt Text-Input fuer
  jetzt; eigener IMP wenn Tippen zu fehleranfaellig wird).
- EN-Versionen der Templates fuer Public Release. Wird im Release-
  Prep durch ein separates IMP angegangen.
- Auto-Discovery von Templates im Vault (Scan nach `Templates/`-
  Folder mit Tag/Property-Matching).
- Template-Variablen-Engine (z.B. Templater-Compatibility). Wenn
  noetig: separates FEAT.

## Files

In diesem Inkrement angefasst:

- `src/types/settings.ts`: VaultIngestSettings.templates Schema +
  DEFAULT_VAULT_INGEST_SETTINGS Defaults.
- `bundled-templates/notes/quelle-template.md` (neu)
- `bundled-templates/notes/meeting-notiz-template.md` (neu)
- `esbuild.config.mjs`: embed-assets + vault-deploy fuer
  bundled-templates/notes/.
- `src/ui/settings/VaultTab.ts`: Settings-UI-Section "Note templates
  for ingest skills" mit 3 Text-Inputs.
- `bundled-skills/ingest/SKILL.md`, `bundled-skills/ingest-deep/SKILL.md`,
  `bundled-skills/meeting-summary/SKILL.md`: Step "Template lesen" als
  Pflicht-Vor-Schritt.

Build: 12 skills + 2 note templates embedded, vault-deploy ok,
1307/1307 Tests gruen.
