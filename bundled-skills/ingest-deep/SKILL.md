---
name: ingest-deep
description: Deep ingest of a source (PDF/Markdown/URL/DOCX/PPTX/XLSX) in Karpathy multi-turn pattern. Forced Markdown conversion, block-refs to the source rendered as a discreet ↗ symbol. Mandatory step 1 is triage (cluster match, source diversity, tension hint).
trigger: ingest.deep|deep.ingest|karpathy|sense.?making|multi.?turn.*ingest|tiefe.*ingest|deep.?dive.*quelle
source: bundled
requiredTools: [ingest_triage, ingest_deep, read_file, read_document]
---

# /ingest-deep -- Karpathy Multi-Turn Deep-Ingest

## Wann nutzen

Fuer Quellen die echtes Sense-Making rechtfertigen: Forschungs-PDFs,
lange Webclips, fachliche DOCX/PPTX, Notes fuer den Zettelkasten.
Erwartung: 5-15 Minuten Dialog, persistente Vault-Aenderungen,
Block-genaue Provenance.

Nicht fuer schnelle Inbox-Aufnahme (-> /ingest), nicht fuer
Meeting-Transkripte (-> /meeting-summary).

## Pflicht-Schritte

### 1. Triage (10 Sekunden Pre-Pass)

Ruf das Tool `ingest_triage` mit `source_uri="vault://<path>"`. Das
liefert eine Triage-Karte mit:

- Cluster-Match aus der Ontologie
- Source-Domain-Diversity-Hint (wird der Cluster zu einseitig?)
- Tension-Empfehlung (Widersprueche zu existierenden Notes?)
- Empfehlung: Ingest / Spaeter / Verwerfen

Zeig die Karte dem User. Decision:

- **Verwerfen** -> Skill-Abbruch, Decision wird im triage_log persistiert.
- **Spaeter** -> Skill-Abbruch, Note bleibt in Inbox.
- **Ingest** -> weiter zu Schritt 2.

### 2. Source-Konversion zu Markdown (Pflicht)

Quellentyp-abhaengige Vorverarbeitung:

| Source-Typ | Vorverarbeitung |
|---|---|
| Markdown / Webclip | direkt nutzbar |
| URL (nur Link) | requestUrl + Reader-Mode-Konversion in eine Markdown-Note unter `Sources/` |
| PDF | Markdown-Mirror erzwingen: setze Tool-Setting-Override `pdfStrategy: 'markdown-mirror'` fuer diesen Aufruf. Mirror landet als Sibling-`.md` neben der PDF. Original-PDF bleibt unangetastet. |
| DOCX / PPTX / XLSX | parseDocument-Pipeline -> Markdown-Mirror-Note unter `Sources/`. Original bleibt im Attachments-Folder. |

Bei gescannten / image-only PDFs: pdfjs-Textlayer leer -> warne den
User "OCR fehlt, Block-Refs werden nur auf Page-Level gesetzt" und
fall zurueck auf page-refs fuer diese eine PDF.

### 3. Take-Aways extrahieren mit Position-Map

Lies die Markdown-Source komplett. Identifiziere 5-15 Kernaussagen
(eine pro Strategie/Punkt, nicht pro Satz). Pro Take-Away halte fest:

- Aussage-Text (max 200 Zeichen, knapp)
- Anker-Text aus dem Source-Body (eindeutiger Substring, an dem der
  Block-ID-Anker gesetzt werden soll)
- Position-Kind: 'block-anchor' fuer Markdown/Mirror, 'page' fuer
  PDF im page-refs-Modus, 'url-anchor' wenn die URL Section-IDs hat.

### 4. Multi-Turn-Dialog mit User

Zeig die Take-Aways im Chat. Frage:

- "Welche dieser Take-Aways sind fuer dich wichtig?"
- "Was soll betont werden?"
- "Gibt es Aspekte die du anders einschaetzt?"

User korrigiert/ergaenzt. Mindestens **eine** Bestaetigungsrunde,
maximal drei. Erfasse die User-Betonung pro Take-Away.

### 5. Output-Modus waehlen

Frage den User (oder lies Default aus Settings):

- **Modus 2 (Source + Sense-Making-Note)** -- Karpathys Default
- **Modus 3 (Source + Multi-Zettel + Bibliografie-Note)** -- Zettelkasten-Praxis

Bei Modus 3: pro Take-Away ein Zettel, plus eine bibliographische
Summary-Note mit `base`-Codeblock.

### 6. ingest_deep aufrufen

```
ingest_deep
  source_path="<konvertierter Markdown-Pfad>"
  mode="dialog"
  output_mode="source-plus-summary"   // oder "source-plus-multi-zettel"
  cluster="<aus Triage>"
```

### 7. Output-Konvention enforcen (Marker-Form ↗)

Pro Take-Away in der Sense-Making-Note (oder pro Zettel in Modus 3)
muss am Satzende ein dezenter Block-Ref-Link stehen:

```markdown
Letzter Satz der Aussage. [[source-mirror#^block-N|↗]]
```

Pflicht-Form:

- Display-Text immer **nur** `↗`. Kein "Quelle:", kein "[1]".
- Inline am Satzende, ein Leerzeichen vor dem Link.
- Eine Block-Ref pro Kernaussage.
- Bei PDF mit Mirror: `[[Mirror#^block-N|↗]]`.
- Bei Markdown-Source: `[[source#^block-N|↗]]`.
- Bei URL-Source mit Section-ID: `[[source#section-id|↗]]`.

### 8. MOC-Update + Source-Diversity-Counter

Laeuft automatisch im `ingest_deep`-Tool (FEAT-19-26 + FEAT-19-14).
Skill-seitig nichts tun.

## Source-Note-Konstanz

Block-IDs werden im Source-Markdown gesetzt und sind danach **stabil**.
Nicht umbenennen, sonst brechen alle Block-Refs in Sense-Making-Notes
und Zettel.

## Verbote

- Keine `[1]`-Marker im Perplexity-Stil.
- Kein `pdfStrategy: 'page-refs'` (das ist `/ingest`-Default, nicht
  `/ingest-deep`).
- Keine Take-Aways ohne Position-Anker.
- Keine Halluzinationen: jede Aussage muss aus der Source belegt sein.
- Bestehende User-Edits in MOC-Files nicht ueberschreiben.
