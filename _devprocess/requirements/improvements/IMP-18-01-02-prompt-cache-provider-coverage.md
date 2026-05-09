---
id: IMP-18-01-02
feature: FEAT-18-01
epic: EPIC-18
adr-refs: [ADR-62, ADR-111]
plan-refs: []
depends-on: [IMP-18-01-01]
created: 2026-05-09
---

# IMP-18-01-02: Prompt Caching Provider-Coverage -- Bedrock cachePoints, OpenAI cached_tokens, Kilo Gateway/OpenRouter Passthrough

**Prioritaet:** P1 (folgt Phase 1, ohne Provider-Implementierung wirkt der UI-Toggle bei den neuen Providern nicht)
**Feature-Bezug:** FEAT-18-01 (Prompt Caching, Provider-agnostisch), EPIC-18 (Token-Kostenreduktion)
**Quelle:** [Issue #313](https://github.com/pssah4/obsilo-dev/issues/313), BA-12 Section 11
**Hypothese aus BA:** H-313-3 (Bedrock cachePoint-Marker liefern messbar `cacheReadInputTokens > 0`)
**Depends-On:** IMP-18-01-01 (`supportsPromptCache`-Flag muss existieren, damit der Toggle UI-seitig erscheint)

## Problem

Phase 1 (IMP-18-01-01) macht den Toggle in den Settings sichtbar fuer
mehrere Provider, aber die Provider-Implementierungen lesen das Flag
heute nicht. Drei konkrete Luecken:

### Bedrock

[src/api/providers/bedrock.ts](../../../src/api/providers/bedrock.ts)
liest `cacheReadInputTokens` und `cacheWriteInputTokens` aus der
Response (Z. 171, 240-241, 250-251), setzt im Request aber **keine
cachePoint-Marker**. Effekt: Anthropic-Modelle auf Bedrock liefern
`cacheReadInputTokens: 0`, weil Bedrock ohne Marker nichts cached.
User mit AWS-Compliance-Pflicht (Enterprise) zahlen die volle
Bedrock-Anthropic-Rate, obwohl Bedrock seit 2024 explizites Prompt
Caching fuer Claude-Modelle anbietet.

### OpenAI

[src/api/providers/openai.ts](../../../src/api/providers/openai.ts)
hat heute keinerlei Cache-Logik. OpenAI cached implizit ab >1024
Tokens fuer gpt-4o, gpt-4.1, o1-Familie und liefert
`usage.prompt_tokens_details.cached_tokens` in der Response. Obsilo
ignoriert dieses Feld komplett. User sehen weder den Rabatt im
Token-Counter noch in der Cost-Schaetzung. Fehlende Sichtbarkeit
verstaerkt den Eindruck "Caching funktioniert nur bei Anthropic".

### Kilo Gateway und OpenRouter

[src/api/providers/kilo-gateway.ts](../../../src/api/providers/kilo-gateway.ts)
sendet Anthropic-formatierte Requests durch ein Gateway. Wenn der
Gateway das `cache_control`-Feld nicht durchreicht, geht der Cache-
Vorteil bei jedem Request verloren. Heute nicht verifiziert, vermutlich
nicht implementiert. OpenRouter (sofern direkt oder via Kilo Gateway
genutzt) hat dasselbe Problem.

## Loesung

### 1. Bedrock cachePoint-Marker

In `BedrockProvider.createMessage()`:

- Wenn `this.config.promptCachingEnabled` (effektiv true nach
  Phase 1) und das Modell `supportsPromptCache: true` hat:
  - System-Prompt-Block bekommt einen `cachePoint`-Marker am Ende.
  - Letzter User-Message-Block bekommt einen `cachePoint`-Marker am Ende.
- API: `messages: [{ role, content: [{ text: '...' }, { cachePoint: { type: 'default' } }] }]`
  (Format entsprechend `@aws-sdk/client-bedrock-runtime` ConverseStream
  Spezifikation).
- Response-seitig: bestehende Token-Tracking bleibt unveraendert,
  liest `cacheReadInputTokens` weiter wie heute.

### 2. OpenAI cached_tokens-Tracking

In `OpenAIProvider.createMessage()` Streaming-Handler:

- Beim finalen Usage-Chunk: `usage.prompt_tokens_details?.cached_tokens`
  auslesen (optional, nicht alle Modelle liefern es).
- In den Token-Counter einfliessen lassen, der heute bereits in der
  UI angezeigt wird (Token-Display in der Sidebar).
- Cost-Berechnung: cached_tokens werden mit dem reduzierten Tarif
  (50% Rabatt fuer GPT-4o-Familie) berechnet, restliche Input-Tokens
  zur Volltarif. Wenn Cost-Berechnung heute pauschal `prompt_tokens *
  rate` macht, anpassen auf `(prompt_tokens - cached_tokens) * rate +
  cached_tokens * rate * 0.5`.
- Kein explizites Cache-Setzen im Request noetig: OpenAI cached
  automatisch.

### 3. Kilo Gateway Passthrough

In `KiloGatewayProvider.createMessage()`:

- Wenn `this.config.promptCachingEnabled` true und Modell
  `supportsPromptCache: true`: identische cache_control-Marker setzen
  wie der Anthropic-Provider (System Prompt + letzte User-Message,
  `cache_control: { type: 'ephemeral' }`).
- Annahme: Kilo Gateway leitet Anthropic-Felder unveraendert durch.
- Verifikation per Live-Test (Cache-Hit-Indikator in der Response, falls
  Gateway ihn liefert; sonst per Cost-Vergleich vorher/nachher).

### 4. OpenRouter Behandlung

OpenRouter wird heute typischerweise via Kilo Gateway oder als
OpenAI-kompatibler Endpoint angesprochen. Wenn ein eigener OpenRouter-
Provider existiert: identisches Passthrough-Pattern wie Kilo Gateway.
Wenn nicht: Out-of-Scope dieser Iteration, Verweis im Code-Kommentar.

## Akzeptanzkriterien

### AC-1 Bedrock cachePoint funktional

- Bei Bedrock mit Anthropic-Modell und aktivem Toggle wird im
  Request mindestens ein `cachePoint`-Marker auf System Prompt und
  letzter User-Message gesetzt.
- Verifikation: Mock von `ConverseStream`, Pruefung der Request-
  Struktur.
- Live-Test: zwei aufeinanderfolgende Calls liefern beim zweiten
  Call `cacheReadInputTokens > 0`.

### AC-2 OpenAI cached_tokens sichtbar

- Bei OpenAI gpt-4o/4.1/o1-Modell wird `cached_tokens` aus der
  Response-Usage extrahiert und im Token-Display angezeigt.
- Cost-Schaetzung beruecksichtigt 50% Rabatt fuer cached_tokens.
- Bei Modellen ohne cached_tokens-Feld: keine Aenderung, kein
  Fehler, Display zeigt 0 cached.

### AC-3 Kilo Gateway Passthrough

- Bei Kilo Gateway mit Anthropic-Modell und aktivem Toggle enthaelt
  der Request `cache_control: { type: 'ephemeral' }`-Marker.
- Live-Test: zwei aufeinanderfolgende Calls liefern Token-Reduktion
  beim zweiten Call (Cost-Indikator oder Gateway-Header, je nach
  Verfuegbarkeit).

### AC-4 Toggle-Wirkung

- Toggle aus -> alle drei Provider verhalten sich wie heute (keine
  Cache-Marker, kein cached_tokens-Tracking).
- Toggle an -> jeweilige Provider-Implementierung aus AC-1 bis AC-3 greift.

### AC-5 Keine Regression bei Out-of-Scope-Providern

- GitHub Copilot, ChatGPT-OAuth, Gemini, Ollama, LM Studio: Verhalten
  unveraendert.
- Anthropic-Provider direkt: Verhalten unveraendert (war schon korrekt
  in FEAT-18-01).

## Definition of Done

- Code geliefert: bedrock.ts, openai.ts, kilo-gateway.ts (ggf.
  openrouter.ts).
- Unit-Tests fuer AC-1 bis AC-4 (Mock-basiert).
- Live-Tests gegen mindestens einen der drei Provider mit echtem Key
  (Bedrock bevorzugt, weil dort H-313-3 zu validieren ist).
- Build gruen (tsc + esbuild), Deploy in iCloud-Vault.
- Backlog-Row auf Done, Last-Change aktualisiert.
- Release Notes Entry: "Prompt Caching ist jetzt aktiv fuer Bedrock-
  Anthropic-Modelle, OpenAI gpt-4o/4.1/o1, Kilo Gateway und
  OpenRouter. Token- und Cost-Anzeige beruecksichtigt cached Tokens
  bei OpenAI."

## Out-of-Scope

- GitHub Copilot Provider: kein offizielles Prompt-Caching dokumentiert.
  `supportsPromptCache: false` (Phase 1).
- ChatGPT-OAuth Provider: inoffizielle API. `supportsPromptCache: false`.
- Gemini Context Caching (TTL-basiert, eigener Mechanismus): bleibt
  deferred wie in FEAT-18-01 vermerkt.
- Cache-TTL-Konfiguration via UI: Phase 3, nicht Teil dieser
  Iteration.
- Eigener OpenRouter-Provider sofern nicht bereits vorhanden:
  separate Iteration.

## Validation der Hypothese H-313-3

Diese IMP traegt die Falsifikations-Verantwortung fuer Hypothese
H-313-3 aus BA-12 Section 11.4: "Bedrock cachePoint-Marker liefern
messbar `cacheReadInputTokens > 0`."

Test-Protokoll:

1. Bedrock-EU mit Claude-Sonnet-Modell (sofern verfuegbar) konfiguriert.
2. Identische Anfrage zweimal hintereinander (innerhalb 5 Minuten).
3. Erwartung: zweiter Call meldet `cacheReadInputTokens > 0` in der
   `usage`-Struktur der Response.
4. Falsifikations-Trigger: Bei drei Test-Runs in Folge meldet
   Bedrock weiterhin `cacheReadInputTokens: 0` -> Capability-Flag
   `supportsPromptCache: false` fuer dieses Bedrock-Modell setzen
   (Phase 1 Ueberlauf), Toggle ausblenden.

## Risiken und Mitigation

- **Risiko:** Bedrock cachePoint-API ist regional oder modellabhaengig
  nicht verfuegbar. **Mitigation:** Live-Test vor Release, Fallback per
  Capability-Flag wenn Bedrock weiter `0` meldet.
- **Risiko:** Kilo Gateway laesst `cache_control` fallen.
  **Mitigation:** Live-Test, falls bestaetigt entweder Gateway-
  Konfiguration anpassen lassen oder Capability-Flag fuer Kilo
  Gateway zurueckziehen.
- **Risiko:** OpenAI Cost-Berechnung wird durch nicht-lineare
  Tarife (Batch-Rate, Tier-Rabatte) verzerrt. **Mitigation:**
  Naive 50%-Annahme fuer cached_tokens, Hinweis in Tooltip dass
  finale Abrechnung von OpenAI-Tarif abhaengt.
