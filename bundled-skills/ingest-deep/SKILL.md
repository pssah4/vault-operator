---
name: ingest-deep
description: Deep ingest of a source (PDF/Markdown/URL/DOCX/PPTX/XLSX) in Karpathy multi-turn pattern. Forced Markdown conversion, block-refs to the source rendered as a discreet ↗ symbol. Mandatory step 1 is triage (cluster match, source diversity, tension hint).
trigger: ingest.deep|deep.ingest|karpathy|sense.?making|multi.?turn.*ingest|tiefe.*ingest|deep.?dive.*quelle
source: bundled
requiredTools: [ingest_triage, ingest_deep, ingest_document, read_file]
---

# /ingest-deep -- Karpathy Multi-Turn Deep-Ingest

## Wann nutzen

Tiefe Sense-Making-Notes fuer Forschungs-PDFs, lange Webclips,
fachliche DOCX/PPTX, Zettelkasten-Material. Erwartung: 5-15 Minuten
Dialog, persistente Vault-Aenderungen, Block-genaue Provenance.

Nicht fuer schnelle Inbox-Aufnahme (-> /ingest), nicht fuer
Meeting-Transkripte (-> /meeting-summary).

## Kosten-Disziplin (vor jedem Tool-Call lesen)

Karpathy-Multi-Turn ist teuer. Halte den Token-Verbrauch klein:

- **Maximal 2 Tool-Calls vor dem User-Approval, maximal 1 Tool-Call
  beim eigentlichen Schreiben.** Bei 32 Messages und einem 410-Seiten-PDF
  im Kontext kostet ein einziger Run > 10 EUR.
- **STOP-on-Error.** Wenn ein Tool fehlschlaegt, brich ab und sag dem
  User was er tun soll. Nicht in Retry-Loops verfallen.
- **Keine Erkundungs-`read_document`-Calls.** Quelle wurde dem Agent
  schon als `<attached_document>` oder Vault-File gegeben.
- **Kein `list_files` als Workaround.** Wenn der Pfad unklar ist,
  frag den User.

## Step 0a: Template lesen (Pflicht, vor dem ersten Tool-Call)

Das Frontmatter-Template kommt aus den Settings:
`vaultIngest.templates.ingestDeepNoteTemplate` (vault-relativer Pfad).

Vorgehen:

1. Setting-Wert pruefen. Wenn nicht-leer:
   - `read_file path="<setting-wert>"` -> extrahiere den Frontmatter-
     Block (zwischen den `---`-Zeilen).
   - Diese Felder bilden die Frontmatter-Basis fuer die neue Note.
   - Werte aus der Quelle (Autor, Jahr, URL etc.) einfuellen,
     leere Felder leer lassen.
2. Wenn Setting leer: nutze den Inline-Default unten.

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
`Typ`, `tags`. `Kategorie: [Quelle]` bleibt fix (siehe FEAT-19-27
Auto-Trigger-Konvention).

Bei Konflikt zwischen Template-Feldern und Quellen-Daten: Template
gewinnt fuer die Struktur, Quellen-Daten gewinnen fuer die Werte.

## Step 0: Source-Typ erkennen (Pflicht, vor allem anderen)

Quelle kommt entweder als **Chat-Attachment** (User hat eine Datei in
den Chat gezogen) oder als **Vault-File** (Datei liegt schon im Vault).
Das macht einen riesigen Unterschied fuer die naechsten Schritte.

| Indikator | Source-Typ |
|---|---|
| `<attached_document name="..." format="pdf" pages="N">` ohne `vault_path`-Attribute | **Chat-Attachment** |
| `<attached_document ... vault_path="...">` | **Vault-File** (mit attachment-Hint) |
| User hat einen vault-relativen Pfad genannt (z.B. `Attachements/Foo.pdf`) | **Vault-File** |
| Keine der obigen Indikatoren | Nachfragen |

### Step 0a (Chat-Attachment): erst in Vault speichern

Chat-Attachments leben **nur einen Turn**. Der `attachment_index` ist
ab Turn 2 nicht mehr gueltig. Fuer Karpathy-Multi-Turn brauchst du
also einen Vault-Pfad VOR dem Dialog.

Vorgehen:

1. Schlage dem User vor, die Datei nach `Attachements/<dateiname>` zu
   speichern.
2. Bitte ihn, die Datei manuell in den Attachements-Folder zu
   ziehen, **oder** rufe `ingest_document` SOFORT auf Turn 1 mit
   `attachment_index: 0` und einem minimalen `header_content` (nur
   Frontmatter + Title). Das Tool appended den Originaltext mit
   `## Page N`-Headings -- die Note kann danach im naechsten Turn
   weitergepflegt werden.
3. Nach erfolgreichem Save: weiter mit Step 1 auf Vault-Basis.

