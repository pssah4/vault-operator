---
id: FEAT-03-17
title: Dynamic Context Composition
epic: EPIC-03-context-memory-scaling
priority: P0
effort: M
depends-on: [FEAT-03-16]
related:
  - PLAN-01-memory-v2-master.md (Phase 3)
  - ADR-78-uri-versioning-schema.md
---

# Feature: Dynamic Context Composition

> **Feature ID:** FEAT-03-17
> **Epic:** [EPIC-03 Context, Memory & Scaling](../epics/EPIC-03-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 3
> **Priority:** P0-Critical
> **Effort:** M (1 Woche)

## Feature Description

Cut-over auf v2-Retrieval. System-Prompt wird nicht mehr aus den 6 MD-Dateien gebaut, sondern dynamisch aus dem Fact-Store. ContextComposer setzt einen **Soft-Topic-Lock** pro Conversation (Topic-Inference einmal beim Conversation-Start, periodisch revalidated bei jedem User-Turn via Cosine-Schwelle 0.6), nutzt lokale Embedding-basierte Topic-Inference gegen `known_topics`-Centroids (sub-50ms, kein LLM-Call), greift auf RRF-Hybrid-Retrieval zurueck (vorbereitet in FEAT-03-16), und liefert URI-typed `RecallHit[]`. Cold-Start-Fallback fuer User mit wenigen Facts (Topic-Inference unzuverlaessig) -> letzte N Facts unabhaengig vom Topic.

**Topic-Drift-Detection (mid-conversation):** Bei jedem User-Turn wird das Embedding der neuen User-Message gegen den aktuellen Topic-Lock cosinen. Wenn Cosine < 0.6, Topic-Lock soft-invalidiert, neu inferiert, Topical-Memory-Block fuer naechsten Turn refresh. Cache-Implikation: Topical-Block-Cache wird einmal gebrochen (akzeptabel, weil Drift-Event selten). Drift-Signal wird zudem an FactExtractor (FEAT-03-18) propagiert, damit ein zusaetzlicher Re-Extract-Job in die ExtractionQueue gelangen kann.

`recall_memory`-Tool wird Agent-facing als Public-Tool ergaenzt (Cold-Memory-Suche und optional `multiHop` ueber `fact_edges`). UnifiedGraphService wird als duenner Wrapper-Layer um die ATTACH-DATABASE-Konfiguration und SQL-Templates implementiert plus die **Source-Adapter-Registry** (siehe ADR-78): jede Resolution durchlaeuft die Registry, jede URI mit registriertem Adapter wird aufgeloest, ohne registrierten Adapter bleibt sie Reference-Token (Hybrid-Retrieval-Treffer mit URI ohne resolved Inhalt).

**KnowledgeGraphAdapter mit zwei Implementierungen** (Setup-abhaengig):

- **LocalKnowledgeAdapter** (Setup A/B, oder Plugin als Persistenz-Service in Setup C): direkter ATTACH-CTE-Walk auf knowledge.db, sub-50ms-Latenz
- **McpKnowledgeAdapter** (Standalone-Service als Persistenz-Service in Setup C): RPC zur Plugin-MCP-URL, ruft Tools `semantic_search`, `get_vault_implicit_edges`, `get_vault_note_metadata`. Plus LAN-RTT-Aufschlag (~20-50ms), bleibt akzeptabel.

UnifiedGraphService kennt nur das Adapter-Interface, nicht ob lokal oder remote. Engine-Code identisch ueber alle Setup-Klassen.

Standard-Adapter werden in dieser Phase registriert: LocalKnowledgeAdapter ODER McpKnowledgeAdapter (vault://, je nach Setup), LocalFileAdapter (file://, read-only ohne watch), WebUrlAdapter (https://, fetch-on-demand). CloudAdapter ist Stub.

**Plugin-MCP bekommt zwei zusaetzliche Tools** in dieser Phase (heute fehlend): `get_vault_implicit_edges(notePath)` und `get_vault_note_metadata(notePath)`. `semantic_search` existiert bereits (FEAT-03-01).

**Stale-Edge-Lazy-Detection:** Resolution-Failure (z.B. file:// existiert nicht mehr, https:// 404, vault:// trotz Cascade leer) markiert die betroffene Edge als `stale: true` in metadata, aber loescht sie nicht. Hybrid-Retrieval respektiert den Stale-Flag (deprioritized).

Cut-over via Config-Flag `memory.engineVersion: 'v1' | 'v2'`. Default startet auf v1, Sebastian flippt manuell. Beide Pfade koexistieren waehrend der Phase, dann wird v1 in einer spaeteren Aufraeum-Welle entfernt.

## Benefits Hypothesis

**We believe that** dynamische Komposition mit lokaler Topic-Inference und KV-Cache-aware Layout den Conversation-Start beschleunigt UND die Cost senkt, gleichzeitig.

**Delivers the following measurable outcomes:**

- Time-to-first-Token (TTFT) bei Conversation-Start: reduziert um 30-50% gegenueber heute (kein LLM-Topic-Call)
- Cache-Hit-Rate fuer System-Prompt: > 60% nach 1 Woche Use (heute geschaetzt < 20%)
- Memory-Block-Token-Verbrauch pro Conversation: -30% gegenueber heute (adaptive statt fixed Token-Budget)

**We know we are successful when:**

- ContextComposer rendert Memory-Block ohne LLM-Call beim Conversation-Start
- Topic-Lock pro Conversation funktioniert (zweite User-Message triggert keine neue Inference)
- Retrieval-p95 < 200ms beim Conversation-Start
- recall_memory Tool gibt URI-typed Hits zurueck mit Edge-Context

## User Stories

### Story 1: Conversation startet schnell mit relevantem Kontext (Functional Job)

**As a** Obsilo-Nutzer
**I want to** dass das Plugin in unter einer Sekunde anfaengt zu antworten
**so that** sich Conversations natuerlich anfuehlen

### Story 2: Memory passt sich an das Gespraechsthema an (Functional Job)

**As a** Obsilo-Nutzer
**I want to** dass bei einer Coding-Frage Coding-Wissen verfuegbar ist und nicht persoenliches
**so that** Token-Budget und Aufmerksamkeit auf das Relevante gerichtet sind

### Story 3: Agent kann gezielt erinnern (Functional Job)

**As a** Agent
**I want to** explizit nach selten genutzten Facts suchen koennen
**so that** ich auch Faelle abdecke, die nicht im Hot-Memory-Block stehen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Conversation-Start fuehlt sich schneller an | TTFT < 800ms p95 (heute geschaetzt 1500ms+) | Telemetrie + UAT |
| SC-02 | Memory passt sich Thema an | bei "Coding"-Conversation: > 70% der Topical-Facts haben coding-bezogene Topics | Eval-Test mit fixen Conversations |
| SC-03 | Cold-Memory-Tool liefert auf Anfrage relevantes | `recall_memory` Top-3 enthaelt Ziel-Fact in 80% der Test-Queries | Eval-Test |
| SC-04 | Cache bleibt warm | Anthropic Cache-Hit-Rate > 60% | Anthropic Response cache_read_tokens / total_input |
| SC-05 | Cold-Start funktioniert | User mit < 5 Facts: kein Crash, sinnvoller Fallback | UAT mit frischem Vault |

---

## Technical NFRs

### Performance

- **Conversation-Start (Topic-Inference + Composition + Render):** < 200ms p95
- **recall_memory Tool-Call (single-hop):** < 100ms p95
- **recall_memory Tool-Call (multiHop=true, depth=2):** < 500ms p95
- **Token-Estimation der gerenderten Markdown:** Abweichung < 10% gegenueber realen Anthropic-Counts

### Security

- **URI-Validation:** kein User-Input wird direkt als URI geparst, nur Strings aus DB
- **Cold-Memory-Bleed:** deprecated Facts erscheinen nicht im Default-Retrieval

### Scalability

- **Topic-Inference:** sub-linear bis 1000 Topics (Top-K Cosine, nicht Full-Scan)
- **RRF-Retrieval:** linear bis 100k Facts

### Availability

- **Engine-Version-Switch:** flag-controlled, beide Pfade koexistieren, kein Datenverlust beim Switch

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** ATTACH DATABASE Pattern muss in einer einzigen sql.js-Instanz funktionieren.

- **Why ASR:** UnifiedGraphService haengt davon ab. Falls ATTACH versagt, JS-BFS-Fallback noetig.
- **Impact:** Phase-0-Spike-Ergebnis bestimmt Implementation-Pfad
- **Quality Attribute:** Performance, Maintainability

**CRITICAL ASR #2:** Topic-Inference darf KEINEN LLM-Call beim Conversation-Start machen.

- **Why ASR:** Sonst Latenz-Selbstmord (~500-1500ms TTFT)
- **Impact:** Centroid-Caching, Cold-Start-Fallback
- **Quality Attribute:** Performance, User Experience

**MODERATE ASR #4:** Topic-Lock ist Soft, nicht Hard. Pro User-Turn wird er gegen die User-Message-Embedding revalidated.

- **Why ASR:** Topic-Wechsel mid-conversation darf nicht zu veralteter Topical-Memory fuehren
- **Impact:** Composer-Logic + Drift-Signal-Hook zu FactExtractor
- **Quality Attribute:** Functional Correctness, User Experience

**MODERATE ASR #5:** UnifiedGraphService nutzt SourceAdapter-Registry aus FEAT-03-15.

- **Why ASR:** Hybrid-Retrieval muss mit beliebigen URI-Schemata umgehen, nicht nur vault://
- **Impact:** Resolution-Schritt geht durch Registry, kein Adapter -> Reference-Token (kein Crash)
- **Quality Attribute:** Extensibility

**MODERATE ASR #3:** ContextComposer-Output ist deterministisch fuer gleiche Inputs.

- **Why ASR:** Cache-Hit-Rate haengt davon ab
- **Impact:** Sortier-Stabilitaet, Tie-Breaker-Logik
- **Quality Attribute:** Performance

### Constraints

- ATTACH DATABASE-Funktionalitaet von sql.js wird in Phase 0 verifiziert
- Cold-Start-Fallback braucht Schwelle (z.B. < 5 Facts pro Topic)

### Open Questions for Architect

- ContextComposer: Markdown-Rendering inline oder Template-File?
- Topic-Lock-Reset: bei welchen Triggern wird er neu evaluiert (Conversation-Restart, manueller Trigger)?
- recall_memory-Multihop-Default: depth=1 oder depth=2?

---

## Definition of Done

### Functional

- [ ] ContextComposer mit Soft-Topic-Lock (Cosine-Schwelle 0.6 fuer Drift-Detection)
- [ ] Lokale Topic-Inference via Centroids
- [ ] Cold-Start-Fallback (recent Facts unabhaengig vom Topic)
- [ ] Topic-Drift-Hook: Signal an FactExtractor (FEAT-03-18), wenn Drift detected
- [ ] UnifiedGraphService mit ATTACH-Konfiguration und SQL-Templates
- [ ] **SourceAdapter-Registry-Nutzung** in Resolution-Pfad
- [ ] **KnowledgeGraphAdapter zweistufig:** LocalKnowledgeAdapter (ATTACH-basiert) und McpKnowledgeAdapter (RPC zu Plugin-MCP). UnifiedGraphService nutzt sie austauschbar via Adapter-Interface.
- [ ] **Plugin-MCP-Erweiterung:** zwei neue Tools `get_vault_implicit_edges(notePath)` und `get_vault_note_metadata(notePath)` exposed. `semantic_search` bleibt unveraendert.
- [ ] **Standard-Adapter registriert** je Setup-Klasse: LocalKnowledgeAdapter (A/B, Plugin als Service in C) ODER McpKnowledgeAdapter (Standalone als Service in C), LocalFileAdapter (file://, read-only), WebUrlAdapter (https://, fetch-on-demand). CloudAdapter als Stub.
- [ ] **Stale-Edge-Lazy-Detection:** Resolution-Failure markiert Edge als stale in metadata
- [ ] recall_memory-Tool mit URI-typed RecallHit[] und multiHop-Option
- [ ] Config-Flag `memory.engineVersion`, AgentTask-Integration
- [ ] Engine-Public-API: ContextComposer, RecallHit, UnifiedGraphService, AdapterRegistry-Interface
- [ ] **Telemetrie-Logs** (C4-Beschluss 2026-04-26): Cache-Hit-Rate (aus Anthropic-Response cache_read_tokens), Retrieval-p95-Latenz, Topic-Inference-Drift-Events nach `_devprocess/logs/memory-v2/{YYYY-MM-DD}.jsonl`. Read-Pfad ueber existierenden `read_agent_logs`-Tool, Agent kann Sebastian Fragen beantworten
- [ ] **Context-aware Reranker-Pass nach RRF** (E7): Zweiter Reranker-Step nach RRF-Score, Boost-Faktoren: +0.2 wenn Topic in aktuellem Topic-Lock, +0.1 wenn `last_used_at < 7 Tage`, +0.1 wenn `kind=identity` (immer relevant), -0.1 wenn `kind=event` und age > 30 Tage. Konsistent mit Supermemory's Context-aware Reranking.
- [ ] **User-Profile-View als Engine-Public-Method** (E9): `factStore.getUserProfile()` returns aggregierte View `{identity[], preferences[], patterns[], communication_style, stats: {conversations, topics, last_active}}`. Wird von Onboarding (FEAT-03-23) und ContextComposer (Hot-Memory-Block) genutzt. Kein eigener Storage, nur Query-Pattern.

### Quality

- [ ] Eval-Test-Set fuer Topic-Inference und RRF-Retrieval
- [ ] Performance-Test: Conversation-Start < 200ms
- [ ] Cache-Hit-Rate-Test: nach Reorder kein Cache-Bust pro Turn
- [ ] Coverage > 85%

### Documentation

- [ ] FEAT-03-17 Status: Implemented
- [ ] User-Doku: Engine-Version-Switch erklaerung

---

## Dependencies

- **FEAT-03-16** (Migration + RRF): RRF-Helper muss verfuegbar sein, Facts muessen in DB liegen
- **ADR-78** (URI-Versioning): URIs muessen einheitlich sein

## Assumptions

- ATTACH DATABASE in sql.js funktioniert (verifiziert in Phase-0-Spike)
- Topic-Centroids sind fuer Sebastians Datenmenge stabil

## Out of Scope

- Single-Call-Extraction in den Update-Pfad (separates FEAT-03-18)
- Cross-Interface-Threads (separates FEAT-03-19)
