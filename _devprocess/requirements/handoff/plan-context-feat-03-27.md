# Plan Context: FEAT-03-27 Tracing-Layer-Trennung in der KnowledgeDB

> Context bridge from `/architecture` to `/coding`. Aggregates the
> proposed tech stack, ADR summary, and code-pointer hints for the
> implementation pass.

**Status:** Ready for Coding
**Last update:** 2026-06-22
**Author:** sebastian-claude-opus-4-7
**Branch:** feature/tracing-layer-separation (auf dev d91c1de1, RE-Commit b4f14a51, ARCH-Commit folgt)

---

## 1. Technical stack

### Schema-Migration und Storage

- **Engine:** sql.js WASM (unverändert, Stand v12 -> v13)
- **Migration-Pattern:** additive `ALTER TABLE ADD COLUMN` mit `NOT NULL DEFAULT 'note'`, gefolgt von domänenspezifischen `UPDATE WHERE path LIKE 'session:%'` und analog für alle anderen Tracing-Schemas
- **Atomic Write:** bestehender `writeDBGlobalAtomic`-Mechanismus aus ADR-79 (Pattern: write tmp -> rotate current to .bak -> rename tmp to current)
- **Daily-Snapshot vor Migration:** erzwungener Snapshot aus FEATURE-0314 Mechanik, auch ausserhalb des 24h-Fensters
- **Lock-File-Schutz:** vorhandener Mechanismus aus FEATURE-0314 verhindert parallele Plugin-Instanzen während Migration

### Domain-Helper-Klasse

- **Sprache:** TypeScript strict
- **Lokation (Vorschlag):** `src/core/knowledge/KnowledgeVectorStore.ts` (alternativ Modul-Erweiterung in `KnowledgeDB.ts`, Coding entscheidet)
- **API:** typisierte Methoden pro Domain (`findNoteVectors`, `findSessionVectors`, ...) plus `findVectors({domain?, ...})` für Cross-Layer-Queries
- **URI-Mapping:** `uriToDomain(uri: string): Domain` und `domainToUri(domain: Domain, id: string): string`, zentralisiert das interne-zu-extern-Schema-Mapping aus ADR-136

### Domain-Konstante und Lint-Regel

- **Domain-Konstante:** `export const KNOWLEDGE_DOMAINS = ['note', 'session', 'episode', 'fact', 'mention', 'thread', 'entity'] as const`
- **ESLint-Plugin (Vorschlag):** `eslint-plugin-vault-operator-local/` mit Regel `no-direct-vectors-table-access`. Heuristik: SQL-String-Literale, die `vectors` in einer FROM- oder JOIN-Position enthalten, ausserhalb der Helper-Datei. Disable-bar mit `-- reason` Suffix nach Bot-Konvention.
- **Eslint-Config-Update:** Eintrag in `eslint.config.mjs`

## 2. Architecture style + Quality Goals

- **Style:** Layered Database Access, additive Schema Evolution
- **Quality Goal (primary):** Migration ohne User-Re-Index (ASR-03-27-01)
- **Quality Goal (primary):** Tool-API-Kompatibilität (ASR-03-27-02)
- **Quality Goal (secondary):** Build-Zeit-Drift-Resistenz (ASR-03-27-03)
- **Quality Goal (secondary):** Test-Barkeit auf Unit-Niveau

## 3. ADR Summary

| ID | Title | Status | Triggering ASR |
|---|---|---|---|
| ADR-136 | KnowledgeDB Domain-Diskriminator und Migration v12 zu v13 | Proposed | ASR-03-27-01, ASR-03-27-02 |
| ADR-137 | KnowledgeDB Domain-Access-Pattern (Helper + Lint-Regel) | Proposed | ASR-03-27-03 |
| ADR-77 | Memory v2 Storage Schema (Amendment 2026-06-22) | Accepted (amended) | -- |
| ADR-79 | KnowledgeDB Härtung (referenziert, unverändert) | Accepted | -- |

## 4. Data Model (Core Entities)

Schema `knowledge.db`, Version 13:

```
vectors (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    domain TEXT NOT NULL DEFAULT 'note' CHECK(domain IN ('note', 'session', 'episode', 'fact', 'mention', 'thread', 'entity')),
    -- weitere bestehende Spalten (embedding, mtime, ...)
)

INDEX idx_vectors_domain_path ON vectors(domain, path)
```

URI-Schema-Mapping (interne `domain`-Spalte zu externer URI):

| `domain` | externes URI-Schema | Beispiel |
|---|---|---|
| `'note'` | `vault://<path>` | `vault://Notes/Foo.md` |
| `'session'` | `session://<id>` | `session://2026-06-22-abc12345` |
| `'episode'` | `episode://<id>` | `episode://ep-1782038790380-2ij89d` |
| `'fact'` | `fact:<id>` (Sonderfall ohne Doppel-Slash, dokumentiert in `RecallHit.uri` JSDoc) | `fact:f-1234` |
| `'mention'` | `mention://<id>` | `mention://m-1234` |
| `'thread'` | `thread://<id>` | `thread://t-1234` |
| `'entity'` | `entity://<name>` | `entity://Sebastian Hanke` |

