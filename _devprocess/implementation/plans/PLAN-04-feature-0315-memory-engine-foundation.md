---
id: PLAN-04
title: Memory v2 Phase 1 -- Engine Foundation (FEAT-03-15)
date: 2026-04-27
completed: 2026-04-27
feature-refs: [FEAT-03-15]
adr-refs: [ADR-76, ADR-77, ADR-80, ADR-81, ADR-82, ADR-83, ADR-84, ADR-85, ADR-86]
bug-refs: []
pair-id: sebastian-opus-4.7
parent-plan: PLAN-01-memory-v2-master
related:
  - _devprocess/requirements/handoff/plan-context-memory-v2.md
  - PLAN-01-memory-v2-master.md
  - PLAN-03-feature-0314-knowledge-db-hardening.md
---

# PLAN-04 -- Memory v2 Phase 1 Engine Foundation

## Kontext

Phase 0.5 ist abgeschlossen (knowledge.db ist crash-safe, vault-rename-cascade-correct, embedding_model getrackt, Snapshot + Recovery + WriterLock verdrahtet). Jetzt baut Phase 1 die **Engine-Foundation auf memory.db** -- additiv neben den bestehenden Tabellen `sessions`, `episodes`, `recipes`, `patterns`. Keine Migration der Alt-Tabellen, kein User-sichtbares Verhalten geaendert -- die Engine ist intern call-bar, aber im Conversation-Flow noch nicht eingehaengt.

Heutige Realitaet: [MemoryDB.ts](../../../src/core/knowledge/MemoryDB.ts) ist eine 127-Zeilen-Wrapper-Klasse um `KnowledgeDB`. 4 Tabellen, kein `schema_meta`, kein Migration-Pfad. Phase 1 muss das additiv erweitern, ohne das bestehende Recipe/Episode-System zu beruehren.

**Entkopplungsziel ab Tag 1:** Stores nutzen Constructor-Injection, importieren `obsidian` nicht, kennen URI-Schemata nur ueber den `UriResolver`. Engine-Extract (Phase 7) wird damit zu einem mechanischen Schritt, nicht zu einem Refactor.

## Designentscheidungen aus den Phase-0-ADRs

- **ADR-77** legt das Schema fest (9 neue Tabellen, additiv).
- **ADR-80** definiert das Persistenz-Service-Pattern: Stores erhalten DB-Zugriff via Constructor, kennen weder Plugin noch Vault.
- **ADR-82** Topic-Inference: Centroid-basiert mit Lazy-Refresh.
- **ADR-83** Single-Call-Tool-Output-Schema (kommt in Phase 4, hier nur reservieren).
- **ADR-84** Engine-API-Versioning: API ab Phase 1 versioniert via `MEMORY_ENGINE_API_VERSION`.
- **ADR-85** Soft-Delete-Cascade: `deprecated_at` markiert, kein DELETE auf facts.
- **ADR-86** Inference-Pass-Architecture (kommt in Phase 4).
- **ADR-87** Vault-Note-Memory-Source-Pipeline (kommt in Phase 5/6).
- **ADR-62** KV-Cache-Layout: stabile Sections zuerst, DateTime zuletzt.

## Aufgaben (9 Sub-Schritte, jede einzeln deploybar)

### Aufgabe 1 -- MemoryDB Schema v1 -> v2 additiv

**Ziel:** 9 neue Tabellen aus ADR-77 in `memory.db` anlegen, Schema-Versionsverwaltung einfuehren, idempotente Migration.

**Anpassungen:**

