# ADR-49: Raw XML Clear + Generate (Abloesung modifyElement fuer Content)

**Datum:** 2026-03-23
**Ersetzt:** Teilweise ADR-47 (Schema-Constrained), ergaenzt ADR-46 (Direct Template Mode)
**Kontext:** Nach 50+ gescheiterten Iterationen der Template-Content-Pipeline

> **Hinweis:** Diese Entscheidung blieb in Status Vorgeschlagen. Der hier
> beschriebene Flow wurde nicht in `TemplateEngine.ts` umgesetzt; die
> Datei existiert im aktuellen Code nicht. Der Office-Pipeline-Stand
> 2026-04-29 nutzt weiterhin den ADR-46-Direct-Template-Modus mit den
> spaeteren Verbesserungen aus ADR-48 (plan_presentation). Wenn die
> hier beschriebene Loesung wieder relevant wird, wird ein
> Folge-ADR mit dem aktuellen Code-Stand aufgesetzt.

---

## Kontext

### Chronologie der gescheiterten Ansaetze

| ADR | Ansatz | LOC | Ergebnis | Root Cause |
|-----|--------|-----|----------|-----------|
| ADR-32 | JSZip + OOXML-Injection | ~2000 | Design-Treue ~60% | OOXML manuell schreiben zu komplex |
| ADR-33 | Cloud Run + Vision | - | Nie implementiert | Zu viel Infrastruktur |
| ADR-34 | Visual Design Language | - | Nie implementiert | 16k-Limit, Format zu komplex |
| ADR-35 | Embedding + compositions.json | ~3000 | Kontext-Overflow | 37k Zeichen Skill-Dateien |
| ADR-44 | CSS-SVG Engine | ~1500 | ~70% Design-Treue | CSS nie konsumiert, HTML-Pipeline unzureichend |
| ADR-45 | pptx-automizer + Compositions | ~28000 | Zirkulaere Abstraktion | LayoutDeduplicator + CompositionResolver |
| ADR-46 | Direct Template Mode | ~1200 | Agent ignoriert Shapes | Physische Namen korrekt, aber Agent-Interface zu schwach |
| ADR-47 | Schema-Constrained + JSON-Beispiele | ~80 | Agent kopiert Platzhalter | Prompt-Level Constraints unwirksam |
| ADR-48 | plan_presentation Tool | ~500 | Plan gut, Rendering schlecht | Content-Transformation geloest, aber Engine kann inherited Shapes nicht modifizieren |

### Das fundamentale Problem (identifiziert 2026-03-23, nach 50+ Tests)

**pptx-automizer's `modifyElement()` kann inherited Layout-Shapes nicht modifizieren.**

PowerPoint-Vorlagen definieren Shapes auf zwei Ebenen:
1. **Slide-Level:** Physische `<p:sp>` Elemente im `slideN.xml` -- modifyElement funktioniert
2. **Layout-Level:** Shapes im `slideLayoutN.xml` die per `<p:ph>` Referenz geerbt werden -- modifyElement SCHEITERT STILL

Bei professionellen Corporate Templates (z.B. EnBW) sind die meisten Content-Shapes (Titel, Body, Platzhalter) **inherited**. Sie erscheinen in PowerPoint, werden von `getAllElements()` erkannt und im Catalog aufgenommen, aber `modifyElement()` findet sie nicht im Slide-XML.

**Symptome (alle 50+ Tests):**
- Beispieltexte (Lorem Ipsum) bleiben stehen
- Neue Texte werden ALS OVERLAY ueber die alten gelegt
- Dekorative Elemente (Hintergrund, Logo, Formen) funktionieren (sind physisch auf Slide-Level)
- Einfache Slides (nur Titel) funktionieren manchmal (wenn Titel physisch ist)

### Bisherige Mitigationsversuche die alle gescheitert sind

1. **Auto-Clear (setText('')):** Scheitert am gleichen Problem -- modifyElement findet den Shape nicht
2. **removeElement + generate():** removeElement kann inherited Shapes auch nicht entfernen
3. **Hybrid Fallback:** generate() erzeugt NEUE Textboxen UEBER den nicht-loeschbaren alten -- Ueberlagerung
4. **Prompt-Level Instructions:** Agent-Verhalten verbessert (plan_presentation), aber Engine-Problem bleibt

