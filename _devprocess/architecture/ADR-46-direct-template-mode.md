# ADR-46: Direct Template Mode (Abloesung Composition-Abstraktion)

**Datum:** 2026-03-22
**Ersetzt:** ADR-45 (Composition-Abstraktion entfernt, Engine beibehalten)
**Ergaenzt durch:** ADR-47 (Schema-Constrained Slide Generation -- JSON-Beispiele, Validierung, Skills)

> ### Einordnung in die Evolution (Phase 7, siehe ADR-47)
> ADR-46 ist die Basis-Architektur: physische Shape-Namen, keine Abstraktion,
> Gruppierung nach PowerPoint-Layout-Namen, lesbarer Markdown-Guide.
> ADR-47 ergaenzt die Intelligenz-Schicht: JSON-Beispiele, Required-Shape-Validierung,
> max_chars-Warnungen, vereinfachte Skills, gefuehrter Ingest-Workflow.

---

## Kontext

ADR-45 hat den richtigen Engine-Kern (pptx-automizer, TemplateEngine.ts) einfuehrt, aber
zusaetzlich eine synthetische Abstraktionsschicht aufgebaut, die nach 40+ Iterationen zu keinem
zuverlaessigen Ergebnis gefuehrt hat.

**Root Cause: Zirkulaere Abstraktion**

```
Ingest:  "KPI-Wert 1" (physischer Shape-Name)
           ↓  LayoutDeduplicator (20.9k LOC, Clustering-Algorithmus)
         "kpi_1_value" (semantischer Slot-ID)
           ↓  catalog.json gespeichert

Create:  Agent schreibt "kpi_1_value"
           ↓  CompositionResolver (7.9k LOC, 5-stufige Fuzzy-Kaskade)
         "KPI-Wert 1" (physischer Shape-Name)
           ↓  TemplateEngine.ts (pptx-automizer) — funktioniert korrekt
```

Jede Stufe kann still scheitern:
- LayoutDeduplicator: falsches Clustering → falsches representative_slide
- Slot-ID-Generierung: instabile IDs zwischen verschiedenen Templates
- CompositionResolver Stage 3-5: Fuzzy-Matches landen nur als Warning, kein Error
- Ergebnis: PPTX mit leeren oder falsch befuellten Shapes, keine Exception

**Was funktioniert hat:**
- TemplateEngine.ts (pptx-automizer Wrapper, 1196 LOC) — zuverlaessig
- Shape Discovery via pptx-automizer getAllElements — korrekt
- Das semantische Verstaendnis-Konzept (Slide-Guide fuer den Agent) — richtig

**Was nicht funktioniert hat:**
- LayoutDeduplicator Clustering → synthetische Slot-IDs
- CompositionResolver 5-stufige Fallback-Kette
- compositions.json als Interface-Ebene zwischen Agent und Engine

---

## Entscheidung

**Composition-Abstraktion vollstaendig entfernen.**

Stattdessen: Agent arbeitet direkt mit physischen Shape-Namen, die aus einem lesbaren
Markdown-Guide kommen. Slides werden nach PowerPoint-Layout-Namen gruppiert (kein Clustering).

### Neuer Ingest-Flow

```
1. pptx-automizer discoverTemplate() → TemplateSlideInfo[]
2. Gruppierung nach PowerPoint-Layout-Name (bereits in slideInfo.layoutName vorhanden)
3. Representative: Slide mit den meisten nicht-dekorativen Shapes
4. Ausgabe: catalog.json (layouts fuer TemplateEngine + slide_types fuer Agent-Guide)
```

PowerPoint-Layout-Namen sind das native Gruppierungskriterium in OOXML — stabiler und
zuverlaessiger als jeder Clustering-Algorithmus.

### Neuer Create-Flow

```
Agent liest Guide → waehlt source_slide (representative Slide-Nr.) →
befuellt content mit exakten Shape-Namen als Keys →
TemplateEngine.buildFromTemplate() → PPTX (unveraendert)
```

Kein Mapping, kein Resolver, keine Fallback-Kaskade.

### Slide-Type-Guide Format

```
### kpi-folie (Slide 45, auch: 46, 47)
**3 KPIs**
Shapes:
  - `Titel 10` [REQUIRED] title (max 80 Zeichen)
  - `KPI-Wert 1` [REQUIRED] kpi_value
  - `KPI-Label 1` [REQUIRED] kpi_label
  - `KPI-Wert 3` [optional] kpi_value
  - `KPI-Label 3` [optional] kpi_label
```

Agent-Aufruf: `source_slide: 45` + `content: { "Titel 10": "...", "KPI-Wert 1": "42%" }`

---

## Alternativen

**Vision-basierte Semantic-Analyse (ADR-33):**
Cloud Run + LibreOffice + Claude Vision → zu viel Infrastruktur-Overhead. Nie implementiert.

**LayoutDeduplicator beibehalten, Resolver fixen:**
Root Cause ist die Abstraktion selbst, nicht die Implementierung des Resolvers.
Mehr Fallback-Stufen loesen das Problem nicht — sie verschleiern es nur.

**Semantic Slot IDs als optionale Schicht:**
Waere ein Kompromiss. Aber: Transparenz und Debugbarkeit sind wichtiger als
syntaktischer Komfort. Der Agent kann mit physischen Shape-Namen umgehen.

---

## Konsequenzen

**Entfernt:**
- `LayoutDeduplicator.ts` (20.9k LOC) — Clustering, Slot-ID-Generierung, RepeatableGroups
- `CompositionResolver.ts` (7.9k LOC) — 5-stufige Fuzzy-Kaskade
- Composition-Typen aus types.ts (CompositionClass, Composition, CompositionSlot, CompositionSlideInput)
- Composition-Mode aus CreatePptxTool.ts (buildCompositionPresentation)
- RepeatableGroup-Redistribution aus TemplateEngine.ts (redistributeAfterRemove)

**Hinzugefuegt:**
- `SlideType` + `SlideTypeShape` in types.ts
- `groupByLayoutName()` in IngestTemplateTool.ts (einfache Map-Gruppierung)
- `formatSlideTypeGuide()` in TemplateCatalog.ts (lesbare Markdown-Ausgabe)
- Migration fuer alte catalogs (kein slide_types → Warning + leeres Array)

**Unveraendert:**
- `TemplateEngine.ts` — Auto-Remove, Auto-Upgrade, 10 ContentValue-Typen, alle Modify-Methoden
- `AdhocSlideBuilder.ts` — PptxGenJS Adhoc-Mode
- `RenderPresentationTool.ts` — visuelle QA via LibreOffice
- `pptxRenderer.ts` — LibreOffice-Pipeline

**Phase 2 (Vision-Enrichment):**
Optional via `render_previews: true` in ingest_template. LibreOffice rendert representative Slides,
ein LLM-Call erzeugt `visual_description` + `use_when` pro Slide-Typ. Kein per-slot enrichment,
kompakter Prompt, graceful skip wenn LibreOffice nicht verfuegbar.

---

## Entscheidungsprotokoll

Analyse nach 40+ gescheiterten Iterationen mit ADR-45-Composition-System.
Root Cause identifiziert am 2026-03-22: Zirkulaere Abstraktion als fundamentales Design-Problem.
Entscheidung fuer direkten Template-Mode als einzig valide Loesung ohne neues Abstraktionsproblem.
