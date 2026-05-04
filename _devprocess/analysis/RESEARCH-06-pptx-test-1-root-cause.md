# Root-Cause-Analyse: PPTX-Generierung Test 2026-03-23

**Testfall:** "Genema Use Case -- Status Quo Planaenderungserkennung" mit EnBW-Template
**Ergebnis:** FEHLGESCHLAGEN -- Schwerwiegende Maengel auf 16 von 18 Folien
**Bewertung:** Agent hat keine Praesentation erstellt, sondern Folien geklont und minimal manipuliert

---

## 1. Zusammenfassung der Fehler

| Folie | Typ | Fehler | Schwere |
|-------|-----|--------|---------|
| 1 | Titelfolie | OK | -- |
| 2 | Agenda | Falsche Ueberschrift, Agenda-Inhalt fehlt | Kritisch |
| 3 | Trenner | Nummerierung fehlt | Mittel |
| 4 | Content | Beispieltexte nicht ersetzt, mittlere Box leer, nur Titel korrekt | Kritisch |
| 5 | Prozess | Teilweise Beispieltexte, Chevron-Text falsch formatiert, Fazit mit Beispielwert "+25,3%" | Kritisch |
| 6 | Trenner | Falsche Nummerierung | Mittel |
| 7 | Content | Beispieltexte in allen Quadranten ausser einem | Kritisch |
| 8 | Content | Nur Titel ersetzt, Rest ist Beispieltext | Kritisch |
| 9 | Trenner | Nummerierung fehlt | Mittel |
| 10 | Prozess | Chevrons korrekt, aber Beschreibungstexte sind Beispieltexte, 5. Text nicht entfernt | Mittel |
| 11 | Trenner | Nummerierung fehlt | Mittel |
| 12 | Content | Nur Titel ersetzt, Rest ist Beispieltext | Kritisch |
| 13 | Prozess | Falsches Template fuer den Inhalt, Beispieltexte | Kritisch |
| 14 | Vergleich | Nur geklont + Titel getauscht, kein Verstaendnis | Kritisch |
| 15 | Content | Nur Titel ersetzt, Rest ist Beispieltext | Kritisch |
| 16 | Trenner | Falsche Nummerierung | Mittel |
| 17 | Content | Leere Folie | Kritisch |
| 18 | Abschluss | Nur Default-Texte, keine Kontaktdaten | Mittel |

**PPTX musste bei Oeffnung repariert werden** (technischer Fehler in pptx-automizer oder TemplateEngine)

---

## 2. Prozess-Rekonstruktion (was der Agent getan hat)

Aus dem Chatverlauf rekonstruiert:

### Schritt 1: Skill geladen
Agent laedt `office-workflow` und `presentation-design` Skills. Beide werden korrekt gelesen.

### Schritt 2: Workflow uebersprungen
Der Skill schreibt vor:
- Step 1: CONTEXT (ASK and STOP) -- User nach Ziel, Audience, Deck Mode fragen
- Step 2: TEMPLATE (ASK and STOP) -- Design-Wahl
- Step 3: PLAN (share and STOP) -- Folienplan zeigen und Freigabe holen

**Keiner dieser Schritte wurde ausgefuehrt.** Der Agent hat alle STOP-Anweisungen ignoriert.

### Schritt 3: Guide abgerufen
Agent ruft `create_pptx` mit `template: "enbw"` und keinen Slides auf, erhaelt den Slide-Type-Guide
mit 64 Slide-Typen und JSON-Beispielen.

### Schritt 4: Praesentation generiert
Agent generiert direkt die PPTX ohne sichtbaren Plan, ohne User-Freigabe, ohne Deck-Mode-Bestimmung.

### Schritt 5: Keine Qualitaetskontrolle
`render_presentation` wurde nicht aufgerufen. Step 5 (VERIFY) wurde uebersprungen.

---

## 3. Root Causes

### RC-1: Agent ignoriert STOP-Anweisungen im Skill (KRITISCH)

