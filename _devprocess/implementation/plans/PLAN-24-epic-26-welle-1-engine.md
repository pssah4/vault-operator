---
id: PLAN-24
title: EPIC-26 Welle 1 -- Advisor-Pattern Engine + Tier-Klassifikator + Discovery
date: 2026-05-15
feature-refs: [FEAT-26-01, FEAT-26-02]
adr-refs: [ADR-120, ADR-121, ADR-115]
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-24: EPIC-26 Welle 1 -- Advisor-Pattern Engine + Tier-Klassifikator + Discovery

<!--
Backlog row carries status (Draft, Active, Done, Superseded), phase,
claim, and commit SHAs. Look it up via:
`grep "PLAN-24" _devprocess/context/BACKLOG.md`.
-->

## Scope dieses Plans

Dieser Plan deckt Welle 1 von EPIC-26 ab: die Backend-Engine. Drei Module werden gebaut, die in den Wellen 2+3 (separate Plans) konsumiert werden:

1. **Tier-Klassifikator** (FEAT-26-02 Welle 1) als pure Function
2. **Discovery-Service** (FEAT-26-02 Welle 1) als Wrapper um `fetchProviderModels()` mit 24h-Cache
3. **Advisor-Pattern Engine** (FEAT-26-01) als neues Built-In-Tool `consult_flagship` plus Subagent-Profile

Welle 2 (Provider-UI, Migration, Chat-Dropdown) und Welle 3 (Prompt-Slim) folgen in PLAN-25 bzw. PLAN-26.

Voraussetzung: Settings-Schema-Felder (`providers[]`, `activeProviderId`, `schemaVersion`, `defaultMainModelTier`) werden in diesem Plan **angelegt** (Interface + Defaults), aber **noch nicht durch ein UI gefüllt**. Die Migration in PLAN-25 füllt sie. Bis dahin wird der Code mit fehlenden `providers[]`-Daten umgehen müssen (Feature-Flag-Pattern).

## Bestehende Patterns die wiederverwendet werden

- **Subagent-Mechanik:** `AgentTask.spawnSubtask(childMode, childMessage, profileName)` in `src/core/AgentTask.ts:487`. Profile-Registry in `src/core/agent/subagent-profiles.ts:78`.
- **Helper-API:** `getHelperApi(plugin, fallback)` in `src/core/helper-api.ts`. `plugin.getHelperModel()` in `src/main.ts:1926`.
- **Provider-Discovery:** `fetchProviderModels(provider, apiKey, baseUrl, apiVersion, bedrockCreds)` in `src/ui/settings/testModelConnection.ts:355`.
- **Settings-Atomic-Save:** `_globalStorageMigrated`-Pattern in `src/main.ts:1648-1664` für Schema-Migration.
- **Model-ID-Normalisierung:** `normalizeModelId(id)` in `src/types/model-registry.ts`.
- **Tool-Registration:** TOOL_METADATA in `src/core/tools/toolMetadata.ts`, TOOL_GROUP_MAP in `src/core/modes/builtinModes.ts`.

## Critical-Review Findings (aus Phase 2)

- **F-1:** SubagentProfile-Interface muss um `tierOverride?: 'fast' | 'mid' | 'flagship'` und `maxOutputTokens?: number` erweitert werden. Erforderlich für Advisor-Profile (3000-Limit, flagship-Tier) und Research-Tier-Update (fast-Tier, FEAT-24-04-Backwards-Kompat).
- **F-2:** `[Cost]`-Log braucht `mode`-Field (`auto` | `override(<id>)` | `advisor(<id>)`). Erweiterung in `TaskTelemetry.ts`. Provider-Adapter müssen das Feld durchreichen.
- **F-3:** `defaultMainModelTier` als Top-Level-Setting, Default `'mid'`, dokumentiert als Rollback-Schalter für H-01.

Diese Findings sind additiv, kein ADR-Update nötig. Sie sind im Task-Schnitt unten reflektiert.

## Task-Schnitt

### Task 1: Settings-Schema-Erweiterung (Vorbereitung)

**Create:** keine neue Datei  
**Modify:** `src/types/settings.ts`

