# Feature: Copilot Chat Completions Provider

> **Feature ID**: FEAT-12-02
> **Epic**: EPIC-12 - GitHub Copilot LLM Provider Integration
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Implementierung eines vollwertigen `ApiHandler` fuer GitHub Copilot Chat Completions. Nutzt die Copilot API (`api.githubcopilot.com/chat/completions`) mit Streaming, Tool Calling und copilot-spezifischen Request Headers. Baut auf dem Auth Service (FEAT-12-01) auf und integriert sich nahtlos in die bestehende Provider Factory.

## Benefits Hypothesis

**Wir glauben dass** ein Copilot Chat Provider der das bestehende ApiHandler-Interface implementiert
**Folgende messbare Outcomes liefert:**
- Alle Agentic Features (Tool Calling, Streaming, Multi-Turn) funktionieren ueber Copilot-Modelle
- User bemerkt keinen Unterschied zu bestehenden Providern

**Wir wissen dass wir erfolgreich sind wenn:**
- Tool Calling ueber Copilot zuverlaessig funktioniert (>99% korrekte Tool-Aufrufe)
- Streaming-Antworten fliessend in der Sidebar erscheinen

## User Stories

### Story 1: Chat mit Copilot-Modell
**Als** authentifizierter Copilot-Nutzer
**moechte ich** ein Copilot-Modell im Chat auswaehlen und nutzen koennen
**um** meine Premium Requests fuer Vault-Aufgaben zu verwenden

### Story 2: Tool Calling ueber Copilot
**Als** Nutzer im Agent-Mode
**moechte ich** dass der Agent ueber Copilot-Modelle Tools aufrufen kann
**um** Vault-Operationen (Dateien lesen/schreiben, Suche etc.) durchzufuehren

### Story 3: Streaming-Antworten
**Als** Nutzer
**moechte ich** die Antwort des Modells Wort fuer Wort sehen
**um** nicht auf die komplette Antwort warten zu muessen

### Story 4: Premium Requests aufgebraucht
**Als** Nutzer der sein Monthly Limit erreicht hat
**moechte ich** eine klare Fehlermeldung sehen
**um** zu wissen dass ich auf ein anderes Modell wechseln muss

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Modell antwortet auf Fragen und fuehrt Anweisungen aus | Vergleichbar mit direktem Provider-Zugang | A/B User-Test |
| SC-02 | Agent kann Vault-Werkzeuge nutzen | Alle Tool-Gruppen (read, vault, edit) funktional | Funktionstest |
| SC-03 | Antworten erscheinen fliessend, nicht blockweise | Woerter erscheinen progressiv | Visueller Test |
| SC-04 | Bei Limit-Ueberschreitung erhaelt User klare Handlungsanweisung | Meldung mit konkretem naechsten Schritt | User-Test |
| SC-05 | Bestehende Provider funktionieren unveraendert | Keine Regression | Regressions-Tests |
| SC-06 | Modelle verschiedener Anbieter (Claude, GPT etc.) via Copilot nutzbar | Multi-Family Support | Cross-Model Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **First Token Latency**: Kein zusaetzlicher Overhead gegenueber direktem API-Zugriff (ausser Token-Refresh wenn noetig)
- **Streaming**: Chunk-basiert, kein Buffering der gesamten Antwort

### Security
- **Authorization Header**: Bearer Token pro Request, aus Auth-Service bezogen
- **Keine Token-Persistenz im Provider**: Provider fragt Token pro Request vom Auth-Service an

### Compatibility
- **ApiHandler Interface**: Muss `createMessage()`, `getModel()` vollstaendig implementieren
- **Content Normalisierung**: Claude-Modelle ueber Copilot senden Content als Array statt String in Streaming-Deltas. Muss normalisiert werden.
- **Missing Role Handling**: Copilot API laesst `delta.role` bei Claude-Streaming teilweise weg. Muss auf "assistant" defaulten.
- **Copilot Headers**: `User-Agent`, `Editor-Version`, `Editor-Plugin-Version`, `Copilot-Integration-Id`, `Openai-Intent`, `X-GitHub-Api-Version`

