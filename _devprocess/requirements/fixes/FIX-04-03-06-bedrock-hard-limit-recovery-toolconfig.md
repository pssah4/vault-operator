---
id: FIX-04-03-06
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-21
---

# FIX-04-03-06: Bedrock-Provider 400 im hard-limit-recovery-Pfad

## Symptom

Live-Test 2026-05-21 (FEAT-29-10 meeting-summary Subskill) endete mit:

```
POST https://bedrock-runtime.eu-central-1.amazonaws.com/model/.../converse-stream 400 (Bad Request)
[AgentTask] Hard limit recovery call failed (non-fatal):
ValidationException: The toolConfig field must be defined when using toolUse and toolResult content blocks.
```

Der recovery-Aufruf wurde gemacht weil der Subskill die maxIteration-Grenze erreicht hatte; AgentTask haengt einen letzten user-text-only Aufruf hinten dran ("deliver final answer NOW, no tools"). Bedrock-Provider erhaelt `tools=[]`. Aber die History enthaelt `toolUse`/`toolResult`-Bloecke aus den vorigen 25 Iterationen. Bedrock's Converse-API verlangt dass wenn solche Bloecke im Body sind, `toolConfig` definiert sein muss.

## Cause

`src/api/providers/bedrock.ts` Zeile 161:

```ts
const toolConfig = tools.length > 0
    ? { tools: [...], toolChoice: { auto: {} } }
    : undefined;
```

Wenn `tools=[]` -> `toolConfig=undefined`. Aber `bedrockMessages` enthaelt weiterhin `toolUse`/`toolResult`-Bloecke aus der konvertierten History. AWS-API gibt 400.

Anthropic + OpenAI akzeptieren die gleiche History ohne toolConfig (sie tolerieren toolUse-References bei tools=[]). Provider-spezifisches Issue, kein gemeinsamer Bug.

## Fix

In `src/api/providers/bedrock.ts` vor `convertMessages`: wenn `tools.length === 0` UND irgendeine Message tool_use oder tool_result enthaelt, transformiere diese Bloecke in `[text]`-Bloecke. Beispiele:

- `tool_use { name: "read_file", input: {...} }` -> `text "[prior tool call: read_file]"`
- `tool_result { content: "..." }` -> `text "[prior tool result]"`

Die Konversation bleibt semantisch verstaendlich, aber das toolConfig-Mismatch verschwindet.

Original `messages`-Array bleibt unangetastet (Immutability). Transformation arbeitet auf einer Kopie.

## Regression test

`src/api/providers/__tests__/bedrock.test.ts` (neu falls nicht existent):

- Test 1: tools=[], history hat tool_use + tool_result -> bedrockMessages haben keine toolUse/toolResult mehr (text-Marker stattdessen).
- Test 2: tools=[validTool], history hat tool_use + tool_result -> bedrockMessages enthalten toolUse/toolResult wie vorher (Verhalten unveraendert).
- Test 3: tools=[], history ohne tool blocks -> messages durchgereicht ohne Transform.

## How tested

1. Vitest gruen.
2. Build clean.
3. Live-Replay des FEAT-29-10-Tests: erneut den meeting-summary-Subskill triggern, verifizieren dass entweder das Iteration-Limit nicht mehr erreicht wird (durch maxIterations-Cap), oder im Erreichensfall der recovery-Call durchgeht statt 400.
