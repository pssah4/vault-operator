# ADR-34: Visual Design Language Document als Skill-Format

**Superseded by:** ADR-46 (formatSlideTypeGuide) → ADR-47 (+ JSON-Beispiele pro Slide-Typ)
**Deprecated:** 2026-03-22 (nie implementiert)
**Date:** 2026-03-13
**Deciders:** Sebastian Hanke

> ### Lesson Learned
> Das Dilemma "semantisch reich + technisch praezise + kompakt" ist real. Die Loesung war aber
> nicht ein komplexes Hybrid-Format (Bedeutung + Wirkung + Einsatzregeln + Shape-Mapping),
> sondern ein einfacher Markdown-Guide mit kopierfertigen JSON-Beispielen (ADR-47).
> Die "Design-Intelligenz" kommt aus dem presentation-design Skill, nicht aus dem Template-Skill.
> **Erkenntnis:** Trennung: Design-Wissen im Skill, Template-Struktur im Guide, Constraints im Tool.

## Context

EPIC-11 hat das Problem identifiziert, dass der bisherige Template-Skill-Ansatz (Element-Katalog mit Shape-Name-Mapping) das LLM auf einen Key-Value-Mapper reduziert. Der generierte Skill sagt: "Slide 23 hat ShapeX, ShapeY, ShapeZ -- fuell sie aus." Das LLM weiss nicht WARUM es diese Shapes nutzen soll, welche Geschichte sie erzaehlen, oder wann eine andere Komposition besser waere.

**Das Dilemma:** Template-Skills muessen gleichzeitig:
1. **Semantisch reich** sein (Bedeutung, Wirkung, Einsatzregeln) -- damit das LLM Design-Entscheidungen treffen kann
2. **Technisch praezise** sein (Shape-Namen, Slide-Nummern) -- damit PptxTemplateCloner die Inhalte korrekt einsetzt
3. **Kompakt** sein (<16.000 Zeichen) -- damit der SkillsManager den Skill vollstaendig laedt

**Triggering ASR:**
- CRITICAL ASR: 16k-Zeichen-Limit (SkillsManager.ts:134)
- MODERATE ASR: Maschinenlesbare Shape-Mappings (PptxTemplateCloner benoetigt exakte Shape-Namen)
- Quality Attributes: Reliability (Skill wird geladen), Correctness (Shapes werden ersetzt), Usability (Agent trifft gute Entscheidungen)

## Decision Drivers

- **Design-Intelligenz:** LLM muss verstehen warum eine visuelle Form die richtige Wahl ist
- **16k-Limit:** SkillsManager-Hard-Limit, Ueberschreitung = Skill wird nicht geladen
- **Shape-Name-Praezision:** PptxTemplateCloner (S0-Strategie) braucht exakte Shape-Namen als Keys
- **Generator-Kompatibilitaet:** Format muss von Cloud Run Backend (Claude Vision) UND In-Plugin Fallback (deterministisch) erzeugbar sein
- **Bestehende Integration:** SkillsManager, office-workflow Skill, presentation-design Skill muessen damit arbeiten

## Considered Options

### Option 1: Element-Katalog mit Shape-Name-Tabelle (Status Quo)

Tabellarisches Format mit Element-IDs, Geometrien, und Shape-Name-Mappings pro Slide.

```markdown
## Element-Katalog
| ID | Name | Geometrie | Geeignet fuer |
| E-001 | Chevron | prstGeom:chevron | Prozessschritte |

## Slide 23: KPI-Dashboard
- "TextBox 5" -> KPI-Wert 1
- "TextBox 6" -> KPI-Label 1
```

- Pro: Kompakt, maschinenlesbar
- Pro: Einfach deterministisch zu generieren
- Con: Kein semantisches Verstaendnis -- Agent fuellt Felder aus, trifft keine Design-Entscheidungen
- Con: Keine Einsatzregeln (wann nutzen / wann nicht)
- Con: Keine narrative Zuordnung (welche Komposition in welcher Praesentationsphase)
- Con: Keine Textkapazitaets-Richtlinien (wie viele Worte passen in einen Chevron)

### Option 2: Rein prosaisches Design-Dokument (ohne Shape-Mapping)

Natuerlicher Text der die Design-Sprache beschreibt, ohne technische Mappings.

