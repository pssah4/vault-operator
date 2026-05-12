---
id: PLAN-18
title: EPIC-24 Welle 1 -- Cache-Praefix-Stabilisierung, Microcompaction, Tool-Output-Disziplin, Bedrock cachePoint
date: 2026-05-12
feature-refs: [FEAT-24-01, FEAT-24-02, FEAT-24-03]
adr-refs: [ADR-62, ADR-63, ADR-12, ADR-111]
fix-refs: [FIX-24-01-01, FIX-24-03-01, FIX-24-03-02]
imp-refs: [IMP-24-05-01, IMP-18-01-02]
supersedes: null
superseded-by: null
pair-id: sebastian-opus-4-7
---

# PLAN-18: EPIC-24 Welle 1

<!-- Backlog row carries status/phase/claim/SHAs: grep "PLAN-18" _devprocess/context/BACKLOG.md -->

## Kontext

EPIC-24 (Agent-Loop Effizienz) ist der Nachfolger von EPIC-18. Ausloeser: der Input-Token-Verbrauch
ist nicht tragbar (Beispiel-Chat ~42 EUR fuer 6 Turns dialogischer Notizarbeit). Der 5-Provider-Messlauf
vom 2026-05-12 (Diagnose-Log `src/api/logCacheStat.ts`, `[CacheStat:<provider>]`, plus `[InputBreakdown]`)
hat zwei Treiber isoliert:

1. **Tool-Result-Akkumulation in der History (dominanter Treiber, RESEARCH-36 Befund C).** `read_file` ist
   auf 50 000 Chars/Datei gekappt, aber 4 Reads in einem Turn = ~31k Tokens; nach dem Turn keine
   Komprimierung, also waechst die History monoton. Ein 58-Msg-Chat landete bei `hist=138652t`. Die
   Keep-First-Last-Voll-Compaction (ADR-12) triggert erst bei ~70 % des Kontextfensters -- zu spaet.
2. **Caching greift auf dem Anthropic-Direkt-Pfad faktisch nicht (RESEARCH-36 Befund A/B/D).** `anthropic.ts`
   setzt 1 `cache_control`-Marker auf den GANZEN System-Prompt-String inkl. volatilem Tail
   (DateTime/Memory/ActiveSkills/Recipe/VaultContext) -> Call 2 = `cacheRead=0, cacheCreate=21479`
   (Miss + Re-Write) -> wegen +25 % Write-Aufschlag teurer als ohne Caching. Bedrock injiziert gar keinen
   `cachePoint` -> `cacheRead=0` UND `cacheCreate=0` durchgehend. Auto-Caching-Provider (Copilot/OpenAI/
   OpenRouter) erreichen dagegen 75-99 % Hit ab Call 2.

Welle 1 setzt die ADR-Amendments von 2026-05-12 um: ADR-12-Amendment (Microcompaction + Rolling-Summary),
ADR-63-Amendment (Externalizer im Hauptloop + Re-Read-Cap + grosse User-Messages + Per-Tool-Caps),
ADR-62-Amendment + ADR-111 (Cache-Praefix-Split, DateTime tagesgranular, `tools`-Feld-Marker,
rollende History-Marker, Bedrock `cachePoint`, `cached_tokens`-Wiring). Kein Neubau, keine SDK-Umstellung
-- additive Disziplin-Aenderungen am bestehenden Loop.

## Scope

**In:**
- Diagnose-Patches (logCacheStat + logInputBreakdown-Signaturwechsel + 6 Provider-Edits) committen (IMP-24-05-01).
- Microcompaction der Tool-Results an Turn-Grenzen + Rolling-Summary alter Turn-Bloecke (FEAT-24-02 / ADR-12-Amendment).
- Externalizer im allgemeinen ReAct-Loop, Re-Read-Cap fuer externalisierte tmp-Dateien, reichhaltigere Referenz,
  Prompt-Leitplanke, harte Per-Tool-Output-Caps, grosse Paste-/@-Mention-User-Messages kappen + externalisieren
  (FEAT-24-03 / ADR-63-Amendment, inkl. FIX-24-03-01 und FIX-24-03-02).
