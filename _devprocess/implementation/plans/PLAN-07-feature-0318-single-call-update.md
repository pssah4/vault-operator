---
id: PLAN-07
title: Memory v2 Phase 4 -- Single-Call Update Pipeline (FEAT-03-18)
date: 2026-04-28
feature-refs: [FEAT-03-18]
adr-refs: [ADR-76, ADR-77, ADR-83, ADR-86]
bug-refs: []
pair-id: sebastian-opus-4.7
parent-plan: PLAN-01-memory-v2-master
related:
  - PLAN-01-memory-v2-master.md
  - PLAN-06-feature-0317-dynamic-context-composition.md
  - _devprocess/requirements/features/FEAT-03-18-single-call-update-pipeline.md
---

# PLAN-07 -- Memory v2 Phase 4 Single-Call Update

## Kontext

Phase 3 lieferte den Read-Pfad (ContextComposer, recall_memory, Adapters).
Phase 4 baut den **Write-Pfad** komplett um: statt 2-3 LLM-Calls pro
memory-eligible Conversation (SessionExtractor + LongTermExtractor +
Conflict-Resolution) entsteht **ein einziger Tool-Calling-Output** mit
Session-Summary, Fact-Candidates (mit `kind`, `relation`, Topics,
Importance), Episode-Outcome und URI-typed Mentions.

Plus: 6 Querschnittsthemen, die die Update-Pipeline produktionsreif machen
-- Aging mit kind-Halbwertzeiten, Lazy-Conflict-Resolution, AuditPruning,
Token-Cost-Cap mit Auto-Disable, Topic-Drift-Bus, Combined Note-Index-Pass.

**Bewusste Entscheidung (Phase-3.6-Linie):** Kein Feature-Flag fuer
"alter vs neuer Extractor". Single-Call ersetzt den alten Pfad direkt.
Sebastians 'no nostalgia' Doktrin: wenn v2 funktioniert, gibt es keinen
v1-Extraktor mehr.

## Reihenfolge

Drei Commit-Blöcke nach Risiko:

**Block A -- kleine Bausteine** (low risk, isoliert):

1. **MentionParser**: Wiki-Links, Markdown-Links, URLs aus User-Message-Text
2. **ProvisionalEdges**: EdgeStore-Erweiterung um `_provisional`-Suffix-Logik
3. **AgingService** mit kind-Halbwertzeiten + use_count-Boost
4. **TokenBudgetGuard** + Settings-Schwelle + Auto-Disable
5. **EventBus** fuer Topic-Drift (FactExtractor <-> ContextComposer)
6. **ExtractionQueue Bypass-Flag**

**Block B -- Single-Call Kern** (medium risk):

7. **SingleCallExtractor** mit Tool-Calling-Schema (`relation`, `kind`, `mentions`, `noise-filter`-Prompt)
8. **FactIntegrator** mit 4-Klassen-Logik (`new` / `update` / `extend` / `derive`) + Lazy-Conflict-Resolution (Cosine > 0.9 + Topic-Overlap)
9. **Delta-Window** + Conversation-So-Far-Summary persistiert in `conversation_threads.delta_summary`

**Block C -- Hot-Path & Eval** (highest risk):

10. **ExtractionQueue-Cut-Over**: SessionExtractor + LongTermExtractor durch SingleCallExtractor ersetzen
11. **Telemetrie-Verdrahtung**: token_used / conflict_decisions / aging_run / drift_event
12. **Combined Note-Index-Pass** fuer Vault (3 LLM-Calls -> 1, separater Pfad)
13. **Eval-Test-Set** mit 10 Conversations + Snapshot-Test fuer Single-Call-Outputs

## Aufgaben (Detail)

### Aufgabe 1 -- MentionParser

`src/core/memory/MentionParser.ts`. Pure-Function `parseMessages(text): Mention[]`.

Regex-basiert:
- `\[\[(?<path>[^\]]+)\]\]` -> `vault://${path}` (auto-add `.md` wenn fehlend)
- `\[(?<label>[^\]]+)\]\((?<href>[^)]+)\)` -> `vault://` (relativ) oder `file://` (absolut /...)
- `https?://[^\s]+` -> as-is

Returns `{ uri, label?, scheme }[]`. Tests: 8-10 Cases.

### Aufgabe 2 -- ProvisionalEdges (EdgeStore)

EdgeStore-Methode `addProvisionalEdge(fromFactId | fromMessageId, externalRef, edgeType): FactEdge` - Edge-Type-Suffix `_provisional`. Plus `confirmProvisional(edgeId)` (entfernt Suffix), `discardProvisional(edgeId)` (markStale). Tests.

