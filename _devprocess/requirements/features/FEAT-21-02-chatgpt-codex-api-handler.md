---
id: FEAT-00-21-002
name: Codex Responses API Handler
epic: EPIC-21
depends-on: [FEAT-00-21-001]
---

# Feature: Codex Responses-API Handler

> **Feature ID**: FEAT-00-21-002
> **Epic**: EPIC-21 ChatGPT OAuth Provider
> **Prioritaet**: P0-Critical
> **Aufwand**: M

## Feature Description

Eigener `ApiHandler` mit Provider-Type `'chatgpt-oauth'`, der Anfragen gegen `https://chatgpt.com/backend-api/codex/responses` schickt, das Streaming-Format der Responses-API in das interne `ApiStream`-Format mappt und Tool-Calls korrekt durchreicht. Der Handler tauscht den OpenAI-BYOK-Pfad gegen die Codex-Backend-Endpoints, behaelt aber dieselbe externe Schnittstelle (`createMessage`, `getModel`, Streaming-Chunks), sodass `AgentTask` und Tool-Pipeline unveraendert bleiben.

Der Handler ist neu in `src/api/providers/chatgpt-oauth.ts` und mischt sich nicht in `openai.ts` ein, weil Endpoint-Schema, Header-Anforderungen und Authentifizierung sich grundlegend unterscheiden.

## Benefits Hypothesis

**Wir glauben, dass** ein dedizierter Codex-Backend-Handler mit Tool-Call-Support
**folgende messbare Outcomes liefert:**

- ChatGPT-Plus-Subscriber koennen alle Vault Operator-Features (inklusive Tools) ohne API-Key nutzen.
- Die Antwortqualitaet entspricht der Codex-CLI-Erfahrung.

**Wir wissen, dass wir erfolgreich sind, wenn:**

- 100 Prozent der Tool-Calls in Smoke-Tests werden korrekt geparst und ausgefuehrt.
- Streaming-Latenz bis zum ersten Token liegt im selben Korridor wie der OpenAI-BYOK-Provider (plus oder minus 200 Millisekunden).

## Jobs to be Done

| Job-Typ | Job | User Story |
|---------|-----|-----------|
| Funktional | Den vollen Vault Operator-Funktionsumfang inklusive Tool-Calls mit ChatGPT-Subscription nutzen | Story 1 |
| Funktional | Modell auswaehlen, das mein Subscription-Plan abdeckt | Story 2 |
| Emotional | Vertrauen, dass der Handler auch bei API-Aenderungen sauber faellt statt still falsche Antworten liefert | Story 3 |

## User Stories

### Story 1: Tool-Calls funktionieren wie bei BYOK (Funktional)

**Als** verbundener ChatGPT-OAuth-Nutzer
**moechte ich**, dass alle Vault Operator-Tools (read_file, write_file, semantic_search etc.) genauso aufgerufen und gestreamt werden wie beim OpenAI-BYOK-Provider,
**damit ich** keinen Funktionsverlust gegenueber Pay-per-Use erlebe.

### Story 2: Modell-Auswahl (Funktional)

**Als** Nutzer
**moechte ich** in den Settings das gewuenschte Codex-Modell (z.B. `gpt-5-codex`) auswaehlen,
**damit ich** je nach Aufgabe das passende Modell verwenden kann.

### Story 3: Klare Fehlersignale bei API-Drift (Emotional)

**Als** Nutzer
**moechte ich** bei Endpoint-Aenderungen oder Quota-Problemen eine Meldung sehen, die mir sagt, was passiert,
**damit ich** nicht vor stillen Fehlern oder leeren Antworten stehe.

## Success Criteria (Tech-Agnostic)

