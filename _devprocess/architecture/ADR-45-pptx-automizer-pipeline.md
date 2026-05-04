# ADR-45: pptx-automizer Template Pipeline (Abloesung CSS-SVG Engine)

**Superseded by:** ADR-46 (Composition-Abstraktion entfernt) → ADR-47 (Schema-Constrained)
**Deprecated:** 2026-03-22
**Datum:** 2026-03-20
**Aktualisiert:** 2026-03-21 (Vollstaendige API-Integration, Auto-Remove, Auto-Upgrade)
**Ersetzt:** ADR-44 (CSS-SVG Slide Engine), ADR-32, ADR-33, ADR-35

> ### Lesson Learned
> Die Engine (pptx-automizer Wrapper, TemplateEngine.ts) ist solid und hat sich bewaehrt.
> 10 Content-Typen, Auto-Remove, Auto-Upgrade funktionieren zuverlaessig.
> Was gescheitert ist: die Composition-Abstraktionsschicht (LayoutDeduplicator 20.9k LOC +
> CompositionResolver 7.9k LOC). Zirkulaeres Mapping physisch→semantisch→physisch ist
> verlustbehaftet und scheitert still. 40+ Iterationen, kein zuverlaessiges Ergebnis.
> **Erkenntnis:** Weniger Abstraktion = mehr Zuverlaessigkeit. Der Agent kann mit physischen
> Shape-Namen umgehen, wenn der Guide gut genug ist (ADR-46/047).

---

## Kontext

ADR-44 (CSS-SVG Engine) hat die Grundprobleme des Template-Analyzers (ADR-32/033/035) nicht geloest:
- CSS-Themes wurden generiert, aber vom Renderer nie konsumiert (HtmlSlideParser liest nur inline styles)
- SVG Asset Store (Phase 3) wurde nie implementiert
- HTML-Pipeline erreichte ~70% Design-Treue, nie 100% Corporate Design
- presentations-design Skill referenzierte geloeschte APIs (compositions.json, template_slide)

**Kernproblem:** Template-Cloning = 100% Design, 0% Flexibilitaet. HTML-Pipeline = 100% Flexibilitaet, ~70% Design.

**Loesung:** pptx-automizer ermoeglicht **content-adaptive Template-Manipulation** -- Shapes entfernen, hinzufuegen, repositionieren -- bei 100% Design-Treue.

---

## Entscheidung

**Zwei-Motoren-Architektur:**

1. **Template-Modus** (pptx-automizer): Corporate .pptx wird geklont und Shapes werden manipuliert
2. **Adhoc-Modus** (PptxGenJS): HTML-basierte Slides fuer Default-Themes

### Warum pptx-automizer als npm-Dependency (nicht geforkt)?

- Buffer-basiertes I/O (kein Filesystem noetig -- Obsidian-kompatibel)
- Shape Discovery (`getAllElements`) ersetzt Vision-basierte Analyse
- Shape Manipulation (`removeElement`, `addElement`, `modifyElement`) loest das Flexibilitaetsproblem
- PptxGenJS-Bridge (`slide.generate()`) fuer Hybrid-Slides
- 127 transitive Dependencies sind nur im dev node_modules -- Nutzer sehen nur main.js

---

## Architektur

### Module

```
src/core/office/pptx/
  types.ts            -- SlideInput, 10 ContentValue-Typen, TemplateCatalog, GenerateElement
  TemplateEngine.ts   -- pptx-automizer Wrapper, Content Dispatch, Auto-Remove, Auto-Upgrade
  TemplateCatalog.ts  -- Catalog Loading/Saving (.obsilo/themes/{name}/)
  AdhocSlideBuilder.ts -- HTML -> PptxGenJS (Adhoc-Modus)

src/core/tools/vault/
  CreatePptxTool.ts       -- Routing (Template vs Adhoc), Catalog-Durchreichung
  IngestTemplateTool.ts   -- Shape Discovery, Catalog-Generierung, Quick Reference
```

### Erhaltene Module (unveraendert)

