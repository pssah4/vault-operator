# FEAT-11-16: Schema-Constrained Slide Generation

**Epic:** EPIC-11 - Office Document Quality
**Priority:** P0-Critical
**Effort:** M (3-5 Tage)
**Branch:** feature/css-svg-slide-engine

> ### Post-Implementierung: Test-Ergebnis 2026-03-23
> Test mit Genema Use Case hat gezeigt: Technische Constraints (JSON-Beispiele, Required-Validierung)
> sind notwendig aber nicht hinreichend. Agent ignoriert Workflow-Schritte und transformiert Content nicht.
> → Weiterentwicklung in FEAT-11-17 (plan_presentation Tool) und ADR-48.

## Kontext

Nach 3 gescheiterten Iterationen (ADR-44 CSS-SVG, ADR-45 pptx-automizer mit Composition,
ADR-46 Direct Template Mode) funktioniert die technische PPTX-Generierung, aber die
Agent-zu-Engine-Schnittstelle ist unzureichend constrainted:

- Agent vergisst REQUIRED Shapes oder benennt sie falsch
- Leere Boxen und Lorem-Ipsum-Reste im Output
- Kein Feedback-Loop -- generierter Output wird nicht visuell geprueft
- Skill gibt zu viel Design-Theorie, zu wenig strukturierte Constraints

**Root Cause:** Das Problem liegt nicht in der PPTX-Library (pptx-automizer funktioniert),
sondern in der Intelligenz-Schicht zwischen Agent und Template Engine.

## Loesung: 3-Stufen-Pipeline

### Stufe 1: Copy-Paste JSON-Beispiele im Guide (IngestTemplateTool)

Fuer jeden Slide-Typ generiert der Guide ein konkretes, kopierfertiges JSON-Beispiel:
```json
{"source_slide":45,"content":{"Titel 10":"Your title","KPI-Wert#0":"42%","KPI-Label#0":"Growth"}}
```

Der Agent muss nicht mehr Shape-Namen aus einer Liste zusammensuchen, sondern kann
das Beispiel kopieren und mit echtem Content fuellen.

**Inspiration:** json-to-ppt's `PROMPT_FOR_LLM.md` Pattern.

### Stufe 2: Required-Shape-Validierung (CreatePptxTool)

Vor der PPTX-Generierung prueft das Tool:
- Alle REQUIRED Shapes haben Content
- source_slide existiert im Catalog
- max_chars Warnungen fuer ueberlange Texte

Bei fehlenden Required Shapes: Blockierender Fehler mit Angabe der fehlenden Shapes.
Der Agent MUSS den Fehler korrigieren bevor er erneut aufrufen kann.

### Stufe 3: Vereinfachte Skills

- **office-workflow:** Fokus auf Plan -> Generate -> Verify Workflow
- **presentation-design:** Radikal gekuerzt auf Entscheidungs-Frameworks

## Success Criteria

| ID | Kriterium | Ziel |
|----|-----------|------|
| SC-01 | Jeder Slide-Typ hat JSON-Beispiel im Guide | 100% |
| SC-02 | REQUIRED-Shape-Validierung blockiert bei fehlenden Shapes | Immer |
| SC-03 | max_chars Warnung bei ueberlangen Texten | Als Warning |
| SC-04 | office-workflow Skill unter 200 Zeilen | Ja |
| SC-05 | presentation-design Skill unter 150 Zeilen | Ja |

## Dependencies

- IngestTemplateTool (existiert, wird erweitert)
- CreatePptxTool (existiert, wird erweitert)
- TemplateCatalog.formatSlideTypeGuide (existiert, wird erweitert)

## Nicht im Scope

- Neue PPTX-Library (pptx-automizer bleibt)
- Automatische Verification via render_presentation (bleibt manueller Skill-Schritt)
- Semantische Slot-Namen statt physischer Shape-Namen (zu fehleranfaellig)
