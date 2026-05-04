# Feature: Kilo Gateway Chat Provider

> **Feature ID**: FEAT-13-02
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Bindet Kilo Gateway als Chat-Provider fuer Obsilo an. Der Provider nutzt die OpenAI-kompatible Gateway-API fuer Streaming, Tool Calling und Modellwechsel. Im Gegensatz zu GitHub Copilot ist kein proprietaerer Chat-Endpoint mit Spezialformat notwendig, sondern ein Gateway-Zugang mit Kilo-spezifischen Headern und Session-Kontext.

## Benefits Hypothesis

**Wir glauben dass** ein zentraler Gateway-Zugang fuer viele Modelle
**Folgende messbare Outcomes liefert:**
- Nutzer koennen mehrere Modellfamilien ueber einen einzigen Zugang verwenden
- Bestehende Agent-Funktionen (Tools, Streaming, Multi-Turn) funktionieren auch ueber Kilo

**Wir wissen dass wir erfolgreich sind wenn:**
- Tool Calling ueber Kilo zuverlaessig funktioniert
- Nutzer keinen funktionalen Unterschied zu bestehenden Providern wahrnehmen

## User Stories

### Story 1: Mit Kilo-Modell chatten
**Als** eingeloggter Kilo-Nutzer
**moechte ich** ein Kilo-Gateway-Modell fuer meine Unterhaltung waehlen
**um** meine Aufgaben ohne direkten Einzelprovider zu bearbeiten

### Story 2: Tools ueber Kilo nutzen
**Als** Nutzer im Agent-Mode
**moechte ich** dass der Agent ueber Kilo Tools aufrufen kann
**um** Vault-Aktionen auch ueber den Gateway-Zugang auszufuehren

### Story 3: Streaming erleben
**Als** Nutzer
**moechte ich** Antworten fortlaufend sehen
**um** waehrend der Generierung bereits weiterarbeiten zu koennen

### Story 4: Kilo-Fehler verstehen
**Als** Nutzer
**moechte ich** bei Limits, Auth- oder Org-Problemen klare Hinweise erhalten
**um** das richtige Modell oder den richtigen Zugang zu waehlen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Nutzer kann mit Kilo-Modellen chatten | Antwortqualitaet vergleichbar mit anderen Providern | User-Test |
| SC-02 | Agent kann seine Werkzeuge auch ueber Kilo nutzen | Tool Calling End-to-End funktional | Funktionstest |
| SC-03 | Antworten erscheinen fortlaufend | Keine reine Blockausgabe | Visueller Test |
| SC-04 | Fehlermeldungen sind handlungsorientiert | Nutzer weiss, was als Naechstes zu tun ist | User-Test |
| SC-05 | Bestehende Provider bleiben unveraendert | Keine Regression | Regressionstest |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Streaming**: Kilo-Gateway-Streaming ohne zusaetzliches Buffering
- **First Token Latency**: Kein signifikanter Overhead gegenueber anderen OpenAI-kompatiblen Providern

### Security
- **Authorization**: Bearer Token pro Request aus sicherem Speicher
- **Org Header Isolation**: Org-Header nur fuer Kilo-Requests setzen

### Compatibility
- **OpenAI-Compatible API**: Nutzung der bestehenden OpenAI-kompatiblen Request-Struktur
- **Kilo Headers**: Optional `X-KiloCode-OrganizationId`, `X-KiloCode-Version`, `x-kilocode-mode`
- **Virtual Model**: `kilo/auto` muss als valider Modellwert behandelt werden

### Reliability
- **Error Mapping**: Auth-, Limit- und Org-Fehler sauber unterscheiden
- **Session Validation**: Ungueltiger Token fuehrt zu klarer Re-Auth-Aufforderung

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

CRITICAL ASR #1: Reuse des OpenAI-kompatiblen Pfads
- **Warum ASR**: Kilo Gateway ist OpenAI-kompatibel. Doppelte Provider-Logik waere unnötig und riskant.
- **Impact**: Entscheidung zwischen Konfigurations-Reuse oder dünnem dediziertem Wrapper
- **Quality Attribute**: Maintainability, Simplicity

MODERATE ASR #2: Kilo-spezifische Header-Injektion
- **Warum ASR**: Org- und Mode-Kontext duerfen nur fuer Kilo-Requests gelten
- **Impact**: Provider- oder Request-Layer muss Header gezielt injizieren
- **Quality Attribute**: Correctness

### Constraints
- **Gateway Base URL**: `https://api.kilo.ai/api/gateway`
- **Keine Provider-Regression**: OpenAI-, OpenRouter- und Azure-Pfade duerfen nicht beeintraechtigt werden
- **Review-Bot Compliance**: Kein direktes `fetch()` im Plugin-Code

### Open Questions fuer Architekt
- Reicht eine Konfigurationsvariante des `OpenAiProvider`, oder braucht Kilo einen duennen dedizierten Wrapper?
- Soll `x-kilocode-mode` sofort unterstuetzt werden oder spaeter?

---

## Definition of Done

### Functional
- [ ] Chat Requests koennen ueber Kilo Gateway gesendet werden
- [ ] Streaming funktioniert im Chat
- [ ] Tool Calling funktioniert ueber Kilo
- [ ] Fehler werden fuer Auth, Org und Limits korrekt gemappt
- [ ] `kilo/auto` kann als Modell genutzt werden

### Quality
- [ ] Regressionstests fuer bestehende OpenAI-kompatible Provider
- [ ] Manuelle E2E-Verifikation mit mindestens zwei Kilo-Modellen
- [ ] Kilo-spezifische Header nur bei Kilo aktiv

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-13-01**: Auth & Session Management
- **Provider Factory**: buildApiHandler / OpenAI-kompatibler Pfad

## Assumptions

- Kilo-Gateway-Modelle unterstuetzen das benoetigte Chat- und Tool-Calling-Verhalten
- Die OpenAI-kompatible API bleibt stabil

## Out of Scope

- Embeddings (separates Feature)
- Organisationen-UI (separates Feature)
