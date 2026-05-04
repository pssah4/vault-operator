# Gap-Analyse: PPTX-Capabilities -- Verfuegbar vs. Genutzt

**Datum:** 2026-03-23
**Kontext:** Nach 50+ gescheiterten Iterationen zeigt sich, dass wir die vorhandenen Library-Capabilities nicht ausschoepfen. Diese Analyse identifiziert alle ungenutzten Features die zur Loesung der aktuellen Probleme beitragen.

---

## 1. Zusammenfassung der Kernprobleme

| Problem | Symptom | Root Cause |
|---------|---------|-----------|
| Text-Overflow | Texte laufen aus Boxen, ueberlagern sich | Kein `fit`, kein `margin`, keine Textlaengen-Constraints |
| Inherited Shapes | Template-Platzhalter nicht modifizierbar | `modifyElement` findet inherited Layout-Shapes nicht |
| Fehlende Formatierung | Keine Absatzabstaende, kein Padding, keine Schatten | PptxGenJS-Optionen nicht genutzt |
| Platzhaltertext bleibt | Lorem Ipsum nicht entfernt | Auto-Clear greift nicht auf inherited Shapes |
| Keine visuelle Qualitaet | Kein "Wow"-Faktor, generisch | Kein Design-System, keine Shadows, kein Spacing |

---

## 2. PptxGenJS: Ungenutzte Features (Adhoc-Modus + generate()-Bridge)

### 2.1 KRITISCH -- Text-Fitting (loest Overflow-Problem)

| Feature | API | Unser Code | Impact |
|---------|-----|-----------|--------|
| **Auto-Shrink** | `fit: 'shrink'` | Nicht genutzt | Setzt OOXML `<a:normAutofit/>` -- PowerPoint schrumpft Text automatisch beim Oeffnen |
| **Auto-Resize** | `fit: 'resize'` | Nicht genutzt | Textbox waechst mit Inhalt mit |
| **Margin/Padding** | `margin: [T,R,B,L]` oder `margin: N` | Nicht genutzt | Innenabstand verhindert dass Text an Raendern klebt |
| **Line Spacing** | `lineSpacing: N` (Punkt) | Nicht genutzt | Kontrollierter Zeilenabstand statt Default |
| **Line Spacing Multiple** | `lineSpacingMultiple: 1.2` | Nicht genutzt | Proportionaler Zeilenabstand |
| **Para Space Before/After** | `paraSpaceBefore: N`, `paraSpaceAfter: N` | Nicht genutzt | Absatzabstaende fuer Lesbarkeit |
| **Char Spacing** | `charSpacing: N` | Nicht genutzt | Zeichenabstand (enger = mehr Text) |
| **Valign Top** | `valign: 'top'` | Nur `'middle'` genutzt | Body-Text sollte top-aligned sein, nicht middle |

**Bewertung `fit: 'shrink'`:** Setzt das `<a:normAutofit/>` Flag im OOXML. PowerPoint berechnet die Schriftgroessen-Reduktion beim Oeffnen der Datei. Das bedeutet: In der generierten Datei ist der Text noch in Originalgroesse, aber PowerPoint passt ihn automatisch an. Fuer unseren Use Case ist das akzeptabel -- der User oeffnet die Datei immer in PowerPoint.

### 2.2 HOCH -- Visuelle Qualitaet

| Feature | API | Unser Code | Impact |
|---------|-----|-----------|--------|
| **Shadow auf Shapes** | `shadow: {type, color, blur, offset, angle, opacity}` | Nicht genutzt | Tiefe und Professionalitaet |
| **Shadow auf Text** | `shadow: {...}` in TextProps | Nicht genutzt | Titel-Hervorhebung |
| **Glow-Effekt** | `glow: {color, opacity, size}` | Nicht genutzt | Akzent-Hervorhebung |
| **Rect Radius** | `rectRadius: 0.05` | Nur in Shapes, nicht fuer Textboxen | Abgerundete Ecken fuer moderne Optik |
| **Line/Border Styling** | `line: {color, width, dashType}` mit 8 dashTypes | Nur `solid` genutzt | Visuelle Vielfalt |
| **Transparency** | `transparency: 0-100` | Nicht genutzt | Layered Designs, Overlay-Effekte |
| **Image Sizing** | `sizing: {type: 'contain'|'cover'|'crop'}` | Nicht genutzt | Professionelle Bilddarstellung |
| **Image Rounding** | `rounding: true` | Nicht genutzt | Runde Profilbilder |

