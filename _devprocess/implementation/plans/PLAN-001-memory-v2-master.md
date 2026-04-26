---
id: PLAN-001
title: Memory v2 Master Plan -- Pfad alpha (Lean Hybrid mit Knowledge-DB-Haertung)
status: Draft
created: 2026-04-26
owner: Sebastian Hanke
branch: feature/memory-redesign
epic: EPIC-003-context-memory-scaling
related:
  - _devprocess/analysis/BA-UNIFIED-CHAT-MEMORY-V2.md
  - _devprocess/requirements/OBSILO-MEMORY-V2-FULL-REWRITE.md
  - _devprocess/architecture/ADR-076-episode-fact-boundary.md
  - _devprocess/architecture/ADR-077-memory-v2-storage-schema.md
  - _devprocess/architecture/ADR-078-uri-versioning-schema.md
  - _devprocess/architecture/ADR-079-knowledge-db-hardening.md
supersedes: ADR-013-memory-architecture (im Verlauf der Implementierung)
---

# PLAN-001 -- Memory v2 Master Plan (Pfad alpha)

> Validierter Implementierungsplan basierend auf Tiefenanalyse der Codebase, kritischer Bewertung der Source-Spec (`OBSILO-MEMORY-V2-FULL-REWRITE.md`) und Best-Practice-Recherche (Mem0, A-MEM, Letta, Zep, Anthropic Prompt Caching, sql.js+FTS5+sqlite-vec).
>
> Ziel: Memory-Subsystem so umbauen, dass die resultierende Engine als `@obsilo/memory-engine` extrahierbar ist und UCM (siehe `BA-UNIFIED-CHAT-MEMORY-V2.md`) auf ihr aufsetzen kann.

## Kontext

Die Source-Spec `OBSILO-MEMORY-V2-FULL-REWRITE.md` ist eine Implementierungs-Skizze, die ohne Codebase-Diagnose entstanden ist. Tiefenanalyse zeigte 15+ kritische Diskrepanzen zur Realitaet (siehe Abschnitt "Doc-Annahmen vs Codebase" weiter unten). Die wichtigsten:

- `memory.db` existiert bereits mit `sessions`, `episodes`, `recipes`, `patterns`, kein Greenfield
- `sql.js@^1.14.1` ist der einzig review-bot-konforme Driver, **ohne** FTS5 und JSON1 im Standard-Build
- BUG-012 (Atomicity-Gap, sql.js full-blob-export bei Cloud-Sync = Korruption) ist heute aktiv P1, nicht gefixt
- Embedding-Modell ist konfigurierbar (CustomModel), nicht "Qwen3 8B via SiliconFlow"
- ADR-062 (KV-Cache-Layout) ist nicht im Code umgesetzt, ohne Fix verbrennt v2 die Cache-Vorteile
- `ConversationMeta`-Struktur fuer Memory-Eligible existiert nicht
- Vault-Rename-Handler vermutlich heute schon defekt

Plus UCM-Konsumenten-Constraints: Engine darf nicht Vault-spezifisch werden, Source-Interface-Tagging muss von Anfang an im Schema sein.

## Designprinzipien (Pfad alpha)

Aus Industrie-Best-Practice 2026 (Mem0, A-MEM, Letta, Zep, Anthropic-Caching) uebernommen:

| Prinzip | Quelle | Konkrete Auspraegung |
|---|---|---|
| Atomic Facts mit Topics + Importance + Provenance | A-MEM, Mem0 | `facts`-Tabelle additiv neben sessions/episodes |
| Single-Call Extraction | A-MEM (~1200 Tokens/Op, 85-93% Reduction) | Session+Facts+Topics+Importance+Edges in 1 LLM-Call |
| Hybrid Retrieval (semantic + keyword + graph, RRF) | Alex Garcia, Mem0, Zep | Statt fixer Bucket-Allocation 30/50/15/5 |
| Lazy Conflict-Resolution | Mem0-Pattern | LLM-Call nur bei Cosine > 0.9 + Topic-Overlap |
| Lokale Topic-Inference (sub-50ms) | Letta, Zep | Embedding-Cosine gegen known_topics-Centroids |
| KV-Cache-aware Composition | Anthropic (92% Hit-Rate Claude Code) | Stable Identity Prefix + Topic-Lock per Conversation |
| Engine-Extraction fuer Library-Reuse | Letta-Pattern | API-Design ab Phase 1 UCM-getrieben |
| Adaptive Token-Budget | Mem0 | Identity ~300 immer, Topical variabel |
| Hybrid Storage SQLite + Float32 + FTS | Alex Garcia | Custom-sql.js-WASM mit FTS5+JSON1 wenn Bundle-Size traegt |
| Atomic Write Pattern (.tmp -> rename) | BUG-012, Industrie-Standard | Multi-File-Atomic-Commit via Journal |
| Touch-Refresh + use_count-Boost Aging | Letta, Mem0 | Statt rein 90-Tage-Decay |
| Universeller Graph mit URI-Schema | Mem0 Pro, Zep | `fact:`, `vault://`, `entity:`, `session:`, `thread:` |
| ATTACH DATABASE statt Schema-Merge | sql.js-Native | Cross-DB-Queries via SQL, kein JS-BFS noetig |

Bewusst NICHT uebernommen: Schwerer Knowledge-Graph mit Multi-Hop-Edges (zu schwer), MemGPT-Style Self-Editing-Memory via Tool-Calls (Pipeline ist post-conversation), Migration-Review-UI (zu schwer fuer Single-User), Periodischer Topic-Merge-Job (Sub-Linear-Wert).

## Phasen-Plan