**Erwartetes Verhalten:** Agent fragt nach Ziel, Audience, Deck Mode (Step 1), wartet auf Antwort.
Dann fragt nach Template-Wahl (Step 2). Dann zeigt Folienplan (Step 3), wartet auf Freigabe.

**Tatsaechliches Verhalten:** Agent ueberspringt alle interaktiven Schritte und generiert sofort.

**Ursache:** Der User sagte "Erstelle eine Praesentation mit den Inhalten dieser Note im EnBW Design".
Der Agent interpretiert dies als kompletten Auftrag und fuehrt alles in einem Durchgang aus.
Die Skill-Anweisung "STOP. Wait for answer." wird vom Agent nicht als hard constraint behandelt,
sondern als optionale Empfehlung.

**Auswirkung:** Ohne Kontext-Klaerung (Audience, Deck Mode) fehlt dem Agent die Grundlage fuer
jede Design-Entscheidung. Ohne Plan-Freigabe wird keine Qualitaetskontrolle vor der Generierung
durchgefuehrt.

**Verantwortliche Komponente:** Skill-Formulierung + Agent-Prompting (kein Code-Problem)

---

### RC-2: Agent transformiert Quellinhalt nicht in Foliencontent (KRITISCH)

**Erwartetes Verhalten:** Agent liest die Quell-Note, versteht die Kernaussagen, und formuliert
Content fuer jede Shape: Titel als Action-Title, Body als transformierte Bullet-Points,
Daten als KPIs oder Charts.

**Tatsaechliches Verhalten:** Agent kopiert JSON-Beispiel aus dem Guide, ersetzt die Titelzeile,
laesst aber Body-Shapes leer oder mit Platzhaltertext ("Main content paragraph", "Lorem ipsum").

**Ursache (mehrstufig):**

1. **JSON-Beispiel zeigt nur REQUIRED Shapes:** `generateSlideExample()` generiert Beispiele
   NUR fuer REQUIRED Shapes. Fuer "titel-und-inhalt" (Slide 9):
   ```
   Example: {"source_slide":9,"content":{"Titel 10":"Your slide title","Inhaltsplatzhalter 3":"Main content paragraph"}}
   ```
   Der Platzhalter "Main content paragraph" wird vom Agent woertlich uebernommen statt durch
   echten Content ersetzt.

2. **Agent versteht "kopiere und ersetze" woertlich:** Der Skill sagt "Copy it, replace placeholder
   values with real content." Aber der Agent behandelt das als Template-Fill, nicht als
   Content-Creation. Er sieht "Main content paragraph" und denkt "das ist der Content".

3. **Keine Content-Transformation-Anleitung:** Der Skill sagt WAS zu tun ist (fill shapes) aber
   nicht WIE man Quellmaterial in Foliencontent transformiert. Die presentation-design Regeln
   (Content Classification, Visual Vocabulary) sind zu abstrakt fuer den Agent.

**Verantwortliche Komponente:** Skill (office-workflow) + JSON-Beispiel-Format

---

### RC-3: Trennfolien-Nummerierung nicht im JSON-Beispiel (MITTEL)

**Erwartetes Verhalten:** Trennfolien zeigen die Kapitelnummer (1, 2, 3...).

**Tatsaechliches Verhalten:** Nummerierung fehlt oder ist falsch.

**Ursache:** Fuer "trenner-01" (Slide 5):
```
Shapes:
  - `Titel 12` [REQUIRED] title -- Section headline
  - `Textplatzhalter 14` [optional] body -- Optional short description
Example: {"source_slide":5,"content":{"Titel 12":"Your slide title"}}
```

Das Problem: `Textplatzhalter 14` hat `sample_text: "1"` -- es IST der Nummern-Shape. Aber:
- Im Guide ist er als "[optional] body" klassifiziert, nicht als "section_number"
- Im JSON-Beispiel fehlt er (nur REQUIRED Shapes)
- Die `semantic_hint` sagt "Optional short description or section subtitle"
- Der Agent weiss nicht, dass dieser Shape die Kapitelnummer enthaelt

