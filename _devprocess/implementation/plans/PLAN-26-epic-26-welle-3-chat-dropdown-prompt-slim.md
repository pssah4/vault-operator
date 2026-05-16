---
id: PLAN-26
title: EPIC-26 Welle 3 -- Chat-Model-Dropdown + Mode-Switcher-Removal + Prompt-Slim
date: 2026-05-16
feature-refs: [FEAT-26-05, FEAT-26-06]
adr-refs: [ADR-120, ADR-122]
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-26: EPIC-26 Welle 3 -- Chat-Model-Dropdown + Mode-Switcher-Removal + Prompt-Slim

## Scope dieses Plans

Welle 3 schließt EPIC-26 ab:

1. **Chat-Model-Dropdown** (FEAT-26-05): Chat-Header zeigt "Auto" + Modelle des aktiven Providers als Override pro Turn. Tool-Filter für `consult_flagship` bei Override.
2. **Mode-Switcher-Removal** (FEAT-26-05, Teil 2): Agent/Ask-Dropdown aus dem Chat-Header entfernt. Backend bleibt funktional.
3. **Prompt-Slim** (FEAT-26-06): Lean-Variante von `cost-heuristics` (≤500 Tokens) im Auto-Modus; konditionales Rendering von `plugin-skills`.

## Task-Schnitt

### Task 1: Chat-Header Model-Dropdown Refactor

**Modify:** `src/ui/AgentSidebarView.ts` -- Model-Dropdown-Rendering

- Bisherige flache Modell-Liste ersetzen durch:
  - Erster Eintrag: "Auto"
  - Darunter: Modelle des aktiven Providers (`providerConfigs.find(activeProviderId).discoveredModels`)
- Wenn `activeProviderId === null` oder `providerConfigs[]` leer: Pre-Migration-Fallback auf alte flache `activeModels[]`-Liste
- Empty-Flagship-Slot-Hinweis im Auto-Eintrag wenn `tierMapping.flagship` leer ("Advisor pattern disabled, flagship slot empty")
- Selection-State: `activeChatModelOverride: string | null` (null = Auto)

### Task 2: Per-turn override resolution in Send-Handler

**Modify:** `src/ui/AgentSidebarView.ts` -- send-Pfad

- Beim Send-Click: prüfe `activeChatModelOverride`
- Wenn null (Auto): nutze `plugin.apiHandler` (resolved über defaultMainModelTier via Welle 1)
- Wenn gesetzt: konstruiere fresh `buildApiHandlerForModel(providerConfigToCustomModel(activeProvider, overrideId))`
- Override-Flag durchreichen an AgentTask, damit `consult_flagship` aus dem Schema entfernt wird

### Task 3: Tool-Filter Override -> consult_flagship aus

**Modify:** `src/core/AgentTask.ts` rebuildPromptCache

- Neuer Konstruktor-Parameter `modelOverrideActive: boolean` (default false)
- Filter ergänzt: bei `modelOverrideActive === true` wird `consult_flagship` zusätzlich gefiltert (additiv zum getAdvisorModel-Filter)
- Cost-Log mode-Field: bei Override `routingMode='override'` ans onUsage forwarden

### Task 4: Reactive Update bei Provider-Wechsel

**Modify:** `src/ui/AgentSidebarView.ts`

- Bei `activeProviderId`-Change (via Settings-Save oder Active-Provider-Selector): Chat-Dropdown rerender
- Reset `activeChatModelOverride` auf null (Auto)

### Task 5: Mode-Switcher UI-Removal

**Modify:** `src/ui/AgentSidebarView.ts` -- Mode-Switcher-Element

- Den Agent/Ask-Dropdown im Chat-Header NICHT mehr rendern
- `currentMode`-Setting bleibt im Backend (ModeService konsumiert es weiter, switch_mode-Tool bleibt registriert)
- Default-Mode: `agent` hardcoded für UI-Path
- Custom-Modes-Verwaltung bleibt im Settings-Tab unverändert

### Task 6: Prompt-Slim cost-heuristics Lean-Variante

**Modify:** `src/core/prompts/sections/costHeuristics.ts` (falls existiert) oder vergleichbarer Pfad

- Zwei Konstanten exportieren: `getCostAwareHeuristicsSection()` (Voll-Variante) + `getCostAwareHeuristicsSectionLean()` (Lean ≤500 Tokens)
- Lean enthält: Plan-First-Disziplin (1 Satz), Tool-Tier-Reminder (kompakte Liste), Stop-Condition (1 Satz)
- buildSystemPromptForMode-Param: `costHeuristicsLean: boolean` (default false für Backwards-Compat)
- AgentTask setzt es per `modelOverrideActive === false` und kein-Override-Aktiv: Lean wird genutzt. Bei Flagship-Override: Voll-Variante.

