# Feature: Fast Path Execution

> **Feature ID**: FEAT-18-00
> **Epic**: EPIC-18 - Token-Kostenreduktion
> **Priority**: P0-Critical
> **Effort Estimate**: M (4-7 Tage)

## Feature Description

Wenn der Agent ein gelerntes Recipe fuer den User-Intent erkennt, soll er die
Tool-Calls als Batch ausfuehren statt iterativ ueber die ReAct-Loop. Statt
8 einzelner LLM-Calls (je mit voller History) fuehrt der Agent maximal 2-3 Calls
durch: einen fuer die Parametrisierung/Planung, dann deterministische Tool-Ausfuehrung,
dann einen finalen Call fuer die Ergebnispresentation.

Dies ist der Kern-Hebel fuer die Token-Reduktion (75% weniger Iterationen) und
baut direkt auf dem Semantic Recipe Promotion System (ADR-58) auf.

## Benefits Hypothesis

**Wir glauben dass** Recipe-gesteuerte Batch-Ausfuehrung von Tool-Calls
**folgende messbare Outcomes liefert:**
- 75% weniger LLM-Iterationen bei erkannten Patterns (8 -> 2)
- 70-80% weniger Input-Tokens pro Task bei erkannten Patterns
- Schnellere Task-Completion (weniger Roundtrips = weniger Latenz)

**Wir wissen dass wir erfolgreich sind wenn:**
- Standard-Task "Suche X und erstelle Zusammenfassung" unter 130k Input-Tokens bleibt
- Ergebnisqualitaet identisch mit normaler ReAct-Loop (kein messbarer Unterschied)
- Bei Fehlern im Fast Path: automatischer Fallback auf normale Loop

## User Stories

### Story 1: Schnelle Standardaufgabe
**Als** Knowledge Worker
**moechte ich** dass der Agent repetitive Aufgaben direkt ausfuehrt ohne langes "Nachdenken"
**um** schnellere Ergebnisse bei geringeren Kosten zu bekommen

### Story 2: Graceful Degradation
**Als** Vault Operator-Nutzer
**moechte ich** dass der Agent bei unbekannten Aufgaben weiterhin normal arbeitet
**um** mich darauf verlassen zu koennen dass jede Aufgabe bearbeitet wird

### Story 3: Transparenz
**Als** Power User
**moechte ich** erkennen koennen ob der Agent einen Fast Path oder die normale Loop nutzt
**um** das Verhalten nachvollziehen zu koennen

### Story 4: Aufgabenfokus bei langen Tasks
**Als** Vault Operator-Nutzer mit komplexen Multi-Step-Aufgaben
**moechte ich** dass der Agent sein Ziel nicht aus den Augen verliert
**um** konsistente Ergebnisse auch nach vielen Schritten zu bekommen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Bekannte Aufgabentypen werden mit deutlich weniger Interaktionsschritten abgeschlossen | <=3 Schritte statt 8 | Iterationszaehler pro Task |
| SC-02 | Ergebnisse bei Standardaufgaben sind qualitativ identisch | Kein erkennbarer Unterschied | Vergleichstest gleiche Aufgabe mit/ohne Fast Path |
| SC-03 | Unbekannte Aufgaben werden weiterhin zuverlaessig bearbeitet | 100% Fallback-Erfolgsrate | Aufgaben ohne Recipe-Match nutzen normale Ausfuehrung |
| SC-04 | Fehler im beschleunigten Pfad fuehren nicht zu Abbruechen | 0 unbehandelte Fehler | Error-Logs nach Fast-Path-Runs |
| SC-05 | Gesamte Eingabedaten pro Standardaufgabe sinken signifikant | <130.000 Einheiten | Token-Counter im Agent-Log |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Iterations-Reduktion**: 8 LLM-Calls -> max 3 (1 Plan + 1-2 Execution)
- **Token-Budget**: <130.000 Input-Tokens fuer Standard-Task (search+read+write)
- **Latenz**: Gleich oder besser als ReAct-Loop (weniger Roundtrips)
- **Parallele Ausfuehrung**: read-safe Tools via Promise.all (bestehendes Pattern)

### KV-Cache-Kompatibilitaet (Manus Context Engineering)
- **Tool-Liste NICHT aendern**: Fast Path darf keine Tools hinzufuegen oder entfernen.
  Tool-Steuerung via `tool_choice` Parameter (auto/required/specified), nicht via
  Tool-Definitions-Filterung. Aenderungen an der Tool-Liste invalidieren den KV-Cache.
- **Append-only History**: Fast Path darf History-Eintraege nicht modifizieren oder
  loeschen. Neue Eintraege nur anhaengen.