Da der Shape `removable: true` ist, wird er durch Auto-Remove geloescht. Die Nummer verschwindet.

**Verantwortliche Komponente:** Catalog-Klassifikation (inferRole) + JSON-Beispiel-Generator

---

### RC-4: Inherited Layout-Shapes (0x0) koennen nicht entfernt werden (MITTEL)

**Erwartetes Verhalten:** Nicht adressierte Shapes verschwinden (Auto-Remove).

**Tatsaechliches Verhalten:** Leere Boxen bleiben auf der Folie.

**Ursache:** Shapes die von Slide-Layouts geerbt werden (dimensions 0x0) koennen nicht individuell
von der Folie entfernt werden -- sie existieren nicht als XML-Element auf der Slide sondern
werden vom Layout vererbt. Sie sind deshalb `removable: false`.

Die TemplateEngine hat einen Auto-Clear-Mechanismus (Zeile 274-306) der diese Shapes auf
leeren String setzt. Das verhindert Lorem Ipsum, erzeugt aber leere Textboxen. Der Agent
muss diese Shapes AKTIV mit Content befuellen.

11+ Body-Shapes in der EnBW-Vorlage sind betroffen:
- Inhaltsplatzhalter 3 (Layout 9 - titel-und-inhalt)
- Inhaltsplatzhalter 4, 5 (Layout 10 - zwei-inhalte)
- Inhaltsplatzhalter 3 (Layout 11 - inhalt-und-bild-rechts)
- etc.

**Verantwortliche Komponente:** OOXML-Architektur (nicht aenderbar) + Agent muss Body-Shapes befuellen

---

### RC-5: JSON-Beispiele enthalten nur REQUIRED Shapes (KRITISCH)

**Erwartetes Verhalten:** Agent befuellt ALLE sichtbaren Shapes mit Content.

**Tatsaechliches Verhalten:** Agent befuellt nur die im Beispiel gezeigten REQUIRED Shapes.

**Ursache:** `TemplateCatalog.generateSlideExample()`:
```typescript
for (const sh of st.shapes) {
    if (!sh.required) continue;  // ← OPTIONAL SHAPES FEHLEN
    ...
}
```

Fuer "titel-und-inhalt" sind beide Shapes REQUIRED, also erscheinen beide im Beispiel.
Aber fuer viele andere Slide-Typen (Prozess, Chart, Vergleich) sind die meisten Shapes
optional. Der Agent sieht ein minimales Beispiel und befuellt nur das Minimum.

**Auswirkung:** Der Agent denkt, er muss nur die Beispiel-Shapes befuellen. Optional Shapes
werden entweder Auto-Removed (wenn removable) oder Auto-Cleared (leere Box, wenn nicht removable).

**Verantwortliche Komponente:** `TemplateCatalog.generateSlideExample()` Code-Logik

---

### RC-6: Gruppierte Shapes werden nicht als Einheit behandelt (MITTEL)

**Erwartetes Verhalten:** Wenn ein Chevron aus einer Prozess-Kette entfernt wird, wird auch
der zugehoerige Beschreibungstext entfernt.

**Tatsaechliches Verhalten:** Chevron entfernt, aber Beschreibungstext bleibt stehen.

**Ursache:** Der Catalog hat `group_hint: "Content-Felder (5x, horizontal)"`, aber:
- Es gibt kein Konzept von "Gruppen-Entfernung" in der TemplateEngine
- Auto-Remove behandelt jeden Shape individuell
- Der Agent muesste explizit ALLE zusammengehoerigen Shapes im `remove`-Array auflisten
- Der Agent versteht die Gruppen-Semantik nicht aus dem Guide

**Verantwortliche Komponente:** TemplateEngine (keine Gruppen-Logik) + Catalog (group_hint nicht actionable)

---

### RC-7: Keine Qualitaetskontrolle durchgefuehrt (KRITISCH)

