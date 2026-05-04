# Loesungsvorschlag: PPTX-Prasentations-Pipeline

**Datum:** 2026-03-23
**Bezug:** ROOT-CAUSE-PPTX-TEST-2026-03-23.md
**Status:** Finaler Entwurf -- bereit fuer Implementierung

---

## Executive Summary

Das fundamentale Problem ist kein Engine-Problem, sondern ein Agent-Workflow-Problem:
Der Agent ueberspringt Planung, Content-Transformation und Qualitaetskontrolle.
Prompt-Level-Anweisungen ("STOP and wait") werden ignoriert.

**Loesungsansatz:** Code-Level-Enforcement eines 3-Phasen-Workflows mit einem neuen
`plan_presentation` Tool, das die Content-Transformation VOR der PPTX-Generierung
erzwingt und dem User den Plan zur Freigabe vorlegt.

---

## 1. Das Kernproblem (aus der Root-Cause-Analyse)

```
AKTUELLER FLOW (fehlerhaft):
  User: "Erstelle Praesentation"
  Agent: liest Note → klont Folien → setzt vereinzelt Titel ein → fertig
         (ueberspring: Kontext, Plan, Content-Transformation, QA)

ERWARTETER FLOW:
  User: "Erstelle Praesentation"
  Agent: liest Note → versteht Kernaussagen → plant Narrativ →
         waehlt Folientypen → formuliert Content pro Shape →
         zeigt Plan → generiert PPTX → prueft visuell → fertig
```

**Warum Skill-Anweisungen nicht ausreichen:**
Der office-workflow Skill sagt "STOP. Wait for answer." an 3 Stellen.
Der Agent ignoriert das konsistent. Skills sind Empfehlungen, keine Constraints.
Wir brauchen Code-Level-Enforcement.

---

## 2. Recherche-Ergebnis: Best Practices

### 2.1 Wie andere das loesen

| Projekt/Pattern | Ansatz | Relevanz |
|----------------|--------|----------|
| **PPTAgent** (3.8k Stars) | Edit-basiert: Referenz-Slides mit 5 Operationen editieren, REPL + Self-Correction (max 2 Iterationen) | Direkt uebertragbar -- unser pptx-automizer Ansatz ist konzeptionell identisch |
| **SlideGen** (6 Agents) | Arranger waehlt Layout NACH Content-Analyse, Refiner merged sparse Slides | Layout-Selektion nach Content, nicht vorher |
| **Auto-Slides** | PMRC-Format (Problem-Motivation-Results-Conclusion), Verification Agent prueft Coverage gegen Quellmaterial | Semantische Verifikation: +10% Content-Accuracy |
| **Presenton** | Zod-Schema constrainted LLM-Output, Outline-First Pipeline | Structured Output Pattern |
| **Google NotebookLM** | Source-grounded Generation: alles kommt aus hochgeladenen Quellen | Anti-Halluzination durch Source-Binding |
| **Visual Self-Verification** (arXiv:2502.15412) | Slide rendern → VLM prueft auf 6 Dimensionen (Overlap, Overflow, Alignment, Formatting, Composition) → Refine | QA-Loop mit render_presentation |
| **LangGraph** | `interrupt_before` fuer mandatory Checkpoints | Pattern fuer Gates |
| **Claude Agent SDK** | PreToolUse Hooks fuer Prerequisite-Enforcement | Pattern fuer Pipeline |
| **Reflexion** (Shinn et al.) | Generate → Evaluate → Reflect → Retry mit Episodic Memory | QA-Pattern |
| **CRITIC** (Gou et al.) | Externe Tool-basierte Verifikation statt Selbstkritik | render_presentation als externes QA-Tool |
| **AgentSpec** (ICSE 2026) | Runtime-Regeln: Trigger + Praedikat + Enforcement | Pipeline-Gate |
| **json-to-ppt** | Striktes JSON Schema (Draft-7), Pre-Rendering-Validation, idempotent | Schema-Validierung vor Rendering |

### 2.2 Kern-Erkenntnisse aus der Recherche

1. **Outline-First ist universeller Standard:** ALLE untersuchten Projekte (PPTAgent, SlideGen,
   Auto-Slides, Gamma, NotebookLM, Presenton) trennen Planung von Generierung.
   Kein einziges funktionierendes System generiert Slides in einem Schritt.

2. **Edit-basiert statt From-Scratch:** PPTAgent editiert Referenz-Slides mit 5 Operationen
   (`del_span`, `replace_span`, `clone_paragraph`, `del_image`, `replace_image`).
   Das ist konzeptionell identisch mit unserem pptx-automizer-Ansatz (content, remove, generate).
   **Unser Engine-Ansatz ist validiert.**

3. **Layout-Selektion NACH Content-Analyse:** SlideGen's Arranger waehlt das Template-Layout
   basierend auf den GEPLANTEN Elementen (Anzahl, Typen, Aspect Ratios), nicht umgekehrt.
   Der Agent muss erst wissen WAS er zeigen will, dann WIE.

