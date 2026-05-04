# Template Design Intelligence -- Analyse und Architekturentscheidung

> Datum: 2026-03-13 (aktualisiert: Cloud Run + BYOK-only + Open Source)
> Status: Analyse abgeschlossen, Implementierung ausstehend
> Kontext: EPIC-11 (Office Document Quality)

---

## 1. Problemstellung

### 1.1 Ausgangslage

Obsilo kann Corporate-Praesentationen erstellen, indem es Slides aus einer .pptx-Vorlage klont und Text per Shape-Name-Matching ersetzt (PptxTemplateCloner). Die technische Pipeline funktioniert -- aber die Ergebnis-Qualitaet ist mittelmassig.

### 1.2 Root Cause

Das System reduziert ein starkes LLM auf einen **Key-Value-Mapper**:

```
Content → Slide-Nummer waehlen → Shape-Namen nachschlagen → Text einsetzen
```

Es fehlt jede Form von:
- **Visuellem Verstaendnis**: Was BEDEUTEN die Formen im Template?
- **Narrativer Planung**: Welche Geschichte erzaehlt die Praesentation?
- **Design-Reasoning**: Warum ist eine bestimmte visuelle Form die richtige fuer diesen Inhalt?
- **Kreativem Spielraum**: Das LLM kann keine Design-Entscheidungen treffen, nur Felder fuellen

### 1.3 Vergleich mit dem Markt

| Tool | Ansatz | Schwaeche |
|------|--------|-----------|
| Gamma.app | Web-native, strukturelles Reasoning | PPTX-Export mangelhaft, kein Template-Verstaendnis |
| Beautiful.ai | Smart Templates mit Layout-Regeln | Restriktiv, kein semantisches Design-Verstaendnis |
| Slidebean | Genetischer Algorithmus, Pitch-Deck-Fokus | Nische, kein Corporate-Template-Support |
| Tome | Eingestellt (Maerz 2025) | -- |
| **Alle** | Arbeiten auf Template-Ebene | Keines versteht visuelle Rhetorik oder narrative Struktur |

**Die Luecke**: Kein bestehendes Tool uebersetzt automatisch die visuellen Formen eines Templates in semantische Bedeutung. Alle arbeiten mit manuell getaggten Templates oder generischen Layouts.

---

## 2. Vision: Template Design Intelligence

### 2.1 Kernidee

Statt dem LLM Shape-Namen beizubringen, bringen wir ihm **visuelles Denken** bei. Ein professioneller Designer oeffnet eine unbekannte Vorlage und versteht sie sofort -- er sieht Formen und weiss, was sie bedeuten, wann man sie einsetzt, welche Geschichte sie erzaehlen.

Diese Faehigkeit replizieren wir durch eine **automatische semantische Analyse** jedes Templates: Die visuellen Formen werden in eine Design-Sprache uebersetzt, die das LLM kreativ nutzen kann.

### 2.2 Der Unterschied

**Vorher (mechanisch):**
"Nimm Slide 63, fuelle `Pfeil: Fuenfeck 18` mit 'Schritt 1'"

**Nachher (semantisch):**
"Der Inhalt beschreibt eine Pipeline mit 5 Stufen → visuelle Form: Chevron-Kette → kommuniziert linearen Fortschritt → Slide 63 realisiert das → Chevron-Text kurz halten (2-3 Worte), Reihenfolge IST die Argumentation"

### 2.3 Drei Schichten des Design-Verstaendnisses

**Schicht 1: Visuelles Vokabular** -- Was Formen BEDEUTEN

Jede geometrische Form traegt eine semantische Bedeutung:

| Visuelle Form | Bedeutung | Einsatz | Gegenindikation |
|---------------|-----------|---------|-----------------|
| Chevron-Kette | Sequenz, Fortschritt, Pipeline | Schritte in Reihenfolge | Nicht-lineare Ablaeufe |
| Pyramide | Hierarchie, Prioritaet, Verdichtung | Von breit zu schmal | Gleichwertige Ebenen |
| Kreislauf | Zyklus, Iteration, Feedback-Loop | Wiederkehrende Prozesse | Einmalige Ablaeufe |
| 2x2-Matrix | Analyse, Positionierung, Spannung | Zwei Dimensionen kreuzen | Mehr als 2 Dimensionen |
| 3x3-Grid | Optionen, Uebersicht, Gleichwertigkeit | 6-9 gleichwertige Elemente | Hierarchische Struktur |
| Organigramm | Hierarchie, Verantwortung | Reporting-Linien | Flache Strukturen |
| KPI-Saeulen | Vergleich, Entwicklung, Beweis | Zahlen belegen eine These | Qualitative Aussagen |
| Waage | Gleichgewicht, Abwaegung | Zwei Seiten einer Entscheidung | Mehr als 2 Optionen |
| Stoerer/Callout | Hervorhebung, Kernzahl | Eine wichtige Zahl/Aussage | Alles gleich wichtig |

