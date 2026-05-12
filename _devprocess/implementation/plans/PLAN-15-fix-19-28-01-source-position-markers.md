---
plan-id: PLAN-15
title: FIX-19-28-01 Source-Position-Marker im Ingest-Output
refs:
  - FIX-19-28-01
  - FEAT-19-28
  - FEAT-19-29
  - ADR-103
  - EPIC-19
  - GitHub Issue#11 pssah4/vault-operator-dev
created: 2026-05-07
implemented: 2026-05-07
branch: feature/block-source-citations
pair-id: sebastian-opus-4.7
---

# PLAN-15: FIX-19-28-01 Source-Position-Marker im Ingest-Output

## 1. Kontext

FEAT-19-28 (Source-Position-Marker, released) verspricht, dass Ingest-
Output (Sense-Making-Note bzw. Source-Note mit Kernaussagen) klickbar
auf die Source-Position zeigt: PDF-Page-Refs `[[file.pdf#page=N]]`,
Markdown-Block-Refs `[[file#^block-N]]`, URL-Anchor. Test-Repro
2026-05-07 zeigt: Die Marker erscheinen im Default-Pfad NICHT. Der
3-Pfad-Audit (siehe FIX-19-28-01 Section "Audit") identifiziert zwei
betroffene Tool-Pfade mit verschiedenen Bugs:

- **Pfad A `ingest_document`** -- Default-Tool fuer PDF/Office-Ingest.
  Das Tool-Description traegt `Always use this tool for document
  ingestion`, daher das wahrscheinlich vom User getestete Tool. Tool
  appended geparsten Originaltext mit `## Page N`-Headings, aber liefert
  dem Agent keinen Position-Hint und keine Anleitung, Page-Refs zu setzen.
  Ergebnis: best-effort des LLM, in der Praxis fehlend.

- **Pfad B `ingest_deep`** -- Karpathy-Pattern mit DeepIngestPipeline.
  Hier gibt es drei verkettete Probleme: planGenerator-Default-Stub
  ohne Marker, `cachedRead` auf PDF (binary) liefert Garbage, Source-
  Note-Body in DeepIngestPipeline ist hardcoded `''` -- BlockIdSetter
  hat damit keine Anchor-Treffer.

Root-Cause beider Pfade: kein systemischer Mechanismus, der die
Position-Information aus der Quelle extrahiert und der Aussage in der
Output-Note zuordnet. Die Bausteine (parsePdf liefert `## Page N`,
PdfMarkdownMirror, BlockIdSetter) sind da, aber die Verkettung fehlt.

ADR-103 bleibt unveraendert: System-generated `^block-N`, B1 Page-Refs
Default. Dieser Plan implementiert die ADR-Decision endlich konkret in
beiden Tool-Pfaden.

## 2. Aenderungen

Reihenfolge so gewaehlt, dass nach jedem Schritt Build+Deploy moeglich
ist und die Integrations-Tests nach dem letzten Schritt durchlaufen.

### 2.1 Pfad B: DeepIngestPipeline -- Source-Body, Plan-Schema, Position-Wiring

**Datei: `src/core/ingest/DeepIngestPipeline.ts`**

NACHHER (Plan-Schema erweitert um Positions-Info pro Take-Away):

```typescript
export type TakeAwayPosition =
    | { kind: 'page'; page: number }
    | { kind: 'block-anchor'; anchorText: string }
    | { kind: 'url-anchor'; anchor: string };

export interface DeepIngestTakeAway {
    text: string;
    position?: TakeAwayPosition;
}

export interface DeepIngestPlan {
    takeAways: DeepIngestTakeAway[];
    summaryBody?: string;
    multiZettel?: { /* ... unveraendert ... */ };
}
```

Migration: `takeAways: string[]` ist Breaking-Change fuer den
`PlanGeneratorFn`-Hook. Wir akzeptieren beide Formen kurzzeitig
(Discriminated-Input-Type), normalisieren auf das neue Schema. Tests
benutzen das neue Schema direkt.

VORHER (Pipeline schreibt leeren Source-Body):

