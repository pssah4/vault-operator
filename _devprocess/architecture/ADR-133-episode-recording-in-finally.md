---
id: ADR-133
title: Episode-Recording im finally-Block plus indexEpisode-Success-Gate
date: 2026-06-07
deciders: [Sebastian, Architekt-Agent]
asr-refs: []
feature-refs: [FEAT-32-02]
related-adrs: [ADR-018, ADR-130, ADR-132, ADR-061]
supersedes: null
superseded-by: null
---

# ADR-133: Episode-Recording im finally-Block plus indexEpisode-Success-Gate

## Context

Der EpisodicExtractor ist heute der einzige Schreibpfad fuer Episode-Datensaetze. Der Aufruf passiert aus dem Success-Branch des AgentTask-Loops heraus, unmittelbar vor dem Return des Tool-Result-Loops. Das hat drei Schwachstellen:

1. **Iteration-Cap-Episoden verschwinden**: Wenn der Loop ohne attempt_completion an der Iteration-Limit-Grenze endet, faellt der Code nicht in den Success-Branch, sondern in einen Recovery-Branch, der recordEpisode nie ruft. Telemetrie verliert genau die Episoden, in denen der Agent steckenblieb -- die fuer Bug-Diagnose am interessantesten sind.
2. **FastPath-Episoden sind hohl**: FastPath ruft die Pipeline direkt. Der ToolRepetitionDetector laeuft nur im Hauptloop, also haben FastPath-Turns einen zu kurzen Tool-Sequence-Eintrag, was der Episode-Guard verwirft. Recipe-Promotion sieht nie ein FastPath-Pattern.
3. **indexEpisode pollutet MemoryRetriever**: Auch fehlgeschlagene Episoden landen im SemanticIndex unter dem `episode:`-Praefix. `MemoryRetriever` zieht sie als kontextrelevant heran und verschlechtert die Antwortqualitaet.

Zusaetzlich fehlt der Stigmergy-Decision-Snapshot im Episode-Datensatz vollstaendig. ADR-132 braucht ihn aber als Beweiskette fuer den Promotion-Shortcut.

**Triggering ASR:** EPIC-32 Contract 5 (Episode-Recording umfasst Stigmergy-Decision; sanitisiert, ohne sensitive Inhalte).

## Decision drivers

- **Vollstaendigkeit**: Alle Run-Ausgaenge (success, iteration-limit, abort) erzeugen ein Episode-Record.
- **Trennung Telemetrie vs. Index**: Fail-Episoden bleiben in der DB fuer Telemetrie, werden aber nicht semantisch indiziert.
- **FastPath sichtbar**: FastPath-Runs produzieren chronologisch vollstaendige `toolSequence`-Eintraege.
- **Stigmergy-Beweiskette**: Decision-Snapshot wird persistiert (nur Capability-IDs, keine User-Texte).
- **Subagent-Re-Entry-Safety**: Closure-lokale Counter, kein `this.*`.
- **Schema-Migration sicher**: Additive `ALTER TABLE`, WriterLock VOR `ALTER` (FIX-12-Lehre).

## Considered options

### Option 1: `recordEpisode` an mehreren Exit-Points spiegeln

Aufruf an jeder return-Stelle (success, iteration-limit, abort) dupliziert.

- **Pro:** Lokale Anpassung pro Exit-Pfad.
- **Con:** Drift-Anfaellig; vergisst man einen Exit-Pfad, verschwinden Episoden wieder. Wartungsaufwand.

### Option 2: `recordEpisode` in `finally`-Block (gewaehlt)

`onEpisodeData`-Callback wandert aus dem Success-Branch in den `finally`-Block bei `src/core/AgentTask.ts:1770`, NACH der `stigmergyOutcome`-Bestimmung. Payload erweitert um `{ success, mistakesEncountered, attemptCompletionFired, fastPathFired, stigmergy? }`. `success = (stigmergyOutcome === 'accept' && mistakesEncountered === 0 && attemptCompletionFired)`. `indexEpisode` feuert NUR bei `success === true`.

- **Pro:** Single source of truth fuer Episode-Recording. Alle Exit-Pfade laufen durch finally. Stigmergy-Outcome ist gleichzeitig verfuegbar. Fail-Episoden gehen in DB, nicht in Index.
- **Con:** Mehr State im AgentTask-Resolver (Counter und Flags als Closure-Vars). Sidebar-Wiring muss erweiterte Payload akzeptieren.

### Option 3: Separates Telemetrie-Subsystem statt Episode

Telemetrie-Logger fuer Fail-Episoden, Episode-Tabelle nur fuer Success.

- **Pro:** Klare Trennung.
- **Con:** Zwei Tabellen, zwei Konsumenten. Promotion-Service braeuchte Lookup ueber beide Tabellen.

## Decision outcome

Option 2 ist gewaehlt. Konkrete Aenderungen:

**`AgentTask.ts` Closure-State:**
```typescript
let totalToolErrors = 0;
let attemptCompletionFired = false;
let fastPathFired = false;
// stigmergyDecisionSnapshot kommt aus ADR-131 Resolver
```

