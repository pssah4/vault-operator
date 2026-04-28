# Architect Handoff: ChatGPT OAuth Provider

> **Epic**: EPIC-021
> **Quelle**: User-Request 2026-04-28 (analog zu EPIC-012, EPIC-013)
> **Features**: FEATURE-021-001 bis FEATURE-021-003
> **Erstellt**: 2026-04-28

---

## 1. Aggregierte ASRs

### Critical

| ASR | Feature | Quality Attribute | Beschreibung |
|-----|---------|-------------------|--------------|
| Eigener `ChatGptOAuthService` als Singleton | FEATURE-021-001 | Reliability, Concurrency | Token-State plugin-weit konsistent. Refresh-Lock per Promise, Generation-Counter gegen Race-Conditions bei Disconnect. Refresh 60 Sekunden vor Ablauf. |
| Loopback-HTTP-Server in Electron | FEATURE-021-001 | Security, Compliance | PKCE-Callback braucht `http`-Server auf 127.0.0.1, Port-Range 1455 bis 1460. Bind ausschliesslich an Loopback-Adresse, eslint-disable mit Begruendung fuer Community-Plugin-Review. |
| Schema-Mapping Codex-Responses zu ApiStream | FEATURE-021-002 | Maintainability, Performance | Codex-Backend nutzt das Responses-API-Schema (`response.output_item.added`, `.delta`, `response.completed`). Mapping-Schicht muss strikt getrennt sein, sodass Schema-Drift sich auf eine Datei begrenzt. |
| Tool-Definitions im Responses-Format | FEATURE-021-002 | Correctness | `ToolDefinition`-Konvertierung von Chat-Completions-Format (`{type, function: {...}}`) zu Responses-Format (`{type, name, description, parameters}`). Helper, der von allen Codex-Aufrufen genutzt wird. |
| SafeStorageService-Integration | FEATURE-021-001 | Security | `access_token`, `refresh_token`, `id_token` ueber SafeStorageService. Niemals Klartext in `data.json`, niemals Tokens in Logs. |

### Moderate

| ASR | Feature | Quality Attribute | Beschreibung |
|-----|---------|-------------------|--------------|
| Token-Persistenz-Schema | FEATURE-021-001 | Maintainability, Security | Settings-Erweiterung um `chatgptOAuth: { accountId, tokens, expiresAt, planTier, disclaimerAcknowledgedAt }`. SafeStorage-Envelope fuer Token-Felder. |
| ID-Token-Decoding | FEATURE-021-001 | Maintainability, Security | JWT-Decoder fuer `id_token` zur Extraktion von `chatgpt-account-id`, Email, Plan-Tier. Eigener 30-Zeilen-Decoder oder existierende Lib (`jose`). |
| Endpoint-Drift-Resilienz | FEATURE-021-002 | Reliability | Schema-Validation-Layer (Type-Guards oder `zod`) zwischen HTTP und Mapping. Klarer Abbruch bei unerwartetem Schema statt stiller Fehlinterpretation. |
| Modell-Listing-Strategie | FEATURE-021-002 | Usability, Maintainability | Codex-Backend liefert keine offene Models-Liste. Hardcode (`gpt-5-codex`, weitere) oder Probe-Request. |
| Settings-UI-Erweiterung | FEATURE-021-003 | Maintainability | Neuer Provider-Block analog zum Copilot-Block. Disclaimer-Persistenz im Settings-Schema. |
| Provider-Type-Erweiterung | FEATURE-021-003 | Type Safety | `LLMProvider`-Union um `'chatgpt-oauth'` erweitern. Beeinflusst alle exhaustive Switch-Statements. |

---

## 2. Aggregierte NFRs

### Performance

| NFR | Wert | Feature |
|-----|------|---------|
| Token-Refresh-Latenz | <500ms | FEATURE-021-001 |
| Loopback-Server-Startup | <200ms | FEATURE-021-001 |
| Time-to-First-Token | <2s in 95% der Faelle | FEATURE-021-002 |
| Streaming-Chunk-Verarbeitung | <50ms pro Chunk | FEATURE-021-002 |
| Modal-Render | <300ms | FEATURE-021-003 |

