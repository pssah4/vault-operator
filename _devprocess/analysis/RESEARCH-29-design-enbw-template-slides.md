# EnBW PPTX Template -- Vollstaendige Slide-Analyse

> Quelle: `/Users/sebastianhanke/Obsidian/NexusOS/Tools & Settings/Vorlagen/EnBW_Vorlage.pptx`
> Stand: 2026-03-12
> 108 Slides, 22 Layouts

---

## Uebersicht: Layout-Zuordnung

| Layout | Layout-Name (abgeleitet) | Slides | Anzahl |
|--------|-------------------------|--------|--------|
| slideLayout1 | Titel ohne Bild (weiss) | 1, 23 | 2 |
| slideLayout2 | Titel ohne Bild (dunkel) | 2 | 1 |
| slideLayout3 | Titel mit Bild (weiss) | 3 | 1 |
| slideLayout4 | Titel mit Bild (dunkel) | 4 | 1 |
| slideLayout5 | Inhalt/Agenda (2 Content-PH) | 7, 26 | 2 |
| slideLayout6 | Inhalt/Agenda (dunkel, 2 Content-PH) | 8 | 1 |
| slideLayout7 | Kapitel-Trenner (weiss) | 5, 27, 40, 59, 62, 80, 84 | 7 |
| slideLayout8 | Kapitel-Trenner (dunkel) | 6 | 1 |
| slideLayout9 | Content 1-Spalte | 9 | 1 |
| slideLayout10 | Content 2-Spalten | 10, 24, 39 | 3 |
| slideLayout11 | Content + Bild links | 11 | 1 |
| slideLayout12 | Content + Bild links (dunkel) | 12 | 1 |
| slideLayout13 | 3 Bilder + 4 Textbloecke | 13 | 1 |
| slideLayout14 | 1 Bild + 2 Textbloecke | 14 | 1 |
| slideLayout15 | 1 Bild + 2 Textbloecke (Variante) | 15 | 1 |
| slideLayout16 | Universell/Leer (Titel+Fusszeile) | 16, 25, 28-33, 41-58, 60-61, 63-79, 81-83, 85-108 | 68 |
| slideLayout17 | Leer (nur Fusszeile, kein Titel) | 17, 37, 38 | 3 |
| slideLayout18 | Zitat | 18, 34, 35, 36 | 4 |
| slideLayout19 | Vollbild + Content (weiss) | 19 | 1 |
| slideLayout20 | Vollbild + Content (dunkel) | 20 | 1 |
| slideLayout21 | Abschluss/Kontakt (weiss) | 21 | 1 |
| slideLayout22 | Abschluss/Kontakt (dunkel) | 22 | 1 |

---

## Slide-Typen nach Klassifikation

### Typ 1: TITEL-SLIDES (Slides 1-4, 23)

**Slide 1** -- Layout 1 -- Titel ohne Bild (weiss)
- PH: ctrTitle, subTitle(idx=1)
- Shapes: Titel 8, Untertitel 2
- Text: "Titel zwei- bis dreizeilig ohne Bild", "Subline | Referent", "Datum, Ort"
- Geom: keine

**Slide 2** -- Layout 2 -- Titel ohne Bild (dunkel)
- PH: ctrTitle, subTitle(idx=1)
- Shapes: Titel 4, Untertitel 6
- Text: identisch zu Slide 1
- Geom: keine

**Slide 3** -- Layout 3 -- Titel mit Bild (weiss)
- PH: pic(idx=13), ctrTitle, subTitle(idx=1), dgm(idx=14)
- Shapes: Bildplatzhalter 54, Titel 15, Untertitel 10, SmartArt-Platzhalter 1
- Text: "Titel zwei- bis dreizeilig mit Bild", "Subline | Referent", "Datum, Ort"
- Geom: keine

**Slide 4** -- Layout 4 -- Titel mit Bild (dunkel)
- PH: pic(idx=13), ctrTitle, subTitle(idx=1), dgm(idx=14)
- Shapes: Bildplatzhalter 18, Titel 5, Untertitel 9, SmartArt-Platzhalter 1
- Text: identisch zu Slide 3
- Geom: keine

