# Business Analysis: Office-Dokument-Qualitaet auf Professional-Level

> **Scope:** MVP
> **Erstellt:** 2026-03-08
> **Status:** Draft
> **Vorgaenger:** BA-05 (Office Document Creation Tools -- Basis-Implementierung)

---

## 1. Executive Summary

### 1.1 Problem Statement

Die drei Office-Tools (create_pptx, create_docx, create_xlsx) aus BA-05 funktionieren technisch zuverlaessig, liefern aber nur programmatisch generiertes Basis-Styling: eine Farbe, ein Font, identische Layouts. Das Ergebnis ist weit entfernt von dem, was Nutzer von professionellen Dokumenten erwarten. Benchmark-Analysen zeigen: der echte Qualitaetssprung kommt nicht von der Library, sondern von Design-System + Storyline-Intelligenz.

### 1.2 Proposed Solution

Ein Drei-Schichten-Modell:
- **Schicht 1 -- Design-System:** Professionelle Themes + User-Master-Deck-Extraktion bestimmen das visuelle Erscheinungsbild
- **Schicht 2 -- Storyline-Frameworks:** Kontextabhaengige Strukturierung (SCQA, Pyramid Principle, Narrative Arc etc.) bestimmen den inhaltlichen Aufbau
- **Schicht 3 -- Content-Generation:** Bestehende Tool-Logik (bleibt), nun gespeist durch Schicht 1 + 2

### 1.3 Expected Outcomes

- Praesentationen auf McKinsey/BCG-Niveau (clean, datengetrieben, Weissraum) statt generischer Bullet-Listen
- User kann Corporate-Design ueber Master-Deck-Upload 1:1 uebernehmen
- 3 eingebaute Default-Themes fuer sofortige professionelle Ergebnisse
- Agent waehlt kontextabhaengig das passende Storyline-Framework
- Memory-gesteuerte Design-Praeferenzen -- Agent lernt und fragt nicht unnoetig nach

---

## 2. Business Context

### 2.1 Background

BA-05 hat die technische Grundlage geschaffen: vier dedizierte Built-in Tools fuer Office-Formate, die zuverlaessig binaere Dateien erzeugen. Die Luecke "Lesen ja, Schreiben nein" ist geschlossen.

Allerdings zeigt die Nutzung: das Basis-Styling (eine Akzentfarbe, Calibri, identische Layouts fuer alle Slides) produziert Dokumente, die sofort als "von einem Programm generiert" erkennbar sind. Ein Benchmark mit Manus AI (ebenfalls schwach: repetitiv, text-lastig) und Claude (besser: template-basiert) bestaetigt: der Qualitaetssprung erfordert ein durchdachtes Design-System und Struktur-Intelligenz.

### 2.2 Current State ("As-Is")

- `create_pptx`: Erzeugt funktionale Praesentationen mit einem einzigen Layout (Title + Content), einer Farbe, einem Font
- `create_docx`: Erzeugt formatierte Word-Dokumente mit Standard-Styling
- `create_xlsx`: Erzeugt Tabellenkalkulationen mit Header-Styling
- Kein Design-System: Farben/Fonts hardcoded im Tool-Code
- Kein Storyline-Bewusstsein: Agent entscheidet ad-hoc ueber Folienstruktur
- Kein User-Master-Import: Corporate-Designs koennen nicht uebernommen werden
- Keine Design-Praeferenz-Speicherung

### 2.3 Desired State ("To-Be")

- **Design-System mit 3 Themes:** Professionelle Default-Designs, die out-of-the-box ueberzeugen
- **User-Master-Extraktion:** User laedt PPTX im Chat hoch, Design wird exakt extrahiert (Farben, Fonts, Hintergruende, Layouts, Logos)
- **Storyline-Intelligenz:** Agent waehlt kontextabhaengig das passende Framework (SCQA, Pyramid, Narrative Arc etc.)
- **Memory-gesteuerte Praeferenzen:** Agent merkt sich Design-Wahl, fragt nicht erneut, respektiert Overrides
- **Follow-up Questions:** Nach Erstellung bietet der Agent Optionen an (Farben anpassen, weitere Slides, als PDF exportieren, Design als Default speichern)

