---
id: FEAT-29-10
title: Composability - Skill-to-Skill und Skill-to-MCP-Aufrufe
epic: EPIC-29
priority: P1
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-03, FEAT-29-06]
created: 2026-05-20
---

# Feature: Composability - Skill-to-Skill und Skill-to-MCP-Aufrufe

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-10
> (status, phase, claim, last-change leben dort).

## Feature description

EPIC-22 hat das Coordinator-Skill-Pattern angelegt (FEAT-22-04), das einen Skill anderen Skills delegieren laesst. Heute ist die Composability aber unterdokumentiert und nicht systematisch genutzt. MCP-Server-Aufrufe sind ein separater Tool-Pfad und nicht aus Skills heraus orchestrierbar. Dieses Feature macht Composability zu einem expliziten First-Class-Konzept. Skill-to-Skill: ein Skill-Body kann via einer klaren Syntax ("benutze den `meeting-summary`-Skill mit diesen Inputs") einen anderen Skill aufrufen. Der Modell-Workflow folgt der Anweisung und startet den Sub-Skill in einem internen Kontext-Frame. Skill-to-MCP: ein Skill-Body kann analog auf einen registrierten MCP-Server zugreifen, der Aufruf laeuft durch die bestehende MCP-Approval-Kette und das Ergebnis wird dem Caller-Skill zurueckgegeben. Beide Pfade haben Schutz vor unendlicher Rekursion: Max-Depth-Limit von 5 Ebenen, Cycle-Detection ueber Aufruf-Stack.

## Benefits hypothesis

**Wir glauben dass** explizite Skill-zu-Skill und Skill-zu-MCP-Komposition
**folgende messbare Wirkung erzielt:**

- Skills bleiben fokussiert (Single-Responsibility), komplexere Workflows kombinieren mehrere Skills
- MCP-Server-Faehigkeiten werden in Skill-Workflows nutzbar
- Anzahl monolithischer Mega-Skills sinkt zugunsten komponierbarer kleiner Skills

**Wir wissen dass wir erfolgreich sind, wenn:**

- Mindestens 20% der User-Skills nutzen Composability nach 3 Monaten
- Skill-to-MCP wird in mindestens 5 verschiedenen User-Workflows genutzt
- Cycle-Detection greift bei synthetischem Loop-Test bei Ebene 6

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will einen Skill als Baustein in einem groesseren Workflow nutzen | Story 1 |
| Emotional | User will sich nicht zwischen "alles in einem Skill" oder "alles im Agent-Loop" entscheiden muessen | Story 2 |
| Social | User will Skills komponieren wie ein professioneller Build-Engineer Bibliotheken kombiniert | Story 3 |

## User stories

### Story 1: Sub-Skill aus Skill heraus aufrufen (Functional Job)

**Als** Power-User mit einem komplexen Workflow ("Wochenreport erstellen")
**moechte ich** dass mein Skill die Bausteine "meeting-summary", "ingest-deep" und "management-briefing" als Sub-Skills nutzt,
**damit** ich nicht jeden Schritt erneut in jedem Skill schreibe.

### Story 2: MCP-Server aus Skill heraus aufrufen (Emotional Job)

**Als** User mit einem MCP-Server fuer externe Daten (z.B. Notion, Linear)
**moechte ich** dass ein Skill diese Daten direkt holt ohne Workaround,
**damit** ich nicht zwei separate Tool-Aufrufe orchestrieren muss.

### Story 3: Komponierbare Skill-Bibliothek (Social Job)

**Als** Mitglied der Vault-Operator-Community
**moechte ich** kleine, fokussierte Skills teilen die sich gut komponieren lassen,
**damit** andere User sie als Bausteine in ihren Workflows nutzen koennen.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Skill-zu-Skill-Aufruf funktioniert ueber mindestens 2 Ebenen | Skill A ruft Skill B ruft Skill C erfolgreich | Test |
| SC-02 | Cycle-Detection greift bei Ebene 6 | klare Fehlermeldung, kein Hang | Test mit synthetischem Loop |
| SC-03 | Skill-zu-MCP-Aufruf laeuft durch bestehende Approval-Kette | Kein Bypass moeglich | Audit-Test |
| SC-04 | Max-Depth-Limit konfigurierbar pro Setting (Default 5) | Setting wird respektiert | Settings-Test |
| SC-05 | Anteil User-Skills mit Composability steigt | mindestens 20% nach 3 Monaten | Filesystem-Inspection |

---

## Technical NFRs

### Performance

- Sub-Skill-Aufruf-Overhead unter 100 ms (Kontext-Frame-Setup).
- MCP-Aufruf-Overhead minimal (existing MCP-Code-Pfad wird genutzt).

