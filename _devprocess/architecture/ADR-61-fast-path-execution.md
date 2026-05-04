# ADR-61: Fast Path Execution -- Recipe-gesteuertes Batching

**Date:** 2026-04-04
**Deciders:** Sebastian Hanke
**Feature:** FEAT-18-00 (Fast Path Execution)

## Context

Der Agent braucht fuer eine Standard-Aufgabe ("suche Notizen zu X, erstelle Zusammenfassung")
8 LLM-Iterationen mit 634.000 Input-Tokens (~$2.00). Jede Iteration sendet die gesamte
bisherige History erneut. Das Semantic Recipe Promotion System (ADR-58) erkennt bereits
wiederkehrende Patterns und erzeugt Recipes mit Tool-Steps.

Aktuell werden Recipes nur als Text-Hint in den System Prompt injiziert. Der Agent
muss trotzdem bei jedem Step eine vollstaendige LLM-Inferenz durchfuehren.

**Triggering ASRs:**
- C-1: Fast Path muss nahtlos in AgentTask-Loop integriert werden
- C-2: Tool-Execution im Batch muss ToolExecutionPipeline nutzen
- Quality Attributes: Cost Efficiency, Performance, Reliability

## Decision Drivers

- **Token-Reduktion**: 8 Iterationen → 2-3 (75% weniger Tokens)
- **KV-Cache-Stabilitaet** (Manus): Tool-Liste darf sich NICHT aendern zwischen Iterationen
- **Qualitaetserhalt**: Identische Ergebnisse wie normale ReAct-Loop
- **Graceful Degradation**: Unbekannte Tasks muessen weiterhin normal funktionieren
- **Pipeline-Compliance**: Alle Governance-Regeln (Approval, Checkpoints, Logging) bleiben

## Considered Options

### Option 1: Pre-Loop Fast Path (vor der ReAct-Loop)

Vor AgentTask.run() Loop-Start: Pruefen ob ein Recipe matcht. Wenn ja:
1. EIN LLM-Call ("Planner"): Recipe-Steps mit konkreten Parametern fuellen
2. Deterministische Tool-Ausfuehrung via ToolExecutionPipeline
3. EIN LLM-Call ("Presenter"): Ergebnisse zusammenfassen und praesentieren
4. Wenn Fehler: Fallback auf normale Loop mit bereits gesammelten Results

- Pro: Klare Trennung von Fast Path und Normal Path
- Pro: System Prompt wird nur 2x berechnet statt 8x
- Pro: Bestehende Loop bleibt komplett unveraendert
- Con: Zwei verschiedene Ausfuehrungspfade zu warten
- Con: Planner-Call muss alle Parameter auf einmal bestimmen (schwieriger)

### Option 2: First-Iteration Fast Path (innerhalb der Loop)

In der ersten Iteration der bestehenden Loop: Wenn Recipe matcht, sendet man
dem LLM das Recipe als "Plan" und nutzt `tool_choice: "required"` um den
naechsten Tool-Call zu erzwingen. Parallele read-safe Tools via Promise.all.

- Pro: Nur ein Ausfuehrungspfad (die bestehende Loop)
- Pro: Alle bestehenden Mechanismen (Power Steering, Condensing, Error Handling) greifen
- Pro: Weniger neuer Code
- Con: Immer noch 1 LLM-Call pro Tool-Step (nur weniger Steps)
- Con: Kein deterministischer Pfad -- LLM kann vom Recipe abweichen

### Option 3: Hybrid (Pre-Loop Batch + Loop Fallback)

Vor der Loop: Recipe erkennen, Planner-Call, dann Tool-Batch ausfuehren.
Ergebnisse in die History schreiben. Dann die normale Loop starten, aber
mit dem Kontext "Du hast bereits diese Tools ausgefuehrt, hier sind die
Ergebnisse. Vervollstaendige die Aufgabe." Loop macht dann 1-2 Iterationen
fuer Praesentation/Nacharbeit.

- Pro: Deterministischer Batch (keine LLM-Entscheidung pro Step)
- Pro: Falls Batch nicht reicht, uebernimmt die normale Loop
- Pro: History ist Append-only (Batch-Results werden angehaengt, nicht eingefuegt)
- Pro: Bestehende Loop-Mechanismen greifen fuer den Tail
- Con: Komplexeste Option
- Con: History muss die Batch-Results als synthetische Messages enthalten

## Decision

**Vorgeschlagene Option:** Option 3 -- Hybrid (Pre-Loop Batch + Loop Fallback)

**Begruendung:**

Option 1 ist sauber aber fragil (was wenn der Planner-Call nicht alle Parameter
richtig bestimmt?). Option 2 spart zu wenig (immer noch 1 LLM-Call pro Step).
Option 3 kombiniert das Beste: Deterministische Batch-Ausfuehrung fuer die
bekannten Steps, flexible Loop fuer alles Unvorhergesehene.

**Konkreter Ablauf:**

