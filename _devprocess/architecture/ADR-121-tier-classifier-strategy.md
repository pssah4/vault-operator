---
id: ADR-121
title: Tier-Klassifikator-Strategie (Pattern + Capability + OpenRouter-Pricing)
date: 2026-05-15
deciders: Sebastian + Architekt-Agent
related-features: FEAT-26-02
related-adrs: ADR-11 (Multi-Provider API Architecture), ADR-120 (Advisor-Pattern), ADR-122 (Provider-only Settings Schema)
related-imps: []
---

# ADR-121: Tier-Klassifikator-Strategie

## Status

Proposed (Architecture-Pass 2026-05-15, EPIC-26 Welle 1).
Triggernde ASR: EPIC-26 / FEAT-26-02; BA-27 Sektion 11 H-02.

## Kontext

Das Advisor-Pattern aus ADR-120 setzt voraus, dass das Plugin für den aktiven Provider weiss, welches Modell die Rollen `fast`, `mid` und `flagship` ausfüllt. Das ist sowohl die Grundlage für das automatische Loop-Routing als auch für das Chat-Header-Dropdown mit Override-Optionen. Heute pflegt der User pro Modell manuell ein Setting und entscheidet pro Chat selbst, welches er nutzt. Eine Auto-Klassifikation verlagert diese Entscheidung ins Plugin.

Provider liefern Modelle mit unterschiedlich reichen Metadaten zurück:

- Anthropic: ID, display_name, created_at. Keine Tier-Klassifikation, kein Pricing.
- OpenAI: ID, created. Keine Tier-Klassifikation, kein Pricing. Liste enthält auch Embedding-, Audio- und Bild-Modelle, die für Chat irrelevant sind.
- OpenRouter: ID, name, context_length, pricing (prompt, completion). Pricing ist hier verfügbar.
- Bedrock: ID mit Cross-Region-Prefix, sehr lange Liste. Keine Tier-Klassifikation.
- GitHub Copilot: Liste über Auth-Service. Eingeschränkter Modell-Pool.
- Google Gemini: ID, supportedGenerationMethods. Keine direkte Tier-Klassifikation.
- Ollama, LMStudio: lokale Modelle, beliebige User-installierte Namen.

Das Plugin braucht eine Strategie, die mit dieser Heterogenität umgeht und neue Modell-Releases automatisch erkennt, ohne dass der User pflegen muss.

## Decision Drivers

- Auto-Erkennung deckt mindestens die heute verbreiteten Modelle aller unterstützten Provider ab
- Klassifikator ist deterministisch (gleicher Input liefert gleichen Output, kein randomisierter Fallback)
- Erweiterung um neue Modell-Familien ist günstig (Code-Change, kein User-Konfiguration)
- Lokale Modelle (Ollama, LMStudio) werden gelistet, aber das Plugin trifft keine automatische Tier-Annahme bei beliebigen User-Namen
- Override-Pfad pro Tier-Slot bleibt sichtbar (User-Korrektur möglich)
- Provider-API-Latenz bleibt überschaubar (Cache, parallele Calls)

## Considered Options

### Option 1: Capability-First

Klassifikator schaut zuerst auf `contextWindow`, `maxOutputTokens`, `supportsThinking` und ähnliche Capability-Flags. Höchste Werte landen in flagship, mittlere in mid, niedrige in fast.

- **Pro:** Provider-übergreifend einheitliches Kriterium, keine Modell-ID-Pflege nötig
- **Con:** Capability-Daten sind nicht immer verfügbar (Anthropic-API liefert kein contextWindow in `/v1/models`). Ohne Daten muss man auf einen statischen Lookup oder ein zweites Pattern zurückfallen, dann ist Capability-First nicht mehr First. Schwellenwerte sind willkürlich und altern (heute haben fast alle Frontier-Modelle 200k context). Liefert weniger intuitive Mappings (z.B. ein günstiges Modell mit grossem Kontext landet falsch in flagship).