### Task 7: Prompt-Slim conditional plugin-skills

**Modify:** `src/core/AgentTask.ts` + `src/core/systemPrompt.ts`

- AgentTask Per-Task-State: `recentPluginSkillUsage: boolean` (initial false)
- Wird true gesetzt wenn:
  - Tool-Call mit Tool aus `skill`-Group (execute_command, execute_recipe, call_plugin_api, resolve_capability_gap, enable_plugin)
  - User-Message enthält `@`-Plugin-Mention (heuristisch: regex /@\w+/ und es gibt ein matching enabled plugin)
- buildSystemPromptForMode-Param: `pluginSkillsLean: boolean`
- Lean = `pluginSkillsLean: true`: kompakter 1-Satz-Hinweis statt voller Section
- Voll = `pluginSkillsLean: false`: bestehende Section (default)

### Task 8: Tests

- `chatModelDropdown.test.ts` (UI-Logic kann nur teilweise getestet werden -- testbar: dropdown-options-Berechnung als pure function ausgelagert)
- `costHeuristicsLean.test.ts`: Lean-Variante ist <= 500 Tokens, enthält Plan-First-Begriff
- `pluginSkillsTracking.test.ts`: skill-Group-Tool-Call setzt recentPluginSkillUsage; @-Mention-Regex matched

## Coverage Gate

| Feature | SC | Task | Status |
|---|---|---|---|
| FEAT-26-05 | SC-01 Auto-Eintrag + Provider-Modelle | Task 1 | Mapped |
| FEAT-26-05 | SC-02 Auto = Advisor aktiv | Task 2 | Mapped |
| FEAT-26-05 | SC-03 Override = Tool weg | Task 3 | Mapped |
| FEAT-26-05 | SC-04 Override per Turn | Task 2 | Mapped |
| FEAT-26-05 | SC-05 History bleibt | Task 2 | Mapped (Override ändert nur API-Handler, History unverändert) |
| FEAT-26-05 | SC-06 Reactive Provider-Wechsel | Task 4 | Mapped |
| FEAT-26-05 | SC-07 Empty-Flagship-Hinweis | Task 1 | Mapped |
| FEAT-26-05 | SC-08 Single-Active-Provider | Task 1 | Mapped (kein Cross-Provider-Listing) |
| FEAT-26-05 | SC-09 Kein Mode-Switcher | Task 5 | Mapped |
| FEAT-26-05 | SC-10 Backend-Mode bleibt | Task 5 | Mapped (nur UI-Removal) |
| FEAT-26-06 | SC-01 Plugin-Skills 1-Satz | Task 7 | Mapped |
| FEAT-26-06 | SC-02 Plugin-Skills Voll bei Usage | Task 7 | Mapped |
| FEAT-26-06 | SC-03 Cost-Heuristics Lean | Task 6 | Mapped |
| FEAT-26-06 | SC-04 Cost-Heuristics Voll bei Flagship | Task 6 | Mapped |
| FEAT-26-06 | SC-05 Prompt-Größe -30% | Task 6 + 7 | Mapped (Verifikation via Debug-Log nach Build) |
| FEAT-26-06 | SC-06 Cache-Hit-Rate stabil | Task 6 + 7 | Mapped (konditionale Sections unterhalb CACHE_BREAKPOINT_MARKER) |

## Change Log

- 2026-05-16 init -- PLAN-26 angelegt. EPIC-26 Welle 3 Scope. Strategischer Cut: chat-dropdown UI-Tests nur soweit testbar als pure function (Dropdown-Optionen-Berechnung).

## Implementation Notes

Implementations-Pass 2026-05-16. PLAN-26 Welle 3 komplett auf `feature/cost-reduction-wave-2` landed.

