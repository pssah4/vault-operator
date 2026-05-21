---
id: FEAT-29-04
title: Execution Visibility durch Notice-Capture
epic: EPIC-29
priority: P0
effort: S
asr-refs: []
adr-refs: []
depends-on: []
created: 2026-05-20
---

# Feature: Execution Visibility durch Notice-Capture

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-04
> (status, phase, claim, last-change leben dort).

## Feature description

Heute ruft `execute_command(command_id)` die Obsidian-API `app.commands.executeCommandById(id)` direkt auf. Die Methode liefert nur `true`/`false` zurueck, was angibt ob das Command **gefunden** wurde, nicht ob es **erfolgreich** ausgefuehrt wurde. Ein Command das intern wirft, ein Modal das nie schliesst, ein "kein aktiver Editor"-Fehler bleibt fuer den Agent unsichtbar. Er bekommt Success-Confirm und glaubt es lief. Dieses Feature aendert das: waehrend einer execute_command-Ausfuehrung wird der Obsidian-Notice-Mechanismus (window.Notice) gepatcht, um alle waehrend dieser Ausfuehrung erzeugten Notices zu sammeln. Diese Notices werden als Teil des tool_result an den Agent zurueckgegeben, zusammen mit dem gefangenen Error (falls vorhanden). Damit hat der Agent ein realistisches Bild davon, ob ein Command tatsaechlich gewirkt hat oder still gescheitert ist.

## Benefits hypothesis

**Wir glauben dass** Notice-Capture um execute_command
**folgende messbare Wirkung erzielt:**

- Anteil silent failures bei Plugin-Command-Aufrufen sinkt drastisch
- Agent kann auf Notice-Inhalt reagieren (Retry, alternative Strategie, Klarstellung beim User)
- Debug-Erfahrung des Users wird drastisch verbessert

**Wir wissen dass wir erfolgreich sind, wenn:**

- 95% der Command-Failure-Modi (Modal-Open, kein Editor, Plugin-Internal-Error) werden im tool_result sichtbar
- Agent reagiert in Tests selbststaendig auf Notice-Inhalt
- Notice-Capture-Patch verursacht keine Regressionen in anderen Plugins

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | Agent will wissen ob ein Command erfolgreich war | Story 1 |
| Emotional | User will Vertrauen dass "erledigt" wirklich bedeutet "erledigt" | Story 2 |
| Social | User will Probleme dem Support oder Forum reproduzierbar melden koennen | Story 3 |

## User stories

### Story 1: Erfolg vs Fehlschlag unterscheiden (Functional Job)

**Als** Agent der einen Plugin-Command ausfuehrt
**moechte ich** im tool_result sehen ob der Command Notices ausgeloest hat (Success, Warning, Error),
**damit** ich entscheiden kann ob ich weitermachen kann oder den User um Klarstellung bitten muss.

### Story 2: Realistisches Feedback (Emotional Job)

**Als** User der einen Plugin-Workflow via Agent triggert
**moechte ich** dass der Agent ehrlich sagt "Ich konnte das nicht erfolgreich ausfuehren" statt "Erledigt" wenn nichts passiert ist,
**damit** ich nicht spaeter feststelle, dass die Aktion gar nicht stattgefunden hat.

### Story 3: Reproduzierbare Fehlerberichte (Social Job)

**Als** User der einen Bug in einer Plugin-Integration meldet
**moechte ich** die Notice-Texte im Chat-Verlauf sehen,
**damit** ich dem Plugin-Entwickler oder Vault-Operator-Issue eine konkrete Fehlermeldung weitergeben kann.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Notice-Capture deckt Command-Failure-Modi auf | mindestens 95% der bekannten Failure-Modi | Manueller Test mit 20 Command-Szenarien |
| SC-02 | Capture-Patch wirkt nur waehrend execute_command-Ausfuehrung | Vor und nach execute_command verhalten sich Notices normal | Test mit nebenher laufendem Plugin |
| SC-03 | tool_result enthaelt Notice-Messages strukturiert (nicht in einem freitext-Blob) | Schema: notices: string[], error?: string | Schema-Validierung |
| SC-04 | Capture funktioniert auch wenn Plugin eigene Notice-Override hat | Fail-soft mit Log-Warnung, kein Plugin-Crash | Test mit Plugin das Notice ueberschreibt |
| SC-05 | Performance-Overhead pro Command unter 5 ms | Messung vor und nach Patch | Benchmark |

