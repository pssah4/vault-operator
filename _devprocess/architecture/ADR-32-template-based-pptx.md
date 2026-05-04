# ADR-32: Template-basierte PPTX-Erzeugung (JSZip + OOXML)

**Superseded by:** ADR-45 → ADR-46 → ADR-47 (Schema-Constrained Slide Generation)
**Deprecated:** 2026-03-22
**Date:** 2026-03-09
**Amended:** 2026-03-13
**Deciders:** Sebastian Hanke
**Supersedes:** PPTX-Teil von ADR-30 (pptxgenjs)

> ### Lesson Learned
> Rohes OOXML-XML per JSZip zu schreiben ist zu fragil fuer beliebige Templates.
> Custom Geometry (custGeom) nicht manipulierbar via String-Templates. Kein Shape-Discovery.
> **Erkenntnis:** Man braucht eine Library die OOXML-Komplexitaet abstrahiert UND Shape-Discovery bietet.
> → Geloest durch pptx-automizer in ADR-45/046/047.

## Context

EPIC-11 erfordert professionelle PPTX-Erzeugung mit voller Design-Treue. Der bisherige Ansatz (EPIC-10, ADR-30) nutzte pptxgenjs fuer programmatische Erzeugung "from scratch". Drei Iterationen der Theme-Extraktionslogik haben gezeigt, dass dieser Ansatz die Design-Treue einer echten Vorlage nicht erreichen kann:

1. **Iteration 1 (Farben + Fonts):** Nur Grundfarbe und Schriftart uebernommen -- sieht generisch aus
2. **Iteration 2 (+ Hintergruende, Shapes, Logos):** Dekorative Elemente aus Slide-Master extrahiert -- Positionierung ungenau, Gradient-Approximation unbefriedigend
3. **Iteration 3 (+ Platzhalter-Positionen, Font-Sizes):** Layout-Positionen aus Slide-Layouts extrahiert -- strukturelle Elemente (echte Platzhalter, Theme-XML-Referenzen) fehlen weiterhin

**Root Cause:** pptxgenjs erzeugt keine echten OOXML Slide-Masters, Slide-Layouts oder Theme-XML-Referenzen. Es platziert "flache" Shapes auf Slides. Selbst bei perfekter Extraktion aller visuellen Attribute fehlt die semantische OOXML-Struktur, die PowerPoint fuer konsistentes Rendering benoetigt.

**Triggering ASR:**
- Design-Treue bei User-Template-Upload (EPIC-11)
- Professional-Level Default-Output
- Quality Attribute: Visuelle Qualitaet, Design-Treue

## Decision Drivers

- **Design-Treue:** User-Templates muessen 1:1 uebernommen werden (Masters, Layouts, Theme, Hintergruende, Logos)
- **Einheitlicher Code-Pfad:** Identische Engine fuer User-Templates und Default-Templates
- **Keine neue Dependency:** JSZip ist bereits vorhanden (Document Parsing Pipeline, ADR-24)
- **OOXML-Kontrolle:** Volle Kontrolle ueber das erzeugte XML statt Abstraktionslayer
- **Bundle-Groesse:** pptxgenjs-Entfernung spart ~500 KB

## Considered Options

### Option 1: pptxgenjs mit verbesserter Extraktion (Status Quo)

Weiter pptxgenjs nutzen, Extraktion weiter verfeinern.

- Pro: Keine Architektur-Aenderung, bestehender Code bleibt
- Con: Fundamentale Limitierung -- keine echten Masters/Layouts/Theme-Referenzen
- Con: Drei Iterationen haben gezeigt: Extraktionsansatz erreicht keine Design-Treue
- Con: Doppelter Code-Pfad (mit Template vs. ohne Template)

### Option 2: Template-Kopie + OOXML-Injection via JSZip (gewaehlt)

Template-PPTX kopieren, bestehende Content-Slides entfernen, neue Slides als OOXML-XML injizieren.

- Pro: Volle Design-Treue -- alles im Template bleibt exakt erhalten
- Pro: Einheitlicher Code-Pfad (Default-Template = mitgelieferte PPTX)
- Pro: Keine neue Dependency (JSZip vorhanden)
- Pro: Bundle-Groesse sinkt (~500 KB weniger durch pptxgenjs-Entfernung)
- Con: OOXML-XML muss korrekt erzeugt werden (komplex, aber deterministisch)
- Con: Eigene Slide-Erstellungslogik statt Library-Abstraktion

### Option 3: python-pptx via WASM oder Server

python-pptx (die Referenz-Library fuer Template-Manipulation) via WASM kompilieren oder als Server-Prozess.