- Interface `ProviderConfig` definieren (ohne UI-Konsumenten):
  - `id: string`, `type: ProviderType`, `enabled: boolean`
  - Auth-Felder (apiKey, baseUrl, apiVersion, aws-*, oauthToken) als optional aus heutiger `CustomModel`-Struktur
  - `discoveredModels: DiscoveredModel[]`, `lastRefreshAt: number`
  - `tierMapping: { fast?, mid?, flagship? }`, `tierOverrides: { fast?, mid?, flagship? }`
- Interface `DiscoveredModel`: `id, displayName?, contextWindow?, maxOutputTokens?, pricingPromptUsd?, pricingCompletionUsd?, autoTier?, autoTierSource?`
- Top-Level-Felder hinzufügen: `providers: ProviderConfig[]` (default `[]`), `activeProviderId: string | null` (default `null`), `schemaVersion?: string`, `defaultMainModelTier?: 'fast' | 'mid' | 'flagship'` (default `'mid'`)
- `legacy_active_models_backup?` Feld definieren (für PLAN-25 Migration)

**Verifikation:** `npx tsc` clean.

### Task 2: ModelTierClassifier (Pure Function)

**Create:** `src/core/routing/ModelTierClassifier.ts`  
**Test:** `src/core/routing/__tests__/ModelTierClassifier.test.ts`

- Pattern-Tabelle pro Tier (flagship/mid/fast) als Regex-Liste
- `classify(modelId: string, modelInfo?: ModelInfo, pricing?: { promptUsd, completionUsd }): { tier, source }`
- Capability-Fallback wenn Pattern nicht matched (Schwellen aus ADR-121 dokumentiert)
- OpenRouter-Pricing-Sonderpfad: wenn `pricing.completionUsd` gegeben, Schwellen `>50 → flagship`, `5-50 → mid`, `<5 → fast`
- Bedrock-Normalisierung via `normalizeModelId()` aus `model-registry.ts`
- Outlier-Log via `console.debug('[ModelTierClassifier] outlier ...')` wenn nur Fallback griff

**Tests:** Pattern-Match-Test pro Familie (Opus, Sonnet, Haiku, GPT-5, GPT-4.1, GPT-4o-mini, Gemini-Pro, Gemini-Flash, DeepSeek-Reasoner), Capability-Fallback-Test, OpenRouter-Pricing-Test, Bedrock-Normalisierung-Test, Unknown-Model-Test (sollte fast oder Fallback liefern).

**Verifikation:** Tests grün, `console.debug` zeigt erwartete Klassifikations-Werte für Sebastians eigene aktive Modelle.

### Task 3: ModelDiscoveryService (Wrapper + Cache)

**Create:** `src/core/routing/ModelDiscoveryService.ts`  
**Test:** `src/core/routing/__tests__/ModelDiscoveryService.test.ts`

- Klasse `ModelDiscoveryService` mit Methoden:
  - `getDiscoveredModels(providerId): DiscoveredModel[]` (Read aus Settings-Cache)
  - `refreshProvider(providerId): Promise<DiscoveredModel[]>` (HTTP-Call + Klassifikation + Settings-Save)
  - `isStale(providerId): boolean` (Cache > 24h alt)
  - `refreshOnStartup(): Promise<void>` (alle aktiven Provider parallel, asynchron)
- Wrappt `fetchProviderModels()` aus `src/ui/settings/testModelConnection.ts`
- Atomic Settings-Save via bestehendem Plugin-saveData-Pfad
- Bei API-Error: behalte gecachte Liste, log Error, kein Throw
- Klassifikator wird beim Refresh aufgerufen, schreibt `autoTier` in jeden DiscoveredModel

**Tests:** Cache-Hit (jünger 24h), Cache-Miss (älter), API-Error-Pfad (behalte alten Stand), Parallel-Refresh, Classifier-Call-Integration.

**Verifikation:** Test gegen Mock-Provider-Endpoint, danach manueller Test gegen Sebastians eigenen Anthropic-API-Key.

### Task 4: Plugin-Accessors für Tier-Resolution

**Create:** keine neue Datei  
**Modify:** `src/main.ts`