`totalToolErrors` wird inkrementiert an den drei Stellen wo heute `consecutiveMistakes++` passiert (`src/core/AgentTask.ts:1202`, `:1430`, `:1456`). NICHT auf `this.*`.

**`AgentTask.ts` finally-Block:**
```typescript
} finally {
    // existing stigmergy outcome grading...
    const success =
        stigmergyOutcome === 'accept'
        && totalToolErrors === 0
        && attemptCompletionFired;
    const resultSummary = success
        ? accumulatedText.slice(0, 300)
        : errorClass(stigmergyOutcome);  // 'aborted' | 'circuit-breaker' | 'context-overflow' | 'error'
    onEpisodeData?.({
        toolSequence,
        toolLedger,
        success,
        mistakesEncountered: totalToolErrors,
        attemptCompletionFired,
        fastPathFired,
        stigmergy: stigmergyDecisionSnapshot,
        resultSummary,
    });
}
```

**`EpisodicExtractor.ts` Schema-Erweiterung:**
```typescript
export interface TaskEpisode {
    id: string;
    timestamp: string;
    userMessage: string;
    mode: string;
    toolSequence: string[];
    toolLedger: string;
    success: boolean;
    resultSummary: string;
    stigmergy?: {
        mode: 'sequence' | 'enforce' | 'ranked' | 'none';
        pinnedPath: string[];
        guidanceTextSuppressed: boolean;
        recipeWinner: string | null;
    };
}
```

`recordEpisode` Param-Shape erweitert sich analog. `indexEpisode` wird in `recordEpisode` nur bei `success === true` aufgerufen.

**`EpisodicExtractor.ts` FIFO-Eviction:**
`evictOldest` ORDER BY wechselt von `created_at ASC` auf `rowid ASC`. Begruendung: `created_at` ist TEXT (ISO-String). Bei Clock-Skew (Sync zwischen Geraeten, manueller Datum-Reset) kann ein neuerer Eintrag ein aelteres Datum tragen und faelschlich evicted werden. `rowid` bleibt monoton bei TEXT PRIMARY KEY ohne AUTOINCREMENT.

**`MemoryDB.ts` Migration v9 -> v10:**
```sql
ALTER TABLE episodes ADD COLUMN stigmergy_json TEXT;
```

Acquisition: `WriterLock` VOR `ALTER` (FIX-12-Lehre: spaltenmutierende Migrationen muessen WriterLock vorher haben). Migration-Hook im `MemoryDB.onload` VOR `EpisodicExtractor.initialize`. SELECT-Pfad parst defensiv (`try/catch -> undefined`). Alte Rows bleiben `stigmergy_json = NULL`.

**JSON-Fallback-Pfad (`insertToFile`):** schreibt `stigmergy`-Feld direkt in das Episode-JSON.

**`FastPathExecutor.ts` Tool-Recording:**
```typescript
// Neuer optionaler Callback in executeBatch
onToolRecorded?: (tool: string, input: unknown, summary: string, source: 'fastpath') => void;
```

Aufruf nach jedem erfolgreichen `pipeline.executeTool`. `AgentTask.run` uebergibt `(name, input, summary) => repetitionDetector.recordForEpisodeOnly(name, input, summary, 'fastpath')`.

**`ToolRepetitionDetector.ts`:** Neue Methode `recordForEpisodeOnly(tool, input, summary, source: 'fastpath' | 'loop')`. Interner merged Ledger; `getToolSequence()` liefert chronologisch beide Sources.

## Consequences

- Telemetrie ist vollstaendig: jede Run-Ausgangsart erzeugt ein Episode-Record. Fail-Episoden in DB, nicht im Index.
- FastPath-Runs sind sichtbar fuer Recipe-Promotion (ADR-132).
- `errorClass` ersetzt `accumulatedText.slice(0, 300)` in Fail-Faellen, sodass keine Trial-and-Error-Texte in den Index gepollutet werden.
- Schema-Migration v9 -> v10 ist additiv. Bestehende 500 Episoden bleiben unveraendert (`stigmergy_json = NULL`).
- `rowid`-basierte Eviction ist clock-skew-sicher.
- Subagent-Re-Entry: alle neuen Counter sind closure-lokal, kein Vererben des Parent-State.
- Sensitive Inhalte: `stigmergy_json` enthaelt nur Capability-IDs und Booleans, keine User-Texte. `recipeWinner` ist RecipeStore-ID.

## Related

- Code: `src/core/AgentTask.ts:1620 -> :1770`, `src/core/mastery/EpisodicExtractor.ts:18, 71, 154, 195`, `src/core/knowledge/MemoryDB.ts`, `src/core/FastPathExecutor.ts:333`, `src/core/tool-execution/ToolExecutionPipeline.ts:464`, `src/ui/AgentSidebarView.ts:2161-2200`
- ADR-018 (Episodic Task Memory)
- ADR-130 (Stigmergy als Recall-Layer)
- ADR-132 (Stigmergy-Pinned-Sequence Direct Promotion)
- ADR-061 (FastPath Execution)
- FEAT-32-02 (Implementation)
