---
id: FEAT-32-02
title: Stigmergy-Pinned-Sequence Direct Promotion
epic: EPIC-32
priority: P0
date: 2026-06-07
related: ADR-132, ADR-133
adr-refs: [ADR-018, ADR-058, ADR-061, ADR-132, ADR-133]
plan-refs: []
depends-on: [FEAT-32-01]
---

# FEAT-32-02: Stigmergy-Pinned-Sequence Direct Promotion

## Description

Phase 2 des Stigmergy-Vertrags. Schliesst die Beweiskette von einer Stigmergy-Pinned-Sequenz ueber das Episode-Recording bis zur Recipe-Promotion. Vier zusammengehoerige Aenderungen:

1. **Episode-Schema-Erweiterung**: `TaskEpisode` bekommt ein optionales Feld `stigmergy?: { mode, pinnedPath, guidanceTextSuppressed, recipeWinner }`. Additive Migration `episodes`-Tabelle v9 -> v10 mit `ALTER TABLE episodes ADD COLUMN stigmergy_json TEXT` unter Acquisition des `WriterLock` VOR `ALTER` (FIX-12-Lehre). JSON-Fallback-Pfad bekommt das Feld direkt im Episode-JSON.

2. **Episode-Recording im `finally`-Block**: `onEpisodeData`-Callback wandert aus dem Success-Branch (heute `AgentTask.ts:1620`) in den `finally`-Block bei `:1770` NACH der `stigmergyOutcome`-Bestimmung. Payload erweitert um `{ success, mistakesEncountered, attemptCompletionFired, fastPathFired, stigmergy? }`. `success = (stigmergyOutcome === 'accept' && mistakesEncountered === 0 && attemptCompletionFired)`. `indexEpisode` feuert NUR bei `success === true` (verhindert MemoryRetriever-Pollution durch Fail-Episoden). FIFO-Eviction wechselt von `ORDER BY created_at` auf `ORDER BY rowid` (verhindert Clock-Skew-Bugs).

3. **FastPath `recordForEpisodeOnly`**: FastPath-Tools werden ueber neuen Callback `onToolRecorded(tool, input, summary, source: 'fastpath')` in einen merged `ToolRepetitionDetector`-Ledger geschrieben. `getToolSequence()` liefert chronologisch beide Sources. Heute verschwinden FastPath-Runs still aus den Episoden (`toolSequence.length < 2` -> `recordEpisode` returnt null).

4. **`RecipePromotionService.checkForPromotion(episode, stigmergyEvidence?)`** mit 3 Gates in Reihenfolge:
   - **Gate 1 Recipe-wins**: wenn `evidence?.recipeWinner` gesetzt -> `recipeStore.incrementSuccess(recipeWinner)` und return. Verhindert doppelte Promotion bei FastPath-Treffer.
   - **Gate 2 Stigmergy-Shortcut**: wenn `evidence?.mode === 'sequence' && pinnedPath.length >= 2 && episode.success && containsContiguousSubsequence(toolSequence, pinnedPath) && toolSequence.last() === 'attempt_completion'` -> `promoteFromStigmergyPath(episode, pinnedPath)`. Persistiert `successCount: 1`, `provenance: 'stigmergy-shortcut'`, `id: 'learned-stigmergy-<sha1(pinnedPath).slice(0,8)>-<ts>'`.
   - **Gate 3 Fallback**: bestehender ADR-058-Pfad (>= 3 organische semantisch aehnliche Episoden).
   - Bei mode `'enforce'` (Set-Semantik, kein Pfad), `'ranked'` (observe-only) und `'none'` (NOOP) wird Gate 2 uebersprungen. Daemon-down (`evidence undefined`) faellt auf Gate 3 zurueck.

Alle bestehenden Gates aus ADR-058 bleiben aktiv: `getLearnedEnabled()`, `MAX_LEARNED_RECIPES = 50`, Trigger-Token-Dedup, plus neue Tool-Sequence-Dedup gegen Near-Duplicates, plus VO-Selektor-Vorrang (wenn `recipeMatchingService.match(episode.userMessage)` bereits einen learned Recipe mit score >= 0.5 trifft -> nur `incrementSuccess`, kein Promote).

Quelle: Hardening-Audit 2026-06-07, Findings 1, 2, 3, 4, 5, 9, 10, 11, 14, 15, 23, 24, 27.