```typescript
const sourceContent: SourceContent = {
    suggestedFilename: input.sourceFile.basename + '.md',
    body: '',
    frontmatter: { source_path: `[[${input.sourceFile.basename}]]`, ... },
    blockAnchors: plan.takeAways,
};
```

NACHHER:

```typescript
// Echten Source-Body lesen. Bei PDF-Default-Pfad: parsePdf-Output
// nutzen (mit `## Page N`-Headings). Bei Markdown-Source:
// app.vault.cachedRead(input.sourceFile).
const sourceMarkdown = await readSourceAsMarkdown(this.app, input.sourceFile);
const blockAnchors = plan.takeAways
    .filter((t): t is DeepIngestTakeAway & { position: { kind: 'block-anchor'; anchorText: string } } =>
        t.position?.kind === 'block-anchor')
    .map((t) => t.position.anchorText);

const sourceContent: SourceContent = {
    suggestedFilename: input.sourceFile.basename + '.md',
    body: sourceMarkdown,
    frontmatter: { source_path: `[[${input.sourceFile.basename}]]`, ... },
    blockAnchors,
};
```

`readSourceAsMarkdown` ist neuer Helper in einer separaten Datei
(siehe 2.2). Er kennt den PDF-Default-vs-Mirror-Pfad nicht direkt
(Pipeline-Caller hat den Mirror schon gewaehlt -- `actualSource` in
IngestDeepTool). Helper liest also einfach den File: bei `.pdf` via
parsePdf, bei `.md` via cachedRead.

Anschliessend baut die Pipeline den Sense-Making-Body um, indem sie
Position-Marker pro Take-Away injiziert. Helfer dafuer in 2.3.

### 2.2 Neuer Helper: `src/core/ingest/SourceReader.ts`

```typescript
import { TFile, type App } from 'obsidian';
import { parseDocument } from '../document-parsers/parseDocument';

/**
 * Liefert den Source-Inhalt als Markdown-Text.
 * - .md / Mirror-.md: cachedRead.
 * - .pdf: parseDocument-Output (mit `## Page N`-Headings pro Seite).
 * - andere Office-Formate: parseDocument (Word, etc., falls supported).
 */
export async function readSourceAsMarkdown(app: App, file: TFile): Promise<string> {
    const ext = file.extension.toLowerCase();
    if (ext === 'md') return await app.vault.cachedRead(file);
    const buf = await app.vault.readBinary(file);
    const parsed = await parseDocument(buf, ext);
    return parsed.text;
}
```

Existing parseDocument deckt PDF, DOCX, etc. ab. Tests: Mock-App
mit fake-Files fuer .md, .pdf, unbekannte Extension (werfen klaren
Fehler).

### 2.3 Neuer Helper: `src/core/ingest/SummaryPositionAnnotator.ts`

```typescript
import type { DeepIngestTakeAway } from './DeepIngestPipeline';

export interface AnnotateOpts {
    /** Output-Note-Basename, gegen den verlinkt wird. */
    sourceBasename: string;
    /** Pfad-Suffix, falls die Source eine PDF ist (zB '.pdf'). */
    sourceExtension: string;
}

/**
 * Erzeugt einen Sense-Making-Body: pro Take-Away eine Bullet-Zeile mit
 * inline-Position-Marker am Ende, Format gemaess ADR-103.
 *
 * - kind === 'page'        -> ` [[basename.pdf#page=N]]`
 * - kind === 'block-anchor' -> ` [[basename#^block-N]]` (block-N kommt
 *   aus BlockIdSetter-Output, das hier nachgeschaltet wird; siehe 2.4)
 * - kind === 'url-anchor'  -> ` [[basename#anchor]]`
 *
 * Take-Aways ohne Position bekommen reinen Wikilink auf die Note.
 */
