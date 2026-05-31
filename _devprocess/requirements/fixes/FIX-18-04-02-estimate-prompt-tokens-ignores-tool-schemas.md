---
id: FIX-18-04-02
feature: FEAT-18-04
epic: EPIC-18
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-31
---

# FIX-18-04-02: estimatePromptTokens ignoriert Tool-Schemas, resolveOutputBudget unterschaetzt Input

## Symptom

Code-Review 2026-05-31 (xhigh focused): `estimatePromptTokens` summiert nur `systemPrompt.length` + Message-Content. **Tool-Schemas** (vault-operator: ca. 60 Tools, 20-30k Tokens JSON Schema) gehen nicht in die Schaetzung ein, werden aber von OpenAI/OpenRouter/Gemini-OpenAI als Input verbucht.

Effekt: bei tool-heavy Modes mit grossem System-Prompt + History trifft `roomForOutput = contextWindow - estimatedInput - 4096` nicht den realen Wert. `max_tokens` wird zu hoch gesetzt; OpenAI-kompatibler Provider antwortet mit 400 "context_length_exceeded" oder dem provider-spezifischen Aequivalent -- genau der Fehler, den der Helper laut JSDoc verhindern soll ("Resolve the effective output budget, clamped to both the model's hard limit and the remaining context window."). AgentTask faengt das als context-overflow ab, emergency-condense feuert; bei einer zweiten tool-heavy User-Message nach Condense kommt der gleiche 400.

## Cause

[src/types/model-registry.ts:343-362](src/types/model-registry.ts#L343-L362):

```ts
export function estimatePromptTokens(systemPrompt: string, messages: MessageParam[]): number {
    let chars = systemPrompt.length;
    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            chars += msg.content.length;
        } else {
            ...
        }
    }
    return Math.ceil(chars / 4) + imageBlocks * 1500;
}
```

Kein Parameter fuer Tool-Definitionen, keine Verbuchung der Schemas. Alle Provider rufen so auf:

- [openai.ts:286](src/api/providers/openai.ts#L286) `estimatedInputTokens: estimatePromptTokens(systemPrompt, messages)`, dann `tools: openAiTools` separat
- analog bedrock.ts, github-copilot.ts, kilo-gateway.ts, anthropic.ts

`resolveOutputBudget` ([model-registry.ts:308-330](src/types/model-registry.ts#L308-L330)) zieht nur `estimatedInputTokens + CONTEXT_SAFETY_MARGIN(4096)` ab -- 4k Safety Margin ist weit unter 20-30k Tool-Schemas.

## Fix

1. `estimatePromptTokens` Signatur erweitern: `(systemPrompt, messages, tools?: ToolDefinition[])`.
2. Bei `tools`: JSON-Stringify der Schemas, durch 4 teilen, dazuaddieren. Anthropic/OpenAI verbrauchen tools im gleichen Token-Pool wie messages.
3. Alle 5 Provider (anthropic, openai, bedrock, github-copilot, kilo-gateway) updaten: `estimatePromptTokens(systemPrompt, messages, tools)`.
4. `CONTEXT_SAFETY_MARGIN` bleibt 4096 -- nicht alle Provider haben die gleichen Reserve-Overheads, aber 4k ist nach Tool-Schema-Verbuchung wieder ausreichend.

## Regression test

In `src/types/__tests__/model-registry.test.ts`:

- **tools-aware estimate:** `estimatePromptTokens(sys, msgs, tools)` mit 30k chars Tool-Schemas liefert ca. 7500 Tokens mehr als ohne tools.
- **backwards-compat:** Aufruf ohne `tools`-Parameter funktioniert wie vorher (Default behaviour unchanged).
- **resolveOutputBudget shrinks more:** mit tools-Verbuchung wird `max_tokens` bei nah-full-window-Inputs kleiner -- konkret: contextWindow=128k, estimated=140k (mit 30k tools) -> max_tokens wird auf 0 gecappt (oder Minimum 1024 floor) statt 14k.
- **provider integration:** anthropic/openai/bedrock/copilot/kilo rufen jeweils mit `tools`-Parameter auf (Snapshot/Spy-Test).

## How tested

1. Vitest gruen (Helper + 5 Provider).
2. Live-Smoke: Active-Mode-Request gegen OpenAI (oder OpenRouter gpt-4o), grosses System-Prompt + 5+ Messages. Vorher: 400 context_length_exceeded. Nachher: Request geht durch oder context-condense feuert kontrolliert.
