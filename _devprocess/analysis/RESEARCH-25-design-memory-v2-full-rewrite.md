---
id: OBSILO-MEMORY-V2-FULL-REWRITE
title: Obsilo Memory v2 -- Full Architecture Rewrite (Source Spec)
status: Source Reference
created: 2026-04-25
imported: 2026-04-26
owner: Sebastian Hanke
note: |
  Diese Datei ist die Original-Spec aus der Vorab-Konversation, abgelegt als Source-Reference.
  Sie wurde NICHT gegen die Codebase validiert. Validierte Ableitungen liegen in:
  - PLAN-01-memory-v2-master.md (ueberarbeiteter Implementierungsplan, Pfad alpha)
  - ADR-76-episode-fact-boundary.md
  - ADR-77-memory-v2-storage-schema.md
  - ADR-78-uri-versioning-schema.md
  - ADR-79-knowledge-db-hardening.md
  - BA-UNIFIED-CHAT-MEMORY-V2.md (UCM-Konsumenten-Kontext)
  Realitaetspruefungen siehe PLAN-01 Sektion "Doc-Annahmen vs Codebase".
---

# Obsilo Memory v2 -- Full Architecture Rewrite

> **Audience:** Claude Code (Implementation)
> **Context Owner:** Sebastian Hanke
> **Created:** 2026-04-25
> **Status:** Ready for Implementation (Source-Spec, vor Codebase-Validierung)
> **Repository:** `github.com/pssah4/obsilo`
> **Branch Strategy:** `feature/memory-redesign` (in Obsilo-Repo, vorher `feature/memory-v2` im Source-Doc)
> **Path Decision:** This is **Path 2**, full rewrite of the memory subsystem. Previous incremental plan (`OBSILO-MEMORY-OPTIMIZATION.md`) is kept as reference and fallback option.

---

## 1. Executive Summary

This document specifies a complete redesign of Obsilo's memory subsystem. The current system (six fixed Markdown files with hard 800-character limits, binary hot/cold split, no temporal dimension, no conflict resolution) is replaced with a unified facts-table model that supports dynamic context composition, organic fact aging, semantic conflict resolution, and topic-driven retrieval.

The new architecture serves two goals simultaneously: it makes Obsilo's memory significantly more capable, and it provides the proper foundation for UCM (Unified Chat Memory) which will reuse this engine.

**Key shifts:**

- Storage: Six MD files with fixed categories -> single `facts` table with LLM-assigned topics
- Retrieval: Static system-prompt injection -> dynamic context composition per conversation
- Updates: LLM eviction at hard char limits -> semantic conflict resolution with confirmation tracking
- Lifecycle: No temporal awareness -> importance decay, confirmation reinforcement, supersession
- Communication style: Single `soul.md` -> context-dependent style profiles

**Estimated effort (Source-Doc):** 11-13 weeks at part-time pace. Validated in PLAN-01: 11.5 weeks brutto with Phase 0.5 Knowledge-DB-Hardening.

**Fallback strategy:** This work happens on the `feature/memory-redesign` branch. If at any phase the approach proves untenable, the branch can be abandoned and the incremental plan from `OBSILO-MEMORY-OPTIMIZATION.md` taken instead. Cut-over to v2 happens only at end of Phase 3, until then the existing system runs in production.

---

## 2. Why This Path

### 2.1 Problems with the Current Memory Architecture

1. **Six rigid categories don't fit reality.** `user-profile`, `projects`, `patterns`, `soul`, `errors`, `custom-tools` were a 2024 compromise. Real facts often don't fit cleanly. Categories like "relationships," "health," "preferences" are missing. `errors` is rarely used.

2. **Arbitrary 800-char hard limit per category.** No basis in actual information density. Some categories need more, others less. Total budget of 4800 chars is reasonable, but the per-category split is artificial.

3. **Binary hot/cold split discards nuance.** Reality is a spectrum. A fact might be highly relevant in coding contexts but irrelevant in personal contexts. Current model can't express that.

4. **No temporal dimension.** Facts have no creation date, no last-confirmed timestamp, no usage tracking. "Sebastian works at UniCredit" could remain in memory long after he moved to EnBW.

5. **No conflict resolution.** When new facts contradict old ones, the LongTermExtractor implicitly decides during the next update. No audit trail, no user visibility, no rationale.