### 2.4 Gap Analysis

| Luecke | As-Is | To-Be |
|--------|-------|-------|
| Design-Vielfalt | 1 hardcoded Farbschema | 3 Themes + User-Master-Import |
| Slide-Layouts | 1 Layout (Title + Content) | 5+ Layouts (Title, Content, Two-Column, Section Divider, Closing) |
| Struktur-Intelligenz | Ad-hoc durch LLM | Storyline-Frameworks (SCQA, Pyramid, Narrative Arc etc.) |
| Font-Kombinationen | 1 Font (Calibri) | Heading + Body Font-Paarungen pro Theme |
| User-Praeferenzen | Keine | Memory-gesteuert, pro Vault persistent |
| Corporate-Design | Nicht moeglich | Master-Deck-Upload mit exakter Extraktion |
| Post-Creation UX | Keine Follow-ups | Tool-basierte Follow-up Questions |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Sebastian Hanke | Entwickler + Primaer-User | H | H | Professional-Level Output, Differenzierung gegenueber Wettbewerb |
| Knowledge Worker | Endanwender | H | M | Praesentationen die man direkt praesentieren kann |
| Consultant/Freelancer | Endanwender | H | M | Corporate-Design-Uebernahme, schnelle Kunden-Deliverables |
| Obsidian Community | Ecosystem | M | L | Einzigartiges Feature das kein anderes Plugin bietet |

### 3.2 Key Stakeholders

**Primary:** Sebastian Hanke (Entwickler, einziger Entscheider)
**Secondary:** Kuenftige Enduser (Knowledge Worker, Consultants)

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: Corporate Consultant**
- **Rolle:** Berater, erstellt regelmaessig Kunden-Praesentationen
- **Ziele:** Firmen-Template hochladen, Agent erzeugt Praesentationen im Corporate-Design
- **Pain Points:** Manuelles Formatieren kostet Stunden; generische AI-Outputs passen nicht zum Firmen-CI
- **Nutzungshaeufigkeit:** Daily
- **Design-Interaktion:** Laedt einmal Master-Deck hoch, sagt "merk dir das", erwartet danach automatische Anwendung

**Persona 2: Knowledge Worker**
- **Rolle:** Wissensarbeiter, erstellt gelegentlich interne Praesentationen
- **Ziele:** Schnell eine professionell aussehende Praesentation aus Vault-Notizen
- **Pain Points:** Kein Designtalent, will kein Template basteln, braucht gute Defaults
- **Nutzungshaeufigkeit:** Weekly
- **Design-Interaktion:** Waehlt aus Default-Themes, nutzt Follow-up Questions zum Anpassen

**Persona 3: Researcher/Analyst**
- **Rolle:** Erstellt datengetriebene Reports und Analysen
- **Ziele:** Strukturierte Praesentationen mit klarer Argumentation (Pyramid Principle, Data Story)
- **Pain Points:** Generische Bullet-Listen statt strukturierter Argumentation
- **Nutzungshaeufigkeit:** Weekly
- **Design-Interaktion:** Waehlt minimalistisches Theme, Fokus auf Storyline-Qualitaet

### 4.2 User Journey (High-Level)

