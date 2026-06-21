---
id: FIX-06-01-01
epic: EPIC-06
feature: FEAT-06-01
adr-refs: []
plan-refs: []
depends-on: []
audit-refs: [STABILITY-AUDIT-v2.14.0-2026-06-21]
created: 2026-06-21
---

# FIX-06-01-01: parseDocument plugin-ref-drift -- PDF parsing globally broken

## Symptom

[Issue #36](https://github.com/pssah4/vault-operator/issues/36): alle PDFs liefern den Placeholder `(PDF Parser is not installed...)` obwohl das `pdfjs-bundle.js` als Optional Asset installiert ist. Reichweite ist groesser als beim Issue beschrieben -- Stabilitaets-Audit 2026-06-21 hat bestaetigt: fuenf Call-Sites von `parseDocument` rufen ohne `plugin`-Argument auf. Der Placeholder wandert dadurch in den Vektor-Index (SemanticIndexService.embedFile), in den Markdown-Mirror (PdfMarkdownMirror), in den Ingest-Pfad (SourceReader -> IngestDocumentTool/IngestDeepTool) und in den Agent-Read-Pfad (ReadDocumentTool). Folge: PDF-Embeddings sind potenziell korrupt, PDF-Mirror-Notes enthalten Placeholder statt Inhalt, Agent sieht beim `read_document` immer "not installed".

## Root Cause

`src/core/document-parsers/parseDocument.ts:25` hat `plugin` als OPTIONALEN Parameter:
```ts
export async function parseDocument(data: ArrayBuffer, extension: string, plugin?: ObsidianAgentPlugin): Promise<ParseResult>
```

Wenn ein Caller die Funktion ohne `plugin` aufruft, fliesst der `plugin?.bundleLoader`-Check in `parsePdf` (PdfParser.ts:39) durch und gibt den `NOT_INSTALLED_PARSE_RESULT` zurueck -- silent, kein Error. Der TypeScript-Compiler kann den Drift nicht erkennen.

Call-Sites OHNE plugin (broken bei PDFs):
- `src/core/tools/vault/ReadDocumentTool.ts:194`
- `src/core/tools/vault/IngestDocumentTool.ts:249`
- `src/core/ingest/PdfMarkdownMirror.ts:72`
- `src/core/ingest/SourceReader.ts:39`
- `src/core/semantic/SemanticIndexService.ts:1562`

Call-Sites MIT plugin (funktionieren):
- `src/ui/sidebar/AttachmentHandler.ts:132 / 209 / 238`

## Fix

Strukturell: `plugin` wird zum REQUIRED-Parameter in `parseDocument` und `parsePdf`. Der Compiler erzwingt damit alle Call-Sites, plugin durchzureichen, und das Drift-Pattern kann nicht wiederkehren.

Konkrete Aenderungen:
1. **`src/core/document-parsers/parseDocument.ts`**: Signatur `plugin: ObsidianAgentPlugin` (required).
2. **`src/core/document-parsers/parsers/PdfParser.ts`**: Signatur `plugin: ObsidianAgentPlugin` (required), Null-Check entfaellt.
3. **`src/core/tools/vault/ReadDocumentTool.ts`**: `parseDocument(data, ext, this.plugin)`.
4. **`src/core/tools/vault/IngestDocumentTool.ts`**: `parseDocument(data, ext, this.plugin)`.
5. **`src/core/ingest/PdfMarkdownMirror.ts`**: Constructor um `plugin: ObsidianAgentPlugin` erweitert; `parseDocument(arrayBuf, 'pdf', this.plugin)`; alle Aufrufer der Klasse mit plugin nachzuiehen.
6. **`src/core/ingest/SourceReader.ts`**: `readSourceAsMarkdown(app, file, plugin)`; alle Aufrufer (IngestDeepTool, IngestDocumentTool, SummaryPositionAnnotator).
7. **`src/core/semantic/SemanticIndexService.ts`**: `SemanticIndexOptions` um `plugin?: ObsidianAgentPlugin` erweitert (uebergangsweise optional am Service, aber required ab parseDocument), main.ts gibt es beim Konstruktor-Aufruf rein.

## Akzeptanzkriterien

- TypeScript-Compiler weist jeden `parseDocument`-Aufruf ohne plugin als Fehler aus.
- Regression-Test pinnt: `parsePdf` ohne `plugin.bundleLoader` wirft TS-Compile-Error (nicht-mehr stilles Placeholder).
- Live-Test (manuell): @pdf-Mention im Chat liest echten PDF-Inhalt; `read_document` Tool liest echten PDF-Inhalt; PDF im Vault wird im SemanticIndex mit echtem Text indiziert.

## Out of Scope (Follow-up als separater IMP)

- One-time-Cleanup: `SemanticIndexService.reindexPdfsOnly()` mit Progress + Macro-Yield, "Reindex PDFs only"-Button im EmbeddingsTab, `PdfReindexHintModal` mit `_pdfReindexHintShown` + `_pdfReindexCompleted`-Flags. -> IMP-06-01-01.
