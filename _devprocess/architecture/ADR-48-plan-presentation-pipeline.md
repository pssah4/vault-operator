# ADR-48: plan_presentation Pipeline -- Content-Transformation auf Tool-Ebene

**Datum:** 2026-03-23
**Ergaenzt:** ADR-46 (Engine) + ADR-47 (Validierung)

---

## Architektur-Evolution: Warum ein neues Tool noetig ist

### Die Kette der Erkenntnisse (ADR-32 bis ADR-48)

| Phase | ADR | Ansatz | Erkenntnis |
|-------|-----|--------|------------|
| 1 | ADR-30 | pptxgenjs from-scratch | OOXML-Struktur fehlt, Corporate Design nicht reproduzierbar |
| 2 | ADR-32 | JSZip OOXML-Injection | Zu fragil, kein Shape-Discovery |
| 3 | ADR-33/034 | Cloud Run + Visual Design Language | Zu viel Infrastruktur, 16k-Skill-Limit |
| 4 | ADR-35 | Two-Tier Retrieval (Skill + compositions.json) | On-demand Nachladen erzeugt Fehler |
| 5 | ADR-44 | CSS-SVG Engine (HTML-First) | ~70% Design-Treue, Original-PPTX ist Source of Truth |
| 6 | ADR-45 | pptx-automizer + Composition-Abstraktion | **Engine solid**, Abstraktion gescheitert (28k LOC) |
| 7 | ADR-46 | Direct Template Mode (physische Shape-Namen) | **Fundament korrekt**, Agent-Interface zu schwach |
| 8 | ADR-47 | Schema-Constrained (JSON-Beispiele, Validierung) | **Technische Constraints helfen**, aber Agent ignoriert Workflow |
| **9** | **ADR-48** | **plan_presentation Tool** | **Content-Transformation muss auf Tool-Ebene passieren** |

### Was ADR-47 geloest hat und was nicht

**Geloest (technische Constraints):**
- JSON-Beispiele pro Slide-Typ → Agent sieht kopierfertiges Format
- Required-Shape-Validierung → Fehlende Pflichtfelder werden blockiert
- max_chars-Warnungen → Ueberlauf wird gemeldet
- Skills gekuerzt → Weniger Kontext-Verbrauch

**NICHT geloest (Agent-Workflow):**
- Agent ueberspring ALLE interaktiven Schritte (STOP-Anweisungen ignoriert)
- Agent transformiert Quellmaterial nicht in Folien-Content
- Agent kopiert JSON-Beispiel-Platzhalter woertlich statt echten Content einzusetzen
- Agent fuehrt keine Qualitaetskontrolle durch
- Agent hat kein Design-Verstaendnis (klont Folien statt sie zu gestalten)

**Root Cause (aus Test 2026-03-23):** Das Problem liegt nicht in der Engine (pptx-automizer),
nicht in den Constraints (Validierung), und nicht in den Daten (Catalog). Es liegt in der
**fehlenden Content-Transformation** zwischen Quellmaterial und Shape-Content. Der Agent
behandelt PPTX-Erstellung als technische Copy-Paste-Aufgabe statt als kreative Aufgabe.

---

## Kontext: Recherche-Ergebnis

Umfassende Analyse von 12 Projekten und 6 akademischen Papers (2026-03-23):

**Universelles Muster:** ALLE funktionierenden AI-Praesentations-Systeme trennen
**Planung** (Content-Struktur, Layout-Selektion) von **Generierung** (PPTX-Rendering).
Kein einziges System generiert Slides in einem Schritt.