### Security

| NFR | Beschreibung | Feature |
|-----|--------------|---------|
| Token-Storage | Alle Tokens (access, refresh, id) ueber SafeStorageService | FEATURE-021-001 |
| PKCE-Verifier | 64 Byte aus `crypto.randomBytes`, SHA-256-Challenge, Verifier nur im RAM | FEATURE-021-001 |
| State-Parameter | 32 Byte Zufall, vor Token-Tausch verifiziert | FEATURE-021-001 |
| Loopback-Bind | Ausschliesslich 127.0.0.1, Port-Range 1455 bis 1460 | FEATURE-021-001 |
| Token-Scope | `openid profile email offline_access` (Codex-Standard) | FEATURE-021-001 |
| No-Plaintext-Logging | Tokens nie in `console.*`, nie in Audit-Logs | FEATURE-021-001, 002 |
| Per-Request-Auth | Token pro Request vom OAuth-Service holen, kein Caching im Handler | FEATURE-021-002 |
| Disclaimer-Pflicht | Erstmaliger Login verlangt Disclaimer-Bestaetigung mit Persistenz | FEATURE-021-003 |

### Reliability

| NFR | Beschreibung | Feature |
|-----|--------------|---------|
| Refresh-Buffer | Refresh 60 Sekunden vor `expires_at` | FEATURE-021-001 |
| 401-Auto-Retry | Genau einmal Refresh, dann Error | FEATURE-021-001, 002 |
| Refresh-Lock | Promise-Lock fuer parallele Refresh-Calls | FEATURE-021-001 |
| Loopback-Timeout | 5 Minuten ohne Callback -> Abbruch | FEATURE-021-001 |
| Endpoint-Drift-Detection | Schema-Validation, klarer Fehler bei Abweichung | FEATURE-021-002 |
| Streaming-Interrupt | Sauberer Abbruch bei Netzwerkabbruch | FEATURE-021-002 |

### Compatibility

| NFR | Beschreibung | Feature |
|-----|--------------|---------|
| Codex-Header-Set | `Authorization`, `chatgpt-account-id`, `OpenAI-Beta: responses=experimental`, `User-Agent` | FEATURE-021-002 |
| Schema-Versioning | Beobachtetes Schema mit Datum kommentieren | FEATURE-021-002 |
| Mobile-Fallback | UI deaktiviert mit Hinweis, wenn `safeStorage` fehlt | FEATURE-021-001, 003 |

### Compliance (Review-Bot)

| NFR | Beschreibung |
|-----|--------------|
| Kein `fetch()` | `requestUrl` aus obsidian fuer alle Requests gegen `auth.openai.com` und `chatgpt.com` |
| `require('http')` mit Begruendung | Loopback-Server braucht Node-Modul, eslint-disable mit klarer `-- reason`-Begruendung |
| Kein `innerHTML` | Obsidian-DOM-API (`createEl`, `createDiv`, `appendText`) |
| Keine `any`-Types | `unknown` plus Type-Guards fuer JWT-Claims und Codex-Responses |
| Keine floating Promises | `void`-Prefix oder `.catch()` |
| Keine inline-Styles | CSS-Klassen aus `agent-u-*` |
| Keine Emojis im UI | Convention `feedback_ui_no_emojis` |

---

## 3. Constraints