---

## Technical NFRs

### Performance

- Overhead durch Capture unter 5 ms pro Command.
- Notices werden in-memory gesammelt, keine Disk-IO.

### Security

- Patch ist limitiert auf execute_command-Window, kein globaler Notice-Hijack.
- Notice-Texte werden nicht protokolliert wenn sie als sensitiv markiert sind (Heuristik: enthaelt "key", "token", "secret").

### Scalability

- Bis zu 100 Notices pro Command werden gesammelt, danach Truncation mit Hinweis.

### Availability

- Bei Patch-Fehler: fail-soft, execute_command laeuft weiter ohne Capture, Log-Warnung.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Notice-Capture darf Plugin-Internals nicht brechen

- Begruendung: Manche Plugins haben eigenen Notice-Wrapper. Unser Patch muss kompatibel sein.
- Impact: ExecuteCommandTool, Notice-Patch-Implementation.
- Qualitaetsattribut: Compatibility, Robustness.

**MODERATE ASR #2:** Strukturiertes Notice-Schema im tool_result

- Begruendung: Agent muss programmatisch entscheiden koennen, nicht aus Freitext extrahieren.
- Impact: ExecuteCommandTool-Output-Format.
- Qualitaetsattribut: Klarheit, Parseability.

### Constraints

- Obsidian-API `window.Notice` ist die einzige bekannte Notice-Quelle. Custom Plugin-Notices die das umgehen werden nicht erfasst.
- Patch-Lifecycle muss async-sicher sein: execute_command darf auf Promise-Resolution warten ohne dass parallel laufende Notices verloren gehen.

### Open questions for architect

- Soll Capture nur Notices waehrend des Command-Calls erfassen, oder auch Notices die innerhalb von 1-2 Sekunden danach kommen (asynchrone Command-Effekte)?
- Wie unterscheiden wir Success-Notices ("Datei gespeichert") von Error-Notices ("Datei nicht gefunden")? Heuristik via Substring-Match oder explizites Notice-Severity-Field (falls in Obsidian-API verfuegbar)?
- Soll der Agent das tool_result schon nach Notice-Inhalt parsen oder bekommt er nur die Rohdaten?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Notice-Patch (Capture, Restore, fail-soft bei Plugin-Override)
- [ ] Integrations-Test mit Plugins die viele Notices erzeugen (Templater, Dataview)
- [ ] Smoke-Test fuer 20 typische Command-Szenarien (Modal-Open, kein Editor, Plugin-Error)

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] ExecuteCommandTool-Description aktualisiert mit neuem Output-Schema

---

## Hypothesis validation

| Hypothese | Test-Methode | Erfolgs-Kriterium | Resultat |
|---|---|---|---|
| H-01: Notice-Capture macht silent Failures sichtbar ohne Plugin-Internals zu brechen | 20 Command-Szenarien, Vorher-Nachher-Vergleich, plus Stichprobe mit 5 Plugins die eigenen Notice-Wrapper haben | 95% Capture-Coverage, 0 Regressionen | Open |

---

## Dependencies

- Keine harten Vorgaenger. Kann unabhaengig von FEAT-29-01/02/03 entwickelt werden.

## Assumptions

- `window.Notice` ist die kanonische Notice-Quelle in Obsidian.
- Plugins die ihre eigene Notice-Implementierung haben, sind die Minderheit.

## Out of scope

- Aenderungen an call_plugin_api (das ist FEAT-29-07).
- Visualisierung der Notices in der Chat-UI (Output-Format-Aenderung reicht).

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `execute-command-tool` (run `grep "ExecuteCommand" src/ARCHITECTURE.map` fuer Entry-Point).