**Erwartetes Verhalten:** Nach Generierung ruft Agent `render_presentation` auf 2-3 Folien auf,
prueft visuell, und korrigiert Fehler.

**Tatsaechliches Verhalten:** Agent uebergibt die PPTX ohne Kontrolle.

**Ursache:** Gleiche Ursache wie RC-1 -- Agent ueberspring den VERIFY-Schritt. Zusaetzlich:
- Der Agent hat keinen "inneren Kritiker" -- er erzeugt Output und liefert ab
- Die Skill-Anweisung "render_presentation on 2-3 slides" ist eine optionale Empfehlung
- Es gibt keinen technischen Mechanismus der die Verifikation erzwingt

**Verantwortliche Komponente:** Agent-Verhalten + Skill (kein enforcement)

---

### RC-8: PPTX muss repariert werden (TECHNISCH)

**Erwartetes Verhalten:** Generierte PPTX oeffnet fehlerfrei in PowerPoint.

**Tatsaechliches Verhalten:** PowerPoint meldet Reparaturbedarf.

**Ursache (Hypothesen):**
- pptx-automizer erzeugt inkonsistente Relationships bei vielen Slides
- Auto-Remove oder shape.removeElement() hinterlaesst verwaiste Referenzen
- assertRelatedContents: true kann nicht alle Inkonsistenzen beheben
- Moeglich: Slide-Layout-Verweise werden bei removeExistingSlides inkonsistent

**Verantwortliche Komponente:** TemplateEngine + pptx-automizer (technisch)

---

### RC-9: Agent hat kein Design-Verstaendnis (FUNDAMENTAL)

**Erwartetes Verhalten:** Agent analysiert Quellmaterial, entwickelt Narrativ (Hook → Build → Turn →
Resolution → Echo), waehlt passende visuelle Formen pro Inhalt, transformiert Content in
Foliencontent.

**Tatsaechliches Verhalten:** Agent klont Folien in ungefaehr passender Reihenfolge, setzt
vereinzelt Titel ein, laesst den Rest auf Beispieltexten.

