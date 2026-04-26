---
id: FEATURE-0320
title: History Search ueber alle Konversationen
epic: EPIC-003-context-memory-scaling
phase: Building
status: Planned
priority: P1
effort: M
depends-on: [FEATURE-0319]
related:
  - PLAN-001-memory-v2-master.md (Phase 6)
---

# Feature: History Search ueber alle Konversationen

> **Feature ID:** FEATURE-0320
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 6
> **Priority:** P1-High
> **Effort:** M (1 Woche)

## Feature Description

Volltext- und Semantic-Search ueber alle Conversations, unabhaengig von memory-eligibility. Damit findet der User auch Konversationen wieder, die er nicht explizit gespeichert hat.

**Storage in dedizierter `history.db` als Engine-Public-DB** (statt `knowledge.db.history_chunks`-Tabelle), damit UCM die Engine portable wiederverwenden kann ohne knowledge.db. Drei Engine-DBs ab dieser Phase: `memory.db`, `knowledge.db` (Obsilo-spezifisch, optional ueber Adapter), `history.db` (Engine-Public). Schema: `history_chunks` mit URI-konformen Identifiern (`session://{source}/{id}#message-{i}#chunk-{j}`) und `source_interface`-Spalte (analog facts).

**Drei Engine-Public-Komponenten:** HistoryStore (CRUD), HistoryIndexer (Backfill + inkrementell), SearchHistoryService (Tool-Backend). Constructor-Injection, kein Plugin-Kontext. Conversation-Ingestion via abstrakter `Conversation`-Struktur, nicht via Datei-Pfad. Damit kann UCM Conversations aus beliebigen Sources (Claude Desktop, Claude Code, ChatGPT, OpenClaw) per MCP einreichen, Obsilo liest aus seinem `history/`-Verzeichnis und ruft die gleiche API.

**UI-Sidebar mit Tab-Strategie:** Zwei Tabs, beide immer aktiv:

- **"Obsidian"-Tab:** Conversations, die in Obsilo selbst (Sidebar-Chat) gefuehrt wurden -- `source_interface = 'obsilo'`.
- **"Global"-Tab:** Alle Cross-Source-Conversations, die durch den Plugin-Worker oder einen registrierten externen Worker geflossen sind (claude-desktop, claude-code, chatgpt-dev-mcp, ...). Tab ist auch ohne externen Standalone-Worker aktiv, weil Obsilo-Plugin selbst der UCM-Worker ist und alle Cross-Source-Conversations bereits sammelt. Bei zusaetzlich konfiguriertem externen Worker werden dessen Source-Interfaces ebenfalls hier sichtbar (Live-Fetch oder lokaler Twin).

Filter pro Tab: Source-Interface, Date-Range, Thread-ID, memory-eligible-only.

**Inline-Search in Chat-Sicht:** Jede Chat-View bekommt zusaetzlich ein Suchfeld neben dem File-Filter. Damit kann der Nutzer direkt aus dem laufenden Chat in der Vector-DB nach vergangenen Chats suchen, ohne in die History-Sidebar wechseln zu muessen. Treffer als Inline-Cards (Click = Open in History-Sidebar oder Continuation).

`search_history`-Tool als Agent-facing API mit `include: 'obsidian' | 'global' | 'both'`-Parameter (Default `'both'`). Volltextsuche + optionale Filter. Treffer mit Preview, Click oeffnet readonly-Anzeige oder als Continuation. HistoryIndexer mit incrementellem + abortable backfill, sodass bestehende Conversations nachgezogen werden ohne Plugin-Block.

## Benefits Hypothesis

**We believe that** durchsuchbare History den Memory-Coverage-Druck senkt: User muss nicht jede potentiell wertvolle Conversation als memory-eligible markieren, weil Search sie wiederfindet.

**Delivers the following measurable outcomes:**

- Search-Recall fuer "ich weiss dass ich das schon mal besprochen habe": > 70% Hit-Rate in Eval-Test
- Initial-Backfill-Performance: < 1 Sekunde pro Conversation, abortable
- search_history Tool-Latenz: < 300ms p95

