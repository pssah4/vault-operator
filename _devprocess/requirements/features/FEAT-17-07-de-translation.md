# Feature: DE Uebersetzung

> **Feature ID**: FEAT-17-07
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P2-Medium
> **Effort Estimate**: M

## Feature Description

Deutsche Uebersetzung des User Guides und der Developer Docs. Englisch bleibt die Primaersprache, Deutsch wird als vollstaendige zweite Sprache angeboten. Die Uebersetzung ist priorisiert: User Guide zuerst, Dev Docs danach. Nicht 1:1 maschinell uebersetzt, sondern natuerlich formuliert mit korrekten Umlauten und deutscher Fachterminologie wo angemessen.

## Benefits Hypothesis

**Wir glauben dass** eine deutsche Uebersetzung
**Folgende messbare Outcomes liefert:**
- Deutschsprachige User finden die Doku zugaenglicher
- Der Vault Operator Doku-Skill kann auch auf Deutsch antworten

**Wir wissen dass wir erfolgreich sind wenn:**
- User Guide vollstaendig auf Deutsch verfuegbar
- Sprachumschalter funktioniert auf allen Seiten

## User Stories

### Story 1: Auf Deutsch lesen
**Als** deutschsprachiger Obsidian-Nutzer
**moechte ich** die Doku auf Deutsch lesen koennen
**um** Fachbegriffe und Anleitungen in meiner Muttersprache zu verstehen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | User Guide vollstaendig auf Deutsch | 100% der EN-Seiten | Seitenvergleich |
| SC-02 | Sprachumschalter funktioniert konsistent | Alle Seiten | Manueller Test |
| SC-03 | Fachbegriffe korrekt und konsistent uebersetzt | Glossar vorhanden | Content-Review |

---

## Technical NFRs (fuer Architekt)

### i18n-Architektur
- SSG-native i18n-Loesung (z.B. VitePress Locales, Astro i18n)
- URL-Schema: /de/getting-started vs. /getting-started (EN default)
- Fallback auf EN bei fehlender Uebersetzung

### Content-Workflow
- EN als Primary: DE-Uebersetzung folgt, nicht umgekehrt
- Priorisierung: User Guide > Dev Docs > Homepage

---

## Definition of Done

### Functional
- [ ] User Guide vollstaendig auf DE
- [ ] Sprachumschalter funktioniert
- [ ] Keine broken Links zwischen Sprachen

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-00 (SSG-Migration)**: i18n-Infrastruktur muss stehen
- **FEAT-17-01 (User Guide)**: EN-Content muss vorliegen

## Out of Scope
- Weitere Sprachen (nur EN + DE)
- Automatische maschinelle Uebersetzung