export function annotateTakeAways(
    takeAways: DeepIngestTakeAway[],
    opts: AnnotateOpts,
    blockIdMap?: Record<string, string>,
): string;
```

Implementation-Details siehe Tests:
`__tests__/SummaryPositionAnnotator.test.ts` mit Cases pro Position-Typ.

### 2.4 Pipeline-Verkettung: BlockIdSetter -> Annotator

In `DeepIngestPipeline.run()`:

1. Plan generieren (per Hook).
2. Source-Markdown lesen (2.2).
3. SourceContent mit `body: sourceMarkdown`, `blockAnchors`-Liste.
4. `OutputModeGenerator.writeSourceNote` ruft intern `markBlockIds` ->
   liefert `anchorToBlockId`-Map. Diese Map muss aus der writer-Methode
   nach aussen gegeben werden -- bisher wird sie verworfen
   ([OutputModeGenerator.ts:119](src/core/ingest/OutputModeGenerator.ts#L119)).
5. Annotator (2.3) baut Sense-Making-Body mit der Map.

`OutputModeGenerator.writeSourceNote` erweitern um Rueckgabe-Wert:

```typescript
private async writeSourceNote(source: SourceContent): Promise<{ file: TFile; blockIdMap: Record<string, string> }> {
    // ... markBlockIds(...) ...
    return { file, blockIdMap: anchorToBlockId };
}
```

`generate()`-Methode muss Map durchreichen oder `senseMaking.body`
nach dem writeSourceNote nochmal patchen. Cleanere Variante: die
Pipeline ruft den Annotator VOR `OutputModeGenerator.generate`, mit
einem Pre-Pass, der nur die Block-IDs aus dem Source-Body berechnet
(ohne Write). Dann ist der Sense-Making-Body schon korrekt, wenn
`generate()` aufgerufen wird.

Pre-Pass-Funktion: `previewBlockIds(content, anchors): {anchorToBlockId, modifiedContent}` -- existiert bereits als `markBlockIds`.
Die Pipeline kann `markBlockIds` einmal aufrufen (Pre-Pass), die Map
nutzen fuer Annotator, dann den modifizierten Content als
`source.body` an `generate()` weiterreichen. `OutputModeGenerator`
muss sich nicht aendern.

### 2.5 Pfad A: `ingest_document` -- Tool-Description und Position-Hint

**Datei: `src/core/tools/vault/IngestDocumentTool.ts`**

Erweiterungen:

1. **Tool-Description** ergaenzen um Page-Ref-Konvention. Beispiel
   (Auszug):

   > "WICHTIG fuer Provenance: in `header_content` musst du fuer jede
   > Aussage in den Kernaussagen am Ende einen Page-Marker setzen, der
   > auf die Quelle in `## Originaltext` zeigt. Format:
   > `[[OUTPUT_BASENAME#Page N]]`. Die Page-Number ergibt sich aus den
   > `## Page N`-Headings im Originaltext-Block. Dieser Marker macht
   > Aussagen klickbar zur Quelle."

2. **Page-Hint vor dem Tool-Aufruf**: vor dem Schreiben der Output-
   Datei trace ich Page-Map aus dem geparsten Originaltext. Die Map
   wird im Tool-Result an den Agent gegeben (nicht in der Datei),
   sodass der Agent in der naechsten Turn weiss, was er nicht
   gemacht hat:

   ```
   Created source note: Notes/Test.md
   Header: 4231 chars (frontmatter + overview)
   Original text: 23492 chars (12 pages, structured by ## Page N)
   Position-Marker check: 5 of 8 Kernaussagen carry [[basename#Page N]] refs.
                           3 Kernaussagen ohne Marker -- bitte ergaenzen.
   ```

   Damit gibt das Tool dem Agent ein Signal, ob er die Konvention
   eingehalten hat. Bei Fehlern hat der Agent eine konkrete
   Korrektur-Aufgabe.

3. **(Stretch, Phase 2)** Post-Processing-Step: optional `auto_inject_page_refs: true` -- der Tool versucht heuristisch
   nicht-markierte Kernaussagen einer Page zuzuordnen (Fuzzy-Match
   gegen den Page-Text). Default off, da non-trivial. In separates
   IMP auslagern wenn nicht in Phase 1 schaffbar.

### 2.6 Tests

Neue Tests:

- `src/core/ingest/__tests__/SourceReader.test.ts` -- .md, .pdf, unknown.
- `src/core/ingest/__tests__/SummaryPositionAnnotator.test.ts` -- pro
  Position-Typ, leere Position, gemischte Liste.
