# Feature: In-Plugin Template-Analyzer (Spatial Analysis + Skill-Generierung)

> **Feature ID**: FEAT-11-08
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P1-High
> **Effort Estimate**: M (3-5 Tage)
> **Note**: **DEPRECATED** -- Abgeloest durch IngestTemplateTool (ADR-46/047)
> **Ersetzt**: FEAT-11-03 (Theme-Extraktion)

## Feature Description

In-Plugin Analyse-Tool das beliebige PPTX-Templates deterministisch analysiert -- als Fallback fuer User die den Web-Service (FEAT-11-12) nicht nutzen wollen oder koennen. Extrahiert Shape-Daten, Brand-DNA, Slide-Kompositionen und generiert daraus ein Visual Design Language Document (FEAT-11-11).

**Einschraenkung gegenueber dem Web-Service**: Kein LibreOffice-Rendering (keine Bilder), daher kein visuelles Verstaendnis von custGeom-Shapes, keine Gesamtwirkung, keine emotionale Wirkung. Fuer einfache Templates ausreichend, fuer komplexe Corporate-Templates empfiehlt sich der Web-Service.

**Erweiterung gegenueber IST-Zustand**: Die bestehende `PptxTemplateAnalyzer.ts` wird um Spatial Analysis (Kompositionsmuster-Erkennung) erweitert. Der `AnalyzePptxTemplateTool.ts` generiert das neue Visual Design Language Format statt des alten Element-Katalog-Formats.

## Benefits Hypothesis

**Wir glauben dass** ein erweiterter In-Plugin Template-Analyzer
**Folgende messbare Outcomes liefert:**
- Templates ohne externen Service analysierbar (Offline-Faehigkeit)
- Spatial Analysis erkennt Kompositionsmuster (Sequenzen, Grids, Hierarchien)
- Generierter Skill im neuen Visual Design Language Format

**Wir wissen dass wir erfolgreich sind wenn:**
- EnBW-Template (108 Slides) korrekt analysiert: Brand-Farben, Kompositionen, Shape-Mappings
- Generierter Skill enthaelt semantische Bedeutung pro Komposition (wenn auch weniger tiefgruendig als Web-Service)
- Skill wird vom SkillsManager erkannt und geladen
- Tool-Aufruf in unter 60 Sekunden fuer 108-Slide Template

## User Stories

### Story 1: Offline-Analyse
**Als** Wissensarbeiter ohne Internet
**moechte ich** mein Template direkt im Plugin analysieren
**um** auch offline einen Template-Skill zu erhalten

### Story 2: Schnelle Analyse
**Als** Berater der gerade eine Praesentation braucht
**moechte ich** mein Template im Chat analysieren lassen
**um** sofort damit arbeiten zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Beliebige Vorlagen werden analysiert und als nutzbarer Skill gespeichert | Jede PPTX | Test mit 5 verschiedenen Templates |
| SC-02 | Generierter Skill beschreibt Kompositionen mit semantischer Bedeutung | Alle content-bearing Kompositionen | Manuelle Pruefung |
| SC-03 | Analyse ist ohne externe Dienste durchfuehrbar | Funktioniert offline | Funktionstest |
| SC-04 | Ergebnis ist sofort einsetzbar fuer Praesentationserstellung | Skill wird geladen und genutzt | End-to-End Test |
| SC-05 | Grosse Vorlagen werden in akzeptabler Zeit analysiert | Unter einer Minute | Zeitmessung |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Analyse-Dauer**: <60s fuer 108-Slide Template
- **Memory**: <200 MB Peak waehrend Analyse

### Integration
- **Tool-Registration**: In read-Toolgroup registriert
- **Output**: Visual Design Language Document (SKILL.md) im Format von FEAT-11-11
- **Vault-Speicherung**: Generierter Skill wird als User-Skill im Vault gespeichert

---

## Erweiterungen gegenueber IST-Zustand

### 1. Spatial Analysis (Kompositionsmuster-Erkennung)

