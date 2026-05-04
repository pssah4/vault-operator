# Feature: Kilo Manual Token Mode

> **Feature ID**: FEAT-13-07
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Bietet einen alternativen manuellen Token-Modus fuer Kilo Gateway. Power User koennen einen bestehenden Kilo-API-Token direkt hinterlegen, ohne den Device-Auth-Flow zu verwenden. Dieser Modus dient als Fallback, Debug-Hilfe und erweiterte Option fuer spezielle Deployments oder Entwicklungsumgebungen.

## Benefits Hypothesis

**Wir glauben dass** ein manueller Token-Fallback
**Folgende messbare Outcomes liefert:**
- Power User und Edge Cases bleiben nicht am Browser-Flow haengen
- Support und Debugging werden einfacher

**Wir wissen dass wir erfolgreich sind wenn:**
- Nutzer Kilo auch ohne Device Auth aktivieren koennen
- Der Fallback denselben Funktionsumfang fuer Chat und Modellwahl bietet

## User Stories

### Story 1: Token manuell hinterlegen
**Als** Power User
**moechte ich** meinen Kilo-Token direkt eintragen
**um** den Browser-Login zu umgehen

### Story 2: Token validieren
**Als** Nutzer
**moechte ich** vor dem Speichern wissen, ob mein Token gueltig ist
**um** keine defekte Konfiguration zu speichern

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Nutzer kann Kilo ohne Browser-Login aktivieren | End-to-End erfolgreich | Funktions-Test |
| SC-02 | Ungueltige Zugangsdaten werden frueh erkannt | Klare Validierung | User-Test |
| SC-03 | Manueller Modus funktioniert gleichwertig zum Login-Modus | Chat und Modellwahl funktional | Integrationstest |

---

## Technical NFRs (fuer Architekt)

### Security
- **Token Storage**: Manuell eingetragene Tokens ebenfalls ueber SafeStorageService speichern

### Reliability
- **Validation Step**: Profil- oder Defaults-Request zur Tokenpruefung vor finalem Speichern

### UX
- **Advanced Mode**: Manueller Token-Modus nicht als Standardflow fuer normale Nutzer

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

MODERATE ASR #1: Gemeinsame Session-Abstraktion fuer beide Auth-Modi
- **Warum ASR**: Device Auth und Manual Token sollen denselben Laufzeitpfad bedienen
- **Impact**: Session-State muss auth-modusunabhaengig funktionieren
- **Quality Attribute**: Maintainability

### Open Questions fuer Architekt
- Soll der manuelle Modus als separater Feature-Flag oder nur als UI-Advanced-Option eingeblendet werden?
- Welche minimale Validierung reicht vor dem Speichern aus?

---

## Definition of Done

### Functional
- [ ] Manueller Token kann eingegeben und gespeichert werden
- [ ] Token wird vor Nutzung validiert
- [ ] Chat und Modelllisten funktionieren mit manuellem Token
- [ ] Disconnect entfernt auch manuell gesetzte Tokens

### Quality
- [ ] Keine Klartext-Speicherung
- [ ] Gleiche Fehlerbehandlung wie im Device-Auth-Modus

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)

---

## Dependencies

- **FEAT-13-01**: Session-State und Secure Storage
- **FEAT-13-03**: UI Integration

## Assumptions

- Ein manuell gesetzter Token ist funktional gleichwertig zu einem per Device Auth erhaltenen Token

## Out of Scope

- Verwaltung mehrerer Tokens parallel
