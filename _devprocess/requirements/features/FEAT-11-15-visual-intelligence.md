# FEAT-11-15: Visual Intelligence

> **Epic:** EPIC-11 (Office Document Quality)
> **ADR:** ADR-35 (Visual Intelligence)
> **Priority:** P0
> **Effort:** L (1-2 Wochen)

## Zusammenfassung

Visual Intelligence ermoeglicht dem Agent zwei neue Faehigkeiten:

1. **Template-Analyse:** Agent analysiert beliebige PPTX-Templates selbst (OOXML-Struktur + visuelle PDF-Inspektion), ohne externen Cloud-Service
2. **Visuelle Qualitaetskontrolle:** Agent sieht die erstellte Praesentation als gerenderte Bilder und korrigiert Probleme automatisch

## Kern-Features

### 1. Multimodale Tool-Ergebnisse

Tools koennen dem LLM Bilder zurueckgeben (nicht nur Text).

**Geaenderte Dateien:**
- `src/api/types.ts` -- `ToolResultContentBlock` Typ, `tool_result.content` Union
- `src/core/tools/types.ts` -- `pushToolResult` Signatur
- `src/core/AgentTask.ts` -- `extractTextContent()`, `appendQualityGate()`, Token-Schaetzung
- `src/core/tool-execution/ToolExecutionPipeline.ts` -- `multimodalContent` Handling
- `src/api/providers/openai.ts` -- Text-Fallback fuer OpenAI

### 2. Template-Analyse (analyze_pptx_template)

Analysiert PPTX-Vorlagen und erzeugt zwei Dateien:
- **SKILL.md** (~5k Zeichen): Kompakter Index mit Brand-DNA, Kompositions-Uebersicht, Design-Regeln
- **compositions.json**: Volle Shape-Details pro Komposition (on-demand abrufbar)

**Workflow:**
1. User laedt PPTX in Vault
2. Agent ruft `analyze_pptx_template` auf
3. User laedt PDF-Export hoch
4. Agent liest PDF visuell und reichert compositions.json an
5. SKILL.md ist als User-Skill installiert

**Dateien:**
- `src/core/tools/vault/AnalyzePptxTemplateTool.ts`
- `src/core/office/PptxTemplateAnalyzer.ts` (groupByComposition)

### 3. Two-Tier-Retrieval (get_composition_details)

Loest das 16k-Limit: Kompakter SKILL.md als Index + compositions.json mit Shape-Details on-demand.

**Input:** `{ template: string, compositions: string[] }`
**Output:** Shape-Mappings, Kapazitaeten, Einsatzregeln fuer angeforderte Kompositionen

**Datei:** `src/core/tools/vault/GetCompositionDetailsTool.ts`

### 4. Visuelle Qualitaetskontrolle (render_presentation)

Rendert PPTX via LibreOffice headless zu PNG-Bildern. Agent sieht die Slides und korrigiert:
- Textueberlauf und Truncation
- Schlechte Zeilenumbrueche
- Leere Shapes
- Visuelle Imbalance

**Feedback-Loop:** Nach Inspektion aktualisiert der Agent compositions.json mit gelernten Constraints (max_chars, font_size_pt). Kuenftige Praesentationen profitieren automatisch.

**Dateien:**
- `src/core/tools/vault/RenderPresentationTool.ts`
- `src/core/office/libreOfficeDetector.ts`

### 5. Settings UI

Visual Intelligence Tab unter Advanced:
- Toggle fuer `visualIntelligence.enabled`
- LibreOffice-Status-Erkennung mit farbigem Dot
- Download-Button (oeffnet Browser)
- Re-check Button
- Custom Path Input

**Dateien:**
- `src/ui/settings/VisualIntelligenceTab.ts`
- `src/ui/AgentSettingsTab.ts` (Sub-Tab registriert)
- `src/types/settings.ts` (VisualIntelligenceSettings)

## Tool-Registrierung

| Tool | ToolName | Gruppe | PARALLEL_SAFE | Approval |
|------|----------|--------|---------------|----------|
| analyze_pptx_template | ja | vault-change | nein | vault-change |
| get_composition_details | ja | read | ja | read |
| render_presentation | ja | read | nein | read |

## Akzeptanzkriterien

- [x] Multimodale Tool-Ergebnisse (Text + Bilder) durch gesamte Pipeline
- [x] analyze_pptx_template erzeugt SKILL.md (<16k) + compositions.json
- [x] get_composition_details laedt nur angeforderte Kompositionen
- [x] render_presentation gibt PNG-Bilder als multimodale Ergebnisse zurueck
- [x] Settings UI mit LibreOffice-Erkennung und Toggle
- [x] Bestehende Tools funktionieren unveraendert (string-Pfad)
- [x] OpenAI Provider: Graceful Degradation (nur Text)
- [x] office-workflow Skill dokumentiert neuen Workflow
- [x] presentation-design Skill enthaelt universelle Design-Prinzipien

## Abhaengigkeiten

- LibreOffice (optional, fuer render_presentation)
- JSZip, DOMParser (bereits vorhanden, fuer OOXML-Analyse)
- PptxTemplateCloner (konsumiert Shape-Namen aus create_pptx)