6. **Soul is overloaded.** Communication style is treated as monolithic, but it's actually context-dependent (coding vs. personal vs. professional vs. casual).

### 2.2 What the New Design Achieves

- Facts have rich metadata: importance, topics, confirmations, age, provenance
- Retrieval is dynamic, what's "in the system prompt" depends on conversation context
- Conflicts are detected and resolved with explicit rationale
- Aging is organic, unconfirmed facts gradually lose importance, never abruptly disappear
- Communication style adapts to topic
- The same engine drives Obsilo standalone and UCM (when built)

### 2.3 Trade-offs Accepted

- Significantly higher complexity than current system
- Migration of existing memory content is non-trivial
- LLM-based conflict resolution introduces latency and cost in extraction pipeline
- More moving parts means more places to debug
- Full rewrite means longer time-to-first-deployment than incremental improvements

These trade-offs are accepted because the new architecture is the foundation for UCM, and building UCM on the legacy memory model would compound technical debt.

---

## 3. Architecture Overview

### 3.1 Conceptual Model

Three logical layers, but only one storage backend:

**Layer 1 -- Facts:** Atomic statements about the user, their world, their preferences, their patterns. Each fact is self-contained, has provenance, has temporal metadata, has assigned topics, has importance. Stored in a single SQLite table.

**Layer 2 -- Retrieval:** At conversation start, relevant facts are dynamically selected based on inferred conversation topics, importance, recency, and usage history. Token budget is allocated across multiple criteria. Result is rendered as Markdown and injected into the system prompt.

**Layer 3 -- Updates:** After memory-eligible conversations, an extraction pipeline produces new facts, detects similarities and conflicts with existing facts, and updates the store accordingly. Includes aging logic that runs periodically.

### 3.2 New Storage Layout (Source-Doc, NOT validated)

> **Hinweis:** Die in der Source-Spec genannten Pfade weichen teilweise von der Codebase-Realitaet ab. Korrekte Pfade siehe PLAN-01.

```
~/.obsidian-agent/
|-- memory.db                      # PRIMARY: facts, communication_styles, threads, etc.
|                                  # Schema version 2
|                                  # ABER: existiert heute schon mit sessions, episodes, recipes, patterns
|-- memory-v1-backup/              # Created during migration
|   |-- user-profile.md
|   |-- projects.md
|   `-- ... (frozen at migration time)
|-- history/                        # Unchanged: full conversations as JSON
|   |-- index.json
|   `-- {YYYY-MM-DD-hex}.json
|-- knowledge.db                    # Unchanged: vault index, embeddings
|                                   # ABER: BUG-012 Atomicity-Gap muss zuerst gefixt werden
|-- pending-extractions.json       # Unchanged: ExtractionQueue state
|-- checkpoints/                    # Unchanged: shadow git
`-- logs/
    |-- migrations/                # Migration audit logs
    `-- memory-v2/                 # Decision logs from extraction pipeline
```

### 3.3 What Stays Untouched

- `history/` storage format (JSON files per conversation)
- `knowledge.db` (vault indexing) base, ABER mit Haertung in Phase 0.5
- The conversation lifecycle in `AgentTask.run()`
- The `condenseHistory()` logic
- ExtractionQueue mechanism (consumers change)

### 3.4 What Gets Rewritten

- All six Markdown files become rows in `facts` table
- `MemoryService` is replaced (preserving the public interface where possible)
- `LongTermExtractor` is replaced with new extraction pipeline
- `SessionExtractor` is updated to produce facts instead of free-form summaries
- System-prompt construction now goes through dynamic context composition

---

## 4. Phase 0: Architecture Decision Records

**Duration:** 1 week (in PLAN-01 erweitert auf 1.5 Wochen mit Spikes)
**Output:** ADR documents in `_devprocess/architecture/` (NICHT `docs/adr/memory-v2/` wie im Source-Doc)
**Critical:** No code is written until ADRs are reviewed and approved by Sebastian.

### ADR-01: Storage Schema

Decision: Single `facts` table as the source of truth for all long-term memory. Communication styles in a separate `communication_styles` table because they have different lifecycle (not subject to extraction pipeline). Conversation threads in `conversation_threads` (used by both memory and history features). All in `memory.db`.

