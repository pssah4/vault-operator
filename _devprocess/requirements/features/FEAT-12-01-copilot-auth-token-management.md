# Feature: GitHub Copilot Auth & Token Management

> **Feature ID**: FEAT-12-01
> **Epic**: EPIC-12 - GitHub Copilot LLM Provider Integration
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

OAuth Device Code Flow fuer GitHub Copilot Authentifizierung mit vollstaendigem Token-Lifecycle-Management. Implementiert die dreistufige Token-Kette (Device Code → Access Token → Copilot Token) sowie automatischen Token-Refresh, sichere Speicherung und Disconnect-Funktionalitaet. Bildet die Grundlage fuer alle Copilot-Provider-Funktionen.

## Benefits Hypothesis

**Wir glauben dass** ein nahtloser einmaliger GitHub-Login mit automatischem Token-Management
**Folgende messbare Outcomes liefert:**
- Nutzer muessen keine API Keys manuell verwalten
- Token-Erneuerung funktioniert automatisch ohne User-Interaktion

**Wir wissen dass wir erfolgreich sind wenn:**
- >95% der Auth-Versuche erfolgreich abgeschlossen werden
- >99% der Token-Refreshs ohne manuellen Eingriff funktionieren

## User Stories

### Story 1: GitHub-Login starten
**Als** Obsilo-Nutzer mit GitHub Copilot Abo
**moechte ich** mich per Knopfdruck mit GitHub verbinden
**um** meine Premium Requests in Obsilo nutzen zu koennen

### Story 2: Automatischer Token-Refresh
**Als** verbundener Copilot-Nutzer
**moechte ich** dass meine Sitzung automatisch erneuert wird
**um** nicht alle Stunde manuell neu einloggen zu muessen

### Story 3: Verbindung trennen
**Als** Nutzer der Copilot-Zugang widerrufen moechte
**moechte ich** die Verbindung per Knopfdruck trennen koennen
**um** keine Tokens mehr auf meinem Geraet zu haben

### Story 4: Klare Fehlermeldung bei Auth-Problemen
**Als** Nutzer dessen Token abgelaufen ist
**moechte ich** eine verstaendliche Meldung mit Handlungsanweisung sehen
**um** zu wissen was ich tun muss (z.B. neu einloggen oder Abo pruefen)

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | User kann sich mit einem Klick + Code-Eingabe bei GitHub anmelden | Abschluss in <60 Sekunden | User-Test |
| SC-02 | Nach erfolgreicher Anmeldung bleibt Verbindung aktiv ohne erneutes Login | Mindestens 30 Tage ohne manuelles Re-Login | Monitoring |
| SC-03 | Verbindung kann vollstaendig getrennt werden | Alle gespeicherten Zugangsdaten entfernt | Verifikation |
| SC-04 | Bei Authentifizierungsproblemen erhaelt User eine verstaendliche Meldung | Meldung mit konkreter Handlungsanweisung | User-Test |
| SC-05 | Zugangsdaten werden sicher gespeichert | Nicht im Klartext einsehbar | Security Review |
| SC-06 | Optionale eigene Anwendungs-ID fuer Power User | Feld vorhanden und funktional | Funktions-Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Token Refresh**: <500ms fuer Copilot Token Refresh (kein sichtbarer Chat-Delay)
- **Auth Flow**: Device Code Request <2s, Token Polling mit konfiguriertem Interval (default 5s)

### Security
- **Token Storage**: Access Token + Copilot Token ueber SafeStorageService (Electron OS-Keychain)
- **Token Scope**: Nur `read:user` Scope angefragt (minimal privilege)
- **No Plaintext Logging**: Tokens duerfen nie in console.debug/warn/error ausgegeben werden
- **Generation Counter**: Verhindert Race Conditions bei Auth-Reset waehrend laufender Async-Operationen

### Reliability
- **Retry bei 401**: Einmal automatisch Token refreshen, dann Error an User
- **Polling Cancellation**: AbortController fuer laufende Polling-Operationen
- **Refresh Attempt Limit**: Max 3 Refresh-Versuche bevor Error

### Availability
- **Graceful Degradation**: Wenn safeStorage nicht verfuegbar (Mobile), Auth-Feature deaktiviert mit Hinweis

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1: Token-Lifecycle als Singleton-Service**
- **Warum ASR**: Token-State muss ueber gesamte Plugin-Laufzeit konsistent sein. Mehrfache Refresh-Aufrufe muessen serialisiert werden.
- **Impact**: Bestimmt ob eigener Service oder Teil des Providers
- **Quality Attribute**: Reliability, Concurrency

**CRITICAL ASR #2: SafeStorageService-Integration**
- **Warum ASR**: Tokens muessen verschluesselt gespeichert werden. Access Token ist langlebig und besonders schuetzenswert.
- **Impact**: Erfordert Erweiterung der Settings-Struktur um Copilot-Token-Felder
- **Quality Attribute**: Security

**MODERATE ASR #3: requestUrl statt fetch**
- **Warum ASR**: Obsidian Community Plugin Review erfordert `requestUrl`. OAuth Device Code Flow mit URL-encoded Body muss darauf aufbauen.
- **Impact**: Copilot API Requests muessen ueber requestUrl laufen (nicht OpenAI SDK)
- **Quality Attribute**: Compliance

### Constraints
- **Review-Bot Compliance**: Kein `fetch()`, keine floating promises, keine `any` types
- **Client ID**: VSCode OAuth Client ID als Default, Custom-Feld optional
- **Obsidian API**: HTTP-Requests nur ueber `requestUrl`

### Open Questions fuer Architekt
- Eigener `GitHubCopilotAuthService` Singleton oder Token-Management direkt im Provider?
- Copilot-Token-Felder in `ObsidianAgentSettings` direkt (flach) oder als verschachteltes `CopilotAuthState`-Objekt?
- Soll `requestUrl` direkt genutzt oder hinter einem Adapter abstrahiert werden?

---

## Definition of Done

### Functional
- [ ] Device Code Flow startet und zeigt User Code + Verification URL
- [ ] Polling wartet korrekt auf User-Autorisierung
- [ ] Access Token wird nach Autorisierung empfangen und gespeichert
- [ ] Copilot Token wird aus Access Token abgeleitet
- [ ] Automatischer Token-Refresh vor Ablauf (~1min Buffer)
- [ ] Disconnect loescht alle gespeicherten Tokens
- [ ] Custom Client ID Feld funktional
- [ ] Fehler-Szenarien: abgelaufener Code, verweigerte Auth, kein Abo

### Quality
- [ ] Unit Tests (Token-Refresh-Logik, Expiry-Parsing)
- [ ] Integration Test: Auth-Flow E2E (manuell)
- [ ] Security Review: keine Tokens in Logs
- [ ] Review-Bot Compliance: kein fetch(), keine any types

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **SafeStorageService**: Bereits implementiert, muss nur genutzt werden
- **ObsidianAgentSettings**: Neue Felder fuer Copilot-Tokens erforderlich

## Assumptions

- GitHub OAuth Device Code Flow funktioniert mit `requestUrl` (url-encoded POST)
- Copilot Token Endpoint (`/copilot_internal/v2/token`) bleibt stabil
- SafeStorageService kann mehrere Werte gleichzeitig speichern

## Out of Scope

- Mobile Auth (safeStorage nicht verfuegbar)
- OAuth App Registrierung (nutzt VSCode Client ID)
- Multi-Account-Support (ein GitHub-Account pro Plugin-Instanz)