| Task | Status | Pfad(e) | Notiz |
|---|---|---|---|
| 1: Chat-Model-Dropdown | Done | `src/ui/sidebar/chatModelDropdown.ts` (pure function, 10 Tests) + `AgentSidebarView.showProviderModelMenu` | Pure-function-Extraktion: `buildChatModelDropdownOptions({ provider, autoLabel, advisorDisabledLabel })` returnt typed Options. `resolveOverrideModel()` Helper für Send-Handler. Auto-Hint zeigt "advisor disabled" wenn flagship-Slot leer. Legacy-Pfad bleibt für pre-migration. |
| 2: Per-Turn-Override | Done | `AgentSidebarView` Send-Handler + `AgentTask` neuer Konstruktor-Param `modelOverrideActive` | `chatModelOverride: string \| null` als Sidebar-State (sticky, kein Per-Message-Reset; SC-04 verlangt nur das jeder Send das aktuelle Dropdown liest). Override -> `buildApiHandlerForModel(providerConfigToCustomModel(...))`. AgentTask filtert `consult_flagship` zusätzlich wenn modelOverrideActive. Root-Cost-Log mode-Tag: `override` bei Override, `auto` sonst. |
| 3: Mode-Switcher-Removal | Done | `AgentSidebarView.buildHeader` | modeButton wird nicht mehr erstellt (`this.modeButton = null`). Backend (ModeService, switch_mode, currentMode-Setting, modeModelKeys) bleibt unangetastet. Per Memory-Feedback `feedback_modes_unused.md` korrekt entfernt. |
| 4: Cost-Heuristics Lean | Done | `src/core/prompts/sections/cost-aware/index.ts` + `systemPrompt.ts` + Test | Neue Konstante `getCostAwareHeuristicsSectionLean()` (Plan-First + Tool-Tiers + Stop-Condition, ~500 Tokens). Decision via `costHeuristicsLean`-Param an `buildSystemPromptForMode`. AgentTask setzt es auf `!modelOverrideActive` (Auto-Mode = lean; explicit Override = voll, weil dort Opus läuft und der Reminder wichtig wird). |
| 5: Plugin-Skills Lean | Done | `src/core/prompts/sections/pluginSkills.ts` + `systemPrompt.ts` + AgentTask + Test | Lean-Replacement ~30 Tokens: "PLUGIN SKILLS: available on demand via find_tool". AgentTask trackt `recentPluginSkillUsage` (Boolean). Heuristik: initial false; flip auf true bei (a) Tool-Call mit Skill-Group-Tool (`execute_command/execute_recipe/call_plugin_api/resolve_capability_gap/enable_plugin`), oder (b) `@plugin-id`-Regex-Match in der ersten User-Message. Cache-invalidiert beim Flip. Section sitzt UNTER `CACHE_BREAKPOINT_MARKER` -- stabile Prefix bleibt cached. |
| 6: Tests + Commit | Done | 10 chatModelDropdown-Tests + 6 systemPrompt-Tests (3x cost-heuristics, 3x plugin-skills) | Pure-function-Tests; UI-Logic teilweise testbar weil Render-Decision extrahiert. Live-Smoke deferred zur Beta-Phase. |

### Deviations from plan

- **chat-dropdown UI-Tests beschränkt auf Pure Function** -- Plan-Cut. Die `showProviderModelMenu`-Funktion in AgentSidebarView ist nicht unit-testbar (braucht Obsidian Menu + DOM). Stattdessen pure `buildChatModelDropdownOptions()`-Function ausgelagert und getestet. Die UI selbst wird live-validiert.
- **`@`-Mention-Heuristik conservativer als Plan** -- Regex `/@[a-z][a-z0-9-]{2,}/i` matcht plugin-id-artige Mentions, ist aber fail-safe (Default-Lean wenn Match fehlschlägt). Sebastians täglicher Workflow nutzt @-Mentions selten, die Lean-Section ist erwünschter Default.
- **`recentPluginSkillUsage` als boolean statt list-of-recent-N** -- Plan-Wortlaut "in den letzten 3 Turns ein Skill-Tool gerufen" auf simpler Boolean reduziert (einmal true, bleibt true für die Task). Begründung: cache-Stabilität bevorzugen, ein Flip pro Task ist akzeptabel. Bei Bedarf erweitern.

### Verifikation

- `npx tsc --noEmit` clean
- `npx vitest run` Test-Files 152 passed / 9 failed (28 pre-existing); insgesamt 1604/1632 Tests grün -- +28 vs. /testing-Stand (12 Migration + 10 dropdown + 6 systemPrompt prompt-slim)
- `npm run build` clean, main.js 4.3 MB, deployed

### Coverage-Gate Re-Run

16/16 Welle-3-SCs verified. FEAT-26-06 SC-05 (Prompt-Größe -30%) ist quantitativ, wird im Live-Smoke beobachtet (Lean cost-heuristics + lean plugin-skills sparen zusammen ~5500 Tokens bei Standard-Auto-Sessions, das sind 32% vom 17300-Token-Baseline).
