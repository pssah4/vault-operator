---
id: PLAN-009
title: ChatGPT OAuth Provider (EPIC-021)
status: Active
date: 2026-04-28
feature-refs: [FEATURE-021-001, FEATURE-021-002, FEATURE-021-003]
adr-refs: [ADR-088, ADR-089]
bug-refs: []
pair-id: sebastian-opus-4.7
---

# PLAN-009 -- ChatGPT OAuth Provider (EPIC-021)

## Kontext

EPIC-021 fuegt `chatgpt-oauth` als neuen LLM-Provider ein. ChatGPT-Plus/Pro-Subscriber loggen sich per Browser-PKCE-Flow ein und nutzen `gpt-5-codex` ueber `chatgpt.com/backend-api/codex/responses`. Das Pattern ist analog zu Copilot (EPIC-012), aber mit drei strukturellen Unterschieden:

1. **PKCE-OAuth statt Device-Code-Flow:** Lokaler Loopback-Server auf `127.0.0.1:1455-1460` empfaengt den Browser-Callback. ADR-089 begruendet, warum andere Optionen (IPC, Custom-URL-Scheme, Device-Code) ausfallen.
2. **Codex-Backend statt OpenAI-API:** Endpoint und API-Schema unterscheiden sich von `api.openai.com`. Wir bauen einen eigenen Mapper.
3. **Settings flach (Codebase-Konvention, mid-course-Korrektur 2026-04-28):** ADR-088 wollte verschachtelt, Codebase macht Copilot/Kilo flach. Konsistenz schlaegt subjektive Eleganz.

**Open Items**, die beim ersten echten Login-Test geklaert werden:

- JWT-Claim-Name fuer `chatgpt-account-id` (vermutet: `https://api.openai.com/auth.chatgpt_account_id` oder `chatgpt_account_id`).
- Plan-Tier-Claim-Name (`plan`, `subscription_plan`, `tier`).
- Codex-Event-Liste (vermutet aus opencode/codex-rs: `response.created`, `response.output_item.added`, `response.output_text.delta`, `response.completed`, `response.failed`).
- Modell-Liste (Hardcode `gpt-5-codex`, optional Probe-Endpoint).
- Port-Range-Akzeptanz in Codex-Client-ID-Konfiguration (Fallback Port 1455).

## Aenderungen

### Phase A -- FEATURE-021-001 OAuth Lifecycle

**Neue Dateien:**

- `src/core/auth/jwt-decode.ts` (~30 LOC, Mini-JWT-Decoder, kein Signatur-Check, dekodiert Claims)
- `src/core/auth/PkceLoopbackServer.ts` (~150 LOC, Loopback-Server mit Port-Range, Single-Callback, Timeout, AbortController)
- `src/core/auth/ChatGptOAuthService.ts` (~350 LOC, Singleton analog zu `GitHubCopilotAuthService`, PKCE-Flow, Token-Refresh, persistTokens-Callback)

**Modifizierte Dateien:**

- `src/types/settings.ts:10` -- `ProviderType` um `'chatgpt-oauth'` erweitern
- `src/types/settings.ts:766` -- 9 neue flache Settings-Felder ergaenzen
- `src/types/settings.ts:1009` -- Defaults ergaenzen

### Phase B -- FEATURE-021-002 Codex API Handler

**Neue Dateien:**

- `src/api/providers/chatgpt-oauth.ts` (~350 LOC, `ApiHandler`-Implementierung, OpenAI-SDK mit Custom-Fetch und Codex-Header, Tool-Call-Akkumulator analog zu Copilot)

**Modifizierte Dateien:**

- `src/api/index.ts:29` -- `'chatgpt-oauth'`-Case ergaenzen, neuer Provider importieren

### Phase C -- FEATURE-021-003 Settings UI

**Modifizierte Dateien:**

- `src/ui/settings/constants.ts` -- `BRAND_LABELS`, `PROVIDER_COLORS`, `MODEL_SUGGESTIONS` um `'chatgpt-oauth'` erweitern
- `src/ui/settings/ModelConfigModal.ts` -- `buildChatGptOAuthSection()` analog zu `buildCopilotAuthSection()`, `updateFieldVisibility()` Case
- `src/i18n/locales/en.ts` und `de.ts` -- `chatgpt.*`-Strings (flache Keys, gleiche Konvention wie `copilot.*`)
- `src/main.ts` -- `ChatGptOAuthService.getInstance().loadFromSettings(settings)` und `setSaveCallback` analog zu Copilot

