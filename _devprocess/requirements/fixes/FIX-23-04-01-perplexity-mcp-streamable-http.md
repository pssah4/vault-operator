---
id: FIX-23-04-01
feature: FEAT-23-04
epic: EPIC-23
adr-refs: [ADR-108]
plan-refs: []
depends-on: []
created: 2026-05-03
priority: P1
---

# FIX-23-04-01: Perplexity MCP-Connect schlaegt mit "Unexpected content type" fehl

## Symptom

Sebastian versucht das Obsilo Remote MCP in Perplexity einzubinden
(Authentifizierungs-Optionen "OAuth", "API Key" oder "Keine"). Bei
Auswahl "Keine" liefert Perplexity:

```
[API_CLIENTS_ERROR] Unexpected content type:
```

(leerer String hinter dem Doppelpunkt). Live verifiziert 2026-05-03.

## Was bekannt ist

Der Fehlerstring `Unexpected content type:` kommt aus dem MCP TypeScript
SDK (`StreamableHTTPClientTransport`), nicht aus Perplexity selbst.
Der MCP-SDK-Code (gefunden im Plugin-Bundle main.js:294624):

```js
throw new StreamableHTTPError(-1, `Unexpected content type: ${contentType}`);
```

Der leere String im Fehler bedeutet, dass die Server-Response **gar
keinen Content-Type-Header** trug.

## Root Cause

Der live deployed Cloudflare-DO-Worker
([src/mcp/relayWorkerCode.ts](../../../src/mcp/relayWorkerCode.ts))
ist nicht voll Streamable-HTTP-Spec-konform:

1. **GET requests erhalten 405** ohne Content-Type-Header
   (`return new Response('Method not allowed', { status: 405 });`).
   Der Streamable HTTP-Spec verlangt aber, dass Clients **GET fuer den
   SSE-Subscribe-Endpunkt** verwenden duerfen.
2. **Accept-Header wird ignoriert.** Der Worker antwortet immer
   `application/json`, auch wenn der Client `Accept: text/event-stream`
   sendet (Streaming-Modus).
3. **Kein SSE-Pfad.** Der Worker hat nur HTTP-Long-Polling fuers
   Plugin (`/poll`-Endpunkt), kein bidirektionales Streaming fuer
   Clients.

Claude Desktop und ChatGPT senden tolerante Headers (Akzeptanz von
JSON only) und funktionieren daher; Perplexity scheint strikt zu sein.

## Fix

Drei Schritte, in dieser Reihenfolge:

1. **Quick-Fix**: Worker antwortet bei GET-requests an `/{token}/mcp`
   mit `204 No Content` plus `Content-Type: application/json` statt
   mit 405 plain text. Behebt das leere-Content-Type-Symptom, faengt
   aber nicht den vollen Streamable-HTTP-Spec.

2. **Mittelfrist**: Streamable-HTTP-Spec konformer Server bauen --
   `text/event-stream` als Antwort-Option, GET fuer SSE-Subscribe,
   Session-ID-Management, Accept-Header-Negotiation. Schaetzung:
   ~300-500 LOC im Worker plus Eval-Test gegen alle vier Clients.

3. **Wrapper-Doku**: Falls Perplexity eine Workaround-Konfiguration
   hat (z.B. legacy-mode-Toggle), in der Setup-Doku notieren.

## Akzeptanzkriterien

- AK-01: Perplexity verbindet sich erfolgreich mit Obsilo Remote MCP.
- AK-02: Mindestens `recall_memory` und `search_history` funktionieren
  in Perplexity.
- AK-03: Bestehende Claude- und ChatGPT-Verbindungen bleiben
  unveraendert funktional.

## Out of Scope

- Streaming-Antworten (Worker-Response in Chunks). Reine Request/
  Response reicht fuer alle vier Clients.
- WebSocket-Variante reaktivieren (Obsidian-CSP blockiert das).

## Definition of Done

- Worker-Code-Update + redeployt.
- Perplexity-MCP-Connect funktioniert.
- Regressions-Check Claude-Web + Claude Desktop + ChatGPT.
- FIX-Row auf Done.