```markdown
## Chevron-Kette
Kommuniziert linearen Fortschritt. Die Reihenfolge IST die Argumentation.
Einsetzen bei: Prozess-Schritten, Phasen, Pipelines.
Nicht einsetzen bei: Zyklen, Gleichwertigem.
```

- Pro: Maximales semantisches Verstaendnis
- Pro: Agent kann Design-Reasoning betreiben
- Con: **Keine Shape-Namen** -- PptxTemplateCloner kann nichts ersetzen
- Con: Agent muss raten welcher Slide welche Komposition ist
- Con: Keine technische Verankerung

### Option 3: Visual Design Language Document (gewaehlt)

Hybrides Format: Semantische Beschreibungen MIT eingebetteten Shape-Mappings. Organisiert nach Kompositionen (nicht nach Slides), mit Bedeutung, Wirkung, Einsatzregeln und technischem Mapping pro Komposition.

```markdown
### Chevron-Kette (Slides 42, 63, 87)
**Bedeutung**: Linearer Fortschritt -- Reihenfolge IST Argumentation
**Wirkung**: Dynamik, Vorwaertsbewegung
**Einsetzen wenn**: Schritte, Phasen, Pipeline
**Nicht einsetzen wenn**: Zyklen, Gleichwertiges
**Kapazitaet**: 5 Chevrons a max 3 Worte, Beschreibung max 15 Worte
**Shape-Mapping**: {"Pfeil: Fuenfeck 18": "Schritt 1", "TextBox 42": "Beschreibung 1", ...}
```

- Pro: Semantisch reich UND technisch praezise
- Pro: Agent versteht Bedeutung UND kann korrekte Shape-Namen liefern
- Pro: Organisiert nach Kompositionen -- Agent denkt in visuellen Formen, nicht in Slide-Nummern
- Pro: Einsatzregeln verhindern falsche Kompositionswahl
- Pro: Textkapazitaet verhindert Text-Overflow
- Con: Mehr Zeichen pro Komposition (Platzbedarf)
- Con: Bei grossen Templates (100+ Slides) muss priorisiert werden

## Decision

**Option 3: Visual Design Language Document**

### Format-Spezifikation

```markdown
---
name: {template-name}
description: {Beschreibung} -- {N} Slides
trigger: {keywords}
source: user
requiredTools: [create_pptx]
---

# {Template-Name} -- Visual Design Language

## Brand-DNA
- Primary: {hex} ({Name})
- Accent: {hex}, {hex}, {hex}
- Heading Font: {Font}
- Body Font: {Font}
- Grundstimmung: {z.B. "professionell-zurueckhaltend"}

## Visuelles Vokabular

### {Kompositions-Name} (Slides {N}, {N}, ...)
**Bedeutung**: {Was kommuniziert diese visuelle Form?}
**Wirkung**: {Emotionale/kognitive Wirkung auf das Publikum}
**Einsetzen wenn**: {Welcher Inhaltstyp passt?}
**Nicht einsetzen wenn**: {Gegenindikation}
**Kapazitaet**: {Textmengen-Richtlinien}
**Shape-Mapping**: {JSON-Objekt mit Shape-Name -> Zweck}

[... weitere Kompositionen ...]

## Kompositionen nach Narrativ-Phase

| Phase | Empfohlene Kompositionen | Begruendung |
|-------|--------------------------|-------------|
| Situation | KPI, Content | Fakten etablieren |
| Complication | Vergleich, Matrix | Spannung aufbauen |
| Resolution | Prozess, Pyramide | Weg aufzeigen |

## Design-Regeln
- {Template-spezifische Constraints}
```

### Design-Entscheidungen im Format

**1. Organisiert nach Kompositionen, nicht nach Slides**

Der Agent denkt in visuellen Formen ("Ich brauche einen Prozessflow"), nicht in Slide-Nummern ("Ich brauche Slide 63"). Kompositionen mit gleicher Funktion (z.B. zwei verschiedene Chevron-Slides) werden unter einer Komposition gruppiert mit Angabe der Slide-Nummern.

**2. Bedeutung + Wirkung + Einsatzregeln = Design-Reasoning**

Jede Komposition beschreibt nicht nur WAS sie ist, sondern WARUM und WANN. Das versetzt das LLM in die Lage, vom Inhalt zur passenden visuellen Form zu denken: "Mein Inhalt beschreibt einen 5-Stufen-Prozess -> Chevron-Kette kommuniziert linearen Fortschritt -> passt."

