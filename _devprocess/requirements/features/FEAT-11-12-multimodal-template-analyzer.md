# Feature: Multimodaler Template-Analyzer (Cloud Run Backend)

> **Feature ID**: FEAT-11-12
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: L (1-2 Wochen)
> **Note**: **DEPRECATED** -- Cloud Run nie implementiert, durch lokales IngestTemplateTool ersetzt

## Feature Description

Externer Web-Service der PPTX-Templates multimodal analysiert: Deterministische Shape-Extraktion (python-pptx) + pixelperfektes Slide-Rendering (LibreOffice headless) + Spatial Analysis + multimodale LLM-Analyse (Claude Vision mit Bildern + strukturierten Daten). Erzeugt ein Visual Design Language Document (FEAT-11-11) von hoechster Qualitaet.

**Warum extern statt im Plugin?** LibreOffice ist nicht in Electron ausfuehrbar. Gerenderte Bilder sind fuer die multimodale Analyse essentiell -- nur mit Bildern kann Claude Vision custGeom-Shapes erkennen ("Swoosh", "Trichter"), Gesamtwirkung bewerten und emotionale Bedeutung zuordnen. Die Kombination aus exakten Daten + visueller Wahrnehmung liefert zuverlaessige semantische Analyse.

**Architektur-Entscheidung**: BYOK-only (Bring Your Own Key), Open Source (Apache 2.0), Zero laufende Kosten, Google Cloud Run Free Tier, kein persistenter Storage.

## Benefits Hypothesis

**Wir glauben dass** ein multimodaler Template-Analyzer
**Folgende messbare Outcomes liefert:**
- Jedes PPTX-Template wird in eine vollstaendige semantische Design-Sprache uebersetzt
- custGeom-Shapes (Custom-Geometrien) werden visuell erkannt und korrekt interpretiert
- Emotionale Wirkung und narrative Funktion jeder Komposition werden erfasst

**Wir wissen dass wir erfolgreich sind wenn:**
- Generiertes Visual Design Language Document ist qualitativ vergleichbar mit manuell erstelltem Skill
- Agent nutzt >80% der verfuegbaren visuellen Formen korrekt
- Analyse dauert unter 5 Minuten (inkl. Rendering und LLM-Call)
- Cloud Run Service laeuft stabil im Free Tier ($0 Kosten)

## User Stories

### Story 1: Template vollstaendig verstehen
**Als** Berater mit komplexem Corporate-Template
**moechte ich** dass mein Template visuell analysiert wird
**um** einen Skill zu erhalten der die Design-Logik meiner Vorlage vollstaendig versteht

### Story 2: Eigenen API Key nutzen
**Als** datenschutzbewusster User
**moechte ich** meinen eigenen Anthropic API Key verwenden
**um** keine Drittanbieter-Accounts oder Abonnements zu benoetigen

### Story 3: Self-Hosting
**Als** IT-Team eines Unternehmens
**moechte ich** den Analyzer selbst hosten koennen
**um** Template-Daten nicht ueber externe Server senden zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Beliebige Vorlagen werden in semantische Design-Sprache uebersetzt | Funktioniert mit 5+ verschiedenen Corporate-Templates | Test mit realen Vorlagen |
| SC-02 | Individuelle Formen werden visuell erkannt und korrekt benannt | custGeom-Shapes identifiziert | Manuelle Pruefung gegen Vorlage |
| SC-03 | Ergebnis enthaelt Bedeutung, Wirkung und Einsatzregeln pro visueller Form | Alle content-bearing Kompositionen | Manuelle Pruefung |
| SC-04 | Analyse in akzeptabler Zeit abgeschlossen | Unter 5 Minuten | Zeitmessung |
| SC-05 | Keine laufenden Kosten fuer den Betreiber | Betriebskosten gleich Null | Billing-Pruefung |
| SC-06 | Template-Daten werden nicht gespeichert | Daten nach Verarbeitung verworfen | Code-Review |
| SC-07 | Service kann eigenstaendig gehostet werden | Dokumentierte Self-Hosting-Anleitung | Funktionstest |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Analyse-Dauer**: <5 Min fuer 108-Slide Template (inkl. Rendering + LLM-Call)
- **Cold Start**: <30s (Docker-Image mit LibreOffice ist ~500MB)
- **Concurrency**: 1 Request pro Container-Instanz (CPU-intensives Rendering)

### Security / Privacy
- **BYOK**: User API Key wird nur fuer den einen Request verwendet, nie gespeichert
- **No Persistence**: Kein persistenter Storage, Daten in-memory verarbeitet und verworfen
- **No Auth**: Kein Account, keine Registrierung, keine User-Daten
- **CORS**: Nur pssah4.github.io/vault-operator Origin erlaubt

### Scalability / Cost
- **Cloud Run Free Tier**: 360.000 GB-Sekunden/Monat (~6.000-12.000 Analysen)
- **Max Instances**: 5 (Kostenschutz gegen DDoS)
- **Scale to Zero**: Kein Container laeuft bei Inaktivitaet

### Availability
- **Best Effort**: Kein SLA, Community-Service
- **Self-Hosting**: Jeder kann eigene Instanz deployen

---

## Analyse-Pipeline

