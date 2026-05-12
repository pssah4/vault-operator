# ADR-63: Context Externalization -- Dateisystem als erweiterter Kontext

**Date:** 2026-04-04
**Deciders:** Sebastian Hanke
**Feature:** FEAT-18-02 (Context Externalization)

## Context

Tool-Results (search_files: 50 Matches, semantic_search: 10 Excerpts mit je 2000 chars,
read_file: bis 20.000 chars) akkumulieren in der Conversation History. Bei 8 Iterationen
wachsen die Input-Tokens von 28k auf 200k+. Die History wird bei jedem API-Call komplett
neu gesendet.

Bisherige Ansaetze (In-Place-Compression, Truncation) verletzen entweder das Append-only-
Prinzip (Cache-Invalidierung) oder fuehren zu Informationsverlust.

Manus Context Engineering zeigt einen besseren Weg: Das Dateisystem als erweiterten
Kontext nutzen. Grosse Daten in Dateien auslagern, im Kontext nur eine kompakte Referenz
mit den wichtigsten Informationen behalten. Der Agent kann bei Bedarf nachladen.

**Triggering ASR:**
- C-4: Context Externalization als einheitliches Pattern in der Pipeline
- Quality Attributes: Cost Efficiency, Consistency, Maintainability

## Decision Drivers

- **Einheitliches Pattern**: Alle Tools, eine Stelle, ein Verhalten
- **KV-Cache-Kompatibilitaet**: Append-only, keine History-Manipulation
- **Wiederherstellbarkeit**: Externalisierte Daten muessen nachladbar bleiben
- **Qualitaetserhalt**: Agent muss alle Informationen erreichen koennen
- **Wartbarkeit**: Kein Tool-spezifischer Sondercode

## Considered Options

### Option 1: Tool-spezifische Optimierung

Jedes Tool optimiert seinen eigenen Output: search_files gibt weniger Results,
semantic_search kuerzere Excerpts, read_file kuerzere Inhalte.

- Pro: Einfachste Implementierung (Limits pro Tool anpassen)
- Pro: Kein neuer Mechanismus noetig
- Con: Inkonsistent (jedes Tool anders)
- Con: Loest das Problem nicht fundamental (50 vs 15 Matches sind beide zu viel bei 8 Iterationen)
- Con: Informationsverlust (kuerzere Results = weniger Kontext)

### Option 2: Zentrale Externalization in der ToolExecutionPipeline

NACH der Tool-Ausfuehrung und VOR dem Zurueckgeben des Results: Pipeline
prueft die Groesse. Wenn ueber Threshold: Schreibt volles Result in temp-Datei,
gibt kompakte Referenz zurueck. Einheitliches Pattern fuer alle Tools.

- Pro: Eine Stelle, alle Tools
- Pro: Tools muessen nicht geaendert werden
- Pro: Append-only (Referenz wird von Anfang an in die History geschrieben)
- Pro: Wiederherstellbar (Datei bleibt nachladbar)
- Con: Erfordert temp-Datei-Management (Schreiben, Cleanup)
- Con: Agent muss verstehen dass er nachladen kann

### Option 3: Lazy Result Loading (Results nie in History, immer on-demand)

Tool-Results werden IMMER in Dateien geschrieben. In der History steht NUR
eine Referenz. Agent muss jeden Result per read_file nachladen.

- Pro: Minimale History (nur Referenzen)
- Pro: Konsequentestes Modell
- Con: Mehr Iterationen (Agent muss nachladen = mehr LLM-Calls)
- Con: Widerspricht dem Ziel weniger Iterationen
- Con: Kleine Results (200 chars) unnoetig externalisieren

## Decision

**Vorgeschlagene Option:** Option 2 -- Zentrale Externalization in der Pipeline

**Begruendung:**

Option 1 loest das Problem nicht fundamental. Option 3 ist zu radikal und
erzeugt mehr Iterationen. Option 2 ist der Sweet Spot: Kleine Results bleiben
im Kontext (schneller Zugriff), grosse Results werden externalisiert (Token-Ersparnis).
Ein einheitliches Pattern in der Pipeline verhindert inkonsistentes Verhalten.

**Konkreter Ablauf:**