- Pro: Matureste Library fuer Template-basierte PPTX-Manipulation
- Con: Python -> WASM Kompilierung fragil und gross
- Con: Server-Prozess widerspricht Plugin-Architektur
- Con: Massiver Aufwand fuer marginalen Vorteil

## Decision

**Option 2: Template-Kopie + OOXML-Injection via JSZip**

### Architektur

```
User-Request
  │
  ├── Hat User Template? ─── JA ──→ User-PPTX als Basis
  │                          NEIN ─→ Default-Template als Basis
  │
  ▼
Template-PPTX (ZIP) oeffnen via JSZip
  │
  ├── Slide-Masters, Slide-Layouts, Theme-XML  ── BEHALTEN
  ├── ppt/slides/slide*.xml                     ── ENTFERNEN
  ├── Relationships + Content-Types             ── AKTUALISIEREN
  │
  ▼
Neue Slides als OOXML-XML erzeugen
  │
  ├── Layout-Referenz pro Slide (aus slideMaster/slideLayouts)
  ├── Text in Platzhalter (<p:sp> mit <p:ph>) schreiben
  ├── Tabellen als <a:tbl> XML
  ├── Bilder als Relationships + <p:pic>
  │
  ▼
ZIP schliessen → ArrayBuffer → writeBinaryToVault()
```

### OOXML-Slide-Struktur (vereinfacht)

Jeder Slide ist eine XML-Datei (`ppt/slides/slideN.xml`) mit:

```xml
<p:sld xmlns:p="..." xmlns:a="..." xmlns:r="...">
  <p:cSld>
    <p:spTree>
      <!-- Platzhalter-Shapes mit Text -->
      <p:sp>
        <p:nvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>  <!-- Position aus Layout uebernommen -->
        <p:txBody>
          <a:p><a:r><a:t>Slide Title</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
```

Der entscheidende Unterschied zu pptxgenjs: Slides referenzieren echte Slide-Layouts (`<p:sld>`-Attribut), die wiederum Slide-Masters referenzieren. Alle visuellen Eigenschaften (Hintergrund, Fonts, Farben, Positionen) werden aus dieser Kette geerbt.

## Consequences

### Positive
- Design-Treue: User-Templates werden 1:1 uebernommen
- Bundle-Reduktion: ~500 KB weniger (pptxgenjs entfaellt)
- Keine neue Dependency: JSZip bereits vorhanden
- Einheitlicher Code-Pfad fuer alle PPTX-Erzeugung
- Volle Kontrolle ueber OOXML-Output

### Negative
- Hoehere Implementierungskomplexitaet (OOXML-XML manuell erzeugen)
- OOXML-Spezifikation ist umfangreich -- nur Subset implementiert (Text, Tabellen, Bilder)
- Kein Abstraktionslayer -- Aenderungen am Output erfordern OOXML-Wissen
- Eigene Test-Strategie noetig (ZIP-Struktur-Validierung, PowerPoint-Kompatibilitaet)

### Risks
- **OOXML-Kompatibilitaet:** Mitigation durch Referenz-Slides aus echten PPTX als Vorlage fuer XML-Generierung; Tests mit PowerPoint, LibreOffice, Google Slides
- **Relationship-Konsistenz:** Mitigation durch systematisches rId-Tracking und Content-Type-Registry
- **Template-Varianz:** Mitigation durch defensive Parsing (fehlende Layouts -> Fallback auf Content-Layout)

## Implementation Notes

- JSZip oeffnet Template als ZIP, DOMParser parst XML-Dateien
- Neue Slides werden als String-Templates erzeugt (keine DOM-Manipulation fuer Output)
- Default-Templates als `.pptx`-Assets im Plugin gebundelt (Verzeichnis: `assets/templates/`)
- pptxgenjs wird aus package.json entfernt nach erfolgreicher Migration
- Slide-Layout-Mapping: Agent gibt `layout`-Feld an, Engine mappt auf passenden `slideLayout*.xml` im Template

## Related Decisions

- ADR-30: Library-Selection (PPTX-Teil superseded)
- ADR-29: Input-Schema-Design (Schema bleibt unveraendert -- nur Engine dahinter aendert sich)
- ADR-31: Binary-Write-Pattern (writeBinaryToVault() bleibt unveraendert)
- ADR-24: Parsing-Library-Selection (JSZip bereits gewaehlt)
- ADR-33: Multimodaler Template-Analyzer (semantische Analyse-Schicht ueber dieser Engine)
- ADR-34: Visual Design Language Document (Skill-Format fuer die Analyse-Ergebnisse)