- `MEMORY_SCHEMA` in [MemoryDB.ts](../../../src/core/knowledge/MemoryDB.ts) erweitern um Tabellen `facts`, `memory_source_notes`, `fact_embeddings`, `fact_edges`, `communication_styles`, `conversation_threads`, `thread_sessions`, `known_topics`, `memory_audit` plus alle Indizes aus ADR-77.
- Neue Tabelle `memory_schema_meta (version INTEGER NOT NULL)`. v1-Detection: wenn `memory_schema_meta` fehlt -> alte v1-DB, addiere v2-Tabellen, INSERT version=2. Wenn `version=2`: keine Aktion. Wenn `version<2`: zukuenftige Migration.
- `initMemorySchema()` macht den additive run via `CREATE TABLE IF NOT EXISTS` -- bestehende Tabellen unangetastet, keine Daten-Migration.
- Test: [src/core/knowledge/__tests__/MemoryDB.test.ts](../../../src/core/knowledge/__tests__/MemoryDB.test.ts) -- NEU. Cases: "v1 DB without meta migrates to v2", "v2 DB stays at v2 (idempotent)", "all 9 tables exist with correct columns", "facts CHECK constraints reject invalid kind/importance/is_latest", "fact_edges UNIQUE constraints reject duplicates".

**Akzeptanz:** alle Tabellen + Indizes existieren, `memory_schema_meta.version=2`, Re-Run aendert nichts, Test-Suite gruen.

### Aufgabe 2 -- FactStore (CRUD + Lifecycle)

**Ziel:** Erste Engine-Public-API-Klasse mit Constructor-Injection.

**Anpassungen:**

- Neue Datei `src/core/memory/FactStore.ts` (NICHT unter `core/knowledge/` -- `core/memory/` ist semantisch korrekt fuer Engine-Code).
- Public API: `insert(input: NewFactInput): Fact`, `getById(id)`, `listLatest(opts)`, `confirm(id)`, `supersede(oldId, newFact)`, `deprecate(id, reason)`, `recordUsage(id)`.
- Constructor: `new FactStore(memoryDB: MemoryDB)`, kein Plugin-Import.
- JSON-Validation in JS (sql.js ohne JSON1) fuer `topics` und `metadata`.
- Audit-Hook: insert/confirm/supersede/deprecate schreiben in `memory_audit`. `recordUsage` schreibt nur Inline-Counter, kein Audit-Row (R15).
- Test: `src/core/memory/__tests__/FactStore.test.ts` -- NEU. Coverage > 90%.

**Akzeptanz:** alle DoD-Funktionen implementiert, Tests gruen, kein `obsidian`-Import.

### Aufgabe 3 -- EdgeStore (Fact + External)

**Ziel:** URI-basierte Edges zwischen Facts und externen Refs.

**Anpassungen:**

- Neue Datei `src/core/memory/EdgeStore.ts`.
- Public API: `addFactEdge(fromId, toId, edgeType, metadata?)`, `addExternalEdge(fromId, externalRef, edgeType, metadata?)`, `getEdgesFrom(factId)`, `getEdgesByType(factId, edgeType)`, `getEdgesToRef(externalRef)`.
- CHECK-Constraint aus ADR-77 wird in JS auch validiert (defensive).
- Test: `src/core/memory/__tests__/EdgeStore.test.ts`.

**Akzeptanz:** beide Edge-Typen funktionieren, UNIQUE-Verletzungen werden propagiert, Coverage > 90%.

### Aufgabe 4 -- CommunicationStyleStore

**Ziel:** Kontextabhaengige Style-Lookups.

**Anpassungen:**

- Neue Datei `src/core/memory/CommunicationStyleStore.ts`.
- Public API: `addStyle(input)`, `getMatchingStyles(context)` (returnt nach Importance sortiert), `updateStyle(id, patch)`, `deprecateStyle(id)`.
- Test: `src/core/memory/__tests__/CommunicationStyleStore.test.ts`.

**Akzeptanz:** Context-Match-Lookup funktioniert (`'default'`, `'topic:coding'`, etc.), Coverage > 90%.

### Aufgabe 5 -- EmbeddingService konsolidiert

**Ziel:** Drei heutige Embedding-Pfade (KnowledgeIndexService, MemoryRetriever, ggf. EpisodicExtractor) hinter einer Klasse vereinen.

**Anpassungen:**

