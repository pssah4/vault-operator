---
id: ADR-103
title: Source-Position-Marker und PDF-Strategie
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-28
  - FEAT-19-29
---

# ADR-103: Source-Position-Marker und PDF-Strategie

## Context

Source-Position-Marker (FEAT-19-28) machen Provenienz pro Take-Away klickbar. PDF-Strategie (FEAT-19-29) entscheidet, ob PDFs als Originale mit Page-Refs bleiben oder zusaetzlich zu Markdown gespiegelt werden. Beide Themen sind eng verflochten: Block-Reference-Konvention plus Cross-Plattform-Verfuegbarkeit (Desktop, Mobile).

## Decision Drivers

- Klickbarkeit auf Obsidian Desktop UND Mobile (BA-25 H-21)
- Idempotenz der Block-IDs (deterministisch)
- PDF-Layout-Erhalt (Grafiken, Bilder)
- Retrieval-Granularitaet

## Considered Options

### Block-Reference-Konvention

**A1: System-generated `^block-N`** (deterministisch, sequentiell)
- Pros: einfach, idempotent, kein LLM-Call.
- Cons: nicht sprechend.

**A2: LLM-sprechende-IDs** (`^takeaway-bias-detection`)
- Pros: sprechend.
- Cons: nicht idempotent, LLM kann verschiedene IDs fuer dieselbe Source generieren, Tokens-Kosten.

### PDF-Strategie

**B1: Page-Refs Default, Markdown-Mirror opt-in**
- Pros: konservativ, kein Konvertierungs-Overhead, PDF mit Bildern bleibt erste Quelle.
- Cons: Page-Granularitaet statt Absatz.

**B2: Markdown-Mirror Default, PDF als Backup**
- Pros: Block-Granularitaet sofort.
- Cons: Konvertierungs-Aufwand fuer alle PDFs, auch grafik-lastige.

## Decision

**Block-Reference-Konvention: A1 System-generated `^block-N`** (sequentiell pro Source-Note, beginnend mit `^block-1`).

Begruendung:
- Idempotenz hat Prioritaet: dieselbe Source mehrmals processed = dieselben Block-IDs.
- Sprechende IDs nicht noetig fuer Maschine-Lesbarkeit.
- Token-frei.

**PDF-Strategie: B1 Page-Refs Default, Markdown-Mirror als opt-in pro Setting `vaultIngest.pdfStrategy`**.

Begruendung:
- BA-25 H-22: Page-Refs reichen fuer > 70% der Sebastians-Quellen. Konservativer Default.
- Markdown-Mirror als opt-in fuer text-lastige Forschungs-PDFs.
- Bestehende parsePdf-Pipeline laeuft im Hintergrund fuer Embedding (nicht aendern).

**Cross-Plattform-Verfuegbarkeit:**
- Markdown-Block-Refs `[[file#^block-N]]` sind Obsidian-Native, funktionieren Desktop UND Mobile.
- PDF-Page-Refs `[[file.pdf#page=N]]` sind Obsidian-Native, funktionieren auf Desktop UND iOS/iPadOS. Android: zu pruefen in Coding-Phase (offene Plattform-Frage).
- Bei nicht-unterstuetzter Plattform: Fallback auf Quote-Block mit Excerpt plus Note-Wikilink (kein Page-Marker).

## Consequences

### Positive
- Idempotente Re-Processing.
- PDFs mit Grafiken bleiben unangetastet.
- Default-Pfad ohne Konvertierungs-Overhead.

### Negative
- Page-Refs haben groebere Granularitaet als Block-Refs. Mitigation: User kann pro PDF auf Markdown-Mirror umschalten.
- Block-IDs sind nicht-sprechend, fuer Mensch lesbar nur ueber Excerpt im Hover.

### Risks
- Wenn Source-Note umsortiert wird (User editiert), bleiben Block-IDs an alten Positionen. Folge: Wikilinks zeigen auf falsche Stellen. Mitigation: System touched Source-Notes nicht nach initialem Schreiben.

## Implementation Notes

Block-ID-Setter (Helper):
- Input: Source-Markdown plus Take-Away-Liste mit Original-Positionen.
- Output: Modified-Markdown mit `^block-N`-IDs am Ende der relevanten Bloecke.
- Idempotent: vorhandene `^block-N`-IDs werden nicht ueberschrieben.

PDF-Strategie-Switch:
- `vaultIngest.pdfStrategy: 'page-refs' | 'markdown-mirror'`, default `page-refs`.
- Bei `markdown-mirror`: parseDocument(pdf) -> Markdown-Mirror-Note neben PDF, Block-IDs gesetzt, Wikilink in Frontmatter zur Original-PDF.

URL-Sources (Anchor-Strategie):
- Wenn HTML Section-IDs hat: `[[source-note#section-id]]`.
- Sonst: Inline-Quote-Block mit Original-Wortlaut plus Wikilink zur Source-Note.

Mobile-Plattform-Pruefung steht in Coding-Phase, ggf als FIX-Eintrag wenn Android-Probleme zeigt.

---

## Amendment 2026-05-07: Marker-Form und Skill-Layer-Ownership

Im Rahmen der Issue-#11-Bearbeitung (FIX-19-28-01) hat sich gezeigt:
die in FEAT-19-28 Story 2 spezifizierte Perplexity-Stil-Renderung
("[1]", "[2]" mit Hover-Excerpt) ist fuer User nicht der gewuenschte
visuelle Stil. Die Marker-Form ist eine User-Experience-Entscheidung,
keine reine Persistenz-Entscheidung.

### Aenderung

Die **Marker-Form** wird vom Skill-Layer entschieden, nicht im
Tool-Layer. Tools (`ingest_document`, `ingest_deep`) emittieren
weiterhin Wikilinks im Obsidian-Native-Format
(`[[file#^block-N]]` bzw `[[file.pdf#page=N]]`); die Renderung als
sichtbarer Marker wird durch die Skill-Anleitung gesteuert.

**Default-Marker-Form (gemaess FEAT-19-31 Skill-Suite):**

```
... letzter Satz der Aussage. [[source#^block-N|↗]]
```

- `↗` als reines Symbol ist Display-Text, kein "Quelle:", kein "[1]".
- Inline am Satzende, ein Leerzeichen vor dem Link.
- Eine Block-Ref pro Kernaussage, nicht pro Satz.

Skill-Drafts der Suite spezifizieren die Marker-Form als verbindliche
Output-Konvention.

### Was bleibt

- **Block-IDs** weiterhin System-generated `^block-N` (idempotent,
  Token-frei). User-Skill-Anleitungen koennen die Form `^kebab-id`
  nicht erzwingen, weil sie nicht-idempotent waeren -- Re-Ingest
  derselben Source wuerde unterschiedliche IDs produzieren.
- **PDF-Strategie** B1 (`page-refs` Default, `markdown-mirror`
  opt-in) bleibt im Tool-Layer.
- **Skill-Layer-Override:** das `/ingest-deep` Skill setzt
  `pdfStrategy: 'markdown-mirror'` als Pflicht-Override fuer den
  Karpathy-Pfad. Das ist eine Skill-Konvention und revidiert nicht
  den Default des Tool-Layers fuer andere Caller.

### Konsequenzen

- FEAT-19-28 Story 2 ("[1]"-Marker-Renderung) gilt als **abgeloest**
  durch FEAT-19-31 Skill-Suite.
- FIX-19-28-01 muss die `↗`-Marker-Form als Akzeptanzkriterium tragen
  (AC-08), nicht den Perplexity-Stil.
- Der Tool-Output bleibt strukturierter Wikilink, das Skill rendert
  daraus den `↗`-Display.
