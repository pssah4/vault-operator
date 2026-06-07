---
id: FEAT-32-03
title: Memory v2 Robustheit + Skill-Discovery Timeout + Cache-Anchor-Doc
epic: EPIC-32
priority: P1
date: 2026-06-07
related: ADR-130
adr-refs: [ADR-058, ADR-060, ADR-062, ADR-130]
plan-refs: []
depends-on: []
---

# FEAT-32-03: Memory v2 Robustheit + Skill-Discovery Timeout + Cache-Anchor

## Description

Phase 3 des Stigmergy-Vertrags. Schliesst die Robustheits-Findings aus dem Audit-Workflow, die zwar nicht direkt am Stigmergy-Vertrag haengen aber im gleichen Code-Pfad liegen und unabhaengig deploybar sind. Fuenf Aenderungen:

1. **`ContextComposer` Pause-Notice mit dayKey-Cache**: `ContextComposer.constructor` bekommt `getMemoryWritesPaused?: () => { reason: string; dayKey: string } | null`. `renderMarkdown` haengt bei pause-Status NACH dem Topical-Block (byte-stabiler Trailer-Anchor) eine einzelne Zeile `_Memory writes paused today: ${reason}._`. Cold-Start-Hint wird unterdrueckt waehrend pause. Cache per `dayKey`, nur recompute bei Tagesgrenze. Verhindert Mid-Session-Prefix-Flip (ADR-062 invariant).

2. **`FactStore` Topic-Slug-Normalisierung**: `FactStore.insert` normalisiert topics: `t.trim().toLowerCase().replace(/\s+/g, '-')`. Neuer Migration-Step `NormalizeTopicSlugsStep` in `MemoryV2UpgradeOrchestrator` rewrited bestehende `facts.topics`, merged `known_topics`-Rows mit Centroid-Avg, invalidiert `TopicInference.cache`. `FactIntegrator` wird verpflichtet, `known_topics` zu upserten und Centroid-Refresh zu schedulen.

3. **`SingleCallProcessor` Abort-Wiring**: `SingleCallProcessor.process(item, signal?)`. `ExtractionQueue.processQueue` speist `AbortController`. `main.ts.onunload` ruft `extractionQueue.cancelInFlight()` VOR `memoryDB.close()`. Post-extract: re-check `memoryDB.isOpen()` umschliesst Block ab `SingleCallProcessor.ts:107` (budget.record, telemetry, integrator.integrate, writeSessionSummary, deltaStore.save). AbortError-Short-Circuit im `processQueue`-catch (kein retry-warn-spam bei reload).

4. **`ExtractionQueue` Retry mit Backoff**: `PendingExtraction.failureCount: number` (persist round-trip, default 0 fuer v1-Items). On transient error: `parkedItems[].shift()`, sleep 60s*N, weiter mit next item. Hard-stop nur bei `isPermanentProviderError`. Neuer `getQueueHealth()`: `{ pending, parked, lastError? }`. `SingleCallProcessor` wirft typed `EmptyExtractionError` wenn weder facts noch errors -> `failureCount` bump. Telemetry `memory.extraction.dropped`.

5. **Skill-Discovery Timeout + Cache-Anchor-Doc**: `AgentTask.ts:402` wrapt `skillsManager.discoverSkills()` in `Promise.race` mit 1500ms-Timeout. Doc-Comment auf `ContextComposer` + `STIGMERGY-PRECEDENCE-ANCHOR`-Kommentar bei `AgentTask.ts:497` und `:877` mit cross-Link. Cache-Stability-Argument explizit (EPIC-24 Praefix). Integration-Test: Snapshot System-Prompt enthaelt `memorySection` im cacheable Prefix.

Quelle: Hardening-Audit 2026-06-07, Findings 16, 17, 18, 19, 20, 26.

## Benefits Hypothesis

Memory v2 funktioniert in stable State gut, hat aber drei Schwachstellen, die bei Reload mid-Extraction (Race), Tagesgrenze (Cache-Flip) und Topic-Slug-Drift (Suche-Misses) auftreten. Sebastian arbeitet 6-8 Stunden am Tag mit dem Plugin und stoesst auf alle drei Szenarien regelmaessig. Die Findings sind unabhaengig vom Stigmergy-Vertrag, liegen aber im selben Code-Pfad und koennen parallel zu Phase 2 mit niedrigem Risiko ausgeliefert werden.

## User Stories

- **US-32-03-01 (P1 Sebastian):** Als Plugin-Maintainer moechte ich Obsidian reloaden koennen waehrend eine Memory-Extraktion laeuft, ohne console-Errors und Retry-Spam.
- **US-32-03-02 (P1 Sebastian):** Als Plugin-Maintainer moechte ich, dass die Memory-Pause-Notice den Cache-Prefix nicht ueber die Tagesgrenze hinweg flippt.
- **US-32-03-03 (P2 Sebastian):** Als Plugin-Maintainer moechte ich, dass Topic-Slugs konsistent normalisiert sind, damit Suche nach `plan-mode` auch `Plan Mode` und `planMode` trifft.
- **US-32-03-04 (P2 Sebastian):** Als Plugin-Maintainer moechte ich, dass haengende `discoverSkills()` den AgentTask nicht blockieren.

