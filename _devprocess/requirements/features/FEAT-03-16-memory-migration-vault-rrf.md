---
id: FEAT-03-16
title: Memory-Migration und Vault-RRF-Quick-Win
epic: EPIC-03-context-memory-scaling
priority: P0
effort: M
depends-on: [FEAT-03-15]
related:
  - PLAN-01-memory-v2-master.md (Phase 2)
---

# Feature: Memory-Migration und Vault-RRF-Quick-Win

> **Feature ID:** FEAT-03-16
> **Epic:** [EPIC-03 Context, Memory & Scaling](../epics/EPIC-03-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 2
> **Priority:** P0-Critical
> **Effort:** M (1.5 Wochen)

## Feature Description

Migration der bestehenden 6 Memory-Markdown-Dateien (`user-profile.md`, `projects.md`, `patterns.md`, `soul.md`, `errors.md`, `custom-tools.md`) in das neue Fact-Schema. Differenzierte Behandlung pro Datei: `soul.md` -> `communication_styles`, `knowledge.md` skip (ist on-demand semantic search, nicht im System-Prompt), die anderen 5 -> Facts via Single-Call-Atomizer (LLM teilt Compound-Statements in atomare Facts und assigniert Topics + Importance). Plus Export-Tool "facts -> markdown" als Backup-Mechanismus.

Parallel: Hybrid `semantic_search`-Tool als Vault-Quick-Win. Heute reines Cosine, kuenftig RRF-Reranking ueber drei Signale (Cosine + FTS oder Trigram + Tag-Match + 1-Hop-Edge-Walk via implicit_edges). Wird zuerst als Vault-Tool ausgerollt, damit das RRF-Pattern hardened ist, bevor Memory-v2-Phase-3 es fuer ContextComposer nutzt.

Bestehende Session-Summaries in `memory.db.sessions` (DB-first seit ADR-60) werden **nicht** migriert, sondern bleiben als Sessions-Tabelle nutzbar. Episodes (ADR-18) und Recipes (ADR-58) bleiben unangetastet.

## Benefits Hypothesis

**We believe that** eine differenzierte Migration mit Single-Call-Atomizer (statt Atomize+Classify+Embed in 3 Calls) den Migrations-Aufwand reduziert, und dass der RRF-Quick-Win im Vault-Search die Recall-Quality unmittelbar messbar verbessert.

**Delivers the following measurable outcomes:**

- Migrations-LLM-Calls fuer 5 MD-Dateien: 1 pro Datei (statt 3 wie im Source-Doc)
- Vault-Search-Recall-Quality (manuelle Top-5-Bewertung): + 30% gegenueber reinem Cosine
- Migrations-Zeit (von "Start" bis "facts in DB"): < 2 Minuten fuer typische 4000-Char-Memory-Files

**We know we are successful when:**

- Sebastian sieht alle wichtigen Inhalte aus den 6 MD-Dateien als Facts in der DB (manueller Spot-Check)
- soul.md ist als `communication_styles`-Eintrag mit context_match='default' gelandet
- semantic_search liefert sichtbar bessere Treffer fuer "verwaschene" Queries (unscharfe Begriffe)
- Export-Tool produziert lesbare Markdown-Repraesentation der aktuellen Facts

## User Stories

### Story 1: Bestehende Memory wandert ohne Datenverlust mit (Functional Job)

**As a** Sebastian (existierender Vault Operator-User)
**I want to** dass meine seit Monaten kuratierten Memory-Inhalte in das neue System migriert werden
**so that** ich nicht alles neu erfassen muss

### Story 2: Vault-Search wird sichtbar besser (Functional Job)

**As a** Vault Operator-Nutzer
**I want to** dass `semantic_search` auch unscharfe Queries gut beantwortet
**so that** ich seltener manuell nachsuchen muss

### Story 3: Migration ist nachvollziehbar und reversibel (Emotional Job)

**As a** Sebastian (Power-User)
**I want to** Backup der alten MD-Dateien behalten und Facts als Markdown exportieren koennen
**so that** ich vertraue, dass nichts unwiederbringlich verloren geht

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Wichtige Inhalte aus den 6 MD-Dateien sind als Facts auffindbar | > 90% der wesentlichen Statements gemaess User-Review | Manueller Spot-Check Sebastian |
| SC-02 | Communication Style ist kontext-aware speicherbar | soul.md-Inhalt landet in styles-Tabelle mit Default-Match | Test: Read styles.getMatching({topics:['identity']}) |
| SC-03 | Vault-Search-Recall-Quality steigt | Top-5-Treffer fuer 10 Test-Queries: > 30% mehr relevante | Vergleichs-Eval gegen heutigen Stand |
| SC-04 | Migration ist transaktional, kein partial state | Bei Crash mid-migration: Rollback oder vollstaendige Wiederholung | Fault-Injection-Test |
| SC-05 | Export-Tool produziert lesbare Markdown-Repraesentation | Facts-Markdown ist menschlich lesbar, gruppiert nach Topic | UAT |

---

## Technical NFRs

### Performance

- **Migration-Dauer:** < 2 Minuten fuer typische 4000-Char-Memory-Inhalte (5 LLM-Calls plus Embeddings)
- **Vault-RRF-Search-Latenz:** < 200ms p95 fuer typische Query (heute pure Cosine ~50ms, RRF mit drei Signalen muss < 4x bleiben)
- **Export-Tool-Dauer:** < 1 Sekunde fuer 1000 Facts

### Security

- **Backup vor Migration:** alte MD-Dateien werden vor Loeschen nach `memory-v1-backup/{timestamp}/` kopiert
- **Migration-Approval:** User-Confirmation vor irreversiblem Cut-over (auch wenn ohne Review-UI)
- **Rollback-Pfad:** dokumentiert, manuell nutzbar (kein automatischer Rollback-Button noetig)

### Scalability

- **Migration-Skalierung:** linear bis ~100 KB Memory-Inhalt
- **RRF-Skalierung:** linear bis 50k Vault-Chunks im Index

### Availability

- **Migration-Resumability:** Wenn Plugin mid-migration crashed, Recovery in eindeutigen Zustand (Restart oder Continue)

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1:** Single-Call-Atomizer-Output muss strukturiert sein (Tool-Calling, nicht freier Markdown).

- **Why ASR:** Robust gegen LLM-Output-Varianten, validierbar gegen Schema
- **Impact:** beeinflusst Prompt-Design und Error-Handling
- **Quality Attribute:** Reliability

**MODERATE ASR #2:** RRF-Algorithmus wird als Engine-Public-Utility designt.

- **Why ASR:** Phase 3 (ContextComposer) und ggf. UCM nutzen denselben Helper
- **Impact:** Code-Organisation, API-Design
- **Quality Attribute:** Reusability

### Constraints

- LLM-Atomizer braucht konfigurierten memoryModelKey (haengt am EmbeddingService-Default aus FEAT-03-15)
- FTS-Anteil von RRF haengt von Spike-Entscheidung ab (Custom-WASM oder JS-Trigram)

### Open Questions for Architect

- Reihenfolge MD-Dateien-Migration: alphabetisch, prioritaets-basiert, parallel?
- RRF-Gewichtung der drei Signale: gleiche Weights oder per-Use-Case?
- Knowledge.md-Skip endgueltig oder reaktivierbar?

---

## Definition of Done

### Functional

- [ ] Migration-Job laeuft fuer 5 MD-Dateien (skip knowledge.md)
- [ ] soul.md -> communication_styles mit context_match='default'
- [ ] Single-Call-Atomizer mit strukturiertem Output (Fact-Candidates mit Topics + Importance)
- [ ] alte MD-Dateien werden nach `memory-v1-backup/{timestamp}/` verschoben
- [ ] Hybrid `semantic_search` mit RRF (Cosine + FTS-oder-Trigram + Tag-Match + 1-Hop-Edge-Walk)
- [ ] RRF-Helper als wiederverwendbarer Service
- [ ] Export-Tool: Markdown-Renderer fuer Facts gruppiert nach Topic
- [ ] Migration-Approval-UI (Notice oder Confirm-Modal)

### Quality

- [ ] Migrations-Eval-Set (Sebastian's eigene MD-Dateien als Test-Fixture, anonymisiert)
- [ ] RRF-Recall-Eval gegen 10 Test-Queries (> 30% Verbesserung)
- [ ] Fault-Injection-Test fuer Migration (Crash mid-step, Recovery)
- [ ] Export-Tool produziert valides Markdown (Roundtrip-Test)

### Documentation

- [ ] FEAT-03-16 Status: Implemented
- [ ] Backlog-Update
- [ ] Migration-Anleitung im User-Doc

---

## Dependencies

- **FEAT-03-15** (Engine-Foundation): Stores muessen existieren
- **FEAT-03-14** (Knowledge-DB-Haertung): URI-Konvention und embedding_model-Spalte muessen da sein

## Assumptions

- Sebastian's MD-Dateien-Inhalt ist groesstenteils atomar (wenig Compound-Statements)
- RRF-Performance-Aufschlag (3 Signale statt 1) ist akzeptabel

## Out of Scope

- Review-UI fuer staged Facts (Doc Phase 2 scope, hier descoped)
- Re-Migration nach LLM-Prompt-Tuning (manuell ausloesbar via gleiche Pipeline)
- Knowledge.md migrieren (skip, bleibt als Vault-Note)