```
1. User: "Erstelle eine Praesentation ueber Quartalsergebnisse Q4"
2. Agent prüft Memory: Design-Praeferenz vorhanden?
   [JA] -> Nutzt gespeichertes Design automatisch
   [NEIN] -> "Hast du ein Corporate-Template? Lade es hoch
             oder wähle: (1) Executive Blue (2) Modern Dark (3) Clean Minimal"
3. Agent analysiert Kontext -> waehlt Storyline-Framework
   (z.B. "Quartalsergebnisse" -> Status Update Framework)
4. Agent generiert Praesentation mit Design + Storyline
5. Agent zeigt Ergebnis + Follow-up Questions:
   "Farben anpassen? | Weitere Slides? | Als PDF exportieren? | Design als Default speichern?"
6. User: "Sieht gut aus, merk dir das Design"
7. Agent speichert ins Memory -> kuenftige Praesentationen nutzen automatisch dieses Design
```

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Die aktuelle Tool-Implementierung delegiert alle Design-Entscheidungen an das LLM. Das LLM uebergibt `theme: { primary_color: "#1a73e8", font_family: "Calibri" }` -- zwei Parameter. Professionelle Praesentationen erfordern jedoch 20+ Design-Entscheidungen: Farbpalette (5+ Farben), Font-Kombination (Heading + Body), Slide-Layouts (5+ Varianten), Abstaende, Textgroessen, Akzent-Elemente, Hintergruende, Uebergaenge.

Zusaetzlich fehlt Struktur-Intelligenz: das LLM entscheidet ad-hoc ueber die Folienreihenfolge, ohne etablierte Prasentationsmethodik anzuwenden. Das fuehrt zu inkonsistenten, oft text-lastigen Ergebnissen.

### 5.2 Root Causes

1. **Minimales Theme-Interface:** Nur 2 Parameter (primary_color, font_family) statt vollstaendiges Design-System
2. **Keine Slide-Layout-Vielfalt:** Nur Title Slide + Content Slide, keine Section Divider, Two-Column, Closing Slides
3. **Kein Storyline-Bewusstsein:** Kein Framework fuer Praesentationsstruktur (SCQA, Pyramid etc.)
4. **Kein Master-Import:** Corporate-Designs koennen nicht uebernommen werden
5. **Kein Design-Gedaechtnis:** Jede Praesentation startet bei Null

### 5.3 Impact

- **User Impact:** Praesentationen muessen nach Erstellung aufwaendig in PowerPoint nachformatiert werden -- der Zeitvorteil der AI-Erstellung geht verloren
- **Qualitaets-Impact:** Generische Outputs untergraben das Vertrauen in den Agent ("sieht aus wie von einem Tool generiert")
- **Differenzierungs-Impact:** Ohne Professional-Level Design ist das Feature kein Alleinstellungsmerkmal

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Qualitaetssprung von "programmatisch generiert" zu "Professional-Level"
- Differenzierung: Kein anderes Obsidian-Plugin und kaum ein AI-Tool liefert Praesentationen auf diesem Niveau
- Benchmark: Besser als Manus AI (Design), auf Augenhoehe mit Claude Artifacts (Template-basiert)

### 6.2 User Goals

- "Erstelle eine Praesentation" -> Ergebnis ist direkt praesentierbar ohne Nacharbeit
- "Nutze unser Firmen-Design" -> Corporate-Template wird 1:1 uebernommen
- "Merk dir das Design" -> Agent fragt nie wieder, wendet es automatisch an
- "Erstelle einen Executive Summary Report" -> Agent waehlt SCQA-Struktur automatisch

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Design-Parameter pro Theme | 2 (Farbe + Font) | 20+ (vollstaendiges Design-System) | MVP |
| Slide-Layout-Varianten | 2 (Title + Content) | 5+ (Title, Content, Two-Column, Section, Closing) | MVP |
| Verfuegbare Themes | 0 (hardcoded) | 3 Default + User-Master-Import | MVP |
| Storyline-Frameworks | 0 | 6 (SCQA, Pyramid, Problem-Solution, Narrative, Status, Data Story) | MVP |
| Nachbearbeitungsbedarf | Hoch (immer) | Niedrig (nur bei spezifischen Wuenschen) | MVP |
| Design-Persistenz | Keine | Memory-gesteuert, automatische Wiederverwendung | MVP |

---

## 7. Scope Definition

### 7.1 In Scope

