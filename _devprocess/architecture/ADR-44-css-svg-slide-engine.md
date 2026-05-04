# ADR-44: CSS-SVG Slide Engine (Ablösung PPTX Template Analyzer)

**Superseded by:** ADR-45 → ADR-46 → ADR-47 (Schema-Constrained Slide Generation)
**Deprecated:** 2026-03-22
**Datum:** 2026-03-18
**Ersetzt:** ADR-32, ADR-33, ADR-35 (Template-Analyzer-Ansatz)

> ### Lesson Learned
> HTML/CSS ist gut fuer Adhoc-Slides, aber fuer Corporate Design ungeeignet (~70% Design-Treue).
> 100% Design-Treue erfordert Arbeit mit dem Original-PPTX, nicht Nachbau in anderem Format.
> CSS-Themes wurden generiert aber nie konsumiert (HtmlSlideParser liest nur inline styles).
> SVG Asset Store (Phase 3) wurde nie gebaut. Paradigmenwechsel war zu radikal.
> **Erkenntnis:** Das Original-PPTX ist die Single Source of Truth fuer Corporate Design.
> → Geloest durch pptx-automizer in ADR-45 (klont Original-Slides statt nachzubauen).

---

## Kontext

Der bisherige Ansatz (Template-Analyzer + Compositions-Pipeline) hat eine fundamentale Schwäche:
Er versucht, PPTX-interne XML-Strukturen zu verstehen und zu replizieren — ein Reverse-Engineering-Problem,
das mit jeder Vorlage neu gelöst werden muss.

**Gelernte Probleme:**
- 30-60 Min Analyse-Run pro Template (LibreOffice + Vision + Embedding)
- 89 Composition-IDs → Agent halluziniert falsche Namen
- 37k chars Skill-Datei → Ratenlimits, Kontext-Overflows
- `clone`-Pipeline: JSZip XML-Manipulation bricht bei Custom Geometry
- `get_composition_details` API: hohe Latenz, viele Tool-Calls nötig
- `compositions.json`: schwer wartbar, schwer debuggbar

**Kernfrage:** Warum versuchen wir, PPTX-Interna nachzubauen, wenn HTML/CSS beliebige Layouts darstellen kann?

---

## Entscheidung

**Neues Paradigma: "Corporate Design als CSS-Theme, nicht als PPTX-Klon"**

Ein Corporate Template wird **einmalig** in ein **CSS-Theme + SVG-Asset-Store** umgewandelt.
Präsentationen werden als HTML erzeugt und anschließend zu PPTX konvertiert.

Der Agent schreibt HTML — etwas das LLMs bereits sehr gut können.

---

## Architektur

### Schicht 1: Theme Ingestion (einmalig, ~2-5 Min)

```
PPTX-Vorlage
  ↓ pptxRenderer (existiert bereits)
  ↓ Screenshots aller Slides (PNG, 1280×720)
  ↓ Claude Vision (Batch-Analyse)
  ↓
theme.css          — Corporate Design als CSS Custom Properties + Layout-Klassen
patterns.md        — 6-8 HTML-Muster (vollständige Templates, keine Abstraktionen)
assets/            — SVG-Dateien für dekorative Formen
SKILL.md           — Kompakter Skill-Body (CSS-Referenz + Muster-Übersicht, ~2-3k chars)
```

**Vision-Analyse extrahiert:**
- Farben → `--primary`, `--accent`, `--bg-dark`, `--bg-light` CSS-Variablen
- Schriften → Font-Familie-Namen (für @font-face Referenz)
- Layout-Typen → identifiziert 6-8 wiederkehrende Muster
- Dekorative Formen → als SVG exportiert (Chevrons, Cards, Divider-Linien)

### Schicht 2: CSS Theme Struktur

```css
/* enbw-theme.css */
:root {
  --primary: #000099;        /* Tiefenblau */
  --accent: #E4DAD4;         /* Warmgrau */
  --accent-green: #84C041;
  --bg-dark: #000099;
  --bg-light: #FFFFFF;
  --font-heading: "EnBW Sans Headline", sans-serif;
  --font-body: "EnBW Sans Text Light", sans-serif;
  --slide-w: 1280px;
  --slide-h: 720px;
}

/* Layout-Klassen */
.slide { position: relative; width: 1280px; height: 720px; overflow: hidden; }
.slide-dark { background: var(--bg-dark); color: white; }
.slide-light { background: var(--bg-light); color: var(--primary); }

/* Corporate Muster */
.kpi-card { background: var(--accent); border-radius: 4px; padding: 24px; }
.process-step { clip-path: polygon(0 0, 85% 0, 100% 50%, 85% 100%, 0 100%, 15% 50%); }
.section-divider { border-left: 4px solid var(--accent-green); padding-left: 24px; }
```

