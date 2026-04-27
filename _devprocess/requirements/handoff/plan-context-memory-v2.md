---
id: plan-context-memory-v2
title: Plan-Context fuer Memory v2 + UCM Foundation
status: Ready for Coding
created: 2026-04-26
author: Architect
related:
  - architect-handoff-memory-v2.md
  - PLAN-001-memory-v2-master.md
  - BA-UNIFIED-CHAT-MEMORY-V2.md
  - 12 ADRs ADR-076 bis ADR-087 (alle Proposed)
  - 12 Features FEATURE-0314 bis FEATURE-0325
---

# Plan-Context -- Memory v2 + UCM Foundation

> Context-Bridge von /architecture zu /coding. Enthaelt verbindlichen Tech-Stack, Quality-Goals, ADR-Summary, Data-Model und Performance/Security-Targets. Coding-Phase loadet diesen Kontext + alle ADRs + alle Features und macht die finale Implementation-Entscheidung gegen den realen Codebase-Stand.

## 1. Technical Stack

### Sprachen + Build
- **TypeScript strict** (alle neuen Files)
- **esbuild** mit Deploy-Plugin (heute existierend, unveraendert)
- Plugin-Build target: Electron-Renderer-Process im Obsidian-Plugin-Kontext

### Storage
- **sql.js@^1.14.1** (WASM SQLite, einziger erlaubter Driver -- native bessere-sqlite3 vom Review-Bot blockiert)
- **Custom-WASM-Build mit FTS5+JSON1** falls Phase-0-Spike das Bundle-Size-Limit traegt (Quality-Gate < +500KB), sonst JS-Trigram-Index-Fallback

### Embeddings
- **Multilingual-Embedding-Provider** -- konfigurierbar via `activeEmbeddingModelKey` in Plugin-Settings (heutiges Default leerer String, Memory v2 macht Onboarding-Hint aktiv)
- Sebastians-Setup nutzt **qwen3-embedding-8b** via OpenRouter (multilingual, 100+ Sprachen)
- Alternativen built-in: `text-embedding-3-small` (OpenAI), `paraphrase-multilingual-mpnet` (Xenova lokal)
- Embedding-Format: Float32Array-BLOB in DB-Spalten

### LLM (Single-Call-Extraction + Inference-Pass)
- Konfigurierbar via `memoryModelKey` in Plugin-Settings (separat von Chat-Modellen)
- Anforderung: **Tool-Calling-Support** (Anthropic, OpenAI, Gemini supported, Ollama u.U. nicht -- siehe ADR-083 Open-Question)
- Sebastians-Setup nutzt **Claude Haiku 4.5** (kostenoptimiert)

### Bestehende Dependencies (unveraendert)
- @aws-sdk/client-bedrock-runtime, @aws-sdk/client-bedrock (FEATURE-Bedrock-Fetch-Models)
- @anthropic-ai/sdk, @openai/sdk (Chat-Modelle)
- requestUrl (Obsidian-API, ersetzt fetch())
- Electron SafeStorage (FEATURE-0311, fuer Bearer-Token in Settings)

### Verbote (Review-Bot-Compliance, MUSS eingehalten werden)
- Kein `console.log()` / `console.info()` (nur `.debug`/`.warn`/`.error`)
- Kein `fetch()` (nur `requestUrl`)
- Kein `require()` (nur `import`, Ausnahme `require('electron')` mit eslint-disable)
- Keine hardcoded `.obsidian` Pfade (nur `vault.configDir`)
- Kein `element.style.X = Y` (nur CSS-Klassen)
- Kein `innerHTML` (nur Obsidian DOM API)
- Keine `any` Types (nur `unknown` + Type Guards, oder `obsidian-augments.d.ts`)
- Keine Floating Promises (nur `void`-Prefix oder `.catch()`)
- Kein `as TFile`/`as TFolder` (nur `instanceof`-Checks)
- Kein `Vault.delete()`/`Vault.trash()` (nur `FileManager.trashFile()`)

## 2. Architecture Style + Quality Goals

**Architecture Style:** Library-as-Engine mit Persistenz-Service-Pattern. Hosting-neutral: gleiche Engine-Instanz laeuft in Obsidian-Plugin-Renderer ODER in standalone Node-Service.

**Quality Goals (priorisiert):**