**Slide 23** -- Layout 1 -- Folienbibliothek-Titel
- PH: ctrTitle, subTitle(idx=1)
- Text: "EnBW Folienbibliothek", "Stand November 2025"

### Typ 2: KAPITEL-TRENNER (Slides 5, 6, 27, 40, 59, 62, 80, 84)

**Slides 5, 27, 40, 59, 62, 80, 84** -- Layout 7 (weiss)
- PH: title, body(idx=10)
- Shapes: Titel, Textplatzhalter
- Text: Kapitelname + Nummer (z.B. "Beispielfolien 1", "Diagramme 2", "Tabellen 3", "Prozesse und Projektplaene 3", "Organigramme 4", "Formen und Textboxen 5")

**Slide 6** -- Layout 8 (dunkel)
- PH: title, body(idx=10)
- Text: "Platzhalter Kapitelname 1"

### Typ 3: INHALTSVERZEICHNIS/AGENDA (Slides 7, 8, 26)

**Slide 7** -- Layout 5 (weiss)
- PH: title, idx=1, idx=10
- Shapes: Titel 6, Inhaltsplatzhalter 4, Inhaltsplatzhalter 5
- Text: "Inhalt", 14x "Platzhalter Kapitelname"

**Slide 8** -- Layout 6 (dunkel)
- Identisch zu Slide 7

**Slide 26** -- Layout 5
- PH: title, idx=1
- Text: "Agenda", "Beispielfolien", "Diagramme", "Tabellen", "Prozesse und Projektplaene", "Organigramme", "Formen und Textboxen"

### Typ 4: CONTENT 1-SPALTE (Slide 9)

**Slide 9** -- Layout 9
- PH: title, half(idx=1), ftr(idx=11), sldNum(idx=12)
- Shapes: Titel 10, Inhaltsplatzhalter 3, Fusszeilenplatzhalter, Foliennummernplatzhalter
- Text: Lorem ipsum Fliesstext

### Typ 5: CONTENT 2-SPALTEN (Slides 10, 24, 39)

**Slide 10** -- Layout 10
- PH: title, half(idx=1), half(idx=2), ftr(idx=11), sldNum(idx=12)
- Text: Lorem ipsum in 2 Spalten

**Slide 24** -- Layout 10 -- Allgemeine Vorgaben
- Zusaetzliche Shapes: Gruppieren, Rechteck, Grafik, Gerader Verbinder, Freeform, roundRect, Textfeld
- Text: Typografie-Spezifikationen (Schriftgroessen, Bulletfarben, Linienstaerken)
- Geom: rect, line, roundRect, custGeom

**Slide 39** -- Layout 10 -- Wordcloud
- Zusaetzliche Shapes: diverse Rechtecke, Grafiken, "object 14"
- Text: "Wordcloud", Lorem ipsum

### Typ 6: CONTENT + BILD (Slides 11, 12, 13, 14, 15)

**Slide 11** -- Layout 11 -- Text links, Bild rechts (weiss)
- PH: title, half(idx=2), ftr, sldNum, pic(idx=13)
- Shapes: Titel, Inhaltsplatzhalter, Bildplatzhalter

**Slide 12** -- Layout 12 -- Text links, Bild rechts (dunkel)
- Identisches Layout wie Slide 11

**Slide 13** -- Layout 13 -- 3 Bilder + 4 Textbloecke
- PH: title, ftr, sldNum, 3x pic(idx=13,15,16), 4x body(idx=17,18,19,20), pic(idx=14)
- Shapes: 3 Bildplatzhalter + 4 Textplatzhalter

**Slide 14** -- Layout 14 -- 1 Grosses Bild + 2 Texte
- PH: title, ftr, sldNum, pic(idx=14), 2x body(idx=17,18), pic(idx=13)

**Slide 15** -- Layout 15 -- Variante von Slide 14
- Identische Struktur

### Typ 7: LEER/BLANK (Slide 16, 17)

**Slide 16** -- Layout 16
- PH: title, ftr, sldNum
- Nur Titel + Fusszeile, kein Content