```
Tool.execute() liefert Result (voller Inhalt)
    ↓
ToolExecutionPipeline prueft Groesse:
    ↓
result.content.length <= EXTERNALIZE_THRESHOLD (2000 chars)?
    JA → Normales Result (unveraendert in History)
    NEIN ↓
        1. Schreibe volles Result in temp-Datei:
           .obsidian-agent/tmp/{taskId}/{tool}-{iteration}.md
        2. Erstelle kompakte Referenz:
           "[{tool}] {summary}. Full results saved to: {path}"
           + Top-N Items mit Score/Relevanz (tool-spezifisch)
        3. Gib Referenz als tool_result zurueck
    ↓
History erhaelt entweder volles Result oder kompakte Referenz
(Append-only -- einmal geschrieben, nie geaendert)
```

**Tool-spezifische Referenz-Generierung:**

```typescript
interface ExternalizationFormatter {
    /** Generate a compact reference for the externalized result. */
    formatReference(toolName: string, result: string, tempPath: string): string;
}

// Default: Erste 500 chars + Dateipfad
// search_files: "Found N matches. Top 5: [path (count)]... Full: {path}"
// semantic_search: "N results. Top 3: [path (score)]... Full: {path}"
// web_fetch: "Fetched {url} (N chars). Summary: {first 500 chars}... Full: {path}"
// read_file: "Content of {path} ({N chars}). Headings: {h1, h2...}. Use read_file({path}) to re-read."
```

**Sonderfaelle:**
- **Fast Path (ADR-61):** Waehrend einer Fast-Path Batch-Execution wird
  Externalization DEAKTIVIERT. Der Batch hat nur 2-3 Calls, die Results
  akkumulieren kaum. Der Presenter-Call braucht die vollen Inhalte um eine
  qualitativ hochwertige Zusammenfassung zu erstellen. Externalization lohnt
  sich erst bei 5+ Iterationen (normale ReAct-Loop).
- **Tool Result Cache:** Cached das VOLLE Result (vor Externalization). Wiederholter
  identischer Call liefert gecachtes volles Result → wird erneut externalisiert
  (deterministische, identische Referenz).

## Implementation Sketch

### Neue Dateien
- `src/core/tool-execution/ResultExternalizer.ts` -- Groessencheck + Datei-Write + Referenz-Generierung

### Geaenderte Dateien

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `ToolExecutionPipeline.ts` | Nach Tool-Ausfuehrung: ResultExternalizer aufrufen | Low |
| `AgentTask.ts` | taskId an Pipeline uebergeben (fuer temp-Pfad) | Low |
| `main.ts` | Cleanup verwaister tmp-Verzeichnisse beim Plugin-Start | Low |

### Nicht geaendert
- Alle Tool-Implementierungen (SemanticSearchTool, SearchFilesTool, etc.)
- RecipeMatchingService, RecipeStore
- systemPrompt.ts
- MemoryRetriever

### Temp-Datei Management

```
Schreiben: GlobalFileService.write(`tmp/${taskId}/${tool}-${iteration}.md`, content)
Cleanup (nach Task): GlobalFileService.remove(`tmp/${taskId}/`) rekursiv
Crash-Recovery: Beim Plugin-Start alle `tmp/` Unterverzeichnisse aelter als 1h loeschen
```

## Consequences

### Positive
- 50-70% weniger History-Tokens bei Multi-Step-Tasks
- Einheitliches Pattern fuer alle Tools (eine Stelle im Code)
- KV-Cache-stabil (Append-only, keine History-Manipulation)
- Wiederherstellbar (Agent kann nachladen)
- Kein Tool muss geaendert werden

### Negative
- Zusaetzliche Datei-I/O (Schreiben + ggf. Nachladen)
- Agent muss "lernen" dass er nachladen kann (Referenz-Format muss selbsterklaerend sein)
- Temp-Dateien im .obsidian-agent/ Verzeichnis

### Risks
- **Agent laed nie nach**: Referenz-Format enthaelt expliziten Hinweis
  "Use read_file({path}) to see full results". Im Prompt-Routing-Rules
  wird ergaenzt: "When a tool result contains a file reference, use read_file
  to load the full content if needed."
- **Temp-Dateien haeufen sich an**: Mitigation durch Task-Level-Cleanup
  und Crash-Recovery beim Start.
- **EXTERNALIZE_THRESHOLD zu niedrig/hoch**: Konfigurierbarer Threshold
  mit konservativem Default (2000 chars). Kann spaeter angepasst werden.

## Related Decisions

- ADR-01: ToolExecutionPipeline (Externalization wird hier integriert)
- ADR-61: Fast Path (profitiert: weniger Tokens im Planner-Kontext)
- ADR-62: KV-Cache-Optimized Prompt (komplementaer: Prompt stabil, Results extern)
- ADR-12: Context Condensing (wird seltener noetig wenn Results extern sind)