## Success Criteria

1. Reload mid-Extraction wirft keine `closed-DB`-Errors. AbortError flippt `sessionDisabledReason` nicht.
2. `ContextComposer.renderMarkdown` mit `paused=true` rendert die Pause-Notice am stabilen Trailer-Anchor; Snapshot des System-Prompts ist byte-identisch ueber zwei aufeinanderfolgende Turns am selben `dayKey`.
3. `FactStore.insert(' Plan Mode ')` persistiert `topics = ['plan-mode']`. Migration konvertiert bestehende `'planMode'`-Topics zu `'plan-mode'` und merged `known_topics`-Rows.
4. `discoverSkills()` haengt > 1500ms -> `AgentTask` faehrt fort, `console.debug` ueber Timeout, Self-Authored-Skills bleiben verfuegbar.
5. Transient extraction error -> `failureCount = 1`, retry next cycle. `failureCount = 3` -> drop + telemetry. Permanent error -> hard-stop.
6. `AgentTask.systemPromptAnchor`-Integrationstest: composed `memorySection` liegt im cacheable Prefix, NICHT am User-Message-Tail.

## Technical NFRs

- **Cache-Stabilitaet:** Pause-Notice landet im Trailer-Block per `dayKey`-Cache. Tagesgrenze ist die einzige zulaessige Cache-Invalidations-Quelle. ADR-062 invariant.
- **Performance:** Skill-Discovery-Timeout `Promise.race` ohne Cleanup-Race; AbortController fuer Extraction ist die offizielle Cancellation-API.
- **Robustness:** Backoff 60s*N bis `failureCount = 3`. Permanent-Error-Klassifikator orientiert sich an `isPermanentProviderError` aus EPIC-26.
- **Telemetry:** `memory.extraction.dropped`, `memory.queue.parked`, `agent.task.discoverSkills.timeout`.

## ASRs

- **ASR-CRIT-01:** Pause-Notice darf den Cache-Prefix nicht waehrend einer Session flippen. Cache per `dayKey`, nicht per Timestamp.
- **ASR-CRIT-02:** `cancelInFlight()` muss VOR `memoryDB.close()` aufgerufen werden, sonst race.
- **ASR-MOD-01:** Topic-Slug-Migration muss `known_topics`-Centroid-Avg merged, nicht ueberschreiben.

## Definition of Done

- [ ] `ContextComposer.ts`: Pause-Notice + dayKey-Cache + Trailer-Anchor
- [ ] `FactStore.ts`: Slug-Normalisierung in `insert`
- [ ] `MemoryV2UpgradeOrchestrator.ts`: `NormalizeTopicSlugsStep`
- [ ] `TopicInference.ts`: Cache-Invalidation auf Migration
- [ ] `SingleCallProcessor.ts`: `signal?`-Param, re-check `isOpen()`, `EmptyExtractionError`
- [ ] `ExtractionQueue.ts`: `failureCount`, `parkedItems`, Backoff, `getQueueHealth`, AbortError-Short-Circuit
- [ ] `main.ts.onunload`: `cancelInFlight()` VOR `memoryDB.close()`
- [ ] `AgentTask.ts:402`: `Promise.race` mit 1500ms-Timeout fuer `discoverSkills`
- [ ] `AgentTask.ts:497` + `:877`: STIGMERGY-PRECEDENCE-ANCHOR Doc-Kommentar
- [ ] Tests Composer: 1 Test (pause+coldStart, pause+non-coldStart, midnight reset, byte-identisch ueber pause-toggles)
- [ ] Tests FactStore: 1 Test (insert + Migration)
- [ ] Tests SingleCallProcessor: 1 Test (abort)
- [ ] Tests ExtractionQueue: 1 Test (retry + drop)
- [ ] Tests AgentTask: 2 Tests (skillsTimeout, systemPromptAnchor)
- [ ] Build + Deploy, Smoke (Reload mid-Extract + Pause-State ueber Tagesgrenze)
- [ ] tsc clean, ESLint clean

## Validation

H-05 aus EPIC-32. Unit-Tests decken Code-Pfade ab. Sebastian-Smoke ueber 2 Tage: keine console-Errors mehr, Pause-Cache stabil.

## Out-of-Scope

- Memory v2 Phase 7 Engine-Extract (bleibt verschoben).
- Aenderung am Memory-Composer-Ranking.
- Aenderung am `SingleCallExtractor`-Tool-Schema.
- Aenderung am Aging-Scheduler.