**Slide 17** -- Layout 17
- PH: ftr, sldNum
- Kein Titel, nur Fusszeile

### Typ 8: ZITAT (Slides 18, 34, 35, 36)

**Slide 18** -- Layout 18
- PH: body(idx=10), ftr, sldNum
- Text: "Ich bin ein Zitat: Lorem ipsum..."

**Slide 34** -- Layout 18 -- Variante
- Identisch zu Slide 18

**Slide 35** -- Layout 18 -- mit Grafik-Element
- Zusaetzlich: Freihandform, Rechteck, Grafik
- 1 custGeom

**Slide 36** -- Layout 18 -- mit Bild
- Zusaetzlich: Bildplatzhalter (Person), Grafik

### Typ 9: VOLLBILD + CONTENT (Slides 19, 20)

**Slide 19** -- Layout 19 (weiss)
- PH: pic(idx=13), title, ftr, sldNum, half(idx=1)
- Text: "Lorem mit Bild", "Layout fuer vollflaechige Bilder"

**Slide 20** -- Layout 20 (dunkel)
- Identische Struktur

### Typ 10: ABSCHLUSS/KONTAKT (Slides 21, 22)

**Slide 21** -- Layout 21 (weiss)
- PH: body(idx=17), title, body(idx=19)
- Text: "Vielen Dank", "Name Nachname", "Title", "Niederlassung", "Strasse", "Telefon", "Email" (2 Kontaktspalten)

**Slide 22** -- Layout 22 (dunkel)
- Identisch zu Slide 21

### Typ 11: ICONS (Slide 25)

**Slide 25** -- Layout 16
- 22 Grafik-Shapes + Ellipse
- Text: "Icons", "NUR in Impuls-orange, Tiefenblau, Schwarz oder Weiss nutzen"
- Geom: 22x rect, 1x ellipse

### Typ 12: KPI / KENNZAHLEN (Slides 28, 29)

**Slide 28** -- Layout 16 -- KPI mit Segmenten
- Shapes: Gerader Verbinder, diverse "object" Shapes, roundRect
- Text: "0,8 Mrd. EUR", "Erzeugung & Handel", "Erneuerbare Energien", "Netze", "Vertriebe"
- Geom: line, rect, roundRect, custGeom

**Slide 29** -- Layout 16 -- Vergleich/Waterfall
- Text: "3,2 Mrd. EUR", "2,8 Mrd. EUR", "2020", "2025", Segmente
- Geom: line, rect, custGeom

### Typ 13: DIAGRAMM + TEXT (Slide 30)

**Slide 30** -- Layout 16 -- Diagramm, Texte und Stoerer
- Shapes: Textplatzhalter, Gerader Verbinder, Textfeld, Grafik, Diagramm, Ellipse
- Text: "Diagramm, Texte und Stoerer", "Kernaussage", "Ueberschrift"
- Geom: rect, line, ellipse

### Typ 14: SEGMENT-ANALYSE (Slide 31)

**Slide 31** -- Layout 16 -- Renewable Energies Segment
- Shapes: Textplatzhalter, 3 Diagramme, Tabelle, Textfeld, Verbinder mit Pfeil, Freeform
- Text: "Key messages", "Renewable Energies Segment"
- Geom: rect, straightConnector1, line, custGeom

### Typ 15: PROZESS MIT CHEVRONS (Slides 32, 33)

**Slide 32** -- Layout 16 -- Prozess aus der Mitte wachsend
- Shapes: chevron, homePlate, Eingekerbter Richtungspfeil, Rechteck, Grafik
- Text: "Textfolie mit Prozess aus der Mitte wachsend"
- Geom: chevron, homePlate, rect

**Slide 33** -- Layout 16 -- Variante mit Verbindern
- Zusaetzlich: Freeform, Gerader Verbinder, Gruppieren
- custGeom: 1

### Typ 16: STRATEGIE / GESCHAEFTSBEREICHE (Slides 37, 38)

