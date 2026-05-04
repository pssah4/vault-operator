# Feature: Implicit Connection UI

> **Feature ID**: FEAT-15-06
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P2-Medium
> **Effort Estimate**: S

## Feature Description

Implizit erkannte Verbindungen (FEAT-15-03) werden dem User aktiv praesentiert. Wenn Obsilo Notes findet die semantisch nah aber nicht verlinkt sind, zeigt es Vorschlaege an. Der User kann Vorschlaege akzeptieren (Wikilink wird vorgeschlagen), ignorieren, oder als irrelevant markieren (verbessert kuenftige Vorschlaege).

## Benefits Hypothesis

**Wir glauben dass** eine aktive Verbindungs-UI
**Folgende messbare Outcomes liefert:**
- User entdeckt durchschnittlich 2-5 neue Verbindungen pro Session
- Vault-Vernetzung verbessert sich messbar (mehr Wikilinks ueber Zeit)

**Wir wissen dass wir erfolgreich sind wenn:**
- User interagiert mit den Vorschlaegen (nicht nur ignoriert)
- Mindestens 30% der Vorschlaege fuehren zu einer Aktion (Link erstellen, Note oeffnen)

## User Stories

### Story 1: Verbindungsvorschlag sehen
**Als** Knowledge Worker
**moechte ich** eine unaufdringliche Benachrichtigung wenn Obsilo eine versteckte Verbindung erkennt
**um** entscheiden zu koennen ob ich diese Verbindung in meinem Vault herstellen will

### Story 2: Vorschlag bewerten
**Als** Knowledge Worker
**moechte ich** einen Vorschlag als relevant oder irrelevant markieren koennen
**um** die Qualitaet zukuenftiger Vorschlaege zu verbessern

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Vorschlaege werden dem User praesentiert | Sichtbar in der Oberflaeche | Visueller Test |
| SC-02 | User kann mit Vorschlaegen interagieren | Akzeptieren / Ignorieren / Ablehnen | Funktionstest aller drei Aktionen |
| SC-03 | Vorschlaege sind nicht aufdringlich | Kein Modal, kein Popup das Arbeit unterbricht | UX-Review |
| SC-04 | Abgelehnte Vorschlaege erscheinen nicht erneut | 0 Wiederholungen | Test: Ablehnen + pruefen |

---

## Technical NFRs (fuer Architekt)

### UX
- **Platzierung**: In der Obsilo-Sidebar oder als dezente Inline-Anzeige
- **Interaktion**: Klick oeffnet beide Notes nebeneinander, Button fuer "Link erstellen"
- **Frequenz**: Max 3 Vorschlaege pro Session (nicht ueberfluten)

---

## Architecture Considerations

### Open Questions fuer Architekt
- Sidebar-Section, Notification-Badge, oder eigenes Panel?
- Sollen Vorschlaege persistent sein (ueberleben Plugin-Reload) oder nur pro Session?
- Feedback-Loop: Abgelehnte Paare in DB speichern um Schwellenwert anzupassen?

---

## Definition of Done

### Functional
- [ ] Implizite Verbindungen werden in der UI angezeigt
- [ ] User kann akzeptieren, ignorieren, oder ablehnen
- [ ] Abgelehnte Vorschlaege werden nicht wiederholt
- [ ] Max 3 Vorschlaege pro Session

### Quality
- [ ] UX-Review: Nicht aufdringlich, gut integriert
- [ ] Funktionstest aller Interaktions-Pfade

---

## Dependencies
- **FEAT-15-03**: Implicit Connection Discovery (liefert die Verbindungsdaten)

## Out of Scope
- Automatisches Erstellen von Wikilinks (nur Vorschlag)
- Graph-Visualisierung der impliziten Verbindungen (Canvas/Excalidraw)