| Constraint | Beschreibung | Impact |
|-----------|--------------|--------|
| Inoffizielle Endpoints | `chatgpt.com/backend-api/codex/responses` ist nicht oeffentlich dokumentiert. Kein SLA, Schema kann sich aendern. | Disclaimer im UI, Drift-Resilienz im Code, klare Fehlermeldungen |
| Codex-Client-ID | Default ist Codex-CLI-Client-ID. OpenAI koennte sperren. | Endpoint-Drift-Indikator beobachten, Fallback-Empfehlung in Doku |
| `requestUrl`-Streaming-Limit | `requestUrl` liefert `ArrayBuffer`, kein `ReadableStream`. SSE-Streaming nicht nativ. | Architektur-Entscheidung: Node-`https` mit eslint-Begruendung (wie `openai.ts:75`) oder `requestUrl` mit Buffer-Polling |
| Token-Hierarchie einstufig | Im Gegensatz zu Copilot (Access Token plus Copilot Token) gibt es hier nur einen `access_token` plus `refresh_token`. | Einfacheres Lifecycle als Copilot, aber Refresh-Flow muss sauber sein |
| Kein OpenAI-SDK | SDK adressiert `api.openai.com`. Wir bauen Codex-Calls manuell. | Eigener Stream-Parser noetig |
| Mobile-Inkompatibilitaet | `safeStorage` und Loopback-Server fehlen auf iOS/Android. | Provider auf Desktop beschraenken, UI-Hinweis |
| Plugin-Review-Risiko | Loopback-HTTP-Server koennte Review-Bot-Aufmerksamkeit auf sich ziehen. | PR-Begruendung vorbereiten, Praezedenzfall pruefen (z.B. Obsidian-Git-Plugin?) |

---

## 4. Open Questions (priorisiert)

### Hoch (architektur-bestimmend)

1. **Streaming-Transport**: `requestUrl` mit Polling oder Node-`https`-Modul (wie `openai.ts:75` mit Begruendung)?
   - Option A: `requestUrl` mit vollstaendigem Body, dann parsen (kein echtes Streaming, hoehere TTFT)
   - Option B: Node-`https`-Modul mit `IncomingMessage`-Stream (echtes Streaming, eslint-disable noetig)
   - **Empfehlung RE**: Option B, weil das Pattern bereits etabliert ist und TTFT kritisch ist.

2. **Loopback-Server**: Renderer-Prozess oder Main-Prozess via IPC?
   - Option A: Renderer mit `require('http')` (einfacher, eslint-disable)
   - Option B: Main-Prozess via IPC (sauberer, aber Plugin-API-Erweiterung noetig)
   - **Empfehlung RE**: Option A, sofern Review-Bot das durchwinkt. Sonst Option B.

3. **Service-Verortung**: `src/core/auth/ChatGptOAuthService.ts` oder bei `src/core/security/`?
   - Option A: Neue `auth/`-Unterordner-Konvention starten
   - Option B: Zu `security/` einsortieren (wo `SafeStorageService` lebt)
   - **Empfehlung RE**: Option A, weil OAuth-Lifecycle eigene Domaene ist.

### Mittel (design-relevant)

4. **Settings-Struktur**: Flach oder verschachtelt?
   - Flach: `chatgptOAuthAccessToken`, `chatgptOAuthRefreshToken`, ...
   - Verschachtelt: `chatgptOAuth: { tokens: SafeStorageEnvelope, accountId, expiresAt, planTier, disclaimerAcknowledgedAt }`
   - **Empfehlung RE**: Verschachtelt, sauberer in der Settings-Migration.

5. **JWT-Decoding**: Eigener Mini-Decoder oder Lib `jose`?
   - Eigen: 30 Zeilen, keine Abhaengigkeit, kein Signatur-Check (vertrauen wir, weil Token aus Token-Endpoint)
   - `jose`: Industrial-Strength, aber Bundle-Groesse
   - **Empfehlung RE**: Eigener Decoder (kein Signatur-Check noetig, nur Claims auslesen).

6. **Modell-Discovery**: Hardcode-Liste oder Probe-Request?
   - Hardcode: `gpt-5-codex`, weitere bekannte Codex-Modelle
   - Probe: erste Anfrage gegen `/models`-Endpoint (existiert evtl. nicht)
   - **Empfehlung RE**: Hardcode mit klar dokumentiertem Update-Pfad. Bei Probe-Erfolg spaeter ergaenzen.