**Slides 37, 38** -- Layout 17 -- Kein Titel
- Shapes: 9 Rechtecke, 2-3 Grafiken
- Text: "Nachhaltigkeit", "Kund*innen", "Erzeugungs-infrastruktur", "Systemkritische Infrastruktur", "Vertrieb", "Erneuerbare Energien", "Intelligente Infrastruktur", "Netze"
- Geom: 11-12x rect

### Typ 17: SAEULENDIAGRAMM (Slides 41, 42, 43)

**Slide 41** -- Layout 16 -- Saeulendiagramm einfach
- Shapes: Diagramm 8, Textplatzhalter
- Text: "Saeulendiagramm", "Ueberschrift | Lorem ipsum"

**Slide 42** -- Layout 16 -- mit Fazit-Box
- Zusaetzlich: Gruppieren, Rechteck, Grafik (Fazit-Callout)
- Text: "Fazit: 16pt Lorem ipsum"

**Slide 43** -- Layout 16 -- mit Kommentar
- Shapes: Textplatzhalter "Kommentare", Gerader Verbinder, Diagramm
- Geom: rect, line

### Typ 18: UEBERLAGERUNGSDIAGRAMM (Slides 44, 45)

**Slide 44** -- Layout 16
- Shapes: Textplatzhalter (Ueberschrift + Achsenbeschriftungen), Diagrammplatzhalter
- Text: "Ueberlagerungsdiagramm"

**Slide 45** -- Layout 16 -- mit Kommentar
- Zusaetzlich: Textplatzhalter "Kommentare", Gerader Verbinder

### Typ 19: WASSERFALL-DIAGRAMM (Slides 46-50)

**Slide 46** -- Layout 16 -- steigend, einfach
**Slide 47** -- Layout 16 -- steigend, mit Fazit
**Slide 48** -- Layout 16 -- steigend, mit Kommentar
**Slide 49** -- Layout 16 -- fallend, mit Fazit
**Slide 50** -- Layout 16 -- fallend, mit Kommentar

### Typ 20: BALKENDIAGRAMM (Slides 51, 52)

**Slide 51** -- Layout 16 -- einfach
**Slide 52** -- Layout 16 -- mit Kommentar

### Typ 21: LINIENDIAGRAMM (Slides 53, 54)

**Slide 53** -- Layout 16 -- einfach
**Slide 54** -- Layout 16 -- mit Kommentar

### Typ 22: BEWERTUNG / SCORING (Slides 55, 56)

**Slide 55** -- Layout 16 -- Bewertung mit Tabelle + Diagramm
- Shapes: Diagrammplatzhalter 13, Tabelle 38
- Text: "Bewertung"

**Slide 56** -- Layout 16 -- mit Kommentar

### Typ 23: KREISDIAGRAMME (Slides 57, 58)

**Slide 57** -- Layout 16 -- Zwei Kreisdiagramme
- Shapes: 2x Inhaltsplatzhalter 8, 4 Textplatzhalter, Gerader Verbinder
- Text: 2x "Ueberschrift | Lorem ipsum"

**Slide 58** -- Layout 16 -- mit Fazit

### Typ 24: TABELLE (Slides 60, 61)

**Slide 60** -- Layout 16 -- Standard-Tabelle
- Shapes: Content Placeholder 7
- Text: 6x "Ueberschrift", Beschreibungen, "Lorem ipsum"

**Slide 61** -- Layout 16 -- Kostentabelle
- Text: "Erster Kostenpunkt", "Zweiter Kostenpunkt", "00,000 EUR", "Total", "000,000 EUR"

### Typ 25: PROZESS -- 5 SCHRITTE (Slides 63, 64, 65, 74)

**Slide 63** -- Layout 16 -- Chevron-Prozess
- Shapes: Pfeil: Fuenfeck 18, 4x Pfeil: Chevron, 4x Gerader Verbinder, 5x Textplatzhalter
- Text: 5x "Text" (Schrittlabel), Lorem ipsum
- Geom: homePlate, 4x chevron, 4x line, 5x rect

**Slide 64** -- Layout 16 -- mit Icons
- Zusaetzlich: 5x Grafik (Icons), Gruppieren

