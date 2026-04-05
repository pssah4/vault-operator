# Plan Context: Google Gemini Provider (ADR-064)

> **Purpose:** Technische Zusammenfassung fuer Claude Code
> **Created by:** Architect
> **Date:** 2026-04-06

---

## Technical Stack

**Bestehend (keine Aenderungen):**
- Language: TypeScript (strict)
- Framework: Obsidian Plugin API
- Build: esbuild
- AI APIs: Anthropic SDK, OpenAI SDK (Gemini nutzt OpenAI SDK ueber kompatiblen Endpoint)

## Architecture Style

- Pattern: Provider-Adapter mit Factory (buildApiHandler)
- Key Quality Goals:
  1. Gemini als eigene Kategorie im UI (nicht "Custom")
  2. API-Key eintragen + Modelle fetchen = fertig
  3. Minimaler Code-Aufwand durch Wiederverwendung des OpenAiProvider

## Key Architecture Decisions (ADR Summary)

| ADR | Title | Vorgeschlagene Entscheidung | Impact |
|-----|-------|-----------------------------|--------|
| ADR-064 | Google Gemini Provider | OpenAI-kompatibler Endpoint als eigener ProviderType | Medium |

**Detail:**

1. **ADR-064 Google Gemini Provider:** Neuer `ProviderType 'gemini'` der den bestehenden `OpenAiProvider` nutzt, mit fester Base-URL auf Googles OpenAI-kompatiblen Endpoint.
   - Rationale: Gleiches Pattern wie Ollama/LM Studio. Kein neues SDK noetig.

## Aenderungen pro Datei

### 1. `src/types/settings.ts`
- `ProviderType` Union: `'gemini'` hinzufuegen
- `BUILT_IN_MODELS[]`: Bestehende Gemini-Eintraege von `provider: 'custom'` auf `provider: 'gemini'` umstellen. `baseUrl` entfernen (kommt automatisch aus DEFAULT_BASE_URLS)

### 2. `src/api/index.ts`
- `buildApiHandler()` Switch: `case 'gemini':` neben `case 'ollama':` etc. einfuegen (alle leiten auf `new OpenAiProvider(config)`)

### 3. `src/api/providers/openai.ts`
- `DEFAULT_BASE_URLS` Map: `gemini: 'https://generativelanguage.googleapis.com/v1beta/openai'` hinzufuegen

### 4. `src/ui/settings/constants.ts`
- `PROVIDER_LABELS`: `gemini: 'Google Gemini'` (oder i18n-Key)
- `PROVIDER_COLORS`: `gemini: '#4285f4'` (Google Blue)
- `MODEL_SUGGESTIONS`: Quick-Pick-Liste fuer Gemini-Modelle

### 5. `src/ui/settings/testModelConnection.ts`
- `fetchProviderModels()`: Neuer Case `'gemini'` -- GET auf OpenAI-kompatiblen Models-Endpoint mit Bearer-Token Auth. Filter auf `gemini-*` Modelle.

### 6. `src/ui/settings/ModelConfigModal.ts`
- Provider-spezifische Sichtbarkeit: Bei `gemini` nur API-Key anzeigen, Base-URL ausblenden (ist fix)

### 7. `src/types/model-registry.ts`
- `GEMINI_MODELS` pruefen und ggf. aktualisieren (aktuelle Modelle von Google)

## External Integrations

| System | Type | Protocol | Purpose |
|--------|------|----------|---------|
| Google AI API | Outbound | REST (OpenAI-kompatibel) | Chat Completions, Model Listing |

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/openai`
**Auth:** API-Key als Bearer Token im Authorization Header

## Kontext-Dokumente fuer Claude Code

1. `_devprocess/architecture/ADR-064-gemini-provider.md`
2. `_devprocess/architecture/ADR-011-multi-provider-api.md`
3. `src/api/providers/openai.ts` (bestehender OpenAI-kompatibler Provider)
4. `src/api/index.ts` (Factory Pattern)
5. `src/types/settings.ts` (ProviderType, BUILT_IN_MODELS)
6. `src/ui/settings/constants.ts` (UI Labels, Farben, Suggestions)
7. `src/ui/settings/testModelConnection.ts` (Model Discovery)
