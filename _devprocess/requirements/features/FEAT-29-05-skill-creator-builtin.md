---
id: FEAT-29-05
title: Skill-Creator-Builtin-Skill
epic: EPIC-29
priority: P1
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-02, FEAT-29-06]
created: 2026-05-20
---

# Feature: Skill-Creator-Builtin-Skill

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-05
> (status, phase, claim, last-change leben dort).

## Feature description

Heute existiert ein `manage_skill`-Tool das Skills via Tool-Aufruf erstellt, updated, gelescht und kompiliert. Das ist nicht Anthropic-konform und macht den Skill-Erstellungs-Prozess zu einem schwarzen Kasten. Anthropic selbst liefert einen `skill-creator` als Skill aus (`SKILL.md` mit 6-Schritt-Workflow plus `init_skill.py` und `package_skill.py` als Helper). Dieses Feature traegt das Pattern auf den Vault Operator: ein neuer Builtin-Skill `skill-creator` liegt unter `.vault-operator/skills/builtin/skill-creator/SKILL.md`, mit JS-Helper-Scripts statt Python. Body fuehrt durch den 6-Schritt-Erstellungs-Prozess: Verstehen, Planen, Initialisieren, Editieren, Validieren, Iterieren. Helper-Scripts werden ueber den `run_skill_script`-Mechanismus aus FEAT-29-06 gestartet. Der `manage_skill`-Tool wird komplett entfernt, alle CRUD-Operationen passieren ueber existierende File-Tools (write_file, read_file) plus den skill-creator-Skill. Frontmatter-Validierung passiert im Discovery-Layer (SkillRegistry rejected non-konforme Skills mit klarer Fehlermeldung).

## Benefits hypothesis

**Wir glauben dass** ein skill-creator als Builtin-Skill statt manage_skill-Tool
**folgende messbare Wirkung erzielt:**

- Skill-Erstellung folgt Anthropic-Standards und ist portabel
- User kann den Erstellungs-Workflow editieren ohne Code-Deploy
- Tool-Registry bleibt schlank, kein CRUD-Tool-Overhead

**Wir wissen dass wir erfolgreich sind, wenn:**

- skill-creator wird vom Modell zuverlaessig bei "create skill"-aehnlichen Anfragen getriggert
- Alle neu erstellten Skills validieren ohne Warning
- manage_skill-Tool ist aus dem Code entfernt, kein Aufruf mehr im System-Prompt

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will einen Skill fuer seinen wiederholbaren Use-Case erzeugen | Story 1 |
| Emotional | User will sich nicht durch ein technisches Tool-Schema quaelen | Story 2 |
| Social | User will einen Skill teilen koennen der dem Community-Standard entspricht | Story 3 |

## User stories

### Story 1: Skill aus Konversation erzeugen (Functional Job)

**Als** Power-User mit einem wiederholbaren Workflow (z.B. Wochen-Review, Meeting-Summary)
**moechte ich** den Agent bitten "Bau mir einen Skill der das macht",
**damit** der Agent mich durch die Definition fuehrt und einen funktionierenden Skill speichert.

### Story 2: Interaktiver Dialog statt Tool-Schema (Emotional Job)

**Als** User der nicht weiss was alles in einen Skill gehoert
**moechte ich** dass der Agent mich Schritt fuer Schritt fragt was der Skill tun soll,
**damit** ich nicht ein leeres SKILL.md-Template fuellen muss.

### Story 3: Portabler Skill (Social Job)

**Als** Mitglied der Anthropic-Skill-Community
**moechte ich** einen vom Vault Operator erzeugten Skill als Anthropic-konformen Folder bekommen,
**damit** ich ihn nach Claude Code oder claude.ai kopieren und dort als Doku-Skill nutzen kann.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | skill-creator wird vom Modell bei "create skill"-Prompts getriggert | mindestens 90% Adoption ueber 10 Test-Prompts | Manuelle Verifikation |
| SC-02 | Generierte Skills folgen dem Anthropic-Standard (Folder, SKILL.md uppercase, Frontmatter strikt) | 100% validieren ohne Warning | Validator-Report |
| SC-03 | Erstellungs-Dialog ist multi-turn und iterativ | mindestens 3 Interaktions-Runden bei nicht-trivialen Skills | Manuelles Review |
| SC-04 | Erstellter Skill funktioniert bei erstem Trigger ohne Edit | 80% der erzeugten Skills laufen direkt | Test mit 5 verschiedenen Use-Cases |
| SC-05 | manage_skill-Tool ist entfernt und nicht mehr im System-Prompt aufgefuehrt | 0 Referenzen im Code | Code-Inspection |