**Slide 65** -- Layout 16 -- mit Highlight-Rechtecken
- Zusaetzlich: 5x Rechteck (farbige Bloecke)

**Slide 74** -- Layout 16 -- Variante mit Freeform-Pfeilen
- Shapes: 5x Textplatzhalter, 4x Freeform, 5x Rechteck, Grafiken
- custGeom: 1

### Typ 26: PROZESS MIT ZIELEN (Slides 66, 67)

**Slide 66** -- Layout 16
- Shapes: Freihandform-Shapes (geschwungene Pfeile), Textplatzhalter, Grafiken
- Text: "Prozess mit (Zwischen)-Zielen"
- custGeom: 1

**Slide 67** -- Layout 16 -- Variante mit Freeform-Gruppen
- 4 Freeform-Gruppierungen, Rechtecke, Verbinder

### Typ 27: ABLAUF MIT OPTIONEN (Slides 68, 69)

**Slide 68** -- Layout 16
- Shapes: 9 Rechtecke, Pfeile (straightConnector1), Freihandform
- Text: "Ablauf mit verschiedenen Optionen", 9x "Text"
- custGeom: 1

**Slide 69** -- Layout 16 -- Komplexer Flowchart
- Shapes: 6 Rechtecke, 8 Ellipsen, bentConnector3, straightConnector1, Grafiken
- Geom: rect, ellipse, straightConnector1, bentConnector3, line

### Typ 28: ABLAUF -- 6 SCHRITTE (Slides 70, 71)

**Slide 70** -- Layout 16
- Shapes: 6 Ellipsen, 6 Textplatzhalter, 7 Gerader Verbinder
- Text: "Ablauf -- Sechs Schritte", 6x Ueberschrift+Text
- Geom: line, rect, ellipse

**Slide 71** -- Layout 16 -- Variante mit zusaetzlichen Verbindern

### Typ 29: KREISLAUF (Slides 72, 73)

**Slide 72** -- Layout 16
- Shapes: 4 Bogen (arc), Ellipse (Zentrum), 4 Textplatzhalter, 4 Gerader Verbinder
- Text: "Zusammenhang / Kreislauf"
- Geom: arc, ellipse, rect, line

**Slide 73** -- Layout 16 -- mit Freihandform-Pfeilen
- Zusaetzlich: 4 Freihandform, 4 Rechteck (Labels)
- custGeom: 1

### Typ 30: KREISLAUFPROZESSE (Slide 75)

**Slide 75** -- Layout 16
- Shapes: 4 Ellipsen, 8+ Rechtecke, Freeform/Freihandform-Pfeile
- Text: "Kreislaufprozesse", "1", "2", "3", "4", "MM", "FS", "PS", "GK"
- custGeom: 1

### Typ 31: PROJEKTPLAN (Slides 76, 77, 78, 79)

**Slide 76** -- Layout 16 -- Wochen-Projektplan
- Shapes: Table 85, TextBox, 5x Pentagon (homePlate), Textplatzhalter, Grafiken
- Text: Wochen 1-12, "Lorem Ipsum" Tasks, "Xxx" Labels

**Slide 77** -- Layout 16 -- Halbjahres-Projektplan (Tabelle)
- Shapes: Tabelle 6
- Text: Monate (Januar-Juni), Wochen 01-18, "Aktivitaeten"

**Slide 78** -- Layout 16 -- Jahresplan (12 Monate)
- Shapes: Tabelle 6
- Text: "20xx", Monate 1-12, "Aktivitaet 1-4"

**Slide 79** -- Layout 16 -- 18-Monats-Plan
- Text: "20xx" (2x), Monate 1-12 + 1-6

### Typ 32: ORGANIGRAMM (Slides 81, 82, 83)

**Slide 81** -- Layout 16 -- Vollstaendiges Organigramm
- Shapes: 13 Rechtecke, bentConnector2/3, Gruppieren
- Text: 11x "Position"/"Name"-Paare
- Geom: bentConnector3, rect, bentConnector2

**Slide 82** -- Layout 16 -- Identische Struktur (dunkle Variante?)