## Benefits Hypothesis

Stigmergy lernt erfolgreiche Capability-Sequenzen schneller als der ADR-058-Pfad (3 organische Wiederholungen brauchen oft Wochen). Wenn Stigmergy eine Sequenz pinnt und der Agent sie folgt zum erfolgreichen `attempt_completion`, ist das genauso starkes Evidence wie drei organische Wiederholungen -- und wir koennen die Sequenz direkt als Recipe persistieren. Dadurch reduzieren wir die Latenz von Pattern-Erkennung zu Recipe-FastPath von Wochen auf einen einzelnen Run.

## User Stories

- **US-32-02-01 (P1 Sebastian):** Als Plugin-Maintainer moechte ich, dass eine Stigmergy-gepinnte Sequenz nach einem einzigen erfolgreichen Run als Recipe-Kandidat persistiert wird, damit der naechste aehnliche Task FastPath nutzt.
- **US-32-02-02 (P1 Sebastian):** Als Plugin-Maintainer moechte ich, dass FastPath-Runs vollstaendige Episoden produzieren, damit Recipe-Promotion-Statistik nicht von der Loop-Mechanik abhaengt.
- **US-32-02-03 (P2 Sebastian):** Als Plugin-Maintainer moechte ich, dass Fail-Episoden im DB-Log bleiben aber nicht im MemoryRetriever-Index auftauchen, damit Telemetrie verfuegbar ist ohne Antwortqualitaet zu verschlechtern.

## Success Criteria

1. `TaskEpisode.stigmergy` ist als optionales Feld definiert. Migration v9 -> v10 laeuft idempotent gegen bestehende v9-DBs und nimmt den `WriterLock` VOR `ALTER`.
2. `onEpisodeData`-Callback feuert aus dem `finally`-Block heraus, AUCH bei Iteration-Cap-Exit und Abort (success-Flag korrekt gesetzt, kein silent drop).
3. FastPath-Runs produzieren Episoden mit `toolSequence.length >= 2`. `getToolSequence()` liefert chronologisch search -> read -> write -> attempt_completion (oder analoge Sequenz).
4. Bei `evidence.recipeWinner` -> `recipeStore.incrementSuccess(recipeWinner)` und kein Promote.
5. Bei `mode === 'sequence' && pinnedPath.length >= 2 && success && pathFollowed` -> `promoteFromStigmergyPath` legt einen Recipe mit `provenance: 'stigmergy-shortcut'` und `successCount: 1` an.
6. Bei `mode === 'enforce'` und `mode === 'ranked'` -> Gate 2 SKIP, Fallback Gate 3 kann feuern.
7. Bei NOOP-Turn (`evidence === undefined`) -> Gate 3 ADR-058-Pfad bleibt aktiv.
8. Tool-Sequence-Dedup verhindert Near-Duplicate-Recipes (identische `toolSequence` -> `incrementSuccess` statt promote).
9. VO-Selektor-Vorrang: wenn `recipeMatchingService.match(episode.userMessage)` bereits einen learned Recipe trifft -> `incrementSuccess` auf den existierenden Recipe, kein neuer Promote.
10. `indexEpisode` feuert NUR bei `success === true`. Fail-Episoden bleiben in DB fuer Telemetrie.

## Technical NFRs

- **Schema-Migration:** Additive `ALTER TABLE episodes ADD COLUMN stigmergy_json TEXT` mit WriterLock-Acquisition VOR `ALTER` (FIX-12-Lehre). SELECT-Pfad parst defensiv (`try/catch -> undefined`). Alte Rows bleiben `stigmergy_json = NULL` und sind lesbar.
- **Performance:** Promote ist fire-and-forget aus Sidebar; LLM-Call laeuft asynchron und beruehrt den cached System-Prompt-Prefix nicht.
- **Robustness:** `containsContiguousSubsequence` Helper testet path-followed-Logik gegen Praefix, Subsequence und Side-Effects-Between-Pins. Bei pathologischen Subsequenzen (Loops) wird der Match konservativ abgelehnt.
- **Idempotenz:** Recipe-Id-Format `learned-stigmergy-<sha1(pinnedPath).slice(0,8)>-<ts>` ist kollisionsfrei gegen Trigger-Slug-Kollisionen. Bei identischem Pfad zu unterschiedlichem `ts` greift die Tool-Sequence-Dedup.
- **NOOP-Sicherheit:** Wenn `evidence === undefined` (Daemon down) -> Gate 1+2 SKIP, Gate 3 ADR-058-Pfad bleibt aktiv. Keine Throws.
- **Telemetry:** `console.debug` pro Gate-Hit: `[Promotion] gate=<name> outcome=<result>`. Telemetrie-Counter `recipe.promotion.shortcut`, `recipe.promotion.fallback`, `recipe.promotion.skipped`.