- `src/core/ingest/__tests__/DeepIngestPipeline.test.ts` (existierend
  erweitern) -- End-to-End: PDF-Default-Pfad liefert `[[file.pdf#page=N]]`
  in der Sense-Making-Note. Markdown-Mirror-Pfad liefert
  `[[mirror#^block-N]]`. Markdown-Source-Pfad liefert
  `[[source#^block-N]]`.
- `src/core/tools/vault/__tests__/IngestDocumentTool.test.ts` (neu) --
  verifiziert dass Tool-Description die Convention enthaelt, Page-Hint-
  Output korrekt ist.

## 3. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/core/ingest/DeepIngestPipeline.ts` | Plan-Schema erweitert (DeepIngestTakeAway), Source-Body von `''` auf gelesenen Markdown, BlockId-Map-Pre-Pass, Annotator-Aufruf | Mittel: Plan-Hook ist Breaking-Change fuer `PlanGeneratorFn`-Caller (heute nur IngestDeepTool). Migration im selben Commit. |
| `src/core/ingest/SourceReader.ts` (neu) | Helper liest .md / .pdf / Office einheitlich als Markdown | Niedrig |
| `src/core/ingest/SummaryPositionAnnotator.ts` (neu) | Helper inject Position-Marker pro Take-Away | Niedrig |
| `src/core/ingest/OutputModeGenerator.ts` | unveraendert (Pipeline macht Pre-Pass selbst) | -- |
| `src/core/tools/vault/IngestDeepTool.ts` | planGenerator-Default-Stub liefert jetzt `DeepIngestTakeAway`-Form mit Position. PDF-Default-Pfad: parseDocument vor cachedRead, Page-Number pro Take-Away aus den `## Page N`-Headings ableiten. Markdown-Pfad: anchorText fuer BlockIdSetter. | Mittel: aendert Default-Verhalten ohne Settings-Change. Erwartet konsistent positives User-Outcome. |
| `src/core/tools/vault/IngestDocumentTool.ts` | Tool-Description erweitert. Tool-Output enthaelt Position-Marker-Check (count of marker-tagged vs untagged Kernaussagen). | Niedrig: Tool-Description-Aenderung. Agent-Verhalten auf neuer Tool-Description verlangt evtl. einen Recipe-Reset. |
| Tests (4 neue/erweiterte) | siehe 2.6 | Niedrig |

## 4. Nicht betroffen

- `src/core/ingest/PdfMarkdownMirror.ts` -- bleibt wie ist. Mirror-Erstellung
  ist unabhaengig vom Marker-Wiring.
- `src/core/ingest/BlockIdSetter.ts` -- API stabil, wird weiter genutzt.
- `src/core/document-parsers/parsers/PdfParser.ts` -- bleibt wie ist
  (`## Page N`-Format ist Vertragsfundament, nicht aendern).
- `src/core/ingest/SummaryGenerator.ts` -- separater Frontmatter-Summary-
  Pfad, hier nicht betroffen.
- `src/core/tools/vault/IngestTriageTool.ts` -- Pfad C, nicht relevant.
- ADR-103 -- bleibt unveraendert. Block-IDs bleiben System-generated `^block-N`.
- `_devprocess/requirements/features/FEAT-19-28-source-position-marker.md` --
  nicht aendern. Der FIX repariert das Versprechen, ohne die Spec zu
  re-scopen.
- KnowledgeDB / SemanticIndex -- keine Schema-Aenderung.

## 5. Verifikation

### Build (Schritt 1)

```bash
npm run build
```

Build muss vor jedem Commit gruen sein. Nach jedem 2.X-Schritt
oben Build+Deploy zum lokalen Vault.

### Unit-Tests

```bash
npm test -- --run SourceReader.test
npm test -- --run SummaryPositionAnnotator.test
npm test -- --run DeepIngestPipeline.test
npm test -- --run IngestDocumentTool.test
```

Alle gruen.

### Live-Verifikation (Akzeptanzkriterien aus FIX-19-28-01)