- Neue Datei `src/core/memory/EmbeddingService.ts`.
- Public API: `embed(texts: string[]): Promise<Float32Array[]>`, `getModelInfo(): { model, provider, dim }`.
- Provider-Config via Constructor: `new EmbeddingService(provider: Provider, modelKey: string)`.
- Bestehende Aufrufstellen (mind. SemanticIndexService + MemoryRetriever + EpisodicExtractor) auf den Service umstellen, idealerweise mit minimalem Diff. Wenn Refactor-Risiko zu gross: Aufruferstellen als Folge-Aufgabe in Phase 2/3.
- Test: `src/core/memory/__tests__/EmbeddingService.test.ts` -- mit Mock-Provider.

**Akzeptanz:** Service liefert Float32Array[], Provider/Model-Info konsistent, mind. eine Caller-Stelle migriert (SemanticIndexService bevorzugt).

### Aufgabe 6 -- ADR-62 KV-Cache-Layout im SystemPromptBuilder

**Ziel:** Memory-Block ist Cache-Breakpoint-faehig, DateTime nicht in Cache-Prefix.

**Anpassungen:**

- Bestehenden SystemPromptBuilder identifizieren (Code-Search). Layout reorder:
  1. Stable Identity-Block (Persona, Vault-Pfad, Skills-Indexliste)
  2. Memory-Block (heute leer / Phase-3-spezifisch, hier nur Slot reservieren)
  3. Tools-Section
  4. DateTime + Conversation-State (instabile Sections, ans Ende)
- Cache-Breakpoint setzbar nach Memory-Block.
- Test: ein neuer Vitest-Case prueft, dass der DateTime-String in der "instabilen" Region steht und nicht im Cache-Prefix.

**Akzeptanz:** Layout umgestellt, Test gruen. Lebt-Verifikation der Cache-Hit-Rate kommt mit Phase 3.

### Aufgabe 7 -- SourceAdapter + AdapterRegistry + UriResolver

**Ziel:** Engine-Public-API fuer URI-Aufloesung. Hosts (Vault Operator, UCM, andere) registrieren Adapter pro Schema; Engine kennt nur das Interface.

**Anpassungen:**

- Neue Dateien:
  - `src/core/memory/SourceAdapter.ts` -- Interface mit `resolve(uri): Promise<ResolvedSource | null>`, `canHandle(uri): boolean`.
  - `src/core/memory/AdapterRegistry.ts` -- `register(scheme, adapter)`, `get(scheme)`, `resolve(uri)`.
  - `src/core/memory/UriResolver.ts` -- Standard-Schemata (`vault://`, `file://`, `https://`, `cloud://`, `fact:`, `session://`, `episode://`, `entity://`, `thread://`). Unbekannte URIs werden nicht gedroppt -- die Resolution returniert `null`, der Edge bleibt erhalten.
  - VaultAdapter wird **noch nicht** registriert -- das passiert in Phase 3 wenn der UnifiedGraphService ATTACH-Konfig kennt. Phase 1 baut nur die Infrastruktur.
- Test: `src/core/memory/__tests__/UriResolver.test.ts` -- 8 Standard-Schemata werden parst, unbekannte URIs erzeugen kein Crash.

**Akzeptanz:** Registry + Resolver funktionieren, alle Standard-Schemata werden erkannt, unbekannte URIs sind Reference-Tokens.

### Aufgabe 8 -- Audit-Logging Helper

**Ziel:** Konsolidiertes `audit(operation, factId, ...)` als Helper, das alle State-Changing-Stellen nutzen.

**Anpassungen:**

- Neue Datei `src/core/memory/AuditLog.ts`.
- Public API: `log(operation, opts)`. `operation` ∈ `'insert' | 'confirm' | 'supersede' | 'deprecate'`.
- FactStore + EdgeStore + CommunicationStyleStore rufen den Logger.
- Test: `src/core/memory/__tests__/AuditLog.test.ts`.

**Akzeptanz:** alle 4 Operationen erzeugen Audit-Rows, `recordUsage` erzeugt KEINE.

