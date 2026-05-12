---
id: FEAT-03-21
title: Engine-Extract zu @obsilo/memory-engine
epic: EPIC-03-context-memory-scaling
priority: P0
effort: M
depends-on: [FEAT-03-20]
related:
  - PLAN-01-memory-v2-master.md (Phase 7)
  - BA-UNIFIED-CHAT-MEMORY-V2.md (UCM-Vorbedingung)
---

# Feature: Engine-Extract zu @obsilo/memory-engine

> **Feature ID:** FEAT-03-21
> **Epic:** [EPIC-03 Context, Memory & Scaling](../epics/EPIC-03-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 7
> **Priority:** P0-Critical (UCM-Foundation)
> **Effort:** M (1 Woche)

## Feature Description

Extraktion der seit Phase 1 designed Memory-Engine als wiederverwendbares Package `@obsilo/memory-engine`. Public-API frozen: FactStore, EdgeStore, StyleStore, HistoryStore, HistoryIndexer, SearchHistoryService, ContextComposer, FactExtractor, FactIntegrator, AgingService, PendingReviewService, **InferenceService** (FEAT-03-24: runInferencePass, findPatternCandidates), **VaultMemorySourceService** (FEAT-03-25: dirty-tracking + re-extract), UnifiedGraphService, EmbeddingService, RRF-Helper, UriResolver, AdapterRegistry, SourceAdapter-Interface, **MigrationService** (dumpAll, restoreAll, validateTarget, lockForMigration, recoverPendingMigration). Plus **User-Profile-View** (E9-Empfehlung): `factStore.getUserProfile()` als aggregierte View. Adapter-Interface fuer Knowledge-DB (Vault Operator-spezifisch, optional registrierbar). Konfig-Abstraktion: drei DB-Pfade (memory.db, knowledge.db [optional], history.db), Embedding-Provider, LLM-Provider, Source-Interface-Default-Name werden via Constructor injiziert.

**Engine-Hosting-Neutralitaet:** Engine kennt keinen Host. Sie laeuft identisch in Vault Operator-Plugin-Worker (Plugin-Renderer-Prozess, always-on via Cloudflare-Relay) und in Standalone-Worker (separater Node-Service-Prozess). Beide sind gleichwertige UCM-Worker, kein Fallback-Verhaeltnis. Gleiche Stores, gleiche API, gleiche MCP-Tools. Source-Interface-Tagging entscheidet ueber Provenance, Adapter-Registry entscheidet ueber Source-Resolution.

Vorbedingung fuer UCM-Bau (siehe BA-UNIFIED-CHAT-MEMORY-V2 Section 7.5). UCM-MVP startet fruehestens nach diesem Feature-Release plus 2 Wochen produktivem Use auf Sebastians Vault.

Vault Operator selbst importiert die Engine post-extract aus dem internen Package. Keine User-sichtbaren Aenderungen, aber Code-Organisation wird substantiell aufgeraeumt.

## Benefits Hypothesis

**We believe that** wenn die Engine-API seit Phase 1 UCM-getrieben designed wurde, der Extract-Schritt mechanisch ist (Package-Move, Dependency-Cleanup, Doku) und nicht zu einem Refactor-Marathon wird.

**Delivers the following measurable outcomes:**

- Extraction-Refactor-LOC: < 500 LOC (sonst ist die Engine-Foundation falsch)
- Test-Suite-Pass-Rate nach Extract: 100% (kein neuer Bug)
- Public-API-Anzahl: < 15 Public-Symbols (sonst overexposed)

**We know we are successful when:**

- Engine compiliert als standalone Package
- Vault Operator nutzt Engine via Package-Import, keine internen Pfade mehr
- Alle Tests gruen
- API-Doc dokumentiert jeden Public-Symbol
- UCM kann theoretisch importieren (wird im UCM-Repo verifiziert)

## User Stories

### Story 1: UCM kann auf der Engine bauen (Functional Job)

**As a** UCM-Builder (Sebastian)
**I want to** die Memory-Engine als npm-Package importieren
**so that** UCM nicht von Vault Operator's Plugin-Kontext abhaengt

### Story 2: Engine-API ist dokumentiert (Functional Job)

**As a** Engine-Konsument
**I want to** klare API-Doku mit Beispielen
**so that** ich Engine-Konfiguration ohne Source-Code-Lesen verstehe

### Story 3: Vault Operator wird durch Extract nicht instabiler (Emotional Job)

**As a** Vault Operator-Nutzer
**I want to** dass mein Memory-System nach dem Extract gleich funktioniert
**so that** der UCM-Foundation-Schritt fuer mich unsichtbar ist

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Engine ist als Package extrahierbar | npm pack laeuft, alle Tests gruen | CI |
| SC-02 | Vault Operator nutzt extrahierte Engine | keine internen Pfade auf src/core/memory/v2/* in Vault Operator-Code | grep |
| SC-03 | Engine hat dokumentierte Public-API | jeder Public-Symbol mit JSDoc + Beispiel | Lint |
| SC-04 | UCM kann theoretisch importieren | Smoke-Test in separatem Test-Projekt | Test |
| SC-05 | Memory-Verhalten bleibt unveraendert nach Extract | Eval-Test-Set wie vor Extract | Regression-Test |

---

## Technical NFRs

### Performance

- **Engine-Boot-Time:** < 100ms (DB-Open + Schema-Check)
- **Public-API-Aufrufe:** keine Performance-Regression vs. internem Aufruf

### Security

- **Constructor-Injection:** keine globalen Singletons in Engine
- **Adapter-Interface:** Knowledge-Adapter ist read-only fuer die Engine (kein Write-Through)

### Scalability

- **Multi-DB-Konfiguration:** Engine kann mit beliebigen DB-Pfaden konfiguriert werden (UCM-Native, UCM-Sidecar, Vault Operator)

### Availability

- **Backward-Compatibility:** Schema-Versionen bleiben respektiert, Migration auch in Engine-Standalone-Use moeglich

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** Public-API-Surface ist klein und stabil.

- **Why ASR:** Spaetere Aenderungen brechen UCM. Engine ist Library-Vertrag.
- **Impact:** API-Review, semver-Discipline
- **Quality Attribute:** Maintainability, Stability

**CRITICAL ASR #2:** Adapter-Interface fuer Knowledge-DB ist klar definiert und ohne Vault-Spezifika.

- **Why ASR:** UCM-Native braucht keinen Knowledge-Adapter, UCM-Mit-Vault Operator-Backend nutzt Vault Operators Adapter
- **Impact:** Interface-Definition, Adapter-Lifecycle
- **Quality Attribute:** Modularity

### Constraints

- Engine bleibt TypeScript, kein Build-System-Wechsel
- Engine soll auch ohne Obsidian-Plugin-Kontext laufen (Node + sql.js)

### Open Questions for Architect

- Package-Naming: `@obsilo/memory-engine` (privat npm) oder `@pssah4/memory-engine` (public)?
- Schema-Migration in Engine-Standalone: wer triggert sie (Engine-Init oder explicit)?
- API-Doc-Format: JSDoc + TypeDoc oder separate Markdown?
- Drei-DB-Konfig: braucht es eine `EngineDbConfig`-Struktur oder reichen drei String-Pfade?
- knowledge.db als optional registrierbarer Adapter: wie laeuft Engine ohne, wenn Konsumenten-Code knowledge-Hops anfragt? (No-Op-Adapter vs. error)

---

## Definition of Done

### Functional

- [ ] Package-Verzeichnis-Struktur (src/, tests/, package.json)
- [ ] Public-API-Exports (Index-Datei) frozen
- [ ] Adapter-Interface fuer Knowledge-DB
- [ ] Konfig-Abstraktion (DB-Pfad, Embedding-Provider, LLM-Provider, Source-Interface)
- [ ] Vault Operator-Code-Refactor: nutzt Engine als Package
- [ ] Smoke-Test in separatem Test-Projekt

### Quality

- [ ] Alle bestehenden Tests gruen nach Extract
- [ ] Eval-Test-Set zeigt keine Regression
- [ ] API-Doc mit Beispielen
- [ ] Coverage > 85% in Engine-Package
- [ ] **MemoryBench-Adapter** ([github.com/supermemoryai/memorybench](https://github.com/supermemoryai/memorybench), MIT) als Engine-Public-Artefakt: Provider-Adapter-Implementierung, Pre-Release-Eval gegen LoCoMo + LongMemEval + ConvoMem als Quality-Gate (Ziel > 70% LongMemEval, > 65% LoCoMo). Score wird nur public veroeffentlicht wenn Quality-Gate erreicht.

### Documentation

- [ ] FEAT-03-21 Status: Implemented
- [ ] API-Reference im Engine-Package
- [ ] Migration-Guide: wie bauen andere Hosts auf der Engine
- [ ] BA-UNIFIED-CHAT-MEMORY-V2 Update: Vorbedingung erfuellt, UCM-Bau kann starten

---

## Dependencies

- **FEAT-03-20** (History Search): letzte v2-Funktionalitaet, danach ist API stabil
- **2 Wochen produktiver Use auf Sebastians Vault** zwischen Phase 6 und 7 (Source-Doc R6-Mitigation)

## Assumptions

- Engine-API hat sich seit Phase 1 nicht stark veraendert (UCM-getrieben designed)
- Sebastian hat 2 Wochen produktiven Use ohne Major-Bugs nach Phase 6 erlebt

## Out of Scope

- UCM-Bau selbst (separates Repo, eigenes Projekt)
- Engine-Public-Release als Open-Source (interne Nutzung first)
- Multi-Tenancy-Features (UCM behandelt das auf seiner Schicht)