### Schicht 3: SVG Asset Store

Für Formen die mit reinem CSS nicht darstellbar sind (komplexe Custom Geometry):

```
assets/
  chevron.svg        — Pfeil-Form für Prozess-Slides
  card-rounded.svg   — Gerundete Karte (fill=parameterisierbar)
  divider-accent.svg — Farbige Trennlinie
  logo.svg           — Corporate Logo
```

SVG-Assets werden durch Farb-Parameter anpassbar gemacht:
```svg
<svg><rect fill="var(--color, #E4DAD4)" .../></svg>
```

### Schicht 4: Pattern Library (patterns.md)

6-8 vollständige HTML-Muster als Startpunkte:

```html
<!-- MUSTER: title-dark -->
<div class="slide slide-dark">
  <div class="slide-title">{{title}}</div>
  <div class="slide-subtitle">{{subtitle}}</div>
  <img class="logo" src="assets/logo.svg">
</div>

<!-- MUSTER: agenda -->
<div class="slide slide-dark">
  <div class="slide-header">{{title}}</div>
  <ol class="agenda-list">{{items}}</ol>
</div>

<!-- MUSTER: kpi-3 -->
<div class="slide slide-light">
  <div class="slide-header">{{title}}</div>
  <div class="kpi-row">
    <div class="kpi-card">{{kpi_1}}</div>
    <div class="kpi-card">{{kpi_2}}</div>
    <div class="kpi-card">{{kpi_3}}</div>
  </div>
</div>
```

### Schicht 5: Skill (minimal, ~2k chars)

```markdown
## EnBW Theme — CSS Reference

**Colors:** --primary(#000099) --accent(#E4DAD4) --accent-green(#84C041)
**Fonts:** EnBW Sans Headline (headings) / EnBW Sans Text Light (body)

**Layout-Klassen:**
- `.slide-dark` — Dunkler Hintergrund (Titel, Agenda, Abschluss)
- `.slide-light` — Heller Hintergrund (Inhaltsfolien)
- `.kpi-card` — Kennzahlen-Karte (accent-Hintergrund)
- `.process-step` — Chevron-Form für Prozessschritte
- `.two-column` — Zweispaltiges Layout

**Verfügbare Muster:** title-dark, agenda, kpi-3, process-5, two-column, content, section, closing
→ Vollständige HTML-Muster sind in der Theme-Datei hinterlegt.
```

### Schicht 6: Präsentationserstellung

```
Agent → HTML-Slides schreiben (nutzt CSS-Klassen + Muster)
      → create_pptx({ slides: [ {html: "...", layout: "kpi-3"}, ... ] })
      → HtmlSlideParser (existiert bereits) → PptxGenJS
      → PPTX-Datei
```

**Kein:** `get_composition_details`, compositions.json, clone-Pipeline, JSZip-Manipulation.

---

## Neue Tool-Struktur

### `ingest_template` (neu, ersetzt `analyze_pptx_template`)

```typescript
// Input
{
  template_path: "path/to/template.pptx"
  theme_name: "enbw"               // Kurzname für Asset-Store
  sample_slides?: [1, 5, 10, 15]  // optional: Welche Slides als Muster
}

// Ablauf (5 Min statt 60 Min)
1. pptxRenderer → Screenshots (alle oder gefiltert)
2. Claude Vision (1 Batch-Call) → Farben, Fonts, Layout-Typen
3. SVG-Export der erkannten Dekorations-Shapes
4. CSS-Datei generieren
5. HTML-Muster generieren (1 Muster pro Layout-Typ)
6. SKILL.md schreiben
```

### `create_pptx` (vereinfacht)

```typescript
// Input — viel einfacher als bisher
{
  theme: "enbw",
  slides: [
    {
      pattern: "title-dark",          // Muster-Name aus patterns.md
      content: {
        title: "Genema – KI-gestützte Planänderungserkennung",
        subtitle: "Status Quo POC | März 2026"
      }
    },
    {
      pattern: "kpi-3",
      content: {
        title: "Problemstellung",
        kpi_1: { label: "Zeitaufwand", text: "Revisionen..." },
        kpi_2: { label: "Fehleranfällig", text: "Übersehene..." },
        kpi_3: { label: "Wissensverlust", text: "Fachbereiche..." }
      }
    }
  ]
}
```