### 2.3 MITTEL -- Struktur und Layout

| Feature | API | Unser Code | Impact |
|---------|-----|-----------|--------|
| **Master Slides** | `pptx.defineSlideMaster({...})` | Nicht genutzt | Konsistente Layouts mit Placeholdern |
| **Sections** | `pptx.addSection({title})` | Nicht genutzt | Kapitel-Navigation in PowerPoint |
| **Slide Numbers** | `slide.slideNumber = {...}` | Nicht genutzt | Professionelle Seitennummern |
| **Table Auto-Page** | `autoPage: true` | Explizit `false` gesetzt | Grosse Tabellen ueber mehrere Slides |
| **Table colW/rowH** | `colW: [...]`, `rowH: [...]` | Nicht genutzt | Kontrollierte Spaltenbreiten |
| **Table Cell Merge** | `colspan`, `rowspan` | Nicht genutzt | Komplexe Tabellen-Layouts |
| **Rich Text in Tables** | `text: [{text, options}]` | Nicht genutzt | Formatierter Text in Zellen |
| **Object Names** | `objectName: 'MyElement'` | Nicht genutzt | Auffindbarkeit im Selection Pane |
| **Metadata** | `pptx.title`, `pptx.author`, etc. | Nicht genutzt | Professionelle Datei-Properties |

### 2.4 NIEDRIG -- Spezial-Features

| Feature | API | Impact |
|---------|-----|--------|
| **Custom Geometry** | `points: [...]` mit arc, cubic, quadratic | Eigene Formen |
| **Combo Charts** | Multi-Type Charts (Bar + Line) | Dual-Axis Visualisierungen |
| **3D Charts** | `bar3D`, `v3DPerspective`, etc. | Perspektivische Diagramme |
| **Data Tables** | `showDataTable: true` | Werte-Tabelle unter Charts |
| **Video/Audio** | `slide.addMedia({type: 'video'})` | Multimedia-Inhalte |
| **Compression** | `compression: true` | 30% kleinere Dateien |
| **Hyperlinks in Shapes** | `hyperlink: {url, slide, tooltip}` | Navigierbare Praesentationen |
| **Highlight** | `highlight: 'FFFF00'` | Text-Hervorhebung |

---

## 3. pptx-automizer: Ungenutzte Features (Template-Modus)

### 3.1 KRITISCH -- Loesung fuer Inherited-Shape-Problem

| Feature | API | Unser Code | Impact |
|---------|-----|-----------|--------|
| **Slide Layout Merge** | `slide.mergeIntoSlideLayout(targetLayout)` | Nicht genutzt | Koennte inherited Shapes in physische Shapes konvertieren |
| **Raw XML Modify** | `slide.modify(async (doc) => {...})` | Nicht genutzt | Direkter Zugriff auf Slide-XML als Fallback |
| **Prepare Callback** | `slide.prepare(callback)` | Nicht genutzt | VOR Shape-Modifikationen ausfuehren |
| **Set Attribute** | `modify.setAttribute(tag, attr, value)` | Nicht genutzt | Beliebiges XML-Attribut setzen (z.B. autoFit-Flag direkt im OOXML) |

### 3.2 HOCH -- Bessere Template-Manipulation