## 5. External Integrations

Keine neuen externen Integrations. Bestehende Schutzschichten gelten weiterhin:

- **SafeStorage:** unverändert, kein neuer Trust-Boundary-Crossing
- **Daily Snapshot:** FEATURE-0314 Mechanik, additive Pre-Migration-Snapshot-Trigger
- **Lock File:** FEATURE-0314 Mechanik, schuetzt vor parallelen Plugin-Instanzen während Migration

## 6. Performance and Security

### Performance (aus FEAT-03-27 SC-03, SC-06)

| Aspekt | Target | Anmerkung |
|---|---|---|
| Migration-Dauer | <= 30s bei 5000 Notes + 1000 Sessions + 5000 Episodes | Hauptkosten: `UPDATE`-Schritt, linear in Vector-Anzahl. Optimierung: Batches von 1000 Zeilen mit Progress-Notice. |
| Migration-Dauer Sebastian's Vault | erwartet 3-5s | 10.800 Vektoren laut MEMORY.md, Stand 2026-04 |
| Lookup nach Migration (Layer-spezifisch) | O(log n) via Index `idx_vectors_domain_path` | Ein voller Index-Aufbau bei Migration |
| Lookup nach Migration (Cross-Layer) | unverändert gegenüber heute | Keine Diskriminator-Spalte im WHERE, gleicher Plan wie heute |
| RecallEngine-Mixed-Layer-Latenz | <= +10% vs Baseline | Reranker geht weiterhin über `findVectors` ohne Layer-Filter |
| KnowledgeDB-File-Größe | <= +5% gegenüber heutigem Stand | Zusatzspalte plus Index, beide klein gegen Embedding-Volumen |

### Security

- Migration erbt SafeStorage-Schutzschicht der KnowledgeDB unverändert
- Daily-Snapshot vor Migration ist Pflicht-Vorbedingung, nicht optional
- Kein neuer Trust-Boundary-Crossing in Migration oder Helper-Klasse
- Lint-Regel-Disable durch `-- reason` Suffix dokumentiert (Bot-Konvention)

## 7. Implementation order proposal

Die folgende Reihenfolge ist ein Vorschlag für das PLAN-Dokument im nächsten /coding-Pass. /coding kann re-ordnen, wenn die Codebase-Realität das nahelegt.

1. **Schema-Konstante und Migration-Helper.** Neue Datei mit `KNOWLEDGE_DOMAINS`-Konstante, `Domain`-Typ, `pathPrefixToDomain`-Helper, `domainToUri`/`uriToDomain`-Mapping. Migration-Funktion als pure Funktion mit Schema-Version-Check.
2. **Migration-Wiring in `onload`.** Hookt sich vor Schema-Bootstrap, erzwingt Daily-Snapshot, führt Migration in Transaktion aus, setzt Schema-Version auf v13.
3. **KnowledgeVectorStore-Klasse.** Typisierte Methoden, Cross-Layer-Methode, Schreib-Methoden. Unit-Tests mit In-Memory-DB.
4. **ESLint-Regel.** Lokales Plugin mit Test-Korpus (Positive- und Negative-Cases), Eintrag in `eslint.config.mjs`.
5. **Reader-Migration (read-only Konsumenten).** Pro Konsumenten ein PR-Schritt: Aufruf vom raw-SQL auf den Helper umstellen. Reihenfolge nach Drift-Risiko: VaultHealthService zuerst (das ist die Beobachter-Stelle), dann RecallEngine, MemoryRetriever, SemanticSearchTool, SearchHistoryTool.
6. **Writer-Migration.** SemanticIndexService.insertChunks plus HistoryIndexer.writeChunks plus Stigmergy-Episode-Writer plus FactStore (falls vorhanden).
7. **Drift-Trigger-Entfernung.** Der bestehende lokale Filter in `SemanticIndexService.ts:596` wird entfernt; ein Test pinnt dieses Entfernen (Test sucht das alte Muster im Code und fordert 0 Treffer).
8. **Integration-Test.** Pre-Post-Migration-Vergleich auf einem Snapshot-Vault: Vault Health Pseudo-Orphan-Zähler, RecallEngine-Top-10-Diff auf 30 Test-Queries, Plugin-Start-Zeit.

## 8. Reader/Writer-Sites Inventory (Stand 2026-06-22, Codebase-Reconciliation durch /coding)

**Wichtige Korrektur gegenüber RE/ARCH-Annahme:** Nicht alle Schreib-Sites schreiben in die `vectors`-Tabelle der `knowledge.db`. Die echte Codebase trennt drei separate DBs (`knowledge.db`, `memory.db`, `history.db`) bereits physikalisch. FEAT-03-27 betrifft nur die `vectors`-Tabelle in `knowledge.db`.

### Writer auf `vectors` (vier Stellen in einer Datei)

