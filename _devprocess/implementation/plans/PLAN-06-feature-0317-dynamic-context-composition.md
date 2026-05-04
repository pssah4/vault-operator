---
id: PLAN-06
title: Memory v2 Phase 3 -- Dynamic Context Composition (FEAT-03-17)
date: 2026-04-28
completed: 2026-04-28
feature-refs: [FEAT-03-17]
adr-refs: [ADR-77, ADR-78, ADR-80, ADR-81, ADR-82]
bug-refs: []
pair-id: sebastian-opus-4.7
parent-plan: PLAN-01-memory-v2-master
related:
  - PLAN-01-memory-v2-master.md
  - PLAN-05-feature-0316-memory-migration-vault-rrf.md
  - _devprocess/requirements/features/FEAT-03-17-dynamic-context-composition.md
  - _devprocess/analysis/SPIKE-001-cross-db-performance.md
---

# PLAN-06 -- Memory v2 Phase 3 Dynamic Context Composition

## Kontext

Phase 2 (PLAN-05) lieferte die Migration + Hybrid-Search-Bausteine. Phase 3
ist der **Cut-over auf v2-Retrieval**: System-Prompts werden nicht mehr aus
den 6 MD-Dateien gebaut, sondern dynamisch aus dem FactStore zusammengesetzt.

Drei zentrale Komponenten kommen dazu:

1. **ContextComposer** -- baut den Memory-Block pro Conversation. Macht
   Topic-Inference einmal beim Start, hält einen weichen Topic-Lock, prüft
   pro User-Turn ob das Embedding noch zum Lock passt (Cosine < 0.6 ->
   re-inferieren), und liefert URI-typed Hits.
2. **UnifiedGraphService** -- abstrahiert Cross-DB-Walks zwischen `memory.db`
   und `knowledge.db`. Spike-1 hat ATTACH verworfen (sql.js FS-API nicht
   public), JS-Layer-BFS ist die validierte Strategie (0.3 ms p95 für
   2-Hop-Walks, weit unter dem 500-ms-Ziel).
3. **recall_memory** -- Agent-facing Tool für gezielte Cold-Memory-Suche
   mit optionaler multiHop-Edge-Walk-Erweiterung.

**Cut-over-Strategie:** Config-Flag `memory.engineVersion: 'v1' | 'v2'`.
Default startet auf **v1**, Sebastian flippt manuell wenn er v2 für
Production-stabil hält. Beide Pfade koexistieren während Phase 3+4. v1
wird in einer späteren Aufräum-Welle (frühestens Phase 5) entfernt.

## Designentscheidungen aus den Phase-0-ADRs + Spikes

- **ADR-80 / SPIKE-001**: Cross-DB-Walks via JS-Layer-BFS, NICHT ATTACH.
  LocalKnowledgeAdapter führt SELECT auf separaten sql.js-Instanzen aus
  und joint die Resultate in JavaScript.
- **ADR-78**: Resolution geht durch SourceAdapter-Registry. Unbekannte
  URIs bleiben Reference-Tokens, kein Crash.
- **ADR-82 (Topic-Inference)**: Centroid-Cosine über `known_topics`
  (Phase-1-Schema), kein LLM-Call beim Conversation-Start. Sub-50ms.
- **ADR-81 (MCP Routing)**: Standalone-Service-Setup nutzt
  McpKnowledgeAdapter (RPC zu Plugin-MCP). LAN-RTT 20-50ms, akzeptabel.
- **ADR-77 / FEAT-03-15**: `known_topics.centroid_embedding`-Spalte
  ist da; Topic-Inference berechnet Centroids lazy beim ersten Insert
  pro Topic.

## Aufgaben (13 Sub-Schritte)

Reihenfolge ist nach Risiko + Abhängigkeit gewählt: erst risikoarme
Engine-Bausteine (Pure-Function-/Read-Only-Klassen), dann der
Hot-Path-Composer, dann Cut-Over + Telemetrie + MCP-Erweiterungen.

### Aufgabe 1 -- TopicInference

**Ziel:** Pure-Function-Service der ein Embedding gegen alle
`known_topics`-Centroids cosined und das Top-Topic mit Score liefert.