- Cache-Praefix-Stabilisierung: provider-seitiger Split am `── CACHE BREAKPOINT ──`, DateTime tagesgranular als
  Default, `cache_control` auf dem letzten `tools`-Eintrag, 1-2 rollende Cache-Marker in der Message-History
  (FEAT-24-01 / ADR-62-Amendment, inkl. FIX-24-01-01).
- Bedrock `cachePoint`-Marker im Request + `cached_tokens` der OpenAI-Familie in `usage`-Chunk und
  Kostenrechnung verdrahten + Kilo-Gateway/Copilot-Passthrough verifizieren (IMP-18-01-02 / ADR-111).

**Out (Welle 2/3, eigene PLANs):**
- Subagent-Delegation (FEAT-24-04 / ADR-113), Sidebar-Kosten-Anzeige (FEAT-24-05), Lazy-Loading Tool-Schemas
  inkl. MCP-Deferral (FEAT-24-06 / ADR-117), Hilfs-Modell-Routing (FEAT-24-07 / ADR-115), Autonomie-Governance
  (FEAT-24-08 / ADR-114), Active-Skills on-demand (FEAT-24-09 / ADR-116).
- Plan-Modus (Hebel F) -- bewusst out-of-scope (Entscheidung Sebastian 2026-05-12).
- Retrieval-/Knowledge-Layer-Tuning (Memory-v2-Roadmap).

## Tasks

Reihenfolge nach steigendem Risiko und steigender Verflechtung. Build (`npm run build`) + Deploy
(`npm run deploy`) nach jedem Task; `npm test` am Task-Ende.

### Task 1 -- IMP-24-05-01: Diagnose-Patches committen

Der Working-Tree hat die bereits deployten Diagnose-Aenderungen uncommitted. Diese zuerst als eigener
`chore(diagnostics)`-Commit sichern, damit die folgenden Tasks auf sauberem Stand aufsetzen.

- Modify (bereits geaendert, nur committen): `src/api/logCacheStat.ts` (neu), `src/core/utils/logInputBreakdown.ts`
  (Signatur `toolCount: number` -> `tools: unknown[]`, gibt `toolSchemas=<n>t/<count>` aus), `src/core/AgentTask.ts`
  (3 Call-Sites von `logInputBreakdown` reichen jetzt `tools` bzw. `[]` durch), `src/api/providers/anthropic.ts`,
  `src/api/providers/bedrock.ts`, `src/api/providers/openai.ts`, `src/api/providers/github-copilot.ts`,
  `src/api/providers/kilo-gateway.ts`, `src/api/providers/chatgpt-oauth.ts` (jeweils `logCacheStat`-Aufruf).
  Hinweis: der Working-Tree enthaelt zusaetzlich `model-registry.ts`/`ModelConfigModal.ts`/`settings.ts`/
  `obsidianConventions.ts`/`AttachmentHandler.ts`/`truncatedToolInputError.test.ts`/`model-registry.test.ts`
  -- das ist der separate "Write file"-Bugfix (Memory-Eintraege 2026-05-11). VOR dem Commit pruefen, ob der
  in einem eigenen Commit landen soll oder schon committed war; nicht mit dem Diagnose-Commit vermischen.
  -> AskUserQuestion falls unklar.
- Verify: `npm run build`, `npm test` (Baseline 1346+ green erhalten).

### Task 2 -- FEAT-24-02: Microcompaction der Tool-Results an Turn-Grenzen + Rolling-Summary

Setzt ADR-12-Amendment um. Additiv zur bestehenden Keep-First-Last-Voll-Compaction (bleibt als Notnagel
bei ~70 %).

