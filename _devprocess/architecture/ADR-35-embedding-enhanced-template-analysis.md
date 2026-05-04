# ADR-35: Visual Intelligence -- Lokale Qualitaetskontrolle und Agent-basierte Template-Analyse

**Superseded by:** ADR-46 → ADR-47 (Schema-Constrained Slide Generation)
**Deprecated:** 2026-03-22
**Date:** 2026-03-14
**Deciders:** Sebastian Hanke
**Supersedes:** ADR-35 alt (Embedding-basierte Kompositions-Gruppierung) -- Ansatz vereinfacht

> ### Lesson Learned
> Two-Tier Retrieval (kompakter Skill + on-demand compositions.json) ist unnoetig wenn
> die Primaer-Information kompakt genug ist. On-demand Nachladen erzeugt mehr Fehler als es loest
> (Agent vergisst get_composition_details aufzurufen). Die multimodale QA via LibreOffice
> (render_presentation) hat sich dagegen bewaehrt und ist in ADR-46/047 erhalten.
> **Erkenntnis:** Ein kompakter Guide mit allen Infos > aufgeteilte Daten mit Tool-Calls.

## Context

### Root Cause: 16k-Limit und fehlende visuelle Kontrolle

Zwei unabhaengige Probleme:

1. **16k-Limit:** Der SkillsManager (SkillsManager.ts:134) limitiert Skill-Body auf 16k Zeichen. Grosse Templates (z.B. EnBW, 108 Slides, 90 Kompositionen) erzeugen 39k+ Zeichen. Die bisherige Strategie (aggressiveres Kuerzen) verliert semantische Tiefe.

2. **Fehlende visuelle Kontrolle:** Nach `create_pptx` sieht der Agent das Ergebnis nicht. Textueberlauf, schlechte Umbrueche und leere Shapes bleiben unentdeckt.

### Bisheriger Ansatz verworfen

ADR-35 (alt) sah Gemini Embedding 2 im Cloud-Analyzer fuer visuelles Clustering vor. Vereinfacht: Der Agent selbst analysiert Templates (PPTX + PDF), kein externer Service noetig. LibreOffice lokal fuer Rendering.

### Triggering Constraints

- CRITICAL: 16k-Zeichen-Limit (SkillsManager.ts:134)
- CRITICAL: BYOK-only Privacy (kein Cloud-Service fuer Analyse)
- MODERATE: Visuelle Qualitaetskontrolle nach Erstellung
- Quality Attributes: Einfachheit (kein Cloud-Service), Skalierbarkeit (beliebige Templates)

## Decision

### Zwei-Stufen-Retrieval (16k-Problem)

Statt den gesamten Template-Skill unter 16k zu quetschen, wird der Inhalt aufgeteilt:

**Stufe 1: SKILL.md (~5k Zeichen, immer im LLM-Kontext)**
- Brand-DNA (Farben, Fonts)
- Kompositions-Index (Name + ID + Slides + Einzeiler)
- Narrative Phasen-Zuordnung
- Design-Regeln

**Stufe 2: compositions.json (on-demand, per Tool-Call)**
- Volle Shape-Details pro Komposition
- Text-Kapazitaeten (max_chars, font_size_pt)
- Einsatzregeln, Bedeutung
- Geladen ueber `get_composition_details` Tool

### Agent als Analyzer (kein externer Service)

Der Agent selbst analysiert Templates:
1. `analyze_pptx_template` extrahiert Struktur (OOXML via JSZip/DOMParser)
2. User laedt PDF-Export hoch -- Agent liest visuell
3. Agent kombiniert Struktur + visuelle Eindruecke
4. Agent reichert compositions.json an (edit_file)

Kein Python-Script, kein Cloud-Service, keine Gemini-API.

### Visuelle Qualitaetskontrolle (LibreOffice lokal)

`render_presentation` konvertiert PPTX via LibreOffice headless zu PNG.
Der Agent sieht die gerenderten Slides als multimodale Tool-Ergebnisse
und korrigiert Probleme automatisch.

**Feedback-Loop:** Nach visueller Pruefung aktualisiert der Agent
compositions.json mit gelernten Constraints (max_chars korrigiert,
Umbruch-Hinweise). Kuenftige Praesentationen profitieren automatisch.

## Architecture