| # | Phase | Dauer | Vorbedingung | Hauptdeliverable | UCM-Relevanz |
|---|---|---|---|---|---|
| **0** | Spikes + ADRs | 1.5 Wo | Branch existiert | 3 Spikes (ATTACH+CTE-Performance, FTS5/JSON1-WASM-Bundle-Size, Single-Call-Token-Profil), ADR-076 (Episode-Fact-Boundary), ADR-077 (Storage-Schema mit URI), ADR-078 (URI-Versioning), ADR-079 (Knowledge-DB-Haertung), ADR-062-Implementation-Spec (KV-Cache-Layout) | Engine-API-Sketch fliesst in alle ADRs |
| **0.5** | Knowledge-DB-Haertung | 1.5 Wo | Phase 0 ADRs freigegeben | BUG-012-Fix (Multi-File-Atomic-Commit mit Journal), Vault-Rename-Handler (cascadiert in vectors, implicit_edges, tags, note_freshness), `embedding_model`-Spalte in vectors, URI-Konvention `vault://`/`session://`/`episode://` mit One-Shot-Migration, `implicit_edges`-Schema +edge_type+to_external_ref | Knowledge-DB wird ATTACH-tauglich fuer Engine-Reuse |
| **1** | Engine-Foundation | 2 Wo | Phase 0.5 gruen | `memory.db`-Schema additiv (facts, fact_edges, communication_styles, known_topics, memory_audit), `fact_embeddings`-Tabelle separat, FactStore + EdgeStore + StyleStore mit Constructor-Injection, ADR-062-KV-Cache-Layout im Code, gemeinsamer EmbeddingService | Public API wird UCM-getrieben designed, `source_interface`-Spalte zwingend |
| **2** | Migration + Vault-Hybrid-Search-Quick-Win | 1.5 Wo | Phase 1 gruen | Differenzierte Migration (`soul.md` -> `communication_styles`, `knowledge.md` skip, andere 5 -> Facts via Single-Call-Atomizer), Export-Tool "facts -> markdown", Hybrid `semantic_search` mit RRF (Cosine + FTS + Tag-Match + 1-Hop-Edge-Walk) als Vault-Tool zuerst | RRF-Helper als Engine-Public-Utility verfuegbar |
| **3** | Dynamic Context Composition | 1 Wo | Phase 2, RRF battle-tested | ContextComposer mit per-Conversation-Topic-Lock + Cold-Start-Fallback, lokale Topic-Inference (cosine gegen known_topics-Centroids), URI-typed RecallHit[], `recall_memory`-Tool mit `multiHop`-Option, UnifiedGraphService schrumpft auf Query-Template-Provider + ATTACH-Konfiguration | UnifiedGraphService ist Engine-Public-API, Adapter-Pattern fuer Knowledge-DB optional |
| **4** | Single-Call Update Pipeline + Combined Note-Index-Pass | 2 Wo | Phase 3 stabil | Single-Call-Extraction (Session-Summary + Facts + Topics + Importance + Edges + Entities + Vault-Mentions in einem strukturierten Output via Tool-Calling), Lazy Conflict-Resolution (LLM nur bei Cosine > 0.9 UND Topic-Overlap), Aging mit use_count-Boost und last_used_at-Touch-Refresh, Audit-Pruning (nur state-changing Ops), Eval-Test-Set, Combined Note-Index-Pass fuer Vault | Engine bekommt Single-Call-Output-Schema als wiederverwendbares Pattern |
| **5** | Living Document | 1 Wo | Phase 4 produktiv stabil | `cross_interface_continuation`-Edges + `thread:{id}`-URI-Type, Save-to-Memory-Trigger (Star-Button + Hotkey + `mark_conversation_for_memory`-Tool), Re-Extraction-Throttle (max 1/60s pro Conversation), Auto-Suggestion-Service mit Telemetrie, gold-border Eligibility-Indicator | UCM-tragende Datentraeger (`source_interface`, `thread_id`) sind Engine-public |
| **6** | History Search | 1 Wo | Phase 5 gruen | `history_chunks`-Tabelle in `knowledge.db` mit URI-Konvention, FTS5 + Cosine, HistoryIndexer (incremental + abortable backfill), `search_history`-Tool, UI-Sidebar-Search | History-Search wird via Engine-Public-API nutzbar, Adapter-isoliert |
| **7** | Engine-Extraction zu @obsilo/memory-engine | 1 Wo | Phase 6 gruen, 2 Wochen produktiver Use auf Sebastians Vault | Package-Extraction, Public-API frozen (FactStore, EdgeStore, StyleStore, ContextComposer, FactExtractor, FactIntegrator, AgingService, PendingReviewService, UnifiedGraphService, EmbeddingService, RRF-Helper), Adapter-Interface fuer Knowledge-DB, Konfig-Abstraktion (DB-Pfad, Embedding-Provider, LLM-Provider, Source-Interface-Name), API-Doc + Migration-Guide | UCM kann Library importieren, Knowledge-Adapter optional registrieren |

**Gesamt: 11.5 Wochen Brutto.**

## Stop-Punkte und Rollback-Optionen

- **Nach Phase 0:** Spike-Ergebnisse erlauben Architektur-Entscheidung. ATTACH+CTE-Performance kippt -> Fallback JS-BFS. FTS5-WASM-Bundle zu gross -> Trigram-Index in JS.
- **Nach Phase 0.5:** Knowledge-DB ist hardened, selbst bei Memory-v2-Abbruch hat Vault-Pfad gewonnen.
- **Nach Phase 3:** v2 Retrieval ist live, Kern-Ziel erreicht. Phasen 4-7 sind Nachschaerfung.
- **Nach Phase 6:** UCM-Foundation steht funktional, Phase 7 macht sie nur explizit als Package.

## Doc-Annahmen vs Codebase (Realitaetsabgleich)

