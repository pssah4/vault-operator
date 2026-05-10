---
ba: BA-12 Section 11 (Update-Block fuer Issue #313)
arch-completed: 2026-05-09
related-features: FEAT-18-01
related-imps: [IMP-18-01-01, IMP-18-01-02]
related-adrs: [ADR-62, ADR-111]
related-epics: [EPIC-18]
issue: https://github.com/pssah4/obsilo-dev/issues/313
branch: chore/imp-18-01-prompt-cache-settings
---

# plan-context IMP-18-01: Prompt Cache Settings + Provider-Coverage

## Tech-Stack (Stand 2026-05-09)

Bestehender Stack, **wird ergaenzt, nicht ersetzt**:

- **Sprache:** TypeScript strict
- **Plugin-Framework:** Obsidian Plugin API
- **AI-SDKs:** `@anthropic-ai/sdk`, `openai`, `@aws-sdk/client-bedrock-runtime` v3.1031+
- **Provider-Layer:** [src/api/providers/](../../../src/api/providers/) -- 6 Provider (anthropic, bedrock, openai, github-copilot, chatgpt-oauth, kilo-gateway)
- **Settings-UI:** [src/ui/settings/ModelConfigModal.ts](../../../src/ui/settings/ModelConfigModal.ts), [src/ui/settings/constants.ts](../../../src/ui/settings/constants.ts)
- **Settings-Persistenz:** `data.json` ueber Obsidian-Plugin-API, Schema in [src/types/settings.ts](../../../src/types/settings.ts)
- **Token-Display:** Sidebar-Komponente (Pfad in /coding zu verifizieren)
- **i18n:** [src/i18n/locales/en.ts](../../../src/i18n/locales/en.ts) (UI-Standardsprache Englisch)

Keine neuen externen Dependencies geplant. AWS-SDK ist bereits in der noetigen Version.

## Architektur-Stil und Quality-Goals

**Stil:** Provider-Pattern (Adapter pro AI-API), datengetriebene UI-Visibility, statische Capability-Tabelle als Single Source of Truth.

**Quality-Goals (Reihenfolge nach Wichtigkeit):**

1. **Backward Compatibility** -- bestehende `data.json`-Configs bleiben unveraendert lesbar.
2. **Cost Efficiency** -- jeder cache-faehige Provider kommt in Reichweite des -50% bis -90% Rabatts.
3. **Maintainability** -- ein Drift-freies Capability-Modell, in dem UI und Provider aus derselben Tabelle lesen.
4. **Conservative Defaults** -- neue Modelle ohne explizit gepflegtes Capability-Flag bekommen `false`.
5. **Review-Bot-Compliance** -- keine `console.log`/`fetch`/`require`/`element.style.X = Y`/`innerHTML`/`any` neu einfuehren.

## ADR-Summary-Tabelle

| ADR | Titel | Status | Verbindet IMP / FEAT |
|-----|-------|--------|----------------------|
| ADR-62 (Update 2026-05-09) | KV-Cache-Optimized Prompt Structure -- bleibt Accepted, dated Note ergaenzt | Accepted | FEAT-18-01 |
| ADR-111 | Provider Capability-Flag und Bedrock cachePoint (Erweiterung zu ADR-62) | Proposed | IMP-18-01-01, IMP-18-01-02 |

## Kern-Entscheidungen aus ADR-111

### 1. Capability-Tabelle als Single Source of Truth

Neues Modul (vorgesehener Pfad: `src/api/capabilities.ts`, finale Pfad-Wahl in /coding) mit
folgendem Schema:

```typescript
type CacheStyle =
  | 'anthropic-ephemeral'   // explizite cache_control Marker (Anthropic, Kilo Gateway)
  | 'bedrock-cachepoint'    // explizite cachePoint ContentBlocks (Bedrock + Anthropic-Modell)
  | 'openai-implicit'       // automatisch ab >1024 Tokens, cached_tokens-Tracking
  | 'passthrough'           // wie 'anthropic-ephemeral', nur via Gateway
  | 'none';

interface CacheCapabilityEntry {
  providerType: ProviderType;
  modelPattern: string;          // glob-style: "anthropic/claude-3-*"
  supportsPromptCache: boolean;
  cacheStyle: CacheStyle;
  notes?: string;
}

function getCacheCapability(providerType: ProviderType, modelId: string): CacheCapabilityEntry;
```

UI und Provider-`getModel()` lesen beide aus dieser Tabelle. Tests validieren Coverage pro Provider.

### 2. Default-Switch ohne Migration

In [src/types/settings.ts:261](../../../src/types/settings.ts#L261) `modelToLLMProvider()` so
anpassen, dass `model.promptCachingEnabled !== false` zurueckgegeben wird. Effekt:

- `undefined` -> wirkt als `true`
- explizit `true` -> bleibt `true`
- explizit `false` -> bleibt `false` (User-Praeferenz erhalten)

Keine Daten-Migration. `data.json` bleibt unangetastet.

### 3. UI-Visibility datengetrieben

In [src/ui/settings/ModelConfigModal.ts:561](../../../src/ui/settings/ModelConfigModal.ts#L561)
die Bedingung von `p !== 'anthropic' && !isCopilotClaude` auf
`!getCacheCapability(p, modelId).supportsPromptCache` umstellen. Toggle ist sichtbar genau
dann, wenn die Capability-Tabelle `true` meldet.

### 4. Bedrock cachePoint im Request

In [src/api/providers/bedrock.ts](../../../src/api/providers/bedrock.ts) vor dem
`ConverseStreamCommand`-Aufruf: wenn `this.config.promptCachingEnabled` UND
`cacheStyle === 'bedrock-cachepoint'`, dann am Ende des System-Prompt-Blocks und am
Ende des letzten User-Message-Blocks ein `{ cachePoint: { type: 'default' } }`-ContentBlock
einfuegen.

### 5. OpenAI cached_tokens-Tracking

In [src/api/providers/openai.ts](../../../src/api/providers/openai.ts) im Streaming-Handler
beim finalen Usage-Chunk `usage.prompt_tokens_details?.cached_tokens` auslesen, in den
bestehenden Token-Counter einfliessen lassen. Cost-Schaetzung beruecksichtigt 50%-Rabatt.

### 6. Kilo Gateway Passthrough

In [src/api/providers/kilo-gateway.ts](../../../src/api/providers/kilo-gateway.ts) wenn
`cacheStyle === 'passthrough'`, dieselbe `cache_control: { type: 'ephemeral' }`-Logik wie
im Anthropic-Provider anwenden.

## Capability-Tabellen-Initialbestand (Vorschlag fuer /coding)

| providerType | modelPattern | supportsPromptCache | cacheStyle | Begruendung |
|---|---|---|---|---|
| anthropic | claude-3-* | true | anthropic-ephemeral | bestehendes Verhalten |
| anthropic | claude-haiku-* | true | anthropic-ephemeral | wie alle Claude-3 |
| anthropic | claude-opus-* | true | anthropic-ephemeral | wie alle Claude-3 |
| anthropic | claude-sonnet-* | true | anthropic-ephemeral | wie alle Claude-3 |
| github-copilot | claude-* | true | anthropic-ephemeral | bestehendes Verhalten (Copilot/Claude) |
| github-copilot | gpt-* | false | none | kein offizielles Caching dokumentiert |
| github-copilot | o1* | false | none | kein offizielles Caching dokumentiert |
| bedrock | anthropic.claude-3-* | true | bedrock-cachepoint | Phase 2 / IMP-18-01-02 |
| bedrock | eu.anthropic.claude-3-* | true | bedrock-cachepoint | Cross-Region-Inference EU |
| bedrock | us.anthropic.claude-3-* | true | bedrock-cachepoint | Cross-Region-Inference US |
| openai | gpt-4o* | true | openai-implicit | impliziter Cache + cached_tokens-Tracking |
| openai | gpt-4.1* | true | openai-implicit | dito |
| openai | o1* | true | openai-implicit | dito |
| openai | gpt-3.5* | false | none | kein impliziter Cache |
| openai | gpt-4-* | false | none | nur 4o/4.1/o1-Familie cached |
| kilo-gateway | anthropic/claude-* | true | passthrough | Gateway leitet Anthropic-Felder durch (zu validieren) |
| kilo-gateway | * | false | none | konservativer Default |
| chatgpt-oauth | * | false | none | inoffizielle API |

Pattern-Match-Reihenfolge: spezifischer vor generischer. Konservativer Default `none`.

## Tooltip-Konvention

Bestehende Konvention im ModelConfigModal: DOM-Attribut `title` (Beispiel
[ModelConfigModal.ts:249](../../../src/ui/settings/ModelConfigModal.ts#L249)) plus
i18n-Keys aus [src/i18n/locales/en.ts](../../../src/i18n/locales/en.ts) (Schluessel-
Pattern `modal.modelConfig.*`).

Vorgeschlagener i18n-Key: `modal.modelConfig.promptCachingTooltip`

Text:

> Prompt caching reduces input cost on repeated requests. Anthropic charges +25% on
> the first cache write, then -90% on every cache read. Net win after 2 iterations.
> Recommended on for typical agent sessions.

## Implementierungsreihenfolge (fuer /coding)

1. **IMP-18-01-01 zuerst:**
   - Capability-Modul anlegen (`src/api/capabilities.ts` o. ae.) inkl. Tabelle und
     Lookup-Funktion. Unit-Tests fuer Pattern-Match.
   - `modelToLLMProvider()` auf `!== false`-Logik umstellen. Unit-Test fuer Default-on.
   - `ModelConfigModal.ts:561` auf Capability-Lookup umstellen. Manueller UI-Test.
   - i18n-Eintrag fuer Tooltip-Text. Tooltip im UI verkabeln.
   - Build, Deploy, kurze Live-Verifikation gegen Anthropic-Direct.
   - Backlog-Row IMP-18-01-01 auf Done.
2. **IMP-18-01-02 danach:**
   - Bedrock: cachePoint-ContentBlocks einfuegen, Test gegen Live-Bedrock.
   - OpenAI: cached_tokens aus Usage in Token-Counter, Cost-Berechnung anpassen.
   - Kilo Gateway: cache_control-Marker setzen, Live-Test gegen Gateway-Anthropic.
   - Backlog-Row IMP-18-01-02 auf Done.

## Live-Test-Protokoll (H-313-3 Falsifikation, IMP-18-01-02)

Bedrock mit Claude-Sonnet-Modell (z. B. `eu.anthropic.claude-sonnet-4-20250514-v1:0`):

1. Identische Anfrage zweimal hintereinander, max. 5 Minuten Abstand.
2. Erwartung: zweiter Call meldet `cacheReadInputTokens > 0` in der `usage`-Struktur.
3. Falsifikation: drei Test-Runs in Folge mit `cacheReadInputTokens: 0` -> Capability-Eintrag
   fuer dieses Modell-Pattern auf `false` setzen.

## Risiken und Mitigation (Erinnerung aus ADR-111)

- **R-1** Bedrock cachePoint regional eingeschraenkt -> Live-Test, Capability-Eintrag pflegen.
- **R-2** Kilo Gateway laesst cache_control fallen -> Live-Test, Eintrag entfernen wenn so.
- **R-3** OpenAI cached_tokens Cost-Approximation -> Tooltip-Hinweis.

## Open Items fuer /coding

Diese Punkte loest /coding gegen den realen Codebase-Stand:

1. Finale Pfad-Wahl fuer Capability-Modul: `src/api/capabilities.ts` vs.
   Erweiterung in `src/types/settings.ts` vs. eigenes Modul.
2. Pattern-Match-Implementierung: Glob (`micromatch`?) oder eigenes simples
   Wildcard-Matching. Eigenes Matching ist 10 Zeilen, eine Dependency ist
   schwerer zu rechtfertigen.
3. Token-Display-Komponente fuer cached_tokens-Anzeige: Pfad ermitteln, ob
   Aenderung im Display oder im Token-Counter-Service noetig ist.
4. Existiert bereits ein Cost-Calc-Modul, das Provider-Tarife haelt? Wenn ja,
   dort die 50%-Cached-Rate-Logik einbauen.

## Konsistenz-Check

- ADR-62 bleibt unveraendert in seiner Kern-Entscheidung. Update-Note 2026-05-09
  korrigiert nur die Bedrock- und UI-Annahmen, keine Aenderung am Section-
  Reordering.
- ADR-111 ergaenzt ADR-62 additiv, supersedet nicht.
- IMP-18-01-01 hat depends-on: [] (Phase 1 ist Vorbedingung).
- IMP-18-01-02 hat depends-on: [IMP-18-01-01] (braucht Capability-Tabelle).
- BACKLOG-Refs in beiden IMPs: ADR-62, ADR-111.
- Keine Konflikte mit ADR-11 (Multi-Provider Adapter Pattern), weil ADR-111
  innerhalb der bestehenden Provider-Adapter wirkt, kein neues Adapter-Niveau
  einfuehrt.