**Schicht 2: Visuelle Kompositionen** -- Wie Formen Slides bilden

Einzelne Formen kombinieren sich zu Slide-Kompositionen mit eigener Bedeutung. Beispiel:
- 5 Chevrons + 5 Textbloecke darunter = "Linearer Gleichschritt-Prozess mit Detaillierung"
- Zentraler Kreis + 4 Boegen + 4 Textbloecke = "Zyklischer Vierphasen-Prozess"
- 13 Rechtecke + gewinkelte Connectors = "Organisationshierarchie in 3 Ebenen"

Jede Komposition hat: semantische Bedeutung, emotionale Wirkung, Kapazitaet, Einsatzregeln.

**Schicht 3: Narrative Muster** -- Wie Slides Geschichten erzaehlen

Slides isoliert zu generieren ist wie Saetze ohne Zusammenhang zu schreiben. Narrative Muster definieren Slide-Sequenzen:

| Muster | Struktur | Ideal fuer |
|--------|----------|-----------|
| SCQA (Minto/McKinsey) | Situation → Complication → Question → Answer | Entscheidungsvorlagen, Strategie |
| Sparkline (Duarte) | What Is ↔ What Could Be (Wechsel) | Transformations-Pitches |
| Data Story | Context → Overview → Drill-Down → Insight → Implication | Quartalsberichte |
| SCR | Situation → Complication → Resolution | Kurze Praesentationen |
| Status Report | Ueberblick → Fortschritt → Details → Risiken → Ausblick | Projekt-Updates |

---

## 3. Technische Loesung: Automatischer Template-Analyzer

### 3.1 Die Analyse-Pipeline

```
Template.pptx (beliebig)
         │
    [Schicht 1: OOXML-Parser] ← deterministisch (python-pptx)
    Shapes: Position, Groesse, Geometrie, Farbe, Text, Gruppen, Connectors
         │
    [Schicht 2: Slide-Renderer] ← deterministisch (LibreOffice headless)
    PNG-Bilder aller Slides (pixelperfekt, inkl. Custom Fonts/Effekte/Bilder)
         │
    [Schicht 3: Spatial Analyzer] ← deterministisch + Heuristik
    Kompositionsmuster: Sequenzen, Grids, Radial, Hierarchien, Paarungen
         │
    [Schicht 4: Theme-Extraktor] ← deterministisch
    Brand-DNA: Farben, Fonts, Linien aus theme1.xml
         │
    [Schicht 5: Multimodaler LLM-Call] ← Claude Vision
    Input: Slide-Bilder + strukturierte Daten + Kompositionsmuster + Brand-DNA
    Output: Visual Design Language Document
         │
    SKILL.md (importierbar in Obsilo)
```

### 3.2 Warum multimodal (Bilder + Daten)?

Die Kombination von zwei Eingabekanaelen ist entscheidend:

**Kanal 1 -- Strukturierte Daten** (exakt, deterministisch):
- Exakte Positionen, Groessen, Farben
- Geometrie-Typen (rect, chevron, ellipse, custGeom, ...)
- Gruppierungen und Verbindungen
- Text-Inhalt und -Formatierung

**Kanal 2 -- Gerenderte Bilder** (visuell, wie ein Mensch es sieht):
- Gesamtwirkung einer Slide-Komposition
- custGeom-Shapes: Im XML sind das arbitraere Pfade, im Bild erkennt das LLM "Swoosh", "Trichter", etc.
- Dekorative vs. funktionale Elemente: Im XML schwer unterscheidbar, im Bild offensichtlich
- Visuelle Hierarchie, Whitespace, Balance