4. **Source-Grounded Generation:** Google NotebookLM bindet jeden generierten Inhalt an die
   hochgeladenen Quellen. Das verhindert Halluzinationen und Platzhalter-Texte. Fuer uns:
   Der Planning-LLM-Call bekommt das Quellmaterial als Kontext und muss daraus ableiten.

5. **Semantische Verifikation gegen Quellmaterial:** Auto-Slides' Verification Agent
   vergleicht den generierten Plan semantisch gegen das Original-Manuskript und prueft
   ob alle wichtigen Punkte abgedeckt sind. Verbessert Content-Accuracy um ~10%.

6. **Visuelle Verifikation ist External, nicht Self-Critique:** Das Paper arXiv:2502.15412
   zeigt: Slide rendern → Screenshot mit Bounding-Boxes → VLM prueft auf 6 Dimensionen
   (Object Overlapping, Text Overflow, Positioning, Formatting, Composition).
   Fuer uns: `render_presentation` → Vision-Check.

7. **Enforcement auf Code-Ebene:** LangGraph `interrupt_before`, Claude Agent SDK `PreToolUse`,
   AgentSpec Runtime-Regeln -- alle setzen auf deterministisches Gate, nicht auf Prompt-Hoffnung.

8. **Structured Output constrainted den LLM:** Presenton + json-to-ppt + Vercel AI SDK nutzen
   strenge Schemas um den LLM-Output zu erzwingen. Layout-spezifische Constraints (max Woerter,
   Zeichenlaenge) pro Shape sind entscheidend fuer Qualitaet.

---

## 3. Loesungsoptionen

### Option A: Neues Tool `plan_presentation` (EMPFOHLEN)

**Idee:** Ein neues Tool das die Content-Transformation und Folienplanung als INTERNEN
LLM-Call ausfuehrt, constrainted durch ein festes Output-Schema.

```
User: "Erstelle Praesentation mit EnBW Design"
Agent: ruft plan_presentation auf
  → Tool liest Quellmaterial
  → Tool laedt Template-Catalog
  → Tool macht internen LLM-Call mit constrainted Prompt
  → LLM liefert vollstaendigen Deck-Plan (alle Shapes befuellt)
  → Tool gibt Plan als Markdown-Tabelle zurueck
Agent: zeigt Plan dem User (implizit, da Tool-Result sichtbar ist)
User: "Ja, generiere" oder "Aendere Folie 3"
Agent: ruft create_pptx mit den Slides aus dem Plan auf
Agent: ruft render_presentation zur QA auf
```

**Technische Umsetzung:**

```typescript
// Neues Tool: plan_presentation
interface PlanPresentationInput {
    source: string;           // Vault-Pfad zur Quell-Note
    template: string;         // Theme-Name (z.B. "enbw")
    deck_mode: 'speaker' | 'reading';
    goal?: string;            // Was soll das Publikum lernen/entscheiden?
    audience?: string;        // Wer ist das Publikum?
    slide_count?: number;     // Gewuenschte Folienanzahl (default: auto)
}

interface DeckPlan {
    title: string;
    narrative_framework: string;  // "SCR", "SCQA", "Pyramid", etc.
    deck_mode: 'speaker' | 'reading';
    slides: PlannedSlide[];
}

interface PlannedSlide {
    position: number;
    source_slide: number;         // Template-Slide-Nummer
    slide_type_id: string;        // z.B. "kpi-folie"
    purpose: string;              // "Hook: Provokante Eroeffnung"
    key_message: string;          // DIE eine Aussage dieser Folie
    content: Record<string, string | ContentValue>;  // ALLE Shapes befuellt
    remove?: string[];            // Shapes zum Entfernen
    notes?: string;               // Speaker Notes
}
```

**Der interne LLM-Call:**

```typescript
async execute(input: PlanPresentationInput): Promise<DeckPlan> {
    // 1. Quellmaterial lesen
    const sourceContent = await this.readNote(input.source);

    // 2. Template-Catalog laden
    const resolved = await this.catalogLoader.loadTemplate(input.template);
    const guide = TemplateCatalogLoader.formatSlideTypeGuide(resolved.catalog);

    // 3. Constrainted LLM-Call
    const plan = await this.callLLM({
        system: PLANNING_SYSTEM_PROMPT,
        user: `
            SOURCE MATERIAL:
            ${sourceContent}

            TEMPLATE GUIDE:
            ${guide}

            DECK MODE: ${input.deck_mode}
            GOAL: ${input.goal ?? 'Informieren'}
            AUDIENCE: ${input.audience ?? 'Fachpublikum'}

            Create a complete deck plan. For EVERY slide, provide content
            for EVERY non-decorative shape. Use the exact shape names from
            the guide. Do not leave any shape empty.

            Return valid JSON matching the DeckPlan schema.
        `
    });

    // 4. Validierung: Alle Required Shapes befuellt?
    this.validatePlan(plan, resolved.catalog);

    // 5. Plan als lesbares Ergebnis zurueckgeben
    return plan;
}
```

