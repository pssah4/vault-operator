---
id: FEATURE-0314
title: Knowledge-DB-Haertung
epic: EPIC-003-context-memory-scaling
phase: Building
status: Implemented
priority: P0
effort: M
depends-on: [ADR-079, ADR-078]
related:
  - PLAN-001-memory-v2-master.md (Phase 0.5)
  - BUG-012-knowledgedb-corruption.md
  - ADR-079-knowledge-db-hardening.md
  - ADR-078-uri-versioning-schema.md
---

# Feature: Knowledge-DB-Haertung

> **Feature ID:** FEATURE-0314
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 0.5
> **Priority:** P0-Critical (blockiert Memory v2 Phase 1)
> **Effort:** M (1 Wo nach Code-Review reduziert von 1.5 Wo, weil Single-File-Atomic-Write bereits existiert)

## Code-Review-Findings (2026-04-26, /coding Phase 2)

**Bestehende Implementierung:** [KnowledgeDB.ts:485-518](../../src/core/knowledge/KnowledgeDB.ts#L485-L518) hat bereits Single-File-Atomic-Write fuer Storage-Modus `global` (Marker FIX-12). Plus Try-Open mit `.bak`-Recovery (Zeile 432-444). Plus `cleanupTmp()` (Zeile 547-558).

**Was tatsaechlich neu ist** (Scope-Klarstellung):

1. Multi-File-Coordination zwischen memory.db, history.db, knowledge.db (neues Journal-File)
2. Vault-Mode-Haertung (`writeDBVaultWithBackup` ist NICHT atomic)
3. Single-Writer-Lock-per-PID fuer Klasse B (Vault-Sync, mehrere Plugins)
4. URI-Konvention-Migration fuer `vectors.path` (vault://, session://, episode://)
5. `embedding_model`-Spalte in vectors
6. Vault-Rename-Cascade (vault.on('rename') ist heute registriert in main.ts:589, aber cascadiert nicht in implicit_edges/tags/note_freshness)
7. Daily-Snapshot-Job (.bak/{YYYY-MM-DD}.db, 7-Tage-Retention)
8. PRAGMA integrity_check beim Open (zusaetzlich zur Try-Open-Recovery)

## Feature Description

Vorbedingung fuer Memory v2: Die heutige `knowledge.db` (sql.js, ~200MB bei aktivem Vault-Index) ist nicht crash-sicher (BUG-012, P1, dokumentiert aber nicht gefixt). Vault-Notes-Renames cascaden nicht in alle abhaengigen Tabellen (latenter Bug, sichtbar als stale Search-Treffer). Embedding-Modell-Wechsel mischen alte und neue Vektoren ohne Filter, wodurch Cosine-Scores nicht mehr vergleichbar sind. Plus: das `vectors.path`-Feld nutzt heute inkonsistente Identifier-Praefixe (Vault-Pfad + `session:` + `episode:`), was bei Path-Kollisionen still bricht.

Diese vier Probleme werden in einer kombinierten Haertungs-Phase geloest, bevor Memory v2 dieselbe Infrastruktur erweitert. Ergebnis: hardened Foundation, auf der Memory v2 sicher ATTACHen und Cross-DB-Queries laufen lassen kann.

## Benefits Hypothesis

**We believe that** das Vereinheitlichen von Atomic-Write-Pattern, Vault-Rename-Cascade, Embedding-Model-Tracking und URI-Konvention vor Memory v2 die Korruptions-Wahrscheinlichkeit auf nahe Null senkt und die Recall-Quality unmittelbar verbessert.

**Delivers the following measurable outcomes:**

- BUG-012-Korruptions-Faelle pro 1000 Schreib-Vorgaenge: 0 (aktuell unbekannt, vermutlich > 0)
- Stale Search-Treffer nach Note-Rename: 0 (aktuell: alle vorherigen Verweise sterben still)
- Recall-Verschlechterung beim Embedding-Modell-Wechsel: 0 (aktuell: divergierende Cosine-Scores ohne Hinweis)

**We know we are successful when:**

- Fault-Injection-Test (writeFile crashed mid-write) loest Auto-Recovery aus, Daten konsistent
- Vault-Note-Rename loest Cascade in 5 Tabellen aus, alle Pfade aktualisiert
- Cosine-Search filtert auf aktuelles Embedding-Modell, alte Vektoren werden ausgeschlossen oder gleich-Modell-konvertiert

## User Stories

### Story 1: Plugin-Crash ueberlebt (Functional Job)

**As a** Obsilo-Nutzer
**I want to** dass meine Vault-Index-Daten einen Crash oder Cloud-Sync-Konflikt ueberleben
**so that** ich nicht meine ~10k Embeddings verliere und stundenlang neu indexieren muss

### Story 2: Note-Rename ohne Recall-Verlust (Functional Job)

**As a** Obsilo-Nutzer
**I want to** Vault-Notes umbenennen, ohne dass ihre Verweise im Memory-System sterben
**so that** semantic_search weiterhin auf die richtigen Inhalte zeigt

> **Hinweis Limitation:** Cascade greift nur fuer `vault://`-URIs (VaultAdapter mit `watch()`-Implementation). Externe Quellen (`file://` ausserhalb Vault, `https://`, `cloud://`) haben kein Watch-Pattern, ihre Refs koennen stale werden. Akzeptierte Limitation, dokumentiert in Adapter-API. Stale-Detection erfolgt lazy on-Resolution-Failure (siehe FEATURE-0317 + ADR-078 Source-Adapter-Registry).

### Story 3: Modellwechsel ohne stille Verschlechterung (Emotional Job)

**As a** Obsilo-Nutzer
**I want to** das Embedding-Modell wechseln und sehen, was passiert
**so that** ich Vertrauen behalte, dass Search-Ergebnisse aussagekraeftig bleiben

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Vault-Index ueberlebt unerwartete Plugin-Beendigung | 100% der Faelle, Daten konsistent oder aus Backup wiederhergestellt | Fault-Injection-Suite mit 50+ Crash-Szenarien |
| SC-02 | Note-Umbenennung haelt alle Verweise frisch | 100% der Verweise zeigen auf neuen Pfad | Test: Note umbenennen, alle Tools die auf diese Note zeigen sollen, finden sie |
| SC-03 | Modell-Wechsel ohne stille Search-Quality-Verschlechterung | Search-Ergebnisse zeigen entweder konsistentes Modell oder kennzeichnen Mischzustand | UAT: Modell wechseln, manueller Recall-Test |
| SC-04 | Identifier-Konvention ist eindeutig im Vault-Index | 0 Kollisionen zwischen Note-Pfaden und Memory-IDs | Test: Note mit Namen `session://foo` anlegen, kein Konflikt mit echten Sessions |
| SC-05 | Cloud-Sync-Konflikt wird erkannt | UI-Notice, kein silent overwrite | Manueller Test: parallele Plugin-Instanzen auf zwei Geraeten |

---

## Technical NFRs (for Architect)

### Performance

- **Atomic-Write-Aufschlag:** < 50ms zusaetzlich pro DB-Save (heute: einmaliger writeFile, neu: write `.tmp` + journal + rotate `.bak` + rename + unlink journal)
- **Vault-Rename-Cascade:** < 200ms fuer Folder-Rename mit 100 Notes (Batch-UPDATE per LIKE-Pattern)
- **Integrity-Check beim Load:** < 500ms fuer 200MB-DB
- **Single-Writer-Lock mit PID** fuer Setup-Klasse B (Vault-Sync mit memory.db + history.db Vault-resident, mehrere Plugins auf User-Geraeten ohne zentralen Service): kein zweites Plugin schreibt gleichzeitig, Lock von Crash-Process wird automatisch erkannt und gebrochen. In Setup A (Single-Device) und C (Central-Service) entfaellt der Lock, weil A einen einzigen Schreiber hat und C den Persistenz-Service als Serializer nutzt.

### Security

- **Recovery-Pfad:** Auto-Restore aus `.bak` ohne User-Interaktion fuer korrupte DBs
- **Lock-File-Validation:** PID-basiert, Lock von Crash-Process wird automatisch erkannt und gebrochen
- **Cloud-Sync-Awareness:** Lock verhindert Doppel-Writes von parallelen Plugin-Instanzen

### Scalability

- **DB-Groesse:** Pattern muss bis 1GB DB-Size linear bleiben (aktuell ~200MB)
- **Multi-File-Atomic-Commit:** Bis 4 Files koordiniert (memory.db, knowledge.db, ucm-sidecar.db, history-Index)

### Availability

- **Uptime:** Plugin startet auch nach Crash sauber, Recovery automatisch
- **Recovery Time:** < 2 Sekunden Plugin-Startup-Aufschlag bei Crash-Recovery-Replay

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** Multi-File-Atomic-Commit-Pattern muss zwei DBs (memory.db + knowledge.db) koordiniert haerten, weil Memory v2 ATTACHed Cross-DB-Queries nutzen wird.

- **Why ASR:** Single-File-Atomic-Write reicht nicht, wenn beide DBs sich gegenseitig referenzieren. Inkonsistenz zwischen den Dateien waere ein neuer Bug.
- **Impact:** Schreibt das Pattern fuer alle weiteren DB-Files (UCM-Sidecar, history-Index)
- **Quality Attribute:** Reliability, Data Integrity

**CRITICAL ASR #2:** URI-Konvention fuer `vectors.path` muss vor Memory v2 stehen, sonst muss Memory v2 spaeter alle eigenen Edges nochmal migrieren.

- **Why ASR:** Storage-Identifier sind in beiden DBs persistiert, jede Aenderung danach ist breaking
- **Impact:** ADR-078 muss vor FEATURE-0315 implementiert sein
- **Quality Attribute:** Maintainability, Forward-Compatibility

### Constraints

- sql.js@^1.14.1 ist einziger erlaubter Driver (Review-Bot blockiert native binaries)
- Kein WAL-Aequivalent verfuegbar, daher Multi-File-Journal-Pattern noetig
- Plugin-Bundle-Size: keine zusaetzlichen Dependencies, alles in JS-Layer
- iCloud-Vault-Kompatibilitaet: `.tmp`/`.bak`-Files werden mit-synced (storage-Aufschlag akzeptiert)

### Open Questions for Architect

- Lock-File-TTL-Strategie bei abgestuerztem Plugin-Process
- Re-Embed-Job UX (Background vs. user-triggered Settings-Button)
- Cloud-Sync-Konflikt-Detection: aktive `.icloud`-Suffix-Erkennung oder User-Vertrauen?

---

## Definition of Done

### Functional

- [ ] Multi-File-Atomic-Commit mit Journal implementiert (write-tmp, journal-write, rotate-bak, rename, unlink-journal)
- [ ] Recovery-Replay auf Plugin-Startup, idempotent
- [ ] Vault-Rename-Handler registriert auf vault.on('rename'), cascadiert in 5 Tabellen
- [ ] Folder-Rename-Cascade (Batch-UPDATE per LIKE)
- [ ] embedding_model-Spalte in knowledge.db.vectors hinzugefuegt + Index
- [ ] URI-Konvention-Migration (vectors.path) idempotent, transaktional
- [ ] Lock-File-Pattern implementiert
- [ ] PRAGMA integrity_check beim Load + Auto-Restore aus .bak
- [ ] **Daily-Snapshot-Job** (C2-Beschluss 2026-04-26): Plugin-Start-Job kopiert {memory,history}.db nach `.bak/{YYYY-MM-DD}.db` falls noch nicht vorhanden, Retention 7 Tage. Manueller Restore via Agent-Tool (`restore_database_snapshot(date)`). Nur wenn `db.location='plugin-local'`, in K-Vault-Sync und K-Central-Service uebernimmt der Persistenz-Service-Standort die Snapshot-Logik analog

### Quality

- [ ] Fault-Injection-Test-Suite (50+ Crash-Szenarien) gruen
- [ ] Vault-Rename-Edge-Cases-Tests (Konflikt, Folder, Trash) gruen
- [ ] Performance-Test: Atomic-Write-Aufschlag < 50ms
- [ ] Performance-Test: Folder-Rename mit 100 Notes < 200ms
- [ ] Coverage > 90% fuer MultiFileAtomicCommit-Helper

### Documentation

- [ ] BUG-012 Status auf Resolved aktualisiert mit Verweis auf FEATURE-0314
- [ ] ADR-079 Status auf Accepted
- [ ] Backlog-Row aktualisiert (Status: Done, Commit-SHA, Dashboard refresh)
- [ ] Migration-Notiz: User-Doku ueber neuen Lock-File und Cloud-Sync-Empfehlung

---

## Dependencies

- **ADR-079** (Knowledge-DB-Haertung): Architektur-Entscheidung, muss Accepted sein
- **ADR-078** (URI-Versioning): URI-Konvention muss vorher festgelegt sein
- **Phase-0-Spikes:** keine direkte Abhaengigkeit, aber laufen parallel

## Assumptions

- iCloud/Dropbox-Vault-Setup ist gaengig (rechtfertigt Lock-File-Aufwand)
- Sebastian's bestehende ~10k Embeddings sind erhaltenswert (rechtfertigt One-Shot-URI-Migration statt Re-Index)

## Out of Scope

- Wechsel zu native better-sqlite3 oder anderem Driver (Review-Bot-Block)
- Aktive Cloud-Sync-Erkennung (nur Lock + UI-Hinweis)
- Periodische Backup-Rotation (separater FIX, falls noetig)
- **Rename-Cascade fuer externe Source-Schemata** (`file://`, `https://`, `cloud://`): kein FS-Watcher ausserhalb Vault, kein Web-Watch. Stale-Edges werden lazy-detected (FEATURE-0317).
