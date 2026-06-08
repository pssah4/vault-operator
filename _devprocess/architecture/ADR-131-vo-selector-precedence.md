---
id: ADR-131
title: VO-Selektor-Vorrang vor Stigmergy-Suggestion
date: 2026-06-07
deciders: [Sebastian, Architekt-Agent]
asr-refs: []
feature-refs: [FEAT-32-01]
related-adrs: [ADR-130, ADR-061, ADR-062]
supersedes: null
superseded-by: null
---

# ADR-131: VO-Selektor-Vorrang vor Stigmergy-Suggestion

## Context

ADR-130 etabliert Stigmergy als Recall-Layer mit VO-Praezedenz. Diese ADR konkretisiert die Resolver-Regel: wie genau wird im Code entschieden, wenn ein VO-Selektor (Recipe, FastPath) UND eine Stigmergy-Suggestion gleichzeitig anwendbar sind. Heute laufen beide Schichten unabhaengig: `recipesSection` landet im System-Prompt-Prefix (cached), `pathGuidance().text` wird am User-Message-Tail (uncached) angehaengt. Bei Recipe-Match + Stigmergy-Pin sieht das Modell zwei sich potenziell ueberschneidende Anleitungen.

Zusaetzlich fluesst Substrate-Reinforcement heute aus jeder Pipeline-Dispatch -- auch aus FastPath-Tools, die nicht vom Modell sondern vom FastPath-Batch-Executor gerufen werden. Substrate lernt also Plugin-Mechanik statt Modell-Entscheidungen.

**Triggering ASR:** EPIC-32 Contract 1+2 (Recall, nicht Selector; VO-Praezedenz).

## Decision drivers

- **Kein Doppel-Hint pro Turn**: Recipe + Stigmergy-`guidance.text` duerfen nicht gemeinsam gerendert werden.
- **`guidance.path` bleibt aktiv**: Pre-Activation deferred Tools ist `find_tool`-Substitution, nicht Selector-Konkurrenz.
- **Cache-Prefix-Stabilitaet (ADR-062)**: System-Prompt-Prefix darf nicht von der Praezedenz-Entscheidung abhaengen.
- **Substrate-Hygiene**: Substrate lernt nur, was das Modell wirklich gewaehlt hat.
- **NOOP-Sicherheit**: Daemon-down-Pfade muessen das gleiche Verhalten zeigen wie ohne Praezedenz-Regel.

## Considered options

### Option 1: Praezedenz im Prompt-Building

`recipesSection` und `guidance.text` werden im Prompt-Builder gegen Recipe-Match gegated. Falls Recipe matched, kein `guidance.text`.

- **Pro:** Eine einzige Resolution-Stelle, klare Regel.
- **Con:** `recipesSection` ist Teil des cached Prefix, `guidance.text` ist Tail. Beide in einem Schritt zu resolven mischt zwei Cache-Schichten. Bei FastPath-Skip (z.B. `targetsChatHistory`) muesste der Resolver doppelt entscheiden.

### Option 2: Praezedenz nach FastPath-Outcome (gewaehlt)

Recipe-Match wird HOCHGEZOGEN vor den `history.push`. FastPath-Branch laeuft ZUERST. Bei FastPath-Erfolg wird `guidance.text` unterdrueckt; sonst nicht. `guidance.path` bleibt IMMER aktiv (Pre-Activation deferred Tools laeuft unabhaengig). `recipesSection` im System-Prompt-Prefix bleibt unangetastet (Cache-Stabilitaet).

- **Pro:** Praezedenz feuert NUR bei tatsaechlichem FastPath-Erfolg; bei FastPath-Skip (z.B. chat-source-Query) bleibt Stigmergy-Hint nuetzlich. Cache-Prefix unveraendert. Substrate-Hygiene durch separaten Pipeline-`source`-Tag.
- **Con:** Mehr State im AgentTask-Resolver (`suppressGuidanceText` Closure-Var, `stigmergyDecisionSnapshot`). Recipe-Match wandert in `AgentTaskRunConfig`.

### Option 3: Praezedenz an der Pipeline