| Source-Doc-Annahme | Codebase-Realitaet | Konsequenz |
|---|---|---|
| `memory.db` ist Greenfield | Existiert bereits mit sessions, episodes, recipes, patterns | Schema additiv, kein Cutover |
| FTS5 + JSON1 in sql.js verfuegbar | Standard-Build hat keines | Custom-WASM-Build oder JS-Layer-Fallback (ADR-077) |
| BUG-012 reicht "Transactions, audit log, periodic backup" | sql.js export ist Full-Blob, nicht atomar | Multi-File-Atomic-Commit zwingend (ADR-079) |
| "Qwen3 8B via SiliconFlow" als Default-Embedding | Settings-Default ist `''`, Memory ist heute broken-by-default | Smart-Default oder Onboarding-Pflicht |
| ADR-062 KV-Cache-Layout existiert | Nur architektonisch, nicht im Code | Phase 1 muss Code-Reorder vor v2-Inject |
| `ConversationMeta`-Struktur erweitern | Existiert nicht, nur `PendingExtraction` | Neue Struktur (Phase 5) |
| `BetterSqlite3`-Verfuegbarkeit angenommen | Review-Bot blockiert native Bins | sql.js bleibt Driver |
| Migration-Review-UI als 2-Wochen-Phase | Single-User, UI-Aufwand unverhaeltnismaessig | Background-Job mit Inline-Edit (Phase 2) |
| `LongTermExtractor` + `SessionExtractor` als zwei Calls | Kostet 2 LLM-Calls/Conversation | Single-Call-Extraction (Phase 4) |
| Topic-Inference per LLM beim Conversation-Start | Latenz-Selbstmord (~500-1500ms TTFT) | Lokale Cosine-Inference, einmal pro Conversation gelockt (Phase 3) |
| 6 Markdown-Dateien als Migrationsquelle | Session-Summaries sind schon DB-first (ADR-060) | Differenzierte Migration pro Datei |
| Recipe-Promotion (ADR-058) ignoriert | Aktiv im Code, nutzt Episodes | ADR-076 klaert Episode-Fact-Boundary |
| Vault-Rename ohne Cascade | Heute schon defekt (vermutlich) | Phase 0.5 fixt das fuer Vault-Pfad |
| Embedding-Model-Drift unbeachtet | Heute latent, manueller Wechsel = stale Cosine | `embedding_model`-Spalte in vectors + facts (Phase 0.5 + 1) |
| `vectors.path` als beliebiger String | Inkonsistent (Vault-Pfad + session:-Prefix + episode:-Prefix) | URI-Konvention (Phase 0.5) |
| `implicit_edges` nur Vault-zu-Vault | Multi-Type-Edges fehlen | Phase 0.5 erweitert um edge_type + to_external_ref |
| `semantic_search` reines Cosine | Recall-Quality unter Hybrid-Potential | Phase 2 RRF-Quick-Win |
| `note_freshness`/`implicit_edges`/Tag-Hints in 3 LLM-Calls | Cost-Verschwendung | Phase 4 Combined-Pass |
| `knowledge.db` hat keinen Audit-Trail | Drift-Debugging unmoeglich | Audit-Pruning-Pattern Phase 4 |

## Was sich gegenueber dem Source-Doc aendert

| Source-Doc-Plan | Pfad alpha (PLAN-001) |
|---|---|
| Phase 0 ADRs nur Memory-spezifisch | Phase 0 + Phase 0.5 mit Knowledge-DB-Haertung als Vorbedingung |
| Schema-Greenfield in `memory.db` | Schema additiv, Knowledge-DB pre-hardened |
| Migration als 2-Wochen-Phase mit Review-UI | 1.5 Wo Migration + RRF-Vault-Quick-Win zusammen |
| ContextComposer mit fixer Bucket-Allocation 30/50/15/5 | RRF-Reranking, per-Conversation-Topic-Lock, Cold-Start-Fallback |
| Separate SessionExtractor + LongTermExtractor + ContextPrefix-Calls | Single-Call-Extraction + Combined Note-Index-Pass fuer Vault |
| Conflict-Resolution fuer jeden Insert | Lazy: nur bei Similarity-+-Topic-Schwelle |
| Engine-Extract erst Phase 7 als Footnote | Phase 7 ist UCM-Liefer-MUSS, API ist seit Phase 1 darauf vorbereitet |

