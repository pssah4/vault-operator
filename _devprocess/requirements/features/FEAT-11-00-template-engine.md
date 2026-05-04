# Feature: PPTX Template-Engine (JSZip + OOXML)

> **Feature ID**: FEAT-11-00
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: L
> **ADR**: ADR-32
> **Note**: **DEPRECATED** -- Abgeloest durch ADR-46/047 (pptx-automizer statt JSZip OOXML)

## Feature Description

Neue PPTX-Erzeugungsengine die Template-PPTX-Dateien als Basis nimmt, bestehende Content-Slides entfernt, und neue Slides als OOXML-XML in die ZIP-Struktur injiziert. Ersetzt die bisherige pptxgenjs-basierte Erzeugung in CreatePptxTool.

## Benefits Hypothesis

**Wir glauben dass** eine template-basierte PPTX-Engine
**Folgende messbare Outcomes liefert:**
- Volle Design-Treue bei User-Templates (Hintergruende, Layouts, Logos, Fonts, Farben bleiben erhalten)
- Professionelles Ergebnis bei Default-Templates (nicht als "generiert" erkennbar)
- Bundle-Groesse-Reduktion (~500 KB weniger durch pptxgenjs-Entfernung)

**Wir wissen dass wir erfolgreich sind wenn:**
- User-Template-Upload erzeugt PPTX die visuell identisch zur Vorlage ist (nur mit neuem Inhalt)
- Default-Template-Output ist in PowerPoint/LibreOffice ohne Fehler oeffenbar
- pptxgenjs ist vollstaendig entfernt

## User Stories

### Story 1: Template-basierte Praesentation
**Als** Berater
**moechte ich** mein Corporate-Template hochladen und der Agent schreibt die Inhalte hinein
**um** eine Praesentation zu erhalten die exakt wie mein Firmen-Design aussieht

### Story 2: Default-Praesentation
**Als** Wissensarbeiter
**moechte ich** eine Praesentation ohne eigene Vorlage erstellen
**um** ein professionelles Ergebnis zu erhalten das sofort praesentierbar ist

## Success Criteria

| ID | Criterion | Target |
|----|-----------|--------|
| SC-01 | Erzeugte PPTX oeffnet fehlerfrei in PowerPoint 2016+, LibreOffice 7+, Google Slides | 100% |
| SC-02 | User-Template: Masters, Layouts, Theme, Hintergruende bleiben exakt erhalten | Visuell identisch |
| SC-03 | Neue Slides enthalten alle uebergebenen Inhalte (Text, Listen, Tabellen, Bilder) | Kein Inhaltsverlust |
| SC-04 | 30-Folien-Praesentation wird in < 5s erzeugt | Performance |
| SC-05 | pptxgenjs ist vollstaendig aus package.json und Code entfernt | Dependency-Cleanup |

## Technical Design

### Kernkomponenten

1. **PptxTemplateEngine** (`src/core/office/PptxTemplateEngine.ts`)
   - Oeffnet Template-PPTX via JSZip
   - Entfernt bestehende Content-Slides (behaelt Masters, Layouts, Theme)
   - Injiziert neue Slides als OOXML-XML
   - Aktualisiert Relationships (`ppt/_rels/presentation.xml.rels`) und Content-Types (`[Content_Types].xml`)
   - Gibt ArrayBuffer zurueck

2. **SlideXmlBuilder** (`src/core/office/SlideXmlBuilder.ts`)
   - Erzeugt OOXML-XML fuer einzelne Slides
   - Unterstuetzt: Titel-Platzhalter, Body-Platzhalter, Bullet-Listen, Tabellen, Bilder, Speaker-Notes
   - Mappt `layout`-Feld auf Slide-Layout-Referenz im Template

3. **TemplateManager** (`src/core/office/TemplateManager.ts`)
   - Laedt Default-Templates aus `assets/templates/`
   - Laedt User-Templates aus Vault oder Chat-Upload
   - Analysiert verfuegbare Slide-Layouts im Template

### Slide-Layout-Mapping

Der Agent gibt pro Slide ein `layout`-Feld an (title, content, section, two_column, etc.). Die Engine:
1. Liest alle `ppt/slideLayouts/slideLayoutN.xml` im Template
2. Klassifiziert Layouts anhand ihrer Platzhalter (title, body, etc.)
3. Mappt das gewuenschte Layout auf den passenden `slideLayout*.xml`
4. Falls kein Match: Fallback auf das Layout mit den meisten Platzhaltern

### Input-Schema

Das bestehende Input-Schema (ADR-29) bleibt unveraendert. Der Agent uebergibt weiterhin:
```
{ output_path, slides[{ title?, subtitle?, body?, bullets?, table?, image?, notes?, layout? }], theme? }
```

Das `theme`-Feld aendert seine Semantik:
- **Bisher:** `{ primary_color, font_family }` -> pptxgenjs-Styling
- **Neu:** `DesignTheme`-Objekt oder Verweis auf gespeichertes Theme -> Template-Auswahl + etwaige Farb-Overrides

## Definition of Done

### Functional
- [ ] Template-PPTX wird korrekt geoeffnet, Slides entfernt, neue injiziert
- [ ] Alle Content-Typen: Text, Bullets, Tabellen, Bilder, Speaker-Notes
- [ ] Layout-Mapping funktioniert fuer mindestens 5 Layout-Typen
- [ ] Relationships und Content-Types sind nach Injection konsistent
- [ ] pptxgenjs vollstaendig entfernt

### Quality
- [ ] Erzeugte PPTX valide in PowerPoint, LibreOffice, Google Slides
- [ ] Performance < 5s fuer 30 Slides
- [ ] Fehlerbehandlung bei korruptem Template

## Dependencies

- **JSZip:** Bereits vorhanden
- **DOMParser:** Nativ in Electron
- **FEAT-11-01:** Default-Templates muessen vorhanden sein
- **ADR-29:** Input-Schema bleibt
- **ADR-31:** writeBinaryToVault() bleibt

## Assumptions

- OOXML-Slide-XML ist ausreichend dokumentiert fuer manuelle Erzeugung
- Slide-Layouts in Templates haben Standard-Platzhalter-Typen (title, body, etc.)
- JSZip kann PPTX-Dateien zuverlaessig lesen und schreiben ohne Korruption

## Out of Scope

- Chart-Generierung (native PowerPoint-Charts)
- Animations/Transitions
- Bearbeitung bestehender Slides (nur Neuerstellung)
- Gradient-Fills in erzeugten Elementen
