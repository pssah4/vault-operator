---
id: PLAN-09
title: ChatGPT OAuth Provider (EPIC-21)
date: 2026-04-28
feature-refs: [FEAT-00-21-001, FEAT-00-21-002, FEAT-00-21-003]
adr-refs: [ADR-88, ADR-89]
bug-refs: []
pair-id: sebastian-opus-4.7
---

# PLAN-09 -- ChatGPT OAuth Provider (EPIC-21)

## Kontext

EPIC-21 fuegt `chatgpt-oauth` als neuen LLM-Provider ein. ChatGPT-Plus/Pro-Subscriber loggen sich per Browser-PKCE-Flow ein und nutzen `gpt-5-codex` ueber `chatgpt.com/backend-api/codex/responses`. Das Pattern ist analog zu Copilot (EPIC-12), aber mit drei strukturellen Unterschieden:

1. **PKCE-OAuth statt Device-Code-Flow:** Lokaler Loopback-Server auf `127.0.0.1:1455-1460` empfaengt den Browser-Callback. ADR-89 begruendet, warum andere Optionen (IPC, Custom-URL-Scheme, Device-Code) ausfallen.
2. **Codex-Backend statt OpenAI-API:** Endpoint und API-Schema unterscheiden sich von `api.openai.com`. Wir bauen einen eigenen Mapper.
3. **Settings flach (Codebase-Konvention, mid-course-Korrektur 2026-04-28):** ADR-88 wollte verschachtelt, Codebase macht Copilot/Kilo flach. Konsistenz schlaegt subjektive Eleganz.

**Open Items**, die beim ersten echten Login-Test geklaert werden:

- JWT-Claim-Name fuer `chatgpt-account-id` (vermutet: `https://api.openai.com/auth.chatgpt_account_id` oder `chatgpt_account_id`).
- Plan-Tier-Claim-Name (`plan`, `subscription_plan`, `tier`).
- Codex-Event-Liste (vermutet aus opencode/codex-rs: `response.created`, `response.output_item.added`, `response.output_text.delta`, `response.completed`, `response.failed`).
- Modell-Liste (Hardcode `gpt-5-codex`, optional Probe-Endpoint).
- Port-Range-Akzeptanz in Codex-Client-ID-Konfiguration (Fallback Port 1455).

## Aenderungen

### Phase A -- FEAT-00-21-001 OAuth Lifecycle

**Neue Dateien:**

- `src/core/auth/jwt-decode.ts` (~30 LOC, Mini-JWT-Decoder, kein Signatur-Check, dekodiert Claims)
- `src/core/auth/PkceLoopbackServer.ts` (~150 LOC, Loopback-Server mit Port-Range, Single-Callback, Timeout, AbortController)
- `src/core/auth/ChatGptOAuthService.ts` (~350 LOC, Singleton analog zu `GitHubCopilotAuthService`, PKCE-Flow, Token-Refresh, persistTokens-Callback)

**Modifizierte Dateien:**

- `src/types/settings.ts:10` -- `ProviderType` um `'chatgpt-oauth'` erweitern
- `src/types/settings.ts:766` -- 9 neue flache Settings-Felder ergaenzen
- `src/types/settings.ts:1009` -- Defaults ergaenzen

### Phase B -- FEAT-00-21-002 Codex API Handler

**Neue Dateien:**

- `src/api/providers/chatgpt-oauth.ts` (~350 LOC, `ApiHandler`-Implementierung, OpenAI-SDK mit Custom-Fetch und Codex-Header, Tool-Call-Akkumulator analog zu Copilot)

**Modifizierte Dateien:**

- `src/api/index.ts:29` -- `'chatgpt-oauth'`-Case ergaenzen, neuer Provider importieren

