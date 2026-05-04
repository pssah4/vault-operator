---
id: ADR-89
name: ChatGPT PKCE Loopback OAuth Flow
epic: EPIC-21
depends-on: [FEAT-00-21-001]
---

# ADR-89: ChatGPT PKCE Loopback OAuth Flow

**Date:** 2026-04-28
**Deciders:** Sebastian Hanke

## Context

Der ChatGPT-OAuth-Provider (EPIC-21) braucht einen OAuth-Authorization-Code-Flow mit PKCE gegen `auth.openai.com`. Der von OpenAI Codex-CLI und opencode genutzte Pattern verlangt einen lokalen HTTP-Callback-Endpoint. Im Browser-basierten Plugin-Kontext gibt es keinen Standard-Mechanismus dafuer, Obsidian liefert keinen eingebauten Callback-Handler oder Custom-URL-Scheme. Der Loopback-Server muss aus dem Plugin heraus auf 127.0.0.1 gestartet werden, einen einzigen Callback empfangen, das `state`-Param verifizieren, den Code an den OAuth-Service weitergeben und sich danach selbst schliessen.

**Triggering ASR:** Loopback-HTTP-Server in Electron (Security, Compliance, FEAT-00-21-001).

**Problem:** Wo lebt der Loopback-Server in der Plugin-Architektur, wie wird er gegen Race-Conditions und Abuse abgesichert, und wie passiert der Datenaustausch zwischen Server und Auth-Service?

## Decision Drivers

- **Security:** Server bindet ausschliesslich an Loopback-Adresse, akzeptiert genau einen Callback, validiert `state` vor Code-Tausch.
- **Plugin-Review-Compliance:** `require('http')` ist nicht in der Default-Erlaubt-Liste des Community-Plugin-Reviews. Es braucht einen begruendeten `eslint-disable`-Block, und der Code muss klar erkennbar nur fuer den OAuth-Flow leben.
- **Lifecycle-Sauberkeit:** Server darf nicht laenger leben als der Flow dauert. Bei Browser-Abbruch oder Timeout muss er sich aufraeumen.
- **Port-Verfuegbarkeit:** Port 1455 kann belegt sein. Die Loesung muss damit umgehen.
- **Plattform-Konsistenz:** Funktioniert auf macOS, Windows und Linux. Mobile (iOS/Android) ist explizit out-of-scope.

## Considered Options

### Option 1: Renderer-Prozess mit `require('http')`

- Loopback-Server wird im Renderer-Prozess (Plugin-Code) via `require('http')` aufgemacht.
- `eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js http only available via dynamic require for OAuth loopback callback`.
- Server lebt in einer eigenen Klasse `PkceLoopbackServer`, wird vom `ChatGptOAuthService` instanziiert und beim Callback-Erfolg oder Timeout zerstoert.
- Pro: Minimaler Code, keine IPC-Bruecke.
- Pro: Konsistent mit existierenden `require()`-Faellen (`SafeStorageService` nutzt `require('electron')`, `openai.ts` nutzt `require('https')`).
- Con: Renderer-Prozess hat Zugriff auf einen offenen Port, theoretisch koennten andere Plugin-Skripte mitlauschen. Mitigation durch Bind auf 127.0.0.1, kurze Lifetime, State-Validierung.
- Con: Plugin-Review-Bot pingt `require()` an, braucht klaren Kommentar.

### Option 2: Main-Prozess via IPC

- Plugin sendet ueber `app.electron.ipcRenderer` eine Message an den Main-Prozess, der den HTTP-Server hochzieht.
- Pro: Saubere Prozess-Trennung, Renderer kommt nicht direkt an Node-`http`.
- Pro: Plugin-Review koennte das einfacher durchwinken (kein `require('http')` im Plugin-Code).
- Con: Obsidian-Plugin-API hat keinen offiziellen IPC-Hook. Workaround ueber `process.electron.remote` ist deprecated und in moderneren Electron-Versionen entfernt.
- Con: Erfordert eigene Plugin-Aenderung im Obsidian-Core, nicht moeglich.
- Con: Dadurch faktisch nicht umsetzbar.

