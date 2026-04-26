---
id: architect-handoff-memory-v2
title: Architect Handoff -- Memory v2 + UCM Foundation
status: Ready for Architect
created: 2026-04-26
author: Requirements Engineer
related:
  - PLAN-001-memory-v2-master.md
  - BA-UNIFIED-CHAT-MEMORY-V2.md
  - 8 FEATUREs FEATURE-0314 bis FEATURE-0321
  - 4 ADRs ADR-076 bis ADR-079 (Proposed)
---

# Architect Handoff -- Memory v2 + UCM Foundation

## 1. Scope

- **Scope:** MVP (Plugin-internes Capability-Set, plus Engine-Extract als Foundation fuer separates UCM-Projekt)
- **Main goal:** Obsilo-Memory-Subsystem rewriten (8 Phasen, 8 FEATUREs unter EPIC-003), Engine als `@obsilo/memory-engine` extrahieren, UCM kann darauf aufsetzen
- **Target release:** Phasen 0.5, 1, 2 koennen jeweils als minor-Release gehen (v2.7.x). Phase 3 ist Cut-over auf v2-Retrieval (v2.8.0). Phase 7 ist Engine-Extract (v3.0.0 Vorbereitung).
- **Branch:** feature/memory-redesign

## 2. Architecturally Significant Requirements (ASRs)