### Reliability
- **401 Retry**: Bei 401 einmal Token refreshen und Retry, dann Error
- **Error Classification**: HTTP Status → spezifische Fehlermeldungen (429 = Rate Limit, 403 = No Subscription, 400 = Model not enabled)

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1: Content-Normalisierung im Stream-Handler**
- **Warum ASR**: Claude via Copilot sendet `delta.content` als Array von Content-Parts statt als String. Ohne Normalisierung werden alle Text-Chunks verworfen.
- **Impact**: Erfordert Copilot-spezifischen Stream-Parser oder Normalisierungs-Layer
- **Quality Attribute**: Correctness, Interoperability

**CRITICAL ASR #2: Copilot-spezifische Headers**
- **Warum ASR**: Ohne korrekte Headers (User-Agent, Editor-Version etc.) lehnt Copilot API Requests ab
- **Impact**: Headers muessen bei jedem Request mitgesendet werden
- **Quality Attribute**: Compliance

**MODERATE ASR #3: requestUrl statt OpenAI SDK**
- **Warum ASR**: Die bestehende OpenAI Provider Implementation nutzt das `openai` NPM SDK. Copilot erfordert Custom Headers die das SDK nicht unterstuetzt + requestUrl Pflicht.
- **Impact**: Copilot Provider muss Streaming manuell ueber requestUrl implementieren oder einen Adapter nutzen
- **Quality Attribute**: Compliance, Maintainability

### Constraints
- **Kein `fetch()`**: Alle HTTP-Requests ueber Obsidians `requestUrl`
- **Keine `any` types**: Strikte TypeScript Typisierung
- **Kein LangChain**: Keine Abhaengigkeit von LangChain (anders als Referenz-Implementierung)

### Open Questions fuer Architekt
- requestUrl-basiertes SSE Streaming: requestUrl gibt `ArrayBuffer` zurueck, kein ReadableStream. Wie Streaming implementieren? Alternative: SDKs fetch-Funktion ersetzen?
- Eigener `GitHubCopilotProvider` oder Erweiterung des `OpenAiProvider` mit Copilot-Modus?
- Content-Normalisierung: im Provider oder als generischer Stream-Transformer?

---

## Definition of Done

### Functional
- [ ] `createMessage()` implementiert mit Streaming
- [ ] Tool Calling funktioniert (function call + function result roundtrip)
- [ ] Verschiedene Copilot-Modelle nutzbar (Claude, GPT, Gemini)
- [ ] Content-Normalisierung fuer Claude-Content-Arrays
- [ ] Missing-Role-Handling fuer Claude-Streaming-Deltas
- [ ] Error Handling: 401 (retry), 429 (rate limit), 403 (no sub), 400 (model policy)
- [ ] `getModel()` gibt korrekte ModelInfo zurueck

### Quality
- [ ] Unit Tests (Content-Normalisierung, Error-Classification)
- [ ] Integration Test: Chat E2E mit Copilot-Modell (manuell)
- [ ] Regression-Test: bestehende Provider unveraendert
- [ ] Review-Bot Compliance

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-12-01**: Auth & Token Management (muss zuerst implementiert werden)
- **ApiHandler Interface**: Stabil, keine Aenderungen noetig

## Assumptions

- Copilot `/chat/completions` Endpoint ist OpenAI-kompatibel (mit Extra-Headers)
- Copilot API unterstuetzt `tool_choice` und `tools` Parameter
- Streaming funktioniert mit SSE-Format (data: chunks)

## Out of Scope

- Anthropic-native Extended Thinking ueber Copilot (unklar ob unterstuetzt)
- Prompt Caching (Copilot-spezifisch, nicht dokumentiert)
- `classifyText()` Methode (optional, kann spaeter ergaenzt werden)
