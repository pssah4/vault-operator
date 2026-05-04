# Feature: Template-Onboarding

> **Feature ID**: FEAT-19-03
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Einmaliger Onboarding-Dialog der beim ersten Aktivieren der Knowledge-Maintenance-Features
die Settings mit sinnvollen Default-Werten befuellt und Default-Templates in der gewaehlten
Sprache in den Vault kopiert. Bestehende Strukturen werden nie ueberschrieben.

Der Dialog fragt: "Welche Properties verlinken auf andere Notes?" und setzt
`mocPropertyNames` entsprechend. Wenn der User bereits eigene Templates hat,
werden diese als Hinweis genutzt. Templates koennen als .md-Dateien angepasst werden.

**Aenderung nach Review (ADR-66):** Das Onboarding erstellt keinen Schema-Cache mehr.
Stattdessen setzt es Default-Werte in den bestehenden Settings (mocPropertyNames,
categoryProperty, summaryProperty). Die Settings sind die Single Source of Truth.

## Benefits Hypothesis

**Wir glauben dass** ein sicherer Onboarding-Dialog die Einstiegshuerde senkt und
gleichzeitig bestehende Vault-Strukturen schuetzt.

**Folgende messbare Outcomes liefert:**
- 100% der User haben nach Onboarding ein funktionierendes Template-Schema
- 0% der bestehenden Dateien werden ueberschrieben

**Wir wissen dass wir erfolgreich sind wenn:**
- Onboarding laeuft in unter 2 Minuten durch
- Kein Support-Ticket wegen ueberschriebener Dateien

## User Stories

### Story 1: Bestehende Templates erkennen
**Als** Wissensarbeiter mit eigenem Template-System
**moechte ich** dass Obsilo meine bestehenden Templates erkennt und nutzt
**um** mein bewaehrtes Schema beizubehalten statt ein neues aufgezwungen zu bekommen

### Story 2: Default-Templates fuer Einsteiger
**Als** neuer Obsidian-User
**moechte ich** ein vorgefertigtes Template-Set in meiner Sprache bekommen
**um** sofort mit strukturierten Notes anfangen zu koennen

### Story 3: Templates anpassen
**Als** Wissensarbeiter
**moechte ich** Templates als Markdown-Dateien bearbeiten koennen
**um** Properties hinzuzufuegen oder zu entfernen ohne in Plugin-Settings suchen zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Bestehende Templates werden korrekt erkannt | 100% bei Standard-Obsidian-Template-Ordnern | Test mit verschiedenen Vault-Konfigurationen |
| SC-02 | Bestehende Dateien werden nie ueberschrieben | 0 Ueberschreibungen | Automatisierter Test |
| SC-03 | Default-Templates sind in der Sprache des Users | Mindestens DE + EN | Manueller Test |
| SC-04 | Onboarding ist schnell und verstaendlich | <2 Minuten, keine Rueckfragen noetig | User-Test |
| SC-05 | Info-Modal erklaert Template-Anpassung | User versteht wie er Properties aendern kann | User-Test |

---

## Technical NFRs (fuer Architekt)

### Security
- **Path-Traversal**: Template-Pfad muss validiert werden
- **Existenz-Check**: Nie ueberschreiben, immer pruefen

### Internationalisierung
- **Default-Templates**: Mindestens DE + EN
- **Property-Namen**: In der Sprache des Users (z.B. "Themen" vs. "Topics")

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Template-Speicherort
- **Warum ASR**: Wo liegen die Templates? Im Vault (User-sichtbar) oder im Plugin-Verzeichnis (versteckt)?
- **Impact**: Bestimmt ob User Templates in Obsidian direkt bearbeiten kann
- **Quality Attribute**: Usability

**MODERATE ASR #2**: Sprach-Handling bei Properties
- **Warum ASR**: Wenn Templates auf Deutsch sind (Themen, Konzepte), muss der Agent die Property-Namen korrekt verwenden. Mischsprachen (DE Properties + EN Agent-Prompts) muessen funktionieren
- **Impact**: System-Prompt, Skill-Instruktionen, Property-Erkennung
- **Quality Attribute**: Correctness

### Onboarding-Flow

```
1. "Hast du bereits eigene Templates?"
   ├→ Ja: "In welchem Ordner liegen sie?"
   │       → Agent liest Templates, erkennt Properties
   │       → "Erkannte Kategorien: Zettel, Thema, Konzept, ..."
   │       → Bestaetigung
   └→ Nein: "Welche Sprache moechtest du?"
            → DE / EN
            → Default-Templates in gewaehlter Sprache kopieren
            → Zielordner abfragen (Vorschlag: Templates/)
            → Existenz-Check → Kopieren → Bestaetigung

2. Info-Modal: "So passt du Templates an:"
   → Erklaert: Oeffne die .md-Datei, aendere Properties
   → Erklaert: Der Agent nutzt automatisch dein angepasstes Schema
```

### Default-Template-Set (basierend auf BA-Interview)

8 Kategorien: Zettel, Thema, Konzept, Person, Projekt, Meeting-Notiz, Quelle, Notiz

### Open Questions fuer Architekt
- Sollen Templates als Assets im Plugin gebundelt werden oder als erste Aktion heruntergeladen?
- Wie erkennt das System die Template-Sprache bei bestehenden Templates (Heuristik auf Property-Namen)?

---

## Definition of Done

### Functional
- [ ] Onboarding-Dialog erkennt bestehende Templates
- [ ] Default-Templates in DE und EN verfuegbar
- [ ] Nie-ueberschreiben-Garantie (Existenz-Check)
- [ ] Info-Modal erklaert Template-Anpassung
- [ ] Ingest-Skill (FEAT-19-00) nutzt erkannte Templates korrekt

### Quality
- [ ] Obsidian Review-Bot Compliance (kein innerHTML im Modal)
- [ ] Template-Pfad validiert (kein Path-Traversal)

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-19-00 (Ingest)**: Konsument der Templates
- **Obsidian Templater/Templates Plugin**: Optional, muss koexistieren

## Out of Scope
- Template-Editor UI (User editiert .md direkt)
- Automatisches Template-Update bei Plugin-Upgrade
- Mehr als 2 Sprachen im MVP
