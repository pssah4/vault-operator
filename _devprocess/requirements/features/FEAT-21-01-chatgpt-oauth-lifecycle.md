---
id: FEAT-00-21-001
name: ChatGPT OAuth Lifecycle
epic: EPIC-21
depends-on: [FEAT-04-03]
---

# Feature: ChatGPT OAuth Lifecycle (PKCE, Loopback, Refresh)

> **Feature ID**: FEAT-00-21-001
> **Epic**: EPIC-21 ChatGPT OAuth Provider
> **Prioritaet**: P0-Critical
> **Aufwand**: M

## Feature Description

PKCE-OAuth-Flow gegen `auth.openai.com` mit lokalem Loopback-Callback-Server, Token-Persistenz ueber SafeStorageService und automatischem Refresh. Das Feature kapselt die komplette Token-Lebensdauer in einem dedizierten Service, sodass die spaeteren API-Calls (FEAT-00-21-002) nur noch ein gueltiges `access_token` plus `chatgpt-account-id` aus dem Service ziehen muessen, ohne sich um Auth-State-Maschinen oder Token-Erneuerung zu kuemmern.

Der Flow folgt dem Muster, das Codex-CLI und opencode nutzen: Browser-Redirect nach `auth.openai.com/oauth/authorize`, Callback an `http://127.0.0.1:1455/auth/callback`, Code-Tausch gegen Tokens, Decoding des `id_token` zur Extraktion der `chatgpt-account-id`.

## Benefits Hypothesis

**Wir glauben, dass** ein einmaliger Browser-Login mit unsichtbarer Token-Erneuerung
**folgende messbare Outcomes liefert:**

- ChatGPT-Plus/Pro-Nutzer aktivieren das Plugin ohne API-Key-Beschaffung.
- Tokens werden vor Ablauf automatisch erneuert, ohne Chat-Unterbrechung.

**Wir wissen, dass wir erfolgreich sind, wenn:**

- Mehr als 90 Prozent der gestarteten Logins schliessen erfolgreich ab.
- Mehr als 99 Prozent der Token-Refreshs gehen ohne sichtbare Latenz im Chat durch.

## Jobs to be Done

| Job-Typ | Job | User Story |
|---------|-----|-----------|
| Funktional | Bezahlte ChatGPT-Subscription auch in Obsidian nutzen | Story 1 |
| Emotional | Sicherheit, dass Login-Daten nicht im Klartext herumliegen | Story 2 |
| Sozial | Wie ein Power-User auftreten, der seine bezahlten Accounts ueberall einsetzt | Story 3 |

## User Stories

### Story 1: ChatGPT-Login starten (Funktional)

**Als** Obsidian-Nutzer mit ChatGPT-Plus-Abo
**moechte ich** mit einem Klick einen Browser-Login starten und nach Bestaetigung verbunden sein,
**damit ich** meine Subscription als LLM-Backend in Obsilo verwenden kann.

### Story 2: Sichere Token-Speicherung (Emotional)

**Als** sicherheitsbewusster Nutzer
**moechte ich**, dass meine ChatGPT-Tokens auf meinem Geraet verschluesselt liegen,
**damit ich** das Plugin auch auf einem Arbeitsgeraet einsetzen kann, ohne mir Sorgen um Klartext-Credentials zu machen.

### Story 3: Verbindung trennen (Funktional)

**Als** Nutzer, der das Geraet wechselt oder Zugang widerrufen will,
**moechte ich** die ChatGPT-Verbindung per Knopfdruck trennen,
**damit alle** auf dem Geraet liegenden Tokens vollstaendig entfernt sind.

### Story 4: Stille Token-Erneuerung (Funktional)

**Als** verbundener Nutzer
**moechte ich**, dass meine Sitzung im Hintergrund erneuert wird,
**damit ich** nicht waehrend einer laufenden Konversation neu einloggen muss.

### Story 5: Verstaendliche Fehlermeldung (Funktional)

**Als** Nutzer, dessen Token abgelaufen oder ungueltig ist,
**moechte ich** eine klare Meldung mit Handlungsanweisung sehen,
**damit ich** weiss, ob ich neu einloggen, mein Abo pruefen oder das Plugin updaten muss.

## Success Criteria (Tech-Agnostic)

