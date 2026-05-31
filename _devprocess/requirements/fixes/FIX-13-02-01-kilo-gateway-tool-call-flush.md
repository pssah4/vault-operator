---
id: FIX-13-02-01
feature: FEAT-13-02
epic: EPIC-13
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-31
---

# FIX-13-02-01: Kilo Gateway verschluckt Tool-Calls bei finish_reason="stop"/"length"

## Symptom

Code-Review 2026-05-31 (xhigh focused, 9 angles): KiloGateway-Provider streamt Tool-Calls korrekt in den Accumulator, beendet die Schleife aber ohne Post-Loop-Flush. Bei finish_reason="stop" oder "length" werden alle akkumulierten Tool-Calls stillschweigend verworfen. Der Agent sieht text-only Output und behandelt die Antwort als final, ohne das vom Modell beabsichtigte Tool je auszufuehren.

Live nicht reproduziert, aber: KiloGateway routet OpenAI-kompatible Traffic durch beliebige Upstream-Modelle (Groq, OpenRouter-Style, Claude-Varianten). Sobald ein Upstream den BUG-013/FEATURE-0409-Pattern zeigt, ist Kilo Gateway broken. Die Schwester-Provider [openai.ts:405-413](src/api/providers/openai.ts#L405-L413) und [github-copilot.ts:272-279](src/api/providers/github-copilot.ts#L272-L279) haben den Post-Loop-Flush bereits explizit als BUG-013/FEATURE-0409 markiert.

## Cause

[src/api/providers/kilo-gateway.ts:187-211](src/api/providers/kilo-gateway.ts#L187-L211) flusht den Accumulator nur im `if (choice.finish_reason === 'tool_calls')`-Branch:

```ts
if (choice.finish_reason === 'tool_calls') {
    for (const [, acc] of toolCallAccumulators) {
        ...
    }
    toolCallAccumulators.clear();
}
```

Nach Loop-Ende (Zeile 211) wird der Accumulator nicht mehr inspiziert. openai.ts und github-copilot.ts haben dafuer den extrahierten Helper `flushToolCallAccumulators` mit doppelter Verwendung (in-loop + post-loop-fallback), Kilo Gateway hat den Helper nicht und macht den Flush inline.

Zwei Folgeprobleme am gleichen Ort:
- Kein `wasMaxTokens`-Flag an `truncatedToolInputError` bei `finish_reason='length'` (FIX-18-04-03 deckt das fuer alle OpenAI-Shape-Provider gemeinsam ab).
- Kein defensiver `if (!acc.id || !acc.name)`-Guard, partielle Accumulator wuerden als broken tool_use chunks emittiert (openai.ts:426-431, github-copilot.ts:291-296).

## Fix

1. `flushToolCallAccumulators(toolCallAccumulators, lastFinishReason?)` aus openai.ts/github-copilot.ts auf Kilo Gateway uebertragen. Helper mit `id/name`-Guard und JSON-Parse-Fehler-Recovery via `truncatedToolInputError`.
2. In-Loop-Flush ersetzen durch `yield* this.flushToolCallAccumulators(...)`.
3. Nach dem `for await` einmaliger Post-Loop-Check: `if (toolCallAccumulators.size > 0) yield* this.flushToolCallAccumulators(...)`.
4. Mittel- bis langfristig: shared Helper ausserhalb der drei Provider-Klassen (siehe FIX-18-04-03 fuer den Cross-Provider-Refactor). Hier zuerst lokale Symmetrie zu openai.ts.

## Regression test

Neuer Vitest in `src/api/providers/__tests__/kilo-gateway.test.ts`:

- **post-loop flush on stop:** Mock-Stream mit `delta.tool_calls`-Deltas + `finish_reason='stop'` -> Provider emittiert tool_use chunk (Helper feuert post-loop).
- **post-loop flush on length:** wie oben mit `finish_reason='length'` -> tool_error mit wasMaxTokens-Flag.
- **no double-yield on tool_calls:** in-loop-Flush feuert, post-loop sieht leeren Accumulator und yieldet nichts (kein Duplicate).
- **partial accumulator dropped:** acc ohne `id`/`name` wird vom Guard verworfen.

## How tested

1. Build + Test gruen.
2. Spiegelbild zu FIX-04-09-01 (OpenAI), Code-Pfad ist analog.