### Option 2: Pattern-First mit Capability-Fallback

Klassifikator hat eine Regex-Tabelle pro Modell-Familie (opus, gpt-5, o1, gemini-pro → flagship; sonnet, gpt-4.1, gpt-4o, deepseek-chat → mid; haiku, gpt-4o-mini, gemini-flash → fast). Bei fehlendem Pattern fällt der Klassifikator auf Capability-Heuristiken zurück. Bei OpenRouter wird zusätzlich das in der API gelieferte Pricing zur Tier-Bestimmung verwendet.

- **Pro:** Pattern-Match ist schnell und intuitiv. Klassifikator deckt die bekannten Modelle direkt. Capability-Fallback fängt unbekannte Modelle ab. OpenRouter-Pricing nutzt die einzige API-native Cost-Datenquelle. Erweiterbar durch Code-Update, kein User-Konfig.
- **Con:** Pattern-Tabelle muss gepflegt werden, wenn Provider neue Modell-Familien einführen. Bei sehr exotischen Modell-Namen kann der Capability-Fallback falsch klassifizieren. Pattern-Drift ist möglich, wenn Provider Namens-Konventionen ändern (z.B. "claude-3-opus" zu "claude-opus-4").

### Option 3: Explizit per Settings, keine Auto-Klassifikation

Plugin listet die Modelle, User pflegt pro Provider drei Tier-Slots manuell.

- **Pro:** keine Klassifikator-Pflege, deterministisch durch User-Wahl, robust gegen Provider-Drift
- **Con:** widerspricht dem Setup-Vereinfachungs-Ziel von EPIC-26. User muss bei jedem neuen Modell-Release pflegen. Die Vision "Provider plus Auth, Rest automatisch" wird hinfällig. Stagniert beim heutigen Pain-Point.

## Entscheidung

**Option 2.** Pattern-First mit Capability-Fallback und OpenRouter-Pricing-Sonderpfad.

Konkrete Mechanik:

- Pattern-Tabelle ist eine zentrale Konstanten-Datei mit Regex pro Tier. Pattern decken die heutigen aktuellen Modelle ab. Erweiterung erfolgt durch Code-Change im Pattern-Modul.
- Klassifikations-Aufruf: zuerst Pattern-Match auf Modell-ID (case-insensitive, normalisiert für Bedrock-Cross-Region-Prefix). Bei Treffer wird das Tier direkt zurückgegeben.
- Bei fehlendem Pattern-Match: Capability-basierter Fallback. Schwellenwerte werden zentral dokumentiert und sind anpassbar.
- Bei OpenRouter: zusätzlicher Pre-Check auf API-Pricing-Daten. Wenn `pricing.completion` (USD per Token) verfügbar, wird der Wert in eine Tier-Schwelle übersetzt (typisch: über 50 USD/M-Tokens → flagship, 5-50 USD → mid, unter 5 USD → fast). Pattern-Match bleibt der Default-Pfad, Pricing greift nur als Korrektur.
- Bei lokalen Providern (Ollama, LMStudio) und Custom-OpenAI-kompatiblen Endpoints: Klassifikator liefert standardmässig den Tier-Slot leer zurück. User muss manuell wählen. Plugin signalisiert das im UI.
- Outliers werden im Debug-Log markiert (Modell wurde nur per Fallback klassifiziert), damit Pattern-Pflege gezielt nachschärfen kann.

Validation in der Beta-Phase (H-02): Klassifikations-Test gegen die Modell-Listen aller unterstützten Provider zum Release-Zeitpunkt, Coverage >= 90 % wird erwartet.

## Konsequenzen

### Positiv