- `getActiveProvider(): ProviderConfig | null` (analog `getActiveModel()`)
- `getTierModel(tier: 'fast' | 'mid' | 'flagship'): CustomModel | null` mit Resolution-Reihenfolge:
  - Override-Modell aus `tierOverrides[tier]` wenn gesetzt → CustomModel
  - Auto-Modell aus `tierMapping[tier]` wenn gesetzt → CustomModel
  - Fallback nach oben (kein flagship → mid → fast)
- `getHelperModel()` erweitern (Amendment ADR-115): 
  - **Stufe 1:** wenn `helperModelKey` explizit gesetzt UND Modell vorhanden → return (heute, gewinnt)
  - **Stufe 2:** wenn aktiver Provider + `tierMapping.fast` gesetzt → return (neu)
  - **Stufe 3:** null (heute Fallback)
- `getAdvisorModel(): CustomModel | null` als Wrapper auf `getTierModel('flagship')`
- `DiscoveredModel` zu `CustomModel`-Konvertierung: hilfsmethode, damit `getTierModel` ein vollständiges CustomModel liefert (Plugin-Code arbeitet weiter mit CustomModel)

**Verifikation:** Unit-Tests für `getTierModel` mit/ohne Override, Fallback-Kette, leere `providers[]` (Pre-Migration-State).

### Task 5: SubagentProfile-Interface-Erweiterung (F-1)

**Modify:** `src/core/agent/subagent-profiles.ts`

- Interface `SubagentProfile` erweitern:
  - `tierOverride?: 'fast' | 'mid' | 'flagship'`
  - `maxOutputTokens?: number`
- `RESEARCH_PROFILE` ergänzen: `tierOverride: 'fast'`, `maxOutputTokens` bleibt undefined (nutzt User-Setting `subtaskTokenBudget`)
- `ADVISOR_PROFILE` neu hinzufügen:
  - `name: 'advisor'`
  - `description: 'Read-only advisor subagent on flagship model. Used for hard synthesis steps via consult_flagship tool. 3000-token budget hard cap.'`
  - `allowedTools: ['read_file', 'read_document', 'search_files', 'semantic_search', 'web_fetch', 'web_search', 'attempt_completion']`
  - `roleDefinition`: kompakte Anweisung, dass der Subagent eine konkrete Synthese-Antwort liefert, nicht Tool-Calls
  - `tierOverride: 'flagship'`
  - `maxOutputTokens: 3000`
- `getProfile(name): SubagentProfile | null` bleibt rückwärts-kompatibel

**Tests:** Profile-Lookup, Tier-Override-Resolution, maxOutputTokens-Resolution.

### Task 6: AgentTask Subagent-Tier-Resolution

**Modify:** `src/core/AgentTask.ts`

- `spawnSubtask`-Pfad erweitern: wenn Profile gesetzt UND `profile.tierOverride` definiert → Subagent-API-Handler aus `plugin.getTierModel(profile.tierOverride)` bauen statt vom Parent erben
- Wenn `profile.maxOutputTokens` definiert → diesen Wert als hartes Limit nutzen (überschreibt `subtaskTokenBudget`)
- Default (kein Profile): Subagent erbt Parent-API-Handler (heutiges Verhalten unverändert)
- Cost-Log-Markierung: Subagent-Calls werden mit `mode=advisor(<id>)` bzw. `mode=research-subagent(<id>)` markiert

**Tests:** Spawn mit research-Profile (fast-Tier), Spawn mit advisor-Profile (flagship-Tier + 3000-Cap), Spawn ohne Profile (Parent-Inheritance).

### Task 7: ConsultFlagshipTool als Built-In

**Create:** `src/core/tools/agent/ConsultFlagshipTool.ts`  
**Modify:** `src/core/tools/toolMetadata.ts`, `src/core/modes/builtinModes.ts`  
**Test:** `src/core/tools/agent/__tests__/ConsultFlagshipTool.test.ts`

- Tool-Klasse `ConsultFlagshipTool extends BaseTool`
- Tool-Schema:
  - `problem: string` (required, maxLength 1500)
  - `relevant_context: string` (required, maxLength 3000)
  - `failed_attempts: string` (required, maxLength 1500)
  - `constraints: string` (required, maxLength 500)