## References

- FEAT-18-02: Context Externalization
- Manus Context Engineering: "Use the filesystem as context"
- Manus: "Our compression strategies are always designed to be recoverable"

## Implementation Notes (2026-04-05)

Implemented as designed with these additions:
- Tool-Routing-Rules updated with externalization hint (point 10 in guidelines)
- read_file results ARE externalized (changed from original "never externalize")
- File naming uses global call counter instead of iteration (prevents collisions)
- Externalization disabled during Fast Path batch (ADR-61 interaction)

Measured: 601k chars externalized in a complex task, preventing ~1M+ token accumulation.

## Revision (2026-04-29) -- read_file/read_document excluded again

**Trigger:** Meeting-Summary (50 min Transcript, 20.237 chars) dauerte 5+ Minuten
statt 30-90 Sekunden. Token-Verbrauch: 759k in / 18k out fuer eine Aufgabe, die
unter 30k Token loesbar sein muss.

**Root Cause:** Die Implementation Note vom 2026-04-05 hat das urspruengliche
ADR-Design (read_file NICHT externalisieren) ohne dokumentierte Begruendung
umgekehrt. In Kombination mit der "Use read_file to re-read the full content"-
Botschaft im Referenz-Format und dem Tool-Result-Cache entstand eine Sackgasse:

```
read_file -> externalize -> 400-char preview im Kontext
agent: "Inhalt fehlt, ich lade nach"
read_file (gleicher Pfad) -> Cache HIT -> identische 400-char preview
agent: search_files / read_document / spawn_subtask -> alle laufen in dieselbe Falle
```

Bei summarisierenden Aufgaben (Meeting-Summary, Translate, Refactor) braucht
der Agent den vollen Inhalt im Kontext -- eine Vorschau ist konzeptionell falsch.
Die ursprungliche Designentscheidung war richtig.

**Aenderung:**
- `read_file` und `read_document` zurueck in `SKIP_EXTERNALIZATION`
- `MAX_CONTENT_CHARS` in ReadFileTool von 20k auf 50k angehoben (Claude-Code-aligned,
  deckt typische 60-90min Transcripts ohne Truncation)
- Truncation-Hint "Use search_files for specific content" nur noch bei > 10% Overflow
  (verhindert Schnitzeljagd bei 1% Overflow)

**Erwartete Auswirkung:** Meeting-Summary auf typische Transcript-Groesse zurueck
auf 30-90s. Externalization wirkt weiterhin fuer search_files/semantic_search/
web_fetch, wo der Agent Top-K-Treffer und nicht den Volltext braucht.

**Verworfene Alternativen:**
- Threshold pro Tool (zu komplex, ueberlebt nicht)
- Truncation auf 100k erhoehen ohne SKIP (loest die Cache-Sackgasse nicht)
- Cache fuer read_file deaktivieren (versteckt das Symptom, nicht die Ursache)

Key files:
- `src/core/tool-execution/ResultExternalizer.ts` (externalization logic)
- `src/core/tool-execution/ToolExecutionPipeline.ts` (integration point)
- `src/core/prompts/sections/toolDecisionGuidelines.ts` (agent instruction)

## Amendment 2026-05-12 (EPIC-24 / FEAT-24-03): Externalization im allgemeinen Hauptloop + Re-Read-Cap + grosse User-Messages

**Befund (5-Provider-Messlauf 2026-05-12):** ADR-63 (Option 2, zentrale Externalization in der Pipeline) ist umgesetzt und greift -- mit zwei Luecken:

1. **Externalize -> sofortiges Re-Read = No-Op.** In 4 von 5 Test-Sessions schrieb der Externalizer ein Such-/Semantic-Result in eine tmp-Datei + gab eine kompakte Referenz zurueck -- und der Agent las unmittelbar danach die ganze tmp-Datei via `read_file` zurueck. Da `read_file` in `SKIP_EXTERNALIZATION` ist (Revision 2026-04-29), bleibt der Volltext dann ungekuerzt in der History. Der Brocken wird also nur eine Message weiter geschoben, nicht entfernt. Im 5. Test (Gemini) hat der Agent die tmp-Datei nicht zurueckgelesen -- eine reichhaltigere Referenz haette gereicht.
2. **Externalization wirkt heute nur im FastPathExecutor und in der Pipeline fuer Such-/Semantic-/Web-Tools -- nicht gegen grosse reingepastete oder @-mentionte User-Message-Inhalte.** Im 58-Msg-Messchat war Message #0 (urspruengliches Briefing-Material) 78k Tokens, Message #22 (eine reingepastete XML) 25k Tokens -- die fahren fuer immer im Volltext mit. Der `truncateTextFileForContext`-Cap (80k Chars) greift pro Datei und nicht bei direktem Paste / Multi-Mention.

