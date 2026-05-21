---
id: FEAT-29-02
title: Plugin-Skill-Format-Migration von File zu Folder/SKILL.md
epic: EPIC-29
priority: P0
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-01]
created: 2026-05-20
---

# Feature: Plugin-Skill-Format-Migration von File zu Folder/SKILL.md

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-02
> (status, phase, claim, last-change leben dort).

## Feature description

EPIC-22 hat das User-Skill-System auf Anthropic-konformes Folder-Layout umgestellt (`<agent-folder>/skills/{name}/SKILL.md`). Plugin-Skills hingegen sind unveraendert geblieben: 138 Files im File-Format `.obsilo-vault/plugin-skills/{plugin-id}.skill.md` (lowercase, file-basiert, nicht Anthropic-konform). Dieses Feature schliesst die Luecke. Plugin-Skills werden auf das gleiche Folder-Format migriert wie User-Skills: `.vault-operator/skills/plugin/{plugin-id}/SKILL.md`. Frontmatter wird strikt auf `name` und `description` reduziert, der Body wird aus dem alten `.skill.md`-Inhalt uebernommen, optional fuer prominente Plugins (Excalidraw, Dataview, Templater, Tasks, Kanban) wird `references/commands.md` mit einer detaillierten Command-Liste angelegt. Die Migration laeuft als einmaliger Pass nach FEAT-29-01-Foldermigration und ist idempotent.

## Benefits hypothesis

**Wir glauben dass** die Plugin-Skill-Migration auf Anthropic-konformes Folder-Layout
**folgende messbare Wirkung erzielt:**

- Alle Skills (Plugin, User, Builtin) folgen demselben Format
- Plugin-Skills sind portabel: ein einzelner Plugin-Skill kann nach Claude Code kopiert werden und funktioniert dort als Doku-Skill
- skill-creator und skill-translator (FEAT-29-05, FEAT-29-08) koennen auf einem einzigen Format aufsetzen

**Wir wissen dass wir erfolgreich sind, wenn:**

- 100% der installierten Plugins haben einen Plugin-Skill im neuen Folder-Format
- Migration-Report meldet 0 errors fuer alle 138 alten `.skill.md`-Files
- Frontmatter-Validator akzeptiert alle migrierten Skills ohne Warning

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will dass alle Skills gleich strukturiert sind | Story 1 |
| Emotional | User will Vertrauen dass ein Plugin-Skill nach Migration noch funktioniert | Story 2 |
| Social | User will einen Plugin-Skill aus dem Vault Operator teilen koennen, der von Claude Code akzeptiert wird | Story 3 |

## User stories

### Story 1: Einheitliches Skill-Format (Functional Job)

**Als** Power-User der heute Plugin-Skills (.skill.md) und User-Skills (Folder/SKILL.md) parallel verwaltet
**moechte ich** dass beide Subsysteme das gleiche Format nutzen,
**damit** ich Skill-Inhalte nicht je nach Subsystem unterschiedlich behandeln muss.

### Story 2: Erhaltung der Plugin-Skill-Funktionalitaet (Emotional Job)

**Als** User mit 138 Plugin-Skills in Benutzung
**moechte ich** dass nach Migration jeder Plugin-Skill exakt das gleiche Verhalten zeigt wie vorher (Command-Trigger, Routing-Hints),
**damit** ich nach dem Update nicht erstmal alles re-testen muss.

### Story 3: Portable Plugin-Skills (Social Job)

**Als** Mitglied der Anthropic-Skill-Community
**moechte ich** einen Plugin-Skill aus meinem Vault Operator nach Claude Code kopieren koennen,
**damit** der Skill dort wenigstens als Dokumentation funktioniert und ich ihn teilen kann.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Alle Plugin-Skills sind im Folder/SKILL.md-Format nach Migration | 100% Match mit installed-plugin-count | Filesystem-Count |
| SC-02 | Frontmatter strikt nach Anthropic-Spec: nur name und description | 138 von 138 Skills validieren ohne Warning | Validator-Report |
| SC-03 | Migration ist idempotent: zweiter Lauf erzeugt keine Aenderungen | Diff vor und nach zweitem Lauf ist leer | Diff-Check |
| SC-04 | Prominente Plugins (Top-5) bekommen references/commands.md mit kuratiertem Command-Katalog | 5 von 5 Top-Plugins haben references/ Sub-Folder | Filesystem-Inspection |
| SC-05 | Alter Pfad `.obsilo-vault/plugin-skills/` wird nach erfolgreicher Migration entfernt | Pfad existiert nicht oder ist leer | `ls`-Check |