### Phase D -- Login-Test (manuell)

- Build + Deploy
- In Obsidian: Settings -> Provider auf "ChatGPT (OAuth)" -> Login-Button
- Browser-Flow durchlaufen
- Open Items empirisch klaeren und in Code als Datums-Kommentar dokumentieren

## Coverage Gate

| FEATURE | SC | Task |
|---------|-----|------|
| FEATURE-021-001 | SC-01 (Login in <60s) | PkceLoopbackServer + ChatGptOAuthService.startAuthFlow + Browser-Open |
| FEATURE-021-001 | SC-02 (30 Tage ohne Re-Login) | refreshAccessToken mit 60s-Buffer, persistTokens |
| FEATURE-021-001 | SC-03 (Disconnect entfernt alles) | logout() clear State + Settings-Felder |
| FEATURE-021-001 | SC-04 (Verschluesselt) | safeStorage.encrypt/decrypt analog zu Copilot |
| FEATURE-021-001 | SC-05 (Klare Fehlermeldung) | enhanceError() mit Codex-spezifischen Statuscodes |
| FEATURE-021-001 | SC-06 (Stille Refresh) | Promise-Lock im Service |
| FEATURE-021-001 | SC-07 (Server schliesst nach Callback) | PkceLoopbackServer.close() im Callback-Handler |
| FEATURE-021-002 | SC-01 (Streaming) | OpenAI-SDK mit Custom-Fetch, stream:true |
| FEATURE-021-002 | SC-02 (Tool-Calls) | Tool-Call-Akkumulator analog Copilot, flushToolCallAccumulators |
| FEATURE-021-002 | SC-03 (Modell-Wechsel) | config.model aus Settings, KNOWN_MODELS-Map |
| FEATURE-021-002 | SC-04 (Fehler-Klassifikation) | enhanceError mit Quota/Auth/Drift-Branches |
| FEATURE-021-002 | SC-05 (Antwortqualitaet) | Deferred (manueller Vergleichstest, nicht automatisierbar) |
| FEATURE-021-002 | SC-06 (Drift-Resilienz) | Type-Guards im Mapper, default-Branch mit console.warn |
| FEATURE-021-003 | SC-01 (Login-Button auffindbar) | buildChatGptOAuthSection ueber Provider-Filter |
| FEATURE-021-003 | SC-02 (Email + Plan sichtbar) | getAccountInfo() liest aus id_token-Claims |
| FEATURE-021-003 | SC-03 (Disclaimer) | confirmModal beim ersten Login, persist disclaimerAcknowledgedAt |
| FEATURE-021-003 | SC-04 (Disconnect-Confirm) | confirmModal beim Logout-Klick |
| FEATURE-021-003 | SC-05 (Modell-Auswahl) | Dropdown aus KNOWN_MODELS |
| FEATURE-021-003 | SC-06 (Login-Fehler-Meldung) | Fehler im Modal anzeigen |
| FEATURE-021-003 | SC-07 (Mobile-Hinweis) | safeStorage.isAvailable()-Check, Provider deaktiviert |

ADR-088 -> Tasks Phase A + B + C decken Service-Architektur, Mapper, Settings, Provider, UI ab.
ADR-089 -> Tasks Phase A: PkceLoopbackServer.

**Verifikation:**

1. `npm run build` (Build erfolgreich, kein TypeScript-Error)
2. Manueller Login-Test mit echtem ChatGPT-Plus-Account (Sebastian)
3. Smoke-Test: einfache Anfrage `Hallo, wer bist du?` an `gpt-5-codex` ueber neuen Provider
4. Smoke-Test mit Tool-Call: `read_file` einer Vault-Notiz
5. Disconnect-Test: Tokens entfernt, neuer Login startet bei Null

## Change Log

| Datum | Trigger | Notiz |
|-------|---------|-------|
| 2026-04-28 | initial | Plan erstellt aus Critical Review |
| 2026-04-28 | requirement | SafeStorage-Schema flach statt Envelope (Codebase-Pattern, ADR-088 Implementation Notes ergaenzt) |

## Implementation Notes

(Wird beim Final-Sync ausgefuellt mit Commit-SHAs, Abweichungen, Cycle-Time.)