| Site | Aktuelle Operation | Migration-Ziel |
|---|---|---|
| `SemanticIndexService.ts:500` | `insertChunks(file.path, ...)` Note-Pfad | `vectorStore.insertNoteVector(file.path, ...)` |
| `SemanticIndexService.ts:636` | `insertChunks(filePath, ...)` Note-Pfad | `vectorStore.insertNoteVector(filePath, ...)` |
| `SemanticIndexService.ts:1020` | `insertChunks(\`session:${sessionId}\`, ...)` | `vectorStore.insertSessionVector(sessionId, ...)` |
| `SemanticIndexService.ts:1059` | `insertChunks(\`episode:${episodeId}\`, ...)` | `vectorStore.insertEpisodeVector(episodeId, ...)` |

Direkte SQL-Writer leben ausschließlich in `src/core/knowledge/VectorStore.ts` (zentrale Helper-Klasse, existiert bereits). Diese Datei wird erweitert, nicht ersetzt.

### Reader auf `vectors` (drei direkte SQL-Stellen plus VectorStore-API-Konsumenten)

| Site | Aktuelle Operation | Migration-Ziel |
|---|---|---|
| `VaultHealthService.ts:366` (`checkOrphans`) | `SELECT DISTINCT v.path FROM vectors v WHERE v.chunk_index = 0 ...` | `vectorStore.findNoteVectors({chunkIndex: 0, excludePathPrefixes, excludePathContains})` |
| `VaultHealthService.ts:596-602` (`checkWeakClusters`) | `... SELECT DISTINCT path FROM vectors WHERE chunk_index = 0 ...` als Subquery | gleicher Helper-Aufruf inline oder eigene Methode |
| `SemanticIndexService.ts:596` (`cleanupStubVectors`) | `if (p.startsWith('session:') || p.startsWith('episode:')) continue;` Drift-Filter | Aufruf `vectorStore.getStubCandidatePaths()` filtert intern auf `domain = 'note'`, der Filter im Aufrufer wird entfernt |

Indirekte Reader gehen über die VectorStore-API:

| Site | Aktuelle API-Nutzung | Migration-Ziel |
|---|---|---|
| `MemoryRetriever.ts` | über `VectorStore`-Methoden | gegebenenfalls auf domain-spezifische Methode umstellen, je nach Aufruf-Pattern |
| `SemanticSearchTool.ts` | über `VectorStore`-Methoden | Note-Default, sonst Cross-Layer mit `findVectors({domain?})` |
| `RerankerService.ts` (`src/core/knowledge/`) | über `VectorStore`-Methoden | Cross-Layer, bleibt auf `findVectors` ohne Domain-Filter |

### Nicht betroffen (entgegen RE/ARCH-Annahme)

| Site | Real-Operation | Begründung |
|---|---|---|
| `HistoryIndexer.writeChunks` | `INSERT INTO history_chunks ...` in `history.db` | Separate DB, separate Tabelle. Sessions im History-Layer sind hier; die `session:${id}`-Vectoren in `knowledge.db.vectors` sind ein Embedding-Pendant für semantische Suche, eine andere Welt. |
| `FactStore.create/update` | `INSERT INTO facts ...` in `memory.db` | Separate DB, separate Tabelle. |
| `SearchHistoryTool` | `FROM history_chunks` in `history.db` | Read-Pfad gegen die History-DB, nicht `vectors`. |
| Stigmergy-Episode-Writer als separate Datei | existiert nicht | Episodes werden über `SemanticIndexService.insertChunks(\`episode:${id}\`, ...)` geschrieben (siehe Writer-Tabelle oben). |
| `KnowledgeDB.ts:597` (`SELECT count(*) FROM vectors`) | interner Integritäts-Check | Bleibt als interne Operation in der Helper-Heimat (`KnowledgeDB.ts` plus `VectorStore.ts` ignoriert die Lint-Regel). |

## 9. Test plan

| Testklasse | Pre-Migration | Post-Migration | Toleranz |
|---|---|---|---|
| Vault Health Pseudo-Orphan-Zähler | Baseline (412 in Sebastian's Vault) | 0 | exakt |
| RecallEngine Top-10-Diff (30 Queries) | Snapshot | Vergleich | <= 5% (SC-02) |
| RecallEngine-Latenz | Baseline | Vergleich | <= +10% (SC-06) |
| Migration-Dauer | -- | Messung im OperationLogger | <= 30s (SC-03) |
| Migration-Idempotenz | -- | zweite Anwendung produziert 0 Schreibvorgänge | exakt (SC-04) |
| Schema-Constraint | -- | Versuch `INSERT ... domain = 'invalid'` schlaegt fehl | exakt (SC-05) |
| ESLint-Regel | -- | Test-Korpus: Positive + Negative Cases | 0 False-Negatives |

## 10. Dialog

> Bidirectional channel between /coding and /architecture. Pending
> entries blockieren nur das ADR, das von der Frage abhängt.

### Questions from /coding to /architecture

(leer bei ARCH-Abschluss)

### Answers from /architecture

(leer bei ARCH-Abschluss)