Schema (canonical version, additiv zu bestehenden Tabellen):

```sql
-- ============================================================
-- Core: facts table
-- ============================================================
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Content
    text TEXT NOT NULL,
    embedding BLOB,
    embedding_model TEXT NOT NULL,

    -- Classification (LLM-assigned, not hardcoded)
    topics TEXT NOT NULL,                     -- JSON array of topic strings
    importance REAL NOT NULL DEFAULT 0.5,     -- 0.0 to 1.0, extractor-assigned

    -- Temporal dimension
    created_at TIMESTAMP NOT NULL,
    last_confirmed_at TIMESTAMP NOT NULL,
    confirmation_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP,
    use_count INTEGER NOT NULL DEFAULT 0,

    -- Provenance
    source_session_id TEXT,
    source_thread_id TEXT,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',

    -- Lifecycle
    superseded_by INTEGER REFERENCES facts(id),
    deprecated_at TIMESTAMP,
    deprecation_reason TEXT,

    -- Extensibility
    metadata JSON,

    -- Constraints
    CHECK (importance >= 0.0 AND importance <= 1.0),
    CHECK (json_valid(topics)),
    CHECK (json_valid(metadata) OR metadata IS NULL)
);

CREATE INDEX idx_facts_importance ON facts(importance DESC) WHERE deprecated_at IS NULL;
CREATE INDEX idx_facts_last_used ON facts(last_used_at DESC);
CREATE INDEX idx_facts_last_confirmed ON facts(last_confirmed_at DESC);
CREATE INDEX idx_facts_source_session ON facts(source_session_id);
CREATE INDEX idx_facts_source_thread ON facts(source_thread_id);
CREATE INDEX idx_facts_active ON facts(id) WHERE deprecated_at IS NULL;
CREATE VIRTUAL TABLE facts_fts USING fts5(text, content='facts', content_rowid='id');

-- Communication styles
CREATE TABLE communication_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_match TEXT NOT NULL,
    style_description TEXT NOT NULL,
    examples TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    created_at TIMESTAMP NOT NULL,
    last_updated_at TIMESTAMP NOT NULL,
    metadata JSON
);

-- Conversation threads
CREATE TABLE conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP NOT NULL,
    last_active_at TIMESTAMP NOT NULL,
    session_count INTEGER NOT NULL DEFAULT 1,
    memory_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    memory_eligible_at TIMESTAMP,
    metadata JSON
);

-- Topic registry
CREATE TABLE known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    description TEXT
);

-- Audit log
CREATE TABLE memory_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP NOT NULL,
    operation TEXT NOT NULL,
    fact_id INTEGER,
    related_fact_id INTEGER,
    session_id TEXT,
    rationale TEXT,
    metadata JSON
);
```

### ADR-02: Topic Vocabulary

Decision: Topics are LLM-assigned, free-form strings, but with consistency tracking via `known_topics` table.

Initial topic seeds (to bootstrap from current six categories):

- `identity`, `projects`, `patterns`, `errors`, `tooling`, `relationships`, `preferences`, `events`

### ADR-03: Importance Calibration

Decision: Importance is a continuous score from 0.0 to 1.0, set initially by the LLM extractor and modified over time by:

- **Confirmation:** +0.05 per confirmation, capped at 1.0
- **Aging:** -5% multiplicative decay every 90 days without confirmation
- **Usage:** +0.02 each time the fact is included in a system prompt and the conversation references it
- **Deprecation:** Set to 0 when superseded or deprecated

The extractor uses a 4-bucket scale internally (`peripheral=0.2`, `relevant=0.5`, `important=0.75`, `core=0.95`).

Cold-equivalent behavior: Facts with importance < 0.3 are not included in dynamic context composition by default, but are reachable via `recall_memory` tool.

### ADR-04: Embedding Strategy

Decision: Use the same embedding model as the vault index for consistency. Default: Konfigurierbar via `embeddingModels: CustomModel[]` (Codebase-Realitaet, NICHT "Qwen3 8B via SiliconFlow" wie urspruenglich behauptet). Embedding model name is stored per-fact for migration safety.

When the embedding model is changed (via config), a background re-embedding job runs.

### ADR-05: Migration Strategy

Decision: Migration ist ein einmaliger, reviewbarer Prozess mit expliziter User-Approval vor Cut-over.

