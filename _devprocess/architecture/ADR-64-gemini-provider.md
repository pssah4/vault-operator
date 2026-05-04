# ADR-64: Google Gemini als eigenstaendiger Provider

**Date:** 2026-04-06
**Deciders:** Sebastian Hanke

## Context

Gemini-Modelle sind aktuell nur ueber Workarounds nutzbar: als `custom` Provider mit manuell gesetzter Base-URL (`https://generativelanguage.googleapis.com/v1beta/openai`) oder via OpenRouter. Das ist fuer Nutzer nicht intuitiv -- sie erwarten einen dedizierten "Google Gemini" Eintrag mit API-Key-Feld und Model-Fetching, analog zu Anthropic oder OpenAI.

Google stellt zwei Integrationswege bereit:
1. **OpenAI-kompatibles REST-API** unter `generativelanguage.googleapis.com/v1beta/openai` (Chat Completions, Embeddings, Models-Listing)
2. **Natives Google AI SDK** (`@google/genai`) mit eigenem Message-Format

**Triggering ASR:**
- Feature: Multi-Provider Support (Phase D)
- Quality Attribute: Usability, Provider-Paritaet

## Decision Drivers

- **Minimaler Aufwand:** Kein neues SDK, keine neue Message-Konvertierung -- das OpenAI-kompatible API reicht
- **Nutzererwartung:** Gemini als eigene Kategorie im UI, nicht versteckt unter "Custom"
- **Model Discovery:** Nutzer wollen verfuegbare Modelle per Klick fetchen, nicht manuell IDs eintippen
- **Konsistenz:** Gleiche Pattern wie Ollama/LM Studio -- eigener ProviderType, gleicher OpenAiProvider unter der Haube

## Considered Options

### Option 1: Eigener ProviderType mit OpenAI-kompatiblem Endpoint

Neuer `ProviderType 'gemini'` der den bestehenden `OpenAiProvider` nutzt (wie `ollama`, `lmstudio`). Feste Base-URL, eigenes UI-Label/Farbe, Model-Fetching ueber `/v1beta/openai/models`.

- Pro: Kein neues SDK, keine neue Message-Konvertierung
- Pro: Bewaehrtes Pattern (identisch zu Ollama/LM Studio)
- Pro: Sofort funktionsfaehig mit allen existierenden Features (Streaming, Tools, etc.)
- Pro: Minimaler Code-Aufwand (~50 Zeilen ueber 5 Dateien verteilt)
- Con: Kein Zugriff auf Gemini-spezifische Features (Grounding, Code Execution, Audio/Video Input)

### Option 2: Nativer Provider mit Google AI SDK

Neuer `GeminiProvider` mit `@google/genai` SDK, eigene Message-Format-Konvertierung (Anthropic-intern -> Gemini Content Parts).

- Pro: Zugriff auf alle Gemini-spezifischen Features
- Pro: Bessere Fehlerbehandlung mit nativen Error-Typen
- Con: Neue SDK-Dependency (~200KB)
- Con: Komplette Message-Konvertierung noetig (ContentBlock -> Gemini Parts)
- Con: Tool-Format-Mapping (ToolDefinition -> Gemini FunctionDeclaration)
- Con: Erheblich mehr Code (~400-500 Zeilen neuer Provider)
- Con: Gemini-spezifische Features sind fuer den Agent-Usecase aktuell nicht relevant

### Option 3: Status Quo beibehalten (Custom Provider)

Weiterhin ueber `provider: 'custom'` mit manueller Base-URL.

- Pro: Kein Entwicklungsaufwand
- Con: Schlechte UX -- Nutzer muessen Base-URL kennen und manuell eintragen
- Con: Kein Model-Fetching moeglich (Custom-Provider nutzt generisches `/v1/models`)
- Con: Keine visuell erkennbare Gemini-Kategorie im UI

## Decision

**Vorgeschlagene Option:** Option 1 -- Eigener ProviderType mit OpenAI-kompatiblem Endpoint

**Begruendung:**
Google bietet explizit einen OpenAI-kompatiblen Endpoint an. Diesen zu nutzen ist das etablierte Pattern im Projekt (Ollama, LM Studio, OpenRouter nutzen alle denselben `OpenAiProvider`). Der Aufwand ist minimal, die UX-Verbesserung signifikant. Sollte spaeter Bedarf an nativen Gemini-Features entstehen, kann Option 2 als Erweiterung nachgezogen werden.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Gemini als eigene Kategorie im Provider-Dropdown sichtbar
- API-Key eintragen und Modelle fetchen -- fertig
- Kein neues SDK, keine neue Abstraktionsschicht
- Built-in Modelle (gemini-2.5-flash, gemini-2.5-pro etc.) sofort verfuegbar

### Negative
- Gemini-spezifische Features (Grounding, Code Execution) nicht nutzbar
- Abhaengigkeit davon, dass Google den OpenAI-kompatiblen Endpoint langfristig pflegt

### Risks
- OpenAI-Kompatibilitaet bei Google ist "beta" (`/v1beta/`): Mitigation -- Endpoint existiert seit 2024, wird aktiv gepflegt. Bei Breaking Changes kann spaeter auf natives SDK umgestiegen werden.

## Implementation Notes

### Aenderungen pro Datei

**1. `src/types/settings.ts`**
- `ProviderType`: `'gemini'` hinzufuegen
- `BUILT_IN_MODELS[]`: Gemini-Modelle von `provider: 'custom'` auf `provider: 'gemini'` umstellen, `baseUrl` entfernen (wird automatisch gesetzt)

**2. `src/api/index.ts`**
- `buildApiHandler()`: Case `'gemini'` neben die anderen OpenAI-kompatiblen Provider

**3. `src/api/providers/openai.ts`**
- `DEFAULT_BASE_URLS`: `gemini: 'https://generativelanguage.googleapis.com/v1beta/openai'`

**4. `src/ui/settings/constants.ts`**
- `PROVIDER_LABELS`: `gemini: 'Google Gemini'`
- `PROVIDER_COLORS`: `gemini: '#4285f4'` (Google Blue)
- `MODEL_SUGGESTIONS`: Quick-Pick fuer gaengige Gemini-Modelle

**5. `src/ui/settings/testModelConnection.ts`**
- `fetchProviderModels()`: Case `'gemini'` -- GET auf `https://generativelanguage.googleapis.com/v1beta/openai/models` mit API-Key als Bearer Token. Response filtern auf `generateContent`-faehige Modelle.

**6. `src/ui/settings/ModelConfigModal.ts`**
- Provider-spezifische Felder: Nur API-Key zeigen (Base-URL ist fix)

**7. `src/types/model-registry.ts`**
- `GEMINI_MODELS` auf aktuelle Modelle pruefen/aktualisieren

### Model-Fetching Detail

Google's OpenAI-kompatibler Models-Endpoint:
```
GET https://generativelanguage.googleapis.com/v1beta/openai/models
Authorization: Bearer {API_KEY}
```

Response ist OpenAI-kompatibel (`{ data: [{ id, object, created }] }`). Filter auf Modelle die mit `gemini-` beginnen.

Alternativ nativ:
```
GET https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}
```

Response enthaelt `supportedGenerationMethods` zum Filtern auf Chat-faehige Modelle.

## Related Decisions

- ADR-11: Multi-Provider API Architecture
- ADR-36: Copilot Streaming Strategy (gleiches Pattern: neuer ProviderType, bestehender Adapter)

## References

- Google AI Studio: https://ai.google.dev/
- OpenAI Compatibility: https://ai.google.dev/gemini-api/docs/openai