**Schicht 1 -- Design-System (P0: PPTX, P1: DOCX/XLSX)**
- 3 eingebaute Default-Themes mit vollstaendiger Farbpalette, Font-Kombinationen, Slide-Layouts, Styling-Regeln
- User-Master-Deck-Extraktion: PPTX im Chat hochladen, Farben/Fonts/Hintergruende/Layouts/Logos exakt extrahieren
- Design-Persistenz ueber Agent-Memory (Vault-weit, ueberschreibbar)

**Schicht 2 -- Storyline-Frameworks (P0: PPTX + DOCX)**
- 6 Storyline-Frameworks als Vault Operator-Skills (lazy loaded):
  - SCQA (McKinsey) -- Strategy/Executive
  - Pyramid Principle (Minto) -- Analytische Reports
  - Problem-Solution -- Pitches
  - Narrative Arc -- Keynotes
  - Status Update -- Board Meetings
  - Data Story -- Analytics/Research
- Basis-Praesentationsregeln fest im System-Prompt:
  - Max. 3 Bullet Points pro Slide
  - Action Titles (nicht deskriptiv)
  - Ein Takeaway pro Slide
  - Visuelle Hierarchie (nicht alles gleich gross)

**Interaktions-Design**
- Agent fragt aktiv nach Design wenn kein Memory vorhanden
- Follow-up Questions nach Erstellung (Farben anpassen, weitere Slides, PDF-Export, Design speichern)
- Memory-gesteuert: User kann per natuerlicher Sprache Praeferenzen setzen ("merk dir das", "nutze immer dieses Design")

### 7.2 Out of Scope

- **Animations/Uebergaenge:** Keine Slide-Transitions oder Element-Animationen
- **Video/Audio-Embedding:** Keine Multimedia-Inhalte in PPTX
- **Chart-Generierung:** Keine nativen PowerPoint-Charts (Daten als Tabellen dargestellt)
- **Bearbeitung bestehender Dateien:** Kein "oeffne PPTX und aendere Folie 3"
- **DOCX-Master-Import:** Nur PPTX-Master-Extraktion in P0
- **XLSX-Design-System:** P1
- **Custom-Theme-Editor in Settings:** Design wird ueber Chat/Memory gesteuert, kein UI-Dialog
- **Branchenspezifische Themes:** Keine Finance/Healthcare/Tech-spezifischen Themes

### 7.3 Assumptions

- PPTX-Dateien koennen programmatisch gelesen werden (JSZip + XML-Parser fuer Theme-Extraktion)
- Die OOXML-Theme-Struktur (`ppt/theme/theme1.xml`) ist ausreichend standardisiert fuer zuverlaessige Extraktion
- 3 Default-Themes sind genug fuer den MVP (erweiterbar spaeter)
- Storyline-Skills koennen das bestehende Skill-Loading-Pattern nutzen
- Agent-Memory kann Design-Praeferenzen als strukturierte Daten speichern und abrufen

### 7.4 Constraints

- **Review-Bot-Compliance:** Alle Obsidian Community Plugin Review-Bot-Regeln gelten weiterhin
- **Bundle-Groesse:** JSZip/XML-Parser fuer Master-Extraction erhoehen die Plugin-Groesse -- muss vertretbar bleiben
- **Theme-Daten:** Muessen als JSON/TS-Strukturen im Plugin gebundelt werden, keine externen Downloads
- **Abhaengigkeit von BA-05:** Die Basis-Tools muessen stabil funktionieren bevor Design-System aufgesetzt wird
- **LLM-Token-Budget:** Storyline-Skills muessen schlank genug sein, um das Kontextfenster nicht zu sprengen

---

## 8. Risk Assessment