---

## Entscheidung

### Ansatz: Raw XML Clear + PptxGenJS Generate

**Kern-Idee:** Umgehe `modifyElement()` komplett. Nutze stattdessen:
1. `slide.modify()` fuer direkten XML-DOM-Zugriff -- leere ALLE Texte auf der Slide
2. `slide.generate()` fuer PptxGenJS-basierte Content-Erzeugung an Catalog-Positionen

```
Template-Slide klonen (Design bleibt: Hintergrund, Logo, Deko-Formen)
    |
    v
slide.modify(async (xmlDoc) => {
    // Finde ALLE <a:t> Elemente (Textinhalte) im Slide-XML
    // Leere sie (text = '')
    // Das betrifft AUCH inherited Placeholder-Texte
})
    |
    v
slide.generate((pptxSlide) => {
    // Fuer jeden Content-Shape aus dem Catalog:
    // pptxSlide.addText(content, {
    //     x, y, w, h,           // aus Catalog-Dimensionen
    //     fontFace, fontSize,    // aus Catalog font_info
    //     fit: 'shrink',         // Auto-Fit
    //     margin: [6, 8, 6, 8], // Innenabstand
    // })
})
    |
    v
PPTX mit: Design erhalten + alle Texte frisch + keine Ueberlagerung
```

### Warum `slide.modify()` funktioniert wo `modifyElement()` scheitert

`modifyElement()` sucht Shapes per Name im Slide-XML. Inherited Shapes sind dort nicht als vollstaendige `<p:sp>` Elemente vorhanden -- sie werden per `<p:ph>` Referenz aus dem Layout geerbt.

ABER: Wenn PowerPoint eine Slide mit inherited Shapes oeffnet, werden die Texte als `<a:t>` Elemente in den Placeholder-Referenzen gespeichert. `slide.modify()` gibt uns den GESAMTEN XML-DOM -- inklusive dieser Placeholder-Texte. Wir koennen sie direkt leeren.

Falls `slide.modify()` die Texte nicht im Slide-XML findet (weil sie wirklich nur im Layout stehen):
- Plan B: `slide.generate()` erzeugt OPAQUE Textboxen mit weissem/farbigem Hintergrund die die alten Texte ueberdecken
- Plan C: Fuer jede Slide einen Preprocessing-Schritt der den SlideLayout-XML modifiziert

### Technischer Ablauf im TemplateEngine

```typescript
// Neuer Flow in buildFromTemplate():

automizer.addSlide('template', slideNum, (slide: ISlide) => {
    slide.useSlideLayout();

    // SCHRITT 1: Raw XML Clear -- alle sichtbaren Texte leeren
    slide.modify(async (xmlDoc: XMLDocument) => {
        // Finde alle <a:t> Elemente (Textinhalt in OOXML)
        const textNodes = xmlDoc.getElementsByTagName('a:t');
        for (let i = 0; i < textNodes.length; i++) {
            // Nur nicht-dekorative Shapes leeren
            // Dekorative erkennen: Fusszeile, Foliennummer, Datumsplatzhalter
            const parent = findParentShape(textNodes[i]);
            if (!isDecorativeShape(parent)) {
                textNodes[i].textContent = '';
            }
        }
    });

    // SCHRITT 2: Content via PptxGenJS generieren
    slide.generate((pptxSlide) => {
        for (const [shapeName, content] of Object.entries(slideInput.content)) {
            const meta = findShapeMeta(shapeName, slideNum, catalog);
            if (!meta?.dimensions) continue;

            const { x, y, w, h } = toInches(meta.dimensions);
            const fi = meta.font_info;

            pptxSlide.addText(extractPlainText(content), {
                x, y, w, h,
                fontSize: fi?.font_size ?? 14,
                fontFace: fi?.font_face ?? 'Calibri',
                bold: fi?.is_bold ?? false,
                color: fi?.color ?? '000000',
                fit: 'shrink',
                margin: [6, 8, 6, 8],
                valign: meta.role === 'title' ? 'middle' : 'top',
                wrap: true,
            });
        }
    });
});
```

---

## Alternativen betrachtet