## Source-Adapter-Registry (Cross-Cutting, ergaenzt 2026-04-26)

Edges sind nicht auf Vault-Notes beschraenkt. `fact_edges.to_external_ref` akzeptiert beliebige URIs aus offenen Schemata. Resolution (URI -> Inhalt) ist Adapter-Sache und optional. Ohne Adapter bleibt der URI ein Reference-Token, das im Hybrid-Retrieval trotzdem auftaucht.

**Engine-known Standard-Adapter:**

| Adapter | Schema | Read | Watch (Rename/Delete) | Implementation-Phase |
|---|---|---|---|---|
| VaultAdapter | `vault://` | ja (Markdown + parseDocument fuer Attachments) | ja (vault.on('rename')) | Phase 0.5 (vorbereitet), Phase 3 (registriert) |
| LocalFileAdapter | `file://` | ja (Read-only via Obsidian DataAdapter) | nein (akzeptierte Limitation) | Phase 3 |
| WebUrlAdapter | `https://`, `http://` | ja (requestUrl + optional Cache) | nein | Phase 3 |
| CloudAdapter | `cloud://{provider}/{path}` | Stub, Provider-Implementierung opt-in | nein | Phase 7+ |
| Custom-Adapter | beliebig (z.B. `notion://`, `slack://`) | Konsumenten-spezifisch | optional | UCM-spezifisch oder Plugin-Erweiterung |

**Folgen fuer den Plan:**

- ADR-078 erweitert um Source-Adapter-Registry (siehe ADR)
- FEATURE-0314: Vault-Rename-Cascade ist nur Vault-internal, externe Schemata akzeptieren stale Refs (dokumentiert)
- FEATURE-0315: Engine-Public-API exportiert `SourceAdapter`-Interface und `AdapterRegistry`-Service
- FEATURE-0317: UnifiedGraphService nutzt AdapterRegistry, KnowledgeGraphAdapter wird einer von vielen
- FEATURE-0318: Mention-Detection erweitert auf alle Schemata (nicht nur Wiki-Links), generisches `mentions: [{uri, label?}]` im Single-Call-Output
- FEATURE-0319: `source_interface`-Spalte erfasst auch externe Quellen (file-system, cloud-provider, web)

**Stale-Edge-Strategie fuer Adapter ohne watch():**

