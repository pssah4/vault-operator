---
id: ADR-88
name: ChatGPT OAuth Provider Architecture
epic: EPIC-21
depends-on: [FEAT-00-21-001, FEAT-00-21-002, FEAT-00-21-003]
---

# ADR-88: ChatGPT OAuth Provider Architecture

**Date:** 2026-04-28
**Deciders:** Sebastian Hanke

## Review Note (2026-04-28)

Codebase-Reconciliation deckte drei Annahmen auf, die korrigiert wurden:

1. **SafeStorageService-API:** Real ist `encrypt(plain): string` und `decrypt(value): string` mit `enc:v1:<base64>`-Prefix (siehe `src/core/security/SafeStorageService.ts:66-95`). Kein `SafeStorageEnvelope`-Objekt. Settings-Schema unten ist entsprechend angepasst.
2. **`ProviderType`-Union:** Real ist `'lmstudio'` (nicht `'lm-studio'`) und enthaelt zusaetzlich `'bedrock'` (`src/types/settings.ts:10`). Buildhandler-Switch in `src/api/index.ts:29` ist die einzige Stelle mit exhaustivem Switch.
3. **Streaming-Pattern in `openai.ts`:** Die Funktion `createNodeFetch()` (Zeilen 69-130) liefert einen `fetch`-kompatiblen Wrapper, den das OpenAI-SDK konsumiert. Da wir das OpenAI-SDK nicht verwenden (es spricht `api.openai.com`, nicht Codex-Backend), nutzen wir das gleiche Node-`https`-Fundament direkt mit eigenem SSE-Parser. Der eslint-disable-Kommentar wird wortgleich uebernommen.

## Context

EPIC-21 fuehrt einen neuen LLM-Provider ein, der das ChatGPT-Plus/Pro-Abo als Backend nutzt. Im Gegensatz zum bestehenden `OpenAiProvider` spricht dieser Provider nicht `api.openai.com`, sondern die undokumentierten Codex-Backend-Endpoints unter `chatgpt.com/backend-api/codex/responses`. Die Authentifizierung folgt einem PKCE-OAuth-Flow gegen `auth.openai.com` mit lokalem Loopback-Callback (siehe ADR-89). Der Token-Lifecycle braucht einen eigenstaendigen Service, weil parallele Refresh-Calls serialisiert werden muessen und der Service spaeter potenziell auch vom Embedding-Pfad genutzt werden koennte.

**Triggering ASRs:**

- Eigener `ChatGptOAuthService` als Singleton (Reliability, Concurrency, FEAT-00-21-001).
- Schema-Mapping Codex-Responses zu `ApiStream` (Maintainability, Performance, FEAT-00-21-002).
- Tool-Definitions im Responses-Format (Correctness, FEAT-00-21-002).
- SafeStorageService-Integration mit verschachteltem Settings-Schema (Security, Maintainability, FEAT-00-21-001).

**Problem:** Wo lebt der OAuth-Service, wie ist der Provider geschnitten, wie wird das Codex-Responses-API-Schema gegen Drift abgesichert, und wie sieht das Settings-Schema fuer die Tokens aus?

## Decision Drivers

- **Separation of Concerns:** Auth-Lifecycle und API-Aufruf sind getrennte Verantwortungen, wie schon bei Copilot (ADR-37).
- **Endpoint-Drift-Resilienz:** Die Codex-Endpoints sind undokumentiert. Schema-Annahmen muessen an einer Stelle isoliert sein, sodass eine Aenderung in einem File nachgepflegt werden kann.
- **Streaming-Performance:** Time-to-First-Token unter zwei Sekunden in 95 Prozent der Faelle. Polling-Loesungen fallen aus.
- **Plugin-Review-Compliance:** Kein `fetch()`, kein `innerHTML`, keine `any`-Types, eslint-disable-Begruendungen pflegen.
- **Wiederverwendbarkeit:** OAuth-Service soll spaeter auch von einem moeglichen Codex-Embedding-Pfad oder einem zweiten Subscription-Provider nutzbar sein, falls OpenAI Drittanbieter-Endpoints freigibt.
- **Einfachheit der Settings-Migration:** Bestehende Settings-Struktur darf nicht aufgebrochen werden.