| Alternative | Verworfen weil |
|-------------|---------------|
| **Weiter modifyElement optimieren** | Fundamentale Limitierung: Library kann inherited Shapes nicht adressieren |
| **python-pptx via Subprocess** | Falscher Tech-Stack, Dependency-Management, Latenz |
| **Template preprocessing** (Shapes von Layout auf Slide kopieren) | Wuerde alle Slides aendern, Layout-Inheritance brechen |
| **Komplett auf Adhoc umsteigen** (kein Template) | Verliert 100% Corporate Design-Treue |
| **pptx-automizer forken** | Wartungsaufwand, Library-Updates verloren |
| **Anderer OOXML-Manipulator** (docx4js, officegen) | Keine bessere Template-Unterstuetzung |

---

## Konsequenzen

### Positiv
- Loest das fundamentale Problem das 50+ Iterationen blockiert hat
- Nutzt bestehende pptx-automizer API (`slide.modify()` + `slide.generate()`)
- Keine neue Dependency
- Design-Treue bleibt erhalten (Slide wird geklont, nur Texte werden ersetzt)
- PptxGenJS `fit: 'shrink'` verhindert Text-Overflow
- Font-Info aus Catalog sorgt fuer Template-konsistente Typografie

### Negativ
- `slide.modify()` mit Raw XML ist fragil (OOXML-Namespace-Handling)
- Dekorative Texte (Logo-Text, Fussnoten) muessen erkannt und NICHT geleert werden
- Doppelte Positionierung (einmal im Template, einmal in PptxGenJS) kann zu minimalen Verschiebungen fuehren
- `fit: 'shrink'` berechnet erst beim Oeffnen in PowerPoint (nicht in der Datei)

### Risiken
- **`slide.modify()` findet keine Texte:** Wenn inherited Shapes wirklich NUR im Layout-XML stehen, greift Plan B (opaque Overlay)
- **Dekorative Texte werden geleert:** Mitigation durch Pattern-Matching auf Shape-Namen (Fusszeile, Foliennummer, Datum)
- **Font-Matching ungenau:** Mitigation durch font_info im Catalog (Phase 4 bereits implementiert)
- **Namespace-Probleme im XML:** Mitigation durch xmlDoc.getElementsByTagNameNS() statt getElementsByTagName()

---

## Implementation Notes (may go stale)

> Das damals geplante Modul `TemplateEngine.ts` existiert im Code
> nicht. Der ADR ist Vorgeschlagen geblieben und der Pfad-Hinweis ist
> ein historischer Designvorschlag, kein Code-Stand. Aktuelle Office-
> Entry-Points: `grep "office\|pptx" src/ARCHITECTURE.map`.

### Damals geplante Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `TemplateEngine.ts` (geplant, nicht umgesetzt) | Neuer Flow: modify() plus generate() statt modifyElement() fuer Text |
| `TemplateEngine.ts` (geplant, nicht umgesetzt) | `isDecorativeShape()` Hilfsfunktion fuer XML-DOM |

### Was NICHT geaendert wird
- `PlanPresentationTool.ts` -- Plan-Schicht funktioniert korrekt
- `IngestTemplateTool.ts` -- Catalog-Generierung bleibt
- `AdhocSlideBuilder.ts` -- Phase-1 Quick Wins bleiben (fit, margin, shadow)
- `CreatePptxTool.ts` -- Validierung bleibt
- Skills -- Workflow bleibt identisch

### Verifikation
- Test mit EnBW-Vorlage (Genema Use Case)
- Vergleich: Inherited Shapes (Body, Platzhalter) muessen LEER sein + neuer Content sichtbar
- Dekorative Elemente (Logo, Hintergrund, Formen) muessen intakt sein
- Keine PPTX-Reparatur beim Oeffnen noetig

---

## Verwandte Entscheidungen

- ADR-46: Direct Template Mode (Basis: physische Shape-Namen, keine Abstraktion)
- ADR-48: plan_presentation Tool (Content-Transformation: Source → DeckPlan)
- GAP-ANALYSE-PPTX-CAPABILITIES-2026-03-23.md (Feature-Nutzung PptxGenJS + pptx-automizer)
- ROOT-CAUSE-PPTX-TEST-2-2026-03-23.md (Fehlschlag-Analyse)