**Nur mit Bildern**: Keine exakten Shape-Daten, Position Halluzination moeglich
**Nur mit Daten**: custGeom-Shapes unverstaendlich, keine Gesamtwirkung sichtbar
**Beides zusammen**: Exakte Daten + visuelles Verstaendnis = zuverlaessige semantische Analyse

### 3.3 Warum LibreOffice und kein Canvas-Rendering im Browser?

| Aspekt | LibreOffice headless | Browser Canvas |
|--------|---------------------|----------------|
| Custom Fonts | Installierbar im Container | Fallback auf System-Fonts |
| Schatten, 3D, Transparenz | Vollstaendig | Approximation |
| Eingebettete Bilder | Korrekt gerendert | Nur Bounding-Box |
| Charts | Korrekt gerendert | Nicht moeglich |
| custGeom-Shapes | Pixelperfekt | Muessten nachprogrammiert werden |
| Qualitaet | **Identisch mit PowerPoint** | **Kompromiss** |

Entscheidung: **Keine Kompromisse bei der Rendering-Qualitaet.** LibreOffice headless liefert identische Ergebnisse wie PowerPoint. Die Bilder sind die Basis fuer die semantische Analyse -- wenn sie ungenau sind, ist die Analyse ungenau.

### 3.4 Output: Visual Design Language Document

Das Ergebnis der Analyse ist ein Markdown-Dokument im Obsilo-Skill-Format mit YAML-Frontmatter. Es enthaelt:

**Teil 1: Brand-DNA**
Farben, Fonts, Grundstimmung des Templates.

**Teil 2: Visuelles Vokabular**
Alle erkannten visuellen Bausteine mit:
- Name und Aussehen
- Semantische Bedeutung (was kommuniziert diese Form?)
- Erzaehlerischer Nutzen (welche Geschichte erzaehlt sie?)
- Emotionale Wirkung (was fuehlt das Publikum?)
- Kapazitaet (wie viel Text/Daten passen rein?)
- Wann einsetzen / wann nicht
- Technisches Mapping (Shape-Namen fuer den PptxTemplateCloner)

**Teil 3: Kompositionen**
Wie Bausteine ganze Slides bilden:
- Welche Bausteine kombiniert
- Was erzaehlt diese Slide-Komposition
- Wann waehlen (Content-Typ, Narrativ-Phase)
- Varianten (mit/ohne Icons, Nummern, Beschreibungen)

**Teil 4: Narrative Muster**
Empfohlene Slide-Sequenzen fuer verschiedene Praesentationstypen.

**Teil 5: Design-Regeln**
Was NICHT tun: Slides die nie aufeinander folgen sollten, maximale Textlaengen, nicht-aenderbare Elemente.

### 3.5 Groessenbeschraenkung

Das generierte Skill-Dokument muss unter 16.000 Zeichen bleiben (SkillsManager-Limit in Obsilo). Der LLM-Prompt muss dies als Constraint beinhalten. Bei sehr grossen Templates (100+ Slides) wird der Skill die wichtigsten Kompositionen enthalten und fuer Details auf eine separate Vault-Datei verweisen (gleicher Ansatz wie der aktuelle EnBW-Katalog).

---

## 4. Architektur: Open-Source-Service auf obsilo.ai

### 4.1 Entscheidung: BYOK-only, Open Source, Zero Cost

**Rahmenbedingungen:**
- Vollstaendig Open Source (Apache 2.0) -- kein privates Repo, kein Payment
- BYOK (Bring Your Own Key) -- User nutzt eigenen Anthropic API Key
- Zero laufende Kosten auf Betreiberseite
- Keine Geschaeftsgruendung (UG/GmbH) noetig
- Minimaler Wartungsaufwand

**Anforderungen ans Backend:**
- LibreOffice muss ausfuehrbar sein (fuer pixelperfektes Slide-Rendering)
- Python mit python-pptx, anthropic SDK, Pillow
- Kein persistenter Storage (Privacy: Daten werden sofort verworfen)
- Skaliert auf Null (keine Kosten bei Inaktivitaet)

### 4.2 Entscheidung: Google Cloud Run

