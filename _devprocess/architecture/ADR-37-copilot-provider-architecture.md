# ADR-37: GitHub Copilot Provider Architecture

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

GitHub Copilot muss als LLM Provider in die bestehende `ApiHandler`-Architektur integriert werden. Die Copilot API ist OpenAI-kompatibel (Chat Completions Format), erfordert aber einen eigenen Auth-Lifecycle (OAuth Device Code Flow → Access Token → kurzlebiger Copilot Token) und spezifische Request-Headers.

**Triggering ASR:**
- Token-Lifecycle als Singleton-Service (Reliability/Concurrency, FEAT-12-01)
- Content-Normalisierung im Stream-Handler (Correctness, FEAT-12-02)

**Problem:** Soll Copilot als Erweiterung des bestehenden `OpenAiProvider` implementiert werden (weniger Code) oder als eigener Provider mit dediziertem Auth-Service (saubere Trennung)?

## Decision Drivers

- **Separation of Concerns:** Token-Lifecycle (OAuth, Refresh, Polling) ist fundamental anders als API-Key-basierte Provider
- **Code-Sharing:** Copilot API ist OpenAI-kompatibel -- Chat Completions und Tool Calling sind identisch
- **Wiederverwendbarkeit:** Auth-Service wird von Chat UND Embedding gebraucht
- **Testbarkeit:** Token-Management isoliert testbar
- **Bestehendes Pattern:** ADR-11 favorsiert minimale Provider-Anzahl (2 statt 7)

## Considered Options

### Option 1: OpenAiProvider erweitern
- `OpenAiProvider` um Copilot-spezifische Logik erweitern (Token-Refresh, Headers, Content-Normalisierung)
- Pro: Weniger Code, teilt Streaming/Tool-Call-Logik
- Con: `OpenAiProvider` wird komplex (Token-Refresh + OAuth State in einem Chat-Provider)
- Con: Verletzt Single Responsibility -- Auth-Lifecycle ≠ Chat-Completion
- Con: Token-Refresh-Promise-Lock, Generation Counter etc. in einem Provider der auch fuer Ollama/Azure genutzt wird

### Option 2: Eigener GitHubCopilotProvider + GitHubCopilotAuthService (Singleton)
- Neuer `GitHubCopilotProvider` implementiert `ApiHandler`
- Nutzt OpenAI SDK intern (wie `OpenAiProvider`) mit Custom fetch-Wrapper
- Delegiert Token-Management an separaten `GitHubCopilotAuthService` Singleton
- Pro: **Saubere Trennung:** Auth-Logik isoliert, wiederverwendbar (Chat + Embedding)
- Pro: Provider ist schlank -- nur Copilot-Header-Injection und Content-Normalisierung
- Pro: Auth-Service unabhaengig testbar (Token-Refresh, Polling, Race Conditions)
- Pro: Generation Counter und Promise-Lock nur im Auth-Service
- Con: Eine neue Datei fuer Provider + eine fuer Auth-Service
- Con: Etwas Code-Duplizierung mit `OpenAiProvider` (SDK-Setup)

### Option 3: Copilot als Konfigurationsvariante in Factory
- Kein eigener Provider, stattdessen `buildApiHandler` erstellt `OpenAiProvider` mit Copilot-Config
- Pro: Minimalster Code-Aufwand
- Con: Token-Refresh-Logik muesste in `OpenAiProvider` oder davor
- Con: Content-Normalisierung muesste conditional (wenn Copilot + Claude)
- Con: Kopfschmerzen bei Wartung

## Decision

**Vorgeschlagene Option:** Option 2 -- Eigener `GitHubCopilotProvider` + `GitHubCopilotAuthService`

**Begruendung:**
1. **Auth-Lifecycle ist fundamental anders** als bei allen anderen Providern. Er verdient eine eigene Klasse.
2. Der Auth-Service wird von **Chat UND Embedding** gebraucht -- ein Singleton vermeidet doppelte Token-State.
3. Der Provider selbst ist schlank: Er erstellt ein OpenAI SDK Client mit Custom fetch, plus Content-Normalisierung im Stream-Handler. Die Stream-Logik kann vom `OpenAiProvider` uebernommen werden (Code-Sharing durch gemeinsame Hilfsfunktionen oder Vererbung).
4. Generation Counter, Promise-Lock, Polling-Cancellation -- alles nur im Auth-Service, nicht im Provider.
5. Konsistenz: `AnthropicProvider` hat auch eigene Logik (Extended Thinking), die im `OpenAiProvider` keinen Platz haette.

**Architektur-Uebersicht:**
```
GitHubCopilotAuthService (Singleton)
├── startDeviceCodeFlow()    → DeviceCodeResponse
├── pollForAccessToken()     → accessToken
├── fetchCopilotToken()      → copilotToken
├── getValidCopilotToken()   → token (auto-refresh)
├── resetAuth()              → void
└── listModels()             → ModelResponse

GitHubCopilotProvider (implements ApiHandler)
├── constructor(config)
│   └── creates OpenAI client with custom fetch
│       └── fetch wrapper: injects getValidCopilotToken() + Copilot Headers
├── createMessage()          → ApiStream (with content normalization)
└── getModel()               → ModelInfo
```

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Klare Verantwortlichkeiten: Auth-Service = Tokens, Provider = API Calls
- Auth-Service wiederverwendbar fuer Chat, Embedding, Model Listing
- Generation Counter und Promise-Lock isoliert und testbar
- Provider schlank und wartbar

### Negative
- Zwei neue Dateien statt einer
- Minimale Code-Duplizierung mit `OpenAiProvider` (OpenAI SDK Setup)

### Risks
- **Singleton-Lifecycle:** Auth-Service muss bei Plugin-Deinitialisierung aufgeraeumt werden (Polling abbrechen): Mitigation: `onunload()` im Plugin ruft `resetAuth()` auf

## Implementation Notes

**Dateistruktur:**
- `src/core/security/GitHubCopilotAuthService.ts` -- neben SafeStorageService
- `src/api/providers/github-copilot.ts` -- neben openai.ts und anthropic.ts

**Provider Factory Erweiterung (`src/api/index.ts`):**
```typescript
case 'github-copilot':
    return new GitHubCopilotProvider(config);
```

**Content-Normalisierung im Provider:**
```typescript
// Im Stream-Generator: delta.content Array → String normalisieren
if (Array.isArray(delta.content)) {
    delta.content = delta.content.map(p => p.text ?? '').join('');
}
// Fehlende delta.role → "assistant" defaulten
if (!delta.role) delta.role = 'assistant';
```

## Related Decisions

- ADR-11: Multi-Provider API Architecture -- erweitert das Adapter Pattern um einen dritten `ApiHandler`
- ADR-36: Copilot Streaming Strategy -- OpenAI SDK mit Custom fetch
- ADR-19: Electron SafeStorage -- Token-Verschluesselung

## References

- FEAT-12-01: Auth & Token Management
- FEAT-12-02: Chat Completions Provider
- Referenz: obsidian-copilot GitHubCopilotProvider (Singleton Pattern)