| ID | Kriterium | Ziel | Messung |
|----|-----------|------|---------|
| SC-01 | Antworten erscheinen wort- bzw. tokenweise im Chat, sobald sie eintreffen | Erstes sichtbares Token in unter zwei Sekunden | Performance-Messung |
| SC-02 | Tool-Calls werden korrekt erkannt und ausgefuehrt | Alle Smoke-Test-Tool-Calls erfolgreich | Integrationstest |
| SC-03 | Modell-Wechsel im Settings-UI ist sofort wirksam | Naechste Anfrage nutzt neues Modell | Funktionstest |
| SC-04 | Bei API-Fehlern erhaelt Nutzer eine Meldung, die zwischen Quota, Auth und Endpoint-Drift unterscheidet | Fehlertext nennt eine der drei Kategorien | User-Test |
| SC-05 | Antwortqualitaet entspricht der Codex-CLI-Erfahrung | Manueller Vergleich auf zehn Standardanfragen, mindestens neun gleichwertig oder besser | Vergleichstest |
| SC-06 | Plugin laeuft auch bei Endpoint-Schema-Aenderung weiter (mit Fehlermeldung), statt zu crashen | Kein Plugin-Crash bei 4xx oder 5xx | Resilienz-Test |

## Technical NFRs

### Performance

- **Time-to-First-Token**: Unter zwei Sekunden in 95 Prozent der Anfragen.
- **Streaming-Latenz**: Pro Chunk unter 50 Millisekunden Verarbeitungszeit im Plugin.
- **Memory-Footprint**: Streaming-Buffer kappt bei 16 KB pro aktivem Tool-Call-Akkumulator.

### Security

- **Header-Set**: `Authorization: Bearer <access_token>`, `chatgpt-account-id: <accountId>`, `OpenAI-Beta: responses=experimental`, `User-Agent: Vault Operator/<version>`. Keine zusaetzlichen Header.
- **Token-Hand-Off**: Handler holt Tokens ausschliesslich vom `ChatGptOAuthService`. Kein Caching im Handler selbst.
- **Refresh-on-401**: Bei 401 genau einmal Refresh anfordern, dann Anfrage neu absetzen. Bei zweitem 401 Fehler durchreichen.
- **No-Logging**: Request-Bodies und Response-Bodies kommen nicht in Logs. Nur Statuscode und Error-Code.

### Reliability

- **Endpoint-Drift-Detection**: Bei unbekanntem Response-Schema (z.B. fehlende `output[]`-Felder) Fehler mit klarer Meldung statt stiller Fehlinterpretation.
- **Streaming-Interrupt**: Bei Netzwerkabbruch wird der laufende Stream sauber abgebrochen, Tool-Call-Akkumulatoren werden verworfen.
- **Retry-Politik**: Kein Auto-Retry bei 5xx (User entscheidet manuell, sonst doppelter Quota-Verbrauch).

### Scalability

- **Parallel-Anfragen**: Handler unterstuetzt mindestens drei parallele Streams pro Plugin-Instanz (analog zu Subtasks).

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1: Schema-Mapping Codex-Responses zu ApiStream**

- **Warum ASR**: Das Codex-Backend nutzt das Responses-API-Schema mit `event: response.output_item.added`, `response.output_item.delta` und `response.completed`. Unser internes `ApiStream` erwartet das Chat-Completions-Format. Der Handler muss eine 1:1-Mapping-Schicht haben, sonst leakt das Schema in die Pipeline.
- **Impact**: Architekt entscheidet ueber Mapping-Strategie: Adapter-Klasse oder inline im Handler?
- **Quality Attribute**: Maintainability, Performance.

**CRITICAL ASR #2: Tool-Definitions im Responses-Format**

- **Warum ASR**: Tool-Definitionen folgen im Responses-API einem leicht anderen Schema als Chat-Completions (`tools: [{type: 'function', name, description, parameters}]` vs `[{type: 'function', function: {...}}]`). Unsere `ToolDefinition` muss korrekt konvertiert werden.
- **Impact**: Konvertierungs-Helper, der von allen Codex-Aufrufen genutzt wird.
- **Quality Attribute**: Correctness.

**MODERATE ASR #3: Modell-Listing**

- **Warum ASR**: Codex-Backend liefert (Stand 2026-04) keine offene Models-Liste. Modelle werden hartkodiert oder ueber eine Probe-Anfrage erkannt.
- **Impact**: Architekt entscheidet ueber Modell-Discovery-Strategie (Hardcode-Liste, Probe-Request, User-Eingabe).
- **Quality Attribute**: Usability, Maintainability.

**MODERATE ASR #4: Endpoint-Drift-Resilienz**