**Entscheidung (ergaenzt ADR-63 additiv, kein Supersede):**

1. **Re-Read-Cap fuer externalisierte tmp-Dateien:** liest der Agent eine vom Externalizer erzeugte tmp-Datei zurueck, unterliegt *dieser* Read demselben Externalize-/Cap-Mechanismus (Top-K bzw. gekappter Auszug + Pointer), statt den Volltext erneut in die History zu legen -- so bleibt die Externalization ein echter Gewinn statt eines Verschiebebahnhofs.
2. **Reichhaltigere kompakte Referenz** (mehr Top-Treffer / Headings / Metadaten) + Prompt-Leitplanke: "die tmp-Datei nur nachlesen, wenn du einen konkreten Abschnitt brauchst, der nicht in der Referenz steht" -- damit der Re-Read seltener ueberhaupt passiert.
3. **Grosse reingepastete/@-mentionte User-Message-Inhalte beim Reinkommen kappen + externalisieren:** Inhalt oberhalb einer Token-Schwelle (Richtwert ~12-16k Tokens, gesamt ueber alle Anhaenge einer Message, nicht pro Datei) wird in eine tmp-Datei ausgelagert; in der Message bleibt ein Auszug + Pointer ("read_file path=..."). Gilt fuer direkten Paste und @-Mention gleichermassen -- also auch fuer den Pfad, den `truncateTextFileForContext` heute nicht abdeckt.
4. **Generalisierung des Externalizers auf den allgemeinen ReAct-Loop:** das in Option 2 entschiedene Pipeline-Externalization-Pattern wird auch dort wirksam, wo es heute nicht greift (grosse `web_fetch`/`web_search`-Results im normalen Loop, grosse Edit-`old_str`/`new_str`-Bloecke + Erfolgs-Diffs).
5. **Harte Per-Tool-Output-Caps als zweite Verteidigungslinie (Claude-Code-Vorbild):** unabhaengig vom Externalizer bekommt jeder Tool-Result-Typ eine harte Obergrenze fuer den Inhalt, der ueberhaupt in die History gelangt (z.B. `read_file` bei der bestehenden 50000-Chars-Grenze, Bash-/Command-Output bei einer Zeilen-/Zeichengrenze, Such-/Listen-Tools bei einer Treffer-Obergrenze) -- mit einem Hinweis, wie der Agent gezielt nachladen kann (paginieren, eingrenzen). Der Externalizer fasst grosse Results in eine tmp-Datei plus Referenz; die Per-Tool-Caps verhindern, dass ein einzelner Result trotzdem riesig durchgeht (z.B. ein Tool, das vom Externalizer ausgenommen ist). Beide zusammen: Externalizer als Primaer-Mechanismus, Caps als Bodenplatte.

**Abgrenzung:** Die 2026-04-29-Revision (`read_file`/`read_document` bleiben in `SKIP_EXTERNALIZATION`, weil summarisierende Aufgaben den Volltext *im Turn* brauchen) bleibt gueltig. Die Akkumulation grosser Read-Results ueber Turns hinweg wird nicht hier, sondern in ADR-12 (Amendment "Microcompaction") geloest: der Volltext bleibt im Turn, der ihn nutzt, wird danach auf ein Skelett eingedampft. FIX-18-02-01 (PDF-Attachments mehrfach im Kontext) ist eine Auspraegung von Punkt 3/4 und wird hier mitgeloest (deshalb superseded).

**Implementation Notes (2026-05-12, kann veralten):** `ResultExternalizer.ts` (Re-Read-Erkennung am tmp-Pfad-Praefix; Referenz-Format in den `format*Ref`-Funktionen anreichern), `ToolExecutionPipeline.ts` (Externalizer-Aufruf auch im Hauptloop, nicht nur FastPath), `AttachmentHandler.ts` (`truncateTextFileForContext` -> Gesamtbudget statt pro-Datei, auch fuer Paste), Prompt-Leitplanke in `toolDecisionGuidelines.ts`. Diagnose: `logInputBreakdown` (`[InputBreakdown]`). Verwandt: ADR-12 (Microcompaction-Amendment), FEAT-24-03, FIX-24-03-01, FIX-24-03-02, RESEARCH-36 (Befund C/E).