| Projekt | Planungs-Ansatz | Relevanz |
|---------|----------------|----------|
| PPTAgent | Outline-Entries mit Reference-Slide + Document-Sections, dann Edit-basierte Generierung | Direkt uebertragbar |
| SlideGen | Arranger waehlt Layout NACH Content-Analyse (nicht vorher) | Layout-Selektion |
| Auto-Slides | PMRC-Format + Verification Agent (+10% Content-Accuracy) | Semantische Verifikation |
| Presenton | Zod-Schema pro Layout constrainted LLM-Output | Structured Output |
| NotebookLM | Source-Grounded Generation (alles aus Quellen) | Anti-Halluzination |
| json-to-ppt | Striktes JSON Schema + Pre-Rendering-Validation | Schema-Validierung |

**Enforcement-Patterns:**
- LangGraph: `interrupt_before` fuer mandatory Checkpoints
- Claude Agent SDK: PreToolUse Hooks fuer Prerequisite-Enforcement
- AgentSpec (ICSE 2026): Runtime-Regeln (Trigger + Praedikat + Enforcement)
- Reflexion/CRITIC: Generate → External Verification → Refine

---

## Entscheidung

### Neues Tool: `plan_presentation`

Ein dediziertes Tool das die Content-Transformation als **internen, constrainten LLM-Call**
ausfuehrt -- nicht als Prompt-Empfehlung an den Agent.

**Architektur:**

```
Agent-Loop                              plan_presentation Tool (intern)
-----------                             --------------------------------

User: "Erstelle Praesentation"
  |
Agent liest Quell-Note
  |
Agent ruft plan_presentation auf -----> 1. Note lesen (vault)
  |                                     2. Catalog laden (theme)
  |                                     3. INTERNER LLM-Call:
  |                                        System: PLANNING_PROMPT
  |                                        User: Quellmaterial + Guide + Constraints
  |                                        Output: DeckPlan JSON
  |                                     4. Validierung (Required, Platzhalter, Shape-Namen)
  |                                     5. Formatierung als Markdown
Agent erhaelt Plan <-------------------
  |
Agent zeigt Plan dem User
  |
User: "Ja, generiere"
  |
Agent ruft create_pptx auf
  (mit den Slides aus dem Plan)
  |
Agent ruft render_presentation auf
  (visuelle QA)
```

### Warum ein interner LLM-Call (nicht Agent-Orchestrierung)

**Problem mit Agent-Orchestrierung:**
Der Agent SOLL die Content-Transformation selbst machen (Skills sagen es).
Aber er TUT es nicht -- er ueberspring die Planungsschritte und geht direkt zur Generierung.
40+ Iterationen mit verschiedenen Skill-Formulierungen haben das nicht geloest.

**Loesung: Dedizierter LLM-Call im Tool:**
- Der Planning-LLM-Call hat einen **fokussierten, constrainten Prompt**
- Er erhaelt den **vollstaendigen Kontext** (Quellmaterial + Catalog) in einem einzigen Call
- Er muss ein **spezifisches JSON-Schema** zurueckliefern (nicht freies Text-Output)
- Er wird vom **Tool-Code validiert** (nicht vom Agent selbst)
- Er ist **nicht umgehbar** -- der Agent ruft das Tool auf, die Transformation passiert intern

**Analogie:** Wie PPTAgent's "Outline-Generierung" und Presenton's "Schema-constrainted Content".

### Keine Aenderungen an der Engine

- **pptx-automizer bleibt** -- validiert durch PPTAgent (gleicher Edit-basierter Ansatz)
- **TemplateEngine.ts bleibt** -- Auto-Remove, Auto-Upgrade, 10 Content-Typen funktionieren
- **create_pptx bleibt** -- bekommt jetzt fertige Slides statt Agent-Raten
- **Physische Shape-Namen bleiben** -- der Planning-LLM nutzt sie aus dem Catalog

---

## Alternativen betrachtet