**Vorteile:**
- Content-Transformation passiert in einem FOKUSSIERTEN LLM-Call (nicht nebenbei im Agent-Loop)
- Der LLM-Call hat den VOLLSTAENDIGEN Kontext: Quellmaterial + Catalog + Constraints
- Output ist constrainted (muss JSON-Schema matchen)
- Plan ist sichtbar fuer den User (als Tool-Result) → impliziter Checkpoint
- create_pptx bekommt fertige Slides → kein Raten, kein Vergessen

**Nachteile:**
- Zusaetzlicher LLM-Call (Kosten + Latenz)
- Neues Tool implementieren (~200-300 LOC)
- Agent muss lernen, plan_presentation VOR create_pptx zu nutzen

**Enforcement:**
- create_pptx prueft: Wenn template mode UND slides haben Platzhalter-Content
  ("Your slide title", "Main content paragraph") → Warning
- Skill instruiert: "IMMER plan_presentation vor create_pptx"
- Optional: Prerequisite-Gate in ToolExecutionPipeline

---

### Option B: Prerequisite-Gate in ToolExecutionPipeline

**Idee:** create_pptx wird auf Code-Ebene blockiert wenn kein Plan vorliegt.
Analog zum AgentSpec-Pattern (Trigger + Praedikat + Enforcement).

```typescript
// In ToolExecutionPipeline.executeTool():
if (toolName === 'create_pptx') {
    const hasTemplateSlides = input.slides?.some(s => s.source_slide);
    const planExists = this.sessionState.get('presentation_plan_approved');

    if (hasTemplateSlides && !planExists) {
        return {
            error: 'Prerequisite nicht erfuellt: Rufe zuerst plan_presentation auf, '
                 + 'um einen Folienplan zu erstellen. Dann verwende die geplanten Slides.'
        };
    }
}
```

**Vorteile:**
- Deterministisch -- Agent kann das Gate nicht umgehen
- Minimal-invasiv (wenige LOC in Pipeline)

**Nachteile:**
- Bricht bestehende Workflows wenn jemand create_pptx direkt nutzen will
- Muss fuer Adhoc-Mode und Default-Themes disabled sein
- Session-State muss verwaltet werden

**Empfehlung:** Als OPTIONALE Ergaenzung zu Option A, nicht als alleinige Loesung.

---

### Option C: Alles im Skill loesen (kein neues Tool)

**Idee:** Skill radikal umschreiben mit staerkeren Anweisungen.
Agent soll plan_presentation-Logik selbst ausfuehren.

**Warum das NICHT empfohlen wird:**
- RC-1 hat gezeigt: Agent ignoriert Skill-Anweisungen konsistent
- RC-2 hat gezeigt: Agent macht keine Content-Transformation von sich aus
- RC-9 hat gezeigt: Agent behandelt PPTX als technische, nicht kreative Aufgabe
- 40+ Iterationen mit Skill-Optimierungen haben das nicht geloest

**Fazit:** Skill-only Ansatz ist gescheitert. Wir brauchen Code-Level-Enforcement.

---

### Option D: Multi-Agent mit spawnSubtask

**Idee:** Haupt-Agent delegiert an spezialisierte Sub-Agenten:
- Planner-Agent (Narrativ + Folienplan)
- Content-Agent (Content-Transformation pro Folie)
- Generator-Agent (create_pptx Ausfuehrung)
- QA-Agent (render_presentation + Korrektur)

**Warum nur bedingt empfohlen:**
- spawnSubtask gibt nur accumulated text zurueck, kein structured data
- Sub-Agenten haben separate History → Kontext geht verloren
- Hohe Token-Kosten (4x Agent-Ausfuehrung)
- Komplex zu implementieren und zu debuggen

**Fazit:** Ueberengineered fuer unser Szenario. Option A loest das Problem einfacher.

---

## 4. Empfohlene Loesung: Option A + Teile von B

### 4.1 Neues Tool: `plan_presentation`

**Verantwortlichkeit:** Content-Transformation und Folienplanung als constrainted LLM-Call.

**Input:**
```typescript
{
    source: "Inbox/Vorstellung Status Quo Genema Use Case.md",
    template: "enbw",
    deck_mode: "reading",
    goal: "Stakeholder ueber POC-Status informieren",
    audience: "Fachbereichsleiter, technische Projektleiter"
}
```

**Interner Prozess:**
1. Quell-Note lesen (read_file intern)
2. Template-Catalog laden (TemplateCatalogLoader)
3. LLM-Call mit constrainted Prompt:
   - System: "Du bist ein Praesentations-Designer. Erstelle einen vollstaendigen Folienplan."
   - User: Quellmaterial + Template-Guide + Constraints
   - Output-Format: DeckPlan JSON
