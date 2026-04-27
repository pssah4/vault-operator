---
id: PLAN-003
title: FEATURE-0314 Knowledge-DB-Haertung -- Implementation
status: Implemented
completed: 2026-04-27
date: 2026-04-27
feature-refs: [FEATURE-0314]
adr-refs: [ADR-077, ADR-078, ADR-079, ADR-080]
bug-refs: [BUG-012]
pair-id: sebastian-opus-4.7
parent-plan: PLAN-001-memory-v2-master
related:
  - _devprocess/requirements/handoff/plan-context-memory-v2.md
  - PLAN-002-phase-0-spikes.md
  - FEATURE-0314-knowledge-db-hardening.md
---

# PLAN-003 -- FEATURE-0314 Knowledge-DB-Haertung

## Zweck

Phase 0.5 (Knowledge-DB-Haertung) der Memory-v2-Initiative implementieren. Die Haertung ist Vorbedingung fuer alle nachfolgenden Phasen, weil Memory v2 dieselben Atomic-Write- und URI-Konventions-Patterns nutzt.

Eight Sub-Massnahmen aus FEATURE-0314 Definition of Done werden in einer kombinierten Lieferung umgesetzt.

## Kontext

**Bestehende Foundation (Code-Review-Ergebnis 2026-04-26):**