### Aufgabe 3 -- AgingService

`src/core/memory/AgingService.ts`. `runAgingCycle({now}): AgingReport`.
- Halbwertzeiten: identity 180d, fact 90d, event 14d, preference -- nicht-decayend
- Touch-Refresh: `last_used_at` setzt Importance auf max(decay, baseline + use_boost)
- Idempotenz: Settings-Field `lastAgingRunAt`, skip wenn < 24h
- Transactional: BEGIN/COMMIT um den ganzen Run

### Aufgabe 4 -- TokenBudgetGuard

`src/core/memory/TokenBudgetGuard.ts`. Per-day input + output token counter,
persistiert in `data.json` unter `memory.tokenBudgetState`. Schwelle in
Settings (`memory.dailyInputCap`, `memory.dailyOutputCap`). Bei Ueberlauf:
`isOverBudget()` returns true, `isOverInput()` etc. Caller (SingleCallExtractor)
prüft VOR dem LLM-Call und logged Notice + skippt.

### Aufgabe 5 -- DriftEventBus

`src/core/memory/DriftEventBus.ts`. Minimal Pub-Sub:
- `emit(event: DriftEvent)`, `subscribe(handler)`.
- ContextComposer emittiert via Bus statt `driftEvent`-Return-Field
  beizubehalten (Return bleibt zusätzlich).
- ExtractionQueue subscribed und schedult Re-Extract-Job.

### Aufgabe 6 -- ExtractionQueue Bypass-Flag

`ExtractionQueue.enqueue({...})` bekommt `bypassThrottle: boolean`. Bei
true wird der 60s-Throttle übersprungen. Tests.

### Aufgabe 7 -- SingleCallExtractor

`src/core/memory/SingleCallExtractor.ts`. Klasse mit `extract(input): Promise<ExtractionResult>`.

Input:
- `messages` (Delta-Window oder Full)
- `conversationSoFar` (~200 Token Summary, optional)
- `priorTopicLock`

Tool-Calling-Schema:
```ts
{ name: '_memory_single_call', input_schema: {
  session_summary: string,
  episode_outcome: { success: bool, result_summary: string },
  facts: [{ text, topics, importance, kind, relation, rationale }],
  mentions: [{ uri, label?, kind? }],
  topic_drift_detected: bool,
}}
```

System-Prompt:
- Atomic-Fact-Regel (wie Atomizer)
- Noise-Filter-Anweisung: "Smalltalk, hypothetische Fragen, Filler -> skip"
- Mentions-Anweisung: "alle erwähnten URIs in mentions[]"
- relation-Klassifikation: 4 Klassen
- kind-Klassifikation: 4 Klassen

Validation: client-side, 10+ Test-Cases.

### Aufgabe 8 -- FactIntegrator

`src/core/memory/FactIntegrator.ts`. Konsumiert ExtractionResult, schreibt FactStore.

Pro Fact-Candidate je nach `relation`:
- `new`: insert
- `update`: cosine über fact_embeddings vs. existing facts mit gleichem topic[0]; bei match -> supersede
- `extend`: insert + edge `refines` zur ähnlichsten existing
- `derive`: insert + edge `derived_from_*`

Lazy-Conflict-Resolution: Cosine-Lookup nur wenn `relation === 'update'` UND
input.text in keinem klar identifizierbaren update-target ist. Pre-Insert-
Filter: importance < 0.2 -> skip.

### Aufgabe 9 -- Delta-Window + ConversationSoFar

Schema-Erweiterung `conversation_threads`:
- `last_extracted_message_index INTEGER`
- `delta_summary TEXT`

Schema v3 -> v4. Migration additiv.

ExtractionQueue: bei Re-Extract pull nur messages > lastExtractedMessageIndex.
SingleCallExtractor schreibt `delta_summary` bei jedem Run zurueck (LLM produziert ~200 Token Conversation-So-Far).

### Aufgabe 10 -- ExtractionQueue Cut-Over

Hot-Path. `ExtractionQueue.processItem(item)` ruft jetzt SingleCallExtractor +
FactIntegrator. SessionExtractor + LongTermExtractor werden **gelöscht**
(no nostalgia). Sessions-Tabelle bekommt weiterhin Session-Summary aus
SingleCall-Output.

### Aufgabe 11 -- Telemetrie