| Plattform | LibreOffice | Docker | Free Tier | Skaliert auf 0 | Komplexitaet |
|-----------|------------|--------|-----------|----------------|--------------|
| Vercel | Nein | Nein | Ja | Ja | Niedrig (aber ungeeignet) |
| Modal | Ja | Auto | $30/mo Credits | Ja | Niedrig |
| Hugging Face Spaces | Ja | Ja | 16GB RAM | Nein (always-on) | Mittel |
| Railway | Ja | Ja | Nein ($5/mo) | Ja | Mittel |
| **Google Cloud Run** | **Ja** | **Ja** | **360k GB-sec** | **Ja** | **Mittel** |

**Warum Cloud Run:**
- **Free Tier ist massiv**: 360.000 GB-Sekunden/Monat = ~6.000-12.000 Analysen
- **Skaliert auf Null**: Kein Container laeuft = keine Kosten
- **Kostenschutz**: `--max-instances=5` begrenzt gleichzeitige Container, ohne Billing Account stoppt der Service automatisch wenn Free Tier aufgebraucht ist
- **Docker-basiert**: LibreOffice + Python + alle Dependencies in einem Dockerfile
- **Open Source freundlich**: Kein proprietaeres SDK, Standard-Docker-Deployment

```bash
gcloud run deploy obsilo-template-analyzer \
  --max-instances=5 \
  --concurrency=1 \
  --memory=2Gi \
  --timeout=300
```

### 4.3 Gesamtarchitektur

```
obsilo.ai (GitHub Pages)              Google Cloud Run (Free Tier)
Bestehendes Hosting                   Dockerfile + app.py
┌────────────────────┐                ┌──────────────────────────┐
│                    │                │                          │
│ /template-analyzer │  POST /analyze │  analyze()               │
│                    ├───────────────→│  1. python-pptx: Shapes  │
│ - PPTX Upload      │                │  2. LibreOffice: Render  │
│ - API Key (BYOK)   │   SSE Stream   │  3. Spatial: Muster     │
│                    │←───────────────│  4. Claude Vision: Design│
│ - Fortschritt      │                │  5. Return SKILL.md      │
│ - Download Result  │                │                          │
└────────────────────┘                └──────────────────────────┘

Services: 2 (GitHub Pages + Cloud Run)
Backend-Dateien: Dockerfile + app.py + requirements.txt
Deployment: gcloud run deploy
Kosten: $0
```

### 4.4 Privacy

- PPTX wird in-memory verarbeitet und nach dem Response sofort verworfen
- Kein persistenter Storage fuer Template-Dateien
- Gerenderte Bilder gehen an Anthropic API ueber den Key des Users
- API Key des Users wird nur fuer den einen Request verwendet, nie gespeichert
- Kein Account, keine Registrierung, keine User-Daten

### 4.5 Kosten

| Posten | Kosten | Anmerkung |
|--------|--------|-----------|
| GitHub Pages | $0 | Bestehendes Hosting |
| Google Cloud Run | $0 | Free Tier (360k GB-sec/Monat) |
| Domain | $0 | Subdomain von bestehender Domain |
| **Gesamt** | **$0** | Auch bei hohem Volumen im Free Tier |

### 4.6 Kostenschutz

- **`--max-instances=5`**: Begrenzt gleichzeitige Container (verhindert DDoS-Kosten)
- **Kein Billing Account**: Service stoppt automatisch wenn Free Tier aufgebraucht
- **Alternative**: Budget-Alert auf $0 setzen → Warnung wenn Limit naht
- **Realistisch**: Bei einem Nischen-Tool werden 6.000+ Analysen/Monat nie erreicht

---

## 5. Integration in Obsilo

### 5.1 Primaerer Workflow: Web-Service (BYOK)

```
1. User oeffnet obsilo.ai/template-analyzer
2. Gibt eigenen Anthropic API Key ein
3. Zieht .pptx in die Upload-Zone
4. Klickt "Analysieren"
5. Sieht Live-Fortschritt (SSE: Parsing → Rendering → Analyse → Fertig)
6. Downloadt SKILL.md
7. In Obsidian: Obsilo Settings > Skills > Import > SKILL.md auswaehlen
8. Fertig -- Agent versteht das Template
```

API Key wird nur fuer den einen Request verwendet, nie gespeichert. Kosten fuer den User: ~$1-3 (Claude Vision API fuer ~100 Slides).

### 5.2 Sekundaerer Workflow: In-Plugin (ohne Bilder)