Neue Analyse-Schicht die ueber die bestehende `classifySlide()` Heuristik hinausgeht:

- **Sequenz-Erkennung**: N gleich grosse Shapes horizontal angeordnet -> Prozess/Timeline
- **Grid-Erkennung**: M*N Shapes in regelmaessigem Raster -> Dashboard/Matrix
- **Radial-Erkennung**: Shapes um einen Mittelpunkt -> Zyklus/Hub-and-Spoke
- **Hierarchie-Erkennung**: Pyramidenfoermig angeordnet -> Hierarchie/Priorisierung
- **Paarungs-Erkennung**: Zwei dominante Bereiche -> Vergleich/Zwei-Spalten

### 2. Semantische Beschreibungs-Generierung

Statt nur `classification: "process"` generiert der Analyzer eine semantische Beschreibung:

- **Alt**: "Prozessablauf mit 5 Shapes"
- **Neu**: "5-stufiger linearer Prozess (Chevron-Kette) -- kommuniziert Fortschritt und Sequenz. Chevron-Titel max 2-3 Worte, Beschreibung darunter max 15 Worte."

### 3. Visual Design Language Output

`AnalyzePptxTemplateTool` generiert Skill im neuen Format (FEAT-11-11) statt im alten Element-Katalog-Format. Enthaelt:
- Brand-DNA
- Visuelles Vokabular mit Bedeutung (deterministisch hergeleitet aus Geometrie + Position)
- Kompositionen nach Narrativ-Phase
- Design-Regeln
- Shape-Name-Mappings

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1: Deterministische Qualitaet ohne Bilder**
- **Warum ASR**: Ohne Claude Vision ist die semantische Analyse auf Heuristiken beschraenkt. custGeom-Shapes (Custom-Geometrien) koennen nicht visuell interpretiert werden.
- **Impact**: Qualitaet des generierten Skills ist geringer als beim Web-Service. Muss dennoch funktional sein.
- **Quality Attribute**: Reliability, Usability

### Open Questions fuer Architekt
- Soll der In-Plugin Analyzer den User auf den Web-Service hinweisen wenn viele custGeom-Shapes erkannt werden?
- Soll der generierte Skill einen Qualitaets-Indikator enthalten (z.B. "Analysiert ohne visuelles Verstaendnis")?

---

## Definition of Done

### Functional
- [ ] PptxTemplateAnalyzer um Spatial Analysis erweitert (Sequenz, Grid, Radial, Hierarchie, Paarung)
- [ ] Semantische Beschreibungs-Generierung pro Komposition
- [ ] AnalyzePptxTemplateTool generiert Visual Design Language Format (FEAT-11-11)
- [ ] Generierter Skill enthaelt Brand-DNA, Vokabular, Kompositionen, Regeln, Mappings
- [ ] Skill wird als User-Skill im Vault gespeichert
- [ ] Tool in read-Toolgroup registriert und aufrufbar

### Quality
- [ ] Performance: <60s fuer 108-Slide Template
- [ ] Fehlerbehandlung: Korrupte/leere Templates
- [ ] Review-Bot-konform
- [ ] Skill bleibt unter 16k Zeichen

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-11-11**: Visual Design Language Document Format
- **FEAT-11-10**: Shape-Name-Matching (S0) fuer korrekte Shape-Namen
- **Bestehend**: PptxTemplateAnalyzer.ts, AnalyzePptxTemplateTool.ts, SkillsManager

## Out of Scope

- Multimodale Analyse mit Bildern (das ist FEAT-11-12)
- LibreOffice-Rendering
- custGeom-Interpretation (nur geometrischer Hash)
- Community-Gallery-Integration

## Dependencies

- **JSZip**: Bereits vorhanden
- **DOMParser**: Nativ in Electron
- **FEAT-11-11**: Template-Skill-Format (Output-Format)
- **FEAT-11-10**: Shape-Name-Matching (Konsument der Shape-Namen)