```
1. RecipeMatchingService.match(userMessage) → Recipe gefunden?
   NEIN → Normale ReAct-Loop (unveraendert)
   JA ↓

2. "Planner" LLM-Call:
   System: cachedSystemPrompt (identisch zur normalen Loop -- Tools, Routing etc.)
   User: User-Message + Recipe als explizite Instruktion:
         "You have a proven recipe for this task. Fill in the concrete parameters:
          Step 1: {tool} -- {note}
          Step 2: {tool} -- {note}
          Output ONLY valid JSON: [{tool, input}, ...]"
   Output: JSON mit konkreten Tool-Calls [{tool, input}, ...]
   (1 LLM-Call, ~30k Tokens)
   
   WICHTIG: Der Planner nutzt den gleichen System Prompt wie die normale Loop.
   Er braucht die Tool-Definitionen um gueltige inputSchemas zu erzeugen.
   Nur die User-Message unterscheidet sich (enthaelt Recipe-Steps).

3. Deterministische Tool-Batch-Ausfuehrung:
   Fuer jeden Step aus dem Plan:
   - ToolExecutionPipeline.executeTool() (volle Governance)
   - Parallele Ausfuehrung fuer read-safe Tools (Promise.all)
   - Ergebnisse sammeln
   (0 LLM-Calls, nur Tool-Ausfuehrung)

4. History aufbauen:
   - Synthetische Assistant-Message: "Ich habe folgende Schritte ausgefuehrt: ..."
   - Tool-Results als tool_result Blocks
   - Todo-Liste (falls vorhanden) als letzte User-Message (Recency-Anker)

5. Normale Loop starten (mit vorbereiteter History):
   - Agent sieht die Batch-Ergebnisse und praesendiert/vervollstaendigt
   - Typisch: 1-2 weitere Iterationen (write_file + Zusammenfassung)
   (1-2 LLM-Calls, ~40k Tokens)

GESAMT: 2-3 LLM-Calls statt 8 = ~70k Tokens statt 634k
```

**Todo-Liste als Recency-Anker (Manus-Pattern):**
Wenn eine Todo-Liste existiert (update_todo_list wurde aufgerufen oder Fast Path
erzeugt einen Plan), wird der aktuelle Stand automatisch als letzte User-Message
vor jedem LLM-Call angehaengt. Das bringt den Aufgaben-Fokus in die Recency-Zone
des Modells und verhindert "lost-in-the-middle" bei langen Tasks. Kein zusaetzlicher
Tool-Call noetig -- passiert in AgentTask.run() vor dem API-Call.

**Interaktion mit Context Externalization (ADR-63):**

Wenn ADR-63 aktiv ist, werden grosse Tool-Results in temp-Dateien externalisiert.
Im Fast Path entstehen zwei Szenarien:

1. **Planner-Call** (Step 2): Sieht keine Tool-Results (nur User-Message + Recipe).
   Kein Conflict -- Planner braucht keine Results.

2. **Presenter-Call / Loop** (Step 5): Sieht die Batch-Results. Diese koennen
   externalisiert sein (kompakte Referenzen statt volle Inhalte).

   **Problem:** Wenn der Agent nur Referenzen sieht, kann die finale Zusammenfassung
   oberflaechlich werden -- er hat den vollen Inhalt nie im Kontext gesehen.

   **Loesung: Staged Externalization im Fast Path.**
   - Waehrend der Batch-Execution (Step 3): Tool-Results werden VOLL in die History
     geschrieben (keine Externalization). Der Batch ist kurz (3-5 Tools) und wird
     nur 1x an die API gesendet (im Presenter-Call).
   - NACH dem Presenter-Call: Die History-Eintraege der Batch-Results werden fuer
     nachfolgende Iterationen NICHT nachtraeglich komprimiert (Append-only).
     Aber: Da der Fast Path nur 2-3 Calls hat, akkumulieren die Results kaum.

   **Warum das funktioniert:** Der Hauptvorteil von Externalization ist bei 8-Iterations-
   Tasks (Results werden 5-6x erneut gesendet). Bei Fast Path mit 2-3 Calls ist
   die Akkumulation minimal. Die vollen Results einmal im Presenter-Call zu senden
   kostet weniger als ein zusaetzlicher read_file-Roundtrip.

**KV-Cache-Kompatibilitaet (Manus):**
- Tool-Liste bleibt UNVERAENDERT zwischen Planner und Loop
- History ist Append-only (Batch-Results werden angehaengt)
- Todo-Anker ist Append (letzte Message), nicht Modification
- Kein `tool_choice` Filtering noetig (Planner bestimmt Tools, Batch fuehrt aus)

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- 75% weniger Token-Kosten bei erkannten Recipes
- Schnellere Task-Completion (weniger Roundtrips)
- Bestehende Loop bleibt fuer unbekannte Tasks unveraendert
- Pipeline-Governance (Approval, Checkpoints, Logging) greift weiterhin