---

## Technical NFRs

### Performance

- Migration aller 138 Plugin-Skills unter 30 Sekunden.
- Frontmatter-Validierung unter 5 ms pro Skill.

### Security

- Migration laesst Inhalt der `.skill.md`-Files unveraendert, nur Struktur und Frontmatter werden angepasst.
- Keine Code-Ausfuehrung waehrend Migration.
- Backup der alten `plugin-skills/` ist Teil von FEAT-29-01-Backup-Snapshot.

### Scalability

- Migration skaliert linear bis zu 1000 installierten Plugins (theoretischer Worst-Case).

### Availability

- Migration ist resumable, bei Abbruch koennen die migrierten Teile in einem zweiten Lauf vervollstaendigt werden (idempotent).

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Idempotenz der Migration

- Begruendung: Plugin-Reload kann Migration mid-flight triggern. Mehrfach-Lauf darf keine Korruption erzeugen.
- Impact: Migrations-Code-Pfad, Skill-Validator.
- Qualitaetsattribut: Data Integrity.

**MODERATE ASR #2:** Frontmatter-Schrumpfung

- Begruendung: heutige `.skill.md`-Files haben mehr Frontmatter-Felder (skillFile, etc.). Nach Migration darf nur noch `name` und `description` drin sein.
- Impact: SkillRegistry-Reader, Validator.
- Qualitaetsattribut: Format-Konformitaet, Portabilitaet.

### Constraints

- Bestehende EPIC-22-User-Skill-Code-Pfade muessen wiederverwendet werden, kein paralleles Subsystem.
- VaultDNAScanner wird angepasst, nicht ersetzt (das macht FEAT-29-03).

### Open questions for architect

- Wo liegen die kuratierten `references/commands.md` fuer Top-Plugins? Werden sie im Plugin-Bundle ausgeliefert oder erst beim Eager-Generate angelegt?
- Was passiert mit den heute existierenden `.readme.md`-Files neben den `.skill.md`-Files (138 plus 138 in plugin-skills/)? Werden sie nach `references/readme.md` migriert oder verworfen?
- Wie wird der Plugin-Skill-Pfad in SkillRegistry-Code umgestellt? Direkt im Konstruktor oder ueber Setter?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Migration-Funktion (Frontmatter-Reduktion, Folder-Anlage, Idempotenz)
- [ ] Smoke-Test mit 138 echten Plugin-Skills aus produktivem Vault
- [ ] Validator-Test: alle migrierten Skills validieren ohne Warning

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] CHANGELOG entry beschreibt Plugin-Skill-Format-Aenderung

---

## Hypothesis validation

Nicht anwendbar.

---

## Dependencies

- **FEAT-29-01 Folder-Konsolidierung**: Migration laeuft erst nachdem Folder-Pfad-Migration abgeschlossen ist.
- **EPIC-22 Skill-Folder-Struktur (FEAT-22-01)**: liefert das Folder/SKILL.md-Format das hier wiederverwendet wird.

## Assumptions

- Alle bestehenden `.skill.md`-Files haben einen parsbaren Frontmatter mit mindestens `name` Feld.
- VaultDNAScanner kann ohne Plugin-Restart auf das neue Layout umgestellt werden (Hot-Reload).

## Out of scope

- Live-Probe-Logik (FEAT-29-03).
- Discovery-Refactor von Polling auf Event-driven (FEAT-29-03).

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `plugin-skill-generation` (run `grep "plugin-skill" src/ARCHITECTURE.map` fuer Entry-Point).