4. Plan validieren (alle Required Shapes befuellt, Shape-Namen existieren im Catalog)
5. Plan als lesbaren Markdown zurueckgeben

**Output (an Agent und User sichtbar):**
```markdown
## Folienplan: KI-gestuetzte Planaenderungserkennung

**Narrativ:** SCR (Situation → Complication → Resolution)
**Modus:** Reading Deck | 18 Folien

| # | Typ | Kernaussage | Phase |
|---|-----|-------------|-------|
| 1 | Titelfolie | KI-gestuetzte Planaenderungserkennung | Hook |
| 2 | Agenda | Vier Kapitel: Problem, Loesung, Abgrenzung, Naechste Schritte | Hook |
| 3 | Trenner "1" | Problemstellung & Motivation | Build |
| 4 | Content (3 Topics) | Planvergleiche binden Ressourcen | Build |
| ... | ... | ... | ... |

Befuellte Shapes pro Folie: [Details ausklappbar]

→ Soll ich diesen Plan als PPTX generieren?
```

**Danach:** Agent ruft create_pptx mit den geplanten Slides auf. Kein Raten,
kein Vergessen -- der Plan enthaelt ALLE Shapes mit ECHTEM Content.

### 4.2 Anpassungen an create_pptx

1. **Plan-Referenz akzeptieren:**
   create_pptx akzeptiert optional einen `plan` Parameter der auf den
   plan_presentation-Output verweist. Dann werden die geplanten Slides direkt verwendet.

2. **Platzhalter-Erkennung:**
   Wenn Content Platzhalter-Texte enthaelt ("Your slide title", "Main content paragraph",
   "42%", "Metric name", "Step name", etc.) → Warning:
   ```
   Warning: Slide 3 contains placeholder text in "Titel 10": "Your slide title".
   This looks like a template example, not real content.
   Consider using plan_presentation to generate proper content.
   ```

3. **Required-Shape-Validierung:** Bleibt wie in ADR-47 implementiert (blockierend).

### 4.3 Anpassungen am Skill (office-workflow)

Der Skill wird auf den neuen Workflow angepasst:

```markdown
## Step 1: CONTEXT
Frage den User nach Ziel, Audience, Deck Mode.
(Wie bisher, aber kuerzer)

## Step 2: TEMPLATE
Pruefe ob Template existiert, ggf. ingest_template.
(Wie bisher)

## Step 3: PLAN (der wichtigste Schritt)
Rufe plan_presentation auf:
  - source: Pfad zur Quell-Note
  - template: Theme-Name
  - deck_mode: speaker oder reading
  - goal: vom User in Step 1
  - audience: vom User in Step 1

Zeige den Plan dem User. Warte auf Feedback.
Bei Aenderungswuenschen: plan_presentation erneut aufrufen.

## Step 4: GENERATE
Verwende die Slides aus dem Plan direkt in create_pptx.
NICHT selbst Shapes auswaehlen -- der Plan hat das bereits getan.

## Step 5: VERIFY
Rufe render_presentation auf 2-3 Folien auf.
Bei Problemen: spezifische Slides korrigieren und neu generieren.
```

### 4.4 Der PLANNING_SYSTEM_PROMPT (Kern des neuen Tools)

Dies ist der wichtigste Teil -- der constrainted Prompt der die Content-Transformation steuert.
Basiert auf den Patterns von PPTAgent (Edit-basiert), SlideGen (Layout nach Content),
Auto-Slides (PMRC-Format) und NotebookLM (Source-Grounded).