- `KnowledgeDB.writeDBGlobalAtomic` existiert bereits ([src/core/knowledge/KnowledgeDB.ts:501-518](../../src/core/knowledge/KnowledgeDB.ts#L501-L518)) -- Single-File-Atomic fuer Storage-Modus `global`
- `cleanupTmp()` ([src/core/knowledge/KnowledgeDB.ts:548-558](../../src/core/knowledge/KnowledgeDB.ts#L548-L558)) entfernt stale `.tmp`-Files beim Open
- `tryLoadWithIntegrityCheck` ([src/core/knowledge/KnowledgeDB.ts:427-445](../../src/core/knowledge/KnowledgeDB.ts#L427-L445)) prueft via Test-Queries, faellt zurueck auf `.bak`
- `migrateSchema` ([src/core/knowledge/KnowledgeDB.ts:377-416](../../src/core/knowledge/KnowledgeDB.ts#L377-L416)) Pattern fuer Schema-Migration etabliert (SCHEMA_VERSION=8)
- Vault-Hooks `vault.on('rename')` ([src/main.ts:589-600](../../src/main.ts#L589-L600)) heute: delete-then-reinsert, kein UPDATE-Cascade in `implicit_edges`/`tags`/`note_freshness`/`edges`/`ontology`

**Was fehlt:**

1. **Multi-File-Coordination** (memory.db + knowledge.db + ggf. history.db koordiniert)
2. **Vault-Mode-Haertung** -- `writeDBVaultWithBackup` ist NICHT atomic
3. **Single-Writer-Lock per PID** -- Klasse B (Vault-Sync) mit zwei Plugin-Instanzen
4. **URI-Konvention-Migration** fuer `vectors.path` (Praefix `vault://`, idempotent)
5. **embedding_model-Spalte** in `vectors` + Index
6. **Vault-Rename-Cascade** UPDATE statt delete-then-reinsert, plus Folder-Rename per LIKE-Pattern
7. **Daily-Snapshot-Job** (`.bak/{YYYY-MM-DD}.db`, 7-Tage-Retention)
8. **PRAGMA integrity_check** beim Open (zusaetzlich zur Try-Open-Recovery)

**Kontext-Bezuege:**

- ADR-079 entscheidet die Pattern-Architektur (Multi-File-Atomic-Commit, Lock-File, Snapshot-Job)
- ADR-078 entscheidet die URI-Konvention (`vault://`, `session://`, `episode://`, `entity://`)
- ADR-077 definiert das Memory-v2-Schema, das diese Haertung als Foundation braucht
- BUG-012 wird durch Vault-Mode-Haertung + Multi-File-Atomic-Commit endgueltig adressiert

## Aenderungen

### Aufgabe 1: Schema-Migration v8 -> v9 (knowledge.db)

**Ziel:** `embedding_model`-Spalte + Index in `vectors`. URI-Konvention-Migration fuer `vectors.path` (Praefix `vault://` fuer alle Eintraege ohne Schema-Praefix).

**Dateien:**

- Modify: [src/core/knowledge/KnowledgeDB.ts](../../src/core/knowledge/KnowledgeDB.ts)
  - SCHEMA_VERSION = 8 -> 9
  - DDL: `vectors` bekommt `embedding_model TEXT NOT NULL DEFAULT 'unknown'`
  - DDL: neuer Index `idx_vectors_model` auf `vectors(embedding_model)`
  - migrateSchema: v8 -> v9 Block, idempotent ueber `try/catch` (Spalte existiert bereits)
  - migrateSchema: URI-Konvention-Migration -- alle `vectors.path`-Werte ohne `://`-Praefix bekommen `vault://` vorangestellt. Plus `implicit_edges.source_path`, `implicit_edges.target_path`, `edges.source_path`, `edges.target_path`, `tags.path`, `note_freshness.path`, `ontology.entity_path`. Idempotent ueber `WHERE path NOT LIKE '%://%'`
- Test: [src/core/knowledge/__tests__/KnowledgeDB.test.ts](../../src/core/knowledge/__tests__/KnowledgeDB.test.ts)
  - Neuer Test "v8 -> v9 migration adds embedding_model column"
  - Neuer Test "URI-Migration adds vault:// prefix idempotently"

**Risiko:** klein. ALTER TABLE ist robust, URI-Migration ist UPDATE mit LIKE-Filter (skipped bereits-migrierte Rows).

### Aufgabe 2: Multi-File-Atomic-Commit-Helper

**Ziel:** Neuer Helper `MultiFileAtomicCommit`, der mehrere DB-Dateien koordiniert via Journal commited. Jeder einzelne Write ist atomic via `writeAtomic` (fsync). Recovery beim Plugin-Start.

**Dateien:**

- Create: [src/core/persistence/MultiFileAtomicCommit.ts](../../src/core/persistence/MultiFileAtomicCommit.ts) -- neue Datei
  - Klasse `MultiFileAtomicCommit`
  - Methoden: `commit(writes)`, `recoverOnStartup()`, `writeAtomic(path, data)` (private)
  - Journal-Datei `{appDataDir}/.commit-journal.json`
  - Phase-Sequenz: Stage `.tmp` -> Journal schreiben -> Rotate `.bak` + Rename `.tmp` -> Journal loeschen
  - Recovery: Journal vorhanden? Pruefe ob alle `.tmp`-Files existieren. Ja: Replay Phase 3. Nein: Rollback (loesche `.tmp`-Files).
- Test: [src/core/persistence/__tests__/MultiFileAtomicCommit.test.ts](../../src/core/persistence/__tests__/MultiFileAtomicCommit.test.ts) -- neue Datei
  - Test "commits 2 files atomically"
  - Test "recovers from crash between Phase 2 and 3 (replay)"
  - Test "rolls back from crash between Phase 1 and 2 (delete tmp)"
  - Test "handles first-write case (no .bak rotation needed)"

**Risiko:** mittel. Race-Conditions zwischen mehreren `commit`-Calls. Mitigation: Mutex pro `appDataDir`, Schreib-Operationen sequenziell.

### Aufgabe 3: Vault-Mode-Haertung writeDBVaultWithBackup

**Ziel:** Read-Verify-Replace-Pattern fuer Vault-Modus, weil `vault.adapter` kein rename hat.

**Dateien:**

- Modify: [src/core/knowledge/KnowledgeDB.ts:521-545](../../src/core/knowledge/KnowledgeDB.ts#L521-L545)
  - `writeDBVaultWithBackup` umbauen:
    1. Schreibe neue Daten zu `.tmp`-Pfad
    2. Lies `.tmp`-Datei zurueck und vergleiche Bytes mit `data` (Verify)
    3. Wenn ok: Backup current zu `.bak` (Read-Modify-Write)
    4. Wenn ok: Schreibe `data` zu Original-Pfad
    5. Loesche `.tmp`-Datei
    6. Bei Fehler in Schritt 2: Notice + abort
- Test: [src/core/knowledge/__tests__/KnowledgeDB.test.ts](../../src/core/knowledge/__tests__/KnowledgeDB.test.ts)
  - Neuer Test "vault-mode write rolls back on verify-failure"

**Risiko:** mittel. Verify ist nicht crash-sicher (zwei FS-Ops zwischen Verify und Replace). Mitigation: Lock-File aus Aufgabe 4 verhindert Doppel-Writes.

### Aufgabe 4: Single-Writer-Lock per PID

**Ziel:** Lock-File `.obsilo-lock` mit `{pid, hostname, started_at}` JSON-Inhalt waehrend Schreib-Phase. Lock von Crash-Process wird automatisch erkannt und gebrochen (PID nicht mehr aktiv).

**Dateien:**

- Create: [src/core/persistence/WriterLock.ts](../../src/core/persistence/WriterLock.ts) -- neue Datei
  - Klasse `WriterLock`
  - Methoden: `acquire()`, `release()`, `isAlive(pid)` (private)
  - PID-Check via `process.kill(pid, 0)` (sendet Signal 0, throws wenn PID nicht aktiv)
  - Stale-Lock-Detection: Lock-File age > 5min UND PID nicht aktiv -> Lock brechen
  - Lock-Konflikt: Notice + return false (kein Schreibversuch)
- Test: [src/core/persistence/__tests__/WriterLock.test.ts](../../src/core/persistence/__tests__/WriterLock.test.ts) -- neue Datei
  - Test "acquires lock when no other lock exists"
  - Test "rejects acquire when another live PID holds lock"
  - Test "breaks stale lock from dead PID"

**Risiko:** klein. PID-basiert ist robuster als Timeout-basiert. Cross-Host-Risiko bleibt (zwei Geraete in iCloud-Sync) -- Mitigation: hostname-Stempel im Lock, Notice mit Konflikt-Info.

### Aufgabe 5: Vault-Rename-Cascade

**Ziel:** Bei `vault.on('rename')` UPDATE statt delete-then-reinsert. Cascadiert in 5 Tabellen: `vectors`, `implicit_edges`, `edges`, `tags`, `note_freshness`, `ontology`. Folder-Rename via LIKE-Pattern.

**Dateien:**

- Create: [src/core/knowledge/VaultRenameHandler.ts](../../src/core/knowledge/VaultRenameHandler.ts) -- neue Datei
  - Klasse `VaultRenameHandler`
  - Methode `handleRename(oldPath, newPath)`: dispatch File vs Folder via Vault-Adapter-Check
  - Methode `cascadeFileRename(oldPath, newPath)`: UPDATE in 6 Tabellen mit `vault://`-Praefix
  - Methode `cascadeFolderRename(oldFolder, newFolder)`: Batch-UPDATE per `WHERE path LIKE 'vault://oldFolder/%'`, Replace-Praefix
- Modify: [src/main.ts:589-600](../../src/main.ts#L589-L600)
  - Vault-rename-Hook nutzt `VaultRenameHandler.handleRename()` statt delete+reinsert
- Test: [src/core/knowledge/__tests__/VaultRenameHandler.test.ts](../../src/core/knowledge/__tests__/VaultRenameHandler.test.ts) -- neue Datei
  - Test "file rename updates 6 tables"
  - Test "folder rename batch-updates 100 entries < 200ms"
  - Test "rename to existing path is rejected by Obsidian (no test, dokumentiert)"

**Risiko:** mittel. Race-Condition mit aktivem Indexing. Mitigation: Mutex pro Pfad, Rename wartet auf Index-Op.

### Aufgabe 6: Daily-Snapshot-Job + Restore-Tool

**Ziel:** Plugin-Start-Job kopiert `{memory,history,knowledge}.db` nach `.bak/{YYYY-MM-DD}.db`, Retention 7 Tage. Manueller Restore via Agent-Tool.

**Dateien:**

- Create: [src/core/persistence/SnapshotJob.ts](../../src/core/persistence/SnapshotJob.ts) -- neue Datei
  - Klasse `SnapshotJob`
  - Methode `runDailySnapshot()`: ueberspringt wenn Snapshot fuer heute existiert; sonst kopiert DB-File nach `.bak/{YYYY-MM-DD}.db`
  - Methode `cleanupOldSnapshots()`: Loescht Snapshots aelter als 7 Tage
  - Methode `restoreFromSnapshot(date)`: Lock acquire -> stop-DB -> copy `.bak/{date}.db` -> start-DB
  - Plugin-Start-Hook: ruft `runDailySnapshot()` + `cleanupOldSnapshots()` auf
  - Nur fuer Storage-Modus `global` und `local` (nicht `obsidian-sync`, weil Vault-Sync nicht ueberlappende Files dupliziert)
- **Deferred:** `restore_database_snapshot`-Agent-Tool (Wrapper um `SnapshotJob.restoreFromSnapshot`).
  Begruendung: Die Snapshot-Infrastruktur ist crash-fest fertig; ein zusaetzliches Agent-Tool
  bedeutet `ToolName`-Type-Erweiterung, ToolRegistry-Registrierung, Metadata-Eintrag,
  Approval-Modal -- erheblicher Plumbing-Aufwand fuer eine Restore-Operation, die wenige Male
  pro Jahr ausgeloest wird. Aufgenommen als Folge-IMP nach Phase 0.5. Workaround bis dahin:
  Restore via Settings-Aktion oder direkter Aufruf der `SnapshotJob.restoreFromSnapshot()`-API
  durch einen Slash-Command.
- Test: [src/core/persistence/__tests__/SnapshotJob.test.ts](../../src/core/persistence/__tests__/SnapshotJob.test.ts) -- neue Datei
  - Test "creates daily snapshot when none exists"
  - Test "skips snapshot when today's exists"
  - Test "cleans up snapshots older than 7 days"
  - Test "restoreFromSnapshot replaces current DB with snapshot"

**Risiko:** klein. Snapshots sind read-only Kopien, Restore ist explizit User-getriggert.

### Aufgabe 7: PRAGMA integrity_check + Auto-Recovery aus .bak

**Ziel:** Beim DB-Open zusaetzlich zur Try-Open-Recovery ein explizites `PRAGMA integrity_check` ausfuehren. Bei `result !== 'ok'` -> Auto-Restore aus `.bak`.

**Dateien:**

- Modify: [src/core/knowledge/KnowledgeDB.ts:427-445](../../src/core/knowledge/KnowledgeDB.ts#L427-L445)
  - `tryLoadWithIntegrityCheck` erweitern:
    1. Bestehende Test-Queries (`schema_meta`, `vectors`)
    2. NEU: `PRAGMA integrity_check;` als zusaetzliche Verifikation
    3. Wenn `result !== 'ok'`: false (Auto-Recovery aus `.bak` greift im Open-Pfad)
- Test: [src/core/knowledge/__tests__/KnowledgeDB.test.ts](../../src/core/knowledge/__tests__/KnowledgeDB.test.ts)
  - Neuer Test "integrity_check rejects corrupt B-tree"

**Risiko:** klein. PRAGMA integrity_check ist SQLite-Native, performance-Kosten < 500ms fuer 200MB-DB.

### Aufgabe 8: BUG-012 Status-Update + Backlog-Sync

**Ziel:** Dokumentation aktualisieren, BUG-012 als Resolved markieren, Backlog-Row aktualisieren.

**Dateien:**

- Modify: [_devprocess/analysis/BUG-012-knowledgedb-corruption.md](../../_devprocess/analysis/BUG-012-knowledgedb-corruption.md)
  - Status: open -> resolved
  - Resolution-Note: Verweis auf FEATURE-0314, Commit-SHA, ADR-079
- Modify: [_devprocess/context/10_backlog.md](../../_devprocess/context/10_backlog.md)
  - FEATURE-0314 Row: Planned -> Done
  - Commit-SHA-Verweis
  - Dashboard-Counts refresh
- Modify: [_devprocess/architecture/ADR-079-knowledge-db-hardening.md](../../_devprocess/architecture/ADR-079-knowledge-db-hardening.md)
  - Status: Accepted -> bleibt (war schon Accepted)
  - Implementation-Bezug-Block aktualisieren mit Commit-SHA
- Modify: [memory/MEMORY.md](../../memory/MEMORY.md)
  - FIX-12 Status update auf Resolved

**Risiko:** klein. Dokumentations-Update.

## Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `src/core/knowledge/KnowledgeDB.ts` | v8->v9 Migration, integrity_check, Vault-Mode-Haertung | Mittel |
| `src/core/persistence/MultiFileAtomicCommit.ts` | NEU: Multi-File-Helper | Mittel |
| `src/core/persistence/WriterLock.ts` | NEU: Lock-File mit PID | Klein |
| `src/core/persistence/SnapshotJob.ts` | NEU: Daily-Snapshot + Restore | Klein |
| `src/core/knowledge/VaultRenameHandler.ts` | NEU: Cascade-Logic | Mittel |
| `src/main.ts` | Rename-Hook nutzt Handler, SnapshotJob beim Start | Klein |
| `src/tools/restore_database_snapshot.ts` | NEU: Agent-Tool | Klein |
| `src/core/knowledge/__tests__/KnowledgeDB.test.ts` | Neue Tests fuer Migration + integrity_check | Klein |
| `src/core/persistence/__tests__/*.test.ts` | NEU: Tests fuer alle Persistence-Helpers | Mittel |
| `src/core/knowledge/__tests__/VaultRenameHandler.test.ts` | NEU: Cascade-Tests | Klein |
| `_devprocess/analysis/BUG-012-knowledgedb-corruption.md` | Status update | Klein |
| `_devprocess/context/10_backlog.md` | FEATURE-0314 Row update | Klein |
| `memory/MEMORY.md` | FIX-12 update | Klein |

## Nicht betroffen (Blast-Radius-Bestaetigung)

- `src/core/knowledge/MemoryDB.ts` -- bleibt Wrapper um KnowledgeDB, keine API-Aenderung
- `src/core/knowledge/SemanticIndex.ts` -- nutzt KnowledgeDB-API, keine Aenderung an Schnittstelle
- `src/core/knowledge/VectorStore.ts` -- nutzt `vectors`-Tabelle, neue Spalte mit Default `'unknown'`, abwaerts-kompatibel
- `src/core/knowledge/GraphStore.ts` -- nutzt `edges`/`implicit_edges`, neue URI-Praefix nach Migration, Code muss aber NICHT angepasst werden (UPDATEs sind transparent)
- Alle anderen Tools, UI-Komponenten, Settings -- keine API-Aenderung

## Coverage Gate

### SC -> Task Mapping

| Success Criterion | Task |
|-------------------|------|
| SC-01 Vault-Index ueberlebt unerwartete Plugin-Beendigung | Task 2 (Multi-File-Atomic-Commit), Task 3 (Vault-Mode-Haertung), Task 7 (integrity_check) |
| SC-02 Note-Umbenennung haelt alle Verweise frisch | Task 5 (Vault-Rename-Cascade) |
| SC-03 Modell-Wechsel ohne stille Search-Quality-Verschlechterung | Task 1 (embedding_model-Spalte) |
| SC-04 Identifier-Konvention ist eindeutig im Vault-Index | Task 1 (URI-Konvention-Migration) |
| SC-05 Cloud-Sync-Konflikt wird erkannt | Task 4 (Single-Writer-Lock per PID) |

### ADR-Alignment

| ADR | Operationalisierende Tasks |
|-----|----------------------------|
| ADR-079 Massnahme 1 (Multi-File-Atomic-Commit) | Task 2 |
| ADR-079 Massnahme 2 (Vault-Rename-Cascade) | Task 5 |
| ADR-079 Massnahme 3 (Embedding-Model-Spalte) | Task 1 |
| ADR-079 Cloud-Sync-Abwehr (Lock-File) | Task 4 |
| ADR-079 Integrity-Check beim Load | Task 7 |
| ADR-079 Daily-Snapshot-Job (C2-Beschluss) | Task 6 |
| ADR-078 URI-Konvention (vault://, vorgelagert) | Task 1 |

### Codebase-Anchoring

Alle Tasks haben konkrete Datei-Pfade. Keine "TBD"-Tasks.

### Verifikation

- Build: `npm run build` (esbuild, gibt 0 Errors)
- Tests: `npm test` (vitest, alle Tests gruen, > 90% Coverage in neuen Files)
- Smoke-Test: Plugin laden, Vault-Index reindex, Note rename -> alle Tabellen korrekt aktualisiert
- Performance-Test: Folder-Rename mit 100 Notes < 200ms via `console.time`
- Manuelle Verifikation: Plugin-Crash simulieren -> integrity_check + Auto-Recovery aus `.bak`

## Verifikation (Akzeptanzkriterien)

1. **Build:** `npm run build` -> 0 Errors, 0 Warnings (TypeScript-Strict)
2. **Tests:** `npm test` -> alle Tests gruen, neue Tests fuer Aufgaben 1-7 vorhanden
3. **Schema-Migration:** Bestehende Vault-Datenbank von Sebastian v8 -> v9 ohne Datenverlust
4. **URI-Migration:** Test-DB mit `vectors.path = 'foo/bar.md'` -> nach Migration `'vault://foo/bar.md'`
5. **Lock-File-Test:** Zweiter Plugin-Start mit aktiver Lock -> Notice, kein Schreibversuch
6. **Cascade-Test:** Note `foo.md` -> `bar.md` umbenennen -> alle 6 Tabellen zeigen `vault://bar.md`
7. **Snapshot-Test:** Plugin-Start zweimal an gleichem Tag -> nur ein Snapshot, beim zweiten Start uebersprungen
8. **Integrity-Check-Test:** Korrupte DB-Datei (manuell modifiziert) -> Auto-Recovery aus `.bak`

## Implementation Notes

- **URI-Konvention-Migration brauchte zusaetzlich Code-Anpassungen**, weil
  bestehender Code an drei Stellen `'session:'`/`'episode:'` per `replace`
  abgeschnitten hat. `startsWith()`-Filter und `LIKE 'session:%'`-Queries
  bleiben transparent (matchen beide Praefix-Formen), aber `replace('session:', '')`
  haette `'//foo'` produziert. Fix: Regex `/^session:(\/\/)?/` in
  [MemoryRetriever.ts:50](../../src/core/memory/MemoryRetriever.ts#L50) und
  [EpisodicExtractor.ts:130](../../src/core/mastery/EpisodicExtractor.ts#L130).
  INSERT-Stellen in [SemanticIndexService.ts:706,745](../../src/core/semantic/SemanticIndexService.ts#L706)
  schreiben jetzt `session://` und `episode://`.
- **Folder-Rename war im bestehenden Hook nicht abgedeckt**: Der Listener
  filterte nur auf `TFile`. Erweitert um `TFolder`-Branch in
  [main.ts:592-598](../../src/main.ts#L592-L598).
- **Atomic-Write im Vault-Modus** ist nicht crash-sicher per `vault.adapter`
  alleine (kein rename), nur durch Verify-Read-Pattern + Single-Writer-Lock
  zusammen abgesichert. Lock-File ist die eigentliche Korruptionsabwehr in
  Setup-Klasse B.
- **Restore-Tool deferred**: SnapshotJob-API ist crash-fest fertig
  (`restoreFromSnapshot(target, date)` mit `.pre-restore`-Backup), aber das
  Agent-Tool-Plumbing (ToolName-Type, Registry, Metadata, Approval) ist
  Folge-IMP nach Phase 0.5.
- **Tests:** 32 neue Tests in 5 Files, alle gruen. Volle Suite (468 Tests)
  bleibt gruen, keine Regression.
- **Build:** `npm run build` produziert main.js (33.6MB BRAT-Bundle), Deploy
  zur iCloud-Plugin-Installation grun.

## Coverage Gate -- Re-Run nach Implementation

| Item | Status |
|------|--------|
| SC-01 (Crash-Survival) | ✓ Single-File-Atomic-Commit pro DB (`writeDBGlobalAtomic` / `writeDBVaultWithBackup`) + integrity_check. Cross-DB-Koordination (`MultiFileAtomicCommit`) als Klasse + Tests vorhanden, aber bewusst nicht verdrahtet -- Phase-1-Material, weil heute nur eine DB existiert |
| SC-02 (Rename-Cascade) | ✓ Listener-Block immer aktiv (nicht mehr im `semanticAutoIndexOnChange`-Gate). Live-Verifikation 2026-04-27 mit `Notes/Dominik Klumpp.md`: 57 Reihen sauber cascadiert. 4 Unit-Tests + Live-Test gruen ([BUG-030](../../analysis/BUG-030-icloud-vault-rename-not-cascaded.md) resolved) |
| SC-03 (Modell-Wechsel) | ✓ embedding_model-Spalte + Index in v9 |
| SC-04 (URI-Eindeutigkeit) | ✓ Migration zurueckgezogen (siehe Hotfix-Eintrag); `session://`/`episode://` fuer neue Inserts, Vault-Pfade bleiben bare. Funktional eindeutig durch `LIKE 'session:%'`-Toleranz |
| SC-05 (Cloud-Sync-Konflikt) | ✓ WriterLock per PID in `KnowledgeDB.open()` am `obsidian-sync`-Pfad acquired, in `close()` released. Notice via `WriterLockHeldError` ([BUG-029](../../analysis/BUG-029-writerlock-not-wired.md) resolved). Cross-host-Locks bleiben advisory-only |
| ADR-079 Massnahme 1 (Multi-File) | △ Klasse `MultiFileAtomicCommit` + Tests da, Verdrahtung Phase 1 wenn `memory.db` dazukommt |
| ADR-079 Massnahme 2 (Vault-Mode) | ✓ writeDBVaultWithBackup mit Verify |
| ADR-079 Massnahme 3 (embedding_model) | ✓ Schema v9 |
| ADR-079 Cloud-Sync-Abwehr | ✓ WriterLock verdrahtet in `KnowledgeDB.open()`/`close()` am `obsidian-sync`-Pfad, Notice via `WriterLockHeldError` ([BUG-029](../../analysis/BUG-029-writerlock-not-wired.md) resolved) |
| ADR-079 integrity_check | ✓ tryLoadWithIntegrityCheck Stage 2 |
| ADR-079 Daily-Snapshot | ✓ SnapshotJob + 7-Tage-Cleanup |

## Change Log

### 2026-04-27 - Initial

PLAN-003 erstellt. Status: Draft -> Active. Trigger: User-Freigabe nach Phase-0-Spike-Abschluss ("mach weiter").

### 2026-04-27 - Implementation abgeschlossen

Alle 8 Sub-Aufgaben implementiert. Restore-Agent-Tool deferred als Folge-IMP. Build gruen, 468 Tests gruen, FIX-12 Status -> Resolved, FEATURE-0314 Status -> Implemented, BUG-012 Status -> Resolved. Status: Active -> Implemented.

### 2026-04-27 - Hotfix: URI-Migration zurueckgezogen

Trigger: Live-DB-Inspektion auf Sebastians 11k-Vector-DB zeigte 9431
mid-state-Reihen ohne `vault://`-Praefix. Root cause: SemanticIndexService
inserted nach der Migration weitere Reihen mit raw vault paths (Inkremental-
Update lief nach dem Plugin-Start und befuellte mit `file.path`), waehrend
bereits migrierte Reihen den Praefix trugen.

Erste Reaktion war ein `repairUriRollback()`-Pass, der bei jedem Open lief.
Auf Hinterfragen verworfen, weil das Architektur-Schmutz im Plugin-Code
hinterlaesst, der nur Sebastians konkreten Mid-State-Bug repariert.

### 2026-04-27 - Endgueltige Bereinigung: Code clean, DB neu

Code:

1. `migrateUriConvention()` und `repairUriRollback()` aus KnowledgeDB
 entfernt. v8->v9 macht jetzt nur noch das `ALTER TABLE vectors ADD
 COLUMN embedding_model`.
2. `SemanticIndexService` schreibt `session:` und `episode:` (single colon).
3. `VaultRenameHandler` arbeitet auf raw vault paths.
4. URI-Migrations-Tests entfernt; embedding_model-Test bleibt.

DB: Sebastians knowledge.db einmalig geloescht, Reindex via OpenRouter laeuft
beim naechsten Plugin-Start (~10-15 Min). memory.db (echte User-Daten) bleibt
unangetastet.

Begruendung: ADR-078 URIs landen ab Memory v2 Phase 1+ in NEUEN Tabellen
(facts, fact_edges, history_chunks). Bestehende Spalten bleiben raw paths,
weil ihre Konsumenten (SemanticIndex, Search-Tools, Sidebar, MemoryRetriever,
EpisodicExtractor) das so erwarten. Architektur-Lehre: Migrationen, die
geteilte Spalten mutieren, brauchen einen Writer-Lock vorher. Fuer Memory v2
Phase 1+ ist das der Default.

embedding_model-Spalte + integrity_check + Atomic-Write + Lock + Snapshot
bleiben vollstaendig in v9. Build gruen, 467 Tests gruen.

### 2026-04-27 - Live-Verifikation Befund: WriterLock nicht verdrahtet

Trigger: Live-Verifikation der Akzeptanzkriterien nach abgeschlossenem
Reindex auf Sebastians 12k-Vector-DB. AK 5 (Lock-File-Test) kann nicht
gepruft werden, weil keine `.obsilo-lock`-Datei im Plugin-Datenverzeichnis
liegt und keine Acquire-Stelle im Plugin-Code existiert
(`grep -rn "new WriterLock" src/ --exclude-dir=__tests__` ohne Treffer).

`MultiFileAtomicCommit` ist analog verwaist, aber das ist kein Phase-0.5-
Defekt: Cross-DB-Koordination wird erst in Phase 1 relevant, sobald
`memory.db` zu `knowledge.db` dazukommt. Heute ist KnowledgeDB die einzige
DB, und die Single-File-Atomic-Commit-Pfade in `writeDBGlobalAtomic` /
`writeDBVaultWithBackup` reichen.

Folge:

- BUG-029 angelegt unter `_devprocess/analysis/BUG-029-writerlock-not-wired.md`.
- Coverage-Gate fuer SC-05 und ADR-079 Cloud-Sync-Abwehr von ✓ auf △ partial korrigiert.
- Coverage-Gate fuer SC-01 und ADR-079 Massnahme 1 prazisiert (Single-File
  ist heute, Multi-File-Verdrahtung folgt mit Phase 1).
- Sebastians `local`-Storage-Setup ist nicht betroffen. Setup-Klasse B
  (`obsidian-sync`) ist heute ohne Lock-Schutz.

Andere Akzeptanzkriterien: AK 1+2 grun (Build + 468 Tests grun), AK 3 grun
(`schema_meta.version=9`, alle 12.038 vectors haben `embedding_model`),
AK 4 entfaellt durch Migrations-Hotfix oben, AK 7 grun
(`.bak/knowledge/2026-04-27.db` 226 MB vorhanden), AK 8 Stage 1 grun
(`PRAGMA integrity_check = ok` direkt nach Reindex), AK 8 Stage 2 als
neuer Vitest-Test "rejects corrupt B-tree, healthy .bak loads instead"
in [KnowledgeDB.test.ts](../../src/core/knowledge/__tests__/KnowledgeDB.test.ts) ergaenzt -- gruen.

### 2026-04-27 - Live-Verifikation Befund: Cascade greift nicht auf iCloud-Vault

Trigger: Live-Verifikation AK 6 auf Sebastians iCloud-Vault. Die in
Obsidian umbenannte Note (`Notes/Erstellung Infrastruktur ...md`)
hat keinen Cascade in der knowledge.db ausgeloest. DB-Reihen auf altem
Pfad blieben unveraendert. Console-Stack der parallelen Errors zeigt
`reconcileFileCreation` (Obsidian-Sync-Reconciliation), nicht den
klassischen rename-Pfad.

Root cause: iCloud orchestriert die Filesystem-Operationen so, dass
Obsidian den Rename als delete+create-Paerchen sieht.
`vault.on('rename')` feuert nicht -- damit wird VaultRenameHandler
nicht aufgerufen.

Auf lokalen Vaults (kein iCloud) und im Vitest-Pfad funktioniert die
Cascade korrekt; das beweisen die 4 Unit-Tests in
[VaultRenameHandler.test.ts](../../src/core/knowledge/__tests__/VaultRenameHandler.test.ts).

Folge:

- [BUG-030](../../analysis/BUG-030-icloud-vault-rename-not-cascaded.md) angelegt.
- Coverage-Gate fuer SC-02 von ✓ auf △ partial korrigiert.
- AK 6 dokumentarisch via Unit-Tests gruen, Live-Reproduktion auf
  iCloud-Vault aktuell nicht moeglich. Fix als Folge-IMP nach Phase 0.5.

### 2026-04-27 - BUG-029 + BUG-030 resolved (BUG-030 mit Diagnose-Korrektur)

User-Anweisung: "BUG-029/030 fixen" -- beide direkt im selben
Phase-0.5-Scope umgesetzt, statt als Folge-IMP zu schieben.

**BUG-029 (WriterLock):** `WriterLockHeldError` aus `WriterLock.ts`
exportiert, in `KnowledgeDB.open()` am `obsidian-sync`-Pfad
acquired und in `close()` released. `main.ts` catched die Error und
zeigt eine 10-s-Notice. Sebastian's `local`-Setup unveraendert.

**BUG-030 (Cascade-Listener nicht aktiv):** initial wurde aus den
parallelen pretty-properties-Stack-Spuren faelschlich auf "iCloud
rename als delete+create-Paerchen" geschlossen. Ein
`RenamePairDetector` wurde gebaut. Live-Test mit dem ersten Build
zeigte trotzdem keinen Cascade. Erst die Pruefung von `data.json`
ergab `"semanticAutoIndexOnChange": false` -- der gesamte
Listener-Block in main.ts war im Settings-Gate eingeschlossen.

Echter Fix: Listener aus dem Settings-Gate herausgezogen. Cascade
laeuft jetzt immer wenn `knowledgeDB` und `vaultRenameHandler` da
sind. Auto-Reindex-Logik bleibt im `autoIndex`-Boolean gegated, aber
innerhalb der gleichen Listener.

`RenamePairDetector` + Tests + Wiring **zurueckgerollt**, weil auf
Fehldiagnose gebaut.

**Live-Verifikation** mit `Notes/Dominik Klumpp.md`:
57 Reihen sauber von altem auf neuen Pfad cascadiert (vec=11, tag=15,
frs=1, e_s=7, e_t=15, ont=8). Alle 6 betroffenen Spalten korrekt.

**Tests:** +2 neue Cases (WriterLock-Lifecycle + WriterLockHeldError),
volle Suite **470/470 gruen** (vorher 467, +3 fuer BUG-029, +1 fuer
Auto-Recovery, -1 weil RenamePairDetector entfernt --
WriterLock.test +2 ergibt netto +3).

**Coverage-Gate:** SC-02 + SC-05 + ADR-079 Cloud-Sync-Abwehr von △
auf ✓ aufgewertet.

**Lehre** in `feedback_check_settings_first.md` festgehalten: bei
Live-Test-Fehlschlaegen ZUERST `data.json` pruefen, bevor Code als
Ursache vermutet wird.