1. **Hosting-Neutralitaet** -- Engine darf nicht wissen wo sie laeuft (UCM-Foundation)
2. **Token-Effizienz** -- < 1500 Tokens pro Memory-Operation (Mem0-Benchmark-Ziel), Cache-Hit > 60%
3. **Privacy + Souveraenitaet** -- Local-First, Forget-Right-Compliance, kein Cloud-Storage-Zwang
4. **Performance** -- Conversation-Start TTFT < 800ms p95, recall_memory < 100ms
5. **Korrektheit** -- 0 BUG-012-Korruptionen pro 1000 Schreibvorgaenge, 0 Stale-Refs nach Vault-Rename

## 3. ADR Summary Table

| ADR | Titel | Status | Phase-0-Spike-abhaengig? | Trigger-ASRs |
|---|---|---|---|---|
| ADR-076 | Episode-Fact-Boundary | Proposed | nein | Triage Episodes vs Facts |
| ADR-077 | Memory v2 Storage Schema | Proposed | **ja** -- FTS5/JSON1-WASM-Bundle-Size | ASR-001, ASR-002 |
| ADR-078 | URI-Versioning + Source-Adapter-Registry | Proposed | nein | ASR-017, ASR-021, ASR-038a |
| ADR-079 | Knowledge-DB-Haertung + Multi-File-Atomic-Commit | Proposed | nein | BUG-012, ASR-001, ASR-033, ASR-037 |
| ADR-080 | Persistenz-Service-Pattern (3 Setup-Klassen) | Proposed | **ja** -- ATTACH+CTE-Performance | ASR-031, ASR-027, ASR-030, ASR-042 |
| ADR-081 | MCP-Tool-Routing + Plugin-Standalone-RPC | Proposed | nein | ASR-032, ASR-034, ASR-045 |
| ADR-082 | Topic-Inference-Strategie (lokale Centroids, Soft-Lock) | Proposed | nein | ASR-007, ASR-019, ASR-008 |
| ADR-083 | Single-Call Tool-Calling Output-Schema | Proposed | **ja** -- Token-Profil-Spike | ASR-009, ASR-021, ASR-040, ASR-052, ASR-053, ASR-054 |
| ADR-084 | Engine-Public-API-Versionierung (semver + Schema-Version) | Proposed | nein | ASR-014, ASR-039 |
| ADR-085 | Soft-Delete-Cascade auf vier Granularitaets-Ebenen | Proposed | nein | ASR-043, ASR-044 |
| ADR-086 | Inference-Pass-Architektur fuer Derives | Proposed | nein | ASR-056 |
| ADR-087 | Vault-Note-Memory-Source-Pipeline | Proposed | nein | ASR-060 |

**Phase-0-Spike-Quality-Gates** (vor Phase-1-Implementation Pflicht):

1. **ATTACH+CTE-Performance auf Sebastians DB-Groessen** (~200MB knowledge.db, ~10MB memory.db): wenn 2-Hop-Walk > 200ms p95, Fallback auf JS-BFS in UnifiedGraphService.
2. **FTS5+JSON1-WASM-Bundle-Size**: wenn Custom-Build > +500KB, Fallback auf Trigram-Index in JS-Layer + JS-Validation fuer JSON-Felder.
3. **Single-Call-Token-Profil mit 5 realen Conversations**: wenn p95 > 3000 Tokens, Schema-Strict-Reduktion oder Free-Form-Fallback.

ADRs werden von /coding-Phase nach Codebase-Review zu Accepted promoted, bevor erste Schemata in Production landen.

## 4. Data Model (Core Entities)