**Slide 83** -- Layout 16 -- Organigramm mit Textblock
- 3 Rechtecke + bentConnector3 + Textplatzhalter + Gerader Verbinder
- Text: 3x "Position"/"Name", "Ueberschrift" + Lorem ipsum

### Typ 33: FAKTOREN -- ZWEI (Slides 85, 86)

**Slide 85** -- Layout 16
- Shapes: 3 Textplatzhalter, 2 Gruppierungen (Freeform), Gruppieren+Rechteck+Grafik
- Text: "Faktoren -- Zwei", 2x "Ueberschrift" + Lorem ipsum
- custGeom: 1

**Slide 86** -- Layout 16 -- mit Icons
- Zusaetzlich: 2 Grafiken (Icons)

### Typ 34: AKTION / REAKTION (Slides 87, 88)

**Slide 87** -- Layout 16
- Shapes: Gerader Verbinder, Gruppieren, 2 Freeform, 2 Textplatzhalter
- Text: "Aktion / Reaktion"
- custGeom: 1

**Slide 88** -- Layout 16 -- mit Icons

### Typ 35: BESTANDTEILE (Slides 89, 90)

**Slides 89, 90** -- Layout 16
- Shapes: Gruppieren mit 9 Freihandform-Shapes, Gerader Verbinder, Textplatzhalter, Rechteck
- Text: "Bestandteile (Auswahl)"
- custGeom: 1

### Typ 36: KONSEQUENZEN -- DREI (Slides 91, 92, 93)

**Slide 91** -- Layout 16 -- mit Freeform-Pfeilen
- Shapes: 3+3 Textplatzhalter, 3 Freeform, 5 Gerader Verbinder
- Text: "Konsequenzen -- Drei"
- custGeom: 1

**Slides 92, 93** -- Layout 16 -- mit Icons/Grafiken
- Zusaetzlich: 3 Grafiken, diverse Verbinder

### Typ 37: PYRAMIDE -- 5 BESTANDTEILE (Slides 94, 95, 96, 97, 98)

**Slide 94** -- Layout 16 -- Pyramide einfach
- Shapes: 5 Freihandform, 5 Rechtecke, 4 Verbinder, 5+5 Textplatzhalter
- Text: "Pyramide -- fuenf Bestandteile"
- custGeom: 1

**Slide 95** -- Layout 16 -- mit Label-Rechtecken

**Slide 96** -- Layout 16 -- Variante mit Text-Labels

**Slide 97** -- Layout 16 -- mit Rechteck-Labels und Gruppierung

**Slide 98** -- Layout 16 -- mit Kommentar

### Typ 38: BESTANDTEILE -- DREI (Slides 99, 100, 101)

**Slide 99** -- Layout 16
- Shapes: Freihandform, 5 Textplatzhalter, 3 Gerader Verbinder
- Text: "Bestandteile -- Drei", "Kommentare"
- custGeom: 1

**Slide 100** -- Layout 16 -- mit Icons

**Slide 101** -- Layout 16 -- mit Icons und Textbloecken

### Typ 39: DRUCK VON VIER SEITEN (Slide 102)

**Slide 102** -- Layout 16
- Shapes: Rechteck (Zentrum), 4 Textplatzhalter, 4 Freeform, 3 Gerader Verbinder
- Text: "Druck von vier Seiten", 4x "Ueberschrift" + Lorem ipsum
- custGeom: 1

### Typ 40: ZENTRALISIERUNG (Slides 103, 104)

**Slide 103** -- Layout 16
- Shapes: 4+1 Textplatzhalter, 3+4 Gerader Verbinder, Freihandform, Freeform
- Text: "Zentralisierung", Lorem ipsum
- custGeom: 1

**Slide 104** -- Layout 16 -- mit Icons/Grafiken

### Typ 41: GLEICHGEWICHT (Slide 105)

**Slide 105** -- Layout 16
- Shapes: Gleichschenkliges Dreieck, Rechteck, 2 Ellipsen, Textplatzhalter, Verbinder, Bogen
- Text: "Gleichgewicht herstellen"
- Geom: triangle, rect, ellipse, line, arc

