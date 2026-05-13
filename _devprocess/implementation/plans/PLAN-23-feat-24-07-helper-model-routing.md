# PLAN-23: FEAT-24-07 / ADR-115 -- Internes Hilfs-Modell-Routing (helperModelKey + getHelperApi)

> Status: Implemented 2026-05-13
> Branch: `feature/feat-24-07-helper-model-routing` (off `dev`)
> Refs: FEAT-24-07, ADR-115 (Amendment 2026-05-13), ADR-11, ADR-12, ADR-17, ADR-61, RESEARCH-36 Abschnitt 8 (Hebel H)
> Vorgaenger: PLAN-22 (FEAT-24-04 Subagent-Delegation, released auf `dev`)

---

## 1. Kontext

EPIC-24 letztes Item. ADR-115 will einen optionalen Hilfs-Modell-Slot fuer
Agent-interne LLM-Calls. Critical-Review gegen den realen Code zeigt ein
**bestehendes Per-Feature-Routing-Pattern**:

- `MemorySettings.memoryModelKey` -> `plugin.getMemoryModel()` -> `buildApiHandlerForModel`
- `ChatLinkingSettings.titlingModelKey` -> `activeModels.find(...)` -> `buildApiHandlerForModel`

Memory-Atomizer, ChatLinking-Titling und RecipePromotion sind ueber dieses
Pattern bereits route-able. Die ADR-115-genannten Call-Sites teilen sich
auf in:

- **Schon route-able** (eigener Per-Feature-Key, bleibt): Memory-Atomizer,
  ChatLinking-Titling.
- **Heute hart auf `this.api`** (= Haupt-Modell, soll geroutet werden):
  `condenseHistory` (AgentTask), `FastPathExecutor` planner/presenter,
  `plan_presentation` (PlanPresentationTool nutzt heute `getActiveModel`
  was auch das Haupt-Modell ist), Recipe-Promotion-callback in `main.ts`
  (heute `getMemoryModel()`).

PLAN-23 fuegt einen catch-all `helperModelKey` als Top-Level-Setting hinzu
(analog `activeModelKey`). Helper-Function `getHelperApi(plugin, fallback)`
liefert den Helper-Handler ODER `fallback`. Die 4 Call-Sites wechseln auf
diese Funktion.

### Recipe-Promotion-Spezial: helper-first-memory-fallback

Heute: `getMemoryModel()`-only-callback in `main.ts:1180`. Mit PLAN-23 chained:

```
() => {
  const helper = this.getHelperModel();
  if (helper) { try { return buildApiHandlerForModel(helper); } catch {} }
  const memModel = this.getMemoryModel();
  if (memModel) return buildApiHandlerForModel(memModel);
  return null;
}
```

Damit: User, die bisher nur `memoryModelKey` gesetzt haben, sehen kein
Behavior-Change (Recipe laeuft weiter auf Memory-Modell). User, die
zusaetzlich `helperModelKey` setzen, bekommen den Helper fuer Recipe.

### Out-of-Scope (begruendet)

- `Memory-Atomizer` / `SingleCallExtractor`: eigene Memory-Domaene + eigener
  `memoryModelKey`.
- `ChatLinking-Titling`: eigene `titlingModelKey`.
- `classifyText`-Hook in `main.ts:830` (Stufe3 Web-Update-PreFilter):
  separater Pfad, nicht in ADR-115 erwaehnt. Eigene IMP wenn der Live-
  Messlauf zeigt dass das relevant ist.
- `hard-limit-recovery` in `AgentTask.ts:1081`: Output ist user-facing
  ("Deliver your final answer NOW"). Per ADR-115-Decision-Driver auf
  Haupt-Modell.
- ReAct-Hauptloop (`AgentTask.ts:705`): natuerlich Haupt-Modell.

---

## 2. Aenderungen

### 2.1 Settings (Task 1)

NEU in `src/types/settings.ts`:

```ts
export interface ObsidianAgentSettings {
    activeModels: CustomModel[];
    activeModelKey: string;
    // FEAT-24-07 / ADR-115: optional helper-model key for internal LLM calls
    // (condensing, fast-path planner/presenter, plan_presentation,
    // recipe-promotion). Empty string = no helper, all internal calls run
    // on the main model. Mirrors the per-feature pattern of
    // memoryModelKey / titlingModelKey but as a generic catch-all.
    helperModelKey: string;
    // ... bestehende Felder ...
}
```

Default in `DEFAULT_SETTINGS`: `helperModelKey: ''`.

### 2.2 getHelperModel (Task 1)

NEU in `src/main.ts` analog zu `getMemoryModel`:

```ts
getHelperModel(): CustomModel | null {
    const key = this.settings.helperModelKey;
    if (!key) return null;
    const model = this.settings.activeModels.find((m) => getModelKey(m) === key);
    if (!model || !model.enabled) return null;
    return model;
}
```

### 2.3 getHelperApi (Task 2)

NEU: `src/core/helper-api.ts`.

```ts
/**
 * FEAT-24-07 / ADR-115 -- helper-model routing for agent-internal LLM calls.
 *
 * Returns an ApiHandler bound to the user-configured helperModel, or the
 * provided fallback. Fails closed: build errors fall back, not crash.
 */
import type { ApiHandler } from '../api/types';
import { buildApiHandlerForModel } from '../api/index';
import type ObsidianAgentPlugin from '../main';

export function getHelperApi(plugin: ObsidianAgentPlugin, fallback: ApiHandler): ApiHandler {
    const model = plugin.getHelperModel();
    if (!model) return fallback;
    try {
        return buildApiHandlerForModel(model);
    } catch (e) {
        console.warn('[helper-api] Failed to build helper handler; falling back to main:', e);
        return fallback;
    }
}
```

### 2.4 AgentTask.condenseHistory (Task 3)

`condenseHistory()` in `AgentTask.ts:1308`+ ruft heute
`this.api.createMessage(systemPrompt, safeCondensingMessages, [], abortSignal)`
(Line 1463). Umstellung:

```ts
const helperApi = getHelperApi(this.toolRegistry.plugin, this.api);
for await (const chunk of helperApi.createMessage(systemPrompt, safeCondensingMessages, [], abortSignal)) {
    // ...
}
```

Plugin ist via `this.toolRegistry.plugin` erreichbar (vorhandenes Pattern).

### 2.5 FastPathExecutor planner/presenter (Task 4)

`FastPathExecutor.ts:275` ruft `this.api.createMessage`. Konstruktor bekommt
heute `api: ApiHandler` als Parameter. Optionen:

**Option A:** Konstruktor um `plugin` erweitern, `getHelperApi(plugin, this.api)`
intern bestimmen.

**Option B:** Konstruktor um optionalen `apiOverride: ApiHandler | undefined`
erweitern; Caller (`AgentTask` Line 331 `new FastPathExecutor(this.api, pipeline)`)
uebergibt den Helper-API-Handler vor-resolved.

Entscheidung: **Option A** (FastPathExecutor kennt sein Plugin nicht
ueber `pipeline.toolRegistry.plugin`; minimal-invasiv). Konstruktor:
`new FastPathExecutor(api, pipeline, plugin)` -- wenn plugin gesetzt,
intern `getHelperApi(plugin, api)`.

### 2.6 PlanPresentationTool.callPlanningLLM (Task 5)

`PlanPresentationTool.ts:163-169`: heute
```ts
const model = this.plugin.getActiveModel();
const api = buildApiHandlerForModel(model);
```

Umstellung: Helper hat Vorrang, fallback auf den aktiven-Modell-Handler:

```ts
const activeModel = this.plugin.getActiveModel();
if (!activeModel) throw new Error('Kein aktives Modell konfiguriert. ...');
const mainApi = buildApiHandlerForModel(activeModel);
const api = getHelperApi(this.plugin, mainApi);
```

### 2.7 RecipePromotionService-callback (Task 6)

`main.ts:1180-1185`: getApi-callback wird zu helper-first-memory-fallback:

```ts
this.recipePromotionService = new RecipePromotionService(
    this.recipeStore,
    () => {
        // FEAT-24-07 / ADR-115: helper-model has priority.
        const helper = this.getHelperModel();
        if (helper) {
            try { return buildApiHandlerForModel(helper); } catch (e) {
                console.warn('[RecipePromotion] helper-model build failed, falling back to memory:', e);
            }
        }
        // Backwards-compat fallback: memory-model.
        const memModel = this.getMemoryModel();
        if (memModel) return buildApiHandlerForModel(memModel);
        return null;
    },
    getLearnedEnabled,
    this.episodicExtractor,
);
```

### 2.8 Tests (Task 7)

- `src/core/__tests__/helper-api.test.ts` (NEU, 4-6 Tests):
  - Leerer `helperModelKey` -> fallback returned.
  - Gueltiger `helperModelKey` -> Helper-Handler returned (mocked
    buildApiHandlerForModel).
  - `helperModelKey` zeigt auf nicht-aktiven Modell-Key -> fallback.
  - `helperModelKey` zeigt auf disabled Modell -> fallback.
  - `buildApiHandlerForModel` throws -> fallback + console.warn.