| Feature | API | Unser Code | Impact |
|---------|-----|-----------|--------|
| **Relative Position** | `modify.updatePosition({x: +500})` | Nicht genutzt | Delta-Verschiebung statt absolute Position |
| **Rounded Corners** | `modify.roundedCorners(degree)` | Nicht genutzt | Eckenradius auf Template-Shapes |
| **Solid Fill** | `ModifyColorHelper.solidFill(color)` | Nicht genutzt | Hintergrundfarbe von Shapes aendern |
| **Remove Border** | `ModifyCleanupHelper.removeBorder()` | Nicht genutzt | Raender von Template-Shapes entfernen |
| **Remove Effects** | `ModifyCleanupHelper.removeEffects()` | Nicht genutzt | Effekte von Template-Shapes entfernen |
| **Remove Background** | `ModifyCleanupHelper.removeBackground()` | Nicht genutzt | Hintergrund entfernen |
| **Image Cover** | `ModifyImageHelper.setRelationTargetCover()` | Nicht genutzt | Auto-Cropping basierend auf Container-Ratio |
| **Bullet List** | `modify.setBulletList(list)` | Nicht genutzt | Verschachtelte Bullet-Listen nativ |

### 3.3 MITTEL -- Erweiterte Kontrolle

| Feature | API | Unser Code | Impact |
|---------|-----|-----------|--------|
| **Master Import** | `automizer.addMaster(name, slideNum, callback)` | Nicht genutzt | SlideMaster mit allen Layouts importieren |
| **Master Modify** | `master.modifyElement()`, `master.removeElement()` | Nicht genutzt | Master-Shapes direkt aendern |
| **Slide Sort** | `ModifyPresentationHelper.sortSlides(order)` | Nicht genutzt | Slide-Reihenfolge aendern |
| **Slide Remove** | `ModifyPresentationHelper.removeSlides(numbers)` | Nicht genutzt | Slides aus Output entfernen |
| **Creation IDs** | `automizer.setCreationIds()` | Nicht genutzt | Shapes per creationId statt Name adressieren |
| **Integrity Check** | `assertRelatedContents: true` | Genutzt | Fehlende Relations auto-fixen |

---

## 4. Die generate()-Bridge: Schluessel zum Hybrid-Ansatz

### Was wir aktuell tun

```typescript
// TemplateEngine.ts -- generate() wird NUR fuer explizite GenerateElement genutzt
if (slideInput.generate) {
    slide.generate(async (pSlide) => {
        for (const el of slideInput.generate) {
            // Nur: addText, addShape, addChart, addTable, addImage
            // OHNE: fit, margin, shadow, lineSpacing, etc.
        }
    });
}
```

### Was moeglich waere (Hybrid-Ansatz)

```typescript
slide.generate(async (pSlide, pptxGenJS) => {
    // VOLLE PptxGenJS-API auf geklonter Template-Slide:
    pSlide.addText('Titel', {
        x: titlePos.x, y: titlePos.y, w: titlePos.w, h: titlePos.h,
        fontSize: 28,
        fontFace: 'EnBW Sans Headline',
        color: 'FFFFFF',
        bold: true,
        fit: 'shrink',           // Auto-Shrink!
        margin: [8, 12, 8, 12],  // Padding!
        valign: 'middle',
        shadow: { type: 'outer', blur: 4, offset: 2, angle: 315, opacity: 0.2, color: '000000' },
    });

    pSlide.addText([
        { text: 'Kernaussage: ', options: { bold: true, fontSize: 16 } },
        { text: 'Der POC funktioniert.', options: { fontSize: 16, color: '10B981' } },
    ], {
        x: bodyPos.x, y: bodyPos.y, w: bodyPos.w, h: bodyPos.h,
        fit: 'shrink',
        margin: [10, 15, 10, 15],
        lineSpacing: 22,
        paraSpaceAfter: 8,
        valign: 'top',
    });
});
```

### Callback-Pattern auf generate()

pptx-automizer bietet ein einzigartiges Feature: `addText` in der Bridge akzeptiert
einen dritten Parameter `callbacks` -- damit kann man pptx-automizer-Modifier
auf generierte Elemente anwenden:

```typescript
pSlide.addText('Text', options, [
    ModifyShapeHelper.setPosition({ x: 100000, y: 200000 }),
    ModifyColorHelper.solidFill({ type: 'srgbClr', value: 'FF0000' }),
]);
```

---

## 5. Optimierungspotenzial: Priorisierte Empfehlungen

### Phase 1: Quick Wins (sofort, max 2h)

