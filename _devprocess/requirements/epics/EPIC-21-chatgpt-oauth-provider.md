---
id: EPIC-21
name: ChatGPT OAuth Provider
depends-on: [FEAT-04-03]
---

# Epic: ChatGPT OAuth Provider

> **Epic ID**: EPIC-21
> **Feature Prefix**: FEAT-00-21-...
> **Business Alignment**: User-Request 2026-04-28 (analog zu EPIC-12 Copilot, EPIC-13 Kilo Gateway)
> **Scope**: MVP

## How-Might-We

Wie koennen wir Vault Operator-Nutzern mit aktivem ChatGPT-Plus- oder Pro-Abo erlauben, ihr Abo direkt im Plugin als LLM-Backend zu nutzen, ohne einen separaten OpenAI-API-Key kaufen und verwalten zu muessen?

## Epic Hypothesis Statement

Fuer Obsidian-Nutzer mit aktivem ChatGPT-Plus- oder Pro-Abonnement, die ihre bezahlte Subscription auch ausserhalb von chatgpt.com nutzen wollen, liefert dieses Epic einen neuen LLM-Provider, der sich per einmaligem Browser-Login mit dem ChatGPT-Account verbindet und Anfragen ueber das vom OpenAI-Codex-CLI verwendete Backend ausfuehrt. Anders als der bestehende OpenAI-Provider verlangt diese Variante keinen Pay-per-Use-API-Key und keine Kreditkartenhinterlegung bei platform.openai.com. Anders als BYOK-Provider lebt die Authentifizierung in einem PKCE-OAuth-Flow mit lokalem Loopback-Callback, sodass die Subscription-Nutzung mit derselben Bequemlichkeit funktioniert, die Codex-CLI- und opencode-Nutzer kennen.

## Business Outcomes (messbar)

1. **Nutzer-Aktivierung**: Anteil der ChatGPT-Plus/Pro-Nutzer, die den Login-Flow erfolgreich abschliessen, erreicht in den ersten vier Wochen nach Release mindestens 90 Prozent.
2. **Token-Refresh-Stabilitaet**: Anteil automatischer Token-Erneuerungen ohne erneutes manuelles Login liegt nach einem Monat ueber 99 Prozent.
3. **Null-Regression**: Keine neuen Bugs in den bestehenden Providern (Anthropic, OpenAI BYOK, Copilot, Kilo-Gateway, Ollama, Gemini).

## Leading Indicators

- Login-Completion-Rate: Anteil der Nutzer, die den Browser-Flow vom Klick bis zum erfolgreichen Token-Empfang durchlaufen.
- Refresh-Erfolgsquote: Anteil der `refresh_token`-Calls gegen `auth.openai.com`, die ohne 4xx-Antwort durchgehen.
- Endpoint-Drift-Indikator: Anzahl der 4xx/5xx-Antworten von `chatgpt.com/backend-api/codex/responses` pro Tag (warnt frueh, falls OpenAI das API-Schema aendert).

## Critical Hypotheses

| Ref | Hypothese | Validiert durch | Status |
|------|-----------|------------------|--------|
| H-01 | Der Codex-PKCE-Flow funktioniert in Electron mit lokalem Loopback-Server (127.0.0.1:1455) zuverlaessig | FEAT-00-21-001 | Offen |
| H-02 | Das Token-Schema von `auth.openai.com` (id_token + access_token + refresh_token) bleibt mindestens 6 Monate stabil | FEAT-00-21-001 | Offen |
| H-03 | Die Codex-Backend-Endpoints akzeptieren Tool-Calls und Streaming im OpenAI-Responses-API-Format | FEAT-00-21-002 | Offen |
| H-04 | ChatGPT-Plus-Subscriber haben Quota-Zugriff auf `gpt-5-codex` und Folgemodelle ueber diesen Endpoint | FEAT-00-21-002 | Offen |

## MVP Features

| Feature ID | Name | Prioritaet | Aufwand | Status |
|----------------|---------------------------------------------|------------|--------|---------|
| FEAT-00-21-001 | ChatGPT OAuth Lifecycle (PKCE + Loopback + Refresh) | P0 | M | Geplant |
| FEAT-00-21-002 | Codex Responses-API Handler | P0 | M | Geplant |
| FEAT-00-21-003 | Settings-UI mit "Mit ChatGPT anmelden" | P0 | S | Geplant |

