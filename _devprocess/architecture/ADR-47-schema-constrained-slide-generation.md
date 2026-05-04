# ADR-47: Schema-Constrained Slide Generation

**Datum:** 2026-03-23
**Ergaenzt:** ADR-46 (Direct Template Mode bleibt Basis)
**Erweitert durch:** ADR-48 (plan_presentation Pipeline), ADR-49 (Raw XML Clear + Generate)

> ### Post-Test Erkenntnis 1 (2026-03-23, nach Test 1)
> Die technischen Constraints (JSON-Beispiele, Required-Validierung, gekuerzte Skills)
> sind notwendig und bleiben aktiv. Aber der Agent transformiert Quellmaterial nicht
> in Folien-Content. ADR-48 loest dies mit plan_presentation Tool.
>
> ### Post-Test Erkenntnis 2 (2026-03-23, nach Test 3)
> plan_presentation erzeugt korrekte Plaene (inhaltlich excellent), ABER die
> PPTX-Engine (modifyElement) kann inherited Layout-Shapes nicht modifizieren.
> Beispieltexte bleiben stehen, neue Texte werden ueberlagert.
> Ursache: `modifyElement()` findet nur physische Slide-Level Shapes, nicht
> vom SlideLayout geerbte Shapes. ADR-49 loest dies mit Raw XML Clear + Generate.
>
> ### Post-Test Erkenntnis 3 (2026-03-23, nach Phase-1-4 Fixes)
> Auch der Hybrid-Fallback (removeElement + generate) scheitert, weil removeElement
> inherited Shapes ebenfalls nicht entfernen kann. generate() legt neue Textboxen
> UEBER die nicht-loeschbaren alten -- sichtbar als Textueberlageru. Loesung: ADR-49.

---

## Architektur-Evolution: PPTX-Template-Pipeline (vollstaendige Historie)

Diese Sektion dokumentiert alle Ansaetze die seit EPIC-11 (Office Document Quality) verfolgt
wurden, warum sie gescheitert sind und welche Erkenntnisse in den aktuellen Ansatz eingeflossen sind.

### Phase 1: From-Scratch-Generierung (ADR-30, vor Maerz 2026)

**Ansatz:** pptxgenjs erzeugt PPTX programmatisch. Theme-Extraktion (Farben, Fonts, Layouts)
aus der Vorlage, dann Slides from scratch nachbauen.

**3 Iterationen der Theme-Extraktion:**
1. Nur Farben + Fonts → sah generisch aus
2. + Hintergruende, Shapes, Logos → Positionierung ungenau, Gradients approximiert
3. + Platzhalter-Positionen, Font-Sizes → strukturelle OOXML-Elemente fehlen trotzdem

**Lesson Learned:** pptxgenjs erzeugt keine echten OOXML Slide-Masters/Layouts/Theme-Referenzen.
Selbst bei perfekter Extraktion fehlt die semantische OOXML-Struktur. From-Scratch kann
Corporate Design nicht 1:1 reproduzieren.

### Phase 2: JSZip OOXML-Injection (ADR-32, Maerz 2026)

**Ansatz:** Template-PPTX per JSZip oeffnen, Content-Slides entfernen, neue Slides als
rohes OOXML-XML injizieren. Einheitlicher Codepfad fuer User- und Default-Templates.

**Gescheitert weil:**
- OOXML-Spezifikation ist extrem komplex (Relationships, Content-Types, rId-Tracking)
- Custom Geometry (custGeom) nicht manipulierbar via String-Templates
- Kein Shape-Discovery -- Agent weiss nicht welche Shapes existieren
- Jede Template-Variante erfordert neue XML-Patterns

**Lesson Learned:** Rohes OOXML-Schreiben ist zu fragil. Man braucht eine Library die die
OOXML-Komplexitaet abstrahiert und Shape-Discovery bietet.

### Phase 3: Multimodale Cloud-Analyse (ADR-33 + ADR-34, Maerz 2026)

**Ansatz:** Externer Cloud Run Service mit LibreOffice + python-pptx + Claude Vision.
Slides rendern, visuell analysieren, "Visual Design Language Document" als Skill generieren.

**Nie implementiert weil:**
- Zu viel Infrastruktur-Overhead (Docker, Cloud Run, CORS, BYOK-Key-Handling)
- Widerspricht Plugin-Philosophie (alles lokal, keine externe Abhaengigkeit)
- Analyse dauert 30-60 Min pro Template
- Generiertes Skill-Dokument (37k chars) sprengt 16k SkillsManager-Limit

**Lesson Learned:** Externe Services sind fuer ein Obsidian Plugin der falsche Weg.
Die Analyse muss lokal und schnell sein. Das 16k-Skill-Limit ist eine harte Grenze.