```
Du bist ein erfahrener Praesentations-Designer. Deine Aufgabe ist es,
aus Quellmaterial einen vollstaendigen Folienplan zu erstellen.

PROZESS (in dieser Reihenfolge):
1. ANALYSE: Lies das Quellmaterial vollstaendig. Extrahiere die 5-8 Kernaussagen.
2. NARRATIV: Waehle ein Storytelling-Framework (SCR, SCQA, Pyramid, Data Story, Status Report).
   Ordne jede Kernaussage einer Phase zu (Hook, Build, Turn, Resolution, Echo).
3. LAYOUT-SELEKTION: Fuer jede Kernaussage, waehle den Folientyp der zum INHALT passt:
   - Zahlen/Metriken → KPI-Folien oder Chart-Folien
   - Sequenz/Prozess → Prozess-Chevrons oder Timeline
   - Vergleich/Kontrast → Zwei-Spalten oder Vergleichs-Folien
   - Ueberblick/Aufzaehlung → Content-Folien (nur wenn kein besserer Typ passt)
   Beachte: Layout wird durch den INHALT bestimmt, nicht umgekehrt.
4. CONTENT PRO SHAPE: Fuelle JEDEN nicht-dekorativen Shape mit echtem Content.

SOURCE-GROUNDING-REGELN:
- JEDER Text muss aus dem Quellmaterial ableitbar sein
- Erfinde KEINE Daten, Zahlen, Fakten oder Zitate
- Wenn das Quellmaterial fuer eine Shape nicht ausreicht, entferne die Shape (remove)
- Transformiere das Format (Fliesstext → Bullets, Absaetze → Action Titles),
  aber erfinde KEINEN neuen Inhalt

SHAPE-REGELN:
- Titel sind ACTION TITLES: "Planvergleiche binden Ressourcen" statt "Problemstellung"
- Shapes mit special_role "section_number": Setze die laufende Kapitelnummer ("1", "2", ...)
- Shapes mit group_hint: Entferne immer die GANZE Gruppe zusammen (Chevron + Beschreibung)
- Respektiere max_chars Limits pro Shape
- Verwende styled_text oder html_text fuer Body-Shapes mit mehreren Zeilen
- Verwende die EXAKTEN Shape-Namen aus dem Template-Guide (case-sensitive)

DECK-MODE-REGELN:
- Speaker [S]: Max 25 Woerter sichtbar pro Folie, Details in Speaker Notes (2-3 Talking Points)
- Reading [R]: Max 170 Woerter pro Folie, vollstaendige Saetze, keine Speaker Notes noetig

QUALITAETS-CHECKS (pruefe vor Ausgabe):
- Hat jede Folie genau EINE Kernaussage?
- Sind ALLE Required Shapes befuellt (nicht leer, kein Platzhalter)?
- Sind alle Texte aus dem Quellmaterial ableitbar?
- Stimmt die Kapitelnummerierung der Trennfolien?
- Werden ungenuetzte Shapes korrekt entfernt (inkl. Gruppen-Mitglieder)?

OUTPUT: Valides JSON im DeckPlan-Schema. Jede Folie hat source_slide,
slide_type_id, purpose, key_message, content (ALLE Shapes), remove (falls noetig), notes.
```

### 4.5 Semantische Verifikation (Auto-Slides Pattern)

Nach dem LLM-Call prueft plan_presentation den Plan automatisch:

```typescript
private validatePlanSemantics(plan: DeckPlan, sourceContent: string, catalog: TemplateCatalog): string[] {
    const warnings: string[] = [];

    for (const slide of plan.slides) {
        // 1. Required Shapes befuellt?
        const slideType = catalog.slide_types.find(st => st.representative_slide === slide.source_slide);
        if (slideType) {
            for (const shape of slideType.shapes) {
                if (!shape.required) continue;
                const key = shape.duplicate_index != null && shape.duplicate_index > 0
                    ? `${shape.name}#${shape.duplicate_index}` : shape.name;
                if (!slide.content[key]) {
                    warnings.push(`Folie ${slide.position}: REQUIRED Shape "${key}" fehlt`);
                }
            }
        }

        // 2. Platzhalter-Texte erkennen
        const PLACEHOLDERS = ['Your slide title', 'Main content paragraph', 'Content here',
            'Subtitle or context line', 'Step name', 'Brief description', 'Metric name'];
        for (const [key, value] of Object.entries(slide.content)) {
            if (typeof value === 'string' && PLACEHOLDERS.includes(value)) {
                warnings.push(`Folie ${slide.position}: "${key}" hat Platzhalter-Text "${value}"`);
            }
        }

        // 3. Shape-Namen im Catalog pruefen
        // (Shape existiert auf der referenzierten Slide?)
    }

    return warnings;
}
```

Wenn Validierungs-Warnings auftreten, werden sie im Tool-Output angezeigt.
Der Agent kann den Plan dann korrigieren oder plan_presentation erneut aufrufen.

### 4.5 Catalog-Verbesserungen

Basierend auf RC-3 und RC-6:

1. **Trennfolien-Nummern:** Der Catalog bekommt eine `special_role` fuer Shapes
   die als Kapitelnummer fungieren:
   ```json
   {
     "name": "Textplatzhalter 14",
     "role": "body",
     "special_role": "section_number",
     "sample_text": "1"
   }
   ```

2. **Gruppen-Semantik:** Zusammengehoerige Shapes bekommen eine `group_id`:
   ```json
   {
     "name": "Eingekerbter Richtungspfeil 16",
     "group_id": "process_step_2",
     "group_members": ["Eingekerbter Richtungspfeil 16", "Textplatzhalter 2#1"]
   }
   ```

3. **JSON-Beispiele zeigen ALLE sichtbaren Shapes** (nicht nur REQUIRED):
   ```json
   {"source_slide":5,"content":{
     "Titel 12":"Section headline",
     "Textplatzhalter 14":"1"
   }}
   ```

### 4.7 Visuelle Qualitaetskontrolle (Visual Self-Verification Pattern)

Basiert auf arXiv:2502.15412 und dem CRITIC-Pattern (Gou et al.).
Kern-Erkenntnis: Externe Verifikation via Tool ist zuverlaessiger als Agent-Selbstkritik.

**Im office-workflow Skill (Step 5: VERIFY):**

```
Nach create_pptx:
1. Rufe render_presentation auf 3 repraesentative Folien auf
   (erste Inhaltsfolie, eine Prozess/KPI-Folie, letzte Inhaltsfolie)