## Considered Options

### Option 1: OpenAiProvider erweitern, Tokens flach in Settings

- `OpenAiProvider` bekommt einen Switch fuer `'chatgpt-oauth'`-Modus, Tokens liegen flach als `chatgptOAuthAccessToken` etc. in den Settings.
- Pro: Weniger neue Dateien.
- Con: `OpenAiProvider` wird komplex, mischt zwei sehr unterschiedliche API-Schemata (Chat-Completions vs. Responses-API).
- Con: Endpoint-Drift im Codex-Schema beeinflusst dann auch den BYOK-Pfad ueber gemeinsame Code-Pfade.
- Con: Settings-Felder verstreut, kein klares Mapping zwischen Plugin-Setup und SafeStorage-Envelope.
- Con: Verletzt das Pattern, das mit ADR-37 (Copilot) etabliert ist.

### Option 2: Eigener `ChatGptOAuthProvider` plus `ChatGptOAuthService`-Singleton, Settings verschachtelt

- Neuer `ChatGptOAuthProvider`, implementiert `ApiHandler`.
- `ChatGptOAuthService` als Singleton.
- Settings: `chatgptOAuth: { accountId, planTier, expiresAt, tokens: SafeStorageEnvelope, disclaimerAcknowledgedAt }`.
- Schema-Mapping: dedizierte `CodexResponseMapper`-Klasse in derselben Datei oder als Geschwister-Datei `chatgpt-codex-mapper.ts`.
- Pro: Saubere Trennung, gleiches Pattern wie Copilot (ADR-37).
- Pro: Schema-Annahmen in einer Datei, mit Datums-Kommentar pro Annahme.
- Pro: Settings-Migration trivial, weil nur ein neues Feld auf Top-Level dazukommt.
- Pro: Service kann spaeter wiederverwendet werden.
- Con: Drei neue Dateien (Provider, Service, Mapper) statt einer.
- Con: Minimale Code-Duplizierung mit `OpenAiProvider` (Tool-Akkumulator-Pattern).

### Option 3: Provider plus inline Mapper, Auth-Logik im Provider

- Provider als eine Datei, Auth-Logik (Refresh-Lock, Generation-Counter) inline.
- Pro: Eine Datei.
- Con: Auth-Lifecycle vermischt sich mit API-Mapping.
- Con: Zukuenftige Wiederverwendung des Auth-Service kostet ein Refactoring.
- Con: Tests werden schwerer zu isolieren.

## Decision

**Vorgeschlagene Option:** Option 2.

**Begruendung:**

1. Das Copilot-Pattern aus ADR-37 hat sich bewaehrt. Konsistenz ueber Provider hinweg reduziert kognitive Last.
2. Endpoint-Drift ist das groesste Risiko des Epics. Ein dedizierter `CodexResponseMapper` mit Schema-Annahmen-Kommentaren begrenzt den Blast-Radius einer Aenderung auf ein File.
3. Der OAuth-Service braucht ein Promise-Lock und einen Generation-Counter. Beides gehoert nicht in eine Datei, die auch HTTP-Calls absetzt.
4. Verschachteltes Settings-Schema haelt SafeStorage-Envelope, Public-Metadaten (Email, Plan-Tier) und User-Disclaimer-Flag zusammen, was Disconnect-Logik trivial macht (ein `delete settings.chatgptOAuth`).

**Architektur-Uebersicht:**