- Neue Datei `src/core/memory/TopicInference.ts`.
- API: `inferTopic(queryEmbedding: Float32Array, opts?: {minScore: 0.6}): { topic: string; score: number } | null`.
- Plus: `refreshCentroidFor(topic: string)` -- recomputes the centroid
  embedding by averaging fact embeddings tagged with that topic
  (Lazy-Refresh, getriggert von FactStore.insert wenn ein neues Topic
  auftaucht).
- Constructor-Injection: `(memoryDB)`. Kein LLM-Call.
- Test: `src/core/memory/__tests__/TopicInference.test.ts` -- Cosine
  match, threshold cutoff, empty-known-topics, single-fact-topic.

**Akzeptanz:** sub-50ms für 1000 known_topics, deterministischer Output.

### Aufgabe 2 -- UserProfile-View

**Ziel:** Aggregierte Query über FactStore + StyleStore.
`{identity[], preferences[], patterns[], communication_style, stats}`.

- Neue Methode `factStore.getUserProfile(): UserProfile`.
- Read-only: groupiert nach `kind` (identity/preference) + topic-filter
  ('patterns'). Communication style aus StyleStore.getMatchingStyles('default').
- Stats: `conversations` aus sessions-table, `topics` count, `last_active`
  aus sessions.created_at MAX.
- Test: `FactStore.test.ts` erweitern.

**Akzeptanz:** Funktional korrekt, < 50ms Read.

### Aufgabe 3 -- RecallHit-Type + Cold-Start-Fallback

**Ziel:** Engine-public Type. Cold-Start-Detection: wenn < 5 Facts
mit dem inferierten Topic, fallback auf last-N-Facts.

- Neue Datei `src/core/memory/RecallHit.ts` -- Type-only.
  ```ts
  interface RecallHit {
      uri: string;          // 'fact:42' / 'session://...' / 'vault://...'
      text: string;         // fact text or excerpt
      score: number;        // RRF score 0-1
      topics: string[];
      kind?: FactKind;
      stale?: boolean;      // set by stale-edge detection
      contributions: Record<string, number>;  // for debug + reranker
  }
  ```
- Pure-Function `isColdStart(factsForTopic: number, threshold = 5): boolean`.

**Akzeptanz:** Type exportiert, Fallback-Logik trivial getestet.

### Aufgabe 4 -- KnowledgeGraphAdapter Interface + LocalKnowledgeAdapter (JS-BFS)

**Ziel:** Adapter-Pattern für Cross-DB-Walks. Setup-A/B-Implementation.

- Neue Datei `src/core/memory/KnowledgeGraphAdapter.ts` -- Interface mit
  `getImplicitNeighbors(notePath, hops, limit)`, `getNoteMetadata(notePath)`,
  `searchSimilar(query, topK)`.
- Neue Datei `src/core/memory/LocalKnowledgeAdapter.ts` -- Implementiert
  via direkte SQL gegen knowledgeDB-Instanz + JS-Loop für 2-Hop-Walk
  (Spike-1-Strategie).
- Constructor: `(knowledgeDB)`.
- Test: Mock knowledgeDB, BFS-Output gegen erwartete Reihen.

**Akzeptanz:** 2-Hop-Walk p95 < 50ms (Spike-1 Niveau).

### Aufgabe 5 -- UnifiedGraphService

**Ziel:** Dünner Wrapper der den richtigen KnowledgeGraphAdapter
auswählt + Memory-DB-Walks orchestriert.

- Neue Datei `src/core/memory/UnifiedGraphService.ts`.
- API: `walkFromFact(factId, opts: { hops, types, limit }): RecallHit[]`.
- Nutzt FactStore + EdgeStore + KnowledgeGraphAdapter.
- Resolution geht durch SourceAdapter-Registry; unbekannte URIs bleiben
  Reference-Tokens.

**Akzeptanz:** Liefert RecallHit[] mit URI-typed contributions.

### Aufgabe 6 -- ContextComposer + Soft-Topic-Lock + Drift-Detection

**Ziel:** Den Memory-Block pro Conversation rendern.