### Phase C -- FEAT-00-21-003 Settings UI

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
| FEAT-00-21-001 | SC-01 (Login in <60s) | PkceLoopbackServer + ChatGptOAuthService.startAuthFlow + Browser-Open |
| FEAT-00-21-001 | SC-02 (30 Tage ohne Re-Login) | refreshAccessToken mit 60s-Buffer, persistTokens |
| FEAT-00-21-001 | SC-03 (Disconnect entfernt alles) | logout() clear State + Settings-Felder |
| FEAT-00-21-001 | SC-04 (Verschluesselt) | safeStorage.encrypt/decrypt analog zu Copilot |
| FEAT-00-21-001 | SC-05 (Klare Fehlermeldung) | enhanceError() mit Codex-spezifischen Statuscodes |
| FEAT-00-21-001 | SC-06 (Stille Refresh) | Promise-Lock im Service |
| FEAT-00-21-001 | SC-07 (Server schliesst nach Callback) | PkceLoopbackServer.close() im Callback-Handler |
| FEAT-00-21-002 | SC-01 (Streaming) | OpenAI-SDK mit Custom-Fetch, stream:true |
| FEAT-00-21-002 | SC-02 (Tool-Calls) | Tool-Call-Akkumulator analog Copilot, flushToolCallAccumulators |
| FEAT-00-21-002 | SC-03 (Modell-Wechsel) | config.model aus Settings, KNOWN_MODELS-Map |
| FEAT-00-21-002 | SC-04 (Fehler-Klassifikation) | enhanceError mit Quota/Auth/Drift-Branches |
| FEAT-00-21-002 | SC-05 (Antwortqualitaet) | Deferred (manueller Vergleichstest, nicht automatisierbar) |
| FEAT-00-21-002 | SC-06 (Drift-Resilienz) | Type-Guards im Mapper, default-Branch mit console.warn |
| FEAT-00-21-003 | SC-01 (Login-Button auffindbar) | buildChatGptOAuthSection ueber Provider-Filter |
| FEAT-00-21-003 | SC-02 (Email + Plan sichtbar) | getAccountInfo() liest aus id_token-Claims |
| FEAT-00-21-003 | SC-03 (Disclaimer) | confirmModal beim ersten Login, persist disclaimerAcknowledgedAt |
| FEAT-00-21-003 | SC-04 (Disconnect-Confirm) | confirmModal beim Logout-Klick |
| FEAT-00-21-003 | SC-05 (Modell-Auswahl) | Dropdown aus KNOWN_MODELS |
| FEAT-00-21-003 | SC-06 (Login-Fehler-Meldung) | Fehler im Modal anzeigen |
| FEAT-00-21-003 | SC-07 (Mobile-Hinweis) | safeStorage.isAvailable()-Check, Provider deaktiviert |

ADR-88 -> Tasks Phase A + B + C decken Service-Architektur, Mapper, Settings, Provider, UI ab.
ADR-89 -> Tasks Phase A: PkceLoopbackServer.

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
| 2026-04-28 | requirement | SafeStorage-Schema flach statt Envelope (Codebase-Pattern, ADR-88 Implementation Notes ergaenzt) |
| 2026-04-28 | design | Service speichert plain in Settings, encryptSettingsForSave/decryptSettings in main.ts erweitern. ChatGptOAuthService.saveToSettings ohne eigene safeStorage.encrypt-Schicht (Konsistenz zu Kilo/Copilot) |
| 2026-04-28 | bug (mid-course) | Erste Login-Versuch User scheitert. Verifiziert gegen codex-rs/login/src/server.rs (WebSearch + WebFetch): drei Annahmen waren falsch. (a) redirect_uri muss `http://localhost:PORT/auth/callback` sein, nicht `http://127.0.0.1:PORT`. (b) Scope muss `api.connectors.read api.connectors.invoke` zusaetzlich enthalten. (c) Authorize-URL braucht `id_token_add_organizations=true` und `codex_cli_simplified_flow=true`. Plus: Default-Modell `gpt-5.5` statt `gpt-5-codex` (Hermes-Hinweis vom User). Korrigiert in `ChatGptOAuthService.startAuthFlow` und `buildAuthorizeUrl` plus Modell-Liste. Rebuild + Redeploy 2026-04-28. |
| 2026-04-28 | bug (mid-course) | Login klappte, Microsoft-SSO scheiterte aber im Obsidian-Webview. Fix: `electron.shell.openExternal()` statt `window.open()` in `ModelConfigModal.startChatGptOAuth`. |
| 2026-04-29 | bug (mid-course) | API-Call lief in `Connection error (undefined)`. Ursache: Electron-Renderer blockt CORS gegen chatgpt.com. Fix: createNodeFetch aus openai.ts exportiert, Provider nutzt Node-`https` statt globalThis.fetch. |
| 2026-04-29 | bug (mid-course) | Backend antwortete mit "kein Plus-Abo" obwohl Abo aktiv. Ursache: Codex-Backend whitelisted Originator-Header. Fix: `Originator: codex_cli_rs`, `User-Agent: codex_cli_rs/0.21.0 ...`, Account-ID auch in PascalCase (`ChatGPT-Account-ID`). Verifiziert gegen pi-mono#1828. |
| 2026-04-29 | bug (mid-course) | Verbindung kam, aber Anfrage ohne Erfolg. Ursache: OpenAI-SDK postet an `/chat/completions`, Codex-Backend hat aber nur `/responses`. Provider komplett umgebaut: kein SDK mehr, direkter `https.request` an `chatgpt.com/backend-api/codex/responses`, Body im Responses-API-Format (`instructions` + `input` mit `type:'message'`-Items, `function_call`/`function_call_output`-Items), eigener SSE-Parser fuer `response.output_text.delta`, `response.output_item.added/done`, `response.function_call_arguments.delta`, `response.completed`, `response.failed`. **User-Bestaetigung 2026-04-29: es geht.** |