```
ChatGptOAuthService (Singleton, src/core/auth/)
  startAuthFlow()           -> oeffnet Browser, startet Loopback-Server (siehe ADR-89)
  handleCallback(code)      -> tauscht Code gegen Tokens, persistiert via SafeStorage
  getValidAccessToken()     -> Auto-Refresh 60s vor Ablauf, Promise-Lock
  refresh()                 -> verwendet refresh_token, generation-counter
  disconnect()              -> SafeStorage clear, Settings reset
  getAccountInfo()          -> { accountId, email, planTier } aus id_token

ChatGptOAuthProvider (implements ApiHandler, src/api/providers/)
  constructor(config, authService)
  createMessage(messages, tools, metadata)
    -> CodexResponseMapper.toRequest(messages, tools)
    -> Node-https-Stream mit Bearer-Token (siehe Streaming-Sub-Decision)
    -> CodexResponseMapper.fromStream(events) -> ApiStream
  getModel()                -> aus Settings.chatgptOAuth.model

CodexResponseMapper (src/api/providers/chatgpt-codex-mapper.ts)
  toRequest(messages, tools) -> CodexRequest
  fromStream(events)         -> AsyncIterable<ApiStreamChunk>
  parseEvent(event)          -> Type-Guard auf bekannte Schema-Versionen

PkceLoopbackServer (src/core/auth/PkceLoopbackServer.ts, siehe ADR-89)
```

**Sub-Decisions:**

- **Streaming-Transport:** Node-`https` mit `IncomingMessage`-Stream, identisch zum Pattern im OpenAI-Provider. `requestUrl` faellt aus, weil es keinen `ReadableStream` liefert. Der `eslint-disable`-Block aus dem OpenAI-Provider wird mit derselben Begruendung wiederverwendet.
- **Schema-Validation:** Type-Guards statt `zod`. `zod` ist heute nicht im Bundle, der Bundle-Size-Aufschlag (rund 50 KB) ist nicht gerechtfertigt fuer drei bis vier Schema-Strukturen. Type-Guards bleiben in `chatgpt-codex-mapper.ts` mit Datums-Kommentar (`// Schema as observed 2026-04-28`).
- **JWT-Decoder:** Eigener Mini-Decoder im `jwt-decode`-Modul, etwa 30 Zeilen. Kein Signatur-Check noetig, weil das `id_token` direkt vom Token-Endpoint kommt und ueber TLS validiert wird. `jose` als Lib waere overkill fuer reines Claim-Lesen.
- **Modell-Discovery:** Hardcode-Liste in `chatgpt-codex-mapper.ts` (`gpt-5-codex`, weitere bekannte Codex-Modelle). Probe gegen `/models` schiebt sich bei Bedarf nach, sobald bekannt ist, ob der Endpoint existiert.
- **Settings-Schema (revidiert nach Codebase-Review):** Codebase-Konvention fuer Provider-Auth-State ist **flach** (siehe `githubCopilot*`- und `kilo*`-Felder im Settings-Typ). Verschachteltes Objekt waere Insel. Bleibe bei flach, Konsistenz schlaegt subjektive Eleganz:

  ```typescript
  // ChatGPT OAuth (EPIC-21, ADR-88, ADR-89)
  /** Access Token, encrypted via SafeStorageService. enc:v1:<base64> oder Plaintext-Fallback. */
  chatgptOAuthAccessToken: string;
  /** Refresh Token, encrypted. */
  chatgptOAuthRefreshToken: string;
  /** ID Token (JWT) zum Auslesen von accountId, email, planTier. Encrypted. */
  chatgptOAuthIdToken: string;
  /** Account-ID aus id_token Claim, fuer chatgpt-account-id-Header. Nicht encrypted. */
  chatgptOAuthAccountId: string;
  /** Email aus id_token Claim, fuer Settings-UI. Nicht encrypted. */
  chatgptOAuthEmail: string;
  /** Plan-Tier ('plus' | 'pro' | 'unknown'). Nicht encrypted. */
  chatgptOAuthPlanTier: 'plus' | 'pro' | 'unknown' | '';
  /** Unix-Timestamp ms, Refresh-Trigger. Nicht encrypted. */
  chatgptOAuthExpiresAt: number;
  /** Default-Modell, default 'gpt-5-codex'. */
  chatgptOAuthModel: string;
  /** Unix-ms, wann der Disclaimer bestaetigt wurde. 0 oder null wenn noch nicht. */
  chatgptOAuthDisclaimerAcknowledgedAt: number;
  ```