- **Warum ASR**: Undokumentierte Endpoints aendern sich ohne Vorwarnung. Der Handler braucht ein Schema-Validation-Layer, das bei unerwarteten Strukturen klar abbricht statt mit `undefined` weiterzuarbeiten.
- **Impact**: Eine Validierungsschicht (z.B. `zod` oder eigene Type-Guards) zwischen HTTP-Layer und Mapping.
- **Quality Attribute**: Reliability.

### Constraints

- **Review-Bot-Compliance**: HTTP-Requests via `requestUrl`. Streaming muss mit `requestUrl`-Streaming-Mode oder `IncomingMessage` aus `https`-Modul (mit Begruendung) realisiert werden.
- **Kein OpenAI-SDK**: Das offizielle SDK adressiert `api.openai.com`. Wir spezialisieren manuell.
- **Schema im Code dokumentiert**: Jede Annahme ueber das Codex-Response-Schema bekommt einen Kommentar mit Datum (`// Schema as observed 2026-04-28`).

### Open Questions for Architect

- Streaming-Implementierung: `requestUrl` mit Stream-Mode oder Node-`https`-Modul wie in `openai.ts` Line 75?
- Mapping-Schicht: separater `CodexResponseMapper` oder inline im Handler?
- Modell-Listing: Hardcode (`gpt-5-codex`, `gpt-4.1-codex` etc.) oder dynamisch ueber Probe?
- Schema-Validation: bestehende Library (`zod`) hinzunehmen oder eigene Type-Guards?
- Soll der Handler bei 5xx einmal automatisch retryen oder strikt durchreichen?

## Definition of Done

### Funktional

- [ ] `createMessage` schickt Streaming-Anfragen an `chatgpt.com/backend-api/codex/responses`
- [ ] Streaming-Chunks werden in `ApiStreamChunk` (Text + Tool-Call) gemappt
- [ ] Tool-Calls werden korrekt akkumuliert und durchgereicht
- [ ] Modell-Wahl ueber Settings funktioniert
- [ ] 401-Refresh-Logik funktioniert
- [ ] Klare Fehlertexte bei Quota, Auth, Schema-Drift

### Qualitaet

- [ ] Unit-Tests fuer Mapping (synthetische Codex-Streams)
- [ ] Integrationstest mit echtem ChatGPT-Plus-Account (Smoke-Test, mind. 5 Tool-Calls)
- [ ] Vergleichstest gegen OpenAI-BYOK auf zehn Standardanfragen
- [ ] Review-Bot-Compliance: kein `fetch()`, keine `any`-Types, keine floating Promises

### Dokumentation

- [ ] Feature-Spec auf `Implemented` setzen
- [ ] Beobachtetes Schema im Code mit Datum kommentieren
- [ ] Backlog-Eintrag aktualisieren

## Hypothesis Validation

| Hypothese | Test | Erfolgskriterium | Ergebnis |
|-----------|------|------------------|----------|
| H-03 (Tool-Calls + Streaming im Codex-Format) | Smoke-Test mit fuenf verschiedenen Tools | Alle Tool-Calls vollstaendig geparst und ausgefuehrt | Offen |
| H-04 (Plus-Subscriber haben Codex-Quota) | Test-Account mit Plus-Abo schickt 50 Anfragen | Keine Quota-Fehler bei normaler Nutzung | Offen |

**Wenn H-04 widerlegt:** Klare Hinweis-UI, dass nur Pro-Subscriber den Provider sinnvoll nutzen koennen.

## Dependencies

- **FEAT-00-21-001**: Token-Lifecycle muss vor diesem Feature stehen.
- **AgentTask**: Bestehendes Interface, unveraendert.
- **ToolRegistry**: Tool-Definitionen werden ueber existierende Konvertierung gezogen.

## Assumptions

- Das Codex-Backend akzeptiert dieselben Tool-Definitionen wie die offizielle Responses-API.
- `gpt-5-codex` ist das Default-Modell und in jedem Plus-Subscription enthalten.
- Streaming via Server-Sent-Events bleibt das Transport-Format.

## Out of Scope

- Embeddings (Codex-Backend bietet keine)
- Bildanhaenge (in MVP ignoriert, kommt eventuell in Folge-Feature)
- Audio-/Voice-Modi