**3. Shape-Mapping inline statt separater Tabelle**

Shape-Namen sind direkt bei der Komposition, nicht in einer separaten Referenz-Tabelle. Das reduziert den Kontextwechsel fuer das LLM: Es liest die Bedeutung und hat sofort die technischen Keys zur Hand.

**4. Narrativ-Phasen-Zuordnung**

Die Tabelle "Kompositionen nach Narrativ-Phase" verbindet visuelle Formen mit Storytelling-Frameworks (SCQA, Sparkline, etc.) aus dem presentation-design Skill. Das ermoeglicht: "Ich bin in der Complication-Phase -> Vergleichs-Komposition waehlen."

**5. 16k-Limit-Strategie**

Bei grossen Templates (100+ Slides):
- Nur content-bearing Kompositionen (keine dekorativen)
- Aehnliche Slides (3x Chevron-Variante) unter einer Komposition zusammenfassen
- Decorative Elemente als einzeilige Zusammenfassung
- Optionaler Verweis auf separate Vault-Datei fuer Details

**Begruendung der Entscheidung:**

Option 1 (Status Quo) produziert mechanisches Feld-Fuellen. Option 2 verliert die technische Praezision. Option 3 vereint beides: Das LLM versteht die Design-Logik UND hat die technischen Informationen fuer korrekte Umsetzung. Der Mehraufwand an Zeichen pro Komposition wird durch Gruppierung und Priorisierung kompensiert.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Agent trifft bewusste Design-Entscheidungen basierend auf semantischer Bedeutung
- Shape-Name-Matching (S0) funktioniert weiterhin korrekt (Shape-Namen im Mapping)
- Einsatzregeln verhindern falsche Kompositionswahl
- Textkapazitaets-Richtlinien verhindern Ueberlauf
- Format ist von beiden Generatoren (Cloud Run + In-Plugin) erzeugbar
- Narrativ-Phasen integrieren mit Storytelling-Frameworks aus presentation-design Skill

### Negative
- Mehr Zeichen pro Komposition als reines Tabellen-Format (Platzbedarf)
- Bei >50 einzigartigen Kompositionen kann 16k-Limit eng werden
- Qualitaet haengt vom Generator ab (Cloud Run >> In-Plugin fuer semantische Tiefe)
- Kein maschinenlesbares Standard-Format (weder JSON-Schema noch YAML) -- Skill wird vom LLM "gelesen", nicht geparst

### Risks
- **16k-Limit bei grossen Templates:** Mitigation durch Priorisierung, Gruppierung, optionale Detail-Datei
- **Shape-Name-Parsing durch LLM:** Mitigation durch konsistentes JSON-Format im Mapping-Feld
- **Generierter Skill zu generisch:** Mitigation durch iterative Prompt-Optimierung, Vergleich mit manuellen Skills
- **Inkompatibilitaet mit SkillsManager:** Mitigation -- YAML-Frontmatter bleibt identisch, nur Body aendert sich

## Implementation Notes

- Generator in Cloud Run Backend: Claude Vision erzeugt das Dokument direkt (multimodal)
- Generator In-Plugin: `AnalyzePptxTemplateTool.ts` formatiert PptxTemplateAnalyzer-Output im neuen Format
- SkillsManager: Keine Aenderung noetig (liest YAML-Frontmatter, Body geht an LLM-Prompt)
- office-workflow Skill: Referenziert Template-Skill fuer Brand-DNA und Kompositionswahl
- presentation-design Skill: Universelle Prinzipien als Basis, Template-Skill als Erweiterung

## Related Decisions

- ADR-32: Template-basierte PPTX-Erzeugung (Engine die Shape-Namen aus dem Skill konsumiert)
- ADR-33: Multimodaler Template-Analyzer (primaerer Generator fuer dieses Format)
- ADR-29: Input-Schema-Design (Slide-Spezifikation mit template_slide + content)
- ADR-09: Local Skills (SkillsManager-Integration)

## References

- FEAT-11-11: Visual Design Language Document (Skill-Format)
- FEAT-11-05: Universelle Design-Prinzipien
- SkillsManager.ts:134 (16k-Zeichen-Limit)
- _devprocess/analysis/TEMPLATE-DESIGN-INTELLIGENCE-ANALYSIS.md (Design-Theorie-Grundlage)
