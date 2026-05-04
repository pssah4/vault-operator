# ADR-33: Multimodaler Template-Analyzer (Cloud Run + BYOK)

**Superseded by:** ADR-46 → ADR-47 (Schema-Constrained Slide Generation)
**Deprecated:** 2026-03-22 (nie implementiert)
**Date:** 2026-03-13
**Deciders:** Sebastian Hanke

> ### Lesson Learned
> Externe Cloud-Services (Docker, Cloud Run, CORS, BYOK-Key-Handling) sind fuer ein
> Obsidian Plugin der falsche Weg. Die Analyse muss lokal und schnell sein (<3 Min, nicht 30-60 Min).
> Das 16k-Skill-Limit ist eine harte Grenze -- 37k chars Visual Design Language Document passt nicht.
> **Erkenntnis:** Lokale Shape-Discovery via pptx-automizer + kompakter Guide ist ausreichend.
> Vision-Enrichment optional (render_previews in ADR-46/047).

## Context

EPIC-11 hat gezeigt, dass der bisherige Ansatz (deterministischer OOXML-Parser + Heuristik-Klassifikation) zu einem System fuehrt, das das LLM auf einen Key-Value-Mapper reduziert: "Nimm Slide 63, fuell Shape X mit Text Y". Es fehlt jedes Verstaendnis dafuer, was die visuellen Formen BEDEUTEN, wann man sie einsetzt und welche Geschichte sie erzaehlen.

**Root Cause:** Der In-Plugin-Analyzer (PptxTemplateAnalyzer.ts) kann nur strukturierte Daten extrahieren (Positionen, Geometrien, Farben). Er kann nicht:
- custGeom-Shapes visuell interpretieren (im XML sind das arbitraere Pfade, im Bild erkennt man "Swoosh", "Trichter")
- Gesamtwirkung einer Slide-Komposition bewerten (visuelles Gleichgewicht, Whitespace, Hierarchie)
- Dekorative von funktionalen Elementen zuverlaessig unterscheiden (im XML schwer, im Bild offensichtlich)
- Emotionale Wirkung und narrative Funktion zuordnen

Die Loesung ist multimodale Analyse: gerenderte Slide-Bilder (pixelperfekt via LibreOffice) + strukturierte Daten zusammen an ein Vision-faehiges LLM. LibreOffice ist nicht in Electron ausfuehrbar -- daher muss die Analyse extern erfolgen.

**Triggering ASR:**
- CRITICAL ASR: BYOK-Only Privacy (User API Keys nie speichern, Template-Daten nicht persistieren)
- CRITICAL ASR: Zero-Cost-Betrieb (kein Business-Modell, Open Source)
- MODERATE ASR: Self-Hosting-Faehigkeit (Enterprises muessen intern deployen koennen)
- Quality Attributes: Security, Privacy, Cost Efficiency, Portability

## Decision Drivers

- **Privacy:** Keine User-Daten speichern, kein Account-System, BYOK-only
- **Kosten:** Zero laufende Kosten fuer den Betreiber, keine GmbH/UG noetig
- **Open Source:** Apache 2.0, Community kann beitragen und selbst hosten
- **Rendering-Qualitaet:** Pixelperfektes Rendering identisch mit PowerPoint (inkl. Custom Fonts, Effekte)
- **Multimodalitaet:** Bilder + strukturierte Daten zusammen fuer zuverlaessige semantische Analyse

## Considered Options

### Option 1: Analyse komplett im Plugin (nur Daten, keine Bilder)

PptxTemplateAnalyzer erweitern -- mehr Heuristiken, bessere Klassifikation.

- Pro: Kein externer Service noetig, Offline-faehig
- Pro: Kein Privacy-Risiko (alles lokal)
- Con: custGeom-Shapes bleiben unverstaendlich (arbitraere XML-Pfade)
- Con: Keine Gesamtwirkung, keine emotionale Bedeutung
- Con: Qualitaetsdecke: Heuristiken koennen kein visuelles Verstaendnis ersetzen

### Option 2: Serverless Function (Vercel/Netlify)