```
TEMPLATE-ANALYSE (einmalig, im Plugin)
=======================================================

Template.pptx + Template.pdf (vom User)
    |
    v
[analyze_pptx_template]  ←  OOXML-Parser (JSZip/DOMParser)
    |                         Shapes, Theme, Layouts
    |
    v
[Agent liest PDF visuell] ←  Multimodaler LLM-Call
    |                         Semantische Analyse
    |
    v
┌─────────────────┐    ┌──────────────────────────────┐
│ SKILL.md        │    │ compositions.json             │
│ ~5k Zeichen     │    │ Shape-Details + Constraints   │
│ Kompakter Index │    │ On-demand abrufbar            │
└─────────────────┘    └──────────────────────────────┘
    |                         |
    v                         v
.obsilo/skills/{slug}/   .obsilo/templates/{slug}.compositions.json


PRAESENTATIONS-ERSTELLUNG (pro Auftrag)
=======================================================

Agent liest SKILL.md (automatisch, Skill-Trigger)
    |
    v
get_composition_details(template, [comp-ids])
    → Laedt nur benoetigte Kompositionen
    |
    v
create_pptx(template_file, template_slide, content)
    → Shape-Name-Matching (PptxTemplateCloner)
    |
    v
render_presentation(file)  [optional, LibreOffice]
    → PNG-Bilder der Slides
    |
    v
Agent prueft visuell → korrigiert → aktualisiert Constraints
```

### Multimodale Tool-Ergebnisse

Die Tool-Pipeline wurde erweitert:

- `ToolResultContentBlock`: `{ type: 'text' } | { type: 'image' }`
- `pushToolResult()`: Akzeptiert `string | ToolResultContentBlock[]`
- AgentTask: `extractTextContent()` fuer UI, voller Content fuer LLM
- Anthropic Provider: Nativ unterstuetzt (SDK akzeptiert beides)
- OpenAI Provider: Fallback auf Text-only (Bilder verworfen)

### Neue Tools

| Tool | Typ | Gruppe | Funktion |
|------|-----|--------|----------|
| `analyze_pptx_template` | write | vault-change | OOXML-Analyse → SKILL.md + compositions.json |
| `get_composition_details` | read | read | Laedt Shape-Details on-demand |
| `render_presentation` | read | read | LibreOffice PPTX→PNG, multimodal |

### Settings: Visual Intelligence

- Toggle: `settings.visualIntelligence.enabled` (default: false)
- LibreOffice-Erkennung: `libreOfficeDetector.ts` (bekannte Pfade + which)
- Custom Path: Fuer nicht-standard Installationen
- Status-Anzeige mit Download-Button

## Consequences

### Positive
- 16k-Limit zuverlaessig eingehalten (SKILL.md ~5k, Rest on-demand)
- Kein externer Service noetig (Privacy, Einfachheit)
- Visuelle Qualitaetskontrolle schliesst die Feedback-Schleife
- Constraints verbessern sich automatisch ueber Zeit
- Multimodale Pipeline wiederverwendbar fuer andere Tools

### Negative
- LibreOffice muss vom User installiert werden (optional, nur fuer Rendering)
- Agent braucht 1-2 extra Tool-Calls pro Praesentation (get_composition_details)
- compositions.json im Vault (~10-100 KB pro Template)
- PDF-Upload fuer visuelle Analyse ist manueller Schritt

### Risks
- **LibreOffice nicht installiert:** Rendering optional, Constraints-basierter Fallback
- **Agent vergisst get_composition_details:** Expliziter Hinweis in SKILL.md Rules + requiredTools
- **PDF nicht verfuegbar:** Analyse funktioniert strukturell, semantische Anreicherung fehlt dann

## Related Decisions

- ADR-32: Template-basierte PPTX-Erzeugung (Shape-Name-Matching)
- ADR-33: Multimodaler Template-Analyzer (Cloud Run -- durch Agent-Analyse ersetzt)
- ADR-34: Visual Design Language Document (Skill-Format)
- ADR-29: Input-Schema-Design (template_slide + content Interface)

## References

- FEAT-11-15: Visual Intelligence
- SkillsManager.ts:134 (16k-Zeichen-Limit)
- EnBW-Template: 108 Slides, 90 Kompositionen (Testfall)