| ID | Source FEATURE | Classification | Constraint | Notes |
|---|---|---|---|---|
| ASR-001 | FEATURE-0314 | Critical | Multi-File-Atomic-Commit-Pattern muss zwei DBs koordiniert haerten (memory.db + knowledge.db, spaeter +ucm-sidecar.db) | ADR-079, BUG-012-Recurrence sonst |
| ASR-002 | FEATURE-0314 | Critical | URI-Konvention fuer vectors.path muss VOR Memory v2 stehen | ADR-078, sonst spaetere Edge-Migration |
| ASR-003 | FEATURE-0315 | Critical | Stores nutzen Constructor-Injection, keine Singletons oder globalen Plugin-Verweise | Phase-7-Engine-Extract sonst Refactor-Marathon |
| ASR-004 | FEATURE-0315 | Critical | ADR-062 KV-Cache-Layout muss VOR der dynamischen Composition (Phase 3) stehen | Sonst 500-1000 ungecachte Tokens pro Turn |
| ASR-005 | FEATURE-0315 | Moderate | EmbeddingService kapselt alle Embedding-Calls (Vault, Facts, Sessions) | Heute drei separate Pfade |
| ASR-006 | FEATURE-0317 | Critical | ATTACH DATABASE Pattern muss in einer einzigen sql.js-Instanz funktionieren | Phase-0-Spike-Ergebnis bestimmt Implementation-Pfad |
| ASR-007 | FEATURE-0317 | Critical | Topic-Inference darf KEINEN LLM-Call beim Conversation-Start machen | Latenz-Selbstmord, ~500-1500ms TTFT |
| ASR-008 | FEATURE-0317 | Moderate | ContextComposer-Output ist deterministisch fuer gleiche Inputs | Cache-Hit-Rate-Vorbedingung |
| ASR-009 | FEATURE-0318 | Critical | Single-Call-Extraction nutzt Tool-Calling-Schema, kein Free-Form-Markdown | Robust, validierbar, deterministisch parsebar |
| ASR-010 | FEATURE-0318 | Moderate | Aging-Algorithmus integriert Use-Count-Boost, nicht nur Decay | Reine Decay vergisst auch wichtige Facts |
| ASR-011 | FEATURE-0319 | Moderate | ConversationMeta-Struktur muss in bestehendes Conversation-JSON-Format ergaenzt werden | Default-Werte fuer existierende Conversations |
| ASR-012 | FEATURE-0319 | Moderate | thread:{id}-URI-Type muss vorhanden sein, auch ohne aktiven Cross-Interface-Use-Case | UCM-Vorbedingung, retroaktive Migration vermeiden |
| ASR-013 | FEATURE-0320 | Moderate | history_chunks-Tabelle nutzt URI-Konvention | Konsistenz mit ADR-078 |
| ASR-014 | FEATURE-0321 | Critical | Public-API-Surface ist klein und stabil | Engine-API ist UCM-Vertrag, semver-disciplined |
| ASR-015 | FEATURE-0321 | Critical | Adapter-Interface fuer Knowledge-DB ist klar definiert und ohne Vault-Spezifika | UCM-Native braucht keinen Adapter, UCM-mit-Obsilo-Backend nutzt Obsilos Adapter |
| ASR-016 | Cross-cutting | Critical | 3 Phase-0-Spikes muessen vor Implementation-Start gruene Ergebnisse liefern | (a) ATTACH+CTE-Performance auf realer DB-Groesse, (b) FTS5-WASM-Bundle-Size, (c) Single-Call-Token-Profil mit 5 Conversations |
| ASR-017 | FEATURE-0315 + 0317 | Critical | URI-Schema ist offen, nicht enum. SourceAdapter-Registry-Pattern ist Engine-Public-API | ADR-078, beliebige Schemata (vault://, file://, https://, cloud://, custom). Engine kennt nur Default-Schemata, Hosts registrieren beliebige Adapter |
| ASR-018 | FEATURE-0317 | Moderate | Stale-Edge-Lazy-Detection: Resolution-Failure markiert Edge als stale in metadata, kein Delete | Adapter ohne watch() (file://, https://, cloud://) koennen stale Refs erzeugen, Erkennung lazy bei Retrieval |
| ASR-019 | FEATURE-0317 | Moderate | Soft-Topic-Lock mit Drift-Detection (Cosine < 0.6) statt Hard-Lock | Mid-conversation Topic-Wechsel darf nicht zu veralteter Topical-Memory fuehren |
| ASR-020 | FEATURE-0318 | Moderate | Inkrementelle Extraktion mit Delta-Window (lastExtractedMessageIndex + Conversation-So-Far-Summary) | Re-Extract-Cost ist linear in Delta, nicht in Conversation-Laenge |
| ASR-021 | FEATURE-0318 | Moderate | Mention-Detection ist Schema-agnostisch via SourceAdapter-Registry | Generischer Parser-Step + LLM-Output-Field `mentions: [{uri, label?, kind?}]` |
| ASR-022 | FEATURE-0318 | Moderate | Provisional-Mention-Edges synchron pro User-Message, vor LLM-Call | Hybrid-Retrieval kann erwaehnte Quellen innerhalb der laufenden Conversation nutzen |
| ASR-023 | FEATURE-0318 + 0319 | Moderate | Bypass-Pfad fuer expliziten Save-Trigger ueberspringt Re-Extract-Throttle | "Save now"-Long-Press, /save now, mark_conversation_for_memory(immediate=true) |
| ASR-024 | FEATURE-0318 + 0317 | Moderate | Topic-Drift-Hook ist bidirektional zwischen FactExtractor und ContextComposer | Composer signalisiert Drift, Extractor triggert Re-Extract auch ohne Time-Throttle |
| ASR-025 | FEATURE-0320 + 0321 | Critical | HistoryStore in dedizierter `history.db` (nicht knowledge.db) als Engine-Public-API | UCM-Native braucht keine knowledge.db, history-Search muss UCM-portable sein |
| ASR-026 | FEATURE-0319 | Critical | MCP-Bridge-Capture-Setting (`mcp.conversationCapture` mit `off|local|external`) | Plugin-Worker-Default ist `local` (heutiges Verhalten plus Memory-v2-Veredelung), `external` delegiert an Standalone-Worker |
| ASR-027 | FEATURE-0321 | Critical | Engine ist hosting-neutral. Gleiche Engine in Obsilo-Plugin-Worker und in Standalone-Worker-Prozess | Gleiche Stores, gleiche API. Source-Interface-Tagging entscheidet ueber Provenance |
| ASR-028 | FEATURE-0320 | Moderate | UI-Tab-Strategie: "Obsidian"-Tab + "Global"-Tab beide immer aktiv | Plugin-Worker ist selbst UCM-Worker, sammelt Cross-Source-Conversations ohne externen Worker. Global-Tab daher immer relevant |
| ASR-029 | FEATURE-0320 | Moderate | Inline-Search-Box in Chat-View neben File-Filter | Vector-DB-Search direkt aus laufender Conversation |
| ASR-030 | Cross-cutting | Critical | Plugin-Worker ist gleichwertige UCM-Worker-Variante, kein "Fallback" und kein "Light-Modus" | Cloudflare-Relay (existierend in src/mcp/relayWorkerCode.ts, McpBridge.ts) macht Plugin-Worker always-on faehig |
| ASR-031 | FEATURE-0319 + 0320 | Critical | Setup-Konfiguration ueber Persistenz-Service-Pattern: `persistenceService` ('local' / 'remote') + `dbLocation` ('plugin-local' / 'vault-resident' wenn local) + `persistenceServiceUrl` (wenn remote) | Drei MVP-Klassen A/B/C, knowledge.db-Lokalitaet orthogonal (heutiges FEATURE-0301-Setting). Workers sind Multi-Writer, Persistenz-Service serialisiert intern |
| ASR-032 | FEATURE-0319 | Critical | Plugin-MCP routet pro Tool-Call: Vault-Tools immer Plugin (knowledge.db Plugin-bedient), Memory-Tools je nach persistenceService (lokal antworten oder Proxy zur Service-URL via HTTP/JSON-RPC) | Externe Clients sehen einen Endpoint, kein Konflikt zwischen Vault- und Memory-Pfad. Setup-Wechsel zwischen Klassen erfordert keine URL-Aenderung beim Client |
| ASR-033 | FEATURE-0319 + 0314 | Critical | Single-Writer-Lock mit PID nur fuer Klasse B (Vault-Sync) | Setup A hat einzigen Schreiber, Setup C hat Persistenz-Service als Serializer. Lock-Konstrukt nur in B noetig (mehrere Plugins schreiben Vault-Files ohne zentralen Serialisierer) |
| ASR-034 | FEATURE-0319 | Critical | Persistenz-Service-RPC-Pattern fuer Klasse C: Multi-Client-tauglich von Anfang an | Beliebige Anzahl Workers (Plugins, Standalone, mobile via OpenClaw) schreiben gleichzeitig. Service serialisiert via Async-Queue oder synchroner Lock. Bearer-Token-Auth pro Client (siehe A3 in Phase-0-ADRs) |
| ASR-038a | FEATURE-0317 + 0319 | Critical | KnowledgeGraphAdapter zweistufig: LocalKnowledgeAdapter (ATTACH-CTE, Setup A/B/C-mit-Plugin-als-Service) und McpKnowledgeAdapter (RPC zur Plugin-MCP, Setup C-mit-Standalone-als-Service) | knowledge.db bleibt immer Plugin-bedient, weil Vault-Zugriff Obsidian-Plugin-API erfordert. Standalone-Service nutzt sie via Plugin-MCP-Tools |
| ASR-038b | FEATURE-0317 | Moderate | Plugin-MCP bekommt zwei zusaetzliche Tools: `get_vault_implicit_edges(notePath)` und `get_vault_note_metadata(notePath)` | Heute fehlen sie, McpKnowledgeAdapter braucht sie fuer Multi-Hop-Walks |
| ASR-039 | FEATURE-0321 | Critical | Strict semver + DB-Schema-Version + Deprecation-Cycles fuer Engine-Public-API (B1-Beschluss 2026-04-26) | Engine-Package: MAJOR.MINOR.PATCH. Schema-Aenderung = MAJOR-Bump via `user_version`-Pragma. @deprecated-Marker fuer 1 Minor-Release vor Removal. UCM und Obsilo pinnen Major-Version. |
| ASR-040 | FEATURE-0318 | Moderate | Eine wachsende Episode pro Conversation, Re-Extract aktualisiert idempotent (B2-Beschluss 2026-04-26) | Episode-Schema bekommt `last_updated_at`. ADR-018 unveraendert, Lifecycle erweitert auf incremental update. |
| ASR-041 | FEATURE-0321 | Moderate | Recipes bleiben Obsilo-spezifisch, nicht in Engine-Public-API (B3-Beschluss 2026-04-26) | RecipeStore + RecipePromotionService bleiben in Obsilo-Repo. Engine kennt nur Episodes als Output-Felder. Cross-Reference via `derived_from_episode`-Edge. |
| ASR-042 | Cross-cutting | Moderate | Cross-Worker-Sync ist intrinsisch via Persistenz-Service-Pattern geloest, kein dediziertes Replication-Algorithmus (B4-Beschluss 2026-04-26) | Architektur-Vorbereitung schon im MVP, Implementation in Setup C als RPC zum Service. Vector-Clock-Replikation ist Out-of-Scope. |
| ASR-043 | FEATURE-0322 | Critical | Soft-Delete + Cascade auf vier Granularitaets-Ebenen: Fact, Entity-URI, Conversation, Vault-Ref (A1-Beschluss 2026-04-26) | DSGVO-Reflex. 30-Tage-Soft-Delete-Window, Hard-Delete-Job + Backup-Sweep nach Window. Agent-Tools statt UI. |
| ASR-044 | FEATURE-0322 | Moderate | Drei Conversation-States: searchable (Default) / memory-eligible / [private nur bei UCM-Cloud-v2] (A2-Beschluss revidiert 2026-04-26) | Memory-Eligibility ist Opt-In (Cost+Quality), History-Indexierung ist immer an in v1. Privacy via Forget-Right (FEATURE-0322). Cloud-Service-Variante hat eigenes Privacy-Modell -- Out-of-Scope. |
| ASR-045 | FEATURE-1404 + FEATURE-0319 | Critical | Plugin-Standalone-RPC nutzt Bearer-Token + HTTPS (A3-Beschluss 2026-04-26) | Konsistent mit FEATURE-1404 heutigem MCP Remote Auth. OAuth 2.1 ist Backlog (post-MVP). Token-Rotation manuell. |
| ASR-046 | FEATURE-0323 | Critical | Auto-Migration mit Smart-Defaults + Wizard-Fallback bei Mapping-Failures (A4-Beschluss 2026-04-26) | Silent success bei klaren Cases, Wizard-Modal nur wenn unsicher. Migration-Audit-Log nach `_devprocess/logs/migrations/v2-settings-{timestamp}.json`. |
| ASR-047 | FEATURE-0319 + 0322 | Critical | Agent ist das Memory-Interface, keine separate UI (A5-Beschluss 2026-04-26) | Memory-Bearbeitung via Agent-Conversation. Tool-Set: `recall_memory`, `update_fact`, `delete_fact`, `set_importance`, `delete_conversation`. UCM-portabel: andere UIs nutzen dieselben Tools. |
| ASR-048 | FEATURE-0323 | Moderate | OnboardingService-Erweiterung + Inline-Coach-Marks (A6-Beschluss 2026-04-26) | Bestehender FEATURE-0405 wird erweitert um Memory-v2-Schritt. Coach-Marks bei drei Erstkontakt-Triggern (Star, search_history, Setup-Wechsel). |
| ASR-049 | FEATURE-0323 | Critical | Strukturierte Fehler-Codes als Engine-Public-Konstanten, Agent als Fehler-UI (A7-Beschluss 2026-04-26) | Fehler-Codes wie MEMORY_MODEL_NOT_CONFIGURED, STANDALONE_WORKER_UNREACHABLE, DB_INTEGRITY_CHECK_FAILED. Agent erkennt + erklaert + fixt via existierende Tools (update_settings, configure_model, read_agent_logs). |
| ASR-050 | FEATURE-0318 + 0320 | Critical | Eval-Test-Set-Format: Fixture-Conversations + LLM-as-Judge + Schema-Validation (A8-Beschluss 2026-04-26) | 10-15 anonymisierte Conversations als Fixtures. Schema-Validation (Tool-Calling-Format) + Reference-Comparison via LLM-as-Judge (Anthropic) + ROUGE-L. Reproduzierbar bei LLM-Provider-Wechsel. |
| ASR-051 | FEATURE-0321 | Critical | MemoryBench-Adapter als Engine-Public-Artefakt | UCM ist erste OSS-Memory-Engine die offen vergleichbar ist mit Supermemory/Mem0/Zep. Pre-Release-Eval gegen LoCoMo + LongMemEval als Quality-Gate (Ziel > 70% LongMemEval, > 65% LoCoMo). Score nur publik wenn Gate erreicht. |
| ASR-052 | ADR-077 + FEATURE-0318 | Moderate | Edge-Konzept-Layer `update`/`extend`/`derive` ueber granularen Edge-Types (E1) | Single-Call-Output traegt `relation`-Feld pro Fact-Candidate. FactIntegrator vereinfacht von 5 auf 4 Klassen. Marketing-Differenzierung gegen Supermemory mit gleichem Konzept. |
| ASR-053 | FEATURE-0315 + FEATURE-0318 | Moderate | Memory-Typ `kind`-Spalte (E2/E8) mit differenzierten Aging-Konstanten | Werte: fact/preference/identity/event. Halbwertzeiten 90/persistent+boost/180/14 Tage. LLM-klassifiziert im Tool-Calling-Output. |
| ASR-054 | FEATURE-0318 | Moderate | Noise-Filter + Pre-Insert-Importance-Threshold (E3) | Prompt-Anweisung gegen Smalltalk + Filter `importance < 0.2`. Spart Storage und Cache-Tokens. |
| ASR-055 | FEATURE-0315 + ADR-077 | Moderate | `is_latest`-Boolean-Spalte als Index-Optimierung (E4) | Default-Filter wird `WHERE is_latest=1 AND deprecated_at IS NULL`. Trigger setzt 0 bei supersede. Konsistent mit Supermemory's `isLatest`-Pattern. |
| ASR-056 | FEATURE-0324 | Critical | Inference-Pass fuer Derives als separater Background-Job (E5) | Pattern-Detection bei > 3 verwandten Facts triggert LLM-Call. Confidence-Bands auto/pending/reject. Token-Cost-Cap-respektierend. |
| ASR-057 | FEATURE-0319 | Moderate | Pipeline-States visible (E6) in ConversationMeta | extractionState: queued/extracting/embedding/integrating/done/failed. Konsistent mit Supermemorys 6-Stage-Pipeline-Visibility. |
| ASR-058 | FEATURE-0317 | Moderate | Context-aware Reranker-Pass nach RRF (E7) | Boost-Faktoren: Topic-Lock-Match, last_used_at, kind=identity, kind=event-mit-age. Konsistent mit Supermemorys Context-aware Reranking. |
| ASR-059 | FEATURE-0317 + FEATURE-0321 | Moderate | User-Profile-View als Engine-Public-Method (E9) | factStore.getUserProfile() liefert aggregierte View. Wird von Onboarding und ContextComposer genutzt. Kein eigener Storage. |
| ASR-060 | FEATURE-0325 | Critical | Vault-Note-zu-Fact-Extraction (E10, einzigartig im Markt) | dirty-tracking via vault.on('modify'), cascade via vault.on('delete'), Limit-Schwelle gegen Bedienfehler. Plus Engine-Public-API VaultMemorySourceService. |
| ASR-035 | Cross-cutting | Moderate | Standalone-Worker braucht eigenes UI fuer Cross-Source-User ohne Obsilo (UCM-Repo-Scope) | Web-Dashboard oder Electron-Wrapper, weil die meisten UCM-User kein Obsilo haben |
| ASR-036 | FEATURE-0319 + 0321 | Critical | MigrationService als Engine-Public-API: dumpAll, restoreAll, validateTarget, lockForMigration, recoverPendingMigration | Setup-Wechsel zwischen K1-K4 erfordert atomare Daten-Uebertragung mit Conflict-Resolution. Reverse-Wechsel nutzt FactIntegrator (FEATURE-0318) als Merge-Strategie, kein Sondercode |
| ASR-037 | FEATURE-0319 + 0314 | Critical | Migration-Journal als Sub-Typ des Multi-File-Atomic-Commit-Journals | Crash-Resilienz mid-migration, Recovery-Replay oder Rollback bei Plugin-Restart |
| ASR-038 | FEATURE-0319 | Moderate | Multi-Device-Migration-Marker im Vault-File fuer K2/K4 | Andere Plugin-Instanzen erkennen Schema-Wechsel und blocken bis Schema-Version uebereinstimmt |

## 3. Non-Functional Requirements Summary

| Category | Target | Source FEATUREs |
|---|---|---|
| Performance (Conversation-Start TTFT) | < 800ms p95 | FEATURE-0317 |
| Performance (recall_memory single-hop) | < 100ms p95 | FEATURE-0317 |
| Performance (recall_memory multiHop=true, depth=2) | < 500ms p95 | FEATURE-0317 |
| Performance (Single-Call-Extraction) | < 30s p95 | FEATURE-0318 |
| Performance (Aging-Cycle 10k Facts) | < 5s in single Transaction | FEATURE-0318 |
| Performance (history_search Tool-Call) | < 300ms p95 | FEATURE-0320 |
| Performance (Atomic-Write-Aufschlag) | < 50ms zusaetzlich pro DB-Save | FEATURE-0314 |
| Performance (Folder-Rename mit 100 Notes) | < 200ms | FEATURE-0314 |
| Performance (Migration 5 MD-Dateien) | < 2 Minuten | FEATURE-0316 |
| Performance (Initial-Backfill History-Index) | < 1s pro Conversation, abortable | FEATURE-0320 |
| Cost (LLM-Calls pro memory-eligible Conversation) | 1 Call (heute 2-3) | FEATURE-0318 |
| Cost (Conflict-LLM-Calls) | < 10% der Inserts | FEATURE-0318 |
| Cost (Memory-Block-Tokens pro Conversation) | -30% gegenueber heute | FEATURE-0317 |
| Cost (Vault-Index-Pass pro Note) | -50% durch Combined-Pass | FEATURE-0318 |
| Cache-Hit-Rate (Anthropic Prompt Cache) | > 60% nach 1 Woche Use | FEATURE-0317 |
| Reliability (BUG-012-Korruptions-Faelle) | 0 pro 1000 Schreib-Vorgaenge | FEATURE-0314 |
| Reliability (Stale-Refs nach Note-Rename) | 0 | FEATURE-0314 |
| Reliability (Audit-Log-Wachstum) | < 100 Rows pro 1000 Operations | FEATURE-0318 |
| Coverage (neue Stores) | > 90% (FactStore, EdgeStore, StyleStore), > 85% sonst | alle |
| Storage (Memory-DB Wachstum) | < 100MB pro 10k Facts | FEATURE-0315 |
| Storage (knowledge.db Aufschlag durch History-Index) | < 50% | FEATURE-0320 |

## 4. Constraints

### Stack-Constraints

- **Einziger erlaubter SQLite-Driver:** `sql.js@^1.14.1` (WASM). Native bessere-sqlite3 vom Obsidian Community Plugin Review-Bot blockiert.
- **Standard-sql.js-Build hat KEIN FTS5 und KEIN JSON1.** Custom-WASM-Build (`-DSQLITE_ENABLE_FTS5 -DSQLITE_ENABLE_JSON1`) als Option, Bundle-Size-Spike entscheidet.
- **Plugin-Bundle-Size-Limit:** Obsidian Community Plugins ~5MB Soft-Limit, sql.js + Memory-v2 + ggf. Custom-WASM muss darunter bleiben.
- **TypeScript strict mode**, alle bestehenden Coding-Conventions des Repos.

### Integration-Constraints

- **Bestehende Tabellen NICHT migrieren:** sessions, episodes, recipes, patterns in memory.db bleiben unangetastet.
- **knowledge.db.implicit_edges-Schema** wird in FEATURE-0314 erweitert (additive +edge_type +to_external_ref Spalten), keine Daten-Migration.
- **Bestehender ExtractionQueue-Pfad** bleibt Trigger-Mechanik (BUG-016/isPermanentProviderError-Schutz erhalten).
- **vault.on('rename')** Event ist Pflicht-Hook fuer URI-Cascade.

### Operational-Constraints

- **Deployment:** Obsidian Plugin (Electron Renderer), keine Server-Komponente.
- **Plattformen:** macOS primaer, Windows/Linux als Targets. Mobile (iOS/iPadOS) nicht offiziell unterstuetzt, aber sql.js WASM funktioniert dort.
- **Cloud-Sync-Awareness:** User-Vaults werden oft via iCloud/Dropbox gesynced. Plugin-Daten unter `~/.obsidian-agent/` (FEATURE-0507), aber dennoch potentiell mit-gesynced. Multi-File-Atomic-Commit muss damit umgehen.

### Team-Constraints

- Single-Entwickler (Sebastian) mit "Immersion-then-abandonment"-Pattern (Source-Doc R6). Phasen-Plan hat Stop-Punkte (nach 0.5, nach 3, nach 6) damit Teil-Wins erhalten bleiben auch bei Abbruch.
- Kein dediziertes QA, Eval-Test-Sets sind die Qualitaets-Sicherung.

### Compliance / Security

- **Lokal-First:** keine Cloud-Telemetrie, keine externen Dienste ausser konfigurierten LLM-Providern.
- **PII-Awareness:** Vault-Inhalte werden an konfigurierte LLMs gesendet (M-2 in AUDIT-003 by-design). Memory v2 erbt diese Konfiguration.

## 5. Open Questions for Architect

1. **ATTACH DATABASE in sql.js:** funktioniert die Multi-DB-Konfiguration in einer einzigen sql.js-Instanz performant fuer Sebastians ~200MB knowledge.db + ~10MB memory.db? Spike Phase 0.
2. **FTS5/JSON1 via Custom-WASM:** sprengt der Custom-Build das Bundle-Size-Limit? Spike Phase 0. Falls ja: Trigram-Index in JS-Layer als Fallback.
3. **Single-Call-Extraction-Token-Profil:** wie viele Input/Output-Tokens kostet eine reale Conversation? Spike Phase 0 mit 5 Conversations.
4. **Embedding-Modell-Default:** Smart-Default fuer neue User (z.B. Xenova lokal) oder Onboarding-Pflicht-Schritt?
5. **Lock-File-TTL:** PID-basiert validieren, aber was bei abgestuerztem Plugin? TTL-Schwelle festlegen.
6. **FactStore-Public-API:** synchron oder asynchron? Test-Implikationen abwaegen.
7. **Topic-Centroid-Refresh-Strategie:** bei jedem Insert (teuer), periodisch (drift-anfaellig), oder lazy beim ersten Topic-Inference-Call?
8. **Tool-Calling-Fallback:** Was, wenn das konfigurierte LLM (z.B. lokales Ollama) Tool-Calling nicht unterstuetzt? Hard-Requirement oder Free-Form-Pfad?
9. **Aging-Cron-Trigger:** Plugin-Start-Trigger oder setInterval?
10. **Combined Note-Index-Pass:** als Setting oder Default an?
11. **Hotkey Cmd+Shift+M:** in Obsidian frei, nicht von anderen Plugins belegt? Verifikation.
12. **Auto-Suggestion-LLM:** Default Haiku-Klasse, aber konfigurierbar wie?
13. **history_chunks Chunk-Granularitaet:** ganze Message als 1 Chunk oder split bei langen Messages?
14. **Engine-Package-Naming:** `@obsilo/memory-engine` (privat npm) oder `@pssah4/memory-engine` (public)?
15. **Schema-Migration in Engine-Standalone-Mode:** Engine triggert Migration bei DB-Open, oder explicit per Konsumenten-Code?
16. **LocalFileAdapter Read-Permissions:** Sandbox-konform via Obsidian DataAdapter, oder nativ ueber fs?
17. **WebUrlAdapter Caching:** Tag-basiert, ETag, immer fresh?
18. **CloudAdapter-Stub Provider-Reihenfolge:** Google Drive, Dropbox, OneDrive, iCloud (welcher hat hoechsten User-Wert)?
19. **Stale-Edge-Health-Check:** rein lazy on-Resolution-Failure oder optional Background-Job?
20. **Custom-Schema-Registration:** Einschraenkungen fuer Hosts (z.B. nur eigene Schemata, nicht ueberschreibbare Standard-Schemata)?
21. **File-Path-Heuristik im Provisional-Parser:** wie aggressiv soll absolute Paths erkannt werden? Code-Block-only oder ueberall?
22. **Topic-Drift-Schwelle 0.6:** Default ohne Spike-Daten -- pragmatisch oder soll Spike das messen?
23. **Provisional-Edge-Cleanup-Strategie:** TTL bei nie-confirmed (z.B. nach 7 Tagen ohne Single-Call-Upgrade)?
24. **UCM-Verbindung in Obsilo:** Local-Twin (eventually consistent) oder Live-Fetch (latency cost) als Default fuer History-UCM-Tab?
25. **Migration `source = 'mcp'`-Eintraege:** Wie rekonstruiert man `source_interface` retroaktiv (UA-String, Tool-Pattern, oder pauschal `mcp-legacy`)?
26. **Drei-DB-Konfiguration:** Engine-Konsumenten geben drei DB-Pfade -- soll knowledge.db als Optional-DB markiert sein (default null) oder muss immer ein Pfad gesetzt sein?
27. **Solo-Obsilo-Migration zu UCM-Backend-Modus:** Wenn ein User spaeter Setup wechselt (K1 -> K3) -- gibt es einen Migrations-Pfad fuer seine bestehende history.db?
28. **Plugin-Standalone-RPC-Protokoll-Detail:** HTTP/JSON-RPC oder gRPC oder MCP-Tunneling? Auth-Token-Format und Refresh?
29. **Vault-resident DBs in K2/K4:** Pfad-Konvention (`vault/.obsilo-data/` versus `.obsidian/plugins/obsilo/data/`)? Was ist Obsidian-Sync-konform?
30. **Single-Writer-Lock-Granularitaet bei K2:** ein globaler Lock pro DB oder Lock pro Datei (memory.db, history.db, knowledge.db separat)?
31. **Standalone-Vault-File-Zugriff in K4:** Filesystem-Mount (z.B. SMB, Syncthing) oder Plugin-Proxy-API (Standalone fragt Plugin nach DB-Inhalt via HTTP)? Latenz-Implikationen?
32. **Setup-Wechsel UX:** Sebastian wechselt von K1 nach K3, was passiert mit existierenden Conversations, Facts, Edges in der Plugin-DB? One-Shot-Migration oder paralleles Schreiben fuer Transition-Phase?
33. **Conflict-Resolution-Default bei Reverse-Wechsel:** `merge` (FactIntegrator) als Default, oder `standalone-master` (sicherer fuer den User)?
34. **Backup-Retention-Dauer:** 7 Tage `.bak`-Aufbewahrung -- ausreichend oder zu lang/kurz? Wer triggert Cleanup?
35. **Migration-Lock-Granularitaet:** Plugin global read-only, oder nur Memory-Tools blockiert (Vault-Tools weiter ausfuehrbar)?
36. **Smoke-Test-Pruefung nach Migration:** welche minimalen Operationen werden getestet (Read-1-Fact, Write-1-Fact, RPC-Ping, ...)?

## 6. Forbidden-Terms Check

Confirmed: Success Criteria der 8 Features wurden auf Tech-Terme geprueft. Keine Treffer fuer OAuth, JWT, REST, GraphQL, SQL, PostgreSQL, React, Python, Docker, Kubernetes, AWS, ms (in SC), millisecond (in SC), TLS, RBAC, Kafka, WebSocket. Tech-Details sind in "Technical NFRs"-Sektionen gehalten.

## 7. Doc-Annahmen-vs-Codebase-Diskrepanzen (15 Punkte)

Aus PLAN-001 dokumentierte Realitaets-Pruefungen, die in Akzeptanzkriterien einfliessen:

| # | Source-Doc-Annahme | Codebase-Realitaet | Wo addressed |
|---|---|---|---|
| 1 | memory.db ist Greenfield | Existiert bereits mit sessions/episodes/recipes/patterns | FEATURE-0315 (Schema additiv) |
| 2 | FTS5 + JSON1 in sql.js verfuegbar | Standard-Build hat keines | FEATURE-0314 (URI-Migration), Spike, ADR-077 |
| 3 | BUG-012 reicht "Transactions, audit log, periodic backup" | sql.js export ist Full-Blob, nicht atomar | FEATURE-0314, ADR-079 |
| 4 | "Qwen3 8B via SiliconFlow" als Default | Default ist `''`, broken-by-default | FEATURE-0315 (Smart-Default oder Onboarding-Pflicht) |
| 5 | ADR-062 KV-Cache-Layout existiert im Code | Nur architektonisch, nicht im Code | FEATURE-0315 (ADR-062 als ASR im Code) |
| 6 | ConversationMeta-Struktur erweitern | Existiert nicht, nur PendingExtraction | FEATURE-0319 (neue Struktur) |
| 7 | better-sqlite3-Verfuegbarkeit angenommen | Review-Bot blockiert native bins | sql.js bleibt Driver |
| 8 | Migration-Review-UI als 2-Wochen-Phase | Single-User, UI-Aufwand unverhaeltnismaessig | FEATURE-0316 (Background-Job mit Inline-Edit) |
| 9 | LongTermExtractor + SessionExtractor als zwei Calls | 2 LLM-Calls/Conversation | FEATURE-0318 (Single-Call) |
| 10 | Topic-Inference per LLM beim Conversation-Start | Latenz-Selbstmord | FEATURE-0317 (lokale Inference) |
| 11 | 6 Markdown-Dateien als Migrationsquelle | Session-Summaries schon DB-first (ADR-060) | FEATURE-0316 (differenzierte Migration) |
| 12 | Recipe-Promotion (ADR-058) ignoriert | Aktiv im Code, nutzt Episodes | ADR-076 (Episode-Fact-Boundary) |
| 13 | Vault-Rename ohne Cascade | Heute schon defekt (vermutlich) | FEATURE-0314 (Vault-Rename-Handler) |
| 14 | Embedding-Model-Drift unbeachtet | Heute latent | FEATURE-0314 (embedding_model-Spalte) |
| 15 | vectors.path als beliebiger String | Inkonsistent | FEATURE-0314 (URI-Konvention) |

## 8. Dialog (RE -> Architect, Architect -> RE)

> Diese Sektion ist beim Erst-Erstellen leer und wird im Laufe von /architecture und ggf. /coding-Iterationen gefuellt. Append-only.

(keine Eintraege)

## 9. Architektur-Empfehlungen aus PLAN-001

Diese Empfehlungen aus dem Master-Plan moege der Architect kritisch pruefen:

- **ATTACH DATABASE statt Schema-Merge** zwischen memory.db und knowledge.db
- **fact_embeddings als separate Tabelle** (vermeidet Read-Aufschlag)
- **URI-Schema mit `://`** fuer eindeutige Identifier
- **Bridge-Edges via Single-Call-LLM-Output** (mentions_vault, mentions_entity)
- **Multi-File-Atomic-Commit mit Journal** statt Single-File-Atomic-Write
- **Lazy Conflict-Resolution** mit Cosine-+-Topic-Threshold
- **Per-Conversation-Topic-Lock** statt per-Turn-Inference
- **Audit nur fuer state-changing Operations**, Use-Counts inline
- **Adapter-Pattern fuer Knowledge-DB** (UCM-Native ohne Adapter, UCM-Sidecar mit)

## 10. ADRs als Output erwartet

| ADR | Thema | Status pre-/architecture | Erwartet nach /architecture |
|---|---|---|---|
| ADR-076 | Episode-Fact-Boundary | Proposed | Accepted |
| ADR-077 | Memory v2 Storage Schema | Proposed | Accepted |
| ADR-078 | URI-Versioning Schema | Proposed | Accepted |
| ADR-079 | Knowledge-DB-Haertung | Proposed | Accepted |
| ADR-062 | KV-Cache-Layout | Bestehend, nur architektonisch | Accepted (mit Code-Verweisen) |
| ADR-013 | Memory Architecture (alt) | Accepted | Superseded by ADR-076+077 |
| ADR-058/059/060 | Memory-Verbesserungen | Accepted | Bleiben gueltig, supplementiert |
| Neu | Single-Call-Extraction-Output-Schema | -- | Proposed (in Phase 4) |
| Neu | Engine-Public-API-Vertrag | -- | Proposed (in Phase 7) |

## 11. Naechster Schritt

```
/architecture
Input: dieser Handoff + 4 Proposed-ADRs + PLAN-001 + BA-UNIFIED-CHAT-MEMORY-V2
Output: ADRs auf Accepted, plan-context.md (kann existierende plan-context-memory-improvements.md nutzen oder neue plan-context-memory-v2.md), arc42-Update fuer Memory-Sektion
```

Architect sollte zudem die 3 Spikes als Phase-0-Pflicht-Vorbedingung setzen, ohne deren gruene Ergebnisse die ADRs nicht final akzeptiert werden koennen.