**Ursache (fundamental):** Der Agent behandelt PPTX-Erstellung als TECHNISCHE Aufgabe
("fuege Slide X mit Shape Y ein") statt als KREATIVE Aufgabe ("erzaehle diese Geschichte
visuell mit diesen Design-Elementen").

Der presentation-design Skill gibt die THEORIE (Narrative Arc, Design Thinking Chain,
Content Classification), aber der Agent wendet sie nicht an. Er ueberspringt die
Planungsphase und geht direkt zur Ausfuehrung.

**Die Kette die fehlt:**
```
1. Quellmaterial verstehen → Kernaussagen extrahieren
2. Narrativ entwickeln → Welche Geschichte erzaehlen wir?
3. Folienplan erstellen → Welche Folientypen fuer welche Aussage?
4. Content transformieren → Quelltext → Foliencontent pro Shape
5. Generieren → create_pptx mit vollstaendig befuellten Shapes
6. Verifizieren → render_presentation, Fehler korrigieren
```

Der Agent springt von Schritt 1 direkt zu Schritt 5 und fuehrt Schritt 5 nur minimal aus.

**Verantwortliche Komponente:** Agent-Prompting + Skill-Architektur (keine Erzwingung der Schritte)

---

## 4. Root-Cause-Kategorisierung

### Kategorie A: Agent-Verhalten / Prompting
- **RC-1:** Agent ignoriert STOP-Anweisungen
- **RC-7:** Keine Qualitaetskontrolle
- **RC-9:** Kein Design-Verstaendnis

→ Diese Probleme liegen NICHT im Code, sondern in der Art wie der Agent die Skills interpretiert.
  Der Agent braucht HAERTERE Constraints -- "STOP" muss durchgesetzt werden, nicht empfohlen.

### Kategorie B: Catalog / Daten
- **RC-3:** Trennfolien-Nummer als "optional body" klassifiziert
- **RC-4:** Inherited Layout-Shapes nicht entfernbar (0x0 Dimensionen)
- **RC-6:** Gruppierte Shapes keine Einheit

→ Die Catalog-Daten sind strukturell korrekt (die Klassifikation spiegelt die OOXML-Realitaet),
  aber semantisch unzureichend fuer den Agent. Er versteht nicht, welche Shapes zusammen
  gehoeren und welche die Nummer enthalten.

### Kategorie C: Code / JSON-Beispiele
- **RC-5:** JSON-Beispiele nur mit REQUIRED Shapes
- **RC-2:** Platzhaltertext woertlich uebernommen

→ Die JSON-Beispiele sind zu minimal. Sie zeigen das technische Minimum, nicht das erwartete
  Ergebnis. Der Agent braucht Beispiele die ALLE sichtbaren Shapes zeigen.

### Kategorie D: Technisch
- **RC-8:** PPTX-Reparaturbedarf

→ Technischer Bug in pptx-automizer oder TemplateEngine, unabhaengig von den anderen Problemen.

---

## 5. Priorisierte Erkenntnisse

### Erkenntnis 1: Das Problem ist nicht die Engine
Die TemplateEngine (pptx-automizer Wrapper) funktioniert technisch. Auto-Remove funktioniert.
Auto-Clear funktioniert. Content-Dispatch funktioniert. Wenn der Agent die richtigen Shapes
mit dem richtigen Content befuellt, kommt eine korrekte Praesentation heraus.

### Erkenntnis 2: Das Problem ist der Agent-Workflow
Der Agent ueberspring ALLE interaktiven Schritte (Kontext, Plan, Verifikation) und behandelt
PPTX-Erstellung als One-Shot-Aufgabe. Das ist fundamental falsch fuer eine kreative Aufgabe.

### Erkenntnis 3: JSON-Beispiele sind kontraproduktiv
Die JSON-Beispiele sollten den Agent anleiten, haben aber den gegenteiligen Effekt: Der Agent
kopiert das Minimal-Beispiel und denkt, er ist fertig. Er befuellt WENIGER Shapes als ohne
Beispiel, weil er das Beispiel als vollstaendig betrachtet.

### Erkenntnis 4: Die Content-Transformation fehlt komplett
Zwischen "Quellmaterial lesen" und "create_pptx aufrufen" fehlt der gesamte kreative Prozess:
Content verstehen, Kernaussagen extrahieren, in Folien-Format transformieren, pro Shape
formulieren. Der Agent macht das nicht, weil kein Skill oder Prompt ihn dazu anhaelt.

### Erkenntnis 5: "STOP and wait" funktioniert nicht als Agent-Anweisung
Der Agent in Obsidian interpretiert "STOP. Wait for answer." nicht als Blockade sondern als
optionale Empfehlung. Es gibt keinen technischen Mechanismus der den Agent dazu zwingt,
zwischen Schritten auf User-Input zu warten.

---

## 6. Code-Trace: Wo genau passiert der Fehler

### generateSlideExample (TemplateCatalog.ts)

```typescript
private static generateSlideExample(st: SlideType): string {
    const content: Record<string, string> = {};
    for (const sh of st.shapes) {
        if (!sh.required) continue;  // ← NUR REQUIRED
        const key = sh.duplicate_index != null && sh.duplicate_index > 0
            ? `${sh.name}#${sh.duplicate_index}` : sh.name;
        content[key] = this.exampleValueForRole(sh);
    }
    ...
}
```

**Problem:** Optional Shapes fehlen im Beispiel. Der Agent sieht nicht, dass er sie befuellen SOLL.

### inferRole (IngestTemplateTool.ts)

```typescript
private inferRole(el: DiscoveredShape): ShapeEntry['role'] {
    // ...
    // 5. Size-aware text fallback
    if (el.hasTextBody && el.text.length > 0) {
        if (wPx > 192 && hPx > 58) return 'body';
        return 'decorative';
    }
    return 'decorative';
}
```

**Problem:** Die Shape-Nummer "1" auf Trennfolien hat role: body weil sie ein Textplatzhalter ist.
Es gibt keine Rolle "section_number" oder aehnliches. Der Agent kann nicht unterscheiden
zwischen "hier kommt die Kapitelnummer hin" und "hier kommt optionaler Beschreibungstext hin".

### classifyShape (IngestTemplateTool.ts)

```typescript
const removable = role !== 'title' && role !== 'subtitle' && role !== 'decorative'
    && (widthPx > 0 || heightPx > 0);