MemoryV2Telemetry verdrahten in:
- SingleCallExtractor (token usage)
- FactIntegrator (conflict-trigger-rate)
- AgingService (run summary)
- DriftEventBus (drift event)
- TokenBudgetGuard (over-budget event)

### Aufgabe 12 -- Combined Note-Index-Pass

Vault-Side. Heute (vermutlich) drei separate Calls pro Note:
- note_freshness classification
- implicit_edges similarity
- Tag suggestions

Combined: ein structured-output Call. Separat im Plan halten -- berührt
SemanticIndexService und Vault-Indexing-Loop. **Risiko hoch**, weil hot-path.

### Aufgabe 13 -- Eval-Test-Set

`tests/memory/eval/conversation-fixtures/*.json` mit 10+ Conversations.
Pro Fixture: erwartete Fact-Texts, kind, relation, topics. Snapshot-Test
gegen Mock-Atomizer. Plus performance-snapshot (token-budget assertions).

## Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|------|-----------|--------|
| `src/core/memory/MentionParser.ts` | NEU | Klein |
| `src/core/memory/EdgeStore.ts` | + addProvisional / confirmProvisional / discardProvisional | Klein |
| `src/core/memory/AgingService.ts` | NEU | Klein |
| `src/core/memory/TokenBudgetGuard.ts` | NEU | Klein |
| `src/core/memory/DriftEventBus.ts` | NEU | Klein |
| `src/core/memory/ContextComposer.ts` | + Bus emit | Klein |
| `src/core/memory/ExtractionQueue.ts` | + bypass flag | Klein |
| `src/core/memory/SingleCallExtractor.ts` | NEU | Mittel-Hoch |
| `src/core/memory/FactIntegrator.ts` | NEU | Mittel |
| `src/core/knowledge/MemoryDB.ts` | Schema v3 -> v4 (delta-window-Spalten) | Klein |
| `src/core/memory/SessionExtractor.ts` | LOESCHEN | Mittel (downstream-callers) |
| `src/core/memory/LongTermExtractor.ts` | LOESCHEN | Mittel |
| `src/core/memory/MemoryV2Telemetry.ts` | unveraendert; nur neue Aufrufer | Trivial |
| `src/core/semantic/SemanticIndexService.ts` | + Combined Note-Index-Pass | Hoch |
| `src/types/settings.ts` | + dailyInputCap / dailyOutputCap / tokenBudgetState | Trivial |
| Tests | NEU x ~10 Files | Klein |
| Eval-Fixtures | NEU x 10 JSON | Klein |

## Nicht betroffen

- Phase-0.5-Components (KnowledgeDB, WriterLock, SnapshotJob)
- Phase-1+2-Stores (FactStore, EdgeStore (außer Provisional), StyleStore, AuditLog,
  VaultOperatorEmbeddingProvider, MemoryAtomizer fuer Migration)
- Phase-3-Read-Pfad (ContextComposer, RecallMemoryTool, UnifiedGraphService,
  KnowledgeGraphAdapter, StandardAdapters, MemoryV2UpgradeOrchestrator)
- Profile-System (Phase 3.5)

## Verifikation

1. Build sauber, alle Tests gruen, Coverage > 85% in neuen Files
2. SingleCall-Eval-Test: > 80% Output-Quality-Score gegen Fixtures
3. Conflict-Trigger-Rate-Test: < 10% der Inserts triggern Conflict-LLM-Call
4. Aging-Idempotenz: zwei runs am selben Tag = ein Effekt
5. Token-Budget: Auto-Disable greift bei simuliertem Overflow
6. Engine-Coupling-Lint: 0 obsidian-Imports

## Open Questions

- Ollama Tool-Calling-Support: bei einfachen Modellen evtl. nicht. **Decision:** Hard-Requirement, Fallback waere zu aufwaendig fuer Phase 4. User sieht Warnung wenn aktives Memory-Modell kein Tool-Calling kann.
- Aging-Cron: setInterval vs onLayoutReady-check. **Decision:** Plugin-Start-Check (lastAgingRunAt > 24h alt -> run). Reicht fuer Sebastian's Pattern.
- Combined Note-Index Default an/aus. **Decision:** Per Setting an, default false bis battle-tested.

## Change Log

### 2026-04-28 - Initial

PLAN-07 erstellt. Status: Active. Trigger: User-Anweisung "phase 4" nach
Phase 3.6 (Commit 0a6e108). Auto-Mode-konform: Plan first, dann sequenziell
durch Aufgaben 1-13 in drei Commit-Bloecken.
