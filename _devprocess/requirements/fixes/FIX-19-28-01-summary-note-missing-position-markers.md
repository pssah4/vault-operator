# FIX-19-28-01: Summary-Note enthaelt keine Source-Position-Marker

**Prioritaet:** P0 (Promised Feature liefert sein Kern-Versprechen nicht)
**Feature-Bezug:** FEAT-19-28 (Source-Position-Marker), EPIC-19 (Knowledge Maintenance)
**Verwandt:** ADR-103 (Block-Reference-Konvention + PDF-Strategie), GitHub Issue #11 (pssah4/vault-operator-dev)
**Entdeckt:** 2026-05-07 (User-Repro `ingest_deep` auf PDF, Modus `source-plus-summary`)

## Reopen 2026-05-08 -- konsolidierte Root-Cause-Diagnose

Live-Test mit `Attachements/enbw-geschaeftsbericht-2025.pdf` auf
branch `feature/block-source-citations` (PLAN-15 Code drauf, awaiting
dev-merge). User-Beobachtung: "Block refs sind nur Text: `^block-9`".

### Smoking Gun

`src/core/modes/builtinModes.ts:20-32` (`TOOL_GROUP_MAP`) listet
**weder `ingest_deep` noch `ingest_triage`** in irgendeiner Tool-Group.
Der `/ingest-deep`-Skill (
`_devprocess/architecture/skills/ingest-deep.skill.md`) instruiert
den LLM explizit, beide Tools zu rufen (Schritt 1 + Schritt 6). Da
sie nicht im Tool-Schema des Agent-Modes sind, kann der LLM sie
nicht aufrufen und macht den gesamten Workflow manuell mit
`read_document` + `write_vault`.

Konsequenz: PLAN-15 hat den Tool-Pfad korrekt verdrahtet
(planGenerator nutzt `readSourceAsMarkdown`, BlockIdSetter,
SummaryPositionAnnotator), aber der Tool-Pfad wird nie betreten.
Der LLM-only-Pfad produziert keine Wikilink-Wraps, weil die
SummaryPositionAnnotator-Logik nur im Tool-Run greift.

Identisches Pattern wurde 2026-04-XX als BUG-021 fuer
`vault_health_check` und `ingest_document` gefixt; die ingest-Tools
`ingest_deep` und `ingest_triage` sind im selben Drift-Topf
liegen geblieben.

### Konsolidiertes Symptom-Cluster (drei FIXes, eine Wurzel)