```
facts (memory.db)
  ├── id (PK)
  ├── text
  ├── topics (JSON-Array, 1-3 Eintraege)
  ├── importance (0.0-1.0)
  ├── kind ('fact' | 'preference' | 'identity' | 'event')
  ├── created_at, last_confirmed_at, confirmation_count
  ├── last_used_at, use_count
  ├── source_session_id, source_thread_id
  ├── source_interface ('obsilo' | 'claude-desktop' | 'claude-code' | 'chatgpt-dev-mcp' | 'file-system' | 'cloud-provider' | 'web' | 'vault-note')
  ├── source_uri (vault://-URI bei Note-Source, sonst NULL)
  ├── superseded_by (FK to facts.id), is_latest (Boolean)
  ├── deleted_at, deletion_reason
  └── metadata (JSON)

fact_embeddings (memory.db, separate Tabelle)
  ├── fact_id (PK, FK to facts.id)
  ├── embedding (BLOB, Float32Array)
  └── embedding_model

fact_edges (memory.db)
  ├── id (PK)
  ├── from_fact_id (FK to facts.id)
  ├── to_fact_id (FK to facts.id, NULL bei externer URI)
  ├── to_external_ref (URI: vault://, file://, https://, entity:, thread:, NULL bei to_fact_id)
  ├── edge_type ('co_occurrence' | 'same_topic_high_similarity' | 'supersedes' | 'refines' |
  |              'mentions_entity' | 'mentions_vault_note' | 'mentions_file' | 'mentions_url' |
  |              'mentions_cloud_file' | 'derived_from_episode' | 'derived_from_pattern' |
  |              'cross_interface_continuation' | 'mentions_external')
  ├── weight (0.0-1.0)
  ├── source_interface
  ├── deleted_at
  └── metadata

communication_styles (memory.db) -- ersetzt soul.md aus V1
  ├── id (PK)
  ├── context_match ('default' | 'topic:coding' | ...)
  ├── style_description, examples
  └── importance, created_at, last_updated_at

conversation_threads (memory.db) -- UCM Cross-Interface
  ├── thread_id (PK)
  ├── title, created_at, last_active_at, session_count
  ├── memory_eligible, memory_eligible_at
  └── metadata

known_topics (memory.db) -- Topic-Registry
  ├── topic (PK)
  ├── fact_count, first_seen_at, last_seen_at
  ├── description
  ├── centroid_embedding (BLOB) -- fuer lokale Topic-Inference (ADR-082)
  └── centroid_computed_at

memory_audit (memory.db)
  ├── id (PK)
  ├── timestamp
  ├── operation ('insert' | 'confirm' | 'supersede' | 'soft_delete' | 'hard_delete' | 'restore')
  ├── fact_id, related_fact_id, session_id
  ├── rationale, metadata
  └── (use-Events sind inline in facts.use_count, NICHT in audit)

memory_source_notes (memory.db) -- FEATURE-0325
  ├── note_path (PK, vault-relativ)
  ├── last_extracted_at, dirty (0/1)
  ├── fact_count, marker_source ('agent-tool' | 'frontmatter' | 'settings-list')
  └── created_at

history_chunks (history.db) -- FEATURE-0320
  ├── id (PK)
  ├── conversation_id, message_index, chunk_index
  ├── role, text, embedding (BLOB), embedding_model
  └── indexed_at

[Bestand unveraendert in memory.db: sessions, episodes, recipes, patterns]
[knowledge.db unveraendert ausser embedding_model-Spalte und URI-Konvention -- FEATURE-0314]
```

## 5. External Integrations

| Integration | Protokoll | Auth | Verwendung | ADR |
|---|---|---|---|---|
| LLM-Provider (Anthropic/OpenAI/Gemini) | HTTPS REST | API-Key in Settings | Single-Call-Extraction, Inference-Pass | -- |
| Embedding-Provider (OpenRouter/OpenAI/Xenova lokal) | HTTPS REST oder lokal-WASM | API-Key in Settings | Vector-Indexing aller Facts | -- |
| Cloudflare-Relay-Worker | Long-Polling-WebSocket | Bearer-Token | Externe MCP-Clients zum Plugin-Worker | FEATURE-1404 (existiert) |
| Standalone-UCM-Service (Klasse C) | HTTPS/JSON-RPC | Bearer-Token | Plugin proxied Memory-Tools | ADR-081 |
| MemoryBench-Suite | -- (lokales Tool) | -- | Pre-Release-Eval | FEATURE-0321 |

## 6. Performance + Security Targets (mit Zahlen)

### Performance (NFRs)

