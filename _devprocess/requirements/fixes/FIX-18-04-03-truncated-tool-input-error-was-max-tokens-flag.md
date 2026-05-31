---
id: FIX-18-04-03
feature: FEAT-18-04
epic: EPIC-18
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-31
---

# FIX-18-04-03: OpenAI-shape Provider rufen truncatedToolInputError ohne wasMaxTokens-Flag

## Symptom

Code-Review 2026-05-31 (xhigh focused): Modell trifft `max_tokens` mitten in einem `write_file`-Tool-Call (`finish_reason='length'`). Streaming-Loop captured halbgeschriebenes argumentsJson, JSON.parse failt, der Helper `truncatedToolInputError(name, err)` wird ohne dritten Parameter (`wasMaxTokens=false`) aufgerufen.

Effekt: Das Modell bekommt die generische Recovery-Message ("...arguments were truncated or malformed...Do NOT retry the same call") statt der actionable "Response hit the max output token limit -- split write_file + append_to_file"-Anleitung, die [src/api/types.ts:35-66](src/api/types.ts#L35-L66) als Contract definiert. Das Modell retryt mit dem gleichen langen Payload, hits length erneut, brennt `consecutiveMistakeLimit` (Default 3) ab und der User sieht "Agent stopped after 3 consecutive errors".

Betroffen: openai.ts, github-copilot.ts, kilo-gateway.ts, chatgpt-oauth.ts. [anthropic.ts:275-282](src/api/providers/anthropic.ts#L275-L282) macht es richtig (`const wasMaxTokens = stopReason === 'max_tokens'`).

## Cause

OpenAI-shape Provider verlieren `choice.finish_reason` zwischen Streaming-Loop und Flush-Helper.

- [openai.ts:443](src/api/providers/openai.ts#L443) `error: truncatedToolInputError(acc.name, (e as Error).message)` -- kein dritter Param.
- [github-copilot.ts:309](src/api/providers/github-copilot.ts#L309) gleich.
- [kilo-gateway.ts:198](src/api/providers/kilo-gateway.ts#L198) gleich.
- [chatgpt-oauth.ts:628](src/api/providers/chatgpt-oauth.ts#L628) gleich.

`flushToolCallAccumulators` ([openai.ts:421-455](src/api/providers/openai.ts#L421-L455)) hat keinen Parameter fuer `wasMaxTokens`. Choice-finish_reason wird in der Loop nicht persistiert.

## Fix

1. `flushToolCallAccumulators` Signatur erweitern: `(accumulators, wasMaxTokens: boolean)`.
2. In der Streaming-Loop `lastFinishReason` mitfuehren, beim Yield in der `'tool_calls'`-Branch `wasMaxTokens=false`, beim Post-Loop-Flush `wasMaxTokens = lastFinishReason === 'length'`.
3. Helper reicht den Flag durch an `truncatedToolInputError(name, err, wasMaxTokens)`.
4. 4 Provider angleichen: openai.ts, github-copilot.ts, kilo-gateway.ts (haengt von FIX-13-02-01-Helper-Extract ab), chatgpt-oauth.ts.

## Regression test

In den jeweiligen Provider-Tests:

- **finish_reason=length on truncated arguments -> wasMaxTokens=true:** Mock-Stream emittiert halbes argumentsJson + finish_reason='length'. tool_error-Chunk enthaelt die "Response hit the max output token limit"-Message statt der generischen.
- **finish_reason=stop on truncated arguments -> wasMaxTokens=false:** Mock-Stream emittiert halbes argumentsJson + finish_reason='stop'. tool_error-Chunk enthaelt die "arguments were truncated or malformed"-Message.
- **anthropic regression:** keine Aenderung am Verhalten (anthropic.ts war bereits korrekt).

## How tested

1. Vitest gruen ueber 4 Provider.
2. Live-Smoke: lange `write_file`-Anweisung an gpt-4o, max_tokens unter dem benoetigten Wert. Vorher: 3 Retries, dann Stop. Nachher: Modell sieht "split write_file + append_to_file" und macht das.