## ASRs

- **ASR-CRIT-01:** Migration darf laufende `SemanticIndex`-Writes nicht korrumpieren -> `WriterLock` VOR `ALTER`, Migration-Hook im `MemoryDB.onload` BEVOR `EpisodicExtractor.initialize`.
- **ASR-CRIT-02:** `pathFollowed`-Pruefung muss `attempt_completion` als terminalen Schritt erzwingen, sonst werden Half-completed-Runs promoted.
- **ASR-MOD-01:** `recipeWinner`-Bump muss im finally bei `stigmergyOutcome === 'accept'` UND `fastPathFired` UND `mistakesEncountered === 0` feuern, sonst belohnen wir Flailing-Runs.
- **ASR-MOD-02:** Stigmergy-Evidence-Snapshot ist closure-lokal in `AgentTask.run()`. Subagent-Re-Entry darf den Parent-Snapshot nicht vererben.

## Definition of Done

- [ ] `MemoryDB.ts`: Migration v9 -> v10 mit `ALTER TABLE episodes ADD COLUMN stigmergy_json TEXT` + WriterLock + Migration-Test
- [ ] `EpisodicExtractor.ts`: `TaskEpisode.stigmergy?` Feld, `recordEpisode` Param-Erweiterung, `indexEpisode`-Success-Gate, FIFO ueber `rowid`
- [ ] `AgentTask.ts`: `onEpisodeData`-Move in `finally`, `success`/`mistakesEncountered`/`attemptCompletionFired`/`fastPathFired` Closure-Counter, `stigmergyDecisionSnapshot` als Payload-Feld
- [ ] `FastPathExecutor.ts`: `onToolRecorded`-Callback in `executeBatch`
- [ ] `ToolRepetitionDetector.ts`: `recordForEpisodeOnly(tool, input, summary, source)`, merged Ledger, chronologisches `getToolSequence`
- [ ] `RecipePromotionService.ts`: 2. Parameter `stigmergyEvidence?`, 3 Gates, `promoteFromStigmergyPath`, `incrementFromAcceptedFastPath`, Dedup-Refactor
- [ ] `AgentSidebarView.ts`: hardcoded `success:true` raus, `data.stigmergy` durchreichen, error-`resultSummary` als Klasse statt `accumulatedText`
- [ ] Tests EpisodicExtractor: 3 Tests (stigmergy persistiert / fehlt / Migration)
- [ ] Tests FastPathExecutor: 1 Test (recording)
- [ ] Tests ToolExecutionPipeline: bereits in FEAT-32-01 abgedeckt
- [ ] Tests RecipePromotionService: 11 Tests (shortcut/dedup/winner/gates)
- [ ] Tests AgentTask: 5 Tests (success/iteration-limit/abort/subagent-re-entry/fastpath-telemetry)
- [ ] Build + Deploy, Smoke mit aktivem Daemon + sequence-Decision: nach 1 erfolgreichem Run liegt `learned-stigmergy-...` Recipe im RecipeStore
- [ ] tsc clean, ESLint clean

## Validation

H-02 + H-03 + H-04 aus EPIC-32. Unit-Tests decken Code-Pfade ab; Migration-Test gegen Sebastians DB-Snapshot vor Merge. Live-Telemetrie ueber 4 Wochen: Schwelle >= 10 `learned-stigmergy-` Recipes.

## Out-of-Scope

- Praezedenz-Regel und decisionMode Surface (FEAT-32-01).
- Memory v2 Robustness (FEAT-32-03).
- Neue Stigmergy-Decision-Modes.
- Aenderung am ADR-058 organischen Pfad (3-Episoden-Threshold bleibt).
- Migration der bestehenden 500 Episoden (additiv, `stigmergy_json = NULL` fuer alte Rows).
- `syncSession.ts`/MCP-Promotion-Pfad bleibt am ADR-058-Fallback.