- Resolution-Failure markiert Edge als `stale` in metadata, nicht delete
- Lazy: ein Edge wird erst stale-markiert, wenn er beim Retrieval angefasst wird und Resolution fehlschlaegt
- Optional Background-Health-Check fuer kritische Schemata (file://) -- Phase 7+

## Unified Graph Layer (Cross-DB)

Memory v2 = UCM-Engine + UCM-MCP-API. **Persistenz-Service-Pattern** statt orthogonaler Achsen.

**Konstante:** Plugin-MCP laeuft immer fuer Vault-Tools. knowledge.db bleibt immer beim Plugin (Vault-Zugriff erforderlich).

**Architektur-Prinzip:** Workers (Capture + Query, Multi-Writer) sind getrennt vom Persistenz-Service (einzige Schreib-Stelle physisch). Workers gehen via RPC zum Persistenz-Service. Persistenz-Service ist eine **logische Rolle**, kann von beliebiger Engine-Instanz uebernommen werden.

### Drei Setup-Klassen (MVP)

| Klasse | Persistenz-Service-Standort | memory.db + history.db | knowledge.db (Plugin-bedient, orthogonal) | Workers |
|---|---|---|---|---|
| **A. Single-Device** | Plugin selbst | Plugin-lokal | Plugin-lokal **oder** Vault-resident (heute konfigurierbar via FEATURE-0301 `obsidian-sync`-Mode) | 1 (dieses Plugin) |
| **B. Vault-Sync** | jedes Plugin schreibt direkt in Vault | Vault-resident | Plugin-lokal **oder** Vault-resident (typisch Vault-resident fuer Multi-Device) | n Plugins, Single-Writer-Lock per PID |
| **C. Central-Service** | dedizierte Engine-Instanz (Plugin oder Standalone) | beim Service | Plugin-lokal **oder** Vault-resident, via McpVaultAdapter vom Service abgefragt | n gleichwertige Workers schreiben via RPC |

**knowledge.db-Lokalitaet ist orthogonal zur Persistenz-Service-Klasse.** Plugin-FEATURE-0301 hat heute schon ein Setting fuer Vault-resident vs. Plugin-lokal. Das bleibt unabhaengig konfigurierbar -- knowledge.db wird in jedem Setup vom Plugin bedient (Vault-Indexer ist Plugin-Pflichtfunktion).

### Settings

- `persistenceService`: `'local'` (Klasse A oder B) oder `'remote'` (Klasse C)
- `persistenceServiceUrl`: URL + Bearer-Token wenn `'remote'`
- `dbLocation`: nur wenn `persistenceService='local'` -- `'plugin-local'` (A) oder `'vault-resident'` (B)

### MCP-Tool-Routing in Plugin-MCP

```
Externe Clients (Claude Desktop, ChatGPT, ...) -> Plugin-MCP via Cloudflare
Plugin-MCP empfaengt Tool-Call
+- Vault-Tool (read_file, semantic_search, get_vault_implicit_edges, get_vault_note_metadata)
|  -> Plugin antwortet selbst (knowledge.db lokal)
`- Memory-Tool (save_conversation, search_history, recall_memory, ...)
   +- persistenceService='local'  -> Plugin antwortet via lokaler Engine
   `- persistenceService='remote' -> Plugin proxied via HTTP/JSON-RPC an Persistenz-Service
```

Damit kann Sebastian zwischen Klassen wechseln, ohne dass externe Clients ihre MCP-URL aendern muessen.

### KnowledgeGraphAdapter -- zwei Implementierungen

- **LocalKnowledgeAdapter** (in Plugin und Klassen A/B): direkter ATTACH-CTE-Walk, sub-50ms
- **McpKnowledgeAdapter** (im Standalone-Service in Klasse C): RPC zum Plugin-MCP, ruft `semantic_search`, `get_vault_implicit_edges`, `get_vault_note_metadata`. Plus LAN-RTT-Aufschlag (~20-50ms), bleibt akzeptabel.

UnifiedGraphService kennt nur das Adapter-Interface, nicht ob lokal oder remote. Engine-Code identisch.

**Plugin-MCP bekommt zwei zusaetzliche Tools** in FEATURE-0317 (heute fehlend): `get_vault_implicit_edges(notePath)` und `get_vault_note_metadata(notePath)`. `semantic_search` existiert bereits.

**Engine-Hosting-Neutralitaet:** Engine kennt keinen Host. Gleiche Stores, gleiche API in beiden Worker-Varianten. `source_interface`-Tagging entscheidet ueber Provenance.

**Cloudflare-Relay-Mechanismus** (heute im Code: `src/mcp/relayWorkerCode.ts`, `src/mcp/McpBridge.ts`): Long-Polling-Bridge, kein Storage. Plugin-Worker ist always-on solange Obsidian-Desktop offen ist.

### Mobile-Architektur-Constraints (C7-Beschluss 2026-04-26)

Mobile-Support (iOS/iPadOS via Obsidian Mobile, BA-023 referenziert) ist post-MVP, aber Architektur muss Mobile-tauglich bleiben. Folgende Prinzipien werden eingehalten:

- **sql.js bleibt einziger Driver**, laeuft auf Mobile (WASM-Standard). Kein Wechsel zu native bessere-sqlite3.
- **Memory-Engine bleibt JS-only**, kein native Module.
- **Single-Device-Klasse A funktioniert auf Mobile** auch ohne Cloudflare-Relay. Plugin schreibt lokale DBs und behaelt Memory-Funktionalitaet.
- **Cloudflare-Tunnel + externe Clients-Anbindung** wird auf Mobile nicht aktiv supported (akzeptierte Limitation).
- **Vault-resident DBs (Klasse B) auf Mobile** problematisch (iCloud-Sync-Konflikte mit Lock-File). Best-effort.

Diese Architektur-Constraints werden bei jedem Memory-v2-Feature-PR gegen die Spike-Ergebnisse abgeglichen. Re-Triage von BA-023 nach Memory-v2-Phase-3.

### Setup-Wechsel-Migration (cross-cutting Engine-API)

User wechselt zwischen K1-K4. Engine-Public-API exportiert `MigrationService` mit Operationen:

- `validateTarget(targetSetup)`: Pre-Validation (Erreichbarkeit, Disk-Space, Vault-Pfad)
- `dumpAll()`: Atomarer Export aller drei DBs (memory.db, history.db, knowledge.db) als portables Format
- `restoreAll(dump, conflictMode)`: Atomarer Import mit Conflict-Resolution-Mode (`merge` | `standalone-master` | `plugin-master`)
- `lockForMigration()` / `unlockAfterMigration()`: Read-only-Lock waehrend Transfer
- `recoverPendingMigration()`: Bei Plugin-Restart, journal-getrieben

**Migrations-Wizard-UI (FEATURE-0319-DoD ergaenzt):** Settings-Modal "Memory & UCM" mit Wizard-Schritten 1-7 (Validation, Backup, Plan-Vorschau, Konflikt-Wahl, Progress, Smoke-Test, Revert-Hinweis).

**Konflikt-Resolution bei Reverse-Wechsel:** FactIntegrator aus FEATURE-0318 wird als Merge-Strategie wiederverwendet. Importierte Facts laufen durch denselben Lazy-Conflict-Pfad wie reale Conversation-Inserts. Damit ist die Konflikt-Resolution beim Setup-Wechsel kein Sondercode, sondern existierender Pfad.

**Migration-Wechsel-Tabelle:**

| Wechsel | Mechanik | Konflikt-Risiko |
|---|---|---|
| K1 ↔ K2 | File-Move zwischen `.obsidian-agent/` und `vault/.obsilo-data/`, Lock-Setup-Aenderung | gering |
| K3 ↔ K4 | Standalone-Daten via API umlagern, Vault-File-Zugriff fuer Standalone setup/teardown | mittel |
| K1 ↔ K3 | Vollstaendiger Dump+Restore zwischen Plugin-DB und Standalone-DB | hoch (Reverse: Konflikt-Resolution) |
| K1 ↔ K4 | File-Move + Standalone-Setup + Vault-Zugriff | hoch |
| K2 ↔ K3 | Vault-Files extrahieren, Standalone-Restore, Vault-Files entfernen | mittel-hoch |
| K2 ↔ K4 | Daten bleiben am Platz, nur routingMode-Switch + Standalone-Setup | mittel |

URI-Konvention:

| Knoten-Typ | URI-Schema | Beispiel |
|---|---|---|
| Fact | `fact:{id}` | `fact:412` |
| Vault-Note | `vault://{relative_path}` | `vault://Notes/UniCredit.md` |
| Session-Summary | `session:{id}` | `session:2026-04-25-a3f2` |
| Episode | `episode:{id}` | `episode:817` |
| Entity | `entity:{name}` | `entity:UniCredit` |
| Thread (UCM) | `thread:{id}` | `thread:abc-xfer` |

Edge-Typen:

| Edge-Type | Erzeugung | Wo? | Universell? |
|---|---|---|---|
| `co_occurrence` | beim Insert: Facts derselben Conversation | fact_edges | ja |
| `same_topic_high_similarity` | beim Insert: cosine > 0.85 + topic-overlap | fact_edges | ja |
| `supersedes` / `refines` | Conflict-Resolution | fact_edges | ja |
| `mentions_entity` | Single-Call-LLM-Output | fact_edges (to_external_ref=`entity:...`) | ja |
| `mentions_vault_note` | Single-Call-LLM-Output + Markdown-Link-Parser | fact_edges (to_external_ref=`vault://...`) | nur Obsilo |
| `cross_interface_continuation` | UCM-Thread-Verlinkung | fact_edges (to_external_ref=`thread:...`) | nur UCM |
| `vault_implicit` | Vault-Crawler (existiert) | knowledge.db.implicit_edges | nur Obsilo |
| `mentions_file` | Markdown-Link-Parser + LLM-Output | fact_edges (to_external_ref=`file://...`) | universell, Resolution via LocalFileAdapter |
| `mentions_url` | URL-Parser + LLM-Output | fact_edges (to_external_ref=`https://...`) | universell, Resolution via WebUrlAdapter |
| `mentions_cloud_file` | LLM-Output (User erwaehnt explizit) | fact_edges (to_external_ref=`cloud://...`) | universell, Resolution via CloudAdapter |
| `mentions_external` (generisch) | Custom | fact_edges (to_external_ref=beliebiges Schema) | universell, Adapter-driven |

## Eval & Quality Gates

- Eval-Test-Set als Phase-1-Deliverable (5+ realistische Conversations mit erwarteten Fact-Outputs)
- Token-Profil-Spike vor ADR-Sign-off (3-5 reale Conversations, Single-Call-Cost messen)
- Cache-Hit-Rate-Ziel: > 60% in v2 nach 1 Woche Use (heute vermutlich < 20%)
- Retrieval-p95-Ziel: < 200ms fuer Conversation-Start, < 500ms fuer recall_memory(multiHop=true)
- Storage-Wachstum: < 100MB pro 10k Facts (inklusive Embeddings, Audit-Log gepruned)

## Risks (zusaetzlich zu Source-Doc R1-R9)

| ID | Risiko | Mitigation |
|---|---|---|
| R10 | ATTACH+CTE-Performance kippt bei Sebastian's DB-Groesse | Phase 0 Spike, JS-BFS-Fallback |
| R11 | Custom-sql.js-WASM-Build sprengt Bundle-Size | Phase 0 Spike, Trigram-Index-Fallback |
| R12 | Single-Call-Extraction-JSON-Output instabil | Tool-Calling mit Schema, Robust-Parser, Eval-Test-Set |
| R13 | Vault-Rename-Cascade trifft Edge-Cases (Konflikte, Renames waehrend Indexing) | Phase 0.5 Test-Suite mit fault injection |
| R14 | Topic-Centroid-Drift bei Modell-Wechsel | embedding_model-Filter im Centroid-Compute, Re-Embed-Job |
| R15 | Audit-Log-Volumen explodiert ohne Pruning | Inline-Counter statt Audit-Row fuer Use-Events (Phase 4) |

## Ausgelassene Themen aus Source-Doc

- Migration-Review-UI als eigene 2-Wochen-Phase (zu schwer fuer Single-User)
- Periodischer Topic-Merge-Consolidation-Job (sub-linear Wert)
- CLI-Befehl `npx obsilo memory-v2 rollback` (Plugin hat keinen CLI)
- Vollstaendiger MemGPT-Style Self-Editing-Memory (Pipeline ist post-conversation)

## Backlog-Mapping

Die 8 Phasen werden 8 Features unter EPIC-003 (siehe Backlog-Update). Numerierung: FEATURE-0314 bis FEATURE-0321. Detail-Specs entstehen in `/requirements-engineering`.

## Open Decisions vor Phase 0

- Branch-Name: `feature/memory-redesign` (gesetzt) statt `feature/memory-v2` (Source-Doc)
- Embedding-Modell-Default fuer Migration: konfigurierbar, aber Migration braucht Sebastian's-Wahl vorab
- Custom-sql.js-WASM-Build vs Trigram-Fallback: nach Phase-0-Spike entscheiden