**Prioritaeten:** P0-Critical (MVP geht ohne nicht), P1-High (wichtig), P2-Medium (wertsteigernd)
**Aufwand:** S (1 bis 2 Sprints), M (3 bis 5 Sprints), L (6 oder mehr Sprints)

## Explizit Out-of-Scope

- **Custom Client-ID**: Erste Version verwendet die offizielle Codex-CLI-Client-ID. Eigener OAuth-App-Eintrag ist nicht geplant, weil OpenAI Drittanbieter-Apps fuer dieses Backend nicht offiziell registriert.
- **ChatGPT-Web-Features**: Memory, Custom GPTs, Canvas und Browse bleiben ausserhalb des Plugins. Es geht nur um den LLM-API-Zugriff.
- **Mobile-Support**: SafeStorageService steht auf iOS und Android nicht zur Verfuegung, also ist der Provider auf Desktop-Obsidian beschraenkt.
- **Multi-Account**: Eine ChatGPT-Identitaet pro Plugin-Instanz, kein Account-Switcher.
- **Embedding-Modelle**: Codex-Backend liefert keine Embedding-Endpoints. Embeddings laufen weiter ueber bestehende Provider.
- **Auto-Provider-Switching**: Bei Endpoint-Fehlern faellt das Plugin nicht still auf OpenAI-BYOK zurueck. Der Nutzer entscheidet selbst.

## Dependencies & Risks

### Dependencies

- **SafeStorageService** (`src/core/security/SafeStorageService.ts`): Verschluesselt Tokens, bereits in Copilot-Provider produktiv.
- **ApiHandler-Interface** (`src/api/types.ts`): Stabil, neuer Provider implementiert dasselbe Interface wie `openai.ts`.
- **Provider-Registry** (`src/api/index.ts`, `src/types/settings.ts`): Neuer `LLMProvider`-Wert `'chatgpt-oauth'` plus zugehoerige Settings-Felder.
- **ModelConfigModal** (`src/ui/settings/ModelConfigModal.ts`): Erweiterung um ChatGPT-Login-Block analog zum Copilot-Block.
- **Electron Node-API**: `require('http')` und `require('crypto')` fuer Loopback-Server und PKCE-Code-Generation, beide bereits an anderen Stellen im Plugin verwendet.

### Risks

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|--------------------|--------|------------|
| OpenAI sperrt die Codex-Client-ID fuer Drittanbieter-Tools | Mittel | Hoch | Endpoint-Drift-Indikator beobachten, Disclaimer im Settings-UI, Fallback auf bestehenden OpenAI-BYOK-Provider |
| API-Schema von `chatgpt.com/backend-api/codex/responses` aendert sich ohne Vorwarnung | Hoch | Mittel | Versionierte Wrapper, klare Fehlermeldung mit Hinweis auf Plugin-Update, Telemetrie ueber Fehlerquoten |
| Token-Refresh-Race-Condition bei parallelen Anfragen | Niedrig | Mittel | Promise-Lock im OAuth-Service, Generation-Counter analog zu Copilot |
| Loopback-Port 1455 belegt | Niedrig | Niedrig | Port-Range 1455 bis 1460 durchprobieren, sonst Fehlermeldung |
| Community-Plugin-Review beanstandet `require('http')` fuer Loopback-Server | Mittel | Mittel | eslint-disable mit Begruendung, Pruefen ob Obsidian-API-Alternative existiert, sonst Hinweis im Plugin-Review-PR |
| ChatGPT-Plus-Nutzer haben kein Quota auf Codex-Modelle | Niedrig | Hoch | Vor Release mit Test-Account verifizieren, Quota-Fehler verstaendlich anzeigen |

## Technical Debt

Keiner geplant. Das Epic folgt dem etablierten Provider-Pattern (Copilot war Vorlage). Der Drift-Risiko-Anteil ist kein Schuldbestand, sondern intrinsisch fuer die Nutzung undokumentierter Endpoints und wird ueber Monitoring abgefedert.