### 8.1 Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Master-PPTX-Extraktion unzuverlaessig (verschiedene PowerPoint-Versionen) | M | H | Robustes Parsing mit Fallbacks; User-Feedback bei Extraktionsproblemen |
| Default-Themes sehen trotzdem "generiert" aus | M | H | Design-Review mit echten Praesentations-Benchmarks; iteratives Tuning |
| Storyline-Framework-Auswahl durch Agent unpassend | M | M | Klare Kontext-Signale in Skill-Descriptions; User kann Framework explizit waehlen |
| Token-Overhead durch Storyline-Skills zu hoch | L | M | Skills schlank halten; nur relevanten Skill laden, nicht alle |
| User-Master enthält Elemente die nicht extrahierbar sind (Gradients, Custom Shapes) | H | M | Graceful Degradation: was nicht extrahierbar ist, durch Default ersetzen; User informieren |
| Memory-Persistenz unzuverlaessig | L | M | Design-Config zusaetzlich als Vault-Datei persistieren (Fallback) |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

**Design-System:**
- Design-Theme-Datenstruktur: Farbpalette (Primary, Secondary, Accent, Text, Background, Muted), Font-Kombination (Heading, Body), Slide-Layouts (5+), Textgroessen, Abstaende
- 3 Default-Themes eingebaut: variiert in Stil (z.B. Executive, Modern, Minimal)
- Master-PPTX-Parser: ZIP entpacken, `ppt/theme/theme1.xml` parsen, Farben/Fonts extrahieren, Slide-Layouts aus `ppt/slideLayouts/` lesen
- Design-Auswahl-Flow: Agent fragt wenn kein Memory, bietet Optionen an
- Design-Memory-Integration: Speichern/Abrufen von Design-Praeferenzen

**Storyline-Frameworks:**
- 6 Framework-Skills als Markdown-Dateien (lazy loaded)
- Basis-Praesentationsregeln im System-Prompt
- Kontextabhaengige Framework-Auswahl durch den Agent

**Interaktion:**
- Follow-up Questions nach Erstellung
- Memory-Steuerung per natuerlicher Sprache

### 9.2 Non-Functional Requirements (Summary)

- **Design-Qualitaet:** Output muss mit manuell erstellten Praesentationen konkurrieren koennen
- **Extraktions-Zuverlaessigkeit:** >90% der gaengigen PPTX-Master-Formate korrekt extrahiert
- **Performance:** Master-Extraction < 3s, Theme-Anwendung hat keinen spuerbaren Overhead
- **Erweiterbarkeit:** Neue Themes/Frameworks hinzufuegbar ohne Tool-Code-Aenderung

### 9.3 Key Features (fuer RE Agent)

| Priority | Feature | Description | Format |
|----------|---------|-------------|--------|
| P0 | Design-System Datenstruktur | Theme-Interface mit Farbpalette, Fonts, Layouts, Styling-Regeln | PPTX |
| P0 | 3 Default-Themes | Professionelle eingebaute Themes (Executive, Modern, Minimal o.ae.) | PPTX |
| P0 | Master-PPTX-Extraktion | User laedt PPTX hoch, Design wird exakt extrahiert | PPTX |
| P0 | Slide-Layout-System | 5+ Layout-Varianten (Title, Content, Two-Column, Section, Closing) | PPTX |
| P0 | Storyline-Framework-Skills | 6 Frameworks als lazy-loaded Skills | PPTX + DOCX |
| P0 | Basis-Praesentationsregeln | Max. 3 Bullets, Action Titles, ein Takeaway pro Slide (im Prompt) | PPTX |
| P0 | Design-Memory-Integration | Design-Praeferenz speichern/abrufen ueber Agent-Memory | Alle |
| P0 | Follow-up Questions | Optionen nach Erstellung anbieten | PPTX |
| P1 | DOCX-Design-System | Design-Themes auf Word-Dokumente anwenden | DOCX |
| P1 | XLSX-Design-System | Design-Themes auf Tabellenkalkulationen anwenden | XLSX |

---

## 10. Architektur-Pivot (2026-03-09)

> **Wichtige Aktualisierung:** Nach drei Iterationen des Extraktionsansatzes (pptxgenjs + Theme-Extraktion)
> wurde entschieden, auf einen template-basierten Ansatz zu wechseln.

