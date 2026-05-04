# Feature: Cost-Aware Agent Heuristics

> **Feature ID**: FEAT-18-04
> **Epic**: EPIC-18 - Token-Kostenreduktion
> **Priority**: P0-Critical
> **Effort Estimate**: M (4-7 Tage)
> **Related**: ADR-90, ADR-61, ADR-62, ADR-63

## Feature Description

Eine simple Aufgabe wie *"Meeting-Summary fuer eine 20k-Note"* hat in der Praxis
675k Input-Tokens und 25 Minuten gekostet, statt der theoretisch erwarteten
6k Tokens und 30-60 Sekunden. Faktor 100 in Kosten und Zeit.

Die einzelnen Symptome wurden iterativ behoben (Externalization, Provider-Parse-
Errors, Edit-File-Fehlermeldungen). Die Ursache liegt aber tiefer: **Der Agent
hat keine Anreize, den einfachsten Weg zuerst zu versuchen.** Er behandelt jede
Aufgabe wie eine offene Recherche statt Trivialitaet zu erkennen und entsprechend
zu handeln.

Dieses Feature fasst zehn universelle Heuristiken zusammen, die den Agent
**lehren** sparsam zu sein, ohne pro Aufgabentyp ein Skill-Template zu pflegen.

## Triggering ASRs (Architecturally Significant Requirements)

| ID | ASR | Impact |
|----|-----|--------|
| C-1 | Per-Iteration-Pattern muss universell sein, nicht pro Aufgabentyp | Maintainability |
| C-2 | Brakes duerfen NIEMALS den Tool-Loop blockieren (kein Freeze) | Reliability, UX |
| C-3 | Sub-Agent-Spawning muss explizit begruendet werden | Cost-Containment |
| Q-1 | EUR-Kosten sollen live im UI sichtbar sein | Cost-Awareness |
| Q-2 | Pro-Task-Telemetrie als Mess-Grundlage fuer kontinuierliche Verbesserung | Observability |

## User Stories

### Story 1: Triviale Aufgaben sind trivial guenstig
**Als** Obsilo-Nutzer
**moechte ich** dass eine "lies X, schreibe Y"-Aufgabe maximal wenige Cent kostet
**um** nicht fuer Routine-Aufgaben Frontier-Modell-Preise zu zahlen

### Story 2: Plan vor Aktion
**Als** Obsilo-Nutzer
**moechte ich** den geplanten Weg sehen, bevor der Agent Tools ruft
**um** Eingreifen zu koennen wenn die Strategie offensichtlich falsch ist

### Story 3: Keine Halluzinations-Quellen
**Als** Obsilo-Nutzer
**moechte ich** dass eine Synthese-Note nur Quellen listet, die der Agent wirklich gelesen hat
**um** keine erfundenen Referenzen in der eigenen Wissensbasis zu haben

### Story 4: Sichtbare Kosten + Tokens
**Als** Obsilo-Nutzer
**moechte ich** Tokens und EUR-Kosten live im Chat sehen
**um** entscheiden zu koennen, ob ein Modellwechsel sich lohnt

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Triviale "lies/schreibe"-Aufgaben kosten Cent-Bereich | <=5 Cent auf Sonnet, <=2 Cent auf Haiku | Telemetry per Task |
| SC-02 | Plan ist vor erstem Tool-Use sichtbar | 100% der Multi-Step-Tasks (>=2 Tool-Calls) | UI-Inspektion |
| SC-03 | Quellen-Halluzinationen werden vor Persist erkannt | Agent korrigiert oder entfernt unread refs | Test-Lauf |
| SC-04 | EUR-Kosten + Tokens im Footer sichtbar | Pro Task | UI-Inspektion |
| SC-05 | Pro Task ein Telemetry-Eintrag persistiert | tasks.jsonl waechst um 1 Zeile pro Task | File-Inspektion |
| SC-06 | Sub-Agent-Spawning erfordert Begruendung | Schema-Pflichtfeld + Validation | Tool-Schema-Test |
| SC-07 | System-Prompt unter Welle 1 schrumpft signifikant | -7k Tokens vs vor ADR-90 | Console-Log SystemPrompt-Breakdown |
| SC-08 | Kein Brake darf Obsidian blockieren | Linear, try/catch-gewrapped | Code-Review + Live-Test |

---

## Technical NFRs (fuer Architekt)

Vollstaendig dokumentiert in **ADR-90: Cost-Aware Agent Heuristics**.

Kurzfassung der zehn Hebel:

1. **Plan-First** (System-Prompt + UI) -- `update_todo_list` als Pflicht-erste-Aktion bei 2+ Tool-Calls
2. **Tool-Tiers** (System-Prompt) -- T1 read/write, T2 search, T3 semantic, T4 sub-agents
3. **Anti-Overthinking** (System-Prompt) -- triviale Verben gehen direkt
4. **Sub-Agent-Gating** (Tool-Schema) -- PARALLEL/SPECIALIST/ESCALATION + Begruendung
5. **Budget sichtbar** (UI) -- EUR + Tokens im Footer, "(~ via Sub)" bei Subscription-Providern
6. **Error-Recovery-Reframe** (System-Prompt) -- bei Fehler: einfacheres Tool, nicht eskalieren
7. **Eskalations-Begruendung** (Tool-Schema) -- konkret, nicht generisch
8. **Prompt-Schrumpfung** -- Tools/Skills/Memory/ToolRouting kompakt, full docs on demand
9. **Stop-Condition** (System-Prompt) -- "habe ich genug?" als Pflicht-Reflektion
10. **Telemetry** (Service) -- pro Task: prompt, model, tokens, EUR, tools, outcome

Plus zwei **Verification-Brakes** (auch in ADR-90):
- **Todo-Verification** (Tier 1: explicit file refs; Tier 2: collective quantifiers)
- **Hallucination-Brake** (Frontmatter-Quellen + ## Quellen Body-Sections + Citation-Tabellen)

Beide sind line-walker-basiert, kein Regex-Backtracking, in `try/catch` gewrapped.

### Pricing-Tabelle

USD-Preise pro 1M Token + USD-EUR-Kurs als statische Tabelle in
`src/core/pricing/ModelPricing.ts`. Substring-Match mit longest-key-first
fuer Modell-Variants. Fallback auf Sonnet-Rates bei unbekanntem Model-ID.

### Telemetry-Persistence

`.obsidian-agent/telemetry/tasks.jsonl` (vault-relativ). Per-Task ein
JSON-Lines-Eintrag mit:
- startedAt, durationMs, promptPreview (200 chars)
- modelId, mode
- iterations, toolSequence, subAgentCount
- inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens
- costUsd, costEur
- outcome (completed/aborted/error), errorMessage?

Truncation bei >=1000 Eintraegen (rotation).

---

## Implementation

| Datei | Aenderung |
|-------|-----------|
| `_devprocess/architecture/ADR-90-cost-aware-agent-heuristics.md` | ADR (neu) |
| `src/core/prompts/sections/costAwareHeuristics.ts` | Sieben-Hebel-Section (Lever 1-3, 6, 7, 9) |
| `src/core/prompts/sections/tools.ts` + `toolMetadata.ts` | Compact-Tool-Mode (Lever 8) |
| `src/core/prompts/sections/memory.ts` | Cap auf 4k chars (Lever 8) |
| `src/core/prompts/sections/toolRouting.ts` | Entschlackt von Cost-Heuristics-Doppelung (Lever 8) |
| `src/core/pricing/ModelPricing.ts` (neu) | Pricing-Registry + computeCost + formatEur (Lever 5+10) |
| `src/core/telemetry/TaskTelemetry.ts` (neu) | Per-Task-Logger + footer-formatter (Lever 10) |
| `src/core/AgentTask.ts` | Telemetry-Hook (Lever 10), readFiles-Set (Brakes) |
| `src/core/tools/agent/NewTaskTool.ts` | justification_category + reason Schema (Lever 4+7) |
| `src/core/tools/agent/UpdateTodoListTool.ts` | Two-tier Verification (Brake) |
| `src/core/tool-execution/ToolExecutionPipeline.ts` | scanUnreadSources Brake (Hallucination) |
| `src/core/FastPathExecutor.ts` | readFiles-Forwarding + wideScope-Cap (Brake) |
| `src/ui/AgentSidebarView.ts` | EUR-Footer + Telemetry-Persist (Lever 5+10) |

12 neue Tests (Pricing, HallucinationBrake, UpdateTodoListTool).

---

## Validation Plan

Drei Test-Cases vor und nach jeder Welle:
1. **Trivial:** Meeting-Summary 20k-Note → erwarten: <=3 Tool-Calls, <=30k Input, <=60s, <=5 Cent
2. **Medium:** "Welche Notes erwaehnen Asset Radar?" → <=2 Calls, <=20k Input, <=30s, <=3 Cent
3. **Komplex:** "Erstelle Praesentation aus 5 Meeting-Notes" → mehrstufig, <=200k, <=5 min, <=30 Cent

Telemetrie-Logs zeigen Vorher/Nachher.

## Out of Scope (fuer Folge-Features)

- **Cost-Aware Model Routing** (Hebel 11) -- separates Feature, baut auf Telemetry-Daten dieser Welle auf
- **Pre-Run Cost Estimate** mit User-Override -- separates Feature
- **Body-Halluzinations-Detection bei Plain-Text-Attribution** ("Martin Kato sagt") -- Quality-Issue, requires semantic understanding