### Aufgabe 9 -- history.db als zweite KnowledgeDB-Instanz

**Ziel:** `history.db` separat anlegen, Schema-Init-Skelett (Tabellen kommen in Phase 6 mit Inhalt).

**Anpassungen:**

- Neue Klasse `src/core/knowledge/HistoryDB.ts` analog zu `MemoryDB.ts`. Ebenfalls duenner Wrapper um `KnowledgeDB`, mit `dbName='history.db'`, Storage `global`.
- HISTORY_SCHEMA mit `history_chunks` (Spalten gemaess ADR-87, in Phase 6 befuellt -- jetzt nur DDL).
- `schema_meta` mit `version=1`.
- Test: `src/core/knowledge/__tests__/HistoryDB.test.ts` -- DDL + idempotente Migration.

**Akzeptanz:** HistoryDB.open() laedt sauber, `history_chunks`-Tabelle existiert, KnowledgeDB-Wrapper unveraendert.

## Reihenfolge + Inkrement

Aufgaben werden **sequenziell** umgesetzt. Jede Aufgabe schliesst mit `npm run build` + `npm test` + Commit. Reihenfolge:

1. Aufgabe 1 (Schema) -- alle anderen bauen darauf
2. Aufgabe 8 (Audit-Helper) vor 2/3/4, weil Stores ihn nutzen
3. Aufgabe 2 (FactStore)
4. Aufgabe 3 (EdgeStore)
5. Aufgabe 4 (StyleStore)
6. Aufgabe 5 (EmbeddingService)
7. Aufgabe 7 (UriResolver) -- Stores haben dann Resolver fuer source_uri
8. Aufgabe 6 (KV-Cache-Layout) -- unabhaengig
9. Aufgabe 9 (HistoryDB) -- unabhaengig, am Schluss

## Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|------|-----------|--------|
| [MemoryDB.ts](../../../src/core/knowledge/MemoryDB.ts) | Schema-Erweiterung + Schema-Versioning | Mittel (Migration) |
| `src/core/memory/FactStore.ts` | NEU | Klein |
| `src/core/memory/EdgeStore.ts` | NEU | Klein |
| `src/core/memory/CommunicationStyleStore.ts` | NEU | Klein |
| `src/core/memory/EmbeddingService.ts` | NEU + Refactor von SemanticIndexService | Mittel (Refactor-Risiko) |
| `src/core/memory/AuditLog.ts` | NEU | Klein |
| `src/core/memory/SourceAdapter.ts` | NEU | Klein |
| `src/core/memory/AdapterRegistry.ts` | NEU | Klein |
| `src/core/memory/UriResolver.ts` | NEU | Klein |
| `src/core/knowledge/HistoryDB.ts` | NEU | Klein |
| `src/core/prompts/SystemPromptBuilder*.ts` | Reorder fuer KV-Cache (Aufgabe 6) | Mittel (Touch des heissen Pfads) |
| `src/core/memory/__tests__/*.test.ts` | NEU x 7 | Klein |
| `src/core/knowledge/__tests__/MemoryDB.test.ts` | NEU | Klein |
| `src/core/knowledge/__tests__/HistoryDB.test.ts` | NEU | Klein |

## Nicht betroffen (Blast-Radius-Bestaetigung)

- KnowledgeDB.ts -- Phase 0.5 abgeschlossen, kein Touch
- VaultRenameHandler.ts, WriterLock.ts, SnapshotJob.ts, MultiFileAtomicCommit.ts -- Phase 0.5
- AgentTask, ToolRegistry, Conversation-Flow -- Engine-API ist call-bar, aber nicht eingehaengt
- Bestehende Memory-Pipeline (sessions/episodes/recipes/patterns) -- bleibt parallel
- ImplicitConnectionService, GraphExtractor, OntologyStore -- knowledge-db-only
- Settings-UI -- keine User-sichtbaren Aenderungen in Phase 1

## Verifikation (Akzeptanzkriterien aus FEAT-03-15)