- Execute-Logik:
  - Per-Task-Counter prüfen (max 3, sonst `tool_error: advisor budget exhausted for this task`)
  - Wenn `getTierModel('flagship')` null → `tool_error: no flagship model configured`
  - `spawnSubtask(currentMode, message, profileName='advisor')` mit konstruiertem Message-Body aus Pflicht-Schema-Feldern
  - Subtask-Result als Tool-Result zurück
- Tool-Registration:
  - TOOL_METADATA-Eintrag mit `group: 'agent'`
  - TOOL_GROUP_MAP.agent erweitert (Coverage-Test muss neu)
- Per-Task-Counter: neues Feld `advisorCallCount` im AgentTask-State, Reset bei Task-Start

**Tests:** Schema-Validation (zu lange Felder → Validation-Error), Per-Task-Limit (4. Call wird abgelehnt), Empty-Flagship-Slot (Tool-Error), Successful-Spawn-Path, Counter-Reset.

### Task 8: Tool-Registration-Filter bei fehlendem Flagship

**Modify:** `src/core/AgentTask.ts` (oder ToolRegistry-Layer wo Tools für den Loop ausgewählt werden)

- Beim Task-Start wird `consult_flagship` nur in das Tool-Schema injiziert, wenn `getTierModel('flagship')` ein valides Modell zurückgibt
- Bei explizitem Chat-Override (FEAT-26-05, kommt in PLAN-26): zusätzlich Filter

**Tests:** Tool wird registriert / nicht registriert je nach Tier-Belegung.

### Task 9: Prompt-Reminder bei consecutiveMistakes

**Modify:** Section-Renderer im System-Prompt (`src/core/prompts/sections/`)

- Konditionale Section nach `CACHE_BREAKPOINT_MARKER`: wenn `consecutiveMistakes >= 2` UND `consult_flagship` registriert → injiziere kurzen Reminder ("You might consider consult_flagship for this problem if it requires deeper synthesis.")
- Cache-Stabilität: Section ist NACH dem Marker, invalidiert nicht den stabilen Prefix

**Tests:** Reminder erscheint bei mistakes >= 2, nicht bei <2, nicht wenn Tool nicht registriert.

### Task 10: Cost-Log mode-Field (F-2)

**Modify:** `src/core/telemetry/TaskTelemetry.ts`, alle Provider-Adapter (anthropic, openai, bedrock, etc.)

- `mode`-Field erweitert: `'auto' | 'override' | 'advisor' | 'subagent'`
- Default: `'auto'` (heutiges Verhalten)
- Bei advisor-Profile-Subtask: `'advisor'`
- Bei research-Profile-Subtask: `'subagent'` (Markierung, dass kein Hauptloop)
- Bei Chat-Override (Welle 2): `'override'`
- `formatTelemetryFooter` zeigt Mode optional (Hover/Detail)
- Provider-Adapter müssen das Field durchreichen (kein Verarbeitung nötig, nur Pass-Through)

**Tests:** Mode-Field wird gesetzt, formatTelemetryFooter zeigt es bei Override.

### Task 11: Hauptloop-Default-Tier (ADR-115 Amendment)

**Modify:** `src/core/AgentTask.ts` Task-Start, eventuell `src/ui/AgentSidebarView.ts` für Send-Handler

- Beim Task-Start: API-Handler wird via `defaultMainModelTier`-Setting (default `'mid'`) aus `getTierModel(tier)` aufgelöst, statt direkt aus `activeModelKey`
- Wenn `activeProviderId` null oder `providers[]` leer (Pre-Migration-State): Fallback auf heutige `getActiveModel()`-Logik
- Wenn `defaultMainModelTier === 'flagship'`: Rollback-Modus für H-01-Fail
- Override-Pfad (Welle 2 FEAT-26-05) wird hier vorbereitet, aber noch nicht aktiv

**Tests:** Default-Tier-Resolution, Pre-Migration-Fallback (heutiges Verhalten), Flagship-Rollback-Modus.

### Task 12: Wayfinder + ARCHITECTURE.map

**Modify:** `src/ARCHITECTURE.map` (Wayfinder-Rows wurden in ARCH-Phase angelegt, jetzt Pfad-Updates wenn nötig)  
**Create:** ggf. `src/core/routing/README.md` (neue Modul-Doc)