### Security

- MCP-Approval-Kette ist nicht umgehbar.
- Skill-zu-Skill teilt nicht automatisch sensitive State zwischen Skills (jeder Sub-Skill bekommt nur explizit uebergebene Inputs).
- Audit-Log pro Sub-Skill-Aufruf.

### Scalability

- Bis zu 5 Ebenen Tiefe ohne Performance-Probleme.
- Bis zu 10 parallele Sub-Skill-Aufrufe (in unterschiedlichen Threads).

### Availability

- Bei Sub-Skill-Crash: Parent-Skill bekommt Error-Result, kann reagieren.
- Bei Cycle-Detection-Hit: klarer Error mit Aufruf-Stack im Result.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Cycle-Detection und Max-Depth-Limit

- Begruendung: Verhindert unendliche Rekursion oder Loops, die das Plugin zum Stillstand bringen wuerden.
- Impact: Skill-Aufruf-Stack-Tracking, Max-Depth-Setting.
- Qualitaetsattribut: Reliability, Safety.

**CRITICAL ASR #2:** MCP-Approval-Kette nicht umgehbar

- Begruendung: User darf nicht von einem Skill-Aufruf ueberrumpelt werden, sondern muss MCP-Aufrufe wie heute approven.
- Impact: MCP-Bridge aus Skill liest dieselbe Approval-Logik wie direkte MCP-Aufrufe.
- Qualitaetsattribut: Security, User Control.

**MODERATE ASR #3:** Kontext-Isolation pro Sub-Skill

- Begruendung: Sub-Skill soll nicht aus dem Parent-Kontext volle Information bekommen, nur explizite Inputs.
- Impact: Sub-Skill-Kontext-Frame-Mechanismus.
- Qualitaetsattribut: Security, Token-Efficiency.

### Constraints

- Skill-zu-Skill-Aufruf-Syntax muss in der SKILL.md-Markdown verstaendlich sein (kein neuer DSL).
- MCP-Server-State bleibt Server-seitig (keine zwischengespeicherte Auth-Token im Skill).

### Open questions for architect

- Welche Syntax fuer Sub-Skill-Aufruf in SKILL.md? "Use the `meeting-summary` skill with input X" als Prosa, oder ein klar parsbares Pattern?
- Wie wird der Sub-Skill-Kontext-Frame technisch umgesetzt? Subtask via spawnSubtask, oder Inline-Run mit eigenem Message-Buffer?
- Wie werden Sub-Skill-Ergebnisse an Parent zurueckgegeben? Strukturiertes Result-Schema oder freie Antwort?
- Wie wird MCP-Aufruf aus Skill triggered? Spezielles Tool oder durch Naming-Convention?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Cycle-Detection (synthetischer Loop, klare Fehlermeldung)
- [ ] Unit-Tests fuer Max-Depth-Limit
- [ ] Integrations-Test: Skill ruft Skill ruft Skill erfolgreich durch
- [ ] Integrations-Test: Skill ruft MCP-Server, Approval-Kette greift

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] Composability-Patterns dokumentiert (Beispiele in skill-creator-References)
- [ ] CHANGELOG entry erklaert neue Composability-Faehigkeiten

---

## Hypothesis validation

| Hypothese | Test-Methode | Erfolgs-Kriterium | Resultat |
|---|---|---|---|
| H-06: Skill-zu-Skill und Skill-zu-MCP wird vom Modell zuverlaessig orchestriert ohne Loops | Test mit synthetischem Workflow ueber 3 Ebenen, plus Loop-Detection-Test | Erfolgreiche Orchestrierung in 3-Ebenen-Setup, Loop wird bei Ebene 6 abgebrochen | Open |

---

## Dependencies

- **FEAT-29-03 Unified Discovery**: probe_plugin und Discovery sind Voraussetzung fuer Skill-zu-Plugin-Calls.
- **FEAT-29-06 Sandbox-JS-First-Class**: Sub-Skill-Skripte laufen ueber run_skill_script.
- **EPIC-22 Coordinator-Skill (FEAT-22-04)**: Architektur-Vorbild fuer Skill-zu-Skill.
- **MCP-Client (EPIC-04)**: Bestehende MCP-Code-Pfade werden wiederverwendet.

## Assumptions

- Bestehende MCP-Approval-Kette ist robust und nicht umgehbar.
- Modell kann verstehen wann es einen Sub-Skill aufrufen soll vs. wenn es selbst handeln soll.

## Out of scope

- Visueller Workflow-Builder (das ist EPIC-31).
- Parallel-Execution mehrerer Sub-Skills in einem Aufruf (sequenziell ist Default).

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `skill-composability` (neu) und `mcp-client` (existing).