- Create: `src/core/context/MicroCompactor.ts` (oder `src/core/MicroCompactor.ts` -- Pfad in /coding final)
  mit `microcompactToolResults(history: MessageParam[], opts): { prunedBlocks: number; freedCharsApprox: number }`.
  Logik: ueber alle Turns ausser dem juengsten -- jeden `tool_result`-Block, dessen Volltext laenger als eine
  Schwelle ist (Richtwert ~1500 Chars), durch ein Skelett ersetzen: kompakte Zusammenfassung + Pointer im Stil
  der Externalizer-Referenzen (`[read Notes/X.md -- 50000 chars; ggf. read_file path=...]`,
  `[semantic_search 'X' -- 34 Treffer; ggf. tmp/...]`). `tool_use`/`tool_result`-Skelett (IDs, Tool-Name)
  bleibt erhalten -- Pairing-Invariante (BUG-017) nicht verletzen. NICHT komprimiert: erste User-Message,
  Assistant-Text, der juengste vollstaendige Turn.
- Create: `src/core/context/__tests__/MicroCompactor.test.ts` -- Skelett-Format, Pairing bleibt intakt,
  erste User-Message unangetastet, juengster Turn unangetastet, idempotent (zweiter Lauf ist No-Op).
- Modify: `src/core/AgentTask.ts` -- `microcompactToolResults(history, ...)` am Turn-Ende aufrufen, dort wo
  heute der text-only-Turn-Condensing-Check laeuft (~Z. 657 ff. und der zweite Pfad ~Z. 894 ff.: nach dem
  `tool_result`-Push und vor dem naechsten `createMessage`). Plus zweite Stufe Rolling-Summary: sobald
  `estimateTokens(history)` eine *unter* `condensingThreshold` liegende Marke ueberschreitet (neue Setting,
  Default grosszuegig, z.B. 40 % des Kontextfensters), den aeltesten Teil vor dem Smart-Tail inkrementell
  ueber `condenseHistory()` zusammenfassen -- dieselbe Mechanik, nur frueher und schrittweise.
- Modify: `src/types/settings.ts` -- neue Settings `microcompactionEnabled` (boolean, Default true),
  `rollingSummaryThreshold` (number %, Default ~40); ADR-12-Amendment-Risiko-Mitigation: optional
  `microcompactMinTurnAge` (Default z.B. 1 -- nur Tool-Results aelter als N Turns prunen).
- KV-Cache-Vertraeglichkeit: Microcompaction veraendert die History rueckwirkend, invalidiert den Cache ab
  der ersten geaenderten Message. Akzeptabel laut ADR-12-Amendment (passiert an Turn-Grenzen, der stabile
  System-Prompt-Praefix bleibt unberuehrt). In den Code-Kommentar uebernehmen.
- Verify: `npm run build`, `npm test`. Manuell: `[InputBreakdown]`-Log -- ein 4-Datei-Read-Turn endet bei
  ~48k, der unmittelbar folgende Turn startet unter ~20k.

### Task 3 -- FEAT-24-03: Externalizer im Hauptloop, Re-Read-Cap, Per-Tool-Caps, grosse User-Messages

Setzt ADR-63-Amendment um. Superseded FIX-18-02-01. Loest FIX-24-03-01 (Externalize->Re-Read-No-Op) und
FIX-24-03-02 (iCloud-tmp-EPERM).

- Modify: `src/core/tool-execution/ResultExternalizer.ts`
  - Re-Read-Cap: erkennt am tmp-Pfad-Praefix (`DEFAULT_TMP_ROOT` / `getTmpRoot`), wenn ein `read_file`-Input
    auf eine vom Externalizer erzeugte Datei zeigt; dann unterliegt *dieser* Read demselben Externalize-/
    Cap-Mechanismus (gekappter Auszug + Pointer) statt den Volltext erneut in die History zu legen --
    dafuer muss `read_file` fuer diesen Sonderfall aus `SKIP_EXTERNALIZATION` ausgenommen werden (die
    2026-04-29-Revision bleibt sonst gueltig: regulaere `read_file`/`read_document` bleiben in der Skip-Liste,
    weil summarisierende Aufgaben den Volltext im Turn brauchen).
  - Reichhaltigere Referenz in den `format*Ref`-Funktionen (`formatSearchFilesRef`, `formatSemanticSearchRef`,
    `formatReadFileRef`, `formatWebRef`, `formatDefaultRef`): mehr Top-Treffer / Headings / Metadaten.
  - FIX-24-03-02: `cleanup()`/`removeWithRetry()` -- EPERM auf iCloud-Pfaden non-fatal abfangen und nur
    `console.debug` loggen statt zu werfen (ist es teilweise schon -- pruefen und haerten); ggf. tmp-Root
    ausserhalb iCloud legen (`getTmpRoot` pruefen).