| FIX | Symptom | Folgt aus Tool-Drift |
|----|----|----|
| FIX-19-28-01 | Block-Refs als Plain-Text statt [[Mirror#^block-N\|↗]] | LLM rendert Anchor selbst, ohne Skill-Form-Compliance |
| FIX-19-28-03 | Mirror-Mojibake (UTF-8 als Latin-1) | LLM reserialisiert PDF-Text statt parseDocument-Output direkt zu speichern |
| FIX-19-28-04 | Coverage 1-135/410 | LLM entscheidet selbst was er liest und mirrord |

### Vorgeschlagener Single-Fix

`ingest_deep` und `ingest_triage` zu `TOOL_GROUP_MAP` ergaenzen.
Plus: Coverage-Test in `builtinModes.coverage.test.ts` so
erweitern, dass alle Tools aus `ToolName` mindestens in einer
Group landen (statt Whitelisting der bekannten Drift-Faelle). Sonst
wird das gleiche Pattern beim naechsten ingest-Tool wieder
zuschlagen.

Skill-seitig zusaetzlich: harten Fail einbauen wenn die Tools nicht
verfuegbar sind ("Tool ingest_triage nicht im aktuellen Mode --
wechsle zu Mode mit edit-Group oder aktiviere die Tools"), statt
silent fallback auf manuellen Pfad.

### Bisheriger Mirror und Sense-Making-Note vom Live-Test 2026-05-08

Mirror: `Sources/EnBW-Geschaeftsbericht-2025-Mirror.md` (vom
LLM-Pfad geschrieben, daher unter `Sources/` und nicht als
PDF-Sibling, plus mit Mojibake). Sense-Making-Note: vom User
nachzuliefern.

Mirror selbst hat korrekte Anchors `^block-1` ... `^block-43` an den
Take-Away-Stellen (Obsidian-Block-Anchor-Syntax intakt). Die
Sense-Making-Note enthaelt aber laut User die Block-Referenzen nur
als **Plain-Text** `^block-9`, nicht als klickbaren Wikilink
`[[Sources/EnBW-Geschaeftsbericht-2025-Mirror#^block-9]]`. AC-02
("Sense-Making-Note enthaelt pro Take-Away `#page=N` oder
`#^block-N`") gilt damit nicht als erfuellt -- der Marker steht zwar
da, aber nicht im klickbaren Wikilink-Wrap.

Vermutete Ursache (zu verifizieren am Code):
- Pipeline schreibt die Take-Away-Texte aus dem Plan in die
  Sense-Making-Note, mit Block-Anchor angehaengt
- Aber der Anchor wird nicht zu einem Cross-File-Wikilink gewrapped,
  sondern landet als bare `^block-N`-Token im Output
- In Obsidian wird `^block-N` ohne Wikilink-Klammern nicht als
  Reference erkannt, sondern bestenfalls als Anchor *innerhalb* der
  Sense-Making-Note (auf nicht-existierende lokale Blocks)

Nicht in PLAN-15 abgedeckt: Wrap der Block-Anchors in Cross-File-
Wikilinks `[[<MirrorPath>#^block-N]]` an der Konsumenten-Seite. Der
Plan deckt offenbar nur die Anchor-Setup-Seite (Mirror) ab, nicht
die Konsumenten-Seite (Sense-Making-Note).

Status zurueck auf Open. Branch fuer Weiter-Implementierung bleibt
`feature/block-source-citations`. Sense-Making-Note vom User-Test
sollte zur naechsten Implementierung als Sample dienen (User
liefert nach).

---

## Problem

Nach `ingest_deep` einer PDF im Default-Modus (`pdfStrategy: 'page-refs'`,
`output_mode: 'source-plus-summary'`) enthaelt die generierte Sense-Making-
Note keine Page-Refs der Form `[[source.pdf#page=N]]`. Die Take-Aways im
Body verweisen lediglich auf den Source-Basenamen via `[[basename]]` (Datei-
Level), ohne Page- oder Block-Position. Das Versprechen aus FEAT-19-28
("Sense-Making-Notes referenzieren via klickbarem Link auf die genaue
Position in der Source") wird damit im Default-Pfad nicht eingeloest.

User-sichtbar: User klickt auf eine Aussage in der Summary, landet
bestenfalls bei der Source-Note (Datei-Level), nicht an der Page mit der
zugrundeliegenden Aussage. Provenance ist visuell prAesent (Source-
Wikilink steht da), aber ohne Position-Granularitaet wertlos -- der User
muss die Quelle trotzdem manuell durchsuchen.

## Root Cause Analyse

Die Pipeline FEAT-19-28 hat alle Bausteine (BlockIdSetter, PdfMarkdownMirror,
parsePdf), aber die Orchestrierung im Default-Pfad komponiert sie nicht
zum versprochenen Output. Drei verkettete Probleme.

### Kette

**Schritt 1: planGenerator-Default ist Stub ohne Position-Marker**
[IngestDeepTool.ts:117-148](src/core/tools/vault/IngestDeepTool.ts#L117-L148)

```typescript
const planGenerator = async (f: TFile, _m: IngestMode, om: OutputMode) => {
    const text = await this.plugin.app.vault.cachedRead(f);
    const paragraphs = text.split(/\n{2,}/)...slice(0, 5);
    const summary = `Auto-Sense-Making zu [[${f.basename}]]:\n\n` +
        paragraphs.map((p) => `- ${p.slice(0, 200)}...`).join('\n');
    return { takeAways: paragraphs, summaryBody: summary };
};
```

Der Default-Stub baut einen `summaryBody` als Bullet-Liste der ersten 5
Absaetze, ohne irgendwo `#page=N` oder `#^block-N` einzufuegen. Der einzige
Source-Bezug ist der Header-Wikilink `[[basename]]` -- Datei-Level.

Kommentar im Code: "minimaler 'default planner'... echter Multi-Turn-Dialog
kann spaeter via Conversation-Loop kommen; Hook bleibt offen." Der LLM-
gestuetzte Hook ist nicht verdrahtet, der Stub ist Default in Production.

**Schritt 2: PDF wird als Text gelesen (Binary-Garbage)**
[IngestDeepTool.ts:122](src/core/tools/vault/IngestDeepTool.ts#L122)

`cachedRead(f)` auf einer PDF-TFile liefert die rohe Datei-Repraesentation
(im Wesentlichen leer fuer binaer-only PDFs, sonst PDF-Stream-Garbage).
Die "ersten 5 Absaetze" sind dann sinnlos. Der Stub haette `parsePdf` nutzen
muessen oder den Pfad fuer PDFs gar nicht treten.

Im opt-in `markdown-mirror`-Pfad wird `actualSource = result.mirrorFile`
gesetzt ([IngestDeepTool.ts:98](src/core/tools/vault/IngestDeepTool.ts#L98)),
dann liest `cachedRead` korrekt den Mirror-Markdown. Aber im Default
`page-refs`-Pfad bleibt `actualSource = file` (PDF), und der Read produziert
Garbage. Zusaetzliches Symptom: Take-Aways enthalten dann garbled Text,
BlockIdSetter findet keine Anchors, kein Block-Marker entsteht.

**Schritt 3: DeepIngestPipeline schreibt Source-Note mit leerem Body**
[DeepIngestPipeline.ts:104-113](src/core/ingest/DeepIngestPipeline.ts#L104-L113)

```typescript
const sourceContent: SourceContent = {
    suggestedFilename: input.sourceFile.basename + '.md',
    body: '',
    frontmatter: { source_path: `[[${input.sourceFile.basename}]]`, ... },
    blockAnchors: plan.takeAways,
};
```

`body: ''` ist hardcoded. `OutputModeGenerator.writeSourceNote` ruft
`markBlockIds('', plan.takeAways)` auf -- der Setter findet keine Anchor-
Treffer im leeren Body und gibt einen leeren `anchorToBlockId`-Map zurueck.
Die so geschriebene `Sources/{basename}.md` ist eine reine Frontmatter-Datei
ohne Inhalt und ohne Block-IDs.

Folge: Selbst wenn die Sense-Making-Note `[[Sources/{basename}#^block-N]]`
verlinken WUERDE, gaebe es kein `^block-N` zum Anspringen. Die zwei Welten
(Source-Note-Body / Block-IDs / Sense-Making-Body / Position-Marker) sind
nicht miteinander verdrahtet.

**Schritt 4: kein Post-Processing-Step injiziert Position-Marker**
[DeepIngestPipeline.ts:117-120](src/core/ingest/DeepIngestPipeline.ts#L117-L120)

Im Pipeline-Schritt 5 wird `senseMaking.body = plan.summaryBody` 1:1 (plus
optional Tension-Footer) durchgereicht. Es gibt keine Stelle, an der
Take-Aways mit ihren Source-Positionen (Page-Number aus pdfjs, Block-ID aus
BlockIdSetter, URL-Anchor) verknuepft werden und die Aussagen im Body
mit `[[source#position]]` annotiert werden.

Der Plan-Datentyp DeepIngestPlan kennt nur `takeAways: string[]` und
`summaryBody?: string` -- es gibt kein Feld fuer die Position pro
Take-Away. Selbst wenn der LLM-Hook angeschlossen waere, koennte die
Pipeline die Markers nicht setzen, weil das Daten-Schema fehlt.

### Zusammenfassung

```
PDF-Source -> cachedRead liefert Garbage -> sinnlose Take-Aways
                                          \-> empty source-note body
                                          \-> kein BlockIdSetter-Match
PlanGenerator -> summaryBody ohne Marker -> Sense-Making-Note ohne #page=N / #^block-N
DeepIngestPlan -> kein Position-Feld pro Take-Away -> kein Verknuepfungspunkt
```

Auch ohne LLM-Hook waere ein deterministischer Default moeglich (z.B. PDF-
Page = `Math.ceil(takeAwayIndex / takeAwaysPerPage)` aus parsePdf, oder
fuer Markdown-Sources den Heading-Section als Anker). Der wurde nicht
implementiert.

## Scope dieses FIX

In-Scope (fuer FIX-19-28-01):

1. PDF-Default-Pfad: planGenerator nutzt `parsePdf`, nicht `cachedRead`,
   und protokolliert pro Take-Away die Page-Number.
2. DeepIngestPlan erweitern um Position-Info pro Take-Away
   (Discriminated Union: `{ kind: 'page', page: number }` |
   `{ kind: 'block', anchor: string }` | `{ kind: 'url-anchor', anchor: string }`).
3. Pipeline injiziert die Position-Marker beim Bau des Sense-Making-Body.
4. Markdown-Source-Pfad: planGenerator setzt anchor-Texte aus den
   Take-Aways, BlockIdSetter findet sie im echten Source-Body.
5. Source-Note-Body in DeepIngestPipeline.run() vom hardcodeten `''` auf
   den tatsaechlich gelesenen Source-Markdown umstellen, sonst greifen
   die Block-IDs nicht.

Out-of-Scope (separate Tickets):

- LLM-gestuetzte Take-Away-Selektion (echter `planGenerator`-Hook)
  -> separates IMP unter FEAT-19-22 (Aktiver Dialog-Ingest).
- Transkript-/Meeting-Summary-Pfad (Audio/ASR)
  -> potentiell neues FEAT-19-30 oder eigener Issue, ist nicht in BA-25.
- Sprechende Block-IDs (`^kebab-id`) statt `^block-N`
  -> bewusste ADR-103-Entscheidung, kein FIX. Re-Eval nur bei expliziter
  ADR-Revision.

## Reproduktion

1. Setting `vaultIngest.pdfStrategy = 'page-refs'` (Default).
2. PDF in Vault legen, z.B. `Attachments/Test.pdf`.
3. Tool aufrufen: `ingest_deep` mit `source_path: 'Attachments/Test.pdf'`,
   `output_mode: 'source-plus-summary'`.
4. Erwartet: Sense-Making-Note enthaelt Aussagen mit
   `... [[Test.pdf#page=N]]`-Refs.
5. Beobachtet: Sense-Making-Note enthaelt nur Header-Wikilink auf `[[Test]]`,
   keine `#page=N`-Marker im Body.

Mit `pdfStrategy = 'markdown-mirror'`: Mirror wird zwar erstellt, aber die
`Sources/{basename}.md` (Source-Content-Output) bleibt leer und der Sense-
Making-Body bekommt trotzdem keine `#^block-N`-Refs (Schritt 4 fehlt
auch hier).

## Akzeptanzkriterien

| ID | Criterion | Target |
|----|-----------|--------|
| AC-01 | Sense-Making-Note enthaelt pro Take-Away mindestens einen Position-Marker | 100% der Take-Aways |
| AC-02 | PDF-Default-Pfad: Marker-Form `[[source.pdf#page=N]]`, klickbar in Obsidian Desktop | manueller Test |
| AC-03 | PDF-Mirror-Pfad: Marker-Form `[[source-mirror#^block-N]]`, klickbar | manueller Test |
| AC-04 | Markdown-Source-Pfad: Marker-Form `[[source#^block-N]]`, klickbar | manueller Test |
| AC-05 | DeepIngestPlan-Schema kennt Position pro Take-Away | Type-Check + Unit-Test |
| AC-06 | Source-Note-Body wird mit echtem Source-Inhalt befuellt (kein leerer Body mehr) | Integration-Test |
| AC-07 | Re-Run desselben Ingests aendert Block-IDs nicht (Idempotenz aus ADR-103 bleibt) | Unit-Test |

## Files (vorraussichtlich)

- `src/core/ingest/DeepIngestPipeline.ts` -- Plan-Schema erweitern,
  Source-Body von `''` auf `cachedRead(input.sourceFile)` umstellen.
- `src/core/tools/vault/IngestDeepTool.ts` -- planGenerator-Default
  erweitern: PDF-Pfad via `parsePdf` + Page-Tracking, Markdown-Pfad
  mit echten Anchor-Texten.
- `src/core/ingest/SummaryPositionAnnotator.ts` (neu) -- separater
  Helper, der Take-Aways im Sense-Making-Body mit ihren Position-Markern
  annotiert. Hat keinen LLM-Coupling, ist deterministisch.
- Tests in `__tests__/DeepIngestPipeline.test.ts`,
  `__tests__/IngestDeepTool.test.ts` (neu).

## Notes

- Auch der `planGenerator`-Default-Stub ist langfristig Tech-Debt
  (Issue #11 Kommentar implizit). Der LLM-Hook gehoert verdrahtet, sonst
  bleibt der Default-Pfad ein Demo. Trackt unter separatem IMP.
- Der user-vorgeschlagene Pattern (sprechende `^kebab-id`, `↗`-Symbol als
  Link-Display, eine ID pro Kernaussage) ist explizit gegen ADR-103. Wenn
  das nochmal verhandelt wird: separates ADR, nicht hier.

---

## Audit der 3 Pfade (2026-05-07)

User-Anforderung: vor Plan-Erstellung alle Pfade pruefen, die "Source-Note"
oder "Sense-Making-Note" erzeugen. Drei Tools im Spiel.

### Pfad A: `ingest_document` (vermutlich der user-genutzte Pfad)

[IngestDocumentTool.ts](src/core/tools/vault/IngestDocumentTool.ts).
Tool-Description sagt explizit: "Always use this tool for document
ingestion -- never fall back to write_file."

Flow:
1. Agent (LLM) baut `header_content` (Frontmatter + Overview +
   Kernaussagen).
2. Tool ruft `parseDocument(data, ext)` -- liefert PdfParser-Output
   mit `## Page N`-Headings pro Seite.
3. Tool appended Header + `\n\n---\n\n## Originaltext\n\n` + bereinigter
   Originaltext zur einer einzigen Markdown-Datei.

**Was funktioniert:** Originaltext enthaelt `## Page N`-Headings
deterministisch (durch parsePdf). Der Markdown-File hat damit Heading-
Anchors, auf die `[[file#Page 5]]` zeigen koennte.

**Was nicht funktioniert (Issue #11 Kern):**
- Block-IDs werden NICHT gesetzt. Kein Aufruf von `markBlockIds`.
- Page-Refs in den Kernaussagen werden NICHT systemisch injiziert. Sie
  existieren nur, wenn der Agent (LLM) sie selbst in `header_content`
  schreibt -- best-effort, ohne Helper.
- Tool-Description gibt dem Agent keine konkrete Anleitung, wie Page-
  Refs gesetzt werden sollen. Es fehlt: "fuer jede Aussage in den
  Kernaussagen, die aus einer Page X stammt, fuege `[[OUTPUT_BASENAME#Page X]]`
  ans Ende der Aussage."
- Kein Hinweis-System: das Tool extrahiert nicht, **welche Aussage von
  welcher Page kommt** -- der Agent muss das aus dem geparsten Originaltext
  manuell ableiten und macht es im Praxis-Test offenbar nicht.

User-Beobachtung "no page refs set in the summary note although settings
say it should" matcht diesen Pfad. `vaultIngest.pdfStrategy` ist hier
allerdings irrelevant -- das Setting wird nur in `ingest_deep` gelesen.
Die Erwartung "Settings sagen, es sollte" ist also auf einen Pfad
projiziert, der kein Setting konsultiert.

### Pfad B: `ingest_deep` (BA-25 Karpathy-Pattern)

[IngestDeepTool.ts](src/core/tools/vault/IngestDeepTool.ts).
Reine BA-25-Pipeline mit Output-Modi und Cluster-Routing. Konsumiert
`vaultIngest.pdfStrategy`.

Flow (siehe Hauptteil oben). Drei Probleme:
1. planGenerator-Default ist Stub ohne Position-Marker.
2. `cachedRead` auf PDF liefert Garbage (nur im `page-refs`-Pfad).
3. Source-Note-Body hardcoded leer (`body: ''` in DeepIngestPipeline).

**Was funktioniert:** PdfMarkdownMirror erzeugt korrekt Sibling-Mirror
bei opt-in. Block-IDs WOLLEN gesetzt werden, scheitern aber an
leerem Body.

**Was nicht funktioniert:** Sense-Making-Note enthaelt keine
Position-Marker. BlockIdSetter wird zwar aufgerufen, hat aber keine
Wirkung wegen leerem Source-Body.

### Pfad C: `ingest_triage` -- nicht relevant

[IngestTriageTool.ts](src/core/tools/vault/IngestTriageTool.ts) erzeugt
nur eine 10s-Triage-Karte (Markdown-Report mit Cluster-Match + Decision-
Log). **Kein Summary, keine Source-Note.** Faellt aus dem Issue-#11-Scope.

### Pfad D: FrontmatterIndexer + SummaryGenerator -- nicht relevant

[SummaryGenerator.ts](src/core/ingest/SummaryGenerator.ts) erzeugt
nur Frontmatter-Summary (max 25 Woerter, ein Satz) fuer Note-Metadata.
Position-Marker sind hier per Design nicht vorgesehen. Faellt aus dem
Issue-#11-Scope.

### Konsolidierte Befunde

| Pfad | Tool | Bug | Issue-#11-Relevanz |
|----|----|----|----|
| A | `ingest_document` | Keine systemischen Page-Refs; Agent muss best-effort raten; kein Position-Hint-Helper | KRITISCH (vermutlich der getestete Pfad) |
| B | `ingest_deep` | planGenerator-Stub ohne Marker; PDF binar gelesen; leerer Source-Body | KRITISCH (BA-25 Karpathy-Pattern, Versprechen aus FEAT-19-28) |
| C | `ingest_triage` | -- | nicht relevant |
| D | SummaryGenerator | -- | nicht relevant |

### Erweiterter Scope von FIX-19-28-01

Der ursprueng-formulierte Scope deckte nur Pfad B. Erweiterung auf Pfad A:

In-Scope (zusaetzlich zur ursprueng. Liste):
6. `ingest_document` Tool-Description-Update mit klarer Page-Ref-Konvention.
   Beispiel-Wortlaut, das der Agent fuer jede Kernaussage einen
   `[[OUTPUT_BASENAME#Page X]]`-Marker setzt.
7. Helper `extractPagePositionsFromIngestText(text: string): Map<sentenceFragment, page>`
   der aus dem `## Page N`-strukturierten Originaltext eine Map fuer den
   Agent erzeugt. Tool gibt diese Map als Tool-Hint mit aus, der Agent
   nutzt sie beim Schreiben der Kernaussagen.
8. (Optional, Stretch) Post-Processing-Step im `ingest_document`-Tool, der
   nachtraeglich Page-Refs injiziert, falls der Agent sie vergessen hat
   (Heuristik: matche Aussage gegen Originaltext, wenn match auf einer
   bestimmten Page, append `[[basename#Page X]]`).

Out-of-Scope bleibt: LLM-Hook fuer planGenerator (separates IMP),
Transkript-Pfad (separates FEAT), sprechende Block-IDs (separates ADR).

### Updated Akzeptanzkriterien

| ID | Criterion | Pfad |
|----|----|----|
| AC-01 | `ingest_document`-Output enthaelt pro Kernaussage mindestens eine `[[basename#Page N]]`-Ref | A |
| AC-02 | `ingest_deep`-Output: Sense-Making-Note enthaelt pro Take-Away `#page=N` (PDF-Default) oder `#^block-N` (MD/Mirror) | B |
| AC-03 | `ingest_document`-Tool-Description enthaelt Page-Ref-Konvention | A |
| AC-04 | Helper `extractPagePositions` ist deterministisch und idempotent | A |
| AC-05 | DeepIngestPlan-Schema kennt Position pro Take-Away (Discriminated Union) | B |
| AC-06 | Source-Note-Body in DeepIngestPipeline ist nicht mehr `''`, sondern echter Source-Inhalt | B |
| AC-07 | Re-Run desselben Ingests aendert Block-IDs nicht (Idempotenz aus ADR-103 bleibt) | B |
| AC-08 | Beide Pfade haben Integration-Tests, die das Vorhandensein von Position-Markern verifizieren | A + B |