### Phase 4: Visual Intelligence mit Agent-Analyse (ADR-35, Maerz 2026)

**Ansatz:** Zwei-Stufen-Retrieval: Kompakter Skill (~5k) + compositions.json (on-demand).
Agent analysiert Templates selbst (PPTX + PDF). LibreOffice lokal fuer QA.

**Teilweise implementiert, dann verworfen weil:**
- compositions.json als Interface-Ebene war ueberkomplex
- get_composition_details Tool-Calls erhoehten Latenz
- Agent vergisst regelmaessig, Kompositionen nachzuladen
- Das "Agent analysiert selbst"-Pattern funktionierte, wurde in ADR-46 vereinfacht

**Lesson Learned:** Two-Tier Retrieval ist unnoetig wenn die Primaer-Information kompakt genug ist.
On-demand Nachladen erzeugt mehr Fehler als es loest.

### Phase 5: CSS-SVG Slide Engine (ADR-44, 2026-03-18)

**Ansatz:** Paradigmenwechsel: Corporate Design als CSS-Theme + SVG-Assets + HTML-Muster.
Agent schreibt HTML (was LLMs gut koennen), PptxGenJS konvertiert zu PPTX.

**Gescheitert weil:**
- CSS-Themes wurden generiert aber nie konsumiert (HtmlSlideParser liest nur inline styles)
- SVG Asset Store (Phase 3) wurde nie implementiert
- HTML-Pipeline erreichte ~70% Design-Treue, nie 100% Corporate Design
- presentation-design Skill referenzierte geloeschte APIs

**Lesson Learned:** HTML/CSS ist gut fuer Adhoc-Slides, aber fuer Corporate Design ungeeignet.
100% Design-Treue erfordert Arbeit mit dem Original-PPTX, nicht Nachbau in anderem Format.

### Phase 6: pptx-automizer mit Composition-Abstraktion (ADR-45, 2026-03-20)

**Ansatz:** pptx-automizer als npm-Dependency fuer Template-Manipulation. Shape Discovery,
10 Content-Typen, Auto-Remove, Auto-Upgrade. PLUS synthetische Abstraktionsschicht:
LayoutDeduplicator (20.9k LOC) clustert Slides, CompositionResolver (7.9k LOC) mappt
semantische Slot-IDs zurueck auf physische Shape-Namen.

**Engine funktioniert, Abstraktion gescheitert weil:**
- Zirkulaere Abstraktion: physisch → semantisch → physisch (verlustbehaftet)
- LayoutDeduplicator: falsches Clustering → falsches representative_slide
- CompositionResolver: 5-stufige Fuzzy-Kaskade scheitert still (Warning statt Error)
- 40+ Iterationen, kein zuverlaessiges Ergebnis

**Lesson Learned:** Die PPTX-Engine (pptx-automizer Wrapper) ist solid. Das Problem ist
die Abstraktionsschicht zwischen Agent und Engine. Jede Mapping-Ebene die zwischen Agent-Input
und Shape-Namen liegt, ist eine potenzielle Fehlerquelle. Weniger Abstraktion = mehr Zuverlaessigkeit.

### Phase 7: Direct Template Mode (ADR-46, 2026-03-22)

**Ansatz:** Composition-Abstraktion komplett entfernt (28k LOC geloescht). Agent arbeitet
direkt mit physischen Shape-Namen. Slides gruppiert nach nativem PowerPoint-Layout-Namen.
Lesbarer Markdown-Guide pro Slide-Typ.

**Fundament ist korrekt, aber Agent-Interface zu schwach weil:**
- Agent vergisst REQUIRED Shapes (kein Feedback vor Generierung)
- Agent erinnert Shape-Namen nicht exakt (Guide ist Text, nicht kopierbar)
- Kein Verification-Loop nach Generierung
- Skills mit 1600 Zeilen Design-Theorie ueberfordern den Agent-Kontext

**Lesson Learned:** Die technische Basis stimmt. Das Problem ist jetzt nicht mehr die
PPTX-Library oder die Architektur, sondern die Intelligenz-Schicht: Wie gut wird der
Agent angeleitet und constrainted? Erfolgreiche Open-Source-Projekte (PPTAgent, Presenton,
json-to-ppt) loesen genau dieses Problem auf Prompt/Schema-Ebene.

### Phase 8: Schema-Constrained Generation (ADR-47, 2026-03-23) -- AKTUELL

Baut auf dem soliden Fundament von ADR-46 auf. Aendert nicht die Engine, sondern die
Intelligenz-Schicht zwischen Agent und Engine.

---

## Kontext

ADR-46 hat das richtige Fundament gelegt (physische Shape-Namen, keine Abstraktion),
aber in der Praxis scheitert der Agent wiederholt an:

1. **Vergessene REQUIRED Shapes** -- Agent laesst Pflichtfelder leer
2. **Falsche Shape-Namen** -- Agent erinnert sich nicht exakt an die Namen aus dem Guide
3. **Kein Feedback** -- Fehler werden erst im fertigen PPTX sichtbar
4. **Skill Overload** -- 1600 Zeilen Design-Theorie ueberfordern den Agent-Kontext

**Recherche-Ergebnis (2026-03-23):** Umfassende Analyse der Open-Source-Landschaft:

| Projekt | Kernidee | Relevanz |
|---------|----------|----------|
| PPTAgent (ICIP-CAS) | Multi-Agent: Research → Design → Convert, Referenz-Lernen | Architektur-Vorbild |
| SlideGen (Paper) | 6 spezialisierte Agents inkl. "Refiner" fuer Layout-Konsistenz | Verification-Pattern |
| Presenton | Zod-Schema pro Slide-Typ constrainted AI-Output | Schema-Constraint-Idee |
| json-to-ppt | `PROMPT_FOR_LLM.md` -- maschinenlesbare Anleitung | Prompt-Engineering |
| Auto-Slides | Verification + Adjustment nach Generierung | Quality Gate |
| dom-to-pptx | CSS → PPT mathematische Konversion | Interessant, braucht Browser |

**Kernerkenntnisse:**
- Es gibt keine bessere JS/TS PPTX-Library als pptx-automizer
- Alle erfolgreichen Projekte loesen das Problem auf Agent/Prompt-Ebene, nicht auf Library-Ebene
- Das dominierende Pattern ist: Schema constrainted den Output + Verification prueft das Ergebnis

## Entscheidung

Drei Massnahmen, die das bestehende System (ADR-46) ergaenzen:

### 1. Copy-Paste JSON-Beispiele im Slide-Type Guide

`TemplateCatalog.formatSlideTypeGuide()` generiert pro Slide-Typ ein
konkretes JSON-Beispiel mit allen REQUIRED Shapes und Beispielwerten:

```
### kpi-folie (Slide 45, auch: 46, 47)
**3 KPIs** | Familie: kpi
Shapes:
  - `Titel 10` [REQUIRED] title (max 80)
  - `KPI-Wert#0` [REQUIRED] kpi_value (max 10)
  ...

Example: {"source_slide":45,"content":{"Titel 10":"Your title","KPI-Wert#0":"42%",...}}
```

**Inspiration:** json-to-ppt's `PROMPT_FOR_LLM.md` -- maschinenlesbare Anleitung
statt abstrakter Dokumentation.

**Implementierung:** `TemplateCatalog.generateSlideExample()` + `exampleValueForRole()`
generieren rollenbasierte Platzhalter (title → "Your slide title", kpi_value → "42%", etc.)

### 2. Required-Shape-Validierung in CreatePptxTool

Vor der PPTX-Generierung validiert `validateRequiredShapes()` gegen den Catalog:

- **Blockierend:** REQUIRED Shape hat keinen Content → Fehler mit exakter Angabe
- **Warning:** Text ueberschreitet max_chars → `collectMaxCharsWarnings()`, Generierung laeuft
- **Warning:** source_slide nicht im Catalog → Warnung

Bei blockierenden Fehlern erhaelt der Agent eine klare Fehlermeldung:
```
Validation failed -- missing REQUIRED shapes:
  Slide 2 (source_slide 45, kpi-folie): missing "Titel 10" (title), "KPI-Wert#0" (kpi_value)
  Provide content for ALL required shapes and retry.