## Implementation Notes

**Status 2026-04-28:** Code geschrieben, gebaut, ins Vault deployed. Der manuelle Login-Test mit echtem ChatGPT-Plus-Account ist nicht durch den Skill ausgefuehrt worden, weil Browser-Interaktion ausserhalb der Reichweite ist. Der Test gehoert dem Nutzer.

**Geschriebene Dateien:**

- `src/core/auth/jwt-decode.ts` (neu, 53 LOC)
- `src/core/auth/PkceLoopbackServer.ts` (neu, 192 LOC)
- `src/core/auth/ChatGptOAuthService.ts` (neu, 357 LOC)
- `src/api/providers/chatgpt-oauth.ts` (neu, 327 LOC)
- `src/api/index.ts` (Provider-Switch erweitert)
- `src/types/settings.ts` (`ProviderType` erweitert um `'chatgpt-oauth'`, 9 neue Settings-Felder, Defaults)
- `src/ui/settings/constants.ts` (`BRAND_LABELS`, `PROVIDER_COLORS`, `MODEL_SUGGESTIONS` erweitert)
- `src/ui/settings/ModelConfigModal.ts` (`buildChatGptOAuthSection`, `updateChatGptOAuthStatus`, `startChatGptOAuth`, Provider-Liste, Visibility-Logic)
- `src/i18n/locales/en.ts` (12 neue `chatgpt.*`-Strings)
- `src/main.ts` (Service-Init, `decryptSettings` und `encryptSettingsForSave` erweitert)

**Verifikation bisher:**

- `npx tsc --noEmit`: clean (kein TypeScript-Error)
- `npm run build`: clean (esbuild production-build erfolgreich, Plugin-Bundle in NexusOS-Vault deployt)

**Verifikation offen:**

- Manueller Login mit echtem ChatGPT-Plus-Account (Sebastian).
- Smoke-Test einer einfachen Anfrage gegen `gpt-5-codex`.
- Smoke-Test mit Tool-Call.
- Disconnect-Test.

**Open Items, die nur ueber den Login-Test klaerbar sind:**

- **JWT-Claim-Name fuer `chatgpt-account-id`:** Code probiert in dieser Reihenfolge: `https://api.openai.com/auth.chatgpt_account_id`, `chatgpt_account_id`, `account_id`. Falls keiner trifft, ist `accountId` leer und der `chatgpt-account-id`-Header fehlt -> Backend-Fehler erwartet. Mitigation: in `jwt-decode.ts` weitere Claim-Namen ergaenzen.
- **Plan-Tier-Claim:** Code probiert `https://api.openai.com/auth.chatgpt_plan_type`, `chatgpt_plan_type`, `plan`, `subscription_plan`. Falls keiner trifft, zeigt UI "ChatGPT" generisch.
- **Codex-Endpoint-Schema:** Provider sendet OpenAI-Chat-Completions-Format. Falls Codex-Backend stattdessen Responses-API verlangt, gibt es 4xx-Fehler. Mitigation: enhanceError() liefert Statuscode-Klassifikation.
- **Codex-Client-ID-Wert:** `app_EMoamEEZ73f0CkXaXp7hrann` ist die in opencode/codex-rs verwendete Konstante. Falls falsch, scheitert der Authorize-Schritt.
- **Port-Range Akzeptanz:** Code probiert 1455 bis 1460. `auth.openai.com` muss alle als Redirect-URIs akzeptieren. Falls nur 1455 akzeptiert wird und der Port belegt ist, schlaegt der Login fehl mit klarer Meldung.

**Mid-course-Korrekturen waehrend des Codings:**

1. **SafeStorage-Schema:** ADR-88 hatte `SafeStorageEnvelope`. Real ist es `enc:v1:<base64>`-Strings. ADR plus plan-context updated.
2. **Settings-Schema flach statt verschachtelt:** ADR-88 hatte `chatgptOAuth: { ... }`. Codebase-Konvention (Copilot, Kilo) ist flach. ADR plus plan-context updated.
3. **Settings-Encryption ueber main.ts statt im Service:** Service speicherte intern verschluesselt, das war inkonsistent zu Kilo/Copilot. Service speichert jetzt plain, `decryptSettings`/`encryptSettingsForSave` in main.ts erledigen die Verschluesselung.

**Backlog-Verschiebungen:** keine. Drei Features bleiben in EPIC-21 wie geplant.
