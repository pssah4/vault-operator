---
id: FEAT-29-06
title: Sandbox-JS als First-Class-Skill-Pattern
epic: EPIC-29
priority: P1
effort: S
asr-refs: []
adr-refs: []
depends-on: []
created: 2026-05-20
---

# Feature: Sandbox-JS als First-Class-Skill-Pattern

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-06
> (status, phase, claim, last-change leben dort).

## Feature description

EPIC-22 hat bereits Sandbox-Aufrufe aus Skills heraus ermoeglicht (FEAT-22-03), aber heute wird das selten konsequent genutzt: von 8 User-Skills hat nur einer (`enbw-slides`) ein gefuelltes `scripts/`-Verzeichnis. Zudem laeuft die Sandbox-Logik heute ueber das `manage_skill`-Tool mit `code_modules` (TypeScript wird kompiliert und als `custom_*`-Tool registriert). Das blaeht die Tool-Registry auf und ist nicht Anthropic-konform. Dieses Feature ersetzt das `code_modules`-Pattern durch ein generisches `run_skill_script(skill_name, script_name, args)`-Tool. Skripte liegen im `scripts/`-Folder des Skills, werden on-demand in der Sandbox ausgefuehrt und tauchen nicht in der Tool-Registry auf. Damit ist das Anthropic-Pattern "scripts/ neben SKILL.md" voll umgesetzt. Plus: skill-creator und skill-translator generieren von sich aus Sandbox-Skripte fuer Use-Cases die mehr brauchen als reine Markdown-Anleitung (z.B. Newsletter-Aggregation, RSS-Parsing, externe HTTP-Calls).

## Benefits hypothesis

**Wir glauben dass** ein generisches run_skill_script-Tool statt code_modules
**folgende messbare Wirkung erzielt:**

- Tool-Registry bleibt schlank, kein custom_*-Sprawl
- Skripte sind portabel (jeder Skill traegt sie im scripts/-Folder)
- Anteil Skills die scripts/ nutzen steigt deutlich

**Wir wissen dass wir erfolgreich sind, wenn:**

- Anteil Skills mit scripts/-Folder steigt von 1 von 8 auf ueber 50% nach drei Monaten
- code_modules-Mechanismus und custom_*-Tool-Registrierung sind entfernt
- run_skill_script wird von skill-creator und skill-translator automatisch befuellt

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will Workflows mit deterministischen Schritten kodifizieren | Story 1 |
| Emotional | User will Sandbox-Code mitteilen ohne Tool-Registry-Magie verstehen zu muessen | Story 2 |
| Social | User will einen Skill teilen der vollstaendig in einem Folder liegt, kein verstreuter Code | Story 3 |

## User stories

### Story 1: Deterministische Schritte als Skript (Functional Job)

**Als** Power-User mit einem Workflow der mehrfach laeuft (z.B. taegliche Newsletter-Aggregation)
**moechte ich** dass die deterministischen Teile als JavaScript-Skript im Skill-Folder liegen und vom Agent aufgerufen werden,
**damit** der Agent nicht jedes Mal den Code halluzinieren muss.

### Story 2: Code im Skill, nicht in der Tool-Registry (Emotional Job)

**Als** User der einen Skill mit Code anschaut
**moechte ich** den Code als Datei im Skill-Folder sehen,
**damit** ich nicht raten muss wo das custom_xyz-Tool definiert ist und es als normale Datei editieren kann.

### Story 3: Portable Skill-Bundles (Social Job)

**Als** User der einen Skill kopiert oder weitergibt
**moechte ich** dass alles was er braucht im Folder liegt,
**damit** ein Empfaenger nur den Folder kopiert und alles funktioniert.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | run_skill_script-Tool laedt und fuehrt JavaScript aus dem scripts/-Folder aus | mindestens 5 verschiedene Skill-Skripte erfolgreich ausgefuehrt | Test |
| SC-02 | code_modules-Mechanismus ist entfernt | 0 Referenzen im Code | Code-Inspection |
| SC-03 | custom_*-Tools sind nicht mehr in der Tool-Registry | 0 custom_*-Eintraege | Tool-Registry-Inspection |
| SC-04 | Anteil User-Skills mit scripts/-Folder steigt | von 1 von 8 auf ueber 4 von 8 nach drei Monaten | Filesystem-Inspection |
| SC-05 | Skripte koennen externe Bibliotheken via CDN-Import nutzen | Mindestens 3 unterschiedliche npm-Pakete getestet | Test |