### Option 3: Custom-URL-Scheme via `obsidian://chatgpt-oauth-callback`

- OAuth-Redirect zeigt auf `obsidian://chatgpt-oauth-callback?code=...&state=...`, Obsidian-Plugin registriert URI-Handler.
- Pro: Kein lokaler Server noetig.
- Pro: Plugin-Review unproblematisch.
- Con: `auth.openai.com` akzeptiert nur HTTP- oder HTTPS-Redirect-URIs. Custom-Schemes sind nicht in der Codex-Client-ID registriert.
- Con: Wenn wir eine eigene Client-ID anlegen wuerden, koennten wir Custom-Scheme registrieren, aber das ist explizit out-of-scope (Codex-Client-ID wird wiederverwendet, ADR-88).
- Con: Funktioniert nicht mit der Codex-Client-ID.

### Option 4: Polling via Device-Code-Flow (analog Copilot)

- Statt Authorization-Code-Flow den Device-Code-Flow nutzen, wie Copilot es macht (siehe ADR-37).
- Pro: Kein Loopback-Server.
- Con: `auth.openai.com` unterstuetzt fuer die Codex-Client-ID nur den Authorization-Code-Flow mit PKCE. Device-Code-Flow ist hier nicht freigeschaltet.
- Con: Funktioniert nicht.

## Decision

**Vorgeschlagene Option:** Option 1 (Renderer-Prozess mit `require('http')`).

**Begruendung:**

1. Optionen 2, 3 und 4 sind mit der Codex-Client-ID nicht umsetzbar. Damit bleibt nur Option 1.
2. Das Sicherheitsrisiko durch einen kurzlebigen, an Loopback gebundenen Server ist begrenzt: kein externes Netzwerk-Exposure, State-Param schuetzt vor CSRF, Server schliesst nach genau einem Callback oder nach Timeout.
3. Existierende Praezedenzfaelle im Repo (`SafeStorageService` mit `require('electron')`, `openai.ts` mit `require('https')`) zeigen, dass der Plugin-Review-Bot `require()` mit `eslint-disable -- reason` durchwinkt.
4. Die Klassen-Kapselung in `PkceLoopbackServer` haelt die Node-API-Beruehrungspunkte minimal und review-tauglich.

**Server-Lifecycle:**

```
ChatGptOAuthService.startAuthFlow()
  1. Generate codeVerifier (64 bytes), codeChallenge (SHA-256 base64url)
  2. Generate state (32 bytes base64url)
  3. PkceLoopbackServer.start(expectedState, port=1455)
     -> binds 127.0.0.1, listens for /auth/callback
     -> returns Promise<{ code, state }>
     -> 5 min Timeout, AbortController
  4. window.open(authUrl) im Default-Browser
  5. Server empfaengt Callback:
     -> validate state === expectedState  (sonst 400 Bad Request)
     -> respond 200 mit "Anmeldung abgeschlossen, du kannst zurueck zu Obsidian"
     -> close()
     -> resolve({ code, state })
  6. Token-Tausch via requestUrl gegen auth.openai.com/oauth/token
  7. Persist tokens via SafeStorageService
  8. Return account info to UI
```

**Port-Strategie:** Port-Range 1455 bis 1460. Beim Start des Servers wird sequenziell geprueft, welcher Port frei ist. Der gewaehlte Port fliesst in die Redirect-URI ein. `auth.openai.com` muss alle sechs Ports in der Codex-Client-ID-Konfiguration als zulaessige Redirect-URIs akzeptieren. Falls nicht, fallen wir auf Port 1455 zurueck und liefern eine Fehlermeldung "Bitte schliesse das Programm, das Port 1455 belegt".

