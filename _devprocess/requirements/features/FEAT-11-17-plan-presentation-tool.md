# FEAT-11-17: plan_presentation Tool

**Epic:** EPIC-11 - Office Document Quality
**Priority:** P0-Critical
**Effort:** L (1-2 Wochen)
**Branch:** feature/css-svg-slide-engine
**ADR:** ADR-48 (plan_presentation Pipeline)
**Abhaengigkeiten:** FEAT-11-16 (Schema-Constrained, implementiert), FEAT-11-18 (Catalog-Enrichment)

---

## Kontext

Test vom 2026-03-23 (ROOT-CAUSE-PPTX-TEST-2026-03-23.md) hat gezeigt:
Der Agent ueberspring Planung, Content-Transformation und Qualitaetskontrolle konsistent.
Skill-Anweisungen ("STOP and wait") werden ignoriert. JSON-Beispiele (ADR-47) werden
mit Platzhalter-Texten kopiert statt mit echtem Content befuellt.

**Root Cause:** Content-Transformation muss auf Tool-Ebene passieren (interner LLM-Call),
nicht als Prompt-Empfehlung an den Agent.

**Recherche-Validierung:** PPTAgent, SlideGen, Auto-Slides, Presenton, NotebookLM --
alle trennen Planung von Generierung. Kein funktionierendes System generiert in einem Schritt.

---

## Loesung

Neues Tool `plan_presentation` das Quellmaterial liest, den Template-Catalog laedt,
und einen internen constrainten LLM-Call ausfuehrt um einen vollstaendigen Folienplan
(DeckPlan JSON) zu erzeugen. Der Plan wird validiert und dem User als Markdown praesentiert.

### Tool-Definition

```typescript
name: 'plan_presentation'
isWriteOperation: false  // Liest nur, schreibt nicht

Input: {
    source: string           // Vault-Pfad zur Quell-Note ODER direkter Text
    template: string         // Theme-Name (z.B. "enbw")
    deck_mode: 'speaker' | 'reading'
    goal?: string            // Was soll das Publikum lernen/entscheiden?
    audience?: string        // Wer ist das Publikum?
    slide_count?: number     // Gewuenschte Folienanzahl (default: auto)
}

Output: Markdown mit:
1. Uebersichts-Tabelle (Folie | Typ | Kernaussage | Phase)
2. Detail-Sektion pro Folie (Shape → Content)
3. JSON-Block zum Kopieren fuer create_pptx
4. Validierungs-Ergebnis (Warnings falls vorhanden)
```

### Interner Prozess

```
1. INPUT VALIDIERUNG
   - source existiert im Vault? (oder ist Text-Input)
   - template existiert? (loadTemplate)

2. DATEN LADEN
   - Quell-Note lesen (vault.read oder Text-Input)
   - Catalog laden (TemplateCatalogLoader.loadTemplate)
   - Slide-Type-Guide formatieren (formatSlideTypeGuide)

3. LLM-CALL (constrainted)
   - System: PLANNING_SYSTEM_PROMPT (Konstante, ~80 Zeilen)
   - User: Quellmaterial + Guide + Deck-Mode + Goal + Audience
   - Output: DeckPlan JSON
   - Fehlerbehandlung: JSON-Parse-Error → Retry (1x)

4. VALIDIERUNG
   a) Shape-Namen: Existieren im Catalog fuer die referenzierte source_slide?
   b) Required Shapes: Alle REQUIRED Shapes haben Content?
   c) Platzhalter: Keine bekannten Platzhalter-Texte im Content?
   d) Gruppen: Wenn Shape entfernt wird, auch Gruppen-Mitglieder entfernt?
   e) Trennfolien: section_number Shapes haben korrekte Nummern?

5. OUTPUT FORMATIERUNG
   a) Markdown-Tabelle: Folie | Typ | Kernaussage | Narrativ-Phase
   b) Detail pro Folie: Alle Shapes mit Content (ausklappbar)
   c) JSON-Block: Fertige slides[] fuer create_pptx (kopierfertig)
   d) Validierungs-Warnings (falls vorhanden)
```

### PLANNING_SYSTEM_PROMPT

Der Prompt basiert auf Patterns von PPTAgent (Edit-basiert), SlideGen (Layout nach Content),
Auto-Slides (PMRC + Verification) und NotebookLM (Source-Grounded):