### Negative
- Neuer Code-Pfad (FastPathExecutor) erhoht Komplexitaet
- Planner-Call kann ungueltige Tool-Parameter erzeugen (braucht Validation)
- Synthetische History-Messages muessen sorgfaeltig formatiert werden

### Risks
- **Planner erzeugt falsche Parameter**: Mitigation durch inputSchema-Validation
  vor Ausfuehrung. Bei Validation-Fehler: Fallback auf normale Loop.
- **Batch-Execution scheitert teilweise**: Mitigation durch Error-Sammlung und
  Uebergabe an die Loop ("Diese Tools haben funktioniert, diese nicht").
- **Recipe passt nicht zum konkreten Task**: Mitigation durch Confidence-Score
  im RecipeMatchingService. Nur bei Score > 0.5 Fast Path nutzen.

## Implementation Notes

### Neue Dateien
- `src/core/FastPathExecutor.ts` -- Orchestriert Planner + Batch + History-Aufbau

### Geaenderte Dateien
- `AgentTask.ts` -- Vor der Loop: FastPath-Check, bei Match FastPath starten
- `AgentSidebarView.ts` -- Fast-Path-Indikator (optional, UI)

### Nicht geaendert
- `ToolExecutionPipeline.ts` -- Wird nur aufgerufen, nicht geaendert
- `RecipeMatchingService.ts` -- Wird nur abgefragt
- `RecipeStore.ts` -- Rezepte bleiben unveraendert
- `systemPrompt.ts` -- Prompt-Struktur bleibt

## Related Decisions

- ADR-58: Semantic Recipe Promotion (liefert die Recipes)
- ADR-17: Procedural Recipes (Format-Definition)
- ADR-01: ToolExecutionPipeline (wird genutzt, nicht umgangen)

## Implementation Notes (2026-04-05)

**Implemented as Two-Stage Fast Path** (modified from original single-planner proposal):

Stage 1: Search-Planner parametrizes search/discovery tools → parallel batch execution
Stage 2: Read-Planner sees search results → parametrizes read tools → parallel batch  
Stage 3: Normal loop for write/present (1-2 iterations)

Additional features implemented:
- Tool schemas included in planner prompts (LLM knows exact parameter names)
- Context hint after batch ("do NOT re-search")
- Todo list as recency anchor (appended to last user message before each LLM call)
- successCount >= 3 gate (only well-tested recipes trigger Fast Path)
- Externalization disabled during batch (Presenter needs full content)

Key files:
- `src/core/FastPathExecutor.ts` (two-stage planner + batch execution)
- `src/core/AgentTask.ts` (pre-loop integration, todo anchor, context hint)

## References

- FEAT-18-00: Fast Path Execution
- Manus Context Engineering: Maskieren statt Entfernen, Append-only History
- LLMCompiler (2024): Task-DAG mit paralleler Ausfuehrung
- ReWOO (2023): Planner-Output mit Variablen-Referenzen

## Revision (2026-04-29) -- Recipe-Threshold + dynamic Stage-2-Fanout

**Trigger:** Bei der Synthese-Aufgabe *"Erstelle eine konsolidierte Insights-Note
aus allen GenAI-Push-Interview-Notes"* matched FastPath das Recipe
"Metadata Tags Generation" mit Score 0.33 -- konzeptionell falscher Workflow.
Plus: Stage 2 cappte still die Fanout von 5 angefragten Reads auf 3, was bei
"alle/all/every"-Aufgaben Quellen verschluckte.

**Aenderung 1 -- Recipe-Threshold:** In `AgentTask.ts:230` wurde der
Score-Threshold von **0.3 auf 0.5** angehoben. Schwache Matches gehen jetzt
in den normalen Loop, der die Aufgabe sauber zerlegt.

**Aenderung 2 -- Dynamic Stage-2-Fanout:** In `FastPathExecutor.ts:192` wird
der Fanout-Cap nun anhand der User-Message bestimmt:

```typescript
const wideScope = /\b(alle|all|jede[rsn]?|every|each|complete|...)\b/i.test(userMessage);
const FANOUT_CAP = wideScope ? 8 : 3;
```

Bei expliziten Sammel-Begriffen wird der Cap auf 8 erhoeht. Default-Cap bleibt 3.

**Aenderung 3 -- readFiles-Forwarding:** FastPath-stage-2-Reads tragen jetzt
zum Task-weiten `readFiles: Set<string>` bei (FEAT-18-04 Brakes nutzen das).
Signature von `FastPathExecutor.execute()` und `executeBatch()` um optionalen
`readFiles?: Set<string>` Parameter erweitert.

**Verworfene Alternativen:**
- Threshold pro Recipe-Kategorie -- zu komplex, kein klarer Gewinn
- LLM-basierte Recipe-Auswahl -- widerspricht dem Sparsamkeits-Ziel
- Cap=5 als Default -- mehr False-Positive-Risiko bei normalen Tasks ohne wide-scope

**Bezug:** FEAT-18-04 (Cost-Aware Agent Heuristics, ADR-90),
Recipe-Promotion bleibt in ADR-58 unveraendert.
