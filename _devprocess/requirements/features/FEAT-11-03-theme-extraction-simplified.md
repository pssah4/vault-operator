# Feature: Theme-Extraktion (vereinfacht)

> **Feature ID**: FEAT-11-03
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P1-High
> **Effort Estimate**: S
> **Note**: **DEPRECATED** -- In FEAT-11-08 integriert, dann durch ADR-44-047 abgeloest

## Feature Description

Vereinfachte Theme-Extraktion aus PPTX-Dateien. Im neuen template-basierten Ansatz (ADR-32) wird die Extraktion NUR fuer Kontextinformationen benoetigt -- nicht mehr fuer die Generierung. Die eigentliche Design-Anwendung passiert durch Template-Kopie.

## Scope-Aenderung gegenueber EPIC-10

| Aspekt | Alter Ansatz (pptxgenjs) | Neuer Ansatz (Template-basiert) |
|--------|--------------------------|-------------------------------|
| Zweck der Extraktion | Design nachbauen in pptxgenjs | Kontext fuer Agent + Memory |
| Extrahierte Daten | Farben, Fonts, Hintergruende, Shapes, Positionen, Bilder (base64) | Nur Farben + Fonts + Layout-Namen |
| Komplexitaet | Hoch (600+ LOC) | Niedrig (~100 LOC) |
| Base64-Bilder | Ja (Hintergruende, Logos) | Nein (nicht noetig) |
| Platzhalter-Positionen | Ja (EMU -> Inches) | Nein (Template behaelt Layouts) |

## Was bleibt

- **Farben aus ppt/theme/theme1.xml:** Primary, Secondary, Accent, Background, Text (fuer Memory + Agent-Kontext)
- **Fonts aus ppt/theme/theme1.xml:** Heading + Body Font (fuer Memory + Agent-Kontext)
- **Layout-Namen:** Welche Slide-Layouts sind im Template verfuegbar (fuer Layout-Mapping)
- **<design_theme> Block:** Wird weiterhin im PptxParser-Output eingebettet

## Was entfaellt

- Slide-Master-Parsing fuer Hintergrundbilder (base64)
- Dekorative Shape-Extraktion (Rects, Lines, Images)
- Platzhalter-Position-Extraktion (EMU-Konvertierung)
- Font-Size-Extraktion aus Platzhaltern
- Relationship-Lookup fuer eingebettete Bilder
- PptxMasterObject Interface und Mapping
- Groessen-Limits fuer base64-Daten

## Success Criteria

| ID | Criterion | Target |
|----|-----------|--------|
| SC-01 | Farben und Fonts werden korrekt aus theme1.xml extrahiert | 100% |
| SC-02 | Layout-Namen werden aus slideLayouts/ aufgelistet | 100% |
| SC-03 | `<design_theme>` Block im PptxParser-Output enthaelt Farben + Fonts | Funktional |
| SC-04 | themeExtractor.ts ist deutlich vereinfacht (< 200 LOC) | Code-Qualitaet |

## Definition of Done

- [ ] themeExtractor.ts vereinfacht (nur Farben, Fonts, Layout-Namen)
- [ ] PptxParser.ts erzeugt `<design_theme>` Block mit vereinfachtem Theme
- [ ] DesignTheme Interface vereinfacht (PptxMasterObject etc. entfernt)
- [ ] Alte Extraktionslogik (Shapes, Bilder, Positionen) entfernt

## Dependencies

- **FEAT-11-00:** Template-Engine definiert was extrahiert werden muss
- **Existing:** PptxParser, themeExtractor (werden vereinfacht, nicht neu gebaut)
