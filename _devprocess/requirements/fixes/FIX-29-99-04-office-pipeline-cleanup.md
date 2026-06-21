---
id: FIX-29-99-04
epic: EPIC-11
feature: FEAT-11-17
adr-refs: [ADR-048]
plan-refs: []
depends-on: []
audit-refs: [STABILITY-AUDIT-v2.14.0-2026-06-21]
created: 2026-06-21
---

# FIX-29-99-04: Office-Pipeline -- ingest_template retire + plan_presentation->create_pptx Adapter

## Symptom

Stabilitaets-Audit 2026-06-21 zwei P0:

1. **`ingest_template` ist im System-Prompt referenziert aber existiert nicht.** Bundled `office-workflow` SKILL.md ruft in Step 2 explizit `ingest_template` auf, mehrere Error-Messages in `TemplateCatalog.ts` und die `create_pptx`-Tool-Description verweisen darauf. Es gibt aber keine `IngestTemplateTool`-Klasse im Code. Folge: Corporate-Template-Workflow tot, Agent ruft ins Leere oder halluziniert das Tool.

2. **`plan_presentation` -> `create_pptx` Schema-Mismatch.** `plan_presentation` produziert einen DeckPlan mit `slides[i] = { source_slide, slide_type_id, purpose, key_message, content: { ShapeName: value } }`. `create_pptx`'s `input_schema` deklariert aber nur die flache Adhoc-Shape (`title/subtitle/body/bullets/table/image/notes/layout`). Wenn das LLM den Plan-Output direkt in create_pptx kopiert, sieht der Renderer nur das `notes`-Feld -- und produziert leere Folien.

## Fix

### Teil 1: ingest_template-Verweise entfernen

- `bundled-skills/office-workflow/SKILL.md`: 6-Step-Workflow zu 5-Step umgeschrieben. Step 2 nennt nur noch die drei Default-Themes (Executive/Modern/Minimal), Step 3 nutzt die `presentation-design`-Skill direkt, Step 4 das adhoc-Pattern. Anti-Patterns-Section um eine Zeile erweitert (kein Corporate-Template-Render versprechen).
- `src/_generated/bundled-skills.ts`: vom esbuild-inline-Plugin automatisch beim Build aktualisiert.
- `src/core/tools/vault/CreatePptxTool.ts:105`: Tool-Description aktualisiert (theme-arg statt ingest_template).
- `src/core/office/pptx/TemplateCatalog.ts`: 5 Error-Messages umgeschrieben. Wenn ein User noch alte `<configDir>/themes/<name>/catalog.json`-Daten hat, bleibt der Loader lauffaehig, weist aber darauf hin dass die Re-Ingest-Tool nicht mehr existiert.
- `src/core/office/pptx/__tests__/TemplateCatalog.test.ts:54`: Assertion auf `'Default-Theme'` statt `'ingest_template'` umgestellt.

### Teil 2: plan_presentation -> create_pptx Adapter

- `src/core/tools/vault/CreatePptxTool.ts`: `SlideInput` um `source_slide` und `content` erweitert (optional). Neue private Methode `adaptDeckPlanSlide(si)` folded:
  - `content.Title | Headline | Heading | Slide_Title` -> `title`
  - `content.Subtitle | Subheadline | Sub_Title` -> `subtitle`
  - alle `content.Bullet*`-Keys (sortiert) -> `bullets[]`
  - `content.Body | Content | Description` -> `body`; sonst joined remaining string-values als Fallback
- `execute()` ruft `adaptDeckPlanSlide` per Slide vor dem Renderer-Switch. Adhoc-shape-Slides passieren unveraendert.
- Input-Schema dokumentiert die zwei Eingangsformen, damit das LLM den Plan-Output direkt copy-pasten kann.

## Tests

`src/core/tools/vault/__tests__/CreatePptxTool.adapter.test.ts` (neu): 8 Tests gegen den Adapter (adhoc passthrough, alle 4 Title-Shapes, alle 3 Subtitle-Shapes, Bullet-Sortierung, Body-Mapping inkl. join-fallback, no-overwrite-Invariante, ohne source_slide/content unchanged).

Volle Suite: 2971 passing + 1 expected fail (+8 vs Wave 7). tsc clean. Build clean.

## Out of Scope (Deferred)

- `plan_presentation` selbst bleibt registriert, weil es als Outline-Generator nuetzlich ist. Eine spaetere Welle koennte es entfernen oder seinen Output gleich in die Adhoc-Form generieren lassen.
- `presentation-design` SKILL.md wurde nicht angefasst -- ihr Inhalt war schon adhoc-orientiert (keine Verweise auf ingest_template).