### Problem mit dem Extraktionsansatz

Drei Iterationen haben gezeigt, dass das programmatische Nachbauen von Design-Elementen (pptxgenjs)
die Design-Treue einer echten Vorlage nicht erreichen kann:
1. Iteration 1: Nur Farben + Fonts -> generisch
2. Iteration 2: + Hintergruende, Shapes, Logos -> Positionierung ungenau
3. Iteration 3: + Platzhalter-Positionen -> strukturelle OOXML-Elemente fehlen

**Root Cause:** pptxgenjs erzeugt keine echten OOXML Slide-Masters/Layouts/Theme-Referenzen.

### Neuer Ansatz: Template-Kopie + OOXML-Injection

- Template-PPTX kopieren (User-Upload oder Default-Template aus Plugin-Assets)
- Bestehende Slides entfernen, Masters/Layouts/Theme behalten
- Neue Slides als OOXML-XML injizieren
- Einheitlicher Code-Pfad fuer User-Templates und Default-Templates

### Konsequenzen fuer BA-06

- **Schicht 1 (Design):** Vereinfacht sich erheblich. Kein komplexes Design-System noetig --
  das Design kommt aus dem Template selbst. Farbpalette/Fonts werden nur fuer Memory/Agent-Kontext extrahiert.
- **Schicht 2 (Storyline):** Unveraendert -- Framework-Skills und Basis-Regeln bleiben.
- **pptxgenjs:** Wird als Dependency entfernt.
- **Default-Templates:** 2-3 professionelle PPTX-Vorlagen werden mit dem Plugin ausgeliefert.

### Auswirkungen auf Features

| Feature (BA-06) | Status |
|-------------------|--------|
| Design-System Datenstruktur | Vereinfacht (nur Farben/Fonts fuer Kontext) |
| 3 Default-Themes | -> 2-3 Default-Templates (PPTX-Dateien statt Code-Themes) |
| Master-PPTX-Extraktion | -> Template-Kopie (viel einfacher, volle Treue) |
| Slide-Layout-System | Entfaellt (Layouts kommen aus dem Template) |
| Storyline-Framework-Skills | Unveraendert |
| Basis-Praesentationsregeln | Unveraendert |
| Design-Memory-Integration | Vereinfacht (speichert Template-Referenz statt Theme-JSON) |
| Follow-up Questions | Unveraendert |

Siehe: EPIC-11, ADR-32, FEAT-11-00 bis FEAT-11-05.

## 11. Original Next Steps (vor Pivot)

- [x] Review durch Stakeholder (Sebastian) -> Pivot-Entscheidung
- [x] Uebergabe an Requirements Engineer -> EPIC-11 erstellt
- [ ] Design-Benchmark: 3-5 Referenz-Praesentationen als Qualitaets-Referenz
- [x] PPTX-Theme-XML-Struktur evaluieren -> Extraktionsansatz verworfen, Template-Ansatz gewaehlt

---

## Appendix

### A. Glossar

| Begriff | Definition |
|---------|-----------|
| Design-System | Vollstaendiges Set aus Farben, Fonts, Layouts und Styling-Regeln fuer ein Dokument |
| Master-Deck | Eine bestehende PPTX-Datei, deren Design als Vorlage extrahiert wird |
| Theme | Eine konkrete Auspraegung des Design-Systems (z.B. "Executive Blue") |
| Storyline-Framework | Strukturierungsmethodik fuer Praesentationen (z.B. SCQA, Pyramid Principle) |
| SCQA | Situation-Complication-Question-Answer (McKinsey-Methodik) |
| Pyramid Principle | Top-Down-Argumentation nach Barbara Minto |
| Action Title | Folien-Titel der eine Aussage/Schlussfolgerung enthaelt, nicht nur ein Thema |
| Follow-up Question | Vom Agent angebotene Optionen nach einer Tool-Ausfuehrung |

### B. Interview Notes