```
Du bist ein erfahrener Praesentations-Designer. Erstelle einen vollstaendigen
Folienplan aus dem gegebenen Quellmaterial und Template-Guide.

PROZESS:
1. ANALYSE: Lies das Quellmaterial. Extrahiere 5-8 Kernaussagen.
2. NARRATIV: Waehle Framework (SCR/SCQA/Pyramid/DataStory/StatusReport).
3. LAYOUT-SELEKTION: Waehle Folientyp pro Kernaussage basierend auf INHALT:
   Zahlen → KPI/Chart | Sequenz → Prozess | Vergleich → Zwei-Spalten | Text → letzter Ausweg
4. CONTENT: Fuelle JEDEN nicht-dekorativen Shape mit echtem Content.

SOURCE-GROUNDING:
- JEDER Text muss aus dem Quellmaterial ableitbar sein
- KEINE erfundenen Daten, Zahlen, Fakten
- Transformiere FORMAT (Fliesstext → Bullets), nicht INHALT

SHAPE-REGELN:
- Action Titles: "Planvergleiche binden Ressourcen" statt "Problemstellung"
- section_number Shapes: Laufende Kapitelnummer ("1", "2", ...)
- Gruppen: Ganze Gruppe entfernen (Chevron + Beschreibung zusammen)
- max_chars respektieren
- styled_text/html_text fuer Body mit mehreren Zeilen
- EXAKTE Shape-Namen aus dem Guide (case-sensitive)

QUALITAETS-CHECK:
- Jede Folie hat EINE Kernaussage?
- Alle Required Shapes befuellt?
- Alle Texte aus Quellmaterial ableitbar?
- Kapitelnummern korrekt?
- Ungenuetzte Shapes korrekt entfernt (inkl. Gruppen)?

OUTPUT: JSON im DeckPlan-Schema.
```

---

## Success Criteria

| ID | Kriterium | Ziel | Messung |
|----|-----------|------|---------|
| SC-01 | Plan enthaelt Content fuer alle Required Shapes | 100% | Automatische Validierung |
| SC-02 | Kein Platzhalter-Text im Plan | 0 Platzhalter | Automatische Erkennung |
| SC-03 | Alle Shape-Namen existieren im Catalog | 100% | Automatische Validierung |
| SC-04 | Trennfolien haben korrekte Nummerierung | Korrekt | Manuelle Pruefung |
| SC-05 | Gruppen-Entfernung vollstaendig | Keine verwaisten Shapes | Manuelle Pruefung |
| SC-06 | PPTX aus Plan hat keine leeren Boxen / Lorem Ipsum | 0 | Visueller Test |
| SC-07 | Tool-Latenz akzeptabel | < 30 Sekunden | Zeitmessung |

---

## Implementierung: Dateien und Aenderungen

### Neue Dateien

| Datei | LOC | Beschreibung |
|-------|-----|-------------|
| `src/core/tools/vault/PlanPresentationTool.ts` | ~350 | Neues Tool: Input-Parsing, Note lesen, Catalog laden, LLM-Call, Validierung, Output-Formatierung |

### Geaenderte Dateien

| Datei | Aenderung | LOC |
|-------|-----------|-----|
| `src/core/office/pptx/types.ts` | `DeckPlan`, `PlannedSlide` Interfaces | ~30 |
| `src/core/tools/ToolRegistry.ts` | `import + this.register(new PlanPresentationTool(this.plugin))` | ~3 |
| `src/core/tools/toolMetadata.ts` | Metadata-Eintrag fuer plan_presentation | ~15 |
| `src/core/modes/builtinModes.ts` | `plan_presentation` in edit-Gruppe | ~1 |
| `src/core/tools/vault/CreatePptxTool.ts` | Platzhalter-Erkennung (Warning) | ~25 |
| `bundled-skills/office-workflow/SKILL.md` | Workflow mit plan_presentation als Kern-Schritt | Rewrite |
| `bundled-skills/presentation-design/SKILL.md` | Referenz auf plan_presentation | ~5 |

---

## Abgrenzung (Nicht im Scope)

- Automatische QA (render_presentation intern aufrufen) -- bleibt manueller Agent-Schritt
- Prerequisite-Gate (create_pptx blockieren ohne Plan) -- moeglich als Folge-Feature
- Multi-Agent-Pipeline (spawnSubtask) -- ueberengineered fuer diesen Anwendungsfall
- PPTX-Reparatur-Bug -- separates technisches Issue