1. **Build:** `npm run build` -> 0 Errors
2. **Tests:** `npm test` -> alle Tests gruen, > 90% Coverage in neuen Files
3. **Schema-Migration idempotent:** v1 -> v2 -> v2 ohne Aenderung
4. **Engine-Coupling:** `grep -rn "from 'obsidian'" src/core/memory/` -> 0 Treffer
5. **source_interface:** alle FactStore.insert-Calls setzen Default `'obsilo'`
6. **fact_embeddings getrennt:** Reads via FactStore laden keine Embeddings
7. **ADR-62:** SystemPromptBuilder-Test bestaetigt DateTime ausserhalb Cache-Prefix
8. **Performance:** Insert < 100ms / Read < 10ms ohne Embedding (Vitest Performance-Test)
9. **SourceAdapter exportiert:** Interface ist im Engine-Public-Index sichtbar

## Open Questions (vor Aufgabe 5/6 klaeren)

- **EmbeddingService-Refactor-Tiefe:** Heute hat `SemanticIndexService` einen kompletten Embedding-Pfad mit Batch-Logik, Retry, Tokencount. Soll der Service heute alles uebernehmen oder erstmal nur ein Adapter werden, den die Caller "duenn" benutzen? Empfehlung: thin adapter in Phase 1, full refactor in Phase 2.
- **SystemPromptBuilder-Identifikation:** wo genau wird der System-Prompt heute gebaut? Code-Search vor Aufgabe 6.

## Change Log

### 2026-04-27 - Initial

PLAN-04 erstellt. Status: Active. Trigger: User-Anweisung "mach weiter und entscheide selbst" nach abgeschlossener Phase 0.5 (Commit 8f928f3). Auto-Mode-konform: Plan first, dann sequenziell durch Aufgabe 1-9 mit Build+Test+Commit pro Schritt.

### 2026-04-27 - Implementation abgeschlossen

Alle 9 Aufgaben implementiert. 4 Commits gegen `feature/memory-redesign`:

- `ac5fca9` -- Aufgabe 1 (Schema v1->v2 additiv) + PLAN-04 selbst
- `78c372a` -- Aufgabe 8 (AuditLog)
- `0dab1d4` -- Aufgabe 2 (FactStore)
- `751eaeb` -- Aufgaben 3, 4, 7 (EdgeStore, CommunicationStyleStore, URI infrastructure)
- (folgender Commit) -- Aufgaben 5, 6, 9 (EmbeddingService, KV-Cache-Tests, HistoryDB)

**Tests:** 568/568 gruen, +98 neu insgesamt fuer Phase 1. Build + Deploy
nach jedem Schritt sauber.

**Engine-Coupling:** `grep -rn "from 'obsidian'" src/core/memory/*.ts` ohne
`__tests__` -> 0 Treffer. Stores sind Engine-Extract-Ready (ADR-80).

**Aufgabe 5 (EmbeddingService) als thin adapter realisiert** -- die Phase-1-
Strategie aus dem Plan. Das volle Refactoring der drei existing Caller
(SemanticIndexService, MemoryRetriever, EpisodicExtractor) bleibt Phase 2 /
FEAT-03-16 vorbehalten, weil dort die Migration-Pipeline ohnehin den
heissen Code anfasst.

**Aufgabe 6 (ADR-62) war im Code bereits umgesetzt** (systemPrompt.ts:146-204
hatte die Section-Reordering schon). FEAT-03-15 forderte zusaetzlich den
Test der Cache-Position; vier neue Cases in src/core/__tests__/systemPrompt.test.ts
(Memory zwischen Stable und DateTime, byte-identischer Stable-Prefix bei
unterschiedlichem memoryContext, DateTime nie im Cache-Prefix).

**Open / Phase 2:** EmbeddingService-Caller migrieren, Vault-RRF-Quick-Win
(FEAT-03-16), Migration der 6 MD-Dateien (soul.md -> communication_styles
etc.).
