# Feature: Kilo Organization Context

> **Feature ID**: FEAT-13-05
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Ermoeglicht die Auswahl und Nutzung eines Kilo-Organisationskontexts fuer Team- und Enterprise-Nutzer. Nach erfolgreichem Login koennen vorhandene Organisationen geladen, eine Auswahl getroffen und der passende Kontext bei Gateway-Requests mitgesendet werden.

## Benefits Hypothesis

**Wir glauben dass** Organisationskontext in Vault Operator
**Folgende messbare Outcomes liefert:**
- Team-Nutzer koennen ihre richtigen Modelle und Richtlinien verwenden
- Kilo-Zugang wird auch fuer Enterprise-Nutzer praktisch nutzbar

**Wir wissen dass wir erfolgreich sind wenn:**
- Team-Nutzer ihren Org-Kontext erfolgreich waehlen und nutzen koennen
- Requests im richtigen Tenant laufen

## User Stories

### Story 1: Organisation waehlen
**Als** Team-Nutzer
**moechte ich** nach dem Login meine Organisation waehlen
**um** im richtigen Kontext zu arbeiten

### Story 2: Aktiven Kontext sehen
**Als** Nutzer
**moechte ich** sehen, welche Organisation aktiv ist
**um** Verwechslungen zu vermeiden

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Team-Nutzer koennen eine Organisation auswaehlen | >90% erfolgreicher Abschluss | User-Test |
| SC-02 | Aktiver Kontext ist sichtbar | Keine versteckten Tenants | UI-Review |
| SC-03 | Requests laufen im richtigen organisatorischen Rahmen | Korrekte Richtlinien und Modelle | Integrationstest |

---

## Technical NFRs (fuer Architekt)

### Security
- **Header Isolation**: `X-KiloCode-OrganizationId` nur bei Kilo-Requests

### Reliability
- **Stale Context Handling**: Ungueltige Organisation klar erkennen und Reset ermoeglichen

### Compatibility
- **Profile Lookup**: Organisationsdaten aus Kilo-Profil oder Folge-Endpoints ableiten

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

MODERATE ASR #1: Organisationskontext als Teil des Session-Zustands
- **Warum ASR**: Org-Kontext beeinflusst alle Kilo-Requests und darf nicht lose an einzelnen Requests haengen
- **Impact**: Persistenz und Sichtbarkeit im Session-State notwendig
- **Quality Attribute**: Correctness

### Open Questions fuer Architekt
- Soll die Organisationsauswahl direkt nach Auth erfolgen oder erst beim ersten Kilo-Modell?
- Wie wird mit geaenderten oder entfernten Organisationen umgegangen?

---

## Definition of Done

### Functional
- [ ] Organisationen koennen geladen und angezeigt werden
- [ ] Aktive Organisation kann gewaehlt und gespeichert werden
- [ ] Header wird bei Requests gesetzt
- [ ] Aktiver Kontext ist im UI sichtbar

### Quality
- [ ] Falscher oder veralteter Org-Kontext fuehrt zu klarer Fehlermeldung

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)

---

## Dependencies

- **FEAT-13-01**: Auth & Session Management
- **FEAT-13-03**: Settings UI Integration

## Assumptions

- Kilo liefert Organisationsinformationen nach erfolgreicher Auth

## Out of Scope

- Team-Management oder Organisationsadministration
