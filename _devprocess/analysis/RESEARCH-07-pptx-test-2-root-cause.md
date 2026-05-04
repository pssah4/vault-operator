# Root-Cause-Analyse: PPTX-Test 2 (2026-03-23, nach ADR-48)

**Testfall:** Genema POC Status Quo, EnBW Template, Reading Deck
**Ergebnis:** FEHLGESCHLAGEN -- gleiche Fehler wie Test 1
**Kritische Erkenntnis:** plan_presentation Tool wurde NICHT aufgerufen

---

## Rekonstruktion des Agent-Verhaltens

| Schritt | Erwartung (laut Skill) | Tatsaechlich |
|---------|----------------------|-------------|
| 1 | Skill office-workflow lesen | Korrekt |
| 2 | Skill presentation-design lesen | Korrekt |
| 3 | Source-Note lesen | Korrekt |
| 4 | Template-Guide laden (create_pptx ohne slides) | Korrekt |
| **5** | **plan_presentation aufrufen** | **NICHT GESCHEHEN** |
| 6 | Plan dem User zeigen | Uebersprungen |
| 7 | create_pptx mit Plan-Slides | Agent baut Slides SELBST zusammen |
| 8 | render_presentation | Unbekannt (Log abgeschnitten) |

## Das fundamentale Problem (das wir uebersehen haben)

**Ein Tool zu bauen reicht nicht. Der Agent muss es auch aufrufen.**

Wir haben in 50+ Iterationen IMMER das gleiche Muster:
1. Wir schreiben Skill-Anweisungen → Agent ignoriert sie
2. Wir bauen neue Tools → Agent nutzt sie nicht
3. Wir fuegen Validierung hinzu → Agent umgeht sie indem er das validierte Tool gar nicht aufruft

**Das zugrunde liegende Muster:** Der Agent hat ein gelerntes Verhalten:
"Praesentation erstellen" → `create_pptx` aufrufen. Das ist die kuerzeste Verbindung
zwischen Anfrage und Ergebnis. Alles was dazwischen liegt (plan_presentation, STOP-Punkte,
Verifikation) wird als "optional" behandelt und uebersprungen.

**Warum Skill-Anweisungen nicht ausreichen:**
Skills sind Text im System-Prompt. Sie konkurrieren mit dem Tool-Schema und der
Tool-Description. Wenn `create_pptx` sagt "Create a PowerPoint presentation" und die
Aufgabe ist "Erstelle eine Praesentation", dann ruft der Agent `create_pptx` auf --
unabhaengig davon was der Skill empfiehlt.

## Loesungsoptionen (nur Code-Level, kein Prompt-Level)

### Option 1: plan_presentation als EINZIGES Prasentations-Tool (radikal)

`create_pptx` wird fuer Template-Mode ENTFERNT oder umbenannt.
`plan_presentation` macht ALLES: Planen UND Generieren.

```
Agent sieht: plan_presentation("source", "template", "reading")
Agent erhaelt: fertigen Plan + Frage "Soll ich generieren?"
User: "Ja"
Agent ruft: plan_presentation(..., generate: true)
Intern: Tool erstellt PPTX
```

**Vorteil:** Agent KANN create_pptx nicht direkt aufrufen
**Nachteil:** Bricht Adhoc-Mode und bestehende Workflows

### Option 2: create_pptx BLOCKIERT ohne Plan (Prerequisite-Gate)

```typescript
// In CreatePptxTool.execute():
if (hasTemplateSlides && !sessionState.has('plan_approved')) {
    return error('Rufe zuerst plan_presentation auf.');
}
```

**Vorteil:** Agent wird gezwungen plan_presentation zu nutzen
**Nachteil:** Session-State noetig, bricht bestehende Workflows

### Option 3: create_pptx ruft plan_presentation INTERN auf (transparent)

Wenn create_pptx mit Template-Mode aufgerufen wird aber die Slides
offensichtlich nicht aus einem Plan stammen (Platzhalter, wenige Shapes),
ruft das Tool intern plan_presentation auf.

```typescript
// In CreatePptxTool.buildTemplatePresentation():
if (this.looksLikeManualSlides(slides)) {
    // Intern plan_presentation aufrufen statt zu warnen
    const plan = await this.planPresentation(sourceHint, template, slides);
    slides = plan.slides; // Ersetze manuelle Slides durch geplante
}
```

**Vorteil:** Transparent, bricht nichts
**Nachteil:** Woher kommt source material? Agent muss es irgendwie uebergeben.

### Option 4: plan_presentation wird IN create_pptx integriert (Merge)

create_pptx bekommt einen neuen Parameter `source`:

```typescript
create_pptx({
    output_path: "...",
    template: "enbw",
    source: "path/to/note.md",  // NEU
    deck_mode: "reading",       // NEU
    goal: "...",                 // NEU
})
```

Wenn `source` angegeben ist, fuehrt create_pptx intern den Planning-LLM-Call aus.
Wenn `slides` angegeben sind, verhaelt es sich wie bisher.

**Vorteil:** Agent braucht nur EIN Tool. "Erstelle Praesentation" → create_pptx → fertig.
**Nachteil:** Plan ist nicht sichtbar fuer User vor Generierung.

### Option 5: Option 4 + Plan-Output als Zwischenschritt

create_pptx mit `source` parameter macht TWO-PHASE:
1. Zeigt den Plan als Tool-Result (wie plan_presentation)
2. Wartet auf "Generiere" oder Aenderungswuensche

**Vorteil:** Ein Tool, aber Plan ist sichtbar
**Nachteil:** Tool muss auf User-Input warten (askQuestion intern)

---

## Empfehlung: Option 4 (Merge in create_pptx)

**Begruendung:** Das Problem ist fundamental dass der Agent `plan_presentation` nicht aufruft
weil er `create_pptx` als DAS Prasentations-Tool kennt. Statt den Agent zu zwingen
ein zweites Tool zu nutzen, betten wir die Planung IN das Tool ein das er sowieso aufruft.

Der Workflow wird:

```
User: "Erstelle Praesentation im EnBW Design"
Agent: create_pptx(source: "note.md", template: "enbw", deck_mode: "reading")
Tool intern: Liest Note → Plannt → Validiert → Generiert → PPTX
Agent: Erhaelt fertiges PPTX + Plan-Zusammenfassung
```

**Ein Tool, ein Aufruf, vollstaendiges Ergebnis.**