**Kein Versuch**, im naechsten Turn nochmal `attachment_index 0` zu
nutzen. Es wird fehlschlagen.

### Step 0b (Vault-File): direkt weiter

Continue mit Step 1.

## Step 1: Triage (vault://-Pfad, 10 Sekunden, billig)

Tool: `ingest_triage`

```
ingest_triage source_uri="vault://<path>"
```

**Voraussetzung:** Source ist ein Vault-File. Bei Chat-Attachments
hat Step 0a die Datei bereits in den Vault gespeichert.

Output ist eine Triage-Karte:

- Cluster-Match aus der Ontologie
- Source-Domain-Diversity-Hint
- Tension-Empfehlung
- Empfehlung: Ingest / Spaeter / Verwerfen

Zeig die Karte dem User. Decision:

- **Verwerfen** -> Skill-Abbruch.
- **Spaeter** -> Skill-Abbruch.
- **Ingest** -> Step 2.

**Wenn `ingest_triage` einen Fehler zurueckgibt** (KnowledgeDB nicht
offen, Pfad ungueltig, etc.): nicht retryen. Skip Triage, weiter mit
Step 2 mit dem User informiert.

## Step 2: User-Approval

Frage den User in der Chat:

- "Welche Schwerpunkte sollen ingestet werden?"
- "Output-Modus: source-plus-summary (1 Sense-Making-Note) oder
  source-plus-multi-zettel (1 Bibliografie + N Zettel)?"

Eine Runde reicht. Der User antwortet, dann weiter mit Step 3.

## Step 3: ingest_deep aufrufen (EIN Tool-Call)

```
ingest_deep
  source_path="<vault-relativer Pfad zur Markdown-Source oder zur PDF>"
  mode="dialog"
  output_mode="source-plus-summary"   // oder "source-plus-multi-zettel"
  cluster="<aus Triage>"
```

Bei PDFs erzwinge Mirror-Konvertierung VOR diesem Aufruf, indem du
sicherstellst, dass `vaultIngest.pdfStrategy = 'markdown-mirror'` im
Settings ist. Sonst bleibt die PDF page-refs und Block-Granularitaet
ist nur Page-Level.

**Wenn ingest_deep fehlschlaegt:** nicht retryen, dem User Fehler
zeigen, Skill-Ende.

## Step 4: Output-Konvention pruefen

Nach erfolgreichem `ingest_deep`-Run:

- Sense-Making-Note enthaelt pro Take-Away eine `[[source#^block-N|↗]]`-
  oder `[[source.pdf#page=N|↗]]`-Ref am Satzende? -> ok.
- Falls nicht: lese die Note via `read_file`, ergaenze fehlende Marker
  via Edit (kein Re-Write der ganzen Note).

## Output-Konvention (verbindlich)

Pro Aussage in der Sense-Making-Note (oder pro Zettel in Multi-Modus)
muss am Satzende ein dezenter Block-Ref-Link stehen:

```markdown
Letzter Satz der Aussage. [[source-mirror#^block-N|↗]]
```

Pflicht-Form:

- Display-Text immer **nur** `↗`. Kein "Quelle:", kein "[1]".
- Inline am Satzende, ein Leerzeichen vor dem Link.
- Eine Block-Ref pro Kernaussage.

## Verbote

- Keine `[1]`-Marker im Perplexity-Stil.
- Keine `pdfStrategy: 'page-refs'` in `/ingest-deep` (das ist /ingest-Default).
- Keine Halluzinationen: jede Aussage muss aus der Source belegt sein.
- **Keine Retry-Loops.** Bei Tool-Fehler: STOP, User informieren.
- **Kein `read_document` als Erkundungs-Pre-Pass.** Source-Text liegt
  bereits als `<attached_document>` oder Vault-File vor.
- **Kein `list_files` zur Pfad-Suche.** User fragen ist billiger.
- Bestehende User-Edits in MOC-Files nicht ueberschreiben.

## Notfall-Pfad: write_file

Wenn `ingest_document` und `ingest_deep` beide fehlschlagen (z.B.
Attachment weg, KnowledgeDB nicht initialisiert, Provider-Quota voll):

1. Extrahiere die Page-Struktur aus dem `<attached_document>`-Block in
   deinem Kontext (sucht nach `## Page N`-Headings).
2. Schreibe via `write_file` eine Single-Note mit:
   - Frontmatter (source, year, etc.)
   - `## Overview`
   - `## Kernaussagen` mit pro Aussage `[[<basename>#Page <N>|↗]]`-Marker
     -- Page-Number aus dem geparsten Text ableiten
   - `## Originaltext` mit dem vollstaendigen geparsten Text
3. Tu das in EINEM `write_file`-Call. Kein Edit-Loop.