Pipeline entscheidet pro Tool-Dispatch ob Recipe-Tool oder Stigmergy-Tool ranken. Aenderung an `executeTool`.

- **Pro:** Maximale Granularitaet.
- **Con:** Pipeline ist Tool-Execution-Schicht, nicht Selector-Schicht. Resolver-Logik dort waere Misplaced. Bricht das ADR-01 Pipeline-Single-Responsibility-Prinzip.

## Decision outcome

Option 2 ist gewaehlt. Die Resolver-Regel im Pseudo-Code:

```typescript
// In AgentTask.run() nach pathGuidance() berechnen
const guidance = stigmergyTurn.pathGuidance(descOf);
const bestMatch = config.recipeMatches?.[0]
    ?? this.toolRegistry.plugin.recipeMatchingService?.match(...)?.[0];

const fastPathEligible = bestMatch
    && !targetsChatHistory
    && bestMatch.score >= 0.5
    && bestMatch.recipe.source === 'learned'
    && bestMatch.recipe.successCount >= 3;

let suppressGuidanceText = false;
let recipeWinner: string | null = null;
let fastPathFired = false;

if (fastPathEligible) {
    const fpResult = await runFastPath(bestMatch, ...);  // existing block
    fastPathFired = fpResult?.success && fpResult.toolCallsExecuted > 0;
    if (fastPathFired) {
        suppressGuidanceText = true;
        recipeWinner = bestMatch.recipe.id;
    }
}

// History-Push erst JETZT
const userMessageWithGuidance = (!suppressGuidanceText && guidance.text)
    ? appendGuidanceText(userMessage, guidance.text)
    : userMessage;
history.push({ role: 'user', content: userMessageWithGuidance });

// Snapshot fuer ADR-132 / ADR-133 Promotion-Pfad
const stigmergyDecisionSnapshot = {
    enabled: stigmergyTurn.enabled,
    mode: stigmergyTurn.decisionMode,
    pinnedPath: guidance.path.slice(),
    guidanceTextSuppressed: suppressGuidanceText,
    recipeWinner,
};
```

Zusaetzliche Substrate-Hygiene: `ToolExecutionPipeline.executeTool` bekommt `opts.source: 'model' | 'fastpath' | 'planner'` mit Default `'model'`. `capability_invoked`/`capability_returned` feuern nur bei `source === 'model'`. FastPath uebergibt `'fastpath'`. Inner Dispatcher-Tools (`use_mcp_tool`, `invoke_skill`) propagieren `source` aus dem `ToolExecutionContext`.

## Consequences

- Recipe-Match wird genau einmal pro Turn berechnet (Plumbing via `AgentTaskRunConfig.recipeMatches`).
- `guidance.path` bleibt fuer Pre-Activation deferred Tools aktiv, auch wenn `guidance.text` unterdrueckt wird. Pre-Activation ist nicht Selector-Konkurrenz sondern `find_tool`-Substitution.
- Substrate sieht keine FastPath-Tools mehr. Das ist by design (Substrate lernt Modell-Entscheidungen, nicht Plugin-Mechanik). Telemetrie im Stigmergy-Studio muss das beruecksichtigen.
- `stigmergyDecisionSnapshot` ist closure-lokal in `AgentTask.run()`, nicht `this.*`. Subagent-Re-Entry-Pfade erhalten den Parent-Snapshot nicht.
- Cache-Prefix bleibt unveraendert (`recipesSection` im Prefix, `guidance.text` am Tail).
- Bei NOOP_TURN (`stigmergyTurn.enabled === false`, `decisionMode === 'none'`) feuert kein Suppress-Branch; Loop laeuft exakt wie heute.
- Bei `recipeMatchingService` Absenz oder Match-Throw faellt der Resolver auf `bestMatch = undefined` zurueck; FastPath laeuft nicht; `guidance.text` bleibt aktiv.

## Related

- Code: `src/core/AgentTask.ts:497-700`, `src/core/tool-execution/ToolExecutionPipeline.ts:440-480`
- ADR-130 (Stigmergy als Recall-Layer)
- ADR-061 (FastPath Execution)
- ADR-062 (KV-Cache-Optimierte Prompt-Reihenfolge)
- FEAT-32-01 (Implementation)