Phasen:

1. **Extract:** Parse all six MD files, split into atomic facts
2. **Classify:** LLM assigns topics and importance
3. **Embed:** Generate embeddings
4. **Stage:** Schreibe in `facts_staging` (NICHT `facts`)
5. **Review:** UI fuer User-Edit, -Merge, -Delete
6. **Commit:** Auf User-Approval, transaktional in `facts` schreiben

Rollback-Pfad explizit definiert.

### ADR-06: Branch and Release Strategy

Decision: All work happens on `feature/memory-redesign` branch (Obsilo-Repo). Sub-branches per phase merge into the parent.

### ADR-07: User Experience for Conflict Resolution

Decision: Conflicts during extraction trigger one of three paths:

1. **Auto-resolve** when LLM confidence >= 0.85
2. **Notification** when confidence 0.5-0.85
3. **Block** when confidence < 0.5

---

## 5. Phase 1: Core Storage and Embedding

**Duration (Source-Doc):** 2 Wochen
**Branch:** `feature/memory-redesign-phase-1`
**Goal:** New schema is operational alongside existing v1 system. No user-visible changes yet.

### 5.1 Implementation Tasks

**1.1 Schema Migration:** `migrations/v2-schema.ts`

**1.2 New Service: FactStore** (`src/core/memory/v2/FactStore.ts`):

```typescript
interface Fact {
  id: number;
  text: string;
  embedding?: Float32Array;
  embeddingModel: string;
  topics: string[];
  importance: number;
  createdAt: Date;
  lastConfirmedAt: Date;
  confirmationCount: number;
  lastUsedAt?: Date;
  useCount: number;
  sourceSessionId?: string;
  sourceThreadId?: string;
  sourceInterface: string;
  supersededBy?: number;
  deprecatedAt?: Date;
  deprecationReason?: string;
  metadata?: Record<string, unknown>;
}

class FactStore {
  async create(input: CreateFactInput): Promise<Fact>;
  async get(id: number): Promise<Fact | null>;
  async update(id: number, changes: Partial<Fact>): Promise<Fact>;
  async confirm(id: number, sessionId: string): Promise<Fact>;
  async supersede(oldId: number, newFact: CreateFactInput, rationale: string): Promise<Fact>;
  async deprecate(id: number, reason: string): Promise<void>;
  async recordUsage(id: number, sessionId: string): Promise<void>;
  async query(options: FactQueryOptions): Promise<Fact[]>;
  async semanticSearch(query: string, options?: FactQueryOptions): Promise<Array<Fact & { similarity: number }>>;
  async fullTextSearch(query: string, options?: FactQueryOptions): Promise<Fact[]>;
  async runAgingCycle(): Promise<{ aged: number; deprecated: number }>;
}
```

**1.3 New Service: TopicRegistry**

**1.4 New Service: CommunicationStyleStore**

**1.5 Embedding Pipeline** (gemeinsam mit SemanticIndexService)

### 5.2 Acceptance Criteria

- Migration runs cleanly, schema version 2 set
- Backup before any modification
- FactStore CRUD with > 90% coverage
- All operations logged to memory_audit

---

## 6. Phase 2: Migration of Existing Memory

**Duration:** 2 Wochen
**Branch:** `feature/memory-redesign-phase-2`

Stages: Parse, Atomize (LLM), Classify, Embed, Stage, Review-UI, Commit, Rollback.

---

## 7. Phase 3: Dynamic Context Composition

**Duration:** 2 Wochen
**Branch:** `feature/memory-redesign-phase-3`

ContextComposer mit Bucket-Allocation 30/50/15/5, TopicInferrer (Lightweight LLM), Markdown-Rendering, AgentTask-Integration mit Config-Flag `memory.engineVersion: 'v1' | 'v2'`, `recall_memory`-Tool.

---

## 8. Phase 4: Update Pipeline (Conflict Resolution and Aging)

**Duration:** 2 Wochen
**Branch:** `feature/memory-redesign-phase-4`

FactExtractor (replaces LongTermExtractor), FactIntegrator (similar/equivalent/refinement/update/contradiction Klassifikation), PendingReviewService, AgingService.

---

## 9. Phase 5: Living Document UX

**Duration:** 1-2 Wochen
**Branch:** `feature/memory-redesign-phase-5`