- Modify: `src/core/tool-execution/ToolExecutionPipeline.ts` -- der Externalizer-Aufruf (~Z. 388 ff.) laeuft
  schon zentral fuer alle Tool-Results; ergaenzen: harte Per-Tool-Output-Caps als zweite Verteidigungslinie
  *vor* dem Externalize-Schritt (unabhaengig davon, ob das Tool externalisiert wird): `read_file`/`read_document`
  bei der bestehenden 50 000-Chars-Grenze (zentralisieren statt nur im Tool), Bash-/Command-Output bei einer
  Zeilen-/Zeichengrenze, Such-/Listen-Tools bei einer Treffer-Obergrenze -- jeweils mit Hinweis im
  Result-Text, wie der Agent gezielt nachladen kann (paginieren, eingrenzen). Caps als Bodenplatte, Externalizer
  als Primaer-Mechanismus.
- Modify: `src/ui/sidebar/AttachmentHandler.ts` -- `truncateTextFileForContext` bzw. die `clean`/`process`-Pfade:
  Cap auf *Gesamtbudget ueber alle Anhaenge einer Message* (Richtwert ~12-16k Tokens, nicht pro Datei) statt
  pro-Datei `CONTEXT_DOCUMENT_CHAR_LIMIT`; gilt auch fuer direkten Paste, nicht nur @-Mention; Inhalt oberhalb
  der Schwelle in eine tmp-Datei externalisieren (denselben `ResultExternalizer`/tmp-Root wiederverwenden),
  in der Message bleibt Auszug + Pointer (`read_file path=...`). `CONTEXT_DOCUMENT_CHAR_LIMIT` in
  `src/core/document-parsers/types.ts` ggf. ergaenzen um eine token-orientierte Gesamtgrenze.
- Modify: `src/core/prompts/sections/toolDecisionGuidelines.ts` -- Prompt-Leitplanke: "eine externalisierte
  tmp-Datei nur nachlesen, wenn du einen konkreten Abschnitt brauchst, der nicht in der Referenz steht; das
  Material steht schon zusammengefasst da". (Hinweis: der Working-Tree hat `obsidianConventions.ts` schon
  geaendert -- pruefen, ob die Leitplanke dorthin oder nach `toolDecisionGuidelines.ts` gehoert; nicht doppeln.)
- Modify/Create tests: `src/core/tool-execution/__tests__/ResultExternalizer.test.ts` (Re-Read-Erkennung,
  reichhaltigere Referenz), neue Tests fuer Per-Tool-Caps in der Pipeline, AttachmentHandler-Gesamtbudget-Test.
- Verify: `npm run build`, `npm test`. Manuell: ein Recherche-Turn mit 3 `web_fetch` bleibt unter ~120k Input;
  eine User-Message mit angehaengtem Material ueberschreitet nie ~20k Tokens; ein zurueckgelesenes
  externalisiertes Result fuegt nicht den Volltext erneut in die History (`[InputBreakdown]`).

### Task 4 -- FEAT-24-01: Cache-Praefix-Stabilisierung (Anthropic) + DateTime tagesgranular + tools-Marker + History-Marker

Setzt ADR-62-Amendment um. Loest FIX-24-01-01.