**1.1 AdhocSlideBuilder: Text-Fitting aktivieren**
```diff
- slide.addText(text, { x, y, w, h, fontSize, color, wrap: true });
+ slide.addText(text, { x, y, w, h, fontSize, color, wrap: true,
+   fit: 'shrink',
+   margin: [8, 10, 8, 10],
+   valign: 'top',
+   lineSpacing: 20,
+ });
```

**1.2 AdhocSlideBuilder: Shadow auf Shapes**
```diff
- slide.addShape('roundRect', { x, y, w, h, fill: { color }, rectRadius });
+ slide.addShape('roundRect', { x, y, w, h, fill: { color }, rectRadius,
+   shadow: { type: 'outer', blur: 6, offset: 2, angle: 315, opacity: 0.15, color: '000000' },
+   line: { color: borderColor, width: 0.5 },
+ });
```

**1.3 Metadata setzen**
```diff
+ pptx.title = outputPath;
+ pptx.author = 'Obsilo Agent';
+ pptx.company = '';
```

### Phase 2: Hybrid-Ansatz (Template-Modus fix, ~4-6h)

**2.1 Content-Shapes entfernen + via generate() neu erzeugen**

Statt `modifyElement` (das auf inherited Shapes scheitert):
1. `removeElement` fuer alle Content-Shapes (Titel, Body)
2. `slide.generate()` mit PptxGenJS `addText()` an den Catalog-Positionen
3. Volle PptxGenJS-Optionen: `fit: 'shrink'`, `margin`, `lineSpacing`, `shadow`

```typescript
// Neuer Ablauf pro Slide in TemplateEngine
for (const [shapeName, content] of Object.entries(slideInput.content)) {
    const shapeMeta = catalog.shapes.find(s => s.name === shapeName);

    // 1. Versuche modifyElement (funktioniert bei physischen Shapes)
    try {
        slide.modifyElement(shapeName, modify.setText(content));
    } catch {
        // 2. Fallback: removeElement + generate
        try { slide.removeElement(shapeName); } catch { /* inherited, kann nicht entfernt werden */ }

        slide.generate(async (pSlide) => {
            pSlide.addText(content, {
                x: shapeMeta.position.x / 914400,  // EMU to inches
                y: shapeMeta.position.y / 914400,
                w: shapeMeta.position.w / 914400,
                h: shapeMeta.position.h / 914400,
                fit: 'shrink',
                margin: [8, 10, 8, 10],
                fontSize: shapeMeta.role === 'title' ? 28 : 14,
                fontFace: shapeMeta.role === 'title' ? 'EnBW Sans Headline' : 'EnBW Sans Text Light',
                valign: shapeMeta.role === 'title' ? 'middle' : 'top',
                bold: shapeMeta.role === 'title',
            });
        });
    }
}
```

**2.2 Catalog um Font-Informationen erweitern**

Der Ingest muss Font-Name, Font-Size und Font-Color aus dem Template extrahieren,
damit generate() die gleichen Fonts verwenden kann.

### Phase 3: Design-System (Adhoc-Modus Qualitaet, ~4h)

**3.1 Theme-Tokens definieren**

```typescript
const ADHOC_THEMES = {
    executive: {
        colors: { primary: '1F2937', accent: '3B82F6', text: 'FFFFFF', bg: '111827', border: '374151' },
        fonts: { heading: 'Calibri Light', body: 'Calibri' },
        sizes: { title: 32, subtitle: 20, heading: 18, body: 14, caption: 10 },
        spacing: { lineSpacing: 22, paraSpaceAfter: 6, margin: [10, 12, 10, 12] },
        effects: { shadow: { type: 'outer', blur: 6, offset: 2, opacity: 0.15 }, rectRadius: 0.05 },
    },
    modern: { ... },
    minimal: { ... },
};
```

**3.2 Master-Slides fuer Adhoc-Modus**

```typescript
pptx.defineSlideMaster({
    title: 'CONTENT',
    background: { color: theme.colors.bg },
    slideNumber: { x: '90%', y: '95%', fontSize: 10, color: theme.colors.text },
    objects: [
        { rect: { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: theme.colors.accent } } },
        { text: { text: 'Confidential', options: { x: 0.5, y: '95%', fontSize: 8, color: theme.colors.border } } },
    ],
});
```