**We know we are successful when:**

- Sebastian findet eine 6 Monate alte Conversation per Search ohne sie vorher gespeichert zu haben
- Backfill blockiert nicht das Plugin-UI
- search_history Tool wird vom Agent in passenden Faellen genutzt (System-Prompt-Hint)

## User Stories

### Story 1: Conversations wiederfinden ohne Vorab-Markierung (Functional Job)

**As a** Obsilo-Nutzer
**I want to** in alten Konversationen suchen, auch wenn ich sie nicht gespeichert hatte
**so that** ich nicht alles bewusst tracken muss

### Story 2: Continuation einer alten Conversation (Emotional Job)

**As a** Obsilo-Nutzer
**I want to** eine alte Conversation als Ausgangspunkt fuer eine neue nutzen
**so that** Kontext nicht verloren geht

### Story 3: Initial-Backfill stoert nicht (Functional Job)

**As a** Obsilo-Nutzer beim Update
**I want to** dass das Indexieren der bestehenden Conversations im Hintergrund laeuft
**so that** das Plugin sofort weiternutzbar ist

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Search findet relevante Conversations | > 70% Hit-Rate in 10 Test-Queries | Eval |
| SC-02 | Backfill blockiert nicht | UI bleibt responsive | UAT |
| SC-03 | Backfill ist abbrechbar und wiederaufnehmbar | abort-flag, resume-from-checkpoint | Test |
| SC-04 | Inkrementelle Indexing folgt sofort | Neue Message ist innerhalb 5 Sekunden suchbar | Test |
| SC-05 | Filter funktionieren | memoryEligibleOnly, threadId, since: alle isolierbar | Test |
| SC-06 | Inline-Search in Chat-View funktioniert | Suchfeld neben File-Filter, sub-300ms-Treffer | UAT + Test |
| SC-07 | Global-Tab ist auch ohne externen Worker aktiv | Plugin-Worker-Conversations sind im Global-Tab sichtbar | UAT |

---

## Technical NFRs

### Performance

- **Backfill-Performance:** < 1 Sekunde pro Conversation
- **search_history-Latenz:** < 300ms p95 fuer Top-5-Treffer
- **Inkrementelles Indexing:** < 100ms pro neue Message (asynchron)
- **DB-Wachstum:** < 50% Aufschlag auf knowledge.db (geschaetzt 100MB extra fuer Sebastian)

### Security

- **PII-Awareness:** Search-Treffer respektieren bestehende Ignore-Patterns
- **Tool-Output-Limit:** maximal Top-K Treffer (default K=5), kein Full-Dump

### Scalability

- **Linear bis 10k Conversations** (Sebastian-Skalierung)
- **Chunk-Granularitaet:** message-level (nicht conversation-level), erhaelt Suchpraezision

### Availability

- **Index-Konsistenz:** crash-safe, abortable, resumable
- **Schema-Migration:** additive Tabelle in knowledge.db

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** HistoryStore in dedizierter `history.db` (nicht in knowledge.db) als Engine-Public-API.

- **Why ASR:** UCM-Native braucht keine knowledge.db, history-Search muss UCM-portable sein
- **Impact:** Drei Engine-DBs (memory.db, knowledge.db, history.db), Multi-File-Atomic-Commit traegt drei Files
- **Quality Attribute:** Modularity, UCM-Reuse

**MODERATE ASR #2:** history_chunks-Tabelle nutzt URI-Konvention `session://{source}/{id}#message-{i}#chunk-{j}` mit optionalem source-Praefix.

- **Why ASR:** Cross-Source-Disambiguierung in UCM-Modus, kompatibel mit Solo-Obsilo (source-Praefix entfaellt oder ist `obsilo`)
- **Impact:** URI-Resolver-Erweiterung, Migration der bestehenden Session-IDs
- **Quality Attribute:** Maintainability

