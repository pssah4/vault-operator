# Feature: Template Gallery (Community)

> **Feature ID**: FEAT-11-14
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P2-Medium
> **Effort Estimate**: S (1-2 Tage)
> **Note**: **GEPLANT** -- Community Gallery noch nicht umgesetzt, Prioritaet gesunken

## Feature Description

Community-Repository mit voranalysierten Template-Skills. Populaere und generische Templates werden einmal analysiert und als SKILL.md bereitgestellt. User koennen Skills direkt herunterladen und in Obsilo importieren -- kein Analyse-Aufwand noetig.

Separates GitHub Repository (`pssah4/obsilo-template-gallery`). Community kann eigene Template-Skills beitragen.

## Benefits Hypothesis

**Wir glauben dass** eine Template Gallery
**Folgende messbare Outcomes liefert:**
- Instant Time-to-Value: User laed Skill herunter und kann sofort loslegen
- Community-Effekt: User teilen und verbessern Template-Skills
- Geringere Abhaengigkeit vom Analyzer-Service

**Wir wissen dass wir erfolgreich sind wenn:**
- Mindestens 5 Template-Skills in der Gallery innerhalb von 3 Monaten
- Community-Beitraege (PRs) kommen organisch
- Durchschnittlicher Onboarding-Pfad: <2 Minuten von Download bis erster Praesentation

## User Stories

### Story 1: Fertigen Skill nutzen
**Als** neuer Obsilo-User
**moechte ich** einen fertigen Template-Skill herunterladen
**um** sofort mit der Praesentation-Erstellung zu starten

### Story 2: Eigenen Skill teilen
**Als** erfahrener Obsilo-User
**moechte ich** meinen analysierten Template-Skill der Community bereitstellen
**um** anderen den Analyse-Aufwand zu ersparen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Verfuegbare Template-Skills sind auffindbar und herunterladbar | Mindestens 3 Generic + 2 Corporate | Gallery-Inhalt |
| SC-02 | Heruntergeladener Skill funktioniert direkt in Obsilo | Import + Praesentation erstellen | End-to-End Test |
| SC-03 | Community kann beitragen | Dokumentierter Beitrags-Prozess | CONTRIBUTING.md vorhanden |
| SC-04 | Qualitaet der Skills ist konsistent | Review-Prozess fuer PRs | PR-Template vorhanden |

---

## Technical NFRs (fuer Architekt)

### Hosting
- **Plattform**: GitHub Repository (Apache 2.0)
- **Optional**: Gallery-Seite auf obsilo.ai (Links auf GitHub)
- **Kosten**: $0

---

## Repository-Struktur

```
pssah4/obsilo-template-gallery
  ├── README.md
  ├── CONTRIBUTING.md
  ├── LICENSE (Apache 2.0)
  ├── templates/
  │   ├── generic-executive-dark/
  │   │   └── SKILL.md
  │   ├── generic-modern-light/
  │   │   └── SKILL.md
  │   ├── generic-minimal/
  │   │   └── SKILL.md
  │   └── enbw-corporate-2026/
  │       └── SKILL.md
  └── .github/
      └── PULL_REQUEST_TEMPLATE.md
```

### Beitrags-Prozess

1. User analysiert eigenes Template (via Web-Service oder In-Plugin)
2. Prueft Skill auf Qualitaet (semantische Beschreibungen vorhanden?)
3. Entfernt vertrauliche Informationen (keine echten Inhalte, nur Design-Beschreibungen)
4. Erstellt PR mit SKILL.md in neuem Ordner unter `templates/`
5. Maintainer reviewed auf Qualitaet und Format-Konformitaet

---

## Architecture Considerations

### Constraints
- **Kein Hosting-Aufwand**: Rein GitHub-basiert
- **Kein PPTX-Upload**: Nur SKILL.md-Dateien (keine Templates aus Copyright-Gruenden)
- **Qualitaets-Sicherung**: PR-Review durch Maintainer

### Open Questions fuer Architekt
- Soll die Gallery-Seite auf obsilo.ai eine Suchfunktion haben?
- Soll es ein Standard-Validierungsscript fuer Skill-Qualitaet geben?
- Wie wird mit Templates umgegangen deren Design Copyright-geschuetzt ist (Skill beschreibt nur die Struktur, nicht das Design selbst)?

---

## Definition of Done

### Functional
- [ ] Repository angelegt mit README, CONTRIBUTING, LICENSE
- [ ] Mindestens 3 generische Template-Skills vorhanden
- [ ] PR-Template fuer Community-Beitraege
- [ ] Import-Anleitung in README

### Quality
- [ ] Alle Skills im Visual Design Language Format (FEAT-11-11)
- [ ] Alle Skills unter 16k Zeichen
- [ ] Alle Skills getestet: Import + Praesentation-Erstellung

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-11-11**: Visual Design Language Document Format (definiert Skill-Format)
- **FEAT-11-12 oder FEAT-11-08**: Analyzer zum Erstellen der initialen Skills
- **GitHub**: Repository-Hosting

## Out of Scope

- Automatisches Update von Skills im Plugin
- In-Plugin Gallery-Browser
- Rating-System fuer Skills
- PPTX-Templates im Repository (nur SKILL.md)
