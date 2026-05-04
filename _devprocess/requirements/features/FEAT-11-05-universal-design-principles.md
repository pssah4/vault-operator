# Feature: Universelle Design-Prinzipien (Skill-Erweiterung)

> **Feature ID**: FEAT-11-05
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: M (3-5 Tage)
> **Integriert**: FEAT-11-09 (Content Classification Framework)

## Feature Description

Erweiterung des `presentation-design` Bundled-Skills um ein umfassendes Fundament universeller Design-Prinzipien. Dieses Wissen ist template-unabhaengig und bildet die Basis, auf der template-spezifische Design Languages aufbauen. Der Skill wird zur "Design-Ausbildung" des Agents.

Bisheriger Zustand: Content Classification Framework + Storytelling Frameworks + HTML-Layout-Patterns (Part A+B). Neuer Zustand: Zusaetzlich visuelles Vokabular, Gestalt-Prinzipien, Signal-to-Noise-Regeln und Content-to-Visualization Decision Tree.

## Benefits Hypothesis

**Wir glauben dass** universelle Design-Prinzipien im presentation-design Skill
**Folgende messbare Outcomes liefert:**
- Agent trifft bewusste Design-Entscheidungen statt mechanisch Folientypen zuzuordnen
- Agent begruendet Slide-Typ-Wahl mit semantischer Bedeutung der visuellen Form
- Design-Qualitaet der Praesentationen steigt messbar (mehr visuelle Vielfalt, bessere Narrative)

**Wir wissen dass wir erfolgreich sind wenn:**
- Agent erwaehnt visuelle Bedeutung bei der Slide-Planung ("Chevron-Kette kommuniziert Fortschritt")
- Agent nutzt Gestalt-Prinzipien implizit (Proximity fuer Gruppen, Similarity fuer Gleiches)
- Agent waehlt nachweislich das visuellste Format fuer jeden Inhalt

## User Stories

### Story 1: Visuell intelligente Planung
**Als** Berater
**moechte ich** dass der Agent versteht WARUM ein bestimmtes Layout fuer meinen Inhalt richtig ist
**um** Praesentationen zu erhalten die visuell ueberzeugend argumentieren

### Story 2: Narrative Struktur
**Als** Wissensarbeiter
**moechte ich** dass der Agent ein passendes Storytelling-Framework waehlt
**um** Praesentationen zu erhalten die eine klare Geschichte erzaehlen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Agent begruendet Design-Entscheidungen mit semantischer Bedeutung | Sichtbar in Slide-Planung | Manuelle Pruefung: 10 Test-Praesentationen |
| SC-02 | Agent nutzt verschiedene Visualisierungsformen pro Deck | Mind. 5 verschiedene Typen pro 15-Slide-Deck | Automatisch zaehlbar |
| SC-03 | Agent benennt Storytelling-Framework vor der Slide-Planung | In jedem Planungsschritt | Beobachtbar im Chat |
| SC-04 | Agent waehlt visuellstes Format statt Bullet-Points | Max 30% reine Text-Slides | Zaehlung nach Erstellung |
| SC-05 | Universelle Prinzipien gelten unabhaengig vom Template | Gleiche Qualitaet bei Default + Corporate | Vergleichstest |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Skill-Groesse**: presentation-design SKILL.md bleibt unter 16.000 Zeichen (SkillsManager-Limit)
- **Token-Budget**: Skill-Inhalt < 4.000 Tokens im System-Prompt (LaTeX/Tabellen kompakt)

### Integration
- **Bundled Skill**: Auslieferung mit dem Plugin, kein User-Setup noetig
- **Trigger**: Wird automatisch bei Praesentation-Erstellung geladen
- **Komposition mit Template-Skills**: Universelle Prinzipien + Template-Skill = vollstaendiges Design-Wissen

---

## Erweiterungen im presentation-design Skill

### Neuer Abschnitt: Visuelles Vokabular (template-unabhaengig)

Semantische Bedeutung geometrischer Grundformen:

| Visuelle Form | Bedeutung | Einsatz | Gegenindikation |
|---------------|-----------|---------|-----------------|
| Chevron-Kette | Sequenz, Fortschritt | Schritte in Reihenfolge | Nicht-lineare Ablaeufe |
| Pyramide | Hierarchie, Verdichtung | Von breit zu schmal | Gleichwertige Ebenen |
| Kreislauf | Zyklus, Iteration | Wiederkehrende Prozesse | Einmalige Ablaeufe |
| 2x2-Matrix | Analyse, Positionierung | Zwei Dimensionen kreuzen | Mehr als 2 Dimensionen |
| Grid (3x3) | Optionen, Gleichwertigkeit | 6-9 gleichwertige Elemente | Hierarchische Struktur |
| Organigramm | Hierarchie, Verantwortung | Reporting-Linien | Flache Strukturen |
| KPI-Saeulen | Vergleich, Beweis | Zahlen belegen eine These | Qualitative Aussagen |
| Waage | Abwaegung, Balance | Zwei Seiten einer Entscheidung | Mehr als 2 Optionen |
| Stoerer/Callout | Hervorhebung | Eine wichtige Zahl/Aussage | Alles gleich wichtig |

