# ADR-41: Kilo Auth and Session Architecture

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

Kilo Gateway nutzt einen proprietaeren Device-Authorization-Flow mit Polling sowie alternativ Bearer Tokens aus dem Kilo-Dashboard. Zusaetzlich kann fuer Team- und Enterprise-Nutzer ein Organisationskontext aktiv sein, der als Request-Header uebertragen wird. Die Architektur muss beide Auth-Modi auf denselben Laufzeitpfad abbilden und Tokens sicher speichern.

**Triggering ASR:**
- Critical ASR-01: Separate Kilo Auth and Session Service
- Moderate ASR-03: Unified Session Model for Device Auth and Manual Token
- Quality Attributes: Security, Reliability, Maintainability

**Problem:** Wo leben Auth-Lifecycle, Session-State und Organisationskontext, sodass Device Auth, Manual Token, Disconnect und Re-Validation konsistent funktionieren?

## Decision Drivers

- **Security:** Tokens duerfen nie im Klartext persistiert oder geloggt werden
- **Einheitlichkeit:** Device Auth und Manual Token sollen denselben Chat- und Embedding-Pfad bedienen
- **Wartbarkeit:** UI darf den Auth-Lifecycle nicht selbst orchestrieren muessen
- **Robustheit:** Polling, Revalidation und Logout muessen kontrollierbar sein
- **Kontexttreue:** Organisationskontext ist Teil der Session, nicht bloesser UI-Zustand

## Considered Options

### Option 1: Auth-Zustand direkt in Settings/UI verwalten
- UI startet Device Auth, pollt direkt und speichert Token-/Org-Werte unmittelbar in Settings-Feldern
- Pro: Wenig neue Klassen
- Pro: Direkter Datenfluss im Settings-Dialog
- Con: UI uebernimmt Infrastrukturverantwortung
- Con: Polling, Reset und Fehlerbehandlung werden schwer testbar
- Con: Manual Token und Device Auth divergieren leicht

### Option 2: Eigener KiloAuthService mit vereinheitlichtem Session-Modell
- Service kapselt Device Auth, Manual Token Validation, Profil-/Defaults-Lookups und Session-State
- Geheimnisse liegen verschluesselt im SafeStorageService, nicht-sensitive Metadaten in Settings
- Pro: Einheitlicher Laufzeitpfad fuer beide Auth-Modi
- Pro: Polling, Reset, Validierung und Org-Kontext zentral testbar
- Pro: Wiederverwendbar fuer Chat, Modell-Listing und Embeddings
- Con: Zusätzlicher Service und Lebenszyklusmanagement im Plugin
- Con: State-Synchronisation zwischen Settings und Runtime muss sauber definiert werden

### Option 3: Nur manueller Token-Modus im MVP
- Device Auth wird verworfen, nur API-Token aus dem Dashboard werden unterstuetzt
- Pro: Deutlich geringerer Implementierungsaufwand
- Pro: Kein Polling und kein Browser-Flow
- Con: Verfehlt die Produktanforderung nach einfachem Login analog zum Kilo-Standardflow
- Con: Schlechtere UX fuer die Hauptzielgruppe
- Con: Inkonsistent zu BA und Requirements

## Decision

**Vorgeschlagene Option:** Option 2 - Eigener KiloAuthService mit vereinheitlichtem Session-Modell

**Begruendung:**
Kilo-Authentifizierung ist nicht nur eine Eingabemaske fuer einen API-Key, sondern ein eigener Lifecycle mit Browser-Start, Polling, Profil-Fetch, optionaler Organisationswahl und spaeterer Revalidierung. Diese Logik gehoert in einen dedizierten Service. Ein gemeinsames Session-Modell stellt sicher, dass Device Auth und Manual Token intern dieselbe Struktur liefern: Token, Auth-Modus, optionale Organization ID, Profil-Metadaten und Validierungsstatus.

**Vorgeschlagenes Session-Modell:**
- authMode: `device-auth` oder `manual-token`
- encryptedTokenRef: im SafeStorageService
- organizationId: optional
- userEmail oder accountLabel: optional fuer UI-Status
- expiresAt: optional, falls Kilo-Token zeitlich begrenzt ist
- lastValidatedAt: fuer Revalidation und Statusanzeige

## Consequences

### Positive
- Ein Auth-Service bedient Chat, Modelle, Organisationen und Embeddings konsistent
- Disconnect und Reset koennen alle Session-Artefakte zentral loeschen
- UI bleibt schlanker und zeigt nur Status plus Aktionen
- Kilo-spezifische Revalidation kann spaeter erweitert werden ohne Provider-Umbauten

### Negative
- Ein weiterer Runtime-Service muss in den Plugin-Lifecycle integriert werden
- Settings und Runtime-State brauchen klare Synchronisationsgrenzen

### Risks
- **Polling-Leaks:** Device-Auth-Polling koennte nach View-Schliessung weiterlaufen. Mitigation: AbortController und Reset-Hooks im Service.
- **Token-Scope-Unterschiede:** Manuelle Tokens und Device-Auth-Tokens koennten sich in Laufzeit und Rechten unterscheiden. Mitigation: gemeinsames Session-Modell mit capability validation nach Login.

## Implementation Notes

- Service-Naehe zu SafeStorageService im Security- oder Auth-Bereich
- SafeStorage speichert nur Secrets, nicht-sensitive Statusfelder bleiben in normalen Settings
- Disconnect loescht Token, Org-Kontext, Validierungsstatus und laufende Polling-Prozesse
- Validierung vor Speichern ueber Profil- oder Defaults-Endpoint
- Organisation wird als Teil der Session persistiert, nicht als lose UI-Auswahl

## Related Decisions

- ADR-19: Electron SafeStorage
- ADR-40: Kilo Provider Architecture
- ADR-42: Kilo Metadata Discovery Strategy

## References

- FEAT-13-01: Kilo Auth and Session Management
- FEAT-13-05: Kilo Organization Context
- FEAT-13-07: Kilo Manual Token Mode
- Kilo Device Auth reference flow in forked-kilocode