Fuer User die keinen Web-Service nutzen wollen/koennen:

```
1. User zu Agent: "Analysiere meine Vorlage XY.pptx"
2. Agent fuehrt analyze_pptx_template aus (bestehendes Tool, erweitert)
3. PptxTemplateAnalyzer extrahiert Shapes + Spatial Patterns (deterministisch)
4. Agent generiert Design Language aus strukturierten Daten (OHNE Bilder)
5. Ergebnis wird als Skill gespeichert
```

Qualitaet ist geringer als der Web-Service (kein LibreOffice-Rendering, keine Bilder), aber funktional und fuer einfache Templates ausreichend. Kein externer Service noetig.

### 5.3 Tertiaerer Workflow: Community Gallery

```
obsilo.ai/template-gallery (oder GitHub Repo)

Populaere Templates, bereits analysiert:
  - EnBW Corporate 2026
  - Generic: Executive Dark
  - Generic: Modern Light
  - ...

User downloadt SKILL.md → importiert in Obsilo → fertig.
```

Separates GitHub Repository (z.B. `pssah4/obsilo-template-gallery`). Community kann beitragen. Kein Analyse-Aufwand fuer den User.

### 5.4 Erweiterung des presentation-design Skills

Der bestehende bundled Skill `presentation-design/SKILL.md` wird um universelle Design-Prinzipien erweitert:

- Visuelle Grammatik (was bedeuten Formen generell, template-unabhaengig)
- Narrative Muster (SCQA, Sparkline, Data Story, SCR)
- Gestalt-Prinzipien als Layout-Constraints
- Signal-to-Noise-Regeln (Tufte, Reynolds)
- Content-to-Visualization Decision Tree (erweitert)

Dieses universelle Wissen bildet die Basis, auf der template-spezifische Design Languages aufbauen.

---

## 6. Projekt-Struktur

### 6.1 Repositories

```
pssah4/obsilo                        ← Open Source, Apache 2.0 (bestehendes Repo)
  - Obsidian Plugin
  - docs/ (obsilo.ai inkl. template-analyzer Frontend)
  - bundled-skills/presentation-design/ (universelle Design-Prinzipien)

pssah4/obsilo-template-analyzer      ← Open Source, Apache 2.0 (neues Repo)
  - Dockerfile (Python + LibreOffice)
  - app.py (Analyse-Pipeline: Flask/FastAPI)
  - requirements.txt
  - README.md (Self-Hosting Anleitung)
  - cloudbuild.yaml (optional, fuer gcloud deploy)

pssah4/obsilo-template-gallery       ← Open Source, Apache 2.0 (neues Repo)
  - templates/{name}/SKILL.md
  - CONTRIBUTING.md
```

### 6.2 Alles Open Source

- Kein privates Repo, kein geschuetztes IP
- Jeder kann den Analyzer selbst hosten (eigene Cloud Run Instanz, lokal mit Docker, etc.)
- LLM-Prompts sind Teil des Open-Source-Codes
- Community kann Prompts verbessern und Templates beitragen
- Keine Geschaeftsgruendung noetig, keine Haftungsrisiken (Apache 2.0 Haftungsausschluss)

---

## 7. Technische Details

### 7.1 Cloud Run Backend

**Dockerfile:**

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    libreoffice-impress \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

**app.py (Skizze):**

```python
from fastapi import FastAPI, UploadFile, Header
from fastapi.responses import StreamingResponse
import anthropic
from pptx import Presentation
import subprocess, tempfile, base64
from pathlib import Path

app = FastAPI()

@app.post("/analyze")
async def analyze(file: UploadFile, x_api_key: str = Header()):
    pptx_bytes = await file.read()

    # 1. python-pptx: Shape-Extraktion (deterministisch)
    shapes_data = extract_shapes(pptx_bytes)

    # 2. LibreOffice: Slides → PNGs (deterministisch)
    slide_images = render_slides(pptx_bytes)

    # 3. Spatial Analysis: Kompositionsmuster (deterministisch + Heuristik)
    compositions = analyze_compositions(shapes_data)

    # 4. Theme-Extraktion: Brand-DNA (deterministisch)
    brand_dna = extract_theme(pptx_bytes)

    # 5. Claude Vision: Multimodale Analyse (User's API Key)
    client = anthropic.Anthropic(api_key=x_api_key)
    skill_md = generate_design_language(client, slide_images, shapes_data, compositions, brand_dna)

    # 6. Return SKILL.md
    return {"skill": skill_md}
```

