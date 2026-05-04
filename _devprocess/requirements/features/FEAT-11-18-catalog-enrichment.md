# FEAT-11-18: Catalog-Enrichment (special_role, group_id, vollstaendige Beispiele)

**Epic:** EPIC-11 - Office Document Quality
**Priority:** P1-High
**Effort:** S (1-2 Tage)
**Branch:** feature/css-svg-slide-engine
**ADR:** ADR-48 (plan_presentation Pipeline)
**Abhaengigkeiten:** Keine (kann parallel zu FEAT-11-17 implementiert werden)

---

## Kontext

Root-Cause-Analyse (2026-03-23) hat drei Catalog-bezogene Probleme identifiziert:

**RC-3: Trennfolien-Nummer als "optional body" klassifiziert**
Der Body-Shape `Textplatzhalter 14` auf Trennfolien hat `sample_text: "1"` -- er IST die
Kapitelnummer. Aber der Catalog klassifiziert ihn als generischen `body`-Shape.
Der Agent/LLM weiss nicht, dass hier die Nummer hingehoert.

**RC-6: Gruppierte Shapes werden nicht als Einheit behandelt**
Auf Prozess-Slides gehoeren Chevrons und ihre Beschreibungstexte zusammen.
Der Catalog hat `group_hint: "Content-Felder (5x, horizontal)"`, aber keine
maschinenlesbare Gruppen-ID. Wenn ein Chevron entfernt wird, bleibt der
Beschreibungstext stehen.

**RC-5: JSON-Beispiele zeigen nur REQUIRED Shapes**
`generateSlideExample()` erzeugt Beispiele NUR fuer REQUIRED Shapes.
Optionale Shapes (die oft den eigentlichen Body-Content enthalten) fehlen.
Der Agent kopiert das Minimal-Beispiel und denkt er ist fertig.

---

## Loesung

### 1. `special_role` fuer Shapes mit spezifischer Funktion

Neues optionales Feld `special_role` auf `ShapeEntry` und `SlideTypeShape`:

```typescript
// In types.ts:
interface ShapeEntry {
    // ... bestehende Felder ...
    /** Spezielle Funktion dieses Shapes (z.B. Kapitelnummer auf Trennfolien). */
    special_role?: 'section_number';
}
```

**Erkennung in IngestTemplateTool.classifyShape():**
```
Wenn: role === 'body'
  UND sample_text besteht nur aus einer Zahl (1-9)
  UND Shape ist auf einem Slide dessen Layout-Name "trenner" enthaelt
Dann: special_role = 'section_number'
```

**Auswirkung auf Guide:**
```
- `Textplatzhalter 14` [optional] body [section_number] -- oben links
```

**Auswirkung auf plan_presentation:**
Der PLANNING_SYSTEM_PROMPT sagt: "Shapes mit special_role 'section_number':
Setze die laufende Kapitelnummer."

### 2. `group_id` fuer zusammengehoerige Shapes

Neues optionales Feld `group_id` auf `SlideTypeShape`:

```typescript
// In types.ts:
interface SlideTypeShape {
    // ... bestehende Felder ...
    /** Gruppen-ID fuer zusammengehoerige Shapes (entfernen/befuellen als Einheit). */
    group_id?: string;
}
```

**Generierung in IngestTemplateTool.tagShapeGroups():**
Shapes die bereits `group_hint` haben, bekommen eine maschinenlesbare `group_id`:
```
Shapes mit group_hint "Content-Felder (5x, horizontal)":
  → group_id: "content_group_1"

Innerhalb der Gruppe: durchnummerierte Sub-IDs:
  "Richtungspfeil 19"              → group_id: "process_steps", group_index: 0
  "Eingekerbter Richtungspfeil 16" → group_id: "process_steps", group_index: 1
  "Textplatzhalter 2"              → group_id: "process_steps", group_index: 0 (Beschreibung zu Step 1)
  "Textplatzhalter 2#1"            → group_id: "process_steps", group_index: 1 (Beschreibung zu Step 2)
```

**Auswirkung auf Guide:**
```
  [Prozess-Schritte (3x)]
  - `Richtungspfeil 19` [optional] body [group:step_1] -- links → Step 1 label
  - `Textplatzhalter 2` [optional] body [group:step_1] -- links → Step 1 description
  - `Eingekerbter Richtungspfeil 16` [optional] body [group:step_2] -- Mitte → Step 2 label
  - `Textplatzhalter 2#1` [optional] body [group:step_2] -- Mitte → Step 2 description
```

**Auswirkung auf plan_presentation:**
Der PLANNING_SYSTEM_PROMPT sagt: "Shapes mit gleicher group_id gehoeren zusammen.
Wenn du einen Shape entfernst, entferne ALLE Shapes der gleichen Gruppe."

### 3. JSON-Beispiele mit ALLEN sichtbaren Shapes

`generateSlideExample()` aendern: Statt nur REQUIRED Shapes auch alle optionalen
nicht-dekorativen Shapes einbeziehen.

**Vorher:**
```json
{"source_slide":5,"content":{"Titel 12":"Your slide title"}}
```

**Nachher:**
```json
{"source_slide":5,"content":{"Titel 12":"Section headline","Textplatzhalter 14":"1"},"notes":"..."}
```

Optionale Shapes bekommen rollenbasierte Beispielwerte (wie REQUIRED Shapes),
damit der Agent/LLM sieht was in jeden Shape gehoert.

---

## Success Criteria

| ID | Kriterium | Ziel |
|----|-----------|------|
| SC-01 | Trennfolien-Nummern-Shapes haben special_role: section_number | 100% der Trenner |
| SC-02 | Prozess-Shapes haben group_id | Alle Chevron + Beschreibung gruppiert |
| SC-03 | JSON-Beispiele enthalten alle sichtbaren Shapes | Nicht nur REQUIRED |
| SC-04 | Guide zeigt special_role und group_id lesbar an | Im Markdown-Format |

---

## Implementierung: Dateien und Aenderungen

| Datei | Aenderung | LOC |
|-------|-----------|-----|
| `src/core/office/pptx/types.ts` | `special_role?: 'section_number'` auf ShapeEntry + SlideTypeShape | ~5 |
| `src/core/office/pptx/types.ts` | `group_id?: string` auf SlideTypeShape | ~3 |
| `src/core/tools/vault/IngestTemplateTool.ts` | `classifyShape()`: special_role Erkennung | ~15 |
| `src/core/tools/vault/IngestTemplateTool.ts` | `tagShapeGroups()`: group_id Generierung | ~20 |
| `src/core/office/pptx/TemplateCatalog.ts` | `generateSlideExample()`: ALLE Shapes statt nur REQUIRED | ~10 |
| `src/core/office/pptx/TemplateCatalog.ts` | `formatSlideTypeGuide()`: special_role + group_id anzeigen | ~10 |

**Gesamt: ~63 LOC**

**Nach Implementierung:** EnBW-Template re-ingesten (`ingest_template force: true`)
um den aktualisierten Catalog zu generieren.

---

## Abgrenzung

- Gruppen-Entfernung in TemplateEngine (automatisch ganze Gruppe entfernen) -- Folge-Feature
- Neue Rollen (z.B. "chart_title", "legend") -- nicht in diesem Scope
- Vision-basierte Gruppen-Erkennung -- zu komplex, heuristische Erkennung reicht
