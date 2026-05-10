# IMP-19-08-01: Strukturierter Output-Parser fuer Summary-Prompt

**Prioritaet:** P2
**Feature-Bezug:** FEAT-19-08 (Konfigurierbarer Standard-Prompt fuer Note-Summary), EPIC-19

## Problem

FEAT-19-08 ist als Done markiert (UI/Setting reif), aber
`SummaryGenerator` ([SummaryGenerator.ts:42](src/core/ingest/SummaryGenerator.ts#L42)) reduziert den Output via
Prompt-Wortlaut auf "**einen** Satz, max 25 Woerter, deutsch". Der
in den Settings konfigurierbare Default-Prompt fragt aber nach
Keywords, Themen, Konzepten -- diese Felder werden nie strukturiert
weiterverarbeitet.

Folge: das Frontmatter-Schema kann nur `summary: <einen Satz>`
sicher fuellen. Themen, Konzepte, Personen-Referenzen aus dem User-
konfigurierbaren Prompt werden vom System ignoriert.

## Scope

1. `SummaryGenerator` produziert strukturierten Output (JSON oder
   Frontmatter-Block) statt eine 25-Wort-Zusammenfassung.
2. Output-Schema (in den Settings einstellbar):
   ```yaml
   summary: <Satz>
   keywords: [<...>]
   topics: [<...>]
   concepts: [<...>]
   persons: [<...>]
   ```
3. Frontmatter-Writer (FEAT-19-09 / 10) nimmt diese Felder
   strukturiert in das Note-Frontmatter auf.
4. Backwards-Compatibility: bestehende `summary`-Strings bleiben
   unveraendert, neue Felder werden ergaenzt (Conflict-Detection
   ueber ADR-95).

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | SummaryGenerator-Output ist parse-bar als strukturiertes Objekt |
| AC-02 | Frontmatter erhaelt keywords, topics, concepts, persons |
| AC-03 | User-Custom-Prompt mit erweitertem Schema wird respektiert |
| AC-04 | Default-Prompt-Schema lebt in Settings, nicht im Code |

## Files

- `src/core/ingest/SummaryGenerator.ts`: Output-Format auf JSON
  umstellen.
- `src/core/ingest/FrontmatterWriter.ts`: erweiterte Felder
  schreiben.
- `src/ui/settings/VaultTab.ts`: Default-Schema in Settings-Section
  ergaenzen.
