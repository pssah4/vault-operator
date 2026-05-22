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

**Ablage-Regel:** ALLE Markdown-Outputs landen in `<defaultOutputFolder>/`
(Default `Inbox/`, aus den Plugin-Settings). Originale Binaries
(PDF/DOCX/PPTX/XLSX) gehen nach `Attachements/<Author>-<Year>-<Title>.<ext>`.
Keine neuen Ordner anlegen, kein `Sources/`, kein `Notes/`. Wenn der
defaultOutputFolder fehlt, legt das Plugin ihn beim ersten Schreibvorgang
an. Naming-Convention: `<Author>-<Year>-<Title>` (englisch transliteriert,
Bindestriche statt Leerzeichen). Ohne bekannten Author/Year: `<Title>`.

## Step 1: ingest_document aufrufen

Aufrufkonvention:

```
ingest_document
  source_path | attachment_index = "<source>"
  output_path = "<defaultOutputFolder>/<Author>-<Year>-<Title>.md"
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

Nach erfolgreichem Ingest **immer** via `ask_followup_question`-Tool
nachfragen, niemals als Plain-Text-Frage:

- question: "Soll ich aus den Kernaussagen Sense-Making-Notes anlegen?"
- options: ["Eine zusammenfassende Note", "Pro Take-Away einen eigenen
  Zettel", "Nichts, danke"]

Default ist "Nichts, danke". Nur bei expliziter Sense-Making- oder
Zettel-Antwort weiter mit Step 4a-4d.

### Step 4a: Template-Frontmatter holen (Pflicht)

`read_file path="<settings.vaultIngest.templates.quellenNotizTemplate>"`
und den Frontmatter-Block zwischen den beiden `---`-Zeilen
**verbatim** als String halten. Werte werden hinter den Doppelpunkten
eingefuellt. Niemals YAML neu rendern -- das bricht das Frontmatter.

**Pflicht-Werte:**
- `Kategorie:` -> `- Quellen-Notiz` (DE) bzw. `- Source note` (EN).
  Aus dem Template uebernehmen wenn vorhanden.
- `Quellen:` -> `[[<Quelle-basename>]]` (bidirektionaler Link).
- `Zusammenfassung:` -> 1-2-Satz-Quintessenz des Take-Aways.

### Step 4b: Naming-Konvention

Sense-Making-Note und Zettel sind **eigenstaendige Konzept-Notes** mit
aussagekraeftigen Titeln. Keinen Source-Basename als Prefix.

| ❌ Falsch | ✅ Richtig |
|---|---|
| `Karpathy ... -- Sense-Making.md` | `Karpathy zu Vibe Coding und Agentic Engineering.md` |
| `Karpathy ... -- LLMs als Ghosts.md` | `LLMs als Ghosts.md` |

Verbindung zur Quelle: Frontmatter `Quellen: [[<Source>]]` + Backlink
in der Source (Step 5).

### Step 4c (Modus A): Sense-Making-Note

EINE Note via `write_file`:

- **Pfad:** `<defaultOutputFolder>/<Konzept-Titel>.md`
- **Content (Reihenfolge strikt, keine Leerzeile vor dem Frontmatter):**

```
<TEMPLATE-FRONTMATTER VERBATIM, Werte gefuellt>

# <Konzept-Titel>

## Kernaussage

<1-3 Saetze, zentrales Argument der Quelle pointiert.>

## Take-Aways

- <Take-Away 1, ausformuliert.> [[<Source>#Page <N>|↗]]
- <Take-Away 2.> [[<Source>#^block-<M>|↗]]
- ...
```

### Step 4d (Modus B): Multi-Zettel

Ein Zettel pro Take-Away via `write_file`:

- **Pfad:** `<defaultOutputFolder>/<Konzept-Titel>.md`
- **Content:**

```
<TEMPLATE-FRONTMATTER VERBATIM, Werte gefuellt>

# <Konzept-Titel>

<EIN Gedanke / Take-Away, ausformuliert in 1-3 Absaetzen. Eigene
Worte, nicht Source-Wortlaut. Was ist die Insight, warum ist sie
relevant?>

## Quelle

[[<Source>]] -- siehe [[<Source>#Page <N>|↗]]
```

**Wichtig:** Body und Frontmatter-`Zusammenfassung:` ergaenzen sich.
Frontmatter ist die Quintessenz fuer Listing/Suche, Body ist die
Ausformulierung. Niemals Body leer lassen.

**Namens-Kollision:** Wenn `<Konzept-Titel>.md` schon existiert,
`read_file` der existierenden Note, User fragen ob Ergaenzung oder
Variante (`<Titel> (<Autor>).md`). Nie stillschweigend ueberschreiben.

## Step 5: Backlink in der Quelle (Pflicht nach Step 4)

Wenn in Step 4 Notes erstellt wurden:

1. Lade die Quelle-Note via `read_file`.
2. **Verifikation (AUDIT-024 I-1):** Pruefe im Frontmatter, dass die
   Note die `Kategorie: - Quelle` (oder `- Source` im englischen
   Vault) traegt. Wenn nicht, ist der Pfad falsch oder die Note ist
   die falsche -- STOP und frag den User, bevor du irgendwo
   `Notizen:` setzt.
3. Lies das `Notizen:`-Feld aus dem Frontmatter.
4. `update_frontmatter`-Tool: setze `Notizen:` auf eine Liste mit
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
- **Keine neuen Ordner.** Erlaubte Ziele sind ausschliesslich
  `Attachements/` (Binaries) und `<defaultOutputFolder>/` (Markdown).
  Kein `Sources/`, kein `Notes/`.
- **Keine Source-Duplikate.** Liegt die Quelle bereits als Markdown im
  Vault (`source_path` zeigt auf eine `.md`-Datei), schreibe NICHT eine
  zweite Note in `<defaultOutputFolder>/` -- nutze stattdessen
  `update_frontmatter` + manuelle Block-ID-Edits direkt in der
  Original-Note.
- **Kein Source-Prefix in Sense-Making-/Zettel-Titeln.** Konzept-
  Titel sind eigenstaendig, die Verbindung zur Quelle steht im
  Frontmatter (`Quellen:`).
- **Kein YAML-Re-Render des Templates.** Frontmatter-Block ist ein
  verbatim String, Werte hinter Doppelpunkten einsetzen. Niemals
  zerlegen und neu zusammensetzen -- das produziert doppelte `---`
  und kaputte YAML.
- **Keine Transkript-Schnipsel als Note-Body.** Eigene Worte, ein
  klarer Gedanke pro Note. Roher Source-Text gehoert nicht in den
  Body -- referenziere via Block-Ref.

## Fehlerfaelle

| Fehler | Was tun |
|---|---|
| `Attachment index 0 out of range. 0 attachment(s) available.` | Attachment ist nicht (mehr) verfuegbar -- diesen Turn neu starten oder User um neues Upload bitten. Nicht retryen. |
| `File not found: <name>` | Pfad falsch. User fragen, nicht raten. |
| `File already exists: <output_path>` | output_path aendern (z.B. ` (2)` anhaengen) oder User fragen. |