| ID | Kriterium | Ziel | Messung |
|----|-----------|------|---------|
| SC-01 | Nutzer kann sich aus dem Plugin heraus per Browser bei seinem ChatGPT-Account anmelden | Login-Abschluss in unter 60 Sekunden | User-Test |
| SC-02 | Verbundene Sitzung bleibt ohne erneutes manuelles Login aktiv | Mindestens 30 Tage ohne Re-Login | Monitoring der Refresh-Quote |
| SC-03 | Verbindung kann vollstaendig getrennt werden | Alle Zugangsdaten verschwunden, neuer Login startet bei Null | Verifikation |
| SC-04 | Anmeldedaten werden sicher abgelegt | Nicht im Klartext einsehbar | Security-Review |
| SC-05 | Bei Auth-Problem erhaelt Nutzer eine Meldung mit konkretem Naechsten Schritt | Meldung enthaelt eine von vier Aktionen: Neu einloggen, Abo pruefen, Plugin updaten, Support kontaktieren | User-Test |
| SC-06 | Stille Token-Erneuerung unterbricht keine laufende Konversation | Refresh-Latenz unsichtbar im Chat | Performance-Messung |
| SC-07 | Loopback-Server akzeptiert genau einen Callback und schliesst sich danach | Server lebt nur fuer die Dauer des Auth-Flows | Funktionstest |

## Technical NFRs

> Technische Begriffe sind hier erlaubt.

### Performance

- **Token-Refresh**: Unter 500 Millisekunden gegen `auth.openai.com/oauth/token`.
- **Loopback-Server-Startup**: Unter 200 Millisekunden, sodass der Browser-Redirect den Server bereits offen vorfindet.
- **Polling-Verhalten**: Kein Polling. Der Loopback-Server wartet auf den Callback, der durch den Browser-Redirect ausgeloest wird.

### Security

- **Token-Storage**: `access_token`, `refresh_token` und `id_token` (JWT) werden ueber `safeStorage.encrypt()` (Format `enc:v1:<base64>`, siehe ADR-19) verschluesselt und in `data.json` unter `chatgptOAuth.accessToken/refreshToken/idToken` abgelegt. Wenn `safeStorage.isAvailable()` false ist (Mobile, Linux ohne Keyring), faellt der Service auf Plaintext zurueck und der Provider markiert sich in der UI als nicht waehlbar. Tokens kommen niemals in Logs.
- **PKCE-Code-Verifier**: 64 Byte aus `crypto.randomBytes`, SHA-256-Hash als `code_challenge`. Verifier nur im Speicher fuer die Dauer des Flows.
- **State-Parameter**: 32 Byte Zufall, vor dem Token-Tausch verifiziert. Verhindert CSRF im Loopback-Callback.
- **Loopback-Bind**: Server bindet ausschliesslich an `127.0.0.1` (nicht `0.0.0.0`), Port-Range 1455 bis 1460.
- **Token-Scope**: `openid profile email offline_access` (so wie Codex-CLI). Keine zusaetzlichen Scopes anfordern.
- **Logging-Diet**: Tokens, ID-Tokens und Code-Verifier kommen nie in `console.debug/warn/error` an. Auch nicht in Audit-Logs.
- **Generation-Counter**: Vor jedem Refresh-Call wird der aktuelle Generation-Counter geprueft, sodass parallele Refreshs nicht doppelt feuern.

### Reliability

- **Refresh-Buffer**: Refresh startet 60 Sekunden vor `expires_at`.
- **Retry-Verhalten**: Bei 401 vom Codex-API-Endpoint wird genau einmal automatisch refresht, dann Fehler an Nutzer.
- **Refresh-Lock**: `Promise<Tokens>`-Lock, sodass parallele Anfragen denselben Refresh-Call abwarten statt mehrfach zu schicken.
- **Loopback-Timeout**: Server gibt nach 5 Minuten ohne Callback auf und meldet Timeout.

### Availability

- **Mobile-Fallback**: Wenn `safeStorage` nicht verfuegbar ist, wird der Provider in der Settings-UI als nicht waehlbar markiert mit Hinweistext.

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1: Eigener `ChatGptOAuthService` als Singleton**

- **Warum ASR**: Der Token-Lifecycle muss ueber das gesamte Plugin konsistent sein. Mehrfach-Refreshs muessen serialisiert werden, sonst entstehen Token-Rotation-Konflikte.
- **Impact**: Beeinflusst, ob der Service Teil des Providers wird oder als eigenstaendige Komponente lebt. Empfehlung: eigene Datei unter `src/core/auth/ChatGptOAuthService.ts`.
- **Quality Attribute**: Reliability, Concurrency.

**CRITICAL ASR #2: Loopback-HTTP-Server in Electron**

- **Warum ASR**: PKCE-OAuth-Flow braucht einen Callback-Endpoint. In Electron-Plugins ist das nur via `require('http')` moeglich. Dieser Aufruf muss `eslint-disable-next-line` mit Begruendung erhalten und vor dem Community-Plugin-Review begruendet werden.
- **Impact**: Architekt-Entscheidung: Loopback im Renderer oder im Main-Prozess? Renderer ist einfacher, Main-Prozess waere robuster, aber ueber IPC aufwendiger.
- **Quality Attribute**: Security, Compliance.

**MODERATE ASR #3: Token-Persistenz-Schema in Settings**