- Neue Datei `src/core/memory/ContextComposer.ts`.
- API: `compose(opts: { sessionId, userMessageEmbedding, topicLockOverride? }): ComposedContext`.
- Soft-Topic-Lock pro Session in-memory (Map<sessionId, { topic, score }>).
- Drift-Detection: `userMessageEmbedding` cosine zu locked topic centroid.
  Wenn < 0.6 -> re-inferieren, Drift-Event-Hook (für Phase 4 FactExtractor).
- Nutzt: TopicInference, RrfHybridSearch (rrf-Helper aus Phase 2),
  UnifiedGraphService.
- Output: `{ markdown: string, hits: RecallHit[], topicLock: {topic, score}, driftEvent?: ... }`.

**Akzeptanz:** TTFT-Beitrag < 200ms; Topic-Lock hält pro Conversation;
Drift triggert Re-Inferenz; Cold-Start fällt auf last-N zurück.

### Aufgabe 7 -- Stale-Edge-Lazy-Detection

**Ziel:** Resolution-Failure markiert Edges als `stale`, deprioritized
in Retrieval, kein Delete.

- EdgeStore-Erweiterung: `markStale(edgeId, reason)` setzt `metadata.stale=true`.
- Resolution-Wrapper im AdapterRegistry: bei `null`-Result optional
  callback `onResolveFailure(uri, edgeId)`.
- ContextComposer respektiert `stale`-Flag (multipliziert Score mit 0.3).
- Test: stale flag wird gesetzt, Score multipliziert.

**Akzeptanz:** Stale Edges dropen in Top-K, bleiben in DB.

### Aufgabe 8 -- Context-aware Reranker-Pass nach RRF

**Ziel:** Boost-Faktoren post-RRF, vor Top-K-Cut.

- Neue Datei `src/core/memory/ContextRanker.ts` -- pure function.
- API: `rerank(hits: RecallHit[], ctx: { topicLock, now }): RecallHit[]`.
- Boosts:
  - `+0.2` wenn `topic` im topicLock
  - `+0.1` wenn `last_used_at < 7 Tage`
  - `+0.1` wenn `kind=identity`
  - `-0.1` wenn `kind=event` UND age > 30 Tage
  - `*0.3` wenn `stale=true`
- Test: 8-10 Cases pro Boost-Kombi.

**Akzeptanz:** Boosts deterministisch, Reihenfolge respektiert.

### Aufgabe 9 -- recall_memory Agent-Tool

**Ziel:** Public Tool das gezielte Cold-Memory-Suche erlaubt.

- Neue Datei `src/core/tools/memory/RecallMemoryTool.ts`.
- Schema: `{ query: string, topK?: 5, multiHop?: false, kindFilter? }`.
- Returnt URI-typed RecallHit[] gerendert als Markdown-Liste.
- ToolName-Enum erweitern.
- Tool-Group `memory` (oder `vault`) zuordnen.

**Akzeptanz:** Tool ist im AgentTask aufrufbar, deterministische Outputs
auf Mock-Stores.

### Aufgabe 10 -- Plugin-MCP Tools (get_vault_implicit_edges, get_vault_note_metadata)

**Ziel:** Standalone-Service-Setup C kann via RPC auf Vault-Index
zugreifen.

- McpBridge erweitern um die zwei neuen Tools.
- Schemas im Tool-Listing.
- Mapping auf bestehende KnowledgeDB-Reads.

**Akzeptanz:** MCP-Client kann Tools rufen, Outputs sind kompatibel
mit KnowledgeGraphAdapter-Interface.

### Aufgabe 11 -- McpKnowledgeAdapter + Standard-Adapter-Registrierung

**Ziel:** Setup-C-Pfad. Plus Registrierung der Default-Adapter.

- Neue Datei `src/core/memory/McpKnowledgeAdapter.ts` -- ruft die
  Plugin-MCP-Tools über RPC.
- Plugin-Init: erkenne Setup-Klasse (heute hardcoded A oder per Setting),
  registriere Local- oder McpKnowledgeAdapter.