7. **Schema-Validation**: Type-Guards oder `zod`?
   - Type-Guards: keine neue Dependency, aber mehr Wartungsaufwand
   - `zod`: bessere Fehlermeldungen, aber Bundle-Groesse
   - **Empfehlung RE**: `zod` falls bereits im Projekt, sonst Type-Guards.

### Niedrig (implementierungs-detail)

8. **Loopback-Port**: Hartkodiert auf 1455 oder Range 1455 bis 1460?
9. **Provider-Farbe im Settings-UI**: ChatGPT-Gruen oder neutraler Ton?

---

## 5. Feature-Abhaengigkeiten

```
FEATURE-021-001 (OAuth Lifecycle)
        |
        +---> FEATURE-021-002 (Codex API Handler)
        |               |
        |               +---> FEATURE-021-003 (Settings UI)
```

**Implementierungs-Reihenfolge:**

1. FEATURE-021-001 (OAuth Service) als Fundament
2. FEATURE-021-002 (Codex Handler) als Kern
3. FEATURE-021-003 (Settings UI) zum Aktivieren

---

## 6. Betroffene Dateien (Blast-Radius)

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `src/types/settings.ts` | `LLMProvider`-Union erweitern, `chatgptOAuth`-Settings-Feld | Mittel (beeinflusst alle Switch-Statements) |
| `src/api/index.ts` | `buildApiHandler`-Switch erweitern | Niedrig |
| `src/api/providers/chatgpt-oauth.ts` | Neuer Handler | Niedrig (neue Datei) |
| `src/core/auth/ChatGptOAuthService.ts` | Neuer OAuth-Service | Niedrig (neue Datei) |
| `src/core/auth/PkceLoopbackServer.ts` | Loopback-Server-Hilfsmodul | Niedrig (neue Datei) |
| `src/ui/settings/ModelConfigModal.ts` | Provider-Block fuer ChatGPT OAuth | Mittel |
| `src/ui/settings/ChatGptOAuthBlock.ts` | Neuer Block-Renderer | Niedrig (neue Datei) |
| `src/ui/settings/constants.ts` | `PROVIDER_LABELS`, `PROVIDER_COLORS` | Niedrig |
| `src/i18n/locales/*.ts` | Neue Strings (DE, EN) | Niedrig |
| `package.json` | Optional: `zod` falls noch nicht vorhanden | Niedrig |
| `_devprocess/architecture/` | Neuer ADR-076 (oder Folge-Nummer) zur OAuth-Architektur | - |

---

## 7. Forbidden-Terms-Check (Success Criteria)

Alle Success Criteria der drei Features wurden geprueft. Keine OAuth-, JWT-, REST-, HTTP-, JSON-, OpenAI-, Codex-, ChatGPT-Begriffe in den `Success Criteria`-Tabellen. Technische Details ausschliesslich im Bereich `Technical NFRs` und `Architecture Considerations`.

Stichprobe:

- FEATURE-021-001 SC-04 sagt "Anmeldedaten werden sicher abgelegt" statt "Tokens werden via SafeStorage verschluesselt".
- FEATURE-021-002 SC-01 sagt "Antworten erscheinen wort- bzw. tokenweise" statt "SSE-Streaming mit Tool-Calls".
- FEATURE-021-003 SC-02 sagt "Account-Email und Plan-Tier" - "Plan-Tier" ist ein domain-fachlicher Begriff aus dem Subscription-Modell, kein Tech-Begriff.

---

## 8. Naechste Schritte

Die Requirements sind bereit. Naechster Schritt im V-Model: `/architecture` fuer ADR-Vorschlaege und `plan-context-021.md`.

Empfohlener ADR-Scope:

- **ADR-076**: ChatGPT OAuth Provider Architecture (Service-Verortung, Loopback-Strategy, Streaming-Transport).
- **arc42-Update**: Section 5 (Bausteinsicht) um `ChatGptOAuthService` ergaenzen, Section 8 (Querschnittliche Konzepte) Authentifizierung.

## Dialog

| Datum | Rolle | Beitrag |
|-------|-------|---------|
| | | |
