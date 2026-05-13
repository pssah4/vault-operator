---
id: FEAT-24-07
title: Internes Hilfs-Modell-Routing fuer 4 Agent-interne LLM-Calls
epic: EPIC-24
priority: P2
date: 2026-05-12
updated: 2026-05-13
related: RESEARCH-36
adr-refs: [ADR-115, ADR-11]
plan-refs: [PLAN-23]
depends-on: []
---

# FEAT-24-07: Internes Hilfs-Modell-Routing

## Description

Optionales `helperModelKey` als Top-Level-Setting (Geschwister von
`activeModelKey`). Wenn gesetzt + erreichbar, laufen 4 Agent-interne
LLM-Calls auf dem Hilfs-Modell statt auf dem Haupt-Modell:

1. `condenseHistory` in `AgentTask.ts` (Kontext-Condensing, inkl.
   Emergency-Trigger).
2. `FastPathExecutor` planner + presenter (Such-/Lese-Planner und
   Output-Presenter teilen einen createMessage-Call).
3. `plan_presentation` (interner Planungs-LLM-Call der PPTX-Pipeline).
4. `RecipePromotionService`-callback (helper-first, memory-fallback,
   main-fallback) -- backwards-compatibel zur bestehenden
   `memoryModelKey`-Konvention.

Nicht gesetzt oder nicht erreichbar -> Fallback auf Haupt-Modell, kein
Verhaltenswechsel.

Out-of-Scope: Memory-Atomizer (`memoryModelKey`), ChatLinking-Titling
(`titlingModelKey`), `classifyText`-Hook in `main.ts`,
`hard-limit-recovery` (user-facing), ReAct-Hauptloop. Begruendung siehe
ADR-115 Amendment 2026-05-13.

Quelle: RESEARCH-36 Abschnitt 8 Hebel H. Architektur: ADR-115
(Amendment 2026-05-13). Umsetzung: PLAN-23.

## Success Criteria

1. **`helperModelKey: string`** als Top-Level in `ObsidianAgentSettings`
   (Default leer). `plugin.getHelperModel(): CustomModel | null` liefert
   das aufgeloeste Modell ODER null (analog `getMemoryModel`).
2. **`getHelperApi(plugin, fallback)`** liefert den Helper-`ApiHandler`
   wenn `helperModelKey` gesetzt UND in `activeModels` enthalten UND
   `enabled` UND `buildApiHandlerForModel` ohne throws; sonst `fallback`.
   Build-Fehler werden mit `console.warn` geloggt und fuehren zum
   Fallback (kein Crash).
3. **`condenseHistory` in `AgentTask.ts`** ruft `getHelperApi(this.plugin, this.api).createMessage(...)`
   statt `this.api.createMessage`. Inkl. Emergency-Condensing.
4. **`FastPathExecutor` planner/presenter** ruft `getHelperApi(plugin, this.api).createMessage(...)`.
   FastPathExecutor bekommt einen `plugin`-Reference im Konstruktor wenn
   noetig.
5. **`PlanPresentationTool.callPlanningLLM`** ruft `getHelperApi(this.plugin, mainHandler).createMessage(...)`,
   wobei `mainHandler` der heutige `buildApiHandlerForModel(plugin.getActiveModel())`
   bleibt als fallback.
6. **`RecipePromotionService`-callback in `main.ts`** chain-up:
   `getHelperModel()` first, dann `getMemoryModel()` als
   backwards-compat fallback, dann `null`.
7. **Bestehende Funktionalitaet unveraendert:** alle Tests vor dem
   Pivot bleiben gruen. Mit leerem `helperModelKey` ist das Verhalten
   identisch zu vor FEAT-24-07.
8. **Live-Messlauf `[AWAITING RE]`:** in einer Vault-Session mit
   konfiguriertem Hilfs-Modell (z.B. Haiku) und einer Aufgabe die
   condensing triggert, zeigt das `[Cost]`-Log und `[CacheStat]`-Log
   das Hilfs-Modell statt des Haupt-Modells; keine sichtbare
   Qualitaetsregression beim Output. Nicht autonom pruefbar.