Analyse als Serverless Function -- leichtgewichtig, einfach zu deployen.

- Pro: Einfaches Deployment, guter Free Tier
- Con: **LibreOffice nicht ausfuehrbar** (keine Custom Runtimes, Function-Size-Limits)
- Con: Ohne Rendering keine Bilder -- gleiche Limitation wie Option 1

### Option 3: Google Cloud Run mit Docker (gewaehlt)

Containerisierter Service mit LibreOffice + python-pptx + Claude Vision.

- Pro: LibreOffice im Container ausfuehrbar (pixelperfektes Rendering)
- Pro: Free Tier massiv: 360.000 GB-sec/Monat (~6.000-12.000 Analysen)
- Pro: Scale-to-Zero: Keine Kosten bei Inaktivitaet
- Pro: Docker-basiert: Self-Hosting trivial (eigene Cloud Run, lokaler Docker)
- Pro: Open Source: Dockerfile + app.py + Prompts offen
- Con: Cold Start 10-30s (grosses Image mit LibreOffice)
- Con: Docker-Image ~500 MB
- Con: Google Cloud Account noetig fuer Deployment

### Option 4: Modal/Hugging Face Spaces

Managed Compute-Plattformen mit GPU-Support.

- Pro: Modal: $30/mo Credits, einfaches Deployment
- Pro: HF Spaces: 16 GB RAM Free Tier
- Con: Modal: Credits laufen aus, dann kostenpflichtig
- Con: HF Spaces: Immer-an (kein Scale-to-Zero), 16 GB koennte knapp werden
- Con: Weniger Kontrolle als Cloud Run
- Con: Community-Self-Hosting schwieriger

### Option 5: SaaS mit Payment

Eigener Dienst mit Subscription-Modell.

- Pro: Nachhaltige Finanzierung
- Con: GmbH/UG-Gruendung noetig (Haftung, Steuern, Buerokratie)
- Con: Payment-Integration (Stripe etc.)
- Con: Widerspricht Open-Source-Philosophie
- Con: Massiver Overhead fuer ein Nischen-Feature

## Decision

**Option 3: Google Cloud Run mit Docker + BYOK**

### Architektur

```
obsilo.ai (GitHub Pages)              Google Cloud Run (Free Tier)
Bestehendes Hosting                   Dockerfile + app.py
┌────────────────────┐                ┌──────────────────────────┐
│                    │                │                          │
│ /template-analyzer │  POST /analyze │  analyze()               │
│                    ├───────────────→│  1. python-pptx: Shapes  │
│ - PPTX Upload      │                │  2. LibreOffice: Render  │
│ - API Key (BYOK)   │   Response     │  3. Spatial: Muster     │
│                    │←───────────────│  4. Claude Vision: Design│
│ - Download Result  │                │  5. Return SKILL.md      │
│                    │                │                          │
└────────────────────┘                └──────────────────────────┘

Services: 2 (GitHub Pages + Cloud Run)
Backend-Dateien: Dockerfile + app.py + requirements.txt
Deployment: gcloud run deploy
Kosten: $0
```

### BYOK Privacy Model

```
1. User gibt API Key im Browser ein
2. Browser sendet Key als HTTP Header (X-Api-Key) an Cloud Run
3. Cloud Run nutzt Key fuer genau einen Anthropic API Call
4. Key wird NICHT geloggt, NICHT gespeichert, NICHT gecached
5. Template-PPTX wird in-memory verarbeitet und nach Response verworfen
6. Kein persistenter Storage, kein Filesystem-Caching
```

### Kostenschutz

```bash
gcloud run deploy obsilo-template-analyzer \
  --max-instances=5 \        # Max 5 gleichzeitige Container (DDoS-Schutz)
  --concurrency=1 \          # 1 Request pro Container (CPU-intensiv)
  --memory=2Gi \             # 2 GB RAM (LibreOffice + python-pptx)
  --timeout=300              # 5 Min Timeout pro Request
```