---

## Technical NFRs

### Performance

- Validator-Lauf unter 100 ms pro Skill.
- Init-Helper-Script (Folder-Anlage) unter 200 ms.

### Security

- Erstellter Skill wird in `.vault-operator/skills/user/` geschrieben, nicht in `plugin/` oder `builtin/`.
- Skill-Body und Skripte werden vor Schreiben validiert (keine eval, kein direkter Filesystem-Bypass).

### Scalability

- Vault mit bis zu 200 User-Skills bleibt performant.

### Availability

- Bei Validator-Fehler wird der Skill nicht geschrieben, Fehlerbericht an User.
- Bei Speicher-Fehler (Disk-Full, Permission) klarer Fehlerhinweis statt Halb-Schreiben.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Skill statt Tool fuer Erstellung

- Begruendung: Multi-Turn-Workflow mit Modell-Interpretation. Tool waere unnoetig restriktiv und nicht portabel.
- Impact: manage_skill-Tool wird entfernt, skill-creator-Skill wird Builtin.
- Qualitaetsattribut: Portabilitaet, Modell-Freiheit.

**CRITICAL ASR #2:** Validator als Discovery-Layer

- Begruendung: Validation muss auch fuer manuell erstellte oder importierte Skills greifen, nicht nur fuer skill-creator-Output.
- Impact: SkillRegistry erweitert sich um Validation-Pass beim Laden.
- Qualitaetsattribut: Konsistenz, Format-Enforcement.

**MODERATE ASR #3:** TaskRouter-Eskalation auf Flagship

- Begruendung: Skill-Erstellung erfordert komplexes Modell-Verstaendnis und Code-Generation, profitiert stark vom Frontier-Modell.
- Impact: TaskRouter bekommt Regex-Regel fuer "create skill"-Prompts plus optional Skill-Description-basiertes Routing.
- Qualitaetsattribut: Quality of generated artifacts.

### Constraints

- Frontmatter strikt nach Anthropic-Spec: nur `name` und `description` werden geschrieben (folgt Anthropics canonical skill-creator).
- Validator akzeptiert beim Lesen auch bekannte Optional-Felder (`model`, `allowed-tools`, `license`) als Warning-only.
- Reserved words `anthropic` und `claude` sind im `name`-Feld verboten.

### Open questions for architect

- Soll der skill-creator-Skill als gitignored Builtin im Plugin-Bundle ausgeliefert werden, oder beim ersten Start in `.vault-operator/skills/builtin/` extrahiert?
- Welche Routing-Override-Mechanik fuer Flagship: Regex im TaskRouter, oder Embedding-Match auf Skill-Description?
- Wie wird der Edit-Button im SkillsTab umgesetzt: oeffnet er das Skill-Folder im Filesystem-Browser, oder zeigt eine In-Plugin Folder-Navigation? (Verwandt mit FEAT-29-11)

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer init_skill.js und validate_skill.js
- [ ] Integrations-Test: skill-creator wird von einem Modell-Run durchlaufen und liefert validierten Skill
- [ ] Routing-Test: "create skill"-Prompt triggert Flagship-Eskalation

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] CHANGELOG entry erklaert Removal von manage_skill und neuen skill-creator-Skill

---

## Hypothesis validation

| Hypothese | Test-Methode | Erfolgs-Kriterium | Resultat |
|---|---|---|---|
| H-04: Builtin-skill-creator-Skill wird zuverlaessig getriggert | 10 Test-Prompts mit unterschiedlichen Formulierungen ("bau einen skill", "neuer workflow", "kannst du das automatisieren") | mindestens 90% Skill-Trigger | Open |

---

## Dependencies

- **FEAT-29-02 Plugin-Skill-Format-Migration**: skill-creator schreibt im selben Format.
- **FEAT-29-06 Sandbox-JS-First-Class**: Helper-Scripts laufen via run_skill_script.
- **EPIC-26 Advisor-Pattern**: Tier-Klassifikator wird um Skill-getriggerte Eskalation erweitert.

## Assumptions

- Frontier-Modell ist via Routing-Override aktivierbar, ohne dass der User explizit Modell waehlen muss.
- Sandbox kann JavaScript-Helper-Scripts ausfuehren (laut Memory: yes).

## Out of scope

- Versionierung der Skills (FEAT-29-09).
- Composability (FEAT-29-10).
- Skill-Translator (FEAT-29-08).

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `skill-authoring` und `task-router` (run `grep "skill-authoring" src/ARCHITECTURE.map` fuer Entry-Point).