```
src/core/office/pptxRenderer.ts     -- LibreOffice -> PNG (QA)
src/core/office/libreOfficeDetector.ts
src/core/tools/vault/RenderPresentationTool.ts
src/core/tools/vault/writeBinaryToVault.ts
assets/templates/default-*.pptx
```

---

## Content-Type-System (10 Typen)

Die `TemplateSlideInput.content` Map akzeptiert folgende Werttypen:

### Text-Manipulation

| ContentValue-Typ | pptx-automizer Methode | Beschreibung |
|---|---|---|
| `string` (plain) | `modify.setText()` | Einfache Text-Ersetzung, bewahrt Template-Formatierung |
| `styled_text` | `modify.setMultiText()` | Absaetze mit Runs (bold, italic, underline, super/subscript, color, size, bullets, levels) |
| `html_text` | `modify.htmlToMultiText()` | HTML-Input (`<b>`, `<i>`, `<br>`, `<ul>/<li>`) -- einfachstes Format fuer LLM |
| `replace_text` | `modify.replaceText()` | Token-basierte Ersetzung (z.B. `{{name}}` -> Wert), bewahrt Original-Formatierung |

### Daten-Visualisierung

| ContentValue-Typ | pptx-automizer Methoden | Beschreibung |
|---|---|---|
| `chart` | `setChartData`, `setChartScatter`, `setChartBubbles`, `setChartCombo`, `setChartVerticalLines`, `setExtendedChartData`, `setChartTitle`, `setAxisRange`, `setDataLabelAttributes`, `setLegendPosition`, `removeChartLegend`, `minimizeChartLegend`, `setPlotArea`, `setWaterFallColumnTotalToLast` | Vollstaendige Chart-Manipulation (6 Chart-Typen + 8 Enhancement-Optionen) |
| `table` | `modify.setTable()` mit `ModifyTableParams` | Tabellen mit Header/Body/Footer, per-Cell-Styles (bold, color, background), Auto-Adjust (width/height) |

### Media

| ContentValue-Typ | pptx-automizer Methode | Beschreibung |
|---|---|---|
| `image` | `modify.setRelationTarget()` | Bild-Ersetzung via Vault-Pfad (mit Image-Pipeline: vault -> temp -> loadMedia) |
| `duotone` | `modify.setDuotoneFill()` | Duoton-Effekt fuer Bild-Shapes (color, tint, saturation) |

### Transform

| ContentValue-Typ | pptx-automizer Methode | Beschreibung |
|---|---|---|
| `position` | `modify.setPosition()` | Repositionieren/Skalieren (Pixel auf 1280x720 Canvas -> EMU) |
| `rotate` | `modify.rotateShape()` | Shape-Rotation in Grad |

### Links

| ContentValue-Typ | pptx-automizer Methode | Beschreibung |
|---|---|---|
| `hyperlink` | `modify.setHyperlinkTarget()` | Externe URLs oder interne Slide-Links |

---

## Engine-Features

### Auto-Remove (Fail-Safe Default)

Shapes aus dem Catalog, die weder in `content` noch in `remove` adressiert werden, werden **automatisch entfernt** -- sofern `removable: true` im Catalog. Titel und dekorative Elemente bleiben erhalten.

**Motivation:** LLMs vergessen regelmaessig, nicht benoetigte Shapes explizit zu entfernen. Das fuehrt zu sichtbarem Platzhaltertext ("Lorem Ipsum") im Output. Auto-Remove macht das Default-Verhalten sicher: ignorierte Shapes verschwinden statt Platzhalter anzuzeigen.

### Auto-Upgrade (Multi-Line Text)

Plain Strings mit Zeilenumbruechen oder Bullet-Mustern (`- `, `* `, `1. `) werden automatisch zu `styled_text` mit korrekter Bullet-Formatierung konvertiert -- aber nur fuer Body-Shapes (nicht Titel/Subtitle).

### Catalog-Durchreichung

`CreatePptxTool` reicht den `resolved.catalog` an `TemplateEngine.buildFromTemplate()` durch. Dies ermoeglicht Auto-Remove und Auto-Upgrade ohne separate Catalog-Ladung.