**requirements.txt:**

```
fastapi
uvicorn
python-pptx
anthropic
Pillow
numpy
```

### 7.2 Frontend (template-analyzer.html)

Statische HTML-Seite auf obsilo.ai (GitHub Pages):
- Drag-and-Drop Upload-Zone
- API Key Input (Anthropic Key, wird nur fuer den Request verwendet)
- Fortschrittsanzeige (Parsing → Rendering → Analyse → Fertig)
- Markdown-Vorschau des Ergebnisses
- Download-Button fuer SKILL.md
- Anleitung zum Import in Obsilo
- Hinweis: "Your API key is sent directly to Anthropic and never stored"

### 7.3 LLM-Prompt (Kern der Analyse)

```
Du bist ein professioneller Presentation Designer mit 20 Jahren Erfahrung.

Ich zeige dir ein Corporate Template mit ${slideCount} Slides.
Fuer jeden Slide bekommst du:
  - Ein gerendertes Bild (wie der Slide aussieht)
  - Strukturierte Daten (exakte Shapes, Positionen, Groessen, Farben)
  - Erkannte Kompositionsmuster (Sequenzen, Grids, Hierarchien)

Erstelle ein Visual Design Language Document mit:

1. BRAND-DNA: Farben, Fonts, Grundstimmung
2. VISUELLES VOKABULAR: Alle Bausteine mit Bedeutung, Wirkung, Einsatzregeln
3. KOMPOSITIONEN: Slide-Kompositionen mit narrativer Funktion
4. NARRATIVE MUSTER: Slide-Sequenzen fuer verschiedene Praesentationstypen
5. DESIGN-REGELN: Constraints, Textlaengen, nicht-aenderbare Elemente
6. TECHNISCHES MAPPING: Shape-Namen und Content-Keys fuer den PptxTemplateCloner

Max 16.000 Zeichen. Formatiere als Obsilo-Skill mit YAML-Frontmatter.
```

### 7.4 Bestehendes Plugin: Aenderungen

| Datei | Aenderung | Prioritaet |
|-------|-----------|------------|
| `PptxTemplateAnalyzer.ts` | Spatial Analysis erweitern (Kompositionsmuster) | P1 (fuer In-Plugin-Workflow) |
| `AnalyzePptxTemplateTool.ts` | Design Language Generation orchestrieren | P1 |
| `presentation-design/SKILL.md` | Universelle Design-Prinzipien ergaenzen | P1 |
| `PptxTemplateCloner.ts` | cleanupPlaceholderText cross-run Fix (bereits implementiert) | Done |
| `office-workflow/SKILL.md` | Template-Skill-Referenz aktualisieren | P2 |

---

## 8. Offene Fragen

### 8.1 Technisch

- **CORS**: Cloud Run erlaubt CORS-Header in der App (FastAPI CORSMiddleware). Muss konfiguriert werden fuer obsilo.ai Origin.
- **File Upload Limit**: Cloud Run Default ist 32MB (ausreichend fuer die meisten PPTX). Konfigurierbar bis 32MB im Free Tier.
- **Cold Start**: Container mit LibreOffice ist gross (~500MB). Erster Request nach Inaktivitaet dauert 10-30 Sekunden. Danach schnell (Container bleibt warm fuer ~15 Min).
- **Custom Fonts**: User kann eigene Fonts nicht hochladen. Container enthaelt fonts-liberation (Arial/Times-kompatibel). Fuer Corporate Fonts: Rendering ist nah genug fuer die semantische Analyse, auch wenn nicht pixelperfekt mit Custom Fonts.

### 8.2 Rechtlich

- **Impressum**: Pflicht auf obsilo.ai (auch fuer nicht-kommerzielle Seiten in DE)
- **Datenschutzerklaerung**: Minimal -- "Keine Daten werden gespeichert. API-Calls gehen mit Ihrem Key direkt an Anthropic."
- **Haftung**: Apache 2.0 Section 9 -- AS IS, keine Gewaehrleistung
- **Keine Geschaeftsgruendung noetig**: Kein Umsatz, kein kommerzieller Service

