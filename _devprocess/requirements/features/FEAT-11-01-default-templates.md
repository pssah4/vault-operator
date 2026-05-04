# Feature: Default PPTX Templates

> **Feature ID**: FEAT-11-01
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

2-3 professionell gestaltete PPTX-Vorlagen die mit dem Plugin ausgeliefert werden. Diese dienen als Basis fuer Praesentationen wenn der User kein eigenes Template hat. Jedes Template enthaelt echte Slide-Masters, Slide-Layouts, ein Theme-XML und professionelles Styling.

## Templates

| Template | Charakter | Farbschema | Primaer-Font |
|----------|-----------|------------|-------------|
| `executive.pptx` | Corporate, serioes, dezent | Dunkles Navy (#1B3A5C) + Gold-Akzent | Calibri |
| `modern.pptx` | Hell, klar, zeitgemaess | Blau (#4472C4) + Orange-Akzent | Calibri |
| `minimal.pptx` | Schwarz/Weiss, typografisch | Schwarz (#1A1A2E) + Grau | Arial |

### Enthaltene Slide-Layouts pro Template

Jedes Template enthaelt mindestens diese Layouts:
1. **Title** -- Grosse Ueberschrift + Untertitel, zentriert
2. **Section** -- Section-Divider mit Akzentfarbe
3. **Content** -- Titel oben + Body-Bereich (Bullets/Text/Tabelle)
4. **Two Column** -- Titel + zwei Inhalts-Spalten
5. **Image Right** -- Text links, Bild-Platzhalter rechts
6. **Comparison** -- Zwei Spalten mit Sub-Titeln
7. **Blank** -- Leerer Slide (nur Speaker-Notes)

### Template-Erstellung

Templates werden manuell in PowerPoint erstellt und als Assets gebundelt:
1. PPTX in PowerPoint erstellen mit allen 7 Layouts
2. Styling konsistent ueber Slide-Master und Theme-XML definieren
3. Beispiel-Slides entfernen (nur Masters + Layouts bleiben)
4. Als `assets/templates/{name}.pptx` ablegen

## Success Criteria

| ID | Criterion | Target |
|----|-----------|--------|
| SC-01 | Jedes Template oeffnet fehlerfrei in PowerPoint/LibreOffice/Google Slides | 100% |
| SC-02 | Jedes Template enthaelt mindestens 7 Slide-Layouts | 7 |
| SC-03 | Template-Groesse < 200 KB pro Datei | Kein Bundle-Bloat |
| SC-04 | Templates sind visuell professionell (nicht als "generiert" erkennbar) | Subjektiv |

## Definition of Done

- [ ] 2-3 PPTX-Templates erstellt und in `assets/templates/` abgelegt
- [ ] Jedes Template hat 7 Slide-Layouts mit korrekten Platzhalter-Typen
- [ ] Templates oeffnen fehlerfrei in PowerPoint, LibreOffice, Google Slides
- [ ] TemplateManager kann Templates laden und verfuegbare Layouts auflisten
- [ ] Gesamt-Groesse aller Templates < 500 KB

## Dependencies

- **PowerPoint:** Fuer manuelle Template-Erstellung
- **FEAT-11-00:** Template-Engine muss Templates verarbeiten koennen

## Out of Scope

- Branchen-spezifische Templates (Finance, Healthcare etc.)
- Templates mit eingebetteten Bildern/Logos (nur Formen und Farben)
- Template-Editor im Plugin