**Hinweis:** Dies ist ein Vorschlag. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive

- Klare Verantwortungstrennung analog zu Copilot, niedrige Einarbeitungs-Kosten fuer kuenftige Aenderungen.
- Schema-Drift bleibt auf eine Datei begrenzt.
- Token-Refresh-Logik isoliert und unit-testbar.
- Settings-Migration trivial (ein neues Top-Level-Feld).
- Wiederverwendung des OAuth-Service moeglich, falls Codex-Embedding-Endpoint dazu kommt.

### Negative

- Drei neue Dateien (Provider, Service, Mapper) plus Loopback-Server-Modul (ADR-89).
- Minimale Code-Duplizierung beim Tool-Akkumulator-Pattern mit `openai.ts`.
- Hardcode-Modell-Liste muss bei OpenAI-Aenderungen manuell gepflegt werden.

### Risks

- **Endpoint-Drift:** Codex-Schema kann sich aendern. Mitigation: Mapper isoliert, Datums-Kommentare, klare Fehlermeldung bei Schema-Abweichung.
- **OpenAI sperrt Drittanbieter-Nutzung:** Mitigation: Disclaimer im UI, Endpoint-Drift-Indikator, klare Empfehlung im Plugin-Doc auf BYOK-Fallback.
- **Modell-Liste veraltet:** Mitigation: Plugin-Update-Pfad, optional Probe-Request als Folge-Feature.

## Implementation Notes

**Dateistruktur:**

```
src/core/auth/
  ChatGptOAuthService.ts       # Singleton, Refresh-Lock, Generation-Counter
  PkceLoopbackServer.ts        # siehe ADR-89
  jwt-decode.ts                # Mini-Decoder fuer id_token-Claims
src/api/providers/
  chatgpt-oauth.ts             # implements ApiHandler
  chatgpt-codex-mapper.ts      # Request- und Response-Mapper, Type-Guards, Hardcode-Modelle
src/types/settings.ts
  + LLMProvider 'chatgpt-oauth'
  + ChatGptOAuthSettings im ObsidianAgentSettings
```

**Provider Factory Erweiterung (`src/api/index.ts`):**

```typescript
case 'chatgpt-oauth':
    return new ChatGptOAuthProvider(config, ChatGptOAuthService.instance());
```

**Tool-Definition-Konvertierung (`chatgpt-codex-mapper.ts`):**

```typescript
function toCodexTools(tools: ToolDefinition[]): CodexTool[] {
    return tools.map(t => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
    }));
}
```

**Schema-Annahmen-Kommentare:**

```typescript
// Schema as observed 2026-04-28 in Codex CLI 0.21.x
// Endpoint: POST https://chatgpt.com/backend-api/codex/responses
// Headers required: Authorization, chatgpt-account-id, OpenAI-Beta: responses=experimental
// Streaming: Server-Sent Events, event types observed:
//   - response.output_item.added
//   - response.output_text.delta
//   - response.function_call.delta
//   - response.completed
//   - response.failed
```

## Related Decisions

- ADR-11: Multi-Provider API Architecture, erweitert das Adapter-Pattern um einen weiteren `ApiHandler`.
- ADR-19: Electron SafeStorage, Token-Verschluesselung.
- ADR-37: Copilot Provider Architecture, Vorlage fuer das Auth-Service-Pattern.
- ADR-64: Node-fetch-Wrapper, etabliert Node-`https`-Modul als Streaming-Transport.
- ADR-89: PKCE Loopback OAuth Flow (entsteht parallel).

## References

- FEAT-00-21-001: ChatGPT OAuth Lifecycle.
- FEAT-00-21-002: Codex Responses-API Handler.
- FEAT-00-21-003: Settings-UI mit "Mit ChatGPT anmelden".
- Referenz-Implementierungen: opencode, codex-rs, sst-Codex-Integration.
