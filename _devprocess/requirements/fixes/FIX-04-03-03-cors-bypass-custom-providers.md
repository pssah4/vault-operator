---
id: FIX-04-03-03
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-04-03-03: CORS-Fehler bei Custom OpenAI-kompatiblen Providern (opencode go, lokale Server)

## Symptom

Issue [#33](https://github.com/pssah4/vault-operator/issues/33) (gemeldet
von @hfr38). User versucht `opencode go` (lokaler OpenAI-kompatibler
Server, sst.dev/opencode) als Custom-Provider zu konfigurieren. Anfragen
schlagen mit CORS-Fehler fehl.

## Root cause

`src/api/providers/openai.ts:172`:

```ts
...(config.type === 'gemini' ? { fetch: createNodeFetch() } : {}),
```

Der `createNodeFetch()`-Bypass (umgeht Electron-CORS via Node.js https-
Modul) wird **NUR fuer Gemini** aktiviert. Bei `config.type === 'custom'`
benutzt die OpenAI-SDK `globalThis.fetch` -- Obsidian's Electron-Renderer
erzwingt darauf CORS. Lokale Server wie opencode go senden meist keine
`Access-Control-Allow-Origin: *`-Header -> Preflight bricht ab.

Plus: `createNodeFetch` hardcodet `https.request` mit Port 443 default.
Fuer HTTP-only-Server (`http://localhost:8000`) ohne TLS waere das auch
nach Aktivierung gebrochen.

Same blast-radius hat `ollama` und `lmstudio` als Custom-OpenAI-Kompatibel
auf localhost -- alle drei sind anfaellig.

## Fix

Zwei Aenderungen in `src/api/providers/openai.ts`:

**1. `createNodeFetch` protokoll-bewusst machen:**

```ts
const isHttps = parsed.protocol === 'https:';
const httpModule = isHttps
    ? (require('https') as typeof import('https'))
    : (require('http') as unknown as typeof import('https'));
const defaultPort = isHttps ? 443 : 80;
const req = httpModule.request({ ..., port: parsed.port || defaultPort, ... });
```

Damit funktionieren `http://localhost:xxx` ebenso wie `https://...`.

**2. Bypass fuer alle Provider-Typen aktivieren die CORS-anfaellig sind:**

```ts
...((['gemini', 'custom', 'ollama', 'lmstudio'] as const).includes(config.type as never)
    ? { fetch: createNodeFetch() }
    : {}),
```

Begruendung: 
- `gemini` (Google): vorher schon aktiv.
- `custom`: opencode go + andere generische OpenAI-kompatible Server.
- `ollama` / `lmstudio`: localhost-Server, gleiche Problemklasse.
- `openai` / `openrouter`: bleiben unveraendert (offizielle APIs mit
  korrekten CORS-Headern, brauchen den Bypass nicht).
- `azure` / `github-copilot` / `bedrock`: eigene Auth-Pfade, nicht
  betroffen.

## Bewusst NICHT geaendert

- Andere Provider (`chatgpt-oauth`, `kilo-gateway`, `anthropic`, `bedrock`)
  haben ihre eigenen Transport-Pfade. CORS-Bypass dort separat falls
  Reports kommen.
- Wir testen nicht jeden lokalen Server -- der Bypass ist eine generelle
  Lockerung, kein server-spezifischer Fix.

## Regression test

Kein automatischer Test (createNodeFetch ist Electron-Renderer-spezifisch
und braucht laufenden Obsidian-Kontext fuer realistic mocking).

Live-Verifikation:

1. Settings -> Models -> "Add Custom Provider"
2. Base URL z.B. `http://localhost:4096/v1` (opencode go default)
3. Model name: was auch immer opencode go anbietet
4. Aktivieren + im Sidebar als aktives Modell waehlen
5. Anfrage tippen -> Antwort kommt durch, keine CORS-Meldung mehr.

## Status

Done 2026-05-13. 1490 Tests gruen (kein Test-Delta -- transparenter
Bypass-Hook), tsc clean, build+deploy gruen, lint clean.
Live-Verifikation steht aus -- braucht User mit opencode go oder
einem anderen lokalen OpenAI-kompatiblen Server.
