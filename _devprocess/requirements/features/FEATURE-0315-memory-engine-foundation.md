---
id: FEATURE-0315
title: Memory-Engine-Foundation
epic: EPIC-003-context-memory-scaling
phase: Building
status: Planned
priority: P0
effort: L
depends-on: [FEATURE-0314, ADR-077, ADR-076]
related:
  - PLAN-001-memory-v2-master.md (Phase 1)
  - ADR-077-memory-v2-storage-schema.md
  - ADR-076-episode-fact-boundary.md
---

# Feature: Memory-Engine-Foundation

> **Feature ID:** FEATURE-0315
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 1
> **Priority:** P0-Critical
> **Effort:** L (2 Wochen)

## Feature Description

Aufbau der Engine-Foundation als additives Schema neben den bestehenden Tabellen in `memory.db` (sessions, episodes, recipes, patterns). Schaffung der drei Kern-Stores (FactStore, EdgeStore, StyleStore) mit Constructor-Injection, des gemeinsamen EmbeddingService, und Code-Implementierung des KV-Cache-Layouts (ADR-062, bisher nur architektonisch beschrieben). Public API wird ab dem ersten Tag UCM-getrieben designt: `source_interface`-Spalte im Fact-Schema, Adapter-Pattern fuer alle externen Abhaengigkeiten, Konfig-Abstraktion fuer DB-Pfad/Embedding/LLM.

**Source-Adapter-Registry als Engine-Public-API:** Engine exportiert `SourceAdapter`-Interface und `AdapterRegistry`-Service. Hosts (Obsilo, UCM, andere) registrieren Adapter pro URI-Schema (`vault://`, `file://`, `https://`, `cloud://`, beliebig custom). Engine selbst nutzt nur das Interface, kennt keine konkreten Schemata ausser ihren eigenen (`fact:`, `session://`, `episode://`, `entity://`, `thread://`). Ohne registrierten Adapter bleibt ein URI ein Reference-Token, das in Hybrid-Retrieval und fact_edges trotzdem funktioniert (Resolution liefert null, Edge bleibt aussagekraeftig). Siehe ADR-078.

Heute funktioniert Memory broken-by-default (`memoryModelKey` ist leer, `getMemoryModel()` returnt null). Die neue Foundation muss Smart-Defaulting oder klares Onboarding bieten, sonst bleibt Memory v2 fuer neue Users unsichtbar.

Keine User-sichtbaren Aenderungen in dieser Phase. Alte Memory-Pipeline laeuft parallel weiter, das v2-System ist nur intern verfuegbar (Engine-API call-bar, aber noch nicht im Conversation-Flow eingehaengt).

## Benefits Hypothesis

**We believe that** ein additives Schema mit klaren Stores und Constructor-Injection die spaetere Engine-Extraktion (Phase 7) zu einem mechanischen Schritt macht, statt zu einem Refactor.

**Delivers the following measurable outcomes:**

- Engine-Coupling zu Obsidian-spezifischem Code: 0 Imports von `obsidian` in den Store-Klassen
- Test-Coverage neuer Stores: > 90%
- KV-Cache-Hit-Rate-Vorbereitung: Memory-Block-Position im System-Prompt ist stabil identifizierbar (Cache-Breakpoint setzbar)

**We know we are successful when:**

- Alle drei Stores haben Unit-Tests mit Mock-DB-Layer
- `source_interface`-Spalte existiert und wird beim Insert gesetzt
- `fact_embeddings`-Tabelle ist getrennt von facts (Read ohne Embedding-Aufschlag)
- ADR-062-Layout ist im SystemPromptBuilder umgesetzt und in Tests verifiziert (DateTime nicht mehr in Cache-Prefix)

## User Stories

### Story 1: Engine-Foundation ist UCM-bereit (Functional Job)

**As a** UCM-Builder (Sebastian, spaeter)
**I want to** die Engine-Stores ohne Obsilo-Spezifika benutzen koennen
**so that** UCM die Engine als Library importieren kann ohne Obsidian-Plugin-Kontext

### Story 2: Memory funktioniert ohne Settings-Konfiguration (Functional Job)

**As a** Erst-Nutzer von Obsilo
**I want to** dass Memory v2 out-of-the-box funktioniert oder mich klar onboarded
**so that** ich nicht eine versteckte Settings-Variable suchen muss

### Story 3: Cache bleibt warm (Emotional Job)

**As a** taeglicher Nutzer von Obsilo
**I want to** dass meine Conversations schnell starten ohne Memory-Cost-Aufschlag
**so that** das Plugin sich nicht traege anfuehlt

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Stores funktionieren ohne Plugin-Kontext | Test-Suite laeuft mit Mock-DB | Vitest-Run |
| SC-02 | Speicherung neuer Wissens-Statements liefert Provenance-Tag | 100% der Inserts haben source-Markierung | Code-Review + Test |
| SC-03 | Memory-Block invalidiert nicht den Conversation-Cache | Cache-Hit-Rate > 60% nach 1 Woche Use | Telemetrie aus Anthropic-Response |
| SC-04 | Memory funktioniert out-of-the-box oder leitet User durch Setup | Erst-User braucht 0 versteckte Settings-Aenderungen | UAT mit frischem Vault |
| SC-05 | Lese-Anfragen ohne Embedding-Bedarf laden keine Embeddings | Embedding-Bytes nur in Cosine-Queries gelesen | Performance-Profile |

---

## Technical NFRs

### Performance

- **Insert-Latenz:** < 100ms pro Fact (inklusive Embedding-Generation, ohne LLM-Call)
- **Read-Latenz:** < 10ms pro Fact ohne Embedding, < 50ms mit Embedding
- **Schema-Migration:** < 5 Sekunden additive Tabellen-Erstellung

