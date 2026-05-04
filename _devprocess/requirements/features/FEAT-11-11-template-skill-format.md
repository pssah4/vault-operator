# Feature: Visual Design Language Document (Skill-Format)

> **Feature ID**: FEAT-11-11
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: M (3-5 Tage)
> **Note**: **DEPRECATED** -- Visual Design Language Document durch formatSlideTypeGuide ersetzt (ADR-46/047)

## Feature Description

Spezifikation und Generator fuer Visual Design Language Documents -- das neue Skill-Format fuer Template-Skills. Statt eines mechanischen Element-Katalogs mit Shape-Name-Mapping enthaelt der generierte Skill eine semantische Design-Sprache: Was die visuellen Formen BEDEUTEN, welche Geschichten sie erzaehlen, und wann man sie einsetzt.

**Paradigmenwechsel**: Vom "hier sind die Shape-Namen, fuell sie aus" zum "hier ist das visuelle Vokabular dieses Templates, denke damit".

## Benefits Hypothesis

**Wir glauben dass** ein Visual Design Language Document als Skill-Format
**Folgende messbare Outcomes liefert:**
- Agent trifft bewusste Design-Entscheidungen basierend auf semantischer Bedeutung
- Agent nutzt die volle Breite der verfuegbaren visuellen Formen (>80% korrekt)
- Generierte Praesentationen haben erkennbare narrative Struktur

**Wir wissen dass wir erfolgreich sind wenn:**
- Generierter Skill wird vom SkillsManager erkannt und geladen
- Agent waehlt Slide-Typ basierend auf Inhalt UND semantischer Bedeutung
- Agent kann mit generiertem Skill mindestens 10 verschiedene Slide-Kompositionen korrekt nutzen
- Manuell erstellter EnBW-Skill vs. generierter Skill: vergleichbare Praesentations-Qualitaet

## User Stories

### Story 1: Template als Design-Sprache
**Als** Berater
**moechte ich** dass mein Template-Skill die Design-Logik meiner Vorlage beschreibt
**um** Praesentationen zu erhalten die mein Template intelligent nutzen statt mechanisch zu fuellen

### Story 2: Automatische Skill-Generierung
**Als** Wissensarbeiter
**moechte ich** einen generierten Skill der sofort funktioniert
**um** mein Template ohne manuelles Nacharbeiten nutzen zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Generierter Skill beschreibt semantische Bedeutung jeder visuellen Form | Alle content-bearing Kompositionen | Manuelle Pruefung |
| SC-02 | Skill enthaelt Einsatzregeln (wann nutzen / wann nicht) | Pro Komposition | Manuelle Pruefung |
| SC-03 | Skill wird automatisch erkannt und bei Praesentation-Erstellung geladen | 100% Trigger-Match | Automatisch testbar |
| SC-04 | Agent nutzt verschiedene Slide-Kompositionen des Templates | Mind. 10 verschiedene bei 20-Slide-Deck | Zaehlung |
| SC-05 | Skill bleibt unter der Groessenbeschraenkung | Unter definierten Limits | Automatisch messbar |

---

## Technical NFRs (fuer Architekt)

### Groessen-Constraint
- **Skill-Limit**: 16.000 Zeichen (SkillsManager-Limit in `SkillsManager.ts:134`)
- **Grosse Templates** (100+ Slides): Skill enthaelt die wichtigsten Kompositionen, fuer Details Verweis auf separate Vault-Datei

### Format
- **YAML-Frontmatter**: name, description, trigger, source: user, requiredTools
- **Markdown-Body**: Strukturiert in Sektionen (Brand-DNA, Vokabular, Kompositionen, Regeln, Mapping)

---

## Skill-Format: Visual Design Language Document