- Modify: `src/core/systemPrompt.ts` -- einen echten Sentinel emittieren statt nur des Kommentars. Neue
  exportierte Konstante `export const CACHE_BREAKPOINT_MARKER = '\n<<<CACHE_BREAKPOINT>>>\n'` (Wert in /coding
  final); als eigenen Eintrag zwischen Section 8 (Security boundary) und Section 9 (Plugin Skills) in das
  `sections`-Array einsetzen. Der Marker ist eine eindeutige Zeile, die im gerenderten String steht und vom
  Provider gefunden + gestrippt werden kann. (Drift-Befund 2026-05-12: die ADR-62-Amendment-Impl-Note nannte
  die Kommentarzeile als Anker, die steht aber nicht im Output -- dieser Task ist die Aufloesung.)
- Modify: `src/core/prompts/sections/dateTime.ts` -- `getDateTimeSection(includeTime = false)` als Default
  (Datum, kein Time-of-Day); Time-of-Day nur wenn `includeTime === true` explizit gesetzt. `systemPrompt.ts`
  und alle Aufrufer pruefen, dass `includeTime` nicht versehentlich immer true durchgereicht wird.
- Modify: `src/api/providers/anthropic.ts`
  - System-Prompt-Split: statt `[{ type:'text', text: systemPrompt, cache_control }]` ->
    am `CACHE_BREAKPOINT_MARKER` splitten; `[{ type:'text', text: stabilerTeil, cache_control: ephemeral },
    { type:'text', text: volatilerTeil }]` (Marker selbst entfernen). Falls Marker fehlt (Fallback): wie bisher
    der ganze String mit cache_control (Verhalten nicht verschlechtern).
  - `cache_control` zusaetzlich auf dem letzten Eintrag des `anthropicTools`-Arrays (Anthropic erlaubt einen
    Breakpoint auf dem letzten Tool) -- ~30k Tokens, heute ungecacht.
  - Rollende Cache-Marker in `anthropicMessages`: heute wird nur die letzte User-Message markiert. Ergaenzen:
    einen zweiten Marker auf einem aelteren Stabilpunkt (z.B. dem `tool_result`-Block N Turns zurueck), so dass
    auch der Konversationsteil langer Sessions ueberwiegend Cache-Reads erzeugt. Anthropic-Limit: max 4
    cache_control-Breakpoints insgesamt (System-Block + tools + 2 in der History = 4, passt).
  - Diagnose: `logCacheStat` bleibt; erwarteter Effekt -- ab Call 2 `cacheRead > 0` statt erneutem `cacheCreate`.
- Modify: `src/api/providers/kilo-gateway.ts` -- gleiche Split-/Marker-Mechanik, weil Request-Format
  Anthropic-kompatibel (ADR-111 R-2: per Live-Test verifizieren, bei `cacheRead=0` ueber 3 Iterationen wieder
  rausnehmen bzw. `cacheStyle`-Eintrag in `src/api/capabilities.ts` anpassen).
- Modify (falls noetig): `src/core/__tests__/systemPrompt.test.ts` -- der Marker steht jetzt im Output;
  Test anpassen + neuen Test, dass der Split am Marker den stabilen Teil korrekt von Section 9 ff. trennt.
- Modify: `src/api/providers/__tests__/` -- Anthropic-Provider-Test fuer den 2-Block-System-Param und den
  tools-Marker (sofern Provider-Tests existieren; sonst Unit-Test fuer eine extrahierte Split-Hilfsfunktion).
- Verify: `npm run build`, `npm test`. Manuell: Anthropic-direkt 2x denselben kurzen Task -- `[CacheStat:anthropic]`
  zeigt `hitRate > 50%` ab Call 2 statt `cacheCreate=21479`.

### Task 5 -- IMP-18-01-02: Bedrock cachePoint + cached_tokens-Wiring + Passthrough verifizieren

Setzt ADR-111 / IMP-18-01-02 um (Status "Active" im Backlog, nie codiert -- in Welle 1 mit-erledigen).