- Wayfinder-Rows aus ARCH-Phase referenzieren existierende oder zu erstellende Pfade
- Falls Pfade abweichen (z.B. `src/core/routing/` statt `src/core/agent/`): ARCHITECTURE.map-Rows aktualisieren

## Coverage Gate

### SC-Coverage (FEAT-26-01 + FEAT-26-02)

| Feature | SC | Task | Status |
|---|---|---|---|
| FEAT-26-01 | SC-01 (Strategie-Chats auf schlankerem Modell) | Task 11 (defaultMainModelTier=mid) | Mapped |
| FEAT-26-01 | SC-02 (Eskalations-Pfad selbständig) | Task 7 (ConsultFlagshipTool) | Mapped |
| FEAT-26-01 | SC-03 (Per-Task-Limit 3) | Task 7 (Counter) | Mapped |
| FEAT-26-01 | SC-04 (Tool nicht sichtbar bei leerem Flagship) | Task 8 (Tool-Registration-Filter) | Mapped |
| FEAT-26-01 | SC-05 (Prompt-Reminder bei mistakes >= 2) | Task 9 | Mapped |
| FEAT-26-01 | SC-06 (Subtask-Tier-Inheritance + research auf fast) | Task 5 + 6 | Mapped |
| FEAT-26-01 | SC-07 (Override deaktiviert Tool für Turn) | Deferred: Welle 2 (PLAN-26 FEAT-26-05) |
| FEAT-26-01 | SC-08 (Telemetrie-Log) | Task 10 (mode-Field) + Task 7 (Counter im Log) | Mapped |
| FEAT-26-02 | SC-01 (Refresh zeigt 3 Tier-Slots) | Deferred: Welle 2 (PLAN-25 FEAT-26-03 UI) |
| FEAT-26-02 | SC-02 (Klassifikation korrekt für bekannte Modelle) | Task 2 (Klassifikator-Tests) | Mapped |
| FEAT-26-02 | SC-03 (Unbekanntes Pattern -> manuelle Zuweisung) | Task 2 (Outlier-Log) + Deferred UI in PLAN-25 |
| FEAT-26-02 | SC-04 (24h-Cache) | Task 3 (Discovery-Service) | Mapped |
| FEAT-26-02 | SC-05 (Refresh-Button) | Deferred: Welle 2 (PLAN-25 FEAT-26-03 UI) |
| FEAT-26-02 | SC-06 (Lokale Modelle manuell) | Task 2 (Klassifikator gibt empty für Ollama/LMStudio) | Mapped |
| FEAT-26-02 | SC-07 (Fehler-Behandlung bei API-Down) | Task 3 (behalte alten Stand) | Mapped |
| FEAT-26-02 | SC-08 ("Auto-detecting"-Anzeige) | Deferred: Welle 2 (PLAN-25 FEAT-26-03 UI) |

### ADR-Alignment

- ADR-120 (Advisor-Pattern): Task 5, 6, 7, 8, 9, 11 → Decision-Section operationalisiert
- ADR-121 (Tier-Klassifikator): Task 2 → Pattern-First + Capability-Fallback + OpenRouter-Pricing alle in einer pure function
- ADR-115 Amendment (Tier-Semantik): Task 4 (Helper-Resolution mit Tier-Fallback) + Task 5 (Profile-tierOverride) + Task 6 (Subagent-Inheritance)

### Codebase-Anchoring

Alle Tasks haben konkrete File-Pfade (Create / Modify / Test). Abstrakte Tasks gibt es nicht.

### Verifikations-Gates

- **Build:** `npm run build` (esbuild + deploy)
- **Type-Check:** `npx tsc`
- **Tests:** `npm run test` (Vitest)
- **Manual:** Live-Messlauf mit einem Strategie-Chat. Erwartet: Hauptloop auf Sonnet, kein consult_flagship-Call bei einfachen Turns, ggf. ein Call bei komplexer Frage. Kein Crash.

## Reihenfolge / Dependencies

