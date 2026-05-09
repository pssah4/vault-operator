---
id: ADR-111
title: Provider Capability-Flag und Bedrock cachePoint (Erweiterung zu ADR-62)
date: 2026-05-09
deciders: Sebastian + Architekt-Agent
related-features: FEAT-18-01
related-adrs: ADR-62 (KV-Cache-Optimized Prompt Structure), ADR-11 (Multi-Provider API Architecture)
related-imps: IMP-18-01-01, IMP-18-01-02
---

# ADR-111: Provider Capability-Flag und Bedrock cachePoint (Erweiterung zu ADR-62)

## Status

Proposed (Architecture-Pass 2026-05-09, ausgeloest durch Issue #313).

## Kontext

ADR-62 hat 2026-04-04 die KV-Cache-optimierte Prompt-Struktur entschieden
und dabei drei Annahmen getroffen:

1. Ein separates `PromptCacheAdapter`-Interface ist Over-Engineering.
2. Anthropic ist bereits korrekt verkabelt, andere Provider profitieren
   automatisch vom stabilen Prefix.
3. Der UI-Toggle fuer Prompt Caching ist provider-spezifisch sichtbar.

Issue #313 und der Code-Audit von 2026-05-09 zeigen drei Luecken in
diesen Annahmen:

**Luecke 1 -- Bedrock cached nicht automatisch.** ADR-62 listet OpenAI
und DeepSeek als "automatisches Prefix-Caching", erwaehnt aber Bedrock
nicht. Der Audit zeigt: Anthropic-Modelle ueber Bedrock benoetigen
explizite `cachePoint`-Marker im Request-Body, sonst meldet die
Response `cacheReadInputTokens: 0`. Bedrock-Kunden zahlen heute die
volle Rate, obwohl das AWS-SDK die noetige API seit v3.1030 anbietet.

**Luecke 2 -- UI-Visibility ist provider-hardcoded.** Der Toggle in
`ModelConfigModal` ist nur sichtbar fuer zwei Provider-Strings. Andere
cache-faehige Provider (Bedrock, OpenAI mit cached_tokens-Tracking,
Kilo Gateway, OpenRouter) haben keinen Schalter, obwohl sie nach
Phase 2 von Issue #313 unterstuetzt werden.

**Luecke 3 -- Default-Verhalten widerspricht ADR-62-Praemisse.** ADR-62
geht von "Zero-Config, automatische Aktivierung" aus, aber der
Settings-Default ist `false`. User muessen aktiv klicken.

ADR-62 selbst bleibt richtig in seiner Kern-Entscheidung (Section-
Reordering + minimaler Adapter-Bedarf). Die drei Luecken betreffen
ein NEUES Konzept (Capability-Modellierung im UI) und eine NEUE
Provider-Implementierung (Bedrock cachePoint), die in ADR-62 nicht
diskutiert wurden.

**Triggering ASR (aus IMP-18-01-01 / IMP-18-01-02):**

- ASR-1: Capability-Flag-Standort
- ASR-2: Bedrock cachePoint-Pattern

**Quality Attributes:** Cost Efficiency, Maintainability, Compatibility.

## Decision Drivers

- **Datengetriebene UI-Visibility:** Toggle-Sichtbarkeit muss aus
  Provider/Modell-Metadaten ableitbar sein, nicht aus hardcoded Strings.
- **Kein neues Provider-Modul:** Bestehende Provider-Klassen sollen
  bleiben, kein Refactoring auf eine neue Adapter-Schicht.
- **Konsistenz mit ADR-62:** Section-Reordering bleibt der Hauptmechanismus;
  Capability-Flag und cachePoint sind additive Ergaenzungen.
- **Backward Compatibility:** Bestehende Settings-Configs bleiben gueltig,
  keine Daten-Migration.
- **Konservative Defaults:** Modelle ohne explizit gepflegtes Capability-
  Flag bekommen `false`, nicht `true`. Keine stillen Cost-Spikes.

## Considered Options

### Option A -- Capability-Flag im bestehenden Modell-Metadaten-Typ

Erweitere die bestehende Modell-Metadaten-Struktur (heute mit Feldern fuer
Context-Window, Tool-Support, Streaming-Support) um ein boolesches
Cache-Capability-Feld. Provider liefern den Wert pro Modell ueber ihre
bestehende getModel-Methode.

UI-seitig braucht das Settings-Modal eine Lookup-Funktion, die VOR
einem API-Call (also bevor ein Provider instanziiert ist) den Wert
fuer Provider-Typ + Modell-ID liefern kann.

- Pro: Kanonische Quelle, eng am Provider-Code.
- Pro: Andere Capabilities folgen demselben Muster.
- Pro: Minimaler Footprint (kein neues Modul).
- Con: Doppelte Pflege noetig: einmal im Provider (`getModel()`), einmal in
  einer UI-Lookup-Tabelle. Drift-Risiko.
- Con: UI braucht Provider-Instanziierung oder eine duplizierte
  Statik-Tabelle.

### Option B -- Capability-Flag in `LLMProvider` pro Provider-Typ (grob)

Setze `supportsPromptCache` pro Provider-Typ (Anthropic = true,
OpenAI = true, GitHub Copilot = false, etc.), nicht pro Modell.

- Pro: Einfache Lookup-Funktion, keine Modell-Tabelle noetig.
- Pro: Keine Drift zwischen UI und Provider.
- Con: Zu grob: GitHub Copilot mit Claude-Modell unterstuetzt Caching,
  GitHub Copilot mit GPT-4o-mini nicht. Provider-Granularitaet erfasst
  das nicht.
- Con: OpenAI gpt-3.5-turbo cached nicht, gpt-4o cached. Pro-Provider
  ist falsch.

### Option C -- Statische Capability-Tabelle in einem dedizierten Modul (UI-first)

Eine zentrale, statische Tabelle in einem neuen kleinen Modul, die pro
(Provider, Modell-Pattern) das Cache-Verhalten festhaelt. Sowohl UI als
auch Provider-Code lesen aus dieser Tabelle.

- Pro: Eine einzige Quelle der Wahrheit, kein Drift-Risiko.
- Pro: UI kann ohne Provider-Instanziierung lesen.
- Pro: Tests koennen die Tabelle direkt validieren (Modell-Coverage).
- Pro: Pattern-Match auf Modell-IDs erlaubt grobe Eintraege ("anthropic/claude-3*").
- Con: Neues Modul (klein, ~50 Zeilen), zusaetzliche Abstraktion.
- Con: Provider-Code muss bei `getModel()` die Tabelle konsultieren statt
  hardcoded `true` zu setzen.

### Option D -- Bedrock cachePoint im PromptCacheAdapter aus ADR-62

ADR-62 hat einen Adapter explizit verworfen ("Over-Engineering").
Diese Option wuerde die Entscheidung umkehren und einen Adapter pro
Provider einfuehren, der cache_control / cachePoint / cached_tokens-
Tracking kapselt.

- Pro: Saubere Architektur-Trennung.
- Pro: Neuer Cache-Provider = eine Adapter-Klasse.
- Con: Widerspricht direkt ADR-62 (Begruendung 2026-04-05).
- Con: Mehr Code fuer wenig zusaetzlichen Wert. Provider-Code ist heute
  uebersichtlich, drei Provider-Eingriffe sind ueberschaubar.
- Con: Refactoring von Anthropic-Provider noetig, der heute unveraendert
  funktioniert.

## Decision

**Vorgeschlagene Kombination:**

- **Option C** fuer das Capability-Modell: statische Tabelle in einem
  neuen kleinen Modul. Finale Pfad-Wahl in /coding.
- **Direkt im Provider-Code** (Option D wurde verworfen) fuer Bedrock cachePoint,
  OpenAI cached_tokens und Kilo Gateway Passthrough. Konsistent mit
  ADR-62-Praemisse "kein separater Adapter".

**Begruendung:**

- Option A ist verlockend, aber der Drift zwischen Provider-`getModel()`
  und der UI-Lookup-Tabelle ist real. Issue #313 wurde genau wegen
  dieses Drifts geoeffnet (UI-Toggle aus Sicht des User defekt, weil
  die Capability-Information im UI nicht ankam).
- Option B ist zu grob fuer die heute schon existierende Heterogenitaet
  (GitHub Copilot Claude vs. GPT, OpenAI gpt-3.5 vs. gpt-4o).
- Option D widerspricht ADR-62 ohne neuen Grund: drei Provider-Eingriffe
  sind nicht teurer als eine Adapter-Schicht plus drei Adapter-Implementierungen.
- Option C ist der naechste Schritt nach Option A: eine Quelle, von der
  sowohl UI als auch Provider-`getModel()` lesen. Die Tabelle ist klein
  (heute ~6 Provider, ~30 relevante Modelle), Pattern-Match erlaubt
  Wildcards.

**Capability-Tabellen-Schema (Skizze):**

```
Eintrag := {
  providerType: ProviderType,
  modelPattern: string | RegExp,   // z.B. "anthropic/claude-3-*"
  supportsPromptCache: boolean,
  cacheStyle: 'anthropic-ephemeral' | 'bedrock-cachepoint' | 'openai-implicit' | 'passthrough' | 'none',
  notes?: string,                  // Begruendung, optional
}
```

`cacheStyle` ist eine kompakte Klassifikation, die Provider-`getModel()`
und Provider-`createMessage()` benutzen, um den richtigen Mechanismus
zu setzen, ohne eine vollstaendige Adapter-Hierarchie zu bauen.

**Default-Switch (IMP-18-01-01):** `undefined === true` zur Laufzeit in
`modelToLLMProvider()`. Keine Daten-Migration. Konsistent mit dem
Capability-Flag: Wenn Tabelle `supportsPromptCache: true` meldet UND
User-Setting nicht `false` ist, wird Caching aktiv.

**Bedrock cachePoint (IMP-18-01-02):** In `BedrockProvider.createMessage()`
explizite `cachePoint`-ContentBlocks am Ende von System-Prompt-Block
und letztem User-Message-Block, gesteuert durch Capability-Tabelle.
Live-Test gegen `cacheReadInputTokens > 0` validiert die Implementierung.

## Consequences

### Positive

- Eine Datenquelle fuer Cache-Capability, kein Drift zwischen UI und Provider.
- UI-Toggle-Visibility ist datengetrieben und automatisch korrekt fuer
  zukuenftige Provider/Modelle (neuer Eintrag in Tabelle reicht).
- Bedrock-Kunden bekommen Cache-Rabatt ohne weitere User-Aktion.
- OpenAI-Tracking deckt impliziten Cache sichtbar im UI ab.
- ADR-62 bleibt unveraendert in seiner Kern-Entscheidung; nur ein dated
  Note korrigiert die Bedrock-Annahme.
- Konservative Defaults verhindern stille Cost-Spikes bei neuen Modellen.

### Negative

- Neues kleines Modul fuer die Capability-Tabelle ist zusaetzlicher Code,
  der gepflegt werden muss.
- Pattern-Match auf Modell-IDs ist eine kleine Komplexitaet (Regex oder
  Glob), die in Tests abgedeckt werden muss.
- Capability-Tabelle wird zur Single Source of Truth: ein Fehler dort
  trifft sowohl UI als auch alle Provider.

### Risiken

- **R-1 Bedrock cachePoint regional eingeschraenkt:** AWS-Doku deutet
  an, dass cachePoint nicht in allen Regionen oder fuer alle Modelle
  verfuegbar ist. **Mitigation:** Live-Test in IMP-18-01-02 (H-313-3),
  Capability-Tabelle pro Modell-Pattern eintraegt nur was real
  funktioniert. Bei `cacheReadInputTokens: 0` ueber drei Iterationen:
  Pattern auf `false` setzen.
- **R-2 Kilo Gateway laesst cache_control fallen:** Annahme dass das
  Gateway Anthropic-Felder unveraendert durchreicht ist nicht
  verifiziert. **Mitigation:** Live-Test in IMP-18-01-02. Bei Bedarf
  Eintrag in Capability-Tabelle entfernen.
- **R-3 OpenAI cached_tokens Cost-Approximation:** Naive 50%-Annahme
  fuer cached_tokens deckt Tier-Rabatte und Batch-Pricing nicht ab.
  **Mitigation:** Tooltip im UI mit Hinweis, dass die finale Abrechnung
  vom OpenAI-Tarif abhaengt.

## Auswirkung auf ADR-62

ADR-62 bleibt **Accepted** und seine Kern-Entscheidung (Section-
Reordering, kein Adapter) bleibt gueltig. Im Consequences-Abschnitt
wird ein dated Note ergaenzt, der die zwei impliziten Annahmen
korrigiert (Bedrock automatisch, GitHub Copilot kein Caching) und auf
ADR-111 verweist. ADR-62 wird nicht superseded.

## Implementation Notes (fuer /coding, optional)

Diese Hinweise duerfen veralten und werden nicht mit /consistency-check
gegen den Code abgeglichen.

- Capability-Tabelle vermutlich in `src/api/capabilities.ts` (neuer Pfad).
  Alternative: in `src/types/settings.ts` ergaenzen, wenn Drift zur
  bestehenden CustomModel-Struktur vermieden werden soll.
- UI-Lookup: `getCacheCapability(providerType, modelId): CacheCapabilityEntry`
  als pure Funktion in der Tabelle, vom Settings-Modal direkt importiert.
- Anthropic-Provider unveraendert (cache_control bleibt, gesteuert durch
  `cacheStyle === 'anthropic-ephemeral'`).
- Bedrock-Provider: cachePoint-Block-Insertion direkt vor dem
  `ConverseStreamCommand`-Aufruf, AWS-SDK-Typ `ContentBlock.cachePoint`.
- OpenAI-Provider: Streaming-Handler liest `usage.prompt_tokens_details
  ?.cached_tokens`, addiert in das bestehende Token-Display.
- Kilo Gateway: identische `cache_control`-Marker wie Anthropic, weil
  Request-Format Anthropic-kompatibel.

## References

- ADR-62: KV-Cache-Optimized Prompt Structure (vorausgehende Entscheidung)
- ADR-11: Multi-Provider API Architecture (Adapter-Pattern auf Provider-Ebene)
- IMP-18-01-01: Settings UI (Phase 1)
- IMP-18-01-02: Provider-Coverage (Phase 2)
- BA-12 Section 11: Update-Block fuer Issue #313
- Issue #313: https://github.com/pssah4/obsilo-dev/issues/313
- AWS Bedrock Prompt Caching: cachePoint ContentBlock in @aws-sdk/client-bedrock-runtime ab v3.1030
- OpenAI Prompt Caching: usage.prompt_tokens_details.cached_tokens