---

## Was gelöscht wird

| Datei/Modul | Grund |
|---|---|
| `TemplateAnalysisJob.ts` | Komplette Analyse-Pipeline (30-60 Min) — ersetzt durch `ingest_template` |
| `AnalyzePptxTemplateTool.ts` | Tool-Wrapper für obiges |
| `PptxTemplateAnalyzer.ts` | Vision-Analyse für compositions.json |
| `PptxTemplateCloner.ts` | JSZip XML-Cloning — wird nicht mehr benötigt |
| `PptxTemplateEngine.ts` | Routing clone/html/legacy |
| `PptxTemplateOverlay.ts` | HTML-over-clone hybrid |
| `SlideXmlBuilder.ts` | Direktes XML-Schreiben |
| `TemplateManager.ts` | Template-Pfad-Verwaltung |
| `CompositionsRepository.ts` | compositions.json I/O |
| `TemplateAnalysisArtifacts.ts` | Artifact-Generierung für compositions |
| `compositionsSchema.ts` | Zod-Schema für compositions.json |
| `GetCompositionDetailsTool.ts` | Kein Lookup mehr nötig |
| `MultimodalAnalyzer.ts` | Ersetzt durch einfacheren Vision-Batch |
| `tools/template-analyzer/` | Python Streamlit App |
| `assets/templates/*.pptx` | Default-Templates (werden neu generiert als CSS-Themes) |

## Was erhalten bleibt und angepasst wird

| Datei/Modul | Anpassung |
|---|---|
| `HtmlSlideParser.ts` | Core-Engine — bleibt, minimal anpassen |
| `pptxRenderer.ts` | Screenshot-Engine für Ingestion — bleibt |
| `CreatePptxTool.ts` | Vereinfachtes Input-Schema |
| `CreatePptxService.ts` | Routing-Logik vereinfachen |
| `PresentationBuilder.ts` | HTML-Rendering, bleibt |
| `SkillsManager.ts` | Compression-Logik anpassen |

---

## Phasen-Plan

### Phase 1 — Clean Slate (sofort)
- Alle markierten Dateien löschen
- Build wieder grün bekommen
- `create_pptx` auf HTML-only-Modus reduzieren (kein clone)

### Phase 2 — Theme Ingestion (MVP)
- `ingest_template` Tool implementieren
- Vision-Batch für Farb- und Layout-Extraktion
- CSS-Theme-Generator
- HTML-Muster-Generator (6 Typen)
- SKILL.md-Generator (kompakt)

### Phase 3 — SVG Asset Store
- SVG-Export der erkannten Dekorations-Shapes
- CSS-Parameterisierung der SVG-Farben
- Asset-Referenz in HTML-Mustern

### Phase 4 — Qualitätssicherung
- Visueller Vergleich: Original-Template vs. generierte Folie
- Diff-Tool: Screenshot-Vergleich
- Iterative Verbesserung des CSS-Themes

---

## Konsequenzen

**Positiv:**
- Ingestion: 5 Min statt 60 Min
- Skill-Datei: ~2k chars statt 37k chars
- Kein `get_composition_details` Loop
- Agent schreibt HTML — was LLMs sehr gut können
- CSS/SVG ist wartbar, versionierbar, debuggbar
- Keine Ratenlimit-Probleme mehr

**Negativ / Risiken:**
- CSS-Rendering in PPTX via PptxGenJS ist nicht 100% identisch mit PowerPoint-Rendering
  → Mitigation: Screenshot-Vergleich in Phase 4
- Custom Fonts müssen im Export verfügbar sein
  → Mitigation: Fallback-Fonts definieren, Font-Embedding in Phase 3
- SVG-Export aus PPTX ist nicht immer verlustfrei
  → Mitigation: Formen die nicht als SVG exportierbar sind, als CSS-Klassen neu implementieren

---

## Alternativen verworfen

**PPTX-Clone (bisher):** Zu komplex, zu fragil, zu langsam.
**Konzept A (Screenshot als Hintergrund):** Nicht editierbar — akzeptabel als Fallback, nicht als Hauptansatz.
**Konzept D (Puppeteer):** Kein editierbarer Text in PPTX — zu viel verloren.