```
Task 1 (Settings-Schema)
    ↓
Task 2 (ModelTierClassifier)  ─────────┐
    ↓                                   │
Task 3 (DiscoveryService) ──────────────┤
    ↓                                   │
Task 4 (Plugin-Accessors) ──────────────┤
    ↓                                   │
Task 5 (Profile-Interface)              │
    ↓                                   │
Task 6 (AgentTask-Subagent-Tier)        │
    ↓                                   │
Task 7 (ConsultFlagshipTool) ───────────┤
    ↓                                   │
Task 8 (Tool-Registration-Filter)       │
    ↓                                   │
Task 9 (Prompt-Reminder)                │
    ↓                                   │
Task 10 (Cost-Log mode-Field)           │
    ↓                                   │
Task 11 (Hauptloop-Default-Tier)        │
    ↓                                   │
Task 12 (Wayfinder)  ───────────────────┘
```

Tasks 1-4 sind sequentielle Voraussetzung (Foundation). Tasks 5-11 können nach Task 4 in beliebiger Reihenfolge, mit der Ausnahme dass Task 7 nach Task 6 kommt (Subagent-Tier-Resolution muss da sein).

## Risiken in der Implementation

- **R-A:** Hartes 3000-Cap auf Advisor-Profile darf nicht durch User-Setting überschrieben werden. Task 6 muss `profile.maxOutputTokens` mit Priorität über `subtaskTokenBudget` resolven. Test absichern.
- **R-B:** Pre-Migration-State (`activeProviderId === null`, `providers[]` leer): alle Tier-Resolution-Pfade müssen fail-safe auf bisheriges Verhalten zurückfallen. Task 4 + 11 müssen das absichern. Unit-Tests pflichten.
- **R-C:** Cache-Invalidation beim Settings-Save: wenn `tierMapping` geupdated wird, läuft der nächste Send mit altem Cache-Prefix. Acceptable, Cache-Write-Cost ist einmalig. Doku-Hinweis im Code-Kommentar.

## Coverage Gate

Coverage Gate ran. Result:

- 11/16 SC mapped to tasks
- 5 SC deferred zu PLAN-25/PLAN-26 (alle UI-bezogen, FEAT-26-03/04/05)
- Alle 3 ADRs aligned (ADR-120, ADR-121, ADR-115)
- Alle 12 Tasks haben Code-Pfade
- Verifikations-Gates: build, tsc, tests, manueller Smoke benannt

## Change Log

<!-- Append-only. Jede Mid-course-Anpassung kommt hier rein. -->

- 2026-05-15 init -- PLAN-24 angelegt für EPIC-26 Welle 1. Trigger: /coding nach /architecture-Pass. 12 Tasks, 2 Features (FEAT-26-01 + FEAT-26-02), 3 ADRs (ADR-120, ADR-121, ADR-115 Amendment).
- 2026-05-15 F-4 trigger=design -- Namens-Kollision entdeckt. Bestehendes `providers: Record<string, LLMProvider>` (Legacy, line 582 in src/types/settings.ts) belegt den Top-Level-Key `providers`. Plan-Text spricht von `providers: ProviderConfig[]`. Auflösung: neues Feld wird `providerConfigs: ProviderConfig[]` heißen, Legacy bleibt unangetastet (kein silent-rename in User-data.json). Alle Code-Stellen die im Plan-Text auf `settings.providers[]` zeigen (Tasks 1, 3, 4, 11) lesen ab jetzt aus `settings.providerConfigs[]`. ADR-122 trifft Schema-Konvention, daher auch dort Notiz unter "Schema-Implementation Notes". Kein neues ADR.

## Implementation Notes

Implementations-Pass abgeschlossen am 2026-05-16. Welle 1 Backend ist auf `feature/cost-reduction-wave-2` integriert; UI-/Migrations-/Dropdown-Teile bleiben planmäßig in PLAN-25/26.

### Pro-Task-Status