### Typ 42: SWOT-ANALYSE (Slides 106, 107)

**Slide 106** -- Layout 16
- Shapes: 4 Textplatzhalter, 2 Gerader Verbinder, Rechteck, Freihandform, 2 Grafiken
- Text: "SWOT-Analyse", "Staerken", Lorem ipsum
- custGeom: 1

**Slide 107** -- Layout 16 -- Variante
- Text: "Chancen"
- custGeom: 1

### Typ 43: ENDE-MARKER (Slide 108)

**Slide 108** -- Layout 16
- Shapes: 2 Pfeil: Chevron
- Text: nur Fusszeile
- Geom: 2x chevron

---

## Zusammenfassung: Nutzbare Slide-Typen fuer Template-Cloning

### Einfache Slides (nur Text-Austausch, keine komplexen Shapes)

| Slide | Typ | Editierbare Platzhalter | Schwierigkeit |
|-------|-----|------------------------|---------------|
| 1-4 | Titel | ctrTitle, subTitle | Einfach |
| 5-6 | Kapitel-Trenner | title, body | Einfach |
| 7-8 | Agenda | title, idx=1 (Bulletliste) | Einfach |
| 9 | Content 1-Spalte | title, half(idx=1) | Einfach |
| 10 | Content 2-Spalten | title, half(idx=1), half(idx=2) | Einfach |
| 11-12 | Content + Bild | title, half(idx=2) | Einfach |
| 18/34 | Zitat | body(idx=10) | Einfach |
| 19-20 | Vollbild + Content | title, half(idx=1) | Einfach |
| 21-22 | Kontakt/Abschluss | title, body(idx=17), body(idx=19) | Einfach |

### Mittlere Slides (Text + Diagramm/Tabelle)

| Slide | Typ | Editierbare Elemente | Schwierigkeit |
|-------|-----|---------------------|---------------|
| 41-43 | Saeulendiagramm | Titel, Ueberschrift, (Diagramm extern) | Mittel |
| 44-45 | Ueberlagerungsdiagramm | Titel, Ueberschrift, Achsen | Mittel |
| 46-50 | Wasserfall | Titel, Ueberschrift, Kommentar | Mittel |
| 51-52 | Balken | Titel, Ueberschrift, Kommentar | Mittel |
| 53-54 | Linie | Titel, Ueberschrift, Kommentar | Mittel |
| 55-56 | Bewertung | Titel, Ueberschrift, Tabelle | Mittel |
| 57-58 | Kreisdiagramme | Titel, 2 Ueberschriften | Mittel |
| 60-61 | Tabelle | Titel, Tabellenzellen | Mittel |

### Komplexe Slides (viele Custom Shapes, Freihandformen)

| Slide | Typ | Editierbare Elemente | Schwierigkeit |
|-------|-----|---------------------|---------------|
| 28-29 | KPI/Kennzahlen | Titel, Zahlenwerte, Segmentnamen | Komplex |
| 32-33 | Chevron-Prozess | Titel, Ueberschrift, Schrittlabels | Komplex |
| 37-38 | Geschaeftsbereiche | Bereichsnamen | Komplex |
| 63-65 | Prozess 5 Schritte | Titel, 5 Schrittlabels, 5 Textbloecke | Komplex |
| 66-67 | Prozess mit Zielen | Titel, Textbloecke | Komplex |
| 68-69 | Ablauf Optionen | Titel, Box-Labels | Komplex |
| 70-71 | Ablauf 6 Schritte | Titel, 6x Ueberschrift+Text | Komplex |
| 72-73 | Kreislauf | Titel, 4 Textbloecke | Komplex |
| 74-75 | Kreislaufprozess | Labels, Abkuerzungen | Komplex |
| 76-79 | Projektplan | Titel, Wochen/Monate, Tasks | Komplex |
| 81-83 | Organigramm | Position/Name-Paare | Komplex |
| 85-86 | Faktoren Zwei | Titel, 2 Textbloecke | Komplex |
| 87-88 | Aktion/Reaktion | Titel, 2 Textbloecke | Komplex |
| 89-90 | Bestandteile | Titel, 4 Textbloecke | Komplex |
| 91-93 | Konsequenzen Drei | Titel, 3 Topics | Komplex |
| 94-98 | Pyramide | Titel, 5 Stufen | Komplex |
| 99-101 | Bestandteile Drei | Titel, 3 Bloecke | Komplex |
| 102 | Druck 4 Seiten | Titel, 4 Textbloecke | Komplex |
| 103-104 | Zentralisierung | Titel, 4 Textbloecke | Komplex |
| 105 | Gleichgewicht | Titel, 2 Textbloecke | Komplex |
| 106-107 | SWOT | Titel, 4 Quadranten | Komplex |