```

### 3. Vereinfachte Skills

| Skill | Vorher | Nachher | Fokus |
|-------|--------|---------|-------|
| office-workflow | 243 Zeilen | ~130 Zeilen | Plan → Generate → Verify + geführter Ingest |
| presentation-design | 331 Zeilen | ~120 Zeilen | Nur Entscheidungs-Frameworks |

**Geaendert in office-workflow:**
- Step 2b: Gefuehrter Corporate-Template-Ingest (Agent fragt User, leitet theme_name ab)
- Step 4: "Kopiere JSON-Beispiel und ersetze Platzhalter" statt freie Shape-Auswahl
- Step 5: Verify ist jetzt expliziter Standard-Schritt

**Geaendert in presentation-design:**
- Radikal gekuerzt: nur Content Classification, Visual Vocabulary, Storytelling Frameworks
- Entfernt: detaillierte Typografie-Regeln, Gestalt-Theorie, Adhoc-Layout-Patterns
- Template-Regeln in 7 kompakten Punkten

### 4. Gefuehrter Ingest-Workflow

Der Agent fuehrt den User durch den Template-Ingest statt technische Parameter zu erwarten:
1. Fragt nach dem .pptx-Datei-Pfad (oder sucht selbst mit list_files)
2. Leitet theme_name automatisch aus dem Dateinamen ab
3. Empfiehlt render_previews und erklaert den Unterschied
4. Handhabt force automatisch (prueft ob Theme existiert)

## Was NICHT geaendert wird

- **pptx-automizer bleibt** -- einzige JS/TS-Library fuer Template-Manipulation
- **Physische Shape-Namen bleiben** -- kein neues semantisches Mapping (Lesson von ADR-45)
- **TemplateEngine bleibt unveraendert** -- funktioniert technisch korrekt
- **Auto-Remove/Auto-Upgrade bleiben** -- bewaehrte Fail-Safes
- **IngestTemplateTool Discovery bleibt** -- nur Guide-Output aendert sich
- **10 Content-Typen bleiben** -- string, styled_text, html_text, replace_text, chart, table, image, position, rotate, hyperlink, duotone

## Alternativen betrachtet

| Alternative | Verworfen weil | Bezug zu frueheren ADRs |
|-------------|---------------|------------------------|
| Semantische Slot-Namen (Rolle statt Shape-Name) | Exakt was ADR-45 CompositionResolver war -- gescheitert | ADR-45 |
| Neue PPTX-Library | Keine JS/TS-Alternative zu pptx-automizer existiert | Recherche 2026-03-23 |
| HTML→PPTX (dom-to-pptx, Marp) | Max ~70% Design-Treue, braucht Browser | ADR-44 Lesson |
| Python-basierte Pipeline (PPTAgent) | Falscher Tech-Stack (TypeScript/Electron) | Recherche |
| Code-Generation (Agent schreibt PptxGenJS) | Zu fehleranfaellig, schwer debugbar | Recherche |
| Cloud-basierte Analyse (Cloud Run) | Zu viel Infrastruktur, widerspricht Plugin-Philosophie | ADR-33 Lesson |
| Two-Tier Retrieval (Skill + compositions.json) | On-demand Nachladen erzeugt mehr Fehler als es loest | ADR-35 Lesson |

## Konsequenzen

### Positiv
- Agent hat kopierfertiges JSON pro Slide-Typ (keine Shape-Namen-Erinnerung noetig)
- Fehlende REQUIRED Shapes werden vor Generierung abgefangen (statt stille Fehler)
- Skills sind kuerzer = weniger Kontext-Verbrauch = bessere Agent-Performance
- Kein neuer Code-Overhead (~80 LOC Validation + Example-Generator)
- Ingest-Workflow ist benutzerfreundlich (Agent fuehrt, User antwortet)

### Negativ
- Guide wird laenger (JSON-Beispiele pro Typ)
- Blockierende Validierung kann zu Retry-Loops fuehren
- Agent muss weiterhin physische Shape-Namen korrekt kopieren

### Risiken
- JSON-Beispiele mit Platzhaltern koennten woertlich uebernommen werden ("Your title")
  → Mitigation: Beispielwerte sind rollenspezifisch ("42%", "Growth"), Skill warnt explizit
- Validierung erkennt nur Required-Shape-Fehler, nicht inhaltliche Fehler
  → Mitigation: render_presentation als QA-Schritt im Workflow

## Implementierte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/core/office/pptx/TemplateCatalog.ts` | `generateSlideExample()`, `exampleValueForRole()`, Guide-Format |
| `src/core/tools/vault/CreatePptxTool.ts` | `validateRequiredShapes()`, `collectMaxCharsWarnings()` |
| `src/core/tools/vault/IngestTemplateTool.ts` | Tool-Description mit Guidance-Hinweisen |
| `bundled-skills/office-workflow/SKILL.md` | Komplett neu: ~130 Zeilen, gefuehrter Ingest |
| `bundled-skills/presentation-design/SKILL.md` | Komplett neu: ~120 Zeilen, nur Frameworks |

## Verwandte Entscheidungen

| ADR | Status | Beziehung |
|-----|--------|-----------|
| ADR-31 | Akzeptiert | writeBinaryToVault -- unveraendert, weiterhin genutzt |
| ADR-32 | Deprecated | JSZip OOXML-Injection -- ersetzt durch pptx-automizer (ADR-45) |
| ADR-33 | Deprecated | Cloud Run Analyzer -- nie implementiert, zu viel Overhead |
| ADR-34 | Deprecated | Visual Design Language Document -- ersetzt durch formatSlideTypeGuide |
| ADR-35 | Deprecated | Two-Tier Retrieval -- ersetzt durch kompakten Guide |
| ADR-44 | Deprecated | CSS-SVG Engine -- HTML kann Corporate Design nicht 1:1 reproduzieren |
| ADR-45 | Deprecated | Composition-Abstraktion -- zirkulaeres Mapping gescheitert |
| ADR-46 | Akzeptiert (Basis) | Direct Template Mode -- Fundament auf dem ADR-47 aufbaut |
