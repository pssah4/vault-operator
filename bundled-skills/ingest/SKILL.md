---
name: ingest
description: Quick single-pass ingest of a source (PDF/Markdown/URL/DOCX/PPTX/XLSX) into one note (frontmatter + overview + key points + original text). PDFs stay page-refs (no mirror enforcement). Block-refs to the source rendered as a discreet ↗ symbol per key point. No multi-turn dialog.
trigger: schneller.*ingest|quick.*ingest|inbox.*aufnahme|webclip.*ingest|aufnehmen.*note|integriere.note
source: bundled
requiredTools: [ingest_document, read_file, read_document]
---

# /ingest -- Schneller Single-Pass-Ingest

## Wann nutzen

Fuer Quellen die nicht den Karpathy-Multi-Turn-Aufwand rechtfertigen:
schnelle Inbox-Aufnahme, image-heavy PDFs (Slides, Reports mit
Layout), kurze Webclips, Office-Files. Erwartung: 30 Sekunden bis
2 Minuten, eine Datei als Output.

Nicht fuer tiefe Sense-Making-Notes (-> /ingest-deep), nicht fuer
Meeting-Transkripte (-> /meeting-summary).

## Pflicht-Schritte

### 1. Keine Triage

User hat sich per Slash-Command bereits zur Aufnahme entschieden.
Keine Vor-Triage.

### 2. Source identifizieren

Source-Typen: Markdown (Webclip), URL, PDF, DOCX, PPTX, XLSX. Pfad
oder Chat-Attachment-Index.

### 3. ingest_document aufrufen

Aufrufkonvention:

```
ingest_document
  source_path | attachment_index = "<source>"
  output_path = "<Notes/Author-Year_Title.md>"
  header_content = """
    ---
    source: ...
    source_type: pdf | docx | pptx | xlsx | md | url
    ingested_at: <ISO>
    cluster: <wenn aus Ontologie ableitbar>
    ---

    # <Title>

    ## Overview

    <2-3 Saetze, Kernbotschaft>

    ## Kernaussagen

    - <Aussage 1>. [[<output_basename>#Page <N>|↗]]
    - <Aussage 2>. [[<output_basename>#^block-<M>|↗]]
    ...
  """
```

Tool appended automatisch `## Originaltext` mit dem geparsten Text
(bei PDF mit `## Page N`-Headings pro Seite, bei DOCX/PPTX/XLSX mit
Strukturmarkern).

### 4. Position-Marker pro Kernaussage

Pflicht-Form je Kernaussage in `## Kernaussagen`:

| Source-Typ | Marker-Form |
|---|---|
| PDF | `[[<output_basename>#Page <N>\|↗]]` -- N aus den `## Page N`-Headings im Originaltext-Section |
| Markdown / Webclip | `[[<output_basename>#^block-<M>\|↗]]` -- BlockIdSetter setzt `^block-N` an die Anker-Texte im Originaltext |
| URL mit Section-IDs | `[[<output_basename>#<section-id>\|↗]]` |
| URL ohne Section-IDs | `[[<output_basename>#^block-<M>\|↗]]` (Block-IDs auf den paragraphisch gegliederten Inhalt) |
| DOCX | `[[<output_basename>#^block-<M>\|↗]]` |
| PPTX | `[[<output_basename>#Slide <N>\|↗]]` |
| XLSX | `[[<output_basename>#Sheet <name>\|↗]]` |

Pflicht-Layout des Markers:

- Display-Text immer **nur** `↗`. Kein "Quelle:", kein "[1]".
- Inline am Satzende, ein Leerzeichen vor dem Link.
- Eine Block-Ref pro Kernaussage.

### 5. Verifikation am Ende

Tool gibt einen "Position-Marker-Check" zurueck (FIX-19-28-01):

```
Position-Marker check: 5 of 6 Kernaussagen carry [[basename#... |↗]] refs.
1 ohne Marker -- bitte ergaenzen.
```

Bei Fehlern: ergaenze die fehlenden Marker. Schreibe nicht erneut
das gesamte File, nutze einen Edit auf die Kernaussagen-Section.

## Verbote

- Keine `[1]`-Marker im Perplexity-Stil.
- Kein Multi-Turn-Dialog. Wenn du Dialog brauchst, ist `/ingest-deep`
  das richtige Skill.
- Kein Markdown-Mirror-Zwang fuer PDFs (das ist `/ingest-deep`).
- Kein Originaltext in der `## Kernaussagen`-Section duplizieren.
- Bestehende Notes nicht ueberschreiben (Tool errort bei
  existierendem `output_path`).