- Free Tier: 360.000 GB-sec/Monat = ~6.000 Analysen (bei 60s/Analyse, 1 GB)
- Ohne Billing Account: Service stoppt automatisch wenn Free Tier aufgebraucht
- max-instances=5: Begrenzt gleichzeitige Container, verhindert DDoS-Kosten

### Analyse-Pipeline

| Schritt | Technologie | Deterministisch | Output |
|---------|-------------|-----------------|--------|
| 1. Shape-Extraktion | python-pptx | Ja | Shapes, Positionen, Geometrien, Text |
| 2. Slide-Rendering | LibreOffice headless | Ja | PNG pro Slide (pixelperfekt) |
| 3. Spatial Analysis | Python + Heuristik | Ja + Heuristik | Kompositionsmuster |
| 4. Theme-Extraktion | python-pptx | Ja | Brand-DNA (Farben, Fonts) |
| 5. Multimodale Analyse | Claude Vision (BYOK) | Nein (LLM) | Visual Design Language Document |

### Docker-Image

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

### Self-Hosting

```bash
# Lokal mit Docker
docker build -t obsilo-analyzer .
docker run -p 8080:8080 obsilo-analyzer

# Eigene Cloud Run Instanz
gcloud run deploy my-analyzer --source . --max-instances=5
```

**Begruendung der Entscheidung:**

Cloud Run ist die einzige Option die alle Entscheidungstreiber gleichzeitig erfuellt: LibreOffice ausfuehrbar (Rendering-Qualitaet), massiver Free Tier (Zero Cost), Scale-to-Zero (kein Leerlauf), Docker-basiert (Self-Hosting/Portabilitaet), kein proprietaeres SDK (Open Source). Die Alternativen scheitern jeweils an mindestens einem kritischen Treiber.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Pixelperfektes Slide-Rendering fuer multimodale Analyse
- custGeom-Shapes visuell erkennbar ("Swoosh", "Trichter", etc.)
- $0 Betriebskosten (Free Tier + Scale-to-Zero)
- Open Source: Community kann Service selbst hosten und Prompts verbessern
- Privacy: Keine User-Daten werden gespeichert

### Negative
- Cold Start 10-30s bei erstem Request nach Inaktivitaet
- Custom Fonts des Users nicht im Container (fonts-liberation als Fallback)
- Google Cloud Account noetig fuer initialen Deploy
- Docker-Image gross (~500 MB wegen LibreOffice)
- Abhaengigkeit von Anthropic API fuer Claude Vision

### Risks
- **Cold Start UX:** Mitigation durch Fortschrittsanzeige im Frontend ("Container wird gestartet...")
- **Free Tier erschoepft:** Mitigation durch max-instances=5 + Hinweis auf Self-Hosting
- **Prompt-Qualitaet:** Mitigation durch iterative Optimierung, Vergleich mit manuell erstellten Skills
- **CORS-Konfiguration:** Mitigation durch FastAPI CORSMiddleware mit Whitelist
- **File Upload Limit:** Cloud Run Default 32 MB (ausreichend fuer PPTX)

## Implementation Notes

- Neues Repository: `pssah4/obsilo-template-analyzer` (Apache 2.0)
- Backend: FastAPI + python-pptx + anthropic SDK + Pillow
- Frontend: Statische HTML-Seite auf obsilo.ai (FEAT-11-13)
- Output: Visual Design Language Document im Format von ADR-34
- In-Plugin bleibt als Fallback (FEAT-11-08) fuer Offline-Nutzung

## Related Decisions

- ADR-32: Template-basierte PPTX-Erzeugung (Engine-Schicht die den Skill konsumiert)
- ADR-34: Visual Design Language Document (Output-Format des Analyzers)
- ADR-09: Local Skills (SkillsManager-Integration fuer generierte Skills)
- ADR-24: Parsing-Library-Selection (JSZip fuer In-Plugin Fallback)

## References

- FEAT-11-12: Multimodaler Template-Analyzer (Cloud Run Backend)
- FEAT-11-13: Template-Analyzer Web-Frontend (obsilo.ai)
- _devprocess/analysis/TEMPLATE-DESIGN-INTELLIGENCE-ANALYSIS.md (vollstaendige Analyse)