### 8.3 Qualitaet

- **Prompt-Optimierung**: Der LLM-Prompt fuer die Design-Language-Generierung muss iterativ optimiert werden
- **16k-Limit**: Passt ein vollstaendiges Design Language Document fuer grosse Templates (100+ Slides) in 16k Zeichen?
- **Validierung**: Wie pruefen wir, ob die generierte Design Language tatsaechlich zu besseren Praesentationen fuehrt?

---

## 9. Implementierungsreihenfolge

### Phase 1: Backend (Google Cloud Run)

1. Google Cloud Projekt anlegen, Cloud Run aktivieren
2. Dockerfile erstellen (Python + LibreOffice + Dependencies)
3. Analyse-Pipeline implementieren (python-pptx + LibreOffice + Spatial Analysis)
4. Design Language Prompt entwickeln und iterieren
5. FastAPI Endpoint (`POST /analyze`)
6. Mit EnBW-Template validieren: generierte SKILL.md vs. manuell erstellte vergleichen
7. `gcloud run deploy` mit Kostenschutz (`--max-instances=5`)

### Phase 2: Frontend (obsilo.ai)

1. template-analyzer.html Seite erstellen
2. Upload-Zone, API Key Input, Fortschrittsanzeige
3. Markdown-Vorschau und Download
4. Responsive Design, Accessibility
5. Anleitung zum Import in Obsilo

### Phase 3: Plugin-Integration

1. presentation-design Skill erweitern (universelle Design-Prinzipien)
2. PptxTemplateAnalyzer: Spatial Analysis erweitern
3. In-Plugin-Analyse-Workflow (ohne Bilder, als Fallback)
4. End-to-End Test: Template analysieren → Skill importieren → Praesentation erstellen

### Phase 4: Community

1. Template Gallery Repository aufsetzen
2. EnBW-Template als erstes Beispiel
3. CONTRIBUTING.md mit Anleitung
4. Integration in obsilo.ai (Gallery-Seite)

---

## 10. Erfolgs-Metriken

| Metrik | Ziel | Messmethode |
|--------|------|-------------|
| Design-Language-Qualitaet | LLM nutzt >80% der verfuegbaren visuellen Formen korrekt | Manuelle Pruefung von 10 Test-Praesentationen |
| Template-Abdeckung | Funktioniert mit 5+ verschiedenen Corporate Templates | Test mit realen Vorlagen |
| Time-to-Value | <5 Minuten von Upload bis fertigem Skill | Zeitmessung |
| Community-Adoption | 10+ Templates in der Gallery innerhalb von 6 Monaten | GitHub Repository |
| GitHub Stars | 50+ Stars auf obsilo-template-analyzer | GitHub |

---

## 11. Referenzen

### Design-Theorie

- Nancy Duarte: Resonate (Sparkline-Framework), slide:ology (visuelles Denken)
- Garr Reynolds: Presentation Zen (Signal-to-Noise Ratio, Simplicity)
- Edward Tufte: Data-Ink Ratio, Chartjunk, Graphical Excellence
- Andrew Abela: Chart Chooser Framework (Comparison/Composition/Distribution/Relationship)
- Barbara Minto: SCQA/Minto Pyramid (Top-Down-Kommunikation)
- Gestalt-Prinzipien: Proximity, Similarity, Closure, Continuity, Figure/Ground

### Marktanalyse

- Gamma.app: 70 Mio. User, $100M ARR (Nov 2025), PPTX-Export-Probleme
- Beautiful.ai: Smart Templates, Brand Governance, restriktives Grid
- Slidebean: Genetischer Algorithmus, Pitch-Deck-Fokus
- HBR Feb 2026: "Your Strategy Needs a Visual Metaphor" (Eppler/Hinnen/Buenzli)
- Wharton 2025: KI konvergiert auf gleiche Ideen, reduziert kreative Diversitaet

### Bestehender Code

- `PptxTemplateCloner.ts`: Slide-Kloning-Engine, Shape-Matching S0-S6
- `PptxTemplateAnalyzer.ts`: Shape-Extraktion, classifySlide()-Heuristik
- `SkillsManager.ts:134`: 16k-Zeichen-Limit fuer Skills
- `CreatePptxTool.ts`: Routing zwischen Template/HTML/Legacy Pipeline