- Modify: `src/api/providers/bedrock.ts` -- vor dem `ConverseStreamCommand`-Aufruf explizite `cachePoint`-
  ContentBlocks setzen (AWS-SDK-Typ `ContentBlock.cachePoint`): einen am Ende des stabilen System-Prompt-Teils
  (am `CACHE_BREAKPOINT_MARKER` splitten wie bei Anthropic -- `system` ist bei Converse ein Array von
  `SystemContentBlock`, dazwischen passt ein `cachePoint`) und einen am letzten User-Message-Block. Gesteuert
  durch `cacheStyle === 'bedrock-cachepoint'` aus `src/api/capabilities.ts` und `promptCachingEnabled`.
  Diagnose: `logCacheStat` zeigt jetzt `cacheRead`/`cacheCreate > 0` statt durchgehend 0. ADR-111 R-1: bei
  `cacheReadInputTokens: 0` ueber 3 Iterationen das Modell-Pattern in `capabilities.ts` auf `false` setzen.
- Modify: `src/api/providers/openai.ts` -- `cached_tokens` aus `usage.prompt_tokens_details.cached_tokens`
  wird bereits ausgelesen (Diagnose-Patch). Sicherstellen, dass es auch in den `usage`-ApiStreamChunk als
  `cacheReadTokens` weitergereicht wird (heute setzt der Chunk nur `inputTokens`/`outputTokens` -- ergaenzen)
  und damit ueber `AgentTask.totalCacheReadTokens` -> `onUsage` -> `TaskMonitor`/`TaskTelemetry` ->
  `computeCost` (`ModelPricing.ts` hat `cacheReadPerMillionUsd`) korrekt verrechnet wird. Effekt: `[Cost]`-Zeile
  zeigt `cacheR=<n>` statt 0; angezeigte Kosten sinken auf den realen Wert.
- Modify: `src/api/providers/github-copilot.ts`, `src/api/providers/kilo-gateway.ts` -- denselben
  `prompt_tokens_details.cached_tokens` -> `usage`-Chunk-Pfad, falls die Upstream-API ihn liefert (Copilot mit
  Claude-Modell tut es, mit GPT-mini nicht -- siehe `capabilities.ts`). Passthrough von `cache_control` (Kilo)
  per Live-Test bestaetigen.
- Modify: BACKLOG -- IMP-18-01-02 Status `Active` -> `Done` (mit PLAN-18 + Commit-SHA), nachdem Live-Test
  `cacheReadInputTokens > 0` auf Bedrock bestaetigt; ADR-111 Status `Proposed` -> `Accepted`.
- Verify: `npm run build`, `npm test`. Manuell: Bedrock 2x denselben Task -> `[CacheStat:bedrock] hitRate > 0`;
  OpenAI -> `[Cost] cacheR > 0`.

## Verification (Plan done)

- `npm run build` -- gruener Build (Schritt 1, immer).
- `npm test` -- alle Tests gruen, Baseline (1346+) erhalten oder erhoeht; neue Tests fuer MicroCompactor,
  ResultExternalizer Re-Read, Per-Tool-Caps, AttachmentHandler-Gesamtbudget, systemPrompt-Marker.
- `npm run deploy` nach jedem Task; manueller Messlauf im Vault (`[CacheStat:*]` + `[InputBreakdown]`):
  - Anthropic-direkt: `hitRate > 50%` ab Call 2 (statt `cacheCreate`-Reload).
  - Bedrock: `cacheRead > 0`.
  - OpenAI/Copilot: `[Cost] cacheR > 0`, angezeigte Kosten am realen Wert.
  - 4-Datei-Read-Turn: Folge-Turn startet unter ~20k statt mit ~48k im Schlepptau.
  - 10-Turn-Chat: `hist`-Anteil deutlich unter linearem Wachstum.
- Akzeptanzkriterien aus FEAT-24-01/02/03 (Richtwerte, da SC `[AWAITING RE]`): siehe jeweilige Spec.
- `/consistency-check` Mode A am Phasenende; danach `/testing` + `/security-audit` (V-Model-Checkliste).

<!--
=========================================================
Below this line: required sections for traceability. Do not remove.
=========================================================
-->

## Coverage Gate

> Wird ausgefuellt, bevor der Backlog-Status auf Active flippt.

- [x] SC coverage: FEAT-24-01/02/03 haben `[AWAITING RE]`-SC -- die Richtwerte aus den Specs sind in
      "Verification (Plan done)" gemappt; keine SC deferred.