| Metrik | Target | Quelle |
|---|---|---|
| Conversation-Start TTFT | < 800ms p95 | FEATURE-0317 |
| recall_memory single-hop | < 100ms p95 | FEATURE-0317 |
| recall_memory multiHop=true (depth=2) | < 500ms p95 | FEATURE-0317 |
| Single-Call-Extraction | < 30s p95 | FEATURE-0318 |
| Aging-Cycle (10k Facts) | < 5s | FEATURE-0318 |
| history_search Tool-Call | < 300ms p95 | FEATURE-0320 |
| Atomic-Write-Aufschlag pro DB-Save | < 50ms | FEATURE-0314, ADR-079 |
| Folder-Rename mit 100 Notes | < 200ms | FEATURE-0314 |
| Migration der 5 MD-Dateien | < 2 Minuten | FEATURE-0316 |
| Initial-Backfill History-Index pro Conversation | < 1s | FEATURE-0320 |
| Topic-Inference (lokal Centroids) | < 50ms | ADR-082 |
| RPC-Aufschlag in Klasse C (LAN) | < 50ms | ADR-081 |
| MemoryBench LongMemEval (MVP-Ziel, Quality-Gate vor Public-Release) | > 70% | BA Section 5.1.2 |
| MemoryBench LoCoMo | > 65% | BA Section 5.1.2 |

### Cost (NFRs)

| Metrik | Target | Quelle |
|---|---|---|
| LLM-Calls pro memory-eligible Conversation | 1 | FEATURE-0318 |
| Conflict-LLM-Calls pro Insert | < 10% | FEATURE-0318 |
| Memory-Block-Tokens pro Conversation | -30% vs heute | FEATURE-0317 |
| Vault-Index-LLM-Cost pro Note | -50% via Combined-Pass | FEATURE-0318 |
| Token-Cost-Cap pro Tag (Auto-Disable) | 1M Input + 200K Output (~$5-10 bei Sonnet) | FEATURE-0318 |
| Cache-Hit-Rate (Anthropic Prompt Cache) | > 60% nach 1 Woche Use | FEATURE-0317 |

### Reliability (NFRs)

| Metrik | Target | Quelle |
|---|---|---|
| BUG-012-Korruptions-Faelle pro 1000 Schreibvorgaenge | 0 | FEATURE-0314 |
| Stale-Refs nach Vault-Rename | 0 | FEATURE-0314 |
| Audit-Log-Wachstum | < 100 Rows pro 1000 Operations | FEATURE-0318 |
| DSGVO-Compliance-Coverage (Forget-Right) | 100% (4 Granularitaets-Ebenen) | FEATURE-0322 |

### Security

- **Bearer-Token + HTTPS** fuer Plugin-Standalone-RPC (Klasse C), konsistent mit FEATURE-1404
- **Single-Writer-Lock per PID** fuer Klasse B (Vault-Sync)
- **Multi-File-Atomic-Commit mit Journal** fuer alle DB-Schreibvorgaenge (ADR-079)
- **PRAGMA integrity_check** beim Plugin-Start, Auto-Recovery aus `.bak`
- **Soft-Delete + Hard-Delete-Job + Backup-Sweep** fuer DSGVO-Forget-Right (ADR-085)
- **Lock-File mit PID** verhindert Doppel-Writes durch parallele Plugin-Instanzen
- **Token-Cost-Cap pro Tag** schuetzt vor runaway-Bug-Cost-Explosion
- **Settings-API-Keys** verschluesselt via Electron SafeStorage (FEATURE-0311)

### Coverage

- FactStore, EdgeStore, StyleStore, HistoryStore: > 90%
- Sonstige Engine-Komponenten: > 85%
- Eval-Test-Set fuer Single-Call-Extraction: 10+ Fixture-Conversations + LLM-as-Judge
- MemoryBench-Adapter Pre-Release-Eval (FEATURE-0321)

## 7. Implementation-Reihenfolge (aus PLAN-001 referenziert)

| Phase | Wochen | Hauptdeliverable | Vorbedingung |
|---|---|---|---|
| 0 | 1.5 | Spikes (ATTACH+CTE, FTS5-Bundle, Token-Profil) + ADRs 076-087 final akzeptiert | Branch `feature/memory-redesign` |
| 0.5 | 1.5 | FEATURE-0314 Knowledge-DB-Haertung (BUG-012-Fix, Vault-Rename-Cascade, embedding_model, URI-Konvention, Daily-Snapshot) | Phase 0 ADRs accepted |
| 1 | 2 | FEATURE-0315 Engine-Foundation (facts, edges, styles, audit, kind, is_latest, source_uri, memory_source_notes, ADR-062-Layout) | Phase 0.5 gruen |
| 2 | 1.5 | FEATURE-0316 Migration + Vault-RRF-Quick-Win | Phase 1 gruen |
| 3 | 1 | FEATURE-0317 Dynamic Context Composition + Reranker + Adapter-Registry + Tool: get_vault_implicit_edges, get_vault_note_metadata | Phase 2, RRF battle-tested |
| 4 | 2 | FEATURE-0318 Single-Call Pipeline + Combined Note-Index + Eval-Test-Set + Token-Cost-Cap | Phase 3 stabil |
| 5 | 1 | FEATURE-0319 Living Document UX + Privacy-Settings + Pipeline-States | Phase 4 produktiv |
| 5b | 1 | FEATURE-0322 Privacy & Forget-Right (Soft-Delete + Cascade) + FEATURE-0323 Memory-UX/Onboarding | Phase 5 |
| 5c | 1 | FEATURE-0324 Inference-Pass + FEATURE-0325 Vault-Note-Source | Phase 4 + Phase 5 |
| 6 | 1 | FEATURE-0320 History Search (history.db, Obsidian + Global-Tabs, Inline-Search) | Phase 5 gruen |
| 7 | 1 | FEATURE-0321 Engine-Extract + MemoryBench-Adapter + Pre-Release-Eval | Phase 6 + 2 Wochen produktiver Use |