2. Pruefe die gerenderten Bilder auf:
   - Leere Shapes (sichtbare Boxen ohne Text)
   - Text-Overflow (Text ragt aus Shape heraus)
   - Platzhalter-Text (Lorem Ipsum, "Folienbibliothek | Stand...")
   - Fehlende Elemente (Kapitelnummern, Chevron-Beschreibungen)
   - Layout-Balance (Elemente ueberlappen oder sind fehlplatziert)
3. Bei Problemen: Spezifische Slides mit korrigiertem Content neu generieren
   (NICHT die ganze Praesentation, nur die fehlerhaften Slides)
4. Max 2 Korrektur-Runden, dann User informieren
```

**Warum das funktioniert:**
- render_presentation liefert echte Screenshots (LibreOffice-Rendering)
- Der Agent SIEHT die Probleme visuell (multimodale Tool-Ergebnisse)
- CRITIC-Pattern: Externes Tool (Rendering) ist zuverlaessiger als Selbstkritik
- Max 2 Runden verhindert endlose Korrektur-Loops

**Langfristig moeglich (nicht in Phase 1):**
Automatische VLM-basierte QA: render_presentation → interner Vision-LLM-Call →
strukturiertes Feedback (wie arXiv:2502.15412). Aber fuer Phase 1 reicht der
Agent-basierte visuelle Check.

### 4.8 PPTX-Reparatur-Problem (RC-8)

Unabhaengig vom Workflow-Problem:

1. **Diagnose:** PPTX mit minimaler Slide-Anzahl (2-3) generieren und pruefen ob
   Reparatur noetig ist. Wenn ja: pptx-automizer Bug isolieren.
2. **Workaround:** Nach Generierung `assertRelatedContents: true` pruefen,
   ggf. Relationship-Cleanup implementieren.
3. **Langfristig:** pptx-automizer Version-Update oder Patch.

---

## 5. Detaillierter Implementierungsplan

### Phase 1: Types und Grundlagen (30 Min)

**Ziel:** Typen fuer den DeckPlan und Catalog-Erweiterungen definieren.

| # | Datei | Aenderung | LOC |
|---|-------|-----------|-----|
| 1.1 | `src/core/office/pptx/types.ts` | `DeckPlan`, `PlannedSlide` Interfaces hinzufuegen | ~40 |
| 1.2 | `src/core/office/pptx/types.ts` | `ShapeEntry.special_role?` und `SlideTypeShape.group_id?` hinzufuegen | ~10 |

```typescript
// Neue Types in types.ts:
export interface DeckPlan {
    title: string;
    narrative_framework: string;
    deck_mode: 'speaker' | 'reading';
    source_path?: string;
    slides: PlannedSlide[];
}