### Quick Reference

`IngestTemplateTool` generiert neben dem detaillierten Catalog eine **Quick Reference**, die Slides nach Content-Typ gruppiert (Title, KPI, Process, Chart, Table, Image, Two-Column, Text). Hilft dem LLM bei der Layout-Wahl.

---

## Template-Workflow

### Ingestion (einmalig, ~1-3 Min)

```
.pptx Vorlage
  -> pptx-automizer.getInfo() -> Shape Discovery (Namen, Typen, Positionen)
  -> Catalog generieren (JSON mit Layouts, Shapes, Rollen, content_type, max_chars, dimensions)
  -> Quick Reference nach Content-Typ gruppieren
  -> Speichern: .obsilo/themes/{name}/catalog.json + template.pptx
```

### Erstellung (pro Praesentation)

```
Agent waehlt source_slide aus Catalog (Quick Reference -> richtige Layout-Wahl)
  -> content: { "Shape": value }     -- 10 Content-Typen (string, styled_text, html_text, chart, ...)
  -> Nicht-adressierte Shapes: Auto-Remove (kein Platzhaltertext)
  -> Multi-Line Strings: Auto-Upgrade zu styled_text
  -> generate: [...]                  -- PptxGenJS Hybrid-Elemente
  -> pptx-automizer klont Slide + manipuliert Shapes
  -> PPTX Output als ArrayBuffer -> writeBinaryToVault
```

---

## API-Abdeckung

Von ~30 pptx-automizer `modify.*` Methoden sind **20 vollstaendig integriert**.
Die verbleibenden 10 sind Debug-Tools (`dump`), Low-level XML-Utilities (`setAttribute`),
Duplikate (`addHyperlink` = `setHyperlinkTarget`), oder nicht als Callback-Factory
exponiert (`setSolidFill`).

---

## Konsequenzen

**Positiv:**
- Template-Ingestion: ~1-3 Min statt 30-60 Min (kein LibreOffice + Vision noetig)
- 100% Corporate Design-Treue (OOXML bleibt unveraendert)
- Content-adaptive Layouts (Auto-Remove + explizites Remove)
- 10 Content-Typen: Text (4 Varianten), Charts (6 Typen + 8 Optionen), Tables (mit Styles), Images, Transform, Links
- Auto-Remove verhindert Platzhaltertext bei vergessenen Shapes
- Auto-Upgrade formatiert Multi-Line-Text korrekt als Bullets
- Quick Reference verbessert Layout-Wahl des LLMs
- html_text als einfachstes Format fuer LLM-generierte Inhalte

**Negativ / Risiken:**
- npm-Dependency pptx-automizer (~127 transitive deps in dev)
  -> Mitigation: Nutzer installiert keine deps, esbuild bundelt alles
- Shape-Namen muessen exakt aus dem Catalog kommen
  -> Mitigation: create_pptx ohne Slides zeigt den Catalog an
- Auto-Remove koennte unbeabsichtigt Shapes entfernen bei falscher Catalog-Klassifizierung
  -> Mitigation: Nur `removable: true` Shapes betroffen (Titel/Dekorativ bleiben)
- Default-Templates haben aktuell nur 1 Layout (Title)
  -> Mitigation: Aufwertung geplant, adhoc Modus als Fallback

---

## Alternativen verworfen

**CSS-SVG Engine (ADR-44):** CSS nie konsumiert, SVG Store nie gebaut, ~70% Design-Treue.
**Reines JSZip-Klonen:** Keine Shape-Manipulation moeglich (altes Problem: leere Shapes).
**Puppeteer/Chromium:** Kein editierbarer Text in PPTX.
**Forken von pptx-automizer:** Unnoetig, npm-Dependency ist sauberer und wartbarer.
**Nur SKILL.md Guidance (ohne Code-Level Auto-Remove):** Zweimal getestet, Agent ignoriert Guidance konsequent -- Platzhaltertext bleibt stehen. Code-Level Fail-Safe noetig.