- [x] ADR alignment: ADR-12 -> Task 2; ADR-63 -> Task 3; ADR-62 -> Task 4; ADR-111 -> Task 5.
- [x] Codebase anchoring: jede Task nennt konkrete Pfade.
- [x] Verify commands: `npm run build`, `npm test`, `npm run deploy` + manueller Messlauf.

| FEATURE-SC | Task in this plan | Status |
|---|---|---|
| FEAT-24-01 (cacheRead>0 ab Call 2, [Cost] cacheR korrekt, Kosten am realen Wert) | Task 4 (+ Task 5 fuer Cost-Wiring) | Mapped (Richtwert, SC AWAITING RE) |
| FEAT-24-02 (4-Datei-Turn ~48k -> Folge-Turn <20k, 10-Turn-Chat sublinear, keine Qualitaetsregression) | Task 2 | Mapped (Richtwert, SC AWAITING RE) |
| FEAT-24-03 (3x web_fetch <120k, User-Message-Material nie >20k, kein Re-Read-Volltext) | Task 3 | Mapped (Richtwert, SC AWAITING RE) |
| FIX-24-01-01 (cache_control auf ganzem System-Prompt-String) | Task 4 | Mapped |
| FIX-24-03-01 (Externalize->Re-Read No-Op) | Task 3 | Mapped |
| FIX-24-03-02 (iCloud-tmp-EPERM) | Task 3 | Mapped |
| IMP-24-05-01 (Diagnose-Log committen) | Task 1 | Mapped |
| IMP-18-01-02 (Bedrock cachePoint, OpenAI cached_tokens, Passthrough) | Task 5 | Mapped |

| ADR referenced | Task that operationalizes it |
|---|---|
| ADR-12 (Microcompaction + Rolling-Summary Amendment) | Task 2 |
| ADR-63 (Externalizer im Hauptloop Amendment) | Task 3 |
| ADR-62 (Cache-Praefix-Stabilisierung Amendment) | Task 4 |
| ADR-111 (Bedrock cachePoint, Capability-Tabelle, cached_tokens) | Task 5 |

## Change Log

Append-only.

### 2026-05-12: Plan created

Initial version. EPIC-24 Welle 1, 5 Tasks. Reconciliation-Befund (1, in METRICS.md 2026-05-12 vermerkt):
ADR-62-Amendment-Impl-Note nennt die `── CACHE BREAKPOINT ──`-Kommentarzeile als Split-Anker, die steht
aber nicht im gerenderten System-Prompt-String -> in Task 4 als exportierte `CACHE_BREAKPOINT_MARKER`-Konstante
aufgeloest. Sonst alle Amendments deckungsgleich mit dem Code-Stand. Status bleibt Draft bis zum User-Review.

## Implementation Notes

Ausgefuehrt 2026-05-12 (Status Done). Per-Task-Commits auf `feature/epic-24-agent-loop-effizienz`:

- Task 1 (IMP-24-05-01): `4a5023a` -- die uncommitteten Diagnose-Patches + der 2026-05-11
  max_tokens-Auto/Truncation-Recovery-Bugfix als eine `chore`-Baseline committed (liessen sich nicht
  per-Hunk trennen, beide vor-bestehend, beide bereits deployt). Kein neuer Code.
- Task 2 (FEAT-24-02): `bd33928` -- `src/core/context/MicroCompactor.ts` (neu) + `AgentTask.microcompact()`
  am Turn-Ende + `AgentTask.maybeRollingSummary()` (gentler/frueher als das 70%-Voll-Condensing) +
  Settings `microcompactionEnabled`/`rollingSummaryThreshold`. ARCHITECTURE.map: `microcompaction`-Row +
  `context-condensing`-Row auf `AgentTask.condenseHistory` korrigiert (stale `ContextCondenser.ts`-Ref).