---

## Placeholder-Index-Uebersicht

| idx | Typ | Bedeutung | Kommt vor in |
|-----|-----|-----------|-------------|
| -- | ctrTitle | Zentrierter Titel | Slides 1-4, 23 |
| 1 | subTitle / half / body | Untertitel oder linke Spalte | Fast alle Layouts |
| 2 | half | Rechte Spalte | Layout 10, 16 |
| 10 | body | Kapitelname / Zitat-Text | Layout 7, 8, 18 |
| 11 | ftr | Fusszeile | Ab Layout 9 |
| 12 | sldNum | Foliennummer | Ab Layout 9 |
| 13 | pic | Bild-Platzhalter | Layout 3, 4, 11-15, 19, 20 |
| 14 | pic / dgm | Zweites Bild oder SmartArt | Layout 3, 4, 14, 15 |
| 15 | pic | Drittes Bild | Layout 13 |
| 16 | pic | Viertes Bild | Layout 13 |
| 17 | body | Textblock 1 | Layout 13-15, 21, 22 |
| 18 | body | Textblock 2 | Layout 13-15 |
| 19 | body | Textblock 3 | Layout 13, 21, 22 |
| 20 | body | Textblock 4 | Layout 13 |

---

## Farb-Varianten Pattern

Die meisten Basis-Layouts existieren in 2 Varianten:
- **Weiss** (Layout mit ungerader Nummer): Slides 1, 3, 5, 7, 19, 21
- **Dunkel** (Layout mit gerader Nummer): Slides 2, 4, 6, 8, 20, 22

Ausnahme: Ab Layout 9 gibt es keine konsistenten Hell/Dunkel-Paare mehr.

---

## Empfehlung fuer SKILL.md Template-Katalog

Fuer die Template-Cloning Pipeline sind die folgenden Slide-Nummern als "Vorlage" am besten geeignet:

| Anwendungsfall | Empfohlene Vorlage-Slide | Alternativen |
|---------------|--------------------------|-------------|
| Titelfolie weiss | 1 | 23 |
| Titelfolie dunkel | 2 | -- |
| Titel mit Bild | 3, 4 | -- |
| Kapitel-Trenner | 5 | 6, 27, 40 |
| Agenda/Inhalt | 7 | 8, 26 |
| Content 1 Spalte | 9 | -- |
| Content 2 Spalten | 10 | -- |
| Content + Bild | 11 | 12 |
| 3 Bilder | 13 | -- |
| Zitat | 18 | 34, 35, 36 |
| Vollbild | 19 | 20 |
| Kontakt/Abschluss | 21 | 22 |
| Saeulendiagramm | 41 | 42 (Fazit), 43 (Kommentar) |
| Wasserfalldiagramm | 46 | 47, 48, 49, 50 |
| Balkendiagramm | 51 | 52 |
| Liniendiagramm | 53 | 54 |
| Kreisdiagramm | 57 | 58 |
| Tabelle | 60 | 61 |
| Prozess 5 Schritte | 63 | 64 (Icons), 65, 74 |
| Ablauf 6 Schritte | 70 | 71 |
| Kreislauf | 72 | 73 |
| Projektplan | 76 | 77, 78, 79 |
| Organigramm | 81 | 82, 83 |
| Pyramide | 94 | 95, 96, 97, 98 |
| SWOT | 106 | 107 |