**Total brutto:** 17 Wochen.

## 8. Coding-Phase Aufgaben

`/coding` Phase 1 wird:

1. **3 Phase-0-Spikes ausfuehren** (Quality-Gate fuer Phase-1-Start)
2. **ADRs 076-087 nach Codebase-Review zu Accepted promoten** (oder Modifikationen vorschlagen wenn Codebase-Realitaet anders als ADR-Annahme)
3. **PLAN-Datei pro Phase persistieren** in `_devprocess/implementation/plans/PLAN-{NNN}-...md` (ueblicher Pattern aus skills/coding)
4. **Critical Codebase-Review** auf:
   - Sebastians qwen3-embedding-8b-Setup verifizieren (ist `activeEmbeddingModelKey` gesetzt?)
   - heutige memory.db Struktur (sessions, episodes, recipes, patterns Bestand)
   - Cloudflare-Relay-Code (`src/mcp/relayWorkerCode.ts`, `src/mcp/McpBridge.ts`)
   - sql.js-Custom-WASM-Build-Toolchain
   - vault.on('rename')/('modify')/('delete')-Hook-Integration
5. **Schema-Migration testen** auf Sebastians realer DB (Backup vor Test, Restore-Pfad noetig)

## 9. Risks (aus Architecture-Sicht, fuer Coding monitoren)

- **R-1 sql.js-Custom-WASM-Build-Komplexitaet:** Build-Tooling fuer Custom-WASM ist nicht-trivial. Coding muss verifizieren ob das im esbuild-Pipeline integrierbar ist.
- **R-2 ATTACH-DATABASE-Limits in sql.js:** sql.js-Doku zu ATTACH ist sparlich. Coding muss in Spike verifizieren ob attached DBs kreuzweise transactional schreibbar sind.
- **R-3 Multi-File-Atomic-Commit-Komplexitaet:** Crash-Recovery via Journal ist nicht-trivial. Coding sollte robust testen mit Fault-Injection (writeFile wirft mid-write).
- **R-4 Vault-Hook-Subtleties:** vault.on('rename') feuert vor oder nach dem File-Move? Inkonsistenzen koennen Cascade brechen. Coding muss empirisch verifizieren.
- **R-5 Topic-Centroid-Performance bei aktivem Use:** Centroid-Refresh bei jedem Insert koennte sich akkumulieren. Coding sollte profilen + ggf. lazy-refresh implementieren.

## 10. Open Decisions for /coding

ADR-Open-Questions, die /coding entscheidet:

- ADR-077: FTS-Strategie (Custom-WASM vs JS-Trigram) -- Spike-Ergebnis-abhaengig
- ADR-080: Service-Failover-Strategie bei Crash -- post-MVP
- ADR-081: Token-Rotation-UX -- post-MVP
- ADR-082: Centroid-Recalc-Granularitaet (eager vs lazy) -- /coding profilet
- ADR-083: Ollama-Free-Form-Fallback -- post-MVP
- ADR-084: LTS-Strategie -- nach Feedback-Phase
- ADR-085: DSGVO-Export-Trigger -- Backlog
- ADR-086: Multi-Hop-Pattern -- post-MVP
- ADR-087: Inkrementelle Re-Extraktion (Diff-Detection) -- post-MVP

## 11. Dialog (/architecture <-> /coding)

(leer, wird im Verlauf der /coding-Phase gefuellt)
