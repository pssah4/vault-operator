---
id: FIX-19-28-03
feature: FEAT-19-28
epic: EPIC-19
adr-refs: [ADR-103]
plan-refs: []
depends-on: [FIX-19-28-01]
created: 2026-05-08
---

# FIX-19-28-03: PdfMarkdownMirror schreibt UTF-8-Mojibake

## Symptom

Live-Test 2026-05-08 (`/ingest-deep` auf
`Attachements/enbw-geschaeftsbericht-2025.pdf`, branch
`feature/block-source-citations`). Die geschriebene Mirror-Datei
`Sources/EnBW-Geschaeftsbericht-2025-Mirror.md` enthaelt durchgaengig
doppelt-encodiertes UTF-8.

Beispiele aus dem User-Sample:

- `GeschÃ¤ftsbericht` statt `Geschaeftsbericht`
- `â¬` statt `Euro-Zeichen`
- `1â2` statt `1-2`, `2024â2030` statt `2024-2030`
- `MarktfÃ¼hrer`, `KapitalerhÃ¶hung`, `RÃ¼ckert-Hennen`

User sieht Mojibake im Editor und in Reading-Mode. Frontmatter ist
ebenfalls betroffen (`title: EnBW GeschÃ¤ftsbericht 2025 â Mirror`).
Block-Anchors `^block-N` sind syntaktisch unbeschaedigt.

## Root cause -- konsolidiert mit FIX-19-28-01

Diagnose 2026-05-08: gemeinsame Wurzel mit FIX-19-28-01 und FIX-19-28-04.
Der `/ingest-deep`-Skill instruiert `ingest_deep` als Tool-Call. Das
Tool ist aber nicht in `TOOL_GROUP_MAP`
(`src/core/modes/builtinModes.ts:20-32`), also nicht im
Function-Schema des Agent-Modes verfuegbar. Der LLM faellt zurueck
auf `read_document` + `write_vault` und schreibt den Mirror selbst.

Beim manuellen LLM-Pfad reserialisiert der Provider (Bedrock,
`eu.anthropic.claude-sonnet-4-6` laut Cost-Log) den extrahierten
PDF-Text. UTF-8-Bytes aus `read_document` werden als Latin-1
interpretiert, dann wieder UTF-8-encodiert -- klassisches
Mojibake-Pattern.

```
read_document liefert UTF-8 PDF-Text
  -> LLM-Stream serialisiert ihn (Provider-spezifisch)
  -> write_vault content-Argument enthaelt Mojibake
  -> vault.create persistiert es
```

Der deterministische Pfad `PdfMarkdownMirror.ts` waere immun: dort
geht `parsedDocument.text` direkt in `vault.create`, ohne LLM-Roundtrip.
Mit dem Tool-Group-Fix in FIX-19-28-01 verschwindet der Bug damit
automatisch.

Resttest noetig: bestaetigen, dass `PdfMarkdownMirror.ts` selbst kein
Mojibake produziert (separater Smoke-Test gegen ein Umlaut-PDF). Wenn
der deterministische Pfad clean ist, ist FIX-19-28-03 ein reines
Folge-Symptom von FIX-19-28-01.

## Fix

Offen. Vorschlag:

1. Reproduce: kleinen Smoke-Test gegen ein PDF mit Umlauten, das
   `PdfMarkdownMirror` direkt mit dem PDF-Text-Output befuettert und
   pruefen, ob Mojibake bereits dort entsteht (Pre-Provider) oder erst
   nach dem Provider-Roundtrip (Post-LLM).
2. Wenn Pre-Provider: Encoding-Konvertierung im Mirror-Builder
   reparieren (`Buffer.from(text, 'utf8').toString('utf8')` statt
   impliziter Latin-1-Pfad).
3. Wenn Post-Provider: AgentTask Tool-Argument-Deserialization
   pruefen, insb. wenn Bedrock event-stream chunks zusammengefuegt
   werden ohne UTF-8-aware-Concat.

Implementation pointer: noch offen, abhaengig vom Reproducer.

## Regression test

Smoke-Test, der einen synthetischen Mini-PDF-Text (`"Geschaeftsbericht"`
mit echtem ae) durch den Mirror-Builder schickt und assertiert, dass
der Output exakt `"Geschaeftsbericht"` ist. Plus Re-Run gegen
`Attachements/enbw-geschaeftsbericht-2025.pdf` mit Assertion: kein
`Ã¤`/`Ã¶`/`Ã¼`/`â¬` in der Mirror-Datei.

## Status

See the backlog row for FIX-19-28-03 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