ConversationMeta-Erweiterung, Save-to-Memory UI (Star, Hotkey), Voice/Text Trigger via `mark_conversation_for_memory` Tool, Re-Extraction-Logik mit Throttle, Auto-Suggestion via SaveSuggestionService.

---

## 10. Phase 6: History Search

**Duration:** 1 Woche
**Branch:** `feature/memory-redesign-phase-6`

`history_chunks`-Tabelle in `knowledge.db`, HistoryIndexer, `search_history` Tool, UI-Sidebar-Search.

---

## 11. Phase 7: UCM Foundation

**Duration:** 1 Woche
**Branch:** `feature/memory-redesign-phase-7`

Package-Extraction zu `@obsilo/memory-engine`, Public API frozen, Konfigurations-Abstraktion, Dokumentation.

---

## 12. Test Strategy

Unit-Tests > 85%, Integration-Tests in `tests/integration/memory-v2/`, manuelle Validation-Punkte am Phasen-Ende.

---

## 13. Risk Register

R1 Migration produces poor extraction. R2 LLM-based conflict resolution unreliable. R3 Dynamic retrieval misses important context. R4 Token budget exceeded. R5 Performance degradation. R6 Sebastian's immersion-then-abandonment. R7 Memory corruption (BUG-012!). R8 UCM never built. R9 Two engines coexist confusion.

---

## 14. Effort Estimate Summary

| Phase | Duration | Key Output |
|---|---|---|
| 0 ADRs | 1 week | Architecture decisions |
| 1 Storage | 2 weeks | Schema, FactStore, TopicRegistry |
| 2 Migration | 2 weeks | All v1 content migrated |
| 3 Retrieval | 2 weeks | Cut-over complete |
| 4 Update Pipeline | 2 weeks | Conflict resolution, aging |
| 5 Living Document UX | 1-2 weeks | Save button, voice, auto-suggestion |
| 6 History Search | 1 week | Full conversation search |
| 7 UCM Foundation | 1 week | Engine extracted |
| **Total** | **11-13 weeks** | Production-ready memory v2 |

> **Validierte Schaetzung in PLAN-01: 11.5 Wochen** mit Phase 0.5 Knowledge-DB-Hardening eingeschoben.

---

## 15. Branch and Merge Strategy

```
main
`-- dev
    `-- feature/memory-redesign (long-lived parent)
        |-- feature/memory-redesign-phase-0  (ADRs)
        |-- feature/memory-redesign-phase-0.5 (Knowledge-DB Hardening, NEU)
        |-- feature/memory-redesign-phase-1
        |-- feature/memory-redesign-phase-2
        |-- feature/memory-redesign-phase-3
        |-- feature/memory-redesign-phase-4
        |-- feature/memory-redesign-phase-5
        |-- feature/memory-redesign-phase-6
        `-- feature/memory-redesign-phase-7
```

---

## 16. Open Questions for Phase 0 Discussion

1. Topic vocabulary: Is the seed list right?
2. Importance bands: Are the cutoffs right?
3. Aging speed: 90-day half-life, 5% decay aggressive enough?
4. Conflict resolution thresholds risk-averse enough?
5. Communication style granularity: Start with default + 1-2 contexts?
6. Embedding model: konfigurierbar (statt Default Qwen3)
7. Pending review queue UX: Notification vs. Passive Queue?
8. UCM source-interface tagging canonical names?

---

## 17. References

- BA: `_devprocess/analysis/BA-UNIFIED-CHAT-MEMORY-V2.md`
- Master-Plan (validiert): `_devprocess/implementation/plans/PLAN-01-memory-v2-master.md`
- Existing Memory Architecture: `src/core/memory/`, `src/core/history/`, `src/core/semantic/`
- Anthropic Contextual Retrieval (Obsilo ADR-51)
- ADR-13, ADR-18, ADR-58, ADR-59, ADR-60 (zu superseden bzw. supplementieren)
- BUG-012 (zu fixen in Phase 0.5)

---

> **Wichtig:** Diese Datei ist die *Source-Spec* der Vorab-Konversation. Sie wurde in PLAN-01 gegen die Codebase validiert und ueberarbeitet. Beim Konflikt zwischen dieser Datei und PLAN-01 gilt PLAN-01.