| Alternative | Verworfen weil | Bezug |
|-------------|---------------|-------|
| Skill-only (staerkere Anweisungen) | Agent ignoriert STOP-Anweisungen konsistent. 40+ Iterationen gescheitert. | RC-1, RC-9 |
| Multi-Agent (spawnSubtask fuer Planner/Designer/Generator) | spawnSubtask gibt nur Text zurueck, kein structured data. Hohe Token-Kosten. Komplex. | Option D im Loesungsvorschlag |
| Prerequisite-Gate (create_pptx blockieren ohne Plan) | Bricht bestehende Workflows. Session-State noetig. Als Ergaenzung moeglich, nicht als Alleinloesung. | Option B |
| Automatische QA (render_presentation intern aufrufen) | Zu rigide. Besser: Agent ruft QA manuell auf (CRITIC-Pattern: externe Verifikation). | Abschnitt 4.7 |

---

## Konsequenzen

### Positiv
- Content-Transformation passiert zuverlaessig (interner LLM-Call, nicht Agent-Hoffnung)
- Agent braucht nur orchestrieren: plan → approve → generate → verify
- Plan ist sichtbar fuer User (impliziter Checkpoint, keine STOP-Anweisung noetig)
- Validierung fuer Required Shapes, Platzhalter, Shape-Namen VOR Generierung
- Source-Grounded: LLM-Call bekommt Quellmaterial als Kontext → weniger Halluzination
- Kompatibel mit bestehendem System (create_pptx, TemplateEngine, Catalog unveraendert)

### Negativ
- Zusaetzlicher LLM-Call pro Praesentation (Kosten + 10-20s Latenz)
- Neues Tool implementieren (~350 LOC)
- Agent muss plan_presentation vor create_pptx nutzen (Skill-Anweisung, nicht erzwungen)
- Planning-LLM-Output muss JSON sein (Parsing-Fehler moeglich)

### Risiken
- LLM liefert schlechten Plan → Mitigation: Validierung + User-Review vor Generierung
- Agent ruft plan_presentation nicht auf → Mitigation: Skill-Anweisung + Platzhalter-Erkennung in create_pptx
- JSON-Parsing schlaegt fehl → Mitigation: Markdown-Fence-Stripping, Retry bei Parse-Error
- Planning-Prompt zu lang fuer kleines Kontext-Fenster → Mitigation: Guide auf wesentliche Slide-Typen kuerzen

---

## Implementierte Dateien (geplant)

| Datei | Aenderung | Status |
|-------|-----------|--------|
| `src/core/office/pptx/types.ts` | DeckPlan, PlannedSlide, special_role, group_id | Implementiert |
| `src/core/tools/vault/PlanPresentationTool.ts` | **NEUES TOOL** (~350 LOC) | Implementiert |
| `src/core/tools/ToolRegistry.ts` | Registrierung (1 Zeile) | Implementiert |
| `src/core/tools/toolMetadata.ts` | Metadata-Eintraege (plan_presentation + ingest_template) | Implementiert |
| `src/core/modes/builtinModes.ts` | In edit-Gruppe aufgenommen | Implementiert |
| `src/core/tools/vault/IngestTemplateTool.ts` | special_role, group_id Erkennung | Implementiert |
| `src/core/office/pptx/TemplateCatalog.ts` | Beispiele mit ALLEN Shapes, Guide mit special_role/group_id | Implementiert |
| `src/core/tools/vault/CreatePptxTool.ts` | Platzhalter-Erkennung + QA-Hinweis | Implementiert |
| `bundled-skills/office-workflow/SKILL.md` | 6-Schritt Workflow mit plan_presentation | Implementiert |
| `bundled-skills/presentation-design/SKILL.md` | Regel 1: plan_presentation vor create_pptx | Implementiert |
| `src/core/tools/types.ts` | ToolName Union: plan_presentation hinzugefuegt | Implementiert |

## Verwandte Entscheidungen

| ADR | Beziehung |
|-----|-----------|
| ADR-46 | Basis-Engine (pptx-automizer, Direct Template Mode) -- unveraendert |
| ADR-47 | Validierung (Required Shapes, max_chars) -- bleibt aktiv, wird ergaenzt |
| ADR-31 | writeBinaryToVault -- unveraendert |