- **Scope:** MVP -- direkt produktionsreif, baut auf BA-05 auf
- **Master-Deck:** Beides P0: User-Master (PPTX-Upload, exakte Extraktion) + Default-Design
- **Format-Scope:** Design-System PPTX P0, DOCX/XLSX P1. Storyline PPTX + DOCX P0
- **Storyline-Implementierung:** Hybrid -- Basis-Regeln fest im Prompt, Frameworks als Skills (lazy loaded)
- **Nutzerinteraktion:** Pro Dokument, Memory-gesteuert. Agent achtet auf Memory-Anweisungen ("merk dir das"). Follow-up Questions nach Erstellung
- **Default-Themes:** 3 Themes zum Start, User kann auswaehlen
- **Design-Benchmark:** McKinsey/BCG-Stil (clean, datengetrieben, viel Weissraum) als Qualitaets-Referenz
- **Benchmark-Analyse:** Manus AI schwach (repetitiv), Claude besser (template-basiert). Qualitaetssprung durch Design-System + Storyline, nicht durch Library

### C. Drei-Schichten-Modell (Referenz)

```
+--------------------------------------------------+
| Schicht 3: Content-Generation (bestehend)        |
| - LLM erzeugt Inhalte basierend auf User-Input   |
| - Nutzt Vault-Kontext, Recherche, Analyse        |
+--------------------------------------------------+
         |                            |
         v                            v
+------------------------+  +------------------------+
| Schicht 2: Storyline   |  | Schicht 1: Design      |
| (WAS auf welche Slides)|  | (WIE es aussieht)      |
|                        |  |                        |
| - SCQA (McKinsey)      |  | - 3 Default-Themes     |
| - Pyramid Principle    |  | - User-Master-Import   |
| - Problem-Solution     |  | - Farbpalette (6+)     |
| - Narrative Arc        |  | - Font-Kombinationen   |
| - Status Update        |  | - 5+ Slide-Layouts     |
| - Data Story           |  | - Styling-Regeln       |
|                        |  | - Memory-Persistenz    |
| Basis-Regeln (Prompt): |  |                        |
| - Max. 3 Bullets/Slide |  | Formate:               |
| - Action Titles        |  | P0: PPTX               |
| - 1 Takeaway/Slide     |  | P1: DOCX, XLSX         |
|                        |  |                        |
| Formate:               |  |                        |
| P0: PPTX + DOCX        |  |                        |
+------------------------+  +------------------------+
         |                            |
         v                            v
+--------------------------------------------------+
| create_pptx / create_docx / create_xlsx          |
| (Built-in Tools, Schicht 2 Plugin-Kontext)       |
+--------------------------------------------------+
```

### D. References

- `_devprocess/analysis/BA-05-office-document-creation.md` -- Vorgaenger-BA (Basis-Implementierung)
- `src/core/tools/vault/CreatePptxTool.ts` -- Aktuelle PPTX-Tool-Implementierung
- `src/core/tools/vault/CreateDocxTool.ts` -- Aktuelle DOCX-Tool-Implementierung
- `src/core/tools/vault/CreateXlsxTool.ts` -- Aktuelle XLSX-Tool-Implementierung
- `src/core/prompts/sections/toolDecisionGuidelines.ts` -- Tool-Routing-Regeln
- `src/core/modes/builtinModes.ts` -- Mode-Konfiguration mit Office-Tools

---

## Validierung

```
CHECK fuer MVP:

1. Business Context vollstaendig?                    [x]
2. Stakeholder Map vorhanden?                        [x]
3. Mind. 2 User Personas?                            [x] (3 Personas)
4. KPIs mit Baseline + Target?                       [x]
5. In-Scope vs Out-of-Scope explizit?                [x]
6. Constraints dokumentiert?                          [x]
7. Risiken identifiziert?                             [x] (6 Risiken)
8. Key Features priorisiert (P0/P1/P2)?              [x]

Score: 8/8 -- RE-Ready
```
