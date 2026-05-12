# ADR-40: Kilo Gateway Provider Architecture

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

Kilo Gateway soll als weiterer LLM Provider in Vault Operator integriert werden. Im Unterschied zu GitHub Copilot ist die Inferenzseite von Kilo OpenAI-kompatibel, waehrend Authentifizierung, Session-Aufbau und Organisationskontext proprietaer sind. Das zentrale Architekturproblem ist daher nicht die Chat-Completion-Semantik, sondern die saubere Trennung von Auth-Service, Request-Konfiguration und Provider-Auswahl.

**Triggering ASR:**
- Critical ASR-01: Separate Kilo Auth and Session Service
- Critical ASR-02: Reuse OpenAI-Compatible Request Path Where Possible
- Quality Attributes: Maintainability, Correctness, Delivery Speed

**Problem:** Soll Kilo nur als weitere Konfigurationsvariante des bestehenden OpenAI-Providers auftreten oder als eigener Provider-Typ mit delegierter Wiederverwendung des OpenAI-kompatiblen Request-Pfads?

## Decision Drivers

- **Wiederverwendung:** Chat, Streaming und Tool Calling sind bereits fuer OpenAI-kompatible APIs vorhanden
- **Isolation:** Kilo-spezifische Header, Modell-Discovery und Session-Validierung duerfen andere Provider nicht beeinflussen
- **Konsistenz:** Nutzer sollen Kilo als klaren Provider in der UI sehen, nicht als versteckte OpenAI-Variante
- **Erweiterbarkeit:** Org-Kontext, Manual Token und `kilo/auto` brauchen eigenen fachlichen Ort
- **Risiko-Reduktion:** Regressionen im generischen OpenAI-Pfad muessen begrenzt bleiben

## Considered Options

### Option 1: Reine OpenAI-Konfigurationsvariante
- Kilo wird nur ueber Base URL, API-Key und Zusatzheader in den bestehenden OpenAI-Provider eingespeist
- Pro: Minimale Anzahl neuer Dateien
- Pro: Hohe Code-Wiederverwendung
- Con: Kilo-spezifische Fachlogik wird in generische Providerpfade gedrueckt
- Con: UI, Modell-Discovery und Session-Validierung bekommen keinen klaren Verantwortungsbereich
- Con: Erhoehtes Regressionsrisiko fuer OpenAI, Azure, OpenRouter und Custom

### Option 2: Eigener KiloGatewayProvider mit delegierter OpenAI-kompatibler Inferenz
- Neuer Provider-Typ fuer Kilo in der Provider-Factory
- Nutzt intern denselben OpenAI-kompatiblen Request-Pfad oder gemeinsame Hilfsfunktionen fuer Chat, Streaming und Tool Calling
- Pro: Klare fachliche Abgrenzung zwischen Kilo und generischen OpenAI-kompatiblen Providern
- Pro: Kilo-spezifische Header, `kilo/auto` und Fehlermapping koennen lokal gekapselt werden
- Pro: Hohe Wiederverwendung ohne die UI-Semantik zu verwischen
- Con: Zusätzlicher Provider-Typ und begrenzte duplizierte Initialisierung
- Con: Braucht definierte gemeinsame Hilfsfunktionen oder einen duennen Adapterlayer

### Option 3: Vollstaendig eigener Provider-Stack ohne OpenAI-Reuse
- Kilo bekommt eigene Request-, Stream- und Tool-Call-Implementierung
- Pro: Maximale Kapselung
- Pro: Vollstaendige Freiheit fuer spaetere Kilo-Speziallogik
- Con: Unnoetige Doppelimplementierung eines bereits passenden Protokolls
- Con: Hoeherer Wartungs- und Testaufwand
- Con: Langsamerer Delivery-Pfad ohne klaren Mehrwert

## Decision

**Vorgeschlagene Option:** Option 2 - Eigener KiloGatewayProvider mit delegierter OpenAI-kompatibler Inferenz

**Begruendung:**
Kilo ist fachlich eigenstaendig, technisch aber bewusst OpenAI-kompatibel. Die beste Trennung entsteht daher durch einen eigenen Provider-Typ, der in der Provider-Factory explizit waehlbar ist, intern aber dieselben OpenAI-kompatiblen Streaming- und Tool-Calling-Bausteine nutzt. So bleiben UI, Settings, Fehlermapping und Kilo-spezifische Header lokal gekapselt, waehrend der Kern der Inferenzlogik nicht dupliziert wird.

**Architektur-Uebersicht:**

KiloGatewayProvider
- implementiert ApiHandler
- bezieht Session und Header aus KiloAuthService
- verwendet gemeinsamen OpenAI-kompatiblen Transport fuer chat completions
- behandelt `kilo/auto`, Org-Header und Kilo-Fehlermapping lokal

## Consequences

### Positive
- Saubere Provider-Semantik in UI und Factory
- Minimale Duplizierung des Streaming- und Tool-Calling-Pfads
- Kilo-spezifische Erweiterungen bleiben lokal und kontrollierbar
- Reduziertes Regressionsrisiko fuer bestehende OpenAI-kompatible Provider

### Negative
- Zusätzliche Provider-Klasse trotz OpenAI-Kompatibilitaet
- Gemeinsame Hilfslogik muss bewusst extrahiert oder sauber wiederverwendet werden

### Risks
- **Zu viel indirekte Wiederverwendung:** Wenn der bestehende OpenAI-Provider nicht modular genug ist, droht versteckte Kopplung. Mitigation: klare interne Shared Utilities statt ad hoc Imports quer durch Provider.
- **Verwirrung zwischen Provider-Typ und Protokoll-Typ:** Entwickler koennten Kilo spaeter wieder in den generischen Pfad zurueckdruecken. Mitigation: ADR dokumentiert die fachliche Trennung explizit.

## Implementation Notes

- Neuer Provider-Typ `kilo-gateway` in ProviderType und Provider-Factory
- Neue Provider-Datei neben openai.ts und anthropic.ts
- Gemeinsame OpenAI-kompatible Transportlogik nur dort teilen, wo keine Kilo-Fachlogik hineinleckt
- Header-Injektion auf Request-Ebene nur fuer Kilo-Requests
- `kilo/auto` bleibt ein valider Modellwert ohne Sonderbehandlung in der allgemeinen Modellvalidierung

## Related Decisions

- ADR-11: Multi-Provider API
- ADR-19: Electron SafeStorage
- ADR-41: Kilo Auth and Session Architecture
- ADR-42: Kilo Metadata Discovery Strategy

## References

- EPIC-13: Kilo Gateway LLM Provider Integration
- FEAT-13-02: Kilo Gateway Chat Provider
- FEAT-13-03: Kilo Settings UI Integration
- Architect Handoff: Kilo Gateway Provider