### Phase 4: Template-Katalog Enrichment (~2h)

**4.1 Font-Extraction bei Ingest**

```typescript
// Im IngestTemplateTool bei Shape-Discovery
shape.fontInfo = {
    fontFace: extractedFont,    // aus dem OOXML <a:rPr> Element
    fontSize: extractedSize,     // in Punkt
    fontColor: extractedColor,   // Hex
    isBold: extractedBold,
    alignment: extractedAlign,   // 'l' | 'ctr' | 'r'
};
```

**4.2 Template Theme-Farben extrahieren**

```typescript
// theme.xml aus dem PPTX auslesen
catalog.theme = {
    colors: {
        dk1: '000099',    // Tiefenblau (aus EnBW theme.xml)
        lt1: 'FFFFFF',
        dk2: '44546A',
        lt2: 'E4DAD4',    // Warmgrau
        accent1: '000099',
        accent2: 'E4DAD4',
        accent3: '84C041',
        accent4: 'F5A623',
    },
    fonts: {
        major: 'EnBW Sans Headline',
        minor: 'EnBW Sans Text Light',
    },
};
```

---

## 6. Was NICHT funktioniert (bekannte Limitierungen)

| Feature | Limitierung | Workaround |
|---------|------------|-----------|
| `fit: 'shrink'` zur Generierungszeit | PptxGenJS setzt nur das OOXML-Flag, berechnet nicht selbst | Akzeptabel -- PowerPoint wendet es beim Oeffnen an |
| Gradient Fills in PptxGenJS | Nur `solid` und `none` unterstuetzt | Nicht kritisch fuer Business-Praesentationen |
| SmartArt | Weder PptxGenJS noch pptx-automizer | Shapes + Text manuell nachbauen |
| Animationen | Nicht unterstuetzt | Keine Loesung -- statische Praesentationen |
| SVG-Gradienten | Rendering-Probleme | SVG zu PNG konvertieren |
| pptx-automizer `modifyElement` auf inherited Shapes | Shapes aus SlideLayout nicht direkt modifizierbar | Hybrid: removeElement + generate() |

---

## 7. Erwartetes Ergebnis nach Optimierung

### Vorher (aktueller Stand)

- Text laeuft aus Boxen (kein fit, kein margin)
- Kein Padding -- Text klebt an Raendern
- Keine Schatten -- flaches, unprofessionelles Design
- Keine Absatzabstaende -- Text ist ein Block
- Template-Platzhalter bleiben stehen (inherited Shapes)
- Keine Seitennummern, keine Metadata

### Nachher (nach Phase 1-4)

- Text passt automatisch in Boxen (`fit: 'shrink'` + Margin)
- Professionelles Spacing (lineSpacing, paraSpace)
- Schatten und abgerundete Ecken fuer moderne Optik
- Template-Shapes werden zuverlaessig ersetzt (Hybrid-Ansatz)
- Konsistentes Design-System mit Theme-Tokens
- Seitennummern, Metadata, Sections

---

## 8. Implementierungsreihenfolge

```
Phase 1 (Quick Wins, ~2h)
  ├── AdhocSlideBuilder: fit + margin + lineSpacing + shadow
  ├── AdhocSlideBuilder: valign: 'top' fuer Body-Text
  ├── Metadata setzen (title, author)
  └── Compression aktivieren

Phase 2 (Hybrid Template Fix, ~4-6h)
  ├── TemplateEngine: removeElement + generate() Fallback
  ├── Catalog: Font-Informationen extrahieren bei Ingest
  ├── generate(): fit: 'shrink' + margin + theme-fonts
  └── Test mit EnBW-Vorlage

Phase 3 (Design-System, ~4h)
  ├── Theme-Tokens fuer alle 3 Adhoc-Themes
  ├── Master-Slides mit Placeholdern
  ├── Sections fuer Kapitel-Navigation
  └── Slide Numbers

Phase 4 (Catalog Enrichment, ~2h)
  ├── Font-Extraction bei Ingest
  ├── Theme-Farben aus theme.xml
  └── generate() nutzt extrahierte Fonts + Farben
```