### Reliability
- **Fallback**: Wenn Fast Path fehlschlaegt -> nahtloser Uebergang zu normaler ReAct-Loop
- **Error Handling**: Tool-Fehler im Batch werden gesammelt und dem LLM im finalen Call uebergeben
- **Recipe Confidence**: Nur Recipes mit successCount >= 3 qualifizieren fuer Fast Path

### Kontextsteuerung (Manus Context Engineering)
- **Todo-Liste als Recency-Anker**: Wenn eine Todo-Liste existiert, wird der aktuelle
  Stand automatisch als letzte User-Message vor dem API-Call angehaengt. Nutzt den
  Recency Bias des Modells, verhindert Zielabweichung bei langen Tasks (10+ Iterationen).
  Kein zusaetzlicher Tool-Call noetig. Ersetzt NICHT das update_todo_list Tool
  (das bleibt fuer aktive Updates). Kompatibel mit Fast Path (Plan-Status am Ende).

### Observability
- **Logging**: `[FastPath]` Prefix fuer alle Fast-Path-Logs
- **Metriken**: Token-Verbrauch mit/ohne Fast Path vergleichbar
- **UI**: Subtle Indicator wenn Fast Path aktiv (z.B. Tooltip)

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Fast Path muss nahtlos in bestehende AgentTask-Loop integriert werden
- **Warum ASR**: AgentTask.run() ist der zentrale Ausfuehrungspfad fuer alle Tasks
- **Impact**: Entscheidung wo der Fast Path einsetzt (vor der Loop, als erster Schritt, oder als Ersatz)
- **Quality Attribute**: Reliability, Maintainability

**CRITICAL ASR #2**: Tool-Execution im Batch muss dieselben Governance-Regeln einhalten
- **Warum ASR**: ToolExecutionPipeline hat Approval, Caching, Checkpointing, Logging
- **Impact**: Fast Path muss die Pipeline nutzen, nicht umgehen
- **Quality Attribute**: Security, Consistency

**MODERATE ASR #3**: Recipe-zu-Tool-Parameter-Mapping muss robust sein
- **Warum ASR**: Recipes haben abstrakte Steps ("search for topic"), konkrete Params kommen vom User-Intent
- **Impact**: Ein LLM-Call muss die abstrakten Steps mit konkreten Parametern fuellen
- **Quality Attribute**: Correctness

### Constraints
- **Bestehende Pipeline nutzen**: ToolExecutionPipeline MUSS verwendet werden (keine Bypass)
- **Recipe-Format unveraendert**: ProceduralRecipe Typ bleibt (ADR-58)
- **Review-Bot-Compliance**: Keine neuen Verst??sse

### Open Questions fuer Architekt
- Wo genau im AgentTask.run() Flow setzt der Fast Path ein?
- Wie werden die Recipe-Steps mit konkreten Parametern gefuellt (1 LLM-Call als "Planner")?
- Wie werden Tool-Errors im Batch behandelt (Retry? Fallback? Weiter mit naechstem Step?)
- Soll der Fast Path ein eigenes Token-Budget haben (um Overflow zu verhindern)?

---

## Definition of Done

### Functional
- [ ] Fast Path ausfuehrbar fuer gelerntes Recipe "Note Research & Summarize"
- [ ] Fallback auf normale Loop bei unbekannten Tasks
- [ ] Fallback auf normale Loop bei Fast-Path-Fehlern
- [ ] Tool-Results korrekt in Agent-History integriert

### Quality
- [ ] Vergleichstest: Gleiche Aufgabe mit/ohne Fast Path, gleiches Ergebnis
- [ ] Token-Messung: <130k Input-Tokens fuer Standard-Task
- [ ] Error-Handling: Kein unbehandelter Fehler bei Tool-Failure im Batch

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] ADR fuer Fast Path Architektur
- [ ] Backlog aktualisiert

---

## Dependencies
- **ADR-58 (Semantic Recipe Promotion)**: Recipes muessen existieren und matchen. Bereits implementiert.
- **RecipeMatchingService**: Muss im Prompt-Build-Prozess aktiv sein. Bereits implementiert.
- **ToolExecutionPipeline**: Batch-Execution muss ueber bestehende Pipeline laufen.

## Assumptions
- LLM kann in einem Call die abstrakten Recipe-Steps mit konkreten Parametern fuellen
- Parallele read-tool Execution ist sicher (bestehendes Promise.all Pattern)
- Recipes haben genug Kontext (Steps + Description) fuer sinnvolle Parametrisierung

## Out of Scope
- Recipes fuer Tasks mit komplexer Verzweigungslogik (if/else Schritte)
- Automatische Fast-Path-Optimierung (z.B. Schritt-Reihenfolge aendern)
- Fast Path fuer Subtasks (nur Top-Level Tasks)