**MODERATE ASR #3:** Backfill-Worker laeuft entkoppelt vom Conversation-Lifecycle.

- **Why ASR:** Sonst blockiert ein langer Backfill den Plugin-Start
- **Impact:** WebWorker oder requestIdleCallback-Pattern
- **Quality Attribute:** Performance, Availability

**MODERATE ASR #4:** UI-Tab-Strategie traegt zwei immer-aktive Tabs ("Obsidian" + "Global"), nicht Modus-abhaengig.

- **Why ASR:** Plugin-Worker ist selbst UCM-Worker, sammelt Cross-Source-Conversations bereits ohne externen Worker
- **Impact:** Tab-Sichtbarkeit unabhaengig von Settings, Filter pro Tab via source_interface
- **Quality Attribute:** Usability, mentale Konsistenz mit UCM-Modell

**MODERATE ASR #5:** Inline-Search-Box in Chat-Sicht zusaetzlich zur History-Sidebar.

- **Why ASR:** Sucher in laufender Conversation wechselt nicht gerne den Sidebar-Tab, will Inline-Treffer
- **Impact:** Chat-View-Komponente erweitert um Search-Input und Result-Card-Render
- **Quality Attribute:** Usability

### Constraints

- knowledge.db-Schema-Erweiterung muss BUG-012-konform sein (Multi-File-Atomic-Commit)
- FTS-Anteil haengt von Phase-0-Spike-Entscheidung ab

### Open Questions for Architect

- Chunk-Groesse fuer message-level Indexing: ganze Message als 1 Chunk oder split?
- search_history Tool: Default-Filter auf memory-eligible-only oder alle?
- Search-UI: in Conversation-Sidebar oder eigenes Modal?

---

## Definition of Done

### Functional

- [ ] **Dedizierte `history.db` als Engine-DB** (Multi-File-Atomic-Commit aus ADR-079 traegt drei Files)
- [ ] history_chunks-Schema mit `source_interface`-Spalte
- [ ] HistoryStore (CRUD) als Engine-Public-API
- [ ] HistoryIndexer mit incrementellem Indexing, Conversation-Ingestion via abstrakter `Conversation`-Struktur (nicht via Datei-Pfad)
- [ ] SearchHistoryService als Engine-Public-API
- [ ] Initial-Backfill mit Progress-Indicator, abortable, resumable
- [ ] search_history-Tool Agent-facing mit `include: 'obsidian' | 'global' | 'both'`-Parameter (Default `'both'`)
- [ ] **UI-Sidebar mit zwei Tabs (beide immer aktiv):** "Obsidian" (source_interface=obsilo) und "Global" (alle anderen source_interface-Werte)
- [ ] **Inline-Search-Box in Chat-View** neben File-Filter, Vector-DB-Search direkt aus laufender Conversation
- [ ] Tab-Filter pro Source-Interface, Date-Range, Thread-ID, memory-eligible-only
- [ ] System-Prompt-Hint fuer Tool-Nutzung

### Quality

- [ ] Eval-Test-Set fuer Search-Recall
- [ ] Backfill-Abort-Resume-Test
- [ ] Performance-Tests
- [ ] Coverage > 80%

### Documentation

- [ ] FEATURE-0320 Status: Implemented
- [ ] User-Doku: Search-Funktion und Backfill-Hinweis

---

## Dependencies

- **FEATURE-0319** (Living Document UX): ConversationMeta + thread:{id} muessen existieren fuer Filter
- **FEATURE-0314** (Knowledge-DB-Haertung): URI-Konvention + Atomic-Write fuer Schema-Erweiterung

## Assumptions

- knowledge.db-Storage-Aufschlag ist akzeptabel (~+50% Groesse)
- Chunk-level Search liefert genug Praezision fuer Sebastian's Use-Cases

## Out of Scope

- Cross-Conversation-Trefferlisten-Aggregation (Multi-Conv-Merge)
- Vector-Search-Reranking via LLM
- History-Cleanup-Tools (Retention-Policy)