- **Warum ASR**: Settings sind serialisiert in `data.json`, Tokens kommen in SafeStorageService. Das Mapping zwischen beidem muss klar sein.
- **Impact**: Settings-Struktur erweitern, vermutlich `chatgptOAuth: { accountId, tokens: SafeStorageEnvelope, expiresAt }`.
- **Quality Attribute**: Maintainability, Security.

**MODERATE ASR #4: ID-Token-Parsing fuer `chatgpt-account-id`**

- **Warum ASR**: Codex-Backend verlangt einen `chatgpt-account-id`-Header, der aus dem JWT-Claim `https://api.openai.com/auth.chatgpt_account_id` (oder analog) gelesen wird. Wir brauchen einen sicheren JWT-Decoder ohne externe Abhaengigkeit.
- **Impact**: Architekt entscheidet: eigene 30-Zeilen-Decode-Funktion oder bestehende Lib (jose, jws)?
- **Quality Attribute**: Maintainability, Security.

### Constraints

- **Review-Bot-Compliance**: Kein `fetch()`. HTTP-Requests gegen `auth.openai.com` laufen ueber `requestUrl`. Loopback-Server nutzt `require('http')` mit dokumentierter eslint-disable-Begruendung.
- **Client-ID**: Der Codex-CLI-Client-ID-String wird als Konstante hinterlegt. Kein Custom-Feld in MVP.
- **Obsidian-API**: Keine direkten DOM-Manipulationen ausserhalb der bestehenden Provider-Settings-Schiene.

### Open Questions for Architect

- Loopback-Server im Renderer-Prozess oder im Main-Prozess (via IPC)?
- Wo liegt der `ChatGptOAuthService`? Vorschlag `src/core/auth/`, alternativ als Erweiterung des bestehenden `SafeStorageService`-Pakets.
- Token-Schema: Flach in `ObsidianAgentSettings.chatgptOAuth` oder als verschachteltes Objekt mit eigener Migration?
- ID-Token-Decoding: Eigener Mini-Decoder oder Dependency wie `jose`?
- Loopback-Port: Hartkodiert auf 1455 oder Range 1455 bis 1460 mit Auto-Pick?

## Definition of Done

### Funktional

- [ ] Browser-Redirect zu `auth.openai.com/oauth/authorize` mit korrekten PKCE-Parametern
- [ ] Loopback-Server akzeptiert Callback, validiert State, tauscht Code gegen Tokens
- [ ] Tokens werden im SafeStorageService persistiert
- [ ] Auto-Refresh 60 Sekunden vor Ablauf
- [ ] Disconnect entfernt alle Tokens und Kontoinfos
- [ ] Fehler-Szenarien: abgelaufener Code, Browser-Abbruch, ungueltiger State, blockierter Port

### Qualitaet

- [ ] Unit-Tests fuer PKCE-Code-Generation, State-Verifikation, Token-Refresh-Logik
- [ ] Manueller E2E-Test des Auth-Flows mit echtem ChatGPT-Plus-Account
- [ ] Security-Review: keine Tokens in Logs, kein Klartext in `data.json`
- [ ] Review-Bot-Compliance: kein `fetch()`, keine `any`-Types, keine floating Promises, eslint-disable-Begruendungen vorhanden

### Dokumentation

- [ ] Feature-Spec auf Status `Implemented` setzen
- [ ] Backlog-Eintrag aktualisieren
- [ ] ADR fuer OAuth-Architektur referenzieren

## Hypothesis Validation

| Hypothese | Test | Erfolgskriterium | Ergebnis |
|-----------|------|------------------|----------|
| H-01 (PKCE im Loopback) | E2E-Test mit Test-Account auf macOS, Windows, Linux | Login schliesst auf allen drei Plattformen erfolgreich ab | Offen |
| H-02 (Token-Schema-Stabilitaet) | Endpoint-Drift-Indikator ueber sechs Monate | Keine Schema-Aenderung am `auth.openai.com/oauth/token`-Response | Offen |

**Wenn widerlegt:** Provider deaktivieren, Nutzer auf OpenAI-BYOK oder Kilo-Gateway umleiten, Endpoint-Anpassung als Patch nachschieben.

## Dependencies

- **SafeStorageService**: Vorhanden, wird unveraendert wiederverwendet.
- **ObsidianAgentSettings**: Neue Felder fuer `chatgptOAuth` benoetigt.

## Assumptions

- Codex-CLI-Client-ID bleibt fuer Drittanbieter-Nutzung mindestens 6 Monate erlaubt.
- `auth.openai.com/oauth/token` bleibt im standardkonformen OAuth-2.0-PKCE-Format.
- Electron erlaubt einen Loopback-HTTP-Server auf 127.0.0.1 ohne zusaetzliche Permissions.

## Out of Scope

- Mobile-Auth (SafeStorage fehlt)
- Custom-Client-ID (in MVP nicht vorgesehen)
- Multi-Account (eine ChatGPT-Identitaet pro Plugin-Instanz)
- Embedding-API (Codex-Backend hat keine)