| Task | Status | Pfad(e) | Deviation |
|---|---|---|---|
| 1: Settings-Schema | Done | `src/types/settings.ts` | F-4: neues Feld heißt `providerConfigs[]` statt `providers[]` (Namens-Kollision mit Legacy `providers: Record<...>`). Top-Level-Feld `schemaVersion` bleibt undefined bis PLAN-25-Migration setzt. |
| 2: ModelTierClassifier | Done | `src/core/routing/ModelTierClassifier.ts` + Test | Pattern-Liste deckt Anthropic / OpenAI / Gemini / DeepSeek / Grok / Llama ab. OpenRouter-Pricing-Pfad: USD per 1M completion tokens (Schwellen >=50/>=5/<5). Capability-Fallback aktiviert wenn weder Pattern noch Pricing matchen. |
| 3: ModelDiscoveryService | Done | `src/core/routing/ModelDiscoveryService.ts` + Test | Wrapper über injection-bare `ModelFetcher` (production wiring in PLAN-25, wenn UI ankommt). 24h-TTL, parallel-Refresh-on-Startup, behält Cache bei API-Error. |
| 4: Plugin-Accessors | Done | `src/main.ts` | `getActiveProvider`, `getTierModel(tier)`, `getAdvisorModel`, `providerConfigToCustomModel`. `getHelperModel`: Stufe 1 helperModelKey, Stufe 2 `getTierModel('fast')`. Pre-Migration-Fallback im Tier-Resolver: leer providerConfigs[] -> null -> Caller fällt auf `getActiveModel()` zurück. |
| 5: SubagentProfile-Interface + ADVISOR_PROFILE | Done | `src/core/agent/subagent-profiles.ts` | RESEARCH_PROFILE bekommt `tierOverride: 'fast'`. Neues ADVISOR_PROFILE: read-only Tools, `tierOverride: 'flagship'`, `maxOutputTokens: 3000`. |
| 6: AgentTask Subagent-Tier-Resolution | Done | `src/core/AgentTask.ts` | spawnSubtask baut `childApi` aus `getTierModel(profile.tierOverride)` wenn gesetzt; max-Tokens-Cap durch Clone des CustomModel; ohne Profile bleibt Parent-API erhalten. |
| 7: ConsultFlagshipTool | Done | `src/core/tools/agent/ConsultFlagshipTool.ts` + Test | Schema-Validation (problem/relevant_context/failed_attempts/constraints mit Char-Caps), Per-Task-Limit via `context.consumeAdvisorSlot`, Empty-Flagship-Slot-Guard. ContextExtensions in `ToolExecutionPipeline.ts` um `consumeAdvisorSlot` erweitert (spawnSubtask-Signatur dort auch um optionales `profileName` ergänzt -- war Lücke gegenüber `ToolExecutionContext`). |
| 8: Tool-Registration-Filter | Done | `src/core/AgentTask.ts` rebuildPromptCache | Filtert `consult_flagship` aus dem cachedTools-Set wenn `plugin.getAdvisorModel()` null liefert. |
| 9: Prompt-Reminder | Done | `src/core/systemPrompt.ts` + `src/core/AgentTask.ts` + Test | Neue Section unter CACHE_BREAKPOINT_MARKER (volatile Teil, invalidiert stabilen Prefix nicht). Triggered durch `consecutiveMistakes >= 2` UND `getAdvisorModel()` vorhanden UND nicht Subtask. State-Tracking: `lastReminderState` invalidiert Prompt-Cache nur bei Threshold-Übergang. |
| 10: Cost-Log mode-Field | Done | `src/core/AgentTask.ts` (TaskCallbacks `onUsage`) + `src/ui/sidebar/TaskMonitor.ts` | `routingMode` als optionaler 6. Parameter: `'auto' \| 'override' \| 'advisor' \| 'subagent'`. Spawn-Forwarding setzt es nach Profile-Name. Provider-Adapter unverändert (auto-default reicht für Welle 1; `override` kommt mit Welle 2 Chat-Dropdown). |
| 11: Hauptloop-Default-Tier | Done | `src/main.ts` initApiHandler | `getTierModel(settings.defaultMainModelTier ?? 'mid')` zuerst, dann Fallback auf `getActiveModel()`. Rollback-Modus via `defaultMainModelTier: 'flagship'` funktioniert ohne UI-Änderung. |
| 12: Wayfinder + ARCHITECTURE.map | Done | `src/ARCHITECTURE.map`, `src/core/routing/README.md` | 5 neue Concept-Rows (model-tier-classifier, model-discovery, advisor-pattern, subagent-profiles, tier-resolution). README erklärt Erweiterungs-Pfad für Patterns + Fetcher. |