**Eslint-Disable-Kommentar (verbindlich):**

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js http module is the only available transport for the local OAuth callback. Server binds exclusively to 127.0.0.1, accepts a single callback within a 5-minute window, and is destroyed afterwards.
const http = require('http') as typeof import('http');
```

**Hinweis:** Dies ist ein Vorschlag. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive

- Funktioniert mit der Codex-Client-ID ohne eigene OAuth-App.
- Kurze Server-Lifetime, klare Aufraeum-Logik.
- Einheitliches Pattern mit bestehenden `require()`-Faellen.

### Negative

- `require('http')` ist Plugin-Review-Aufmerksamkeitspunkt, braucht klaren Kommentar.
- Bei Browser-Abbruch laeuft der Server noch bis zum 5-Minuten-Timeout. Der `AbortController` darf nicht vergessen werden.
- Mehrere Port-Optionen muessen in der Client-ID-Konfiguration eingetragen sein. Falls OpenAI das nicht erlaubt, schrumpft die Loesung auf Port 1455 und damit auf Port-blockiert-Risiko.

### Risks

- **Port-Blockade:** Mitigation: Port-Range 1455 bis 1460, klare Fehlermeldung mit Hinweis auf Port-Konflikt.
- **Plugin-Review-Ablehnung:** Mitigation: PR-Begruendung vorbereiten, Praezedenzfaelle zitieren (Obsidian-Git-Plugin, andere OAuth-fluent Plugins).
- **State-Race-Condition:** Server-Instanz pro Flow, State im Closure, kein gemeinsamer State zwischen mehreren parallelen Flows. Plugin verhindert in der UI mehrere gleichzeitige Logins (Button disabled waehrend Flow laeuft).
- **Localhost-Spoofing durch Schadsoftware:** Zugriff auf Loopback-Port erfordert lokale Code-Ausfuehrung. Wenn Angreifer schon lokal Code ausfuehrt, ist der OAuth-Token-Diebstahl nicht das primaere Risiko. State-Param und kurze Lifetime begrenzen den Schaden.

## Implementation Notes

**Dateistruktur:**

```
src/core/auth/PkceLoopbackServer.ts
```

**Klassen-Skeleton:**

```typescript
export interface CallbackResult {
    code: string;
    state: string;
}

export class PkceLoopbackServer {
    private server?: import('http').Server;
    private abortController = new AbortController();

    constructor(
        private readonly expectedState: string,
        private readonly portCandidates: number[] = [1455, 1456, 1457, 1458, 1459, 1460],
        private readonly timeoutMs: number = 5 * 60 * 1000,
    ) {}

    async start(): Promise<{ port: number, callback: Promise<CallbackResult> }> {
        // bind to next free port from portCandidates
        // returns the chosen port for redirect_uri construction
        // and a Promise that resolves on callback or rejects on timeout/abort
    }

    abort(): void {
        this.abortController.abort();
        this.server?.close();
    }
}
```

**Erfolgs-HTML-Antwort:**

Statisches Mini-HTML mit `data-i18n` fuer DE/EN-Switch:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Obsilo</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
<h1>Anmeldung abgeschlossen</h1>
<p>Du kannst dieses Fenster schliessen und zu Obsidian zurueckkehren.</p>
</body></html>
```

Inline-Styles sind hier zulaessig, weil das HTML im Browser-Tab des Nutzers laeuft und nicht im Plugin-DOM. Review-Bot scannt nur Plugin-DOM-Code.

**Fehler-HTML-Antwort:** Analog mit `<h1>Fehler</h1>` und einem Hinweis "Bitte erneut in Obsidian starten".

## Related Decisions

- ADR-88: ChatGPT OAuth Provider Architecture, definiert den Service, der den Loopback-Server nutzt.
- ADR-19: Electron SafeStorage, persistiert die Tokens nach erfolgreichem Flow.

## References

- FEAT-00-21-001: ChatGPT OAuth Lifecycle.
- Codex-CLI Source: `codex-rs/cli/src/auth.rs` (Loopback-Pattern, MIT-lizenziert, Referenz).
- opencode Source: `packages/opencode/src/auth/openai.ts` (TypeScript-Variante des gleichen Patterns).