### Security

- **Provenance-Pflicht:** source_interface ist NOT NULL, default 'obsilo'
- **JSON-Validation:** topics und metadata werden in JS validiert (sql.js ohne JSON1)
- **Audit-Trail:** alle state-changing Operations (insert, supersede, deprecate) werden geloggt

### Scalability

- **Fact-Volumen:** Schema bleibt linear bis 100k Facts (mit Indizes)
- **Embedding-Storage:** ~3KB pro Fact (Float32Array, 768-dim), 10k Facts = ~30MB

### Availability

- **Schema-Migration:** Idempotent, Re-Run sicher
- **Stale-Embedding-Tolerance:** Cosine-Search filtert auf aktuelles Modell, alte Embeddings koexistieren

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** Stores muessen Constructor-Injection nutzen, keine Singletons oder globalen Plugin-Verweise.

- **Why ASR:** Engine-Extract (Phase 7) wird sonst zu massivem Refactor
- **Impact:** Beeinflusst Coding-Style aller Memory-v2-Module
- **Quality Attribute:** Modularity, Reusability

**CRITICAL ASR #2:** ADR-062 KV-Cache-Layout muss VOR der dynamischen Composition (Phase 3) stehen.

- **Why ASR:** Sonst kostet jeder Memory-Block 500-1000 ungecachte Tokens pro Turn
- **Impact:** SystemPromptBuilder-Refactor, Test-Validation der Cache-Position
- **Quality Attribute:** Performance, Cost

**MODERATE ASR #3:** EmbeddingService kapselt alle Embedding-Calls (Vault, Facts, Sessions).

- **Why ASR:** Heute drei separate Pfade, leicht unterschiedlich, drift-anfaellig
- **Impact:** Refactor von KnowledgeIndexService und MemoryRetriever
- **Quality Attribute:** Maintainability, Consistency

### Constraints

- sql.js ohne FTS5/JSON1 Standard-Build (Custom-WASM-Build erst nach Phase-0-Spike)
- Plugin-Bundle-Size: keine zusaetzlichen Heavy-Deps
- Schema additiv, keine Migration der bestehenden Tabellen

### Open Questions for Architect

- Embedding-Modell-Default: Smart-Default fuer neue User oder Onboarding-Pflicht?
- FactStore-Public-API: synchron oder asynchron? (Test-Implikation)
- Topic-Centroid-Refresh-Strategie: bei jedem Insert, periodisch, oder lazy?

---

## Definition of Done

### Functional

- [ ] Schema-Migration (facts, fact_embeddings, fact_edges, communication_styles, conversation_threads, thread_sessions, known_topics, memory_audit) additiv ausgefuehrt
- [ ] FactStore mit CRUD + lifecycle-Operations (confirm, supersede, deprecate, recordUsage)
- [ ] EdgeStore mit URI-fact und URI-external-Edge-Support
- [ ] CommunicationStyleStore mit Context-Match-Lookup
- [ ] EmbeddingService gemeinsam fuer alle Embedding-Operationen
- [ ] ADR-062-Layout im SystemPromptBuilder (DateTime aus Cache-Prefix, stable Identity-Block)
- [ ] Audit-Logging fuer state-changing Operations
- [ ] **SourceAdapter-Interface** und **AdapterRegistry-Service** in Engine-Public-API exportiert
- [ ] **UriResolver**-Service kennt Standard-Schemata (vault://, file://, https://, cloud://, fact:, session://, episode://, entity://, thread://), unbekannte werden als Reference-Token behandelt (kein Crash)
- [ ] **`kind`-Spalte in facts** (E2): Werte `fact | preference | identity | event`, Default `fact`. Aging-Konstanten differenziert pro Kind (siehe FEATURE-0318).
- [ ] **`is_latest`-Boolean-Spalte in facts** (E4): Default 1, Trigger setzt 0 bei supersede. Indexed fuer schnellen Default-Filter `WHERE is_latest=1 AND deprecated_at IS NULL`.
- [ ] **`source_uri`-Spalte in facts** (E10/FEATURE-0325): URI der Quelle (z.B. `vault://Notes/X.md`), NULL fuer Conversation-Source-Facts.

### Quality

- [ ] Coverage > 90% fuer FactStore, EdgeStore, StyleStore
- [ ] Performance-Test: Insert < 100ms, Read < 10ms ohne Embedding
- [ ] Schema-Migration idempotent verifiziert
- [ ] Cache-Position-Test: Memory-Block ist Cache-Breakpoint-faehig

### Documentation

- [ ] FEATURE-0315 als Implemented markieren mit Source-Files
- [ ] ADR-076 und ADR-077 auf Accepted
- [ ] Backlog-Update mit Status, Commit-SHAs

---

## Dependencies

- **FEATURE-0314** (Knowledge-DB-Haertung): Pre-condition fuer ATTACH-DATABASE-Pattern, embedding_model-Spalte
- **ADR-076** (Episode-Fact-Boundary): klaert Verhaeltnis zu bestehenden episodes/recipes-Tabellen
- **ADR-077** (Storage-Schema): definiert Schema-Detail
- **ADR-062** (KV-Cache-Layout, alter ADR): muss zuerst implementiert werden

## Assumptions

- sql.js Performance reicht fuer < 100k Facts (Sebastians Zielgroesse < 10k)
- Constructor-Injection-Style ist der Codebase nicht fremd

## Out of Scope

- Migration der 6 MD-Dateien (separates FEATURE-0316)
- Dynamische Context-Composition (separates FEATURE-0317)
- Fact-Extraction aus Conversations (separates FEATURE-0318)