- Plus LocalFileAdapter (file://, read-only fs.readFile), WebUrlAdapter
  (https://, requestUrl), CloudAdapter (Stub).

**Akzeptanz:** AdapterRegistry hat alle 4-5 Schemata registriert.

### Aufgabe 12 -- Engine-Version-Flag + AgentTask-Integration

**Ziel:** Cut-over-Schalter. v2-Pfad wird im AgentTask aufgerufen
wenn flag aktiv, sonst v1.

- Neuer Setting-Field `memory.engineVersion: 'v1' | 'v2'`, default 'v1'.
- AgentTask.buildSystemPrompt: wenn 'v2', call ContextComposer.compose
  und inject in Memory-Block. Sonst altes MemoryService.loadMemoryFiles.
- Settings-UI: Toggle in MemoryTab unter "Memory v2 (Beta)".

**Akzeptanz:** Toggle flippt, v2-Pfad rendert ohne Crash, v1 bleibt
funktional.

### Aufgabe 13 -- Telemetrie-Logs nach _devprocess/logs/memory-v2/

**Ziel:** Beobachtbarkeit.

- Neue Datei `src/core/memory/MemoryV2Telemetry.ts`.
- Loggt: cache_read_tokens / total_input (Anthropic), Retrieval-p95-Latenz,
  Topic-Drift-Events, recall_memory-Calls -- als JSONL nach
  `<plugin-data-dir>/logs/memory-v2/{YYYY-MM-DD}.jsonl`.
- Lesbar via existing `read_agent_logs`-Tool.

**Akzeptanz:** Logs landen, lesbar, Format dokumentiert.

## Reihenfolge + Inkrement

1. Aufgabe 1 (TopicInference) -- isolated, pure
2. Aufgabe 2 (UserProfile-View) -- nur FactStore-Erweiterung
3. Aufgabe 3 (RecallHit-Type + Cold-Start) -- types only
4. Aufgabe 4 (LocalKnowledgeAdapter) -- read-only über knowledgeDB
5. Aufgabe 5 (UnifiedGraphService) -- nutzt 4
6. Aufgabe 8 (ContextRanker) -- pure function, kein DB
7. Aufgabe 6 (ContextComposer) -- nutzt 1, 3, 5, 8
8. Aufgabe 7 (Stale-Edge) -- klein, nach 6
9. Aufgabe 9 (recall_memory Tool) -- nutzt 5, 6
10. Aufgabe 10 (Plugin-MCP-Tools) -- klein, isoliert
11. Aufgabe 11 (McpAdapter + Standard-Registrierung) -- nutzt 4, 10
12. Aufgabe 12 (engineVersion-Flag + AgentTask) -- Cut-Over
13. Aufgabe 13 (Telemetrie) -- am Schluss

## Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|------|-----------|--------|
| `src/core/memory/TopicInference.ts` | NEU | Klein |
| `src/core/memory/RecallHit.ts` | NEU | Klein |
| `src/core/memory/KnowledgeGraphAdapter.ts` | NEU (interface) | Klein |
| `src/core/memory/LocalKnowledgeAdapter.ts` | NEU | Mittel (SQL + JS-BFS) |
| `src/core/memory/McpKnowledgeAdapter.ts` | NEU | Mittel (RPC) |
| `src/core/memory/UnifiedGraphService.ts` | NEU | Mittel |
| `src/core/memory/ContextComposer.ts` | NEU | Hoch (hot path) |
| `src/core/memory/ContextRanker.ts` | NEU | Klein |
| `src/core/memory/MemoryV2Telemetry.ts` | NEU | Klein |
| `src/core/memory/FactStore.ts` | + getUserProfile() | Klein |
| `src/core/memory/EdgeStore.ts` | + markStale() | Klein |
| `src/core/tools/memory/RecallMemoryTool.ts` | NEU | Klein |
| `src/core/tools/types.ts` | + 'recall_memory' enum | Trivial |
| `src/mcp/McpBridge.ts` | + 2 Tools | Klein |
| `src/core/AgentTask.ts` | + engineVersion branch | Mittel |
| `src/main.ts` | + engineVersion + adapter-registration | Klein |
| `src/types/settings.ts` | + memory.engineVersion | Trivial |
| `src/ui/settings/MemoryTab.ts` | + engineVersion-toggle | Klein |
| `src/core/memory/__tests__/*.test.ts` | NEU x 8-10 | Klein |

## Nicht betroffen (Blast-Radius)

- KnowledgeDB.ts, MemoryDB.ts (Schema bleibt)
- v1-Memory-Pipeline (parallel weiter)
- Bestehende SemanticSearch / SemanticIndexService Hot-Path
- Phase-0.5-Components (Snapshot, Lock, Cascade)
- ConsoleInterceptor

## Verifikation

1. Build sauber, alle Tests gruen
2. Coverage > 85% in neuen Files
3. Performance: TTFT-Telemetrie-Snapshot zeigt <800ms p95 nach v2-Switch
4. Cache-Hit-Rate-Snapshot nach 1 Woche v2-Use > 60%
5. Live-Verify: engineVersion='v2' rendert Memory-Block ohne Crash auf
   Sebastians DB

## Open Questions

- ContextComposer-Markdown-Rendering: inline string template oder separate
  Template-File? Vorschlag: inline, weil das Format eng an die Tag- und
  Topic-Logik gebunden ist.
- Topic-Lock-Reset: nur bei neuem sessionId reset. Manuelles Reset ist
  Phase-5-Material (Living Document UX).
- recall_memory-Multihop-Default: depth=1 für Phase 3, depth=2 als
  optionaler Parameter.

## Change Log

### 2026-04-28 - Initial

PLAN-06 erstellt. Status: Active. Trigger: User-Anweisung "weiter im
plan" nach Phase 2 + UI-Polish (Commits 6f5daae, 8c68494, f812b26).
Auto-Mode-konform: Plan first, dann sequenziell durch Aufgabe 1-13
mit Build+Test+Commit pro Schritt.

### 2026-04-28 - Implementation abgeschlossen

User-Anweisung "freigabe für alles, bitte einmal voll durch implementieren".
Alle 13 Aufgaben in einem zusammenhängenden Run umgesetzt.

Commits:
- `eb8b1a6` -- Aufgabe 1 (TopicInference)
- `954a884` -- Aufgaben 2, 3, 8 (UserProfileView, RecallHit, ContextRanker)
- `3d65dcb` -- Aufgaben 4, 5, 7 (KnowledgeGraphAdapter + LocalKnowledgeAdapter
  + UnifiedGraphService + Stale-Edge in EdgeStore)
- `e0fdf81` -- Aufgaben 6, 9 (ContextComposer + recall_memory tool)
- (folgend) -- Aufgaben 10, 11, 12, 13 (Plugin-MCP-Tools, McpKnowledgeAdapter,
  StandardAdapters, engineVersion-Flag + AgentSidebarView cut-over,
  MemoryV2Telemetry)

**Tests:** 718 grün (von 644 vor Phase 3, also +74 neu für Phase 3).
**Engine-Coupling:** 0 obsidian-Imports in `src/core/memory/*.ts`.

**Scope-Anpassungen während der Implementation:**
- Aufgabe 9 (recall_memory) nutzt aktuell keyword-overlap-Ranking statt
  Cosine über fact_embeddings -- die EmbeddingService-Integration für
  Fact-Embeddings ist Phase-4-Material (FEAT-03-18). API-Form bleibt
  stabil; der Upgrade ist lokal.
- Aufgabe 11 (McpKnowledgeAdapter.searchSimilar) returniert in Phase 3
  bewusst leeres Array, weil cross-process Embedding-Vector-Search nicht
  portabel ist. Phase-4-FactExtractor lift das.
- Vault-Adapter (`vault://`) ist nicht in StandardAdapters.ts -- der
  ist Plugin-spezifisch, lebt mit der Obsidian-Wiring im main.ts.

**Cut-over:** `settings.memory.engineVersion === 'v2'` schaltet
ContextComposer in AgentSidebarView ein. Default bleibt 'v1'.
Reload erforderlich nach Switch.

**Open / Phase 4:**
- FactExtractor (FEAT-03-18) konsumiert driftEvent aus ContextComposer
  und schreibt re-extract-Jobs in die ExtractionQueue.
- recall_memory: Cosine-Pfad via fact_embeddings.
- McpKnowledgeAdapter.searchSimilar: voller Pfad, sobald cross-process
  Embedding-Bridge konzeptioniert ist.
