---
id: FIX-23-09-03
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: [FIX-23-09-01]
created: 2026-06-20
---

# FIX-23-09-03: RelayClient forwards prompts + version-negotiated initialize

## Symptom

Nach FIX-23-09-01 ist der neutrale `vault-operator-context`-Prompt fuer Claude-Desktop-User ueber `prompts/list` waehlbar. Claude.ai-Connector-User gehen aber ueber den Cloudflare-Worker-Relay (ADR-55, `src/mcp/RelayClient.ts` + `relay/src/index.ts`), und dieser leitete urspruenglich nur `initialize`, `tools/list`, `tools/call` und `resources/list` an den Backend weiter. `prompts/list` und `prompts/get` fielen in den Default-Branch und antworteten mit leerem `{}`.

Adversarial verify in `Workflow wwzd6yqj0` zeigte ausserdem zwei Behavior-Drifts zwischen Relay und Local-HTTP-Pfad, die bisher unbemerkt geblieben waren:

1. **`initialize`**: Local-HTTP negotierte protocolVersion via `SUPPORTED_VERSIONS` und schickte `instructions` mit; Relay hardkodierte `2025-03-26` und liess `instructions` weg. Strict-Spec-Clients (Perplexity) konnten sich am Relay schlechter verbinden als am Local-HTTP.
2. **`prompts/get` ohne `name`**: Local-HTTP fiel auf den Default-Context-Prompt zurueck; der RelayClient haette mit einem early-return `{}` geantwortet.

## Fix

Drei Architektur-Aenderungen:

1. **`McpBridge` exponiert drei Public-Methods** als Single-Source-of-Truth fuer beide Transport-Layer:
   - `buildInitializeResponse(requestedProtocolVersion?)` -- macht die Version-Negotiation + `instructions`-Text
   - `listPrompts()` -- gibt die zwei prompts/list-Entries zurueck
   - `getPrompt(name | undefined)` -- gibt das prompts/get-Result zurueck, fallt auf den Default-Context-Prompt zurueck wenn kein `name`

   `McpBridge.handleJsonRpc` selbst delegiert seine bisherigen inline-Bloecke an diese Methods.

2. **`RelayClient` extrahiert `dispatchRelayMethod(plugin, method, params)`** als exportierten Pure-Helper. `handleRequest` ist nur noch IO-Wrapper. Der Helper delegiert `initialize`, `prompts/list`, `prompts/get` an die neuen McpBridge-Methods, behaelt die bestehende Delegation fuer `tools/list`, `tools/call`, `resources/list`.

3. **Defensive Param-Coercion** in `dispatchRelayMethod` fuer `prompts/get`: nicht-String-`name`-Werte werden zu `undefined` gecoerced, was den Default-Prompt liefert (statt zu crashen).

## Tests

`src/mcp/__tests__/RelayClient.dispatch.test.ts` -- neuer Test-File:
- `prompts/list` delegiert an `mcpBridge.listPrompts()`
- `prompts/get` mit Name delegiert an `mcpBridge.getPrompt(name)`
- `prompts/get` ohne Name delegiert an `mcpBridge.getPrompt(undefined)` und liefert Default-Prompt (matched Local-HTTP-Verhalten)
- `prompts/get` mit non-string Name (z.B. `123`) coerced auf `undefined` -- Defensive
- `initialize` mit `protocolVersion='2025-06-18'` ruft `buildInitializeResponse('2025-06-18')` und echoed die Version zurueck
- `initialize` ohne `protocolVersion` ruft `buildInitializeResponse(undefined)` und liefert `2025-03-26`-Default
- Unbekannte Methoden geben weiter `{}` (unveraendert)

Adversarial verify in zweiter Runde des `wwzd6yqj0`-Workflows wuerde jetzt grun durchgehen (beide Drift-Findings waren in der ersten Runde geflaggt und sind in diesem Patch alignt).

## Verification

Full vitest: 2955 passed, 0 Regressionen. Type-Check: clean.

## Out of scope / Open

Die anderen Methoden die `McpBridge.handleJsonRpc` zusaetzlich kann (`resources/read`, `resources/templates/list`, `notifications/initialized`, `ping`) sind im Relay-Pfad weiter nicht verbunden. Per Discovery (`wq1b52nca`) ist das nicht akut von issue #46 oder Claude.ai betroffen; bleibt ein eigenes Item falls jemand sie braucht.