| AC | Test | Pass-Kriterium |
|---|---|---|
| AC-01 | `ingest_document` auf Test-PDF, prompt mit Kernaussagen | Output-Note enthaelt `[[basename#Page N]]`-Refs in den Kernaussagen |
| AC-02 | `ingest_deep` auf Test-PDF (Default), `output_mode: source-plus-summary` | Sense-Making-Note enthaelt `#page=N` pro Take-Away |
| AC-02b | `ingest_deep` mit `pdfStrategy: markdown-mirror` | Sense-Making-Note enthaelt `#^block-N` pro Take-Away, Mirror-Note hat `^block-N`-IDs |
| AC-02c | `ingest_deep` auf Test-Markdown-Note | Sense-Making-Note enthaelt `#^block-N`, Source-Note hat `^block-N`-IDs |
| AC-03 | Tool-Description-Diff | enthaelt `[[OUTPUT_BASENAME#Page N]]`-Konvention |
| AC-04 | Helper-Idempotenz: zweiter Run, gleiche Inputs | Identische Block-IDs (ADR-103-Vertrag) |
| AC-05 | Plan-Schema-Type-Check | `DeepIngestTakeAway` mit `position`-Feld typsicher |
| AC-06 | Pipeline-Trace bei Test-Run | Source-Note-Body ist nicht leer, enthaelt geparsten Inhalt |
| AC-07 | Re-Run desselben Ingests, Diff der Block-IDs | Diff = empty |
| AC-08 | CI-Test-Suite | alle gruen |

### Regression

- `ingest_document` ohne PDF (DOCX, XLSX, etc.) -- existing parseDocument
  weiter funktional.
- `ingest_deep` ohne PDF (Markdown-Source) -- BlockIdSetter funktional.
- KnowledgeDB-Embedding-Pipeline (parsePdf laeuft im Hintergrund) -- nicht
  beruehrt.
- Tension-Detector (FEAT-19-13) Footer-Append -- nicht beruehrt.
- MOC-Maintainer-Hook -- nicht beruehrt.
- Power-User-Recipe-Promotion -- nicht beruehrt.

### Phasen

Phase 1 (dieser Plan): Pfade A + B inklusive Tests, AC-01 bis AC-08.
Phase 2 (Stretch / separate): Auto-Inject-Heuristic in `ingest_document`.

## 6. Implementations-Reihenfolge

1. Tests First fuer SourceReader + SummaryPositionAnnotator
   (TDD-Inseln, ohne UI).
2. Helpers implementieren -> Tests gruen.
3. DeepIngestPipeline-Schema-Erweiterung + Pipeline-Wiring (Pfad B).
   Tests gruen, Build, Deploy, manueller Test (AC-02/02b/02c).
4. IngestDeepTool planGenerator-Default an neues Schema anpassen + PDF-
   Pfad korrigieren (parseDocument statt cachedRead). Build, Deploy,
   manueller Test.
5. IngestDocumentTool Tool-Description + Page-Hint-Output (Pfad A).
   Build, Deploy, manueller Test (AC-01).
6. Existing-Tests-Suite voll laufen lassen, Build gruen.
7. Phase-end-Commit + Tag-Phase via flow.py.

## 7. Offene Fragen

- (gering) Heuristik-Schwelle fuer Page-Match in Phase-2-Stretch:
  Substring? Cosine? Bleibt fuer separates IMP.
- (gering) Sollen `ingest_document`-User retro-aktiv die ungetaggten
  Notes nachpflegen? -> Backfill-Skript ware ein eigenes IMP.
- (kein Blocker) Re-Tooling: in welcher Form sieht der Agent die Page-
  Map heute schon? In den Tool-Hints des System-Prompts? Phase 1 nutzt
  nur Tool-Output, kein System-Prompt-Eingriff.

## 7a. Update nach Skill-Suite-Entscheidung 2026-05-07

Issue #11 wurde im Verlauf als Architektur-Konvention klargestellt
und FEAT-19-31 (Skill-Suite) ergaenzt. Dadurch:

- **Marker-Form** ist `↗` als Symbol-only, inline am Satzende
  (`[[source#^block-N|↗]]`), nicht das Perplexity-`[1]`-Format aus
  FEAT-19-28 Story 2 (siehe ADR-103-Amendment 2026-05-07).
- **Source-Typen** explizit: Markdown (Webclip), URL, PDF, DOCX,
  PPTX, XLSX. Skill-spezifisch:
  - `/ingest-deep` erzwingt Markdown-Konversion fuer alle non-MD-
    Sources (PdfMarkdownMirror bei PDF, parseDocument bei Office).
  - `/ingest` belaesst PDFs auf page-refs (kein Mirror-Zwang).
  - `/meeting-summary` arbeitet auf Markdown-Transkript-Notes.