- Klassifikator ist schnell (keine Provider-API-Calls für die Klassifikation selbst, nur für die Modell-Liste)
- Bekannte Modelle werden intuitiv richtig klassifiziert
- Capability-Fallback gibt eine Antwort auch für neue oder unbekannte Modelle
- OpenRouter-Pricing-Pfad nutzt die einzige API-native Cost-Datenquelle und macht die Klassifikation dort robust gegen neue Modelle
- Lokale Provider werden nicht falsch klassifiziert (manuelle Wahl ist sauberer als eine geratene Auto-Klassifikation)
- Erweiterungs-Pfad ist klar (Pattern-Tabelle erweitern)

### Negativ

- Pattern-Tabelle wird Pflege-Aufwand, wenn Provider neue Modell-Familien einführen
- Capability-Fallback-Schwellen sind heuristisch und altern, wenn alle Modelle dieselbe Klasse erreichen
- OpenRouter-Sonderpfad ist ein zweiter Code-Pfad, der separat getestet werden muss
- Debug-Log-Outliers brauchen aktive Beobachtung, sonst werden falsche Klassifikationen still toleriert

### Risiken

- Provider-Namens-Konventionen ändern sich (z.B. "claude-3-opus" zu "claude-opus-4-7"), Pattern werden veraltet. Mitigation: Pattern matchen auf das Modell-Familien-Prefix (`claude.*opus`), nicht auf vollständige IDs. Plus: Outlier-Log gibt Frühwarnung.
- Capability-Fallback klassifiziert ein neues günstiges Modell mit grossem Kontextfenster fälschlich als flagship. Mitigation: User-Override pro Tier-Slot ist immer verfügbar, plus Outlier-Log.
- OpenRouter-API-Format ändert sich, Pricing-Feld verschwindet oder wechselt den Namen. Mitigation: Pricing-Pfad ist optional, Klassifikator funktioniert auch ohne (Pattern-Match bleibt Default).
- Bei Bedrock liefert die API extrem viele Modelle (Cross-Region-Profile, ältere Generationen). Klassifikator klassifiziert sie alle, aber die UI muss filtern, sonst wird die Liste unübersichtlich.

### Architektonische Folgepunkte

- ADR-122 (Provider-only Settings Schema) konsumiert die Klassifikator-Ergebnisse und persistiert sie in `tierMapping` pro Provider
- ADR-120 (Advisor-Pattern) konsumiert die Tier-Slots als Loop-Pair-Quelle
- arc42 Sektion 5 bekommt einen `ModelDiscoveryService`-Block

## Related Decisions

- Voraussetzt durch ADR-120 (Advisor-Pattern braucht aufgelöste Tier-Slots)
- Konsumiert von ADR-122 (Provider-only Settings Schema)
- Erweitert ADR-11 (Multi-Provider API Architecture) implizit, weil eine neue Service-Klasse hinzukommt

## Implementation Notes

Die folgenden Code-Pfade sind Anhaltspunkte und können nach Coding-Pivots veralten.

- Pattern-Tabelle in `src/core/routing/ModelTierClassifier.ts` als zentrale Konstante
- Capability-Fallback nutzt `ModelInfo`-Felder aus `src/types/model-registry.ts` (`contextWindow`, `maxTokens`)
- Bedrock-ID-Normalisierung greift auf bestehende `normalizeModelId()`-Funktion zurück
- Discovery-Service in `src/core/routing/ModelDiscoveryService.ts` wrappt das existierende `fetchProviderModels()` und cached pro Provider mit 24h-TTL
- OpenRouter-Pricing-Pre-Check liest `pricing.prompt` und `pricing.completion` aus dem `/api/v1/models`-Response
- Outlier-Log via `console.debug('[ModelTierClassifier] outlier ...')` als Pflege-Signal

## Quellen

- BA-27 Sektion 7.1 Welle 2
- FEAT-26-02 Description, Success Criteria
- OpenRouter `/api/v1/models` API-Doku (Pricing-Felder)
- Bestehender `fetchProviderModels()` als Discovery-Quelle
