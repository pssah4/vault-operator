# Feature: Homepage -- Hero & Messaging Update

> **Feature ID**: FEAT-17-05
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Aktualisierung der Hero-Section und des Gesamt-Messagings auf der Homepage. Die aktuellen Zahlen ("49 tools") und Beschreibungen reflektieren nicht den vollen Funktionsumfang (Knowledge Layer, Konnektoren, Office Pipeline). Das Messaging soll Vault Operator als "AI Operating Layer" positionieren -- nicht als "weiteres Chat-Plugin", sondern als tiefintegrierten Assistenten der den gesamten Obsidian-Workflow augmentiert.

## Benefits Hypothesis

**Wir glauben dass** aktualisiertes Hero-Messaging
**Folgende messbare Outcomes liefert:**
- Besucher verstehen sofort was Vault Operator ist und was es von einfachen Chat-Plugins unterscheidet
- Aktuelle Feature-Zahlen vermitteln den vollen Umfang

**Wir wissen dass wir erfolgreich sind wenn:**
- Alle Zahlen in der Hero-Section dem tatsaechlichen Stand entsprechen
- Das Messaging vermittelt "Operating Layer" statt "Chat-Plugin"

## User Stories

### Story 1: Erster Eindruck
**Als** Besucher der zum ersten Mal auf pssah4.github.io/vault-operator landet
**moechte ich** in 5 Sekunden verstehen was Vault Operator ist und warum es besonders ist
**um** zu entscheiden ob ich weiterlesen oder weiterklicken will

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Alle Zahlen auf der Homepage sind aktuell | Abgleich mit Backlog | Manueller Vergleich |
| SC-02 | Messaging positioniert Vault Operator als mehr als ein Chat-Plugin | "Operating Layer" Konzept erkennbar | Content-Review |
| SC-03 | Typewriter-Demo zeigt aktuelle Capabilities | Prompts referenzieren implementierte Features | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Content-Aenderungen
- Tool-Anzahl aktualisieren
- Sub-Headline ueberarbeiten (Knowledge Layer, Konnektoren, Office erwaehnen)
- Typewriter-Prompts ueberpruefen und ggf. ergaenzen (Office-Erstellung, MCP, Knowledge)
- Feature-Badges/Cards auf Homepage aktualisieren

---

## Definition of Done

### Functional
- [ ] Hero-Zahlen korrekt
- [ ] Messaging ueberarbeitet
- [ ] Typewriter-Prompts aktuell

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-00 (SSG-Migration)**: Homepage muss im SSG sein

## Out of Scope
- Design-Ueberarbeitung der Hero-Section (macht FEAT-17-06)
- Roadmap-Sektion (macht FEAT-17-04)
