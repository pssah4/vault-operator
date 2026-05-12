# Feature: Design-Ueberarbeitung (Best-in-Class)

> **Feature ID**: FEAT-17-06
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P2-Medium
> **Effort Estimate**: M

## Feature Description

Design-Ueberarbeitung der gesamten Website mit dem Ziel "best-in-class" (Vorbilder: Stripe Docs, Tailwind CSS Docs, Linear Changelog). Die Doku soll Spass machen zu lesen -- durch klare Typografie, angenehme Farbpalette, Micro-Interaktionen, Code-Highlighting und gut gestaltete Callout-Boxen fuer Tipps, Warnungen und Beispiele.

Das bestehende Design-System wird weiterentwickelt, nicht ersetzt. Dark/Light Theme bleibt, CSS-Variablen werden verfeinert.

## Benefits Hypothesis

**Wir glauben dass** ein best-in-class Doku-Design
**Folgende messbare Outcomes liefert:**
- Besucher verbringen mehr Zeit auf der Doku (subjektiv: "macht Spass zu lesen")
- Das Projekt wird als professionell und hochwertig wahrgenommen

**Wir wissen dass wir erfolgreich sind wenn:**
- Die Doku visuell auf dem Niveau vergleichbarer Open-Source-Projekte ist (subjektive Bewertung)
- Typografie, Spacing und Farbpalette konsistent ueber alle Seiten sind

## User Stories

### Story 1: Angenehmes Lesen
**Als** Doku-Leser
**moechte ich** eine visuell ansprechende, gut strukturierte Seite sehen
**um** gerne weiterzulesen statt die Seite schnell zu verlassen

### Story 2: Schnelle Orientierung
**Als** Doku-Leser
**moechte ich** Tipps, Warnungen und Code-Beispiele sofort visuell unterscheiden koennen
**um** die relevanten Informationen schnell zu erfassen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Konsistentes Design ueber alle Seiten | 0 visuelle Inkonsistenzen | Visueller Review |
| SC-02 | Tipps/Warnungen/Code visuell unterscheidbar | 3 distinkte Callout-Typen | Visueller Review |
| SC-03 | Dark und Light Theme gleichwertig gestaltet | Kein Theme ist "Stiefkind" | Vergleich beider Themes |
| SC-04 | Mobile-Ansicht voll nutzbar | Lesbar auf 375px Breite | Device-Test |

---

## Technical NFRs (fuer Architekt)

### Design-Elemente
- Typografie: klare Hierarchie (H1-H4), gute Lesbarkeit (line-height, letter-spacing)
- Farbpalette: Primaerfarbe (Vault Operator Lila), Akzentfarben fuer Callouts
- Callout-Boxen: Tip, Warning, Note, Example (visuell distinkt)
- Code-Blocks: Syntax-Highlighting, Copy-Button
- Navigation: Sticky Sidebar, Smooth Scroll, aktiver Abschnitt hervorgehoben
- Micro-Interaktionen: Hover-States, sanfte Transitions (kein Overload)

### Performance
- Kein CSS-Framework (Tailwind etc.) -- Custom CSS bleibt
- Keine schweren JS-Libraries fuer Animationen
- Seiten-Ladezeit bleibt unter 1 Sekunde

---

## Definition of Done

### Functional
- [ ] Alle Design-Elemente implementiert
- [ ] Dark + Light Theme konsistent

### Quality
- [ ] Mobile-Ansicht getestet (375px, 768px)
- [ ] Kein visueller Bruch zwischen Seiten

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-00 (SSG-Migration)**: Design wird im SSG-Kontext umgesetzt

## Out of Scope
- Komplett neues Design-System (Evolution, nicht Revolution)
- Animierte Demos / interaktive Tutorials