### Neuer Abschnitt: Design-Reasoning-Anleitung

Instruktionen fuer den Agent, wie er vom Inhalt zur visuellen Form denken soll:

```
1. Content analysieren: Was ist die Kernaussage?
2. Struktur erkennen: Sequenz? Hierarchie? Vergleich? Zyklus?
3. Visuelle Form waehlen: Welche Bedeutung traegt die Form?
4. Komposition pruefen: Passt die Form in den narrativen Bogen?
5. Template-Match: Welcher Slide im Template realisiert diese Form?
```

### Neuer Abschnitt: Gestalt-Prinzipien als Layout-Constraints

- **Proximity**: Zusammengehoerige Elemente nah beieinander
- **Similarity**: Gleiche Rolle = gleiche visuelle Behandlung
- **Closure**: Angedeutete Formen werden mental vervollstaendigt
- **Continuity**: Ausrichtung fuehrt das Auge
- **Figure/Ground**: Hintergrund vs. Vordergrund klar trennen

### Neuer Abschnitt: Signal-to-Noise-Regeln

Basierend auf Tufte und Reynolds:
- **Data-Ink Ratio maximieren**: Jedes Pixel traegt Information oder wird entfernt
- **Chartjunk vermeiden**: Keine 3D-Effekte, Schattenwuerfe, Farbverlaeufe ohne Funktion
- **Redundanz eliminieren**: Wenn die Form die Aussage traegt, braucht der Text sie nicht zu wiederholen

### Erweiterung: Content-to-Visualization Decision Tree

Der bestehende Decision Tree wird um semantische Reasoning-Hinweise erweitert:

```
Content hat Zahlen?
  Ja -> Wie viele?
       1-6 Metriken -> KPI-Karten (BEDEUTUNG: "Beweis durch Zahl")
       Zeitreihe -> Linienchart (BEDEUTUNG: "Trend sichtbar machen")
       Kategorie-Vergleich -> Balkenchart (BEDEUTUNG: "Groessenverhaeltnis")
  Nein -> Beschreibt eine Sequenz?
       Ja -> Prozessflow/Chevrons (BEDEUTUNG: "Fortschritt, Reihenfolge IST Argumentation")
       Nein -> Vergleich?
            Ja -> Zwei-Spalten/Matrix (BEDEUTUNG: "Gegenueberstellung erzeugt Spannung")
            Nein -> Hierarchisch?
                 Ja -> Pyramide/Organigramm (BEDEUTUNG: "Prioritaet durch Groesse")
                 Nein -> Content-Slide (LETZTER Ausweg)
```

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1: Skill-Groessen-Limit**
- **Warum ASR**: presentation-design Skill muss unter 16k Zeichen bleiben, aber gleichzeitig umfassende Design-Prinzipien enthalten
- **Impact**: Erfordert extrem kompakte Formulierung, kein Redundanz
- **Quality Attribute**: Usability (Skill wird vollstaendig geladen oder gar nicht)

### Open Questions fuer Architekt
- Sollen universelle Prinzipien in einem separaten Skill ausgelagert werden wenn der presentation-design Skill zu gross wird?
- Kann der SkillsManager zwei Skills gleichzeitig laden (presentation-design + template-skill)?

---

## Definition of Done

### Functional
- [ ] Visuelles Vokabular im presentation-design Skill
- [ ] Design-Reasoning-Anleitung im Skill
- [ ] Gestalt-Prinzipien als Layout-Constraints
- [ ] Signal-to-Noise-Regeln
- [ ] Erweiterter Content-to-Visualization Decision Tree
- [ ] Content Classification Framework (bereits vorhanden, validiert)
- [ ] Storytelling Frameworks (bereits vorhanden, validiert)

### Quality
- [ ] Skill bleibt unter 16.000 Zeichen
- [ ] Agent begruendet Design-Entscheidungen sichtbar
- [ ] Kein Regression bestehender Praesentation-Features

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **presentation-design/SKILL.md**: Bestehender Skill wird erweitert
- **office-workflow/SKILL.md**: Referenziert presentation-design Skill (Kompatibilitaet pruefen)

## Out of Scope

- Template-spezifische Design-Regeln (gehoeren in den Template-Skill)
- HTML-Layout-Patterns-Aenderungen (Part B bleibt unveraendert)
- office-workflow Prozess-Aenderungen
