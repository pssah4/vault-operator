# Feature: Kilo Auth & Session Management

> **Feature ID**: FEAT-13-01
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Implementiert den Kilo-spezifischen Device-Authorization-Flow fuer Vault Operator inklusive Session-Verwaltung, sicherer Token-Speicherung, optionalem Logout und grundlegender Statuspruefung. Der Flow startet browserbasiert, pollt die Kilo-Endpunkte bis zur Autorisierung und speichert danach den Zugang fuer die weitere Gateway-Nutzung.

## Benefits Hypothesis

**Wir glauben dass** ein einfacher browsergestuetzter Login in Kilo
**Folgende messbare Outcomes liefert:**
- Nutzer koennen ohne manuelle Provider-Konfiguration ihren Kilo-Zugang in Vault Operator aktivieren
- Der Zugang bleibt zwischen Sitzungen erhalten und muss nicht wiederholt neu eingerichtet werden

**Wir wissen dass wir erfolgreich sind wenn:**
- >95% der gestarteten Auth-Flows erfolgreich abgeschlossen werden
- Nutzer den Zugang ohne manuelles Token-Handling aktivieren koennen

## User Stories

### Story 1: Login per Browser starten
**Als** Vault Operator-Nutzer mit Kilo-Account
**moechte ich** den Kilo-Login per Klick starten
**um** mein Konto ohne manuelle Token-Kopie zu verbinden

### Story 2: Verbindung beibehalten
**Als** bereits eingeloggter Nutzer
**moechte ich** dass mein Kilo-Zugang gespeichert bleibt
**um** nicht bei jedem Start erneut authentifizieren zu muessen

### Story 3: Verbindung trennen
**Als** Nutzer
**moechte ich** meinen Kilo-Zugang trennen koennen
**um** mein Geraet oder meinen Account sauber zu entkoppeln

### Story 4: Auth-Fehler verstehen
**Als** Nutzer
**moechte ich** bei Auth-Problemen klare Meldungen sehen
**um** zu wissen ob ich erneut einloggen oder etwas anderes tun muss

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | User kann den Login mit wenigen Schritten starten und abschliessen | Abschluss in <60 Sekunden | User-Test |
| SC-02 | Ein bestehender Login bleibt zwischen App-Neustarts erhalten | Kein erneuter Login im Normalfall | Funktions-Test |
| SC-03 | Verbindung kann vollstaendig getrennt werden | Zugangsdaten und Status entfernt | Verifikation |
| SC-04 | Fehlermeldungen enthalten konkrete Handlungsanweisungen | Keine unklaren Fehlzustaende | User-Test |
| SC-05 | Zugangsdaten werden sicher gespeichert | Nicht im Klartext lesbar | Security Review |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Device Auth Start**: Initialer Auth-Request <2s
- **Polling Interval**: Default 3s analog zur Kilo-Referenz

### Security
- **Token Storage**: Kilo Token ueber SafeStorageService verschluesseln
- **No Plaintext Logging**: Token nie loggen
- **Session State**: Auth-Status und User-Info getrennt von Secret speichern

### Reliability
- **Polling Lifecycle**: Polling muss abgebrochen werden koennen
- **Expired / Denied Handling**: Unterschiedliche Status klar behandeln
- **Graceful Cleanup**: Beim Cancel oder Logout alle laufenden Auth-Prozesse sauber aufraeumen

### Compatibility
- **Obsidian Integration**: Browser oeffnen ueber passenden Obsidian-/Electron-Mechanismus
- **Review-Bot Compliance**: Kein direktes `fetch()` im Plugin-Code

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

CRITICAL ASR #1: Eigener Kilo Auth Service
- **Warum ASR**: Der Auth-Flow ist Kilo-spezifisch und nicht identisch mit API-Key-Providern
- **Impact**: Bestimmt die Trennung zwischen Auth-Lifecycle und Gateway-Nutzung
- **Quality Attribute**: Reliability, Maintainability

CRITICAL ASR #2: Sichere Persistenz des Kilo Tokens
- **Warum ASR**: Der Token ist die Grundlage fuer alle Kilo-Requests und darf nicht im Klartext gespeichert werden
- **Impact**: SafeStorageService-Integration und neue Settings-Felder erforderlich
- **Quality Attribute**: Security

MODERATE ASR #3: Polling-Status fuer UI
- **Warum ASR**: Device-Auth ist ein zeitbasiertes, usergesteuertes Login-Verfahren. Die UI braucht Status-Updates.
- **Impact**: Event- oder Callback-basierter Auth-Service sinnvoll
- **Quality Attribute**: UX, Maintainability

### Constraints
- **Auth-Endpunkte**: Kilo-spezifische Device-Auth-Endpunkte verwenden
- **Kein paralleles Auth-System**: Muss in bestehende Settings-UI eingebettet werden
- **Token-Format**: Kilo-Token als Bearer-Token fuer Gateway-Nutzung

### Open Questions fuer Architekt
- Eigenes Event-basiertes Service-Objekt wie in Kilo oder einfacherer Promise-basierter Service fuer Vault Operator?
- Welche User-Metadaten sollen nach erfolgreichem Login gespeichert werden (Email, Display Name, nur Status)?

---

## Definition of Done

### Functional
- [ ] Device Auth kann gestartet werden
- [ ] Browser oeffnet die Kilo-Verifikation
- [ ] Polling erkennt approved, denied und expired korrekt
- [ ] Token wird nach Erfolg gespeichert
- [ ] Logout/Reset entfernt den gespeicherten Zugang
- [ ] Auth-Status ist fuer die UI verfuegbar

### Quality
- [ ] Unit Tests fuer Statuswechsel und Fehlerfaelle
- [ ] Manuelle E2E-Verifikation des Auth-Flows
- [ ] Keine Klartext-Tokens in Logs oder Settings

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **SafeStorageService**: Muss fuer Token-Verschluesselung genutzt werden
- **Settings-UI**: Benoetigt Status- und Aktionsintegration

## Assumptions

- Device-Auth-Endpunkte bleiben stabil erreichbar
- Der gespeicherte Kilo-Token reicht fuer Gateway-Requests aus

## Out of Scope

- Manuelle Token-Eingabe (separates Feature)
- Organisationsauswahl (separates Feature)