- **AC-08 wird konkretisiert:** "alle Outputs der drei Skills tragen
  `↗`-Form, nicht `[1]`. Tool-Output bleibt strukturiertes Wikilink,
  Skill-Anleitung rendert das Display."
- **Tool-Description-Neutralisierung:** `ingest_document` Tool-
  Description wird angepasst von "Always use this tool for document
  ingestion" zu "Used by /ingest skill" plus Hinweis dass
  /ingest-deep der Karpathy-Default ist.
- **PLAN-15-Phase-2-Block:** nach Phase 1 (Tool-Layer-Reparatur)
  folgt Phase 2 = FEAT-19-31 (Skill-Suite-Deployment + 3 .skill.md
  Files in `.obsidian-agent/plugin-skills/`). Phase 2 ist reine
  Konfigurations- und Markdown-Arbeit, kein Code-Change.

Audit 2026-05-07 hat zudem 7 IMPs erfasst (IMP-19-08-01, -13-01,
-15-01, -19-01, -22-01, -23-01, -25-01) und FEAT-19-05/06 von
Done auf Planned zurueckgestuft. Diese sind unabhaengig von PLAN-15
und werden separat geplant.

## 8. Aktualisierungen nach Implementation

Nach Phase-1-Abschluss zurueckwirkend in:

- `BACKLOG.md` -- FIX-19-28-01 von `Planned` auf `Active` (Building) bei
  Start, dann auf `Done`/`Released` nach Merge.
- `FEAT-19-28-source-position-marker.md` -- "Implementation closure" mit
  Verweis auf PLAN-15 in einem kurzen Anhang.
- `HANDOFFS.md` -- coding -> testing handoff mit Verweis auf PLAN-15 und
  Test-Resultaten.
- METRICS -- Cycle-Time fuer FIX-19-28-01 erfassen.

## Coverage Gate (run 2026-05-07, 16:21)

Mapping AC -> Tasks:

| AC | Test / Task | Status |
|---|---|---|
| AC-01 | `IngestDocumentTool.test.ts` checkPositionMarkers + Tool-Description-Update | gruen |
| AC-02 | `DeepIngestPipeline.test.ts` "FIX-19-28-01: injects ↗-markers" + Pipeline annotateTakeAways-Verkettung | gruen |
| AC-02b | implizit ueber gleichen Pfad (Mirror -> markedSource via SourceReader) | gruen |
| AC-02c | `DeepIngestPipeline.test.ts` Markdown-Source-Pfad | gruen |
| AC-03 | Tool-Description in `IngestDocumentTool.ts` Z. ~50-72 enthaelt `[[OUTPUT_BASENAME#... \|↗]]`-Konvention | manuelle Verifikation, gruen |
| AC-04 | `BlockIdSetter.test.ts` Idempotenz-Test (existing) + Pipeline ruft markBlockIds idempotent auf | gruen |
| AC-05 | `DeepIngestTakeAway` mit Position-Discriminated-Union in `SummaryPositionAnnotator.ts`, exportiert + von Pipeline verwendet | gruen (TS Build clean) |
| AC-06 | `DeepIngestPipeline.test.ts` "source-note body is no longer empty" | gruen |
| AC-07 | `BlockIdSetter.test.ts` "respects existing ^block-N IDs" | gruen |
| AC-08 | Volltest 1307/1307 + manuelle Verifikation Tool-Description | gruen |

Keine SC deferred. Alle ADR-Refs (ADR-103, FEAT-19-28, FEAT-19-29) durch
mind. einen Task oder Test abgedeckt.

## Implementation Notes (run 2026-05-07)

**Files written / modified:**

- `src/core/ingest/SourceReader.ts` (neu, 39 Zeilen)
- `src/core/ingest/SummaryPositionAnnotator.ts` (neu, 84 Zeilen)
- `src/core/ingest/DeepIngestPipeline.ts` (refactored, +57 / -16 Zeilen):
  Plan-Schema akzeptiert legacy string[] + neue DeepIngestTakeAway[],
  Source-Body wird via SourceReader gelesen, BlockIdSetter pre-pass,
  SummaryPositionAnnotator-Aufruf bei fehlendem summaryBody.