- `src/core/__tests__/getHelperModel.test.ts` (NEU oder Teil von
  helper-api.test.ts): plugin.getHelperModel-Lookup-Verhalten.
- AgentTask-Tests, FastPathExecutor-Tests: keine Aenderung erwartet
  (unit-Tests testen die Default-Fallback-Pfade die unveraendert
  bleiben, weil helperModelKey leer ist im Default-Setup).

### 2.9 Dokumentation

- `FEAT-24-07-hilfs-modell-routing.md`: SC konkretisiert + plan-refs.
- `ADR-115-helper-model-routing.md`: Status `Proposed` -> `Accepted` +
  Amendment 2026-05-13.
- `BACKLOG.md`: FEAT-24-07 Status `In Progress`; PLAN-23 als neue Row;
  ADR-115 Status.

---

## 3. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/types/settings.ts` | `helperModelKey: string` Top-Level + Default | niedrig |
| `src/main.ts` | `getHelperModel()`-Method + Recipe-callback helper-first | mittel (zentrale Stelle) |
| `src/core/helper-api.ts` | NEU (getHelperApi) | niedrig |
| `src/core/AgentTask.ts` | condenseHistory createMessage -> getHelperApi | niedrig |
| `src/core/FastPathExecutor.ts` | Konstruktor + plugin-Param + getHelperApi | mittel (drei call-sites in der Konstruktor-Caller-Kette) |
| `src/core/tools/vault/PlanPresentationTool.ts` | callPlanningLLM api-Konstruktion | niedrig |
| `src/core/__tests__/helper-api.test.ts` | NEU | niedrig |

## 4. Nicht betroffen (Blast-Radius)

- ApiHandler-Interface und Provider-Implementierungen (anthropic, openai, etc.).
- `buildApiHandlerForModel`-Factory.
- Memory-Atomizer / SingleCallExtractor (eigener memoryModelKey).
- ChatLinking-Titling (eigener titlingModelKey).
- classifyText in main.ts (separater Pfad, OOS).
- ReAct-Hauptloop + hard-limit-recovery.
- AgentTask.spawnSubtask + Subagent-Profile (FEAT-24-04 unangetastet).
- Tool-Pipeline-Caps.

## 5. Verifikation

1. **Build:** `npm run build` gruen (tsc + esbuild + deploy).
2. **Tests:** `npm test` -- Baseline 1460 auf dev. Erwartet: +4-6 neue
   Tests fuer helper-api.
3. **Typecheck:** `npx tsc -noEmit -skipLibCheck` clean.
4. **Lint:** `npm run lint` 0 errors.
5. **`/consistency-check` mode A:** keine neuen Findings durch FEAT-24-07.
6. **Funktional (manuell, `[AWAITING RE]` SC-8):**
   - Hilfs-Modell in Settings konfigurieren (z.B. Haiku via Anthropic).
   - Vault-Session mit langem Kontext, der Condensing triggert.
   - `[Cost]`-Log zeigt das Hilfs-Modell beim Condensing-Call.
   - `helperModelKey` leeren -> alle Calls wieder auf Haupt-Modell.

## 6. Plan Coverage Gate

| SC (FEAT-24-07) | mapped to Task | Status |
|---|---|---|
| SC-1 `helperModelKey` + `getHelperModel` | Task 1 | mapped |
| SC-2 `getHelperApi(plugin, fallback)` mit Build-Fehler-Fallback | Task 2 | mapped |
| SC-3 condenseHistory geroutet | Task 3 | mapped |
| SC-4 FastPathExecutor geroutet | Task 4 | mapped |
| SC-5 plan_presentation geroutet | Task 5 | mapped |
| SC-6 Recipe-Promotion helper-first-memory-fallback | Task 6 | mapped |
| SC-7 Bestehende Funktionalitaet unveraendert | Vollstaendiger Test-Run | mapped (1460 Baseline) |
| SC-8 Live-Messlauf | Deferred | manuell |

ADR-115 Decisions:
- "ein optionaler Slot" -> Task 1 (`helperModelKey` Top-Level).
- "geroutete Call-Sites: Condensing, FastPath, plan_presentation, Recipe" -> Tasks 3-6.
- "Robuster Fallback" -> Task 2 (`getHelperApi` Build-Fehler-Fallback) + Task 6 (Recipe-callback chain).
- "ein Schalter, kein Wildwuchs" -> Task 1 (genau ein neuer Setting-Eintrag).

## 7. Change Log

### 2026-05-13 -- Plan persistiert (trigger=design)

Aufgesetzt mit dem ADR-115-Amendment "Call-Site-Liste + Recipe-Migration".
Coverage Gate beim Persistieren erfuellt (SC-1..7 mapped, SC-8 Live-Messlauf
deferred).