### Test-Coverage

- ModelTierClassifier.test.ts: **49 Tests** -- 1 Test entfernt (deepseek-v3 normalize stripping; nicht in realen IDs). Familien-Coverage Anthropic/OpenAI/Gemini/DeepSeek/Grok/Llama.
- ModelDiscoveryService.test.ts: **9 Tests** -- Cache-TTL, API-Error-Recovery, Parallel-Refresh, OpenRouter-Pricing-Pfad, Local-Provider-Skip, tierOverrides-Preservation.
- ConsultFlagshipTool.test.ts: **8 Tests** -- Schema-Validation, Per-Task-Limit, Empty-Flagship-Guard, Depth-Guard, Spawn-Path.
- systemPrompt.test.ts: **+5 neue Tests** -- Reminder konditional, Position unter Cache-Marker, Subtask-Skip.
- builtinModes.coverage.test.ts: angepasst (consult_flagship in agent-Gruppe registriert).

Gesamt-Pass (touched files): **110 grün**.

### Cross-Cutting Findings (additiv zu F-1..F-3)

- **F-4 trigger=design** -- siehe Change Log, Namens-Kollision providers[] -> providerConfigs[].
- **ContextExtensions.spawnSubtask** -- in `ToolExecutionPipeline.ts` fehlte der dritte `profileName?`-Parameter (gegenüber `ToolExecutionContext`). Im selben Pass mitkorrigiert. Kein eigener FIX-Item nötig, da der Aufruf bisher nur in NewTaskTool über cast lief.
- **TaskTelemetry.mode-Konflikt** -- der Entry hat bereits ein `mode`-Feld (Agent-Mode: ask/agent). Routing-Mode geht stattdessen als Log-Tag in den `[Cost]`-Stream und als 6. `onUsage`-Argument; das Telemetrie-File bleibt unverändert. Vermeidet semantische Doppelbelegung.

### Risiken Nachprüfung (R-A..R-C aus Plan)

- **R-A (3000-Cap auf Advisor):** abgesichert durch Test 6 + manueller Code-Review in `AgentTask.ts` (Profile-maxOutputTokens überschreibt subtaskTokenBudget via `{ ...tierModel, maxTokens: ... }`-Clone).
- **R-B (Pre-Migration-Fallback):** abgesichert durch Test 4 + Code: `getActiveProvider()` null -> alle Tier-Resolver liefern null -> Caller (initApiHandler, spawnSubtask) fallen auf legacy `getActiveModel()` / Parent-API zurück.
- **R-C (Cache-Invalidation bei tierMapping-Update):** offen, wird in PLAN-25 mit UI-Save behandelt; aktueller Code persistiert die Mapping-Änderung sofort via DiscoveryService.persistRefresh.

### Verifikationsgates (Plan-Coverage Gate)

- `npx tsc --noEmit` -- clean
- `npx vitest run` -- 110 EPIC-26-Tests grün; 28 pre-existing Failures (vor Branch-Start vorhanden, nicht durch diesen Plan verursacht; betreffen searchHistory/folder-rename, deferredToolLoading-Ranking, WriterLock, GlobalFileService, migrateFolderRename, ResultExternalizer-iCloud-EPERM, VaultHealthService, ExtractionQueue).
- `npm run build` -- main.js 4.3 MB, esbuild + deploy clean.
- Manueller Live-Smoke-Test in Obsidian: deferred zu /testing (Folge-Skill).

### Coverage-Gate Re-Run

Quelle: Plan-Coverage-Gate-Block oben in dieser Datei. Re-run am 2026-05-16:
- SC-Coverage: 11/16 mapped (unverändert; 5 SC bleiben deferred zu PLAN-25/26 -- UI-bezogen).
- ADR-Alignment: alle 3 ADRs operationalisiert (Tasks 2, 5+6, 9 für ADR-120; Task 2 für ADR-121; Task 4 für ADR-115-Amendment).
- Codebase-Anchoring: alle Tasks haben konkrete Files (siehe Tabelle oben).
- Verifikations-Gates: build + tsc + relevante Tests grün; Manual-Smoke an /testing übergeben.