```

**Problem:** Inherited Shapes (0x0) sind korrekt als nicht-removable markiert.
Aber der Agent weiss nicht, dass er sie TROTZDEM befuellen muss (sonst bleiben sie leer).

### Auto-Clear (TemplateEngine.ts, Zeile 274-306)

```typescript
// 3b. Auto-CLEAR non-removable shapes that weren't addressed
if (catalog) {
    for (const shape of layoutEntry.shapes) {
        if (shape.removable) continue;
        if (shape.role === 'decorative') continue;
        if (shape.content_type !== 'text') continue;
        if (addressedShapes.has(key)) continue;
        slide.modifyElement(finder, modify.setText(''));  // ← Leert den Shape
    }
}
```

**Beobachtung:** Auto-Clear funktioniert korrekt -- er setzt nicht-adressierte Shapes auf "".
Aber der User meldet "Beispieltexte nicht ersetzt". Das bedeutet entweder:
1. Der Agent HAT Content geliefert (aber den falschen -- Platzhaltertext), oder
2. Auto-Clear hat nicht gegriffen (Shape war addressed aber mit leerem Content)

Wahrscheinlich #1: Der Agent hat `content: {"Inhaltsplatzhalter 3": "Main content paragraph"}`
gesendet -- das zaehlt als "addressed" und Auto-Clear greift nicht. Aber der Content ist
der Platzhalter aus dem JSON-Beispiel.

---

## 7. Kernproblem-Statement

**Das fundamentale Problem ist NICHT technisch (Engine, Auto-Remove, Catalog), sondern
ein Agent-Workflow-Problem:**

Der Agent hat keinen internen Prozess um:
1. Quellmaterial zu analysieren und Kernaussagen zu extrahieren
2. Einen Folienplan mit Narrativ zu entwickeln
3. Content pro Folie und pro Shape zu formulieren
4. Die Ergebnisse visuell zu pruefen und zu korrigieren

Stattdessen behandelt er PPTX-Erstellung als "fuege technisch korrekte API-Calls zusammen" --
er optimiert auf syntaktische Korrektheit (richtige Shape-Namen, richtige Slide-Nummern)
statt auf inhaltliche und visuelle Qualitaet.

Die bisherigen Optimierungen (ADR-47: JSON-Beispiele, Required-Validierung, Skill-Kuerzung)
adressieren technische Korrektheit, nicht kreative Qualitaet. Sie verhindern FEHLER
(fehlende Required Shapes), erzeugen aber keine QUALITAET (guter Content, passende Layouts).

---

## 8. Offene Fragen fuer die naechste Iteration

1. **Kann man STOP-Anweisungen in Obsidian Agent erzwingen?** (Toolebene vs. Prompt-Ebene)
2. **Soll der JSON-Beispiel-Ansatz beibehalten oder verworfen werden?**
   (Er wurde als Loesung eingefuehrt, ist aber moeglicherweise kontraproduktiv)
3. **Braucht es einen separaten "Content Planning" Schritt im Tool?**
   (z.B. ein `plan_presentation` Tool das VOR `create_pptx` aufgerufen werden muss)
4. **Ist ein Multi-Agent-Ansatz (Planner → Designer → Generator) der richtige Weg?**
   (Wie PPTAgent, aber in TypeScript)
5. **Ist das Gesamtkonzept "Agent fuellt Template-Shapes" grundsaetzlich der richtige Ansatz?**
   (Oder braucht es einen komplett anderen Workflow?)
