# Feature: Kilo Settings UI Integration

> **Feature ID**: FEAT-13-03
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Integriert Kilo Gateway in die bestehende Settings UI. Kilo erscheint als weiterer Provider im Dropdown und zeigt bei Auswahl den passenden Login- beziehungsweise Token-Flow, Verbindungsstatus, optionalen Org-Kontext und die dynamische Modellwahl an. Die UX soll sich an den bestehenden Provider-Mustern orientieren und keine Paralleloberflaeche einfuehren.

## Benefits Hypothesis

**Wir glauben dass** eine konsistente Einbettung in die bestehende Provider-UI
**Folgende messbare Outcomes liefert:**
- Nutzer finden Kilo intuitiv an derselben Stelle wie andere Provider
- Die Einstiegshuerde fuer Gateway-Nutzer sinkt deutlich

**Wir wissen dass wir erfolgreich sind wenn:**
- Nutzer den Kilo-Setup-Flow ohne Dokumentation durchlaufen koennen
- Support-Fragen zu Ort und Ablauf der Konfiguration minimal bleiben

## User Stories

### Story 1: Kilo im Dropdown sehen
**Als** Nutzer
**moechte ich** Kilo Gateway als Provider-Option sehen
**um** den Zugang dort zu konfigurieren, wo ich auch andere Provider verwalte

### Story 2: Login-Status erkennen
**Als** Nutzer
**moechte ich** sehen, ob mein Kilo-Zugang verbunden ist
**um** sofort zu wissen, ob die Verbindung aktiv ist

### Story 3: Modell nach Verbindung waehlen
**Als** Nutzer
**moechte ich** nach erfolgreicher Verbindung direkt ein Modell auswaehlen
**um** Kilo ohne weitere Umwege produktiv zu nutzen

### Story 4: Optional Token manuell eintragen
**Als** Power User
**moechte ich** alternativ einen Token manuell hinterlegen koennen
**um** Device Auth bei Bedarf zu umgehen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Kilo ist als normale Provider-Option sichtbar | Gleiches UI-Muster wie andere Provider | UI-Review |
| SC-02 | Setup ist ohne Dokumentation abschliessbar | <3 Minuten End-to-End | User-Test |
| SC-03 | Verbindungsstatus ist sofort erkennbar | Klare Statusanzeige | UI-Review |
| SC-04 | Nutzer koennen zwischen Login- und manuellem Token-Modus unterscheiden | Keine Verwirrung im Flow | User-Test |
| SC-05 | Bestehende Provider-UIs bleiben unveraendert | Kein visueller Regress | Regressionstest |

---

## Technical NFRs (fuer Architekt)

### UI/UX
- **Provider Dropdown**: Neuer Eintrag fuer Kilo Gateway
- **Conditional Fields**: Device Auth Button, manueller Token-Modus, Status, optional Org-Anzeige
- **Model Selection**: Async Modellliste nach Verbindung
- **Disconnect**: Sichtbare Aktion zum Trennen des Zugangs

### I18n
- Neue Strings fuer Provider-Label, Auth-Status, Connect/Disconnect, Org-Hinweise, Token-Modus

### Consistency
- Bestehendes ModelConfigModal bleibt das zentrale UI-Element
- Keine separate Settings-Seite fuer Kilo

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

MODERATE ASR #1: Conditional UI fuer mehrere Kilo-Zustaende
- **Warum ASR**: Die UI muss Login, manuellen Token, verbundenen Zustand und ggf. Organisationskontext darstellen
- **Impact**: Das Modal braucht mehr zustandsabhaengige Darstellung als bei einfachen API-Key-Providern
- **Quality Attribute**: UX, Maintainability

MODERATE ASR #2: Async Modell- und Organisationsdaten im Modal
- **Warum ASR**: Nach Auth sind nicht nur statische Felder sichtbar, sondern dynamische Daten erforderlich
- **Impact**: Modal braucht async Loading-/Refresh-Zustaende
- **Quality Attribute**: UX

### Constraints
- **Keine neue Tab**: Kilo integriert sich in den bestehenden Models-Tab
- **Review-Bot Compliance**: DOM nur ueber Obsidian APIs, keine Inline-Styles

### Open Questions fuer Architekt
- Soll der manuelle Token-Modus direkt sichtbar oder hinter "Advanced" versteckt sein?
- Wo wird die Organisationsanzeige im Modal am sinnvollsten platziert?

---

## Definition of Done

### Functional
- [ ] Kilo Gateway im Provider-Dropdown sichtbar
- [ ] Device-Auth-Connect-Button vorhanden
- [ ] Manueller Token-Modus verfuegbar
- [ ] Verbindungsstatus sichtbar
- [ ] Disconnect/Reset moeglich
- [ ] Modellwahl nach Verbindung moeglich
- [ ] Relevante Kilo-Strings i18n-faehig

### Quality
- [ ] Kein visueller oder funktionaler Regress fuer andere Provider
- [ ] Responsive und in Seitenleistenbreite nutzbar

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-13-01**: Auth-Service fuer Connect/Disconnect/Status
- **FEAT-13-04**: Dynamische Modellliste
- **FEAT-13-07**: Manueller Token-Modus

## Assumptions

- Die bestehende ModelConfigModal kann um diese Zustandsvarianten erweitert werden

## Out of Scope

- Separate Kilo-spezifische Settings-Seite
- Team-/Billing-Dashboard-Features in Obsilo