### 2026-05-13 -- Implementation komplett (trigger=task)

Implementation in einem Sprint ohne Mid-course-Trigger:

- Task 1+2 (Settings + Helper): `helperModelKey: string` Top-Level in
  `ObsidianAgentSettings` Default `''`; `plugin.getHelperModel(): CustomModel | null`
  analog `getMemoryModel`; `src/core/helper-api.ts` neu mit `getHelperApi(plugin, fallback)`
  (fail-closed: Build-Fehler -> `console.warn` + fallback).
- Task 3 (condenseHistory): `AgentTask.ts:1463` Call ueber
  `getHelperApi(this.toolRegistry.plugin, this.api)`.
- Task 4 (FastPathExecutor): neue private Methode `getInternalApi()`
  nutzt `pipeline.getPlugin()` (neuer accessor in
  `ToolExecutionPipeline.ts`) und `getHelperApi`. Der eine
  createMessage-Call (Line 275) ruft `internalApi.createMessage`.
  Konstruktor-Signatur bleibt unveraendert (Plugin kommt ueber den
  bestehenden Pipeline-Pfad statt durch einen neuen Konstruktor-Param --
  weniger invasiv als die im PLAN diskutierte Option A).
- Task 5 (plan_presentation): `PlanPresentationTool.callPlanningLLM`
  baut weiterhin `mainApi` aus `getActiveModel()` und chained dann
  `getHelperApi(plugin, mainApi)`.
- Task 6 (RecipePromotion-callback): `main.ts` getApi-callback
  helper-first-memory-fallback chained. User mit nur `memoryModelKey`
  sehen kein Behavior-Change; User mit `helperModelKey` haben den
  Helper als Vorrang.
- Task 7 (Doku): ADR-115 Status `Accepted` + Amendment 2026-05-13;
  FEAT-24-07 SC konkretisiert; BACKLOG row + PLAN-23 row.
- Task 8 (Tests): `src/core/__tests__/helper-api.test.ts` neu (4 Tests:
  no-config-fallback, helper-built, build-throws-fallback,
  contract-only-via-getHelperModel). **+4 Tests vs dev-Baseline 1460 ->
  1464 gruen.**

Verifikation:

- `npm test`: **1464 gruen** (+4).
- `npm run build`: gruen (tsc + esbuild production + Vault-Deploy).
- `npm run lint`: 0 errors (664 vorbestehende warnings unveraendert).
- `npx tsc -noEmit -skipLibCheck`: clean.

## 8. Implementation Notes

Per-task commit SHAs werden im phase-end-Commit gebuendelt.

Befunde waehrend Implementation:

- **FastPathExecutor-Konstruktor-Param vermieden.** Der Plan diskutierte
  Option A (Konstruktor um `plugin` erweitern) vs. Option B (api-Override
  vor-resolved). Realisiert wurde eine dritte Option: `ToolExecutionPipeline`
  hat einen neuen `getPlugin()`-accessor, FastPathExecutor liest das
  Plugin daraus on-demand. Vorteil: keine Aenderung der `new FastPathExecutor(...)`-
  Call-Sites in `AgentTask.ts:331`.
- **Tests-Mock fuer buildApiHandlerForModel:** vitest `vi.mock('../../api/index')`
  gibt einen stubbed handler zurueck, der pro Model-Name unterscheidet
  (`__mock_model` Markierungs-Property im Mock-Return). Damit kann der
  Test deterministisch pruefen, ob Helper oder Fallback geliefert wurde.
- **No-direct-settings-access-Contract:** der vierte Test verifiziert,
  dass `getHelperApi` nur `plugin.getHelperModel()` aufruft und nicht
  in `plugin.settings.helperModelKey` peekt. Damit lebt die "ist enabled?
  in activeModels?"-Logik an einer Stelle (`getHelperModel`), und der
  Helper-API-Pfad bleibt einfach.

Was bewusst NICHT geaendert wurde:

- `ChatLinking-Titling`-Call (eigenes `titlingModelKey` + eigener
  Aufrufer in `AgentSidebarView.ts:2620`). Out of scope per ADR-115
  Amendment.
- `Memory-Atomizer` / `SingleCallExtractor` (eigenes `memoryModelKey`,
  separate Domaene).
- `classifyText` in `main.ts:830` (Stufe3 Web-Update-PreFilter). Separater
  Pfad; eigene IMP wenn der Live-Messlauf zeigt dass es relevant ist.
- `hard-limit-recovery` in `AgentTask.ts:1081` (Output user-facing).
- ReAct-Hauptloop (`AgentTask.ts:705`).