```markdown
---
name: {template-name}
description: {Template-Beschreibung} -- {N} Slides mit Corporate Design
trigger: {keywords}
source: user
requiredTools: [create_pptx, analyze_pptx_template]
---

# {Template-Name} -- Visual Design Language

## Brand-DNA
- Primary: {hex} ({Name})
- Accent: {hex}, {hex}, {hex}
- Heading Font: {Font-Name}
- Body Font: {Font-Name}
- Grundstimmung: {z.B. "professionell-zurueckhaltend", "dynamisch-modern"}

## Visuelles Vokabular

### Chevron-Kette (Slides {N}, {N}, ...)
**Bedeutung**: Linearer Fortschritt, Sequenz -- die Reihenfolge IST die Argumentation
**Wirkung**: Dynamik, Vorwaertsbewegung, Klarheit
**Einsetzen wenn**: Schritte, Phasen, Prozess-Stufen, Timeline
**Nicht einsetzen wenn**: Nicht-lineare Ablaeufe, Zyklen, Gleichwertiges
**Kapazitaet**: {N} Chevrons a max {N} Worte, Beschreibung darunter max {N} Worte
**Shape-Mapping**: {"Pfeil: Fuenfeck {N}": "Schritt-Titel", "TextBox {N}": "Beschreibung"}

### KPI-Dashboard (Slides {N}, {N}, ...)
**Bedeutung**: Beweis durch Zahl -- die Metrik allein traegt die Aussage
**Wirkung**: Autoritaet, Objektivitaet, Dringlichkeit
**Einsetzen wenn**: 2-6 Kennzahlen die eine These belegen
**Nicht einsetzen wenn**: Qualitative Aussagen, mehr als 6 Metriken
**Kapazitaet**: {N} KPI-Karten, Wert max {N} Zeichen, Label max {N} Worte
**Shape-Mapping**: {"TextBox {N}": "KPI-Wert 1", "TextBox {N}": "KPI-Label 1", ...}

### [weitere Kompositionen...]

## Kompositionen nach Narrativ-Phase

| Narrativ-Phase | Empfohlene Kompositionen | Begruendung |
|----------------|--------------------------|-------------|
| Situation/Kontext | KPI-Dashboard, Content | Fakten etablieren |
| Complication/Problem | Vergleich, Matrix | Spannung aufbauen |
| Loesung/Resolution | Prozessflow, Pyramide | Weg aufzeigen |
| Beweis/Evidence | KPI, Chart, Tabelle | Belegen |
| Ausblick/CTA | Timeline, Content | Handlung ausloesen |

## Design-Regeln
- Max {N} Worte pro Chevron-Titel
- Slide {N} (Titelfolie) und Slide {N} (Schlussfolie) nicht fuer Content verwenden
- Nie zwei KPI-Slides hintereinander
- Section-Divider (Slide {N}) zwischen Hauptthemen setzen
- {weitere template-spezifische Regeln}
```

### Unterschied zum alten Format

| Aspekt | Alt (Element-Katalog) | Neu (Visual Design Language) |
|--------|----------------------|------------------------------|
| Fokus | Shape-Name-Mapping | Semantische Bedeutung + Mapping |
| Agent-Verhalten | Fuellt Felder aus | Trifft Design-Entscheidungen |
| Einsatzregeln | Keine | Pro Komposition: wann / wann nicht |
| Narrative Zuordnung | Keine | Kompositionen nach Narrativ-Phase |
| Textkapazitaet | Nur maxChars | Worte, Zeilen, kontextbezogen |
| Emotionale Wirkung | Keine | Pro Komposition beschrieben |

### Generator-Logik

Der Generator wird an zwei Stellen implementiert:

1. **Cloud Run Backend** (FEAT-11-12): Claude Vision generiert das Dokument multimodal aus Bildern + Daten
2. **In-Plugin Fallback** (FEAT-11-08): Deterministischer Generator aus PptxTemplateAnalyzer-Output

Beide muessen das gleiche Skill-Format produzieren. Der Cloud-Run-Generator liefert hoehere Qualitaet (visuelles Verstaendnis, custGeom-Erkennung, emotionale Wirkung).

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1: 16k-Zeichen-Limit**
- **Warum ASR**: SkillsManager laedt Skills nur bis 16k Zeichen. Ueberschreitung = Skill wird nicht geladen.
- **Impact**: Erfordert kompaktes Format. Bei grossen Templates (100+ Slides) muss priorisiert werden.
- **Quality Attribute**: Reliability

**MODERATE ASR #2: Maschinenlesbare Shape-Mappings**
- **Warum ASR**: PptxTemplateCloner benoetigt exakte Shape-Namen als Keys. Format-Fehler = Inhalt wird nicht ersetzt.
- **Impact**: Shape-Mapping muss konsistent parsebar sein, auch wenn der Rest "prosa-artig" ist.
- **Quality Attribute**: Correctness

### Open Questions fuer Architekt
- Soll der Skill ein separates JSON-Block fuer Shape-Mappings enthalten (maschinenlesbar) oder inline im Markdown?
- Wie validieren wir, dass ein generierter Skill tatsaechlich bessere Praesentationen produziert als der alte Katalog-Stil?

---

## Definition of Done

### Functional
- [ ] Visual Design Language Format spezifiziert und dokumentiert
- [ ] Generator formatiert Analyse-Output im neuen Format (Cloud Run + In-Plugin)
- [ ] Generierter Skill enthaelt: Brand-DNA, Vokabular mit Bedeutung, Kompositionen nach Narrativ-Phase, Design-Regeln, Shape-Mappings
- [ ] Skill bleibt unter 16k Zeichen
- [ ] SkillsManager laedt generierten Skill korrekt
- [ ] Trigger-Matching funktioniert

### Quality
- [ ] Agent nutzt semantische Bedeutung bei Slide-Planung (beobachtbar)
- [ ] Agent nutzt >80% der verfuegbaren Kompositionen korrekt
- [ ] Vergleichstest: generierter Skill vs. manuell erstellter Skill

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-11-08**: In-Plugin Analyzer liefert strukturierte Daten
- **FEAT-11-12**: Cloud Run Analyzer liefert multimodale Analyse
- **SkillsManager**: Muss User-Skills laden koennen (bereits implementiert)
- **PptxTemplateCloner**: Muss Shape-Name-Keys aus dem Skill verarbeiten (FEAT-11-10, implementiert)

## Out of Scope

- Skill-Editor im Plugin (manuelles Nacharbeiten)
- Automatische Validierung ob Skill korrekt ist
- Versionierung von Template-Skills