- Task 3 (FEAT-24-03 + FIX-24-03-01 + FIX-24-03-02): `6a62cec` -- ResultExternalizer Re-Read-Cap
  (`isExternalizedPath` + `formatReReadCap`) + reichere `format*Ref` + ToolExecutionPipeline
  `HARD_OUTPUT_CAP_CHARS=60000` + AttachmentHandler `TOTAL_ATTACHMENT_CHAR_BUDGET=64000` (per-Compose-Turn,
  auch fuer externe/gepastete Dateien) + `toolDecisionGuidelines`-Leitplanke. FIX-24-03-02 war bereits
  durch BUG-023 (`removeWithRetry`/`cleanupOrphaned`) abgedeckt -- nur Kommentar-Referenz.
- Task 4 (FEAT-24-01 + FIX-24-01-01): `31b4bef` -- `CACHE_BREAKPOINT_MARKER` + `splitSystemPromptAtCacheBreakpoint`
  in `systemPrompt.ts`; `anthropic.ts` 2-Block-System-Param + `cache_control` auf letztem `tools`-Eintrag +
  2 rollende History-Marker (`markRollingHistoryBreakpoints`); `dateTime.ts` tagesgranular als Default,
  `includeCurrentTimeInContext` default -> false (steuert nur noch die Time-of-Day-Zeile), i18n-Label angepasst.
  ARCHITECTURE.map: `kv-cache-prompt`-Row.
- Task 5 (IMP-18-01-02): `22270ec` -- `bedrock.ts` `cachePoint`-Bloecke (nach stabilem System-Prefix, nach
  `tools`, nach letzter User-Message; gated durch `capabilities.getCacheCapability(...).cacheStyle === 'bedrock-cachepoint'`);
  `openai.ts`/`github-copilot.ts`/`kilo-gateway.ts`: `prompt_tokens_details.cached_tokens` als `cacheReadTokens`
  in den `usage`-Chunk, `inputTokens` = non-cached (Anthropic-Konvention) -> `computeCost` bucht den
  gecachten Prefix zum Read-Tarif statt Vollpreis.

**Abweichungen vom PLAN:** (a) Reconciliation-Befund 2026-05-12 -- der "CACHE BREAKPOINT" war nur ein
Code-Kommentar, nicht im gerenderten String; geloest wie geplant per echtem `CACHE_BREAKPOINT_MARKER`
(METRICS.md-Drift-Row). (b) Task 1 wurde als ein kombinierter Baseline-Commit gemacht statt zwei getrennten,
weil sich die beiden vor-bestehenden Aenderungssaetze (2026-05-11-Bugfix + Diagnose) in denselben Dateien
ueberlappten und ohne interaktives `git add -p` nicht sauber trennbar waren. (c) Kilo Gateway nutzt
OpenAI-Format (nicht Anthropic), daher dort kein `cache_control`-Marker -- profitiert automatisch vom
stabileren Prefix; nur das `cached_tokens`-Wiring wurde ergaenzt. (d) Plan-Coverage-Gate: alle SC sind
`[AWAITING RE]` -- die Richtwerte sind in "Verification (Plan done)" gemappt, keine SC deferred.

**Test-Delta:** 1378 -> 1392 gruen (+14: MicroCompactor 6, ResultExternalizer Re-Read/Default-Ref 2,
AttachmentHandler-Budget 6 -- die systemPrompt-Marker-Tests ersetzten den alten "no DateTime"-Test, netto 0
dort, 2 neue Marker/Split-Tests; Summe stimmt mit +14). Build gruen, Deploy nach jedem Task.

**Offen (-> /testing):** Live-Messlauf gegen echte Provider (`[CacheStat:*]` Anthropic hitRate > 50% ab Call 2,
Bedrock `cacheRead > 0`, OpenAI `[Cost] cacheR > 0`); Microcompaction-Wirkung im `[InputBreakdown]` (4-Datei-Turn
-> Folge-Turn unter ~20k); ADR-111 R-1 (Bedrock-Region/Modell) + R-2 (Kilo-Gateway-Passthrough).

**Cycle time:** first commit `c61ecb3` -> last commit `22270ec`, eine Session.