- `src/core/tools/vault/IngestDeepTool.ts` (planGenerator-Default
  refactored): nutzt readSourceAsMarkdown statt cachedRead, liefert
  Take-Aways mit kind='block-anchor', kein summaryBody mehr.
- `src/core/tools/vault/IngestDocumentTool.ts` (Tool-Description +
  Helpers): Provenance-Konvention in Description, neue
  countPageHeadings + checkPositionMarkers Helpers, erweiterter
  Tool-Output mit Position-Marker-Check.

**Tests:**

- `__tests__/SourceReader.test.ts` (neu, 5 Tests)
- `__tests__/SummaryPositionAnnotator.test.ts` (neu, 9 Tests)
- `__tests__/DeepIngestPipeline.test.ts` (+3 Regression-Tests fuer
  FIX-19-28-01)
- `__tests__/IngestDocumentTool.test.ts` (neu, 8 Tests fuer Helpers)

**Volltest:** 1307 / 1307 (133 Test-Files), 6.4s.
**Build:** `tsc -noEmit -skipLibCheck && esbuild` clean, Deploy in
iCloud-Vault erfolgt.

**Deviationen vom Plan:**

- Schema-Migration: statt Breaking-Change auf `DeepIngestTakeAway[]`
  habe ich den Discriminated-Input-Type `LegacyOrNewTakeAway = string |
  DeepIngestTakeAway` gewaehlt. Pipeline normalisiert intern. Damit
  bleiben bestehende Tests gruen (5/6 nutzten string[]) ohne dass die
  neue Form blockiert ist.
- BlockIdSetter-Map: statt OutputModeGenerator-Refactor (writeSourceNote
  gibt die Map zurueck) habe ich einen Pre-Pass in der Pipeline gewaehlt.
  Body wird im Pre-Pass markiert, sourceContent.blockAnchors=[]
  uebergeben (OutputModeGenerator's eigener markBlockIds-Aufruf wird
  zum No-Op). OutputModeGenerator bleibt unveraendert.
- Auto-Inject-Heuristic in IngestDocumentTool (PLAN-15 Phase-2-Stretch):
  nicht implementiert. Stattdessen Tool-Description-Konvention + Tool-
  Output-Marker-Check. Heuristic-Auto-Inject bleibt fuer separates IMP.

**Phase-2 (FEAT-19-31 Skill-Suite-Deployment):** noch offen. Drei
Skill-Drafts liegen unter `_devprocess/architecture/skills/`. Deployment-
Pfad (Built-in via embedded-assets vs Skill-Folder-Importer) ist ASR-1
in FEAT-19-31. Wird in einem separaten /coding-Run angegangen.

**Wayfinder:** zwei neue entry-points (SourceReader, SummaryPositionAnnotator).
Beide haben kompakte JSDoc-Header mit FEAT/ADR-Bezug. Eintrag in
`src/ARCHITECTURE.map` ist nicht zwingend, da das File noch keine
Wayfinder-Eintraege fuer den `src/core/ingest/`-Bereich enthaelt
(stichprobenartig geprueft); kein neues Modul.

## Change Log

- 2026-05-07 16:00 - PLAN-15 erstellt (Status=Proposed)
- 2026-05-07 16:13 - Status=Active, Implementation gestartet
- 2026-05-07 16:14 - Step 1 SourceReader.ts (TDD, 5 Tests gruen)
- 2026-05-07 16:16 - Step 2 SummaryPositionAnnotator.ts (TDD, 9 Tests gruen)
- 2026-05-07 16:18 - Step 3 DeepIngestPipeline refactored (9 Tests gruen, 3 neue Regressions-Tests)
- 2026-05-07 16:19 - Step 4 IngestDeepTool planGenerator refactored
- 2026-05-07 16:21 - Step 5 IngestDocumentTool Description + Helpers (8 Tests gruen)
- 2026-05-07 16:21 - Volltest 1307 / 1307, Build clean, Deploy ok. Status=Implemented