export interface PlannedSlide {
    position: number;
    source_slide: number;
    slide_type_id: string;
    purpose: string;
    key_message: string;
    content: Record<string, string | ContentValue>;
    remove?: string[];
    notes?: string;
}
```

**Verifikation:** `npm run build` -- nur Type-Aenderungen, kein Runtime-Impact.

---

### Phase 2: Catalog-Verbesserungen (1h)

**Ziel:** IngestTemplateTool erzeugt reichere Metadaten. JSON-Beispiele zeigen alle Shapes.

| # | Datei | Aenderung | LOC |
|---|-------|-----------|-----|
| 2.1 | `IngestTemplateTool.ts` | `special_role` Erkennung: sample_text ist einzelne Zahl + role=body → "section_number" | ~15 |
| 2.2 | `IngestTemplateTool.ts` | `group_id` Generierung: Shapes mit gleicher group_hint bekommen gemeinsame ID | ~25 |
| 2.3 | `TemplateCatalog.ts` | `generateSlideExample()` zeigt ALLE nicht-dekorativen Shapes (nicht nur REQUIRED) | ~15 |
| 2.4 | `TemplateCatalog.ts` | `formatSlideTypeGuide()` zeigt special_role und group_id im Guide | ~10 |

**Verifikation:** `npm run build` + Re-Ingest des EnBW-Templates + Guide pruefen.

---

### Phase 3: plan_presentation Tool (2-3h, KERN)

**Ziel:** Neues Tool das Content-Transformation als internen LLM-Call ausfuehrt.

| # | Datei | Aenderung | LOC |
|---|-------|-----------|-----|
| 3.1 | `src/core/tools/vault/PlanPresentationTool.ts` | Neues Tool: Input-Parsing, Note lesen, Catalog laden | ~80 |
| 3.2 | `src/core/tools/vault/PlanPresentationTool.ts` | LLM-Call mit PLANNING_SYSTEM_PROMPT | ~60 |
| 3.3 | `src/core/tools/vault/PlanPresentationTool.ts` | JSON-Parsing des LLM-Outputs + Fehlerbehandlung | ~40 |
| 3.4 | `src/core/tools/vault/PlanPresentationTool.ts` | Semantische Validierung (Required, Platzhalter, Shape-Namen) | ~50 |
| 3.5 | `src/core/tools/vault/PlanPresentationTool.ts` | Markdown-Output-Formatierung (Tabelle + Details) | ~40 |
| 3.6 | `src/core/tools/vault/PlanPresentationTool.ts` | PLANNING_SYSTEM_PROMPT als Konstante | ~50 |
| 3.7 | `src/core/tools/toolMetadata.ts` | Metadata-Eintrag fuer plan_presentation | ~5 |
| 3.8 | `src/core/office/index.ts` | Export des neuen Tools | ~2 |
| 3.9 | Tool-Registry Wiring | plan_presentation in vault-change Gruppe registrieren | ~5 |

**Gesamt: ~330 LOC**

**Interner LLM-Call -- Technische Umsetzung:**

```typescript
private async callPlanningLLM(
    sourceContent: string,
    guide: string,
    input: PlanPresentationInput,
): Promise<DeckPlan> {
    const { buildApiHandlerForModel } = await import('../../../api');
    const model = this.plugin.getActiveModel();
    if (!model) throw new Error('Kein aktives Modell konfiguriert');

    const api = buildApiHandlerForModel(model);

    const stream = api.createMessage(
        PLANNING_SYSTEM_PROMPT,
        [{
            role: 'user',
            content: `SOURCE MATERIAL:\n${sourceContent}\n\nTEMPLATE GUIDE:\n${guide}\n\n` +
                `DECK MODE: ${input.deck_mode}\n` +
                `GOAL: ${input.goal ?? 'Informieren'}\n` +
                `AUDIENCE: ${input.audience ?? 'Fachpublikum'}\n` +
                (input.slide_count ? `TARGET SLIDES: ${input.slide_count}\n` : '') +
                `\nReturn a complete DeckPlan as JSON.`
        }],
        [], // no tools for the planning call
    );

    let responseText = '';
    for await (const chunk of stream) {
        if (chunk.type === 'text') responseText += chunk.text;
    }

    // Parse JSON (handle markdown fences)
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    return JSON.parse(cleaned) as DeckPlan;
}
```

**Verifikation:** Build + Deploy + Manueller Test mit Genema Use Case.

---

### Phase 4: create_pptx Anpassungen (30 Min)

**Ziel:** Platzhalter-Erkennung und Plan-Hinweis im Output.

| # | Datei | Aenderung | LOC |
|---|-------|-----------|-----|
| 4.1 | `CreatePptxTool.ts` | `detectPlaceholderContent()` -- Warning bei bekannten Platzhaltern | ~25 |
| 4.2 | `CreatePptxTool.ts` | Output-Text: "Tipp: render_presentation fuer visuelle QA" | ~3 |

**Platzhalter-Liste:**
```typescript
const KNOWN_PLACEHOLDERS = [
    'Your slide title', 'Your title here', 'Subtitle or context line',
    'Main content paragraph', 'Content here', 'Step name', 'Brief description',
    'Metric name', '42%', 'Growth', 'Series',
    'Lorem ipsum', 'Aenean commodo', 'Cum sociis natoque',
];
```

**Verifikation:** Build + Deploy.

---

### Phase 5: Skill-Update (30 Min)

**Ziel:** office-workflow Skill auf plan_presentation-Workflow umstellen.

| # | Datei | Aenderung |
|---|-------|-----------|
| 5.1 | `bundled-skills/office-workflow/SKILL.md` | Kompletter Rewrite: plan_presentation als zentraler Schritt |
| 5.2 | `bundled-skills/presentation-design/SKILL.md` | Referenz auf plan_presentation hinzufuegen |

**Neuer office-workflow Flow:**
```
Step 1: CONTEXT -- Frage nach Ziel, Audience, Deck Mode
Step 2: TEMPLATE -- Pruefe/Ingest Template
Step 3: PLAN -- Rufe plan_presentation auf (DAS ist der Kern-Schritt)
Step 4: REVIEW -- Zeige Plan, warte auf Feedback
Step 5: GENERATE -- create_pptx mit den geplanten Slides
Step 6: VERIFY -- render_presentation auf 2-3 Folien
```

**Verifikation:** Deploy + Skills in Obsidian pruefen.

---

### Phase 6: Integration-Test (1h)

**Ziel:** Gleicher Testfall (Genema Use Case) mit neuem Workflow.

| # | Test | Erwartung |
|---|------|-----------|
| 6.1 | plan_presentation mit Genema-Note + EnBW-Template | Vollstaendiger Plan mit allen Shapes befuellt |
| 6.2 | Plan-Validierung | Keine Platzhalter, alle Required Shapes, korrekte Shape-Namen |
| 6.3 | create_pptx mit Plan-Slides | Saubere PPTX ohne Reparatur-Bedarf |
| 6.4 | render_presentation auf 3 Folien | Visuell korrekt: keine leeren Boxen, kein Lorem Ipsum |
| 6.5 | Vergleich mit Test-Ergebnis vom 2026-03-23 | Deutliche Verbesserung auf allen 18 Folien |

---

### Phase 7: PPTX-Reparatur-Bug (optional, separat)

| # | Aktion |
|---|--------|
| 7.1 | Minimale PPTX (2-3 Slides) generieren, Reparatur-Bedarf pruefen |
| 7.2 | Wenn Reparatur noetig: pptx-automizer removeElement / assertRelatedContents debuggen |
| 7.3 | Ggf. pptx-automizer Version-Update oder Relationship-Cleanup |

---

### Zusammenfassung: Aufwand

| Phase | Aufwand | Prioritaet | Abhaengigkeiten |
|-------|---------|-----------|-----------------|
| Phase 1: Types | 30 Min | P0 | Keine |
| Phase 2: Catalog | 1h | P0 | Phase 1 |
| Phase 3: plan_presentation | 2-3h | P0 (KERN) | Phase 1, 2 |
| Phase 4: create_pptx | 30 Min | P1 | Phase 1 |
| Phase 5: Skills | 30 Min | P1 | Phase 3 |
| Phase 6: Test | 1h | P0 | Phase 3, 4, 5 |
| Phase 7: PPTX-Bug | 1-2h | P2 | Keine |
| **Gesamt** | **~6-8h** | | |

---

## 6. Risikobewertung

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|-------------------|------------|------------|
| LLM-Call in plan_presentation liefert schlechten Plan | Mittel | Hoch | Constrainted Prompt + Validierung + User-Review |
| Agent ruft plan_presentation nicht auf | Mittel | Hoch | Skill-Anweisung + ggf. Prerequisite-Gate |
| Zusaetzliche Latenz durch LLM-Call | Sicher | Niedrig | Plan ist in 10-20s fertig, User reviewt sowieso |
| Token-Kosten steigen | Sicher | Niedrig | Ein zusaetzlicher Call, nicht dramatisch |
| Plan-Format passt nicht zu allen Templates | Niedrig | Mittel | Schema ist Template-agnostisch (nutzt Shape-Namen aus Catalog) |
| Agent ignoriert Plan und macht eigene Slides | Niedrig | Hoch | Skill sagt explizit "Verwende die geplanten Slides" |

---

## 7. Vergleich: Vorher vs. Nachher

| Aspekt | Aktuell (ADR-47) | Vorgeschlagen |
|--------|-------------------|---------------|
| Content-Transformation | Agent soll es tun (tut es nicht) | plan_presentation Tool macht es |
| Planung | Prompt-Empfehlung ("STOP and wait") | Separater Tool-Call mit sichtbarem Output |
| Shape-Befuellung | Agent kopiert JSON-Beispiel (minimal) | LLM-Call befuellt ALLE Shapes |
| User-Review | Nie passiert (Agent ueberspring) | Plan ist sichtbar als Tool-Result |
| QA | Nie passiert | Expliziter Schritt im Workflow |
| Enforcement | Prompt-Level (ignorierbar) | Tool-Level (nicht umgehbar) |
| Trennfolien-Nummern | Nicht im Beispiel, wird geloescht | special_role im Catalog, LLM kennt es |
| Gruppen-Entfernung | Nicht moeglich | group_id im Catalog, LLM entfernt ganze Gruppe |

---

## 8. Offene Entscheidungen

1. **Soll plan_presentation den LLM-Call intern machen oder den Agent anweisen?**
   → Empfehlung: Intern (constrainted, nicht umgehbar)

2. **Soll es ein Prerequisite-Gate fuer create_pptx geben?**
   → Empfehlung: Ja, aber als Warning, nicht als Block (Rueckwaertskompatibilitaet)

3. **Soll render_presentation automatisch nach create_pptx aufgerufen werden?**
   → Empfehlung: Nein (zu rigide), aber create_pptx empfiehlt es im Output

4. **Soll plan_presentation askQuestion fuer User-Approval nutzen?**
   → Empfehlung: Nein -- Plan als Tool-Result ist sichtbar genug.
   Agent kann danach fragen "Soll ich generieren?" (natuerlicher Flow)

5. **Wie wird das Quellmaterial uebergeben?**
   → Empfehlung: Vault-Pfad (Tool liest Note intern).
   Alternativ: Text direkt (fuer Konversations-Content ohne Note)
