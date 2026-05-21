---
name: ingest
description: Quick single-pass ingest of a source (PDF/Markdown/URL/DOCX/PPTX/XLSX) into one note (frontmatter + overview + key points + original text). PDFs stay page-refs (no mirror enforcement). Block-refs to the source rendered as a discreet ↗ symbol per key point. No multi-turn dialog.
trigger: schneller.*ingest|quick.*ingest|inbox.*aufnahme|webclip.*ingest|aufnehmen.*note|integriere.note
source: bundled
requiredTools: [ingest_document, write_file, read_file, update_frontmatter]
---

# /ingest -- Schneller Single-Pass-Ingest

## Wann nutzen

Schnelle Inbox-Aufnahme, image-heavy PDFs, kurze Webclips,
Office-Files. Erwartung: 30 Sekunden bis 2 Minuten, eine Datei als
Output.

Nicht fuer tiefe Sense-Making-Notes (-> /ingest-deep), nicht fuer
Meeting-Transkripte (-> /meeting-summary).

## Kosten-Disziplin

- **Ein Tool-Call.** `ingest_document`. Keine read_document-Pre-Reads,
  keine list_files-Erkundung.
- **STOP-on-Error.** Bei Tool-Fehler: User informieren, fertig.

## Step 0a: Template lesen (Pflicht, vor dem ingest_document-Aufruf)

Das Frontmatter-Template kommt aus den Settings:
`vaultIngest.templates.ingestNoteTemplate` (vault-relativer Pfad).
Wird beim First-Run vom Wizard auf
`<TemplatesFolder>/Quelle Template.md` (DE) bzw.
`<TemplatesFolder>/Source Template.md` (EN) gesetzt
(siehe FEAT-29-14). Der TemplatesFolder kommt aus dem
Obsidian-Core-Templates-Plugin (`.obsidian/templates.json`).

Vorgehen (Reihenfolge ist Pflicht):

1. **Setting-Wert pruefen.** Wenn nicht-leer:
   - `read_file path="<setting-wert>"` -> extrahiere den Frontmatter-
     Block zwischen den `---`-Zeilen.
   - Diese Felder bilden die Frontmatter-Basis fuer den
     `header_content`.
   - Werte aus der Quelle (Autor, Jahr, URL etc.) einfuellen,
     unbekannte Felder leer lassen.
   - **Bevorzuge IMMER das User-Template wenn vorhanden** -- es
     spiegelt die Konvention des Vaults wider (Sprache, custom
     Felder). Der Inline-Default unten ist NUR Fallback.
2. Wenn Setting leer: nutze den Inline-Default.

**Inline-Default (Fallback wenn Setting leer):**

```yaml
---
Zusammenfassung:
Autor:
Jahr:
ISBN:
URL:
Notizen:
Themen:
Konzepte:
Meeting-Notizen:
Kategorie:
  - Quelle
Typ:
tags:
Permanent: false
---
```

Pflicht-Felder die der Skill aus der Quelle ableitet und einfuellt:
`Zusammenfassung`, `Autor`, `Jahr`, `URL`, `Themen`, `Konzepte`,
`Typ`, `tags`.

**Kategorie-Wert (Pflicht-Format):** YAML-Listen-Element mit Bindestrich,
ein Wert. Englischer Vault: `- Source`. Deutscher Vault: `- Quelle`.
Niemals als Inline-Array `[Quelle]` -- das matcht den Auto-Trigger
nicht (FEAT-19-27).

## Step 0: Source-Typ und Tool-Wahl

Schau in deinen Kontext:

| Quelle | Aufruf |
|---|---|
| `<attached_document name="..." pages="N">` ohne `vault_path` (frisch in Chat geladen) | `ingest_document` mit `attachment_index: 0` -- **TURN 1 noch waehrend das Attachment lebt**. Auf spaeteren Turns ist das Attachment weg. |
| `<attached_document vault_path="...">` oder User nennt Vault-Pfad | `ingest_document` mit `source_path: "<pfad>"` |
| Reine URL ohne Attachment | requestUrl + write_file (Tool-Pfad ohne ingest_document) |
| Markdown im Vault | `ingest_document` mit `source_path` ist optional; bei reinen MD-Sources reicht `update_frontmatter` + Block-IDs |

## Step 1: ingest_document aufrufen

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

Tool appended automatisch `## Originaltext` mit dem geparsten Text.

## Step 2: Position-Marker pro Kernaussage (Pflicht)

Jede Kernaussage in `## Kernaussagen` traegt am Satzende einen Marker:

| Source-Typ | Marker-Form |
|---|---|
| PDF | `[[<output_basename>#Page <N>\|↗]]` -- N aus den `## Page N`-Headings im Originaltext |
| Markdown / Webclip | `[[<output_basename>#^block-<M>\|↗]]` |
| URL mit Section-IDs | `[[<output_basename>#<section-id>\|↗]]` |
| DOCX | `[[<output_basename>#^block-<M>\|↗]]` |
| PPTX | `[[<output_basename>#Slide <N>\|↗]]` |
| XLSX | `[[<output_basename>#Sheet <name>\|↗]]` |

Pflicht-Layout:

- Display-Text immer **nur** `↗`. Kein "Quelle:", kein "[1]".
- Inline am Satzende, ein Leerzeichen vor dem Link.
- Eine Block-Ref pro Kernaussage.

## Step 3: Verifikation

Tool gibt einen `Position-Marker check: X of Y Kernaussagen carry refs`-
String zurueck. Bei `X < Y`: lies die Note via `read_file`, ergaenze
fehlende Marker via `update_frontmatter`/`write_file`-Edit. **Nicht
die ganze Note neu schreiben.**

## Step 4: Sense-Making-Note (optional, User fragen)

Nach erfolgreichem Ingest **immer** den User fragen:

> "Soll ich aus den Kernaussagen Sense-Making-Notes anlegen?
> A: Eine zusammenfassende Note. B: Pro Take-Away einen eigenen
> Zettel. C: Nichts, danke."

Default ist "C: Nichts". Nur bei expliziter A- oder B-Antwort weiter.

### Step 4a: Template lesen (Pflicht)

Frontmatter-Template fuer die Output-Notes:
`vaultIngest.templates.quellenNotizTemplate` (vault-relativer Pfad).
First-Run-Wizard belegt das mit `<TemplatesFolder>/Notiz Template.md`
(DE) bzw. `<TemplatesFolder>/Note Template.md` (EN). Lesen, Frontmatter
extrahieren, Felder befuellen.

**Kategorie-Wert (Pflicht):**

- Deutscher Vault: `- Quellen-Notiz`
- Englischer Vault: `- Source note`

**Quellen-Backref im Frontmatter:** Setze `Quellen:` auf
`[[<Quelle-basename>]]` damit der Graph eine Kante bekommt.

### Step 4b (Modus A): Sense-Making-Note

EINE Note via `write_file`:

- Pfad: `<gleicher Folder wie Quelle>/<Quelle-basename> -- Sense-Making.md`
- Frontmatter aus Template, `Kategorie: - Quellen-Notiz`, `Quellen: [[<basename>]]`
- Body: Synthese aus den Kernaussagen, jede Aussage mit dem gleichen
  `[[<basename>#...|↗]]`-Marker wie in der Quelle.

### Step 4c (Modus B): Multi-Zettel

N Notes via `write_file`-Calls, einer pro Take-Away:

- Pfad: `<gleicher Folder wie Quelle>/<Quelle-basename> -- <Take-Away-Kurztitel>.md`
- Frontmatter wie 4b
- Body: ein Take-Away, der jeweilige Marker am Satzende

## Step 5: Backlink in der Quelle (Pflicht nach Step 4)

Wenn in Step 4 Notes erstellt wurden:

1. Lade die Quelle-Note via `read_file`.
2. Lies das `Notizen:`-Feld aus dem Frontmatter.
3. `update_frontmatter`-Tool: setze `Notizen:` auf eine Liste mit
   `[[note1]], [[note2]], ...`. Bestehende Werte beibehalten (append).

Damit zeigt der Obsidian-Graph die Verbindung Quelle <-> abgeleitete
Notes.

## Verbote

- Keine `[1]`-Marker im Perplexity-Stil.
- Kein Multi-Turn-Dialog. Wenn Dialog noetig, ist `/ingest-deep`
  das richtige Skill.
- Kein Markdown-Mirror-Zwang fuer PDFs.
- Kein Originaltext in der `## Kernaussagen`-Section duplizieren.
- **Kein `read_document` vor `ingest_document`.** Tool parst selber.
- **Kein `list_files` zur Pfad-Suche.** User fragen ist billiger.

## Fehlerfaelle

| Fehler | Was tun |
|---|---|
| `Attachment index 0 out of range. 0 attachment(s) available.` | Attachment ist nicht (mehr) verfuegbar -- diesen Turn neu starten oder User um neues Upload bitten. Nicht retryen. |
| `File not found: <name>` | Pfad falsch. User fragen, nicht raten. |
| `File already exists: <output_path>` | output_path aendern (z.B. ` (2)` anhaengen) oder User fragen. |