---

## Technical NFRs

### Performance

- Skript-Laden und Bundle-Erstellung unter 500 ms fuer Skripte unter 1000 Zeilen.
- Wiederholte Aufrufe nutzen Bundle-Cache, Latenz unter 50 ms ab dem zweiten Aufruf.

### Security

- Skripte laufen in der bestehenden Sandbox-Approval-Kette (kein Bypass).
- Keine direkten Filesystem-Zugriffe ausserhalb des Skill-Folders.
- HTTP-Calls laufen ueber die Sandbox-Bridge (laut Memory bereits implementiert).

### Scalability

- Mehrere parallele Skript-Aufrufe (z.B. von verschiedenen Skills) bleiben isoliert.

### Availability

- Bei Skript-Fehler klare Fehlermeldung an Agent, kein Plugin-Crash.
- Bei Sandbox-Hang Timeout nach 30 Sekunden (konfigurierbar).

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Generisches Skript-Tool statt Tool-Registry-Eintraege

- Begruendung: 50 oder 100 custom_*-Tools wuerden den Tool-Select-Prozess des Modells verlangsamen und den System-Prompt aufblaehen.
- Impact: run_skill_script-Tool wird neu, code_modules entfernt.
- Qualitaetsattribut: Token-Effizienz, Tool-Discovery-Klarheit.

**MODERATE ASR #2:** Bundle-Caching

- Begruendung: Wiederholte Aufrufe desselben Skripts sollten nicht jedes Mal das Bundle neu erstellen.
- Impact: Sandbox-Executor-Caching-Layer.
- Qualitaetsattribut: Performance.

### Constraints

- Sandbox-Executor (EsbuildWasmManager) bleibt unveraendert in Architektur, wird nur ueber run_skill_script aufgerufen.
- HTTP-Bridge bleibt limitiert auf erlaubte Hosts (siehe Memory: HTTP via Bridge).

### Open questions for architect

- Wo wird das Bundle gecacht? In-Memory pro Plugin-Session, oder persistent in `.vault-operator/runtime/bundle-cache/`?
- Wie wird die `args`-Parameter-Uebergabe an das Skript geregelt? JSON-Serialisierung mit Validation, oder positional args?
- Wie hat run_skill_script ein Return-Schema? Skript exportiert eine `execute(args)`-Funktion und das Return-Value wird JSON-serialisiert?
- Was passiert bei Skripten die existing custom_*-Tools heute haben (Migration-Pfad fuer Bestand)?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer run_skill_script (laden, executen, error-handling, timeout)
- [ ] Integrations-Test mit echtem Skill der CDN-Imports nutzt
- [ ] Migrations-Test: bestehende custom_*-Tools werden zu scripts/ migriert ohne Funktionsverlust

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] Skill-Creator-Skill (FEAT-29-05) zeigt run_skill_script-Patterns in Beispielen
- [ ] CHANGELOG entry beschreibt Removal von code_modules

---

## Hypothesis validation

Nicht anwendbar (validiert keine BA-Hypothese, technisches Refactor).

---

## Dependencies

- **EPIC-22 Sandbox-Scripts (FEAT-22-03)**: Sandbox-Executor ist Voraussetzung.

## Assumptions

- Sandbox-Executor (EsbuildWasmManager) kann beliebige ESM-Bundles laden, nicht nur via custom_*-Tool-Wrapper.
- Bestehende code_modules-Migration ist machbar in < 20 Aufwand-Items (klein).

## Out of scope

- Skript-Editor-UI im Plugin (User editiert im Filesystem oder via skill-creator).
- Skript-Debugging-Tooling.

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `sandbox-executor` und `run-skill-script` (Letzteres ist neu, wird in dieser Implementierung angelegt).