```
Template.pptx (Upload)
         |
    [1. python-pptx] ← deterministisch
    Shapes: Position, Groesse, Geometrie, Farbe, Text, Gruppen, Connectors
         |
    [2. LibreOffice headless] ← deterministisch
    PNG-Bilder aller Slides (pixelperfekt, inkl. Custom Fonts/Effekte)
         |
    [3. Spatial Analyzer] ← deterministisch + Heuristik
    Kompositionsmuster: Sequenzen, Grids, Radial, Hierarchien, Paarungen
         |
    [4. Theme-Extraktor] ← deterministisch
    Brand-DNA: Farben, Fonts, Linien aus theme1.xml
         |
    [5. Claude Vision] ← multimodal (User's BYOK API Key)
    Input: Slide-Bilder + strukturierte Daten + Kompositionsmuster + Brand-DNA
    Output: Visual Design Language Document (SKILL.md)
```

### Warum multimodal (Bilder + Daten)?

| Nur Daten | Nur Bilder | Beides zusammen |
|-----------|-----------|-----------------|
| custGeom unverstaendlich (arbitrary paths) | Keine exakten Positionen/Groessen | Exakte Daten + visuelles Verstaendnis |
| Keine Gesamtwirkung sichtbar | Position Halluzination moeglich | custGeom als "Swoosh"/"Trichter" erkannt |
| Decorative vs. funktional schwer unterscheidbar | Keine Shape-Namen verfuegbar | Zuverlaessige semantische Analyse |

### LLM-Prompt (Kern)

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

Max 16.000 Zeichen. Formatiere als Vault Operator-Skill mit YAML-Frontmatter.
```

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1: BYOK-Only Privacy**
- **Warum ASR**: User API Keys duerfen nie gespeichert werden. Template-Daten duerfen nicht persistiert werden. Architektur muss stateless sein.
- **Impact**: Kein persistenter Storage, kein User-Management, kein Session-State. Jeder Request ist atomar.
- **Quality Attribute**: Security, Privacy

**CRITICAL ASR #2: Zero-Cost-Betrieb**
- **Warum ASR**: Kein Business-Modell, keine GmbH/UG, kein Payment. Service muss im Free Tier laufen.
- **Impact**: Scale-to-Zero zwingend, max-instances begrenzt, kein always-on Background-Prozess.
- **Quality Attribute**: Cost Efficiency

**MODERATE ASR #3: Self-Hosting-Faehigkeit**
- **Warum ASR**: Enterprises muessen den Service intern deployen koennen. Open Source mit Dockerfile + Anleitung.
- **Impact**: Standard-Docker, keine proprietaeren SDKs, kein Cloud-Lock-in.
- **Quality Attribute**: Portability

### Constraints
- **Open Source**: Apache 2.0, kein privates Repo
- **Plattform**: Google Cloud Run (Free Tier)
- **Container-Image**: Python 3.12 + LibreOffice Impress + python-pptx + anthropic SDK
- **File Upload Limit**: 32 MB (Cloud Run Default, ausreichend fuer PPTX)

### Open Questions fuer Architekt
- Soll der Service SSE (Server-Sent Events) fuer Fortschritt nutzen oder reicht ein synchroner Response?
- Wie wird die Prompt-Qualitaet iterativ validiert und verbessert?
- Soll ein Health-Check-Endpoint fuer Monitoring existieren?

---

## Projekt-Struktur

```
pssah4/vault-operator-template-analyzer      ← Neues Repo, Apache 2.0
  ├── Dockerfile
  ├── app.py                         ← FastAPI/Flask Analyse-Pipeline
  ├── requirements.txt
  ├── README.md                      ← Self-Hosting Anleitung
  ├── cloudbuild.yaml               ← Optional, fuer gcloud deploy
  └── tests/
```

---

## Definition of Done

### Functional
- [ ] Python-Backend analysiert beliebige PPTX-Templates multimodal
- [ ] LibreOffice headless rendert Slides als PNG
- [ ] python-pptx extrahiert Shapes, Positionen, Geometrien
- [ ] Spatial Analysis erkennt Kompositionsmuster
- [ ] Brand-DNA aus theme1.xml extrahiert
- [ ] Claude Vision generiert Visual Design Language Document
- [ ] Output im SKILL.md Format (FEAT-11-11)
- [ ] Output unter 16k Zeichen
- [ ] POST /analyze Endpoint funktional

### Quality
- [ ] BYOK: API Key nie gespeichert, nur fuer einen Request verwendet
- [ ] No Persistence: Template-Daten nach Response verworfen
- [ ] CORS: Nur pssah4.github.io/vault-operator Origin
- [ ] max-instances=5 als Kostenschutz
- [ ] Error Handling: Korrupte PPTX, ungueltige API Keys, Timeout

### Deployment
- [ ] Docker-Image baut und laeuft lokal
- [ ] gcloud run deploy erfolgreich
- [ ] Free Tier validiert ($0 Kosten)
- [ ] Self-Hosting Anleitung im README

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-11-11**: Visual Design Language Document Format (definiert Output-Format)
- **Google Cloud Run**: Free Tier Account
- **LibreOffice**: Im Docker-Container
- **python-pptx**: Python-Bibliothek fuer OOXML
- **Anthropic API**: Claude Vision (via User's BYOK Key)

## Out of Scope

- Payment/Billing fuer API-Nutzung
- User-Accounts oder Registrierung
- Template-Speicherung oder -Caching
- Batch-Analyse mehrerer Templates
- Eigene LLM-Modelle (nur Anthropic Claude)
- In-Plugin-Integration (das ist FEAT-11-08)
