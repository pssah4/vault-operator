# BUG-013: OpenAI Provider verschluckt Tool-Calls bei finish_reason="stop"

**Prioritaet:** P1 (Kurzfristig, blockiert OpenRouter-Modelle wie gpt-oss-120b)
**Status:** Resolved in v2.5.0 (commit 6c11f72, 5/5 unit tests)
**Datei:** `src/api/providers/openai.ts` (Streaming-Loop)
**Feature-Bezug:** FEATURE-0409 (OpenAI-kompatible Streaming Tool-Call Robustheit) in EPIC-004
**Entdeckt:** 2026-04-15 (Community Issue #30, Reporter: Nicholas Leonard)
**Issue:** https://github.com/pssah4/obsilo/issues/30

---

## Problem

Beim Aufruf von OpenRouter mit dem Modell `openai/gpt-oss-120b` werden Tool-Calls nicht ausgefuehrt. Stattdessen erscheinen sie als JSON-formatierter Text in der Agent-Ausgabe. Der Agent erkennt sie nicht als Tool-Use-Events und kann die Tools nicht ausfuehren.

## Root Cause Analyse

`src/api/providers/openai.ts` akkumuliert Tool-Call-Deltas im Streaming-Loop:

```typescript
const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

for await (const chunk of stream) {
    ...
    if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
            ...
            acc.argumentsJson += tc.function.arguments;
        }
    }

    if (choice.finish_reason === 'tool_calls') {
        for (const [, acc] of toolCallAccumulators) {
            yield { type: 'tool_use', id: acc.id, name: acc.name, input };
        }
        toolCallAccumulators.clear();
    }
}
```

Die Accumulator-Map wird nur dann ausgegeben, wenn `finish_reason === "tool_calls"`. OpenRouter (und einige andere OpenAI-kompatible Backends, etwa Groq) liefern fuer bestimmte Modelle `finish_reason === "stop"` zusammen mit gefuellten `delta.tool_calls`. Folge: die Map enthaelt valide Tool-Calls, sie werden aber nie geyieldet. Der Stream endet, der Agent bekommt nur Text-Chunks (die der Provider als JSON-Text generiert), und behandelt sie als gewoehnliche Antwort.

## Kausale Kette

1. OpenRouter-Modell `gpt-oss-120b` streamt Chunks mit `delta.tool_calls`.
2. Akkumulatoren fuellen sich korrekt.
3. Letzter Chunk hat `finish_reason === "stop"` (statt `"tool_calls"`).
4. Der If-Branch wird nicht betreten, Akkumulator-Map bleibt gefuellt.
5. For-Loop endet, Map wird verworfen.
6. Agent sieht nur Text, behandelt das als finale Antwort.
7. User sieht JSON-aehnlichen Text im Chat statt Tool-Ausfuehrung.

## Auswirkung

- **Funktional:** Hoch fuer betroffene Modelle. Tool-Calling ist die Kernfunktion des Agent-Loops. OpenRouter ist ein populaerer Provider, gpt-oss-120b ist ein verbreitetes Open-Modell. Andere Modelle mit gleichem finish_reason-Verhalten (Groq, lokale Backends) sind ebenfalls betroffen.
- **Vertrauen:** Hoch. User gehen davon aus, dass das Plugin mit allen unterstuetzten Providern funktioniert. Stille Fehler (Text statt Tool-Use) sind besonders schwer zu debuggen.

## Fix-Richtung

Nach dem Streaming-Loop ein Post-Loop-Flush einfuegen: Wenn die Accumulator-Map nach dem Stream-Ende noch Eintraege hat, diese ausgeben. Wenn `finish_reason === "tool_calls"` schon innerhalb der Schleife geleert hat, ist die Map leer und der Flush macht nichts (kein Doppel-Yield).

Referenz-Implementierung: Nicholas Leonards Fork-Commit `1fffe76` (Branch `fix/openai-tool-call-flush`). Idea uebernehmen, eigene Tests dafuer schreiben.

Der gleiche Fix sollte auf `src/api/providers/github-copilot.ts` angewandt werden, da dort dieselbe Streaming-Logik genutzt wird.

## Verifikation

- Unit-Test mit Mock-Stream, der `delta.tool_calls` plus `finish_reason="stop"` simuliert.
- Manueller Test mit OpenRouter und `openai/gpt-oss-120b` plus einem einfachen Tool-Aufruf (z.B. `list_files`).
- Regressionstest: gpt-4o ueber OpenRouter funktioniert weiterhin (kein Doppel-Yield).
