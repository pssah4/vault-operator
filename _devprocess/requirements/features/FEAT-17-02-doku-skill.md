# Feature: Vault Operator Doku-Skill

> **Feature ID**: FEAT-17-02
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P0-Critical
> **Effort Estimate**: S

## Feature Description

Ein Vault Operator-Skill der die User-Guide-Inhalte als Kontext bereitstellt, sodass der Agent Fragen zur eigenen Bedienung direkt im Chat beantworten kann. Der Skill basiert auf den Markdown-Quellen des User Guides und wird automatisch relevant wenn der User Fragen wie "Wie richte ich Semantic Search ein?" oder "Welches Modell soll ich nehmen?" stellt.

Der Skill nutzt das bestehende Skill-System (SkillsManager, Keyword-Matching) und benoetigt keine neue Infrastruktur -- nur eine gut strukturierte SKILL.md mit den relevanten Doku-Inhalten.

## Benefits Hypothesis

**Wir glauben dass** ein Doku-Skill fuer In-App-Hilfe
**Folgende messbare Outcomes liefert:**
- User muessen die Website nicht verlassen um Bedienungsfragen zu klaeren
- >80% der gaengigen Fragen werden korrekt im Chat beantwortet

**Wir wissen dass wir erfolgreich sind wenn:**
- Vault Operator beantwortet 10 vordefinierte Test-Fragen korrekt (z.B. "Wie installiere ich?", "Wie richte ich Semantic Search ein?", "Wie erstelle ich einen Skill?")
- Der Skill wird automatisch aktiviert bei relevanten Fragen (Keyword-Matching)

## User Stories

### Story 1: Bedienungsfrage im Chat
**Als** Vault Operator-Nutzer
**moechte ich** im Chat fragen "Wie richte ich die semantische Suche ein?"
**um** eine Schritt-fuer-Schritt-Anleitung direkt im Chat zu erhalten statt die Website zu besuchen

### Story 2: Best-Practice-Empfehlung
**Als** Vault Operator-Nutzer
**moechte ich** im Chat fragen "Welches Modell empfiehlst du?"
**um** eine kontextbezogene Empfehlung zu erhalten

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Agent beantwortet gaengige Bedienungsfragen korrekt | >80% korrekte Antworten auf 10 Test-Fragen | Manueller Test mit vordefinierten Fragen |
| SC-02 | Skill wird bei relevanten Fragen automatisch aktiviert | Aktivierung bei "Wie richte ich X ein?"-Fragen | Pruefung der Skill-Injection im System-Prompt |
| SC-03 | Antworten basieren auf aktueller Doku, nicht auf veraltetem Wissen | Antworten decken sich mit Website-Inhalt | Vergleich Agent-Antwort vs. Website-Seite |

---

## Technical NFRs (fuer Architekt)

### Content-Struktur
- SKILL.md mit Keywords fuer Aktivierung (help, how to, setup, configure, etc.)
- Markdown-Inhalt aus User Guide extrahiert oder referenziert
- Kompakt genug fuer System-Prompt-Injection (~2000-4000 Tokens)

### Integration
- Nutzt bestehendes Skill-System (SkillsManager, automatisches Keyword-Matching)
- Als Bundled Skill ausgeliefert (nicht user-erstellt)
- Wird bei Plugin-Updates automatisch aktualisiert

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Token-Budget fuer Skill-Inhalt
- **Warum ASR**: Der gesamte User Guide ist zu gross fuer System-Prompt-Injection. Nur die relevantesten Abschnitte duerfen injiziert werden.
- **Impact**: Content muss in Sektionen aufgeteilt werden die selektiv geladen werden, oder als kompakte Zusammenfassung
- **Quality Attribute**: Performance (Token-Effizienz)

### Open Questions fuer Architekt
- Einzelner grosser Skill vs. mehrere Topic-spezifische Skills (z.B. help-setup, help-search, help-office)?
- Wie wird sichergestellt dass der Skill bei Updates automatisch aktuell bleibt?

---

## Definition of Done

### Functional
- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria erfuellt (verifiziert)

### Quality
- [ ] 10 Test-Fragen erfolgreich beantwortet
- [ ] Skill aktiviert sich nicht bei irrelevanten Fragen (keine False Positives)

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-01 (User Guide)**: Content muss vorliegen als Basis fuer den Skill

## Assumptions
- Das bestehende Skill-System reicht aus (keine neue Infrastruktur noetig)
- Keyword-Matching ist praezise genug fuer Aktivierung

## Out of Scope
- Website-Chatbot (explizit ausgeschlossen)
- Dynamische FAQ-Generierung aus User-Fragen
