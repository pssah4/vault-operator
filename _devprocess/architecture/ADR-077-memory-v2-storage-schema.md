---
id: ADR-077
title: Memory v2 Storage Schema -- Facts, Edges, Embeddings
status: Proposed
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-013-memory-architecture.md
  - ADR-076-episode-fact-boundary.md
  - ADR-078-uri-versioning-schema.md
  - ADR-079-knowledge-db-hardening.md
  - PLAN-001-memory-v2-master.md
---

# ADR-077 -- Memory v2 Storage Schema

## Context

Memory v2 braucht ein Schema fuer:

- Atomic Facts mit Topics, Importance, Provenance, Temporal-Metadata
- Communication Styles (kontextspezifisch)
- Conversation Threads (Cross-Session, vorbereitet fuer UCM Cross-Interface)
- Edges zwischen Facts und externen Entitaeten (Vault-Notes, Entities, Threads)
- Audit-Trail fuer state-changing Operations
- Topic-Registry fuer Konsistenz

Constraints:

- Einziger erlaubter Driver: `sql.js@^1.14.1` (Review-Bot, kein Native-Binary)
- Standard-sql.js-Build hat **kein** FTS5 und **kein** JSON1
- Embedding-Vektoren als Float32Array BLOBs
- Atomicity-Risiko: jeder `db.export()` ist Full-Blob-Write (siehe ADR-079)
- UCM-Konsumenten-Vertrag: Schema muss `source_interface`-Tagging und Sidecar-Faehigkeit haben

## Decision

### Tabellen (additiv zu bestehenden sessions, episodes, recipes, patterns)

```sql
-- Facts (Wissens-Statements)
CREATE TABLE facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    topics TEXT NOT NULL,                       -- JSON-Array (validiert in JS-Layer wenn JSON1 fehlt)
    importance REAL NOT NULL DEFAULT 0.5,
    kind TEXT NOT NULL DEFAULT 'fact',          -- E2: 'fact' | 'preference' | 'identity' | 'event'
    created_at TIMESTAMP NOT NULL,
    last_confirmed_at TIMESTAMP NOT NULL,
    confirmation_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP,
    use_count INTEGER NOT NULL DEFAULT 0,
    source_session_id TEXT,
    source_thread_id TEXT,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    source_uri TEXT,                             -- E10/0325: vault://-URI fuer Notes-as-Source
    superseded_by INTEGER REFERENCES facts(id),
    is_latest INTEGER NOT NULL DEFAULT 1,        -- E4: Boolean-Flag fuer schnellen Default-Filter
    deprecated_at TIMESTAMP,
    deprecation_reason TEXT,
    metadata TEXT,                               -- JSON-String, validiert in JS
    CHECK (importance >= 0.0 AND importance <= 1.0),
    CHECK (kind IN ('fact', 'preference', 'identity', 'event')),
    CHECK (is_latest IN (0, 1))
);

CREATE INDEX idx_facts_is_latest ON facts(is_latest, importance) WHERE is_latest = 1 AND deprecated_at IS NULL;
CREATE INDEX idx_facts_kind ON facts(kind);
CREATE INDEX idx_facts_source_uri ON facts(source_uri);

CREATE INDEX idx_facts_importance ON facts(importance) WHERE deprecated_at IS NULL;
CREATE INDEX idx_facts_last_used ON facts(last_used_at);
CREATE INDEX idx_facts_last_confirmed ON facts(last_confirmed_at);
CREATE INDEX idx_facts_source_session ON facts(source_session_id);
CREATE INDEX idx_facts_source_thread ON facts(source_thread_id);
CREATE INDEX idx_facts_active ON facts(deprecated_at);

-- Memory-Source-Notes Tabelle (FEATURE-0325, E10)
CREATE TABLE memory_source_notes (
    note_path TEXT PRIMARY KEY,                  -- vault-relativer Pfad
    last_extracted_at TIMESTAMP,
    dirty INTEGER NOT NULL DEFAULT 0,            -- 0/1 Flag, gesetzt bei vault.on('modify')
    fact_count INTEGER NOT NULL DEFAULT 0,
    marker_source TEXT NOT NULL,                 -- 'agent-tool' | 'frontmatter' | 'settings-list'
    created_at TIMESTAMP NOT NULL,
    CHECK (dirty IN (0, 1)),
    CHECK (marker_source IN ('agent-tool', 'frontmatter', 'settings-list'))
);

CREATE INDEX idx_memory_source_dirty ON memory_source_notes(dirty) WHERE dirty = 1;

-- Embedding separat (vermeidet teures Mit-Laden bei Read-Queries)
CREATE TABLE fact_embeddings (
    fact_id INTEGER PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_fact_embeddings_model ON fact_embeddings(embedding_model);

-- Edges zwischen Facts und externen Entitaeten (URI-basiert)
CREATE TABLE fact_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    to_fact_id INTEGER REFERENCES facts(id) ON DELETE CASCADE,
    to_external_ref TEXT,                        -- URI, z.B. 'vault://Notes/X.md', 'entity:UniCredit', 'thread:abc'
    edge_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL,
    source_interface TEXT NOT NULL DEFAULT 'obsilo',
    metadata TEXT,
    CHECK ((to_fact_id IS NOT NULL AND to_external_ref IS NULL) OR
           (to_fact_id IS NULL AND to_external_ref IS NOT NULL)),
    UNIQUE(from_fact_id, to_fact_id, edge_type),
    UNIQUE(from_fact_id, to_external_ref, edge_type)
);

CREATE INDEX idx_fact_edges_from ON fact_edges(from_fact_id, edge_type);
CREATE INDEX idx_fact_edges_to_fact ON fact_edges(to_fact_id);
CREATE INDEX idx_fact_edges_to_ref ON fact_edges(to_external_ref);

-- Communication Styles (kontextabhaengig)
CREATE TABLE communication_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_match TEXT NOT NULL,                  -- 'default' | 'topic:coding' | ...
    style_description TEXT NOT NULL,
    examples TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    created_at TIMESTAMP NOT NULL,
    last_updated_at TIMESTAMP NOT NULL,
    metadata TEXT
);

CREATE INDEX idx_styles_context ON communication_styles(context_match);

-- Conversation Threads (Cross-Session, vorbereitet fuer UCM Cross-Interface)
CREATE TABLE conversation_threads (
    thread_id TEXT PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP NOT NULL,
    last_active_at TIMESTAMP NOT NULL,
    session_count INTEGER NOT NULL DEFAULT 1,
    memory_eligible INTEGER NOT NULL DEFAULT 0,   -- BOOLEAN als 0/1
    memory_eligible_at TIMESTAMP,
    metadata TEXT
);

CREATE TABLE thread_sessions (
    thread_id TEXT NOT NULL REFERENCES conversation_threads(thread_id),
    session_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    PRIMARY KEY (thread_id, session_id)
);

CREATE INDEX idx_thread_sessions_session ON thread_sessions(session_id);

-- Topic-Registry (soft normalization)
CREATE TABLE known_topics (
    topic TEXT PRIMARY KEY,
    fact_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP NOT NULL,
    description TEXT,
    centroid_embedding BLOB,                      -- fuer lokale Topic-Inference (Cosine vs known_topics)
    centroid_computed_at TIMESTAMP
);

-- Audit nur fuer state-changing Operations (use-Counts werden inline gefuehrt)
CREATE TABLE memory_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP NOT NULL,
    operation TEXT NOT NULL,                       -- 'insert' | 'confirm' | 'supersede' | 'deprecate' (NICHT 'use')
    fact_id INTEGER,
    related_fact_id INTEGER,
    session_id TEXT,
    rationale TEXT,
    metadata TEXT
);

CREATE INDEX idx_audit_fact ON memory_audit(fact_id);
CREATE INDEX idx_audit_timestamp ON memory_audit(timestamp);
```

### Edge-Konzept-Layer (E1, Supermemory-Differenzierung)

`fact_edges.edge_type` bleibt granular (`co_occurrence`, `mentions_*`, etc.) fuer Storage. Aber FactIntegrator-Output und ContextComposer-Logik nutzen drei hoehere semantische Klassen, die auf die granularen Edge-Types abbilden:

| Konzept-Layer (Supermemory-aequivalent) | Granulare Edge-Types | Lifecycle-Verhalten |
|---|---|---|
| **`update`** | `supersedes`, `contradiction-resolved` | `is_latest=0` auf alter Fact, neue Fact bekommt `is_latest=1`. History-Erhaltung. |
| **`extend`** | `refines`, `co_occurrence` mit similarity > 0.85 + Topic-Overlap | beide Facts bleiben `is_latest=1`, sind via `extend`-Edge verlinkt |
| **`derive`** | `derived_from_episode`, `derived_from_pattern`, `mentions_entity`-Aggregation | inferred Fact wird neu erzeugt, mit `kind='preference'` oder `kind='fact'`, plus Edge zur Source |

Der Single-Call-Extraktor (FEATURE-0318) gibt im Output je Fact-Candidate eine `relation: 'update' | 'extend' | 'derive' | 'new'` zurueck, was die FactIntegrator-Logik vereinfacht (4 Cases statt 5 mit `equivalent` redundant zu `confirm`).

### FTS-Strategie (Spike-Entscheidung Phase 0)

Drei Optionen, Entscheidung nach Bundle-Size-Spike:

1. **FTS5 via Custom-sql.js-WASM-Build** (`-DSQLITE_ENABLE_FTS5`): Beste Performance, +200KB WASM-Bundle. Bevorzugt wenn Bundle-Size traegt.
2. **JS-Trigram-Index ueber facts.text**: Pure-JS, kein WASM-Aufschlag. Performance OK fuer < 50k Facts.
3. **LIKE-Fallback**: Notfall, nur fuer Phase 0 vor Trigram-Implementation.

### JSON-Validation

Da Standard-sql.js kein JSON1 hat:

- `topics` und `metadata` als TEXT mit JS-Layer-Validierung beim Insert/Update
- Application-Code parsed JSON beim Read
- Falls Custom-WASM-Build mit JSON1: SQL-Layer-CHECK ergaenzen (additiv zur JS-Validierung)

### Embedding-Strategie

- Embedding in separater `fact_embeddings`-Tabelle (vermeidet Read-Aufschlag bei normalen `SELECT * FROM facts`)
- `embedding_model`-Spalte pro Row: Cross-Model-Cosine wird verhindert (model_filter im Query)
- Hintergrund-Re-Embed-Job bei Modellwechsel
- `known_topics.centroid_embedding` wird bei Insert eines neuen Facts mit dem Topic refresht (lokale Topic-Inference braucht aktuelle Centroids)

## Consequences

**Positiv:**

- Schema additiv neben bestehenden Tabellen, keine Migration der existierenden Daten erzwungen
- `fact_embeddings`-Trennung spart Read-Aufschlag bei regulaeren Queries
- URI-basierte Edges erlauben Engine-portable Multi-Hop-Walks ohne Vault-Abhaengigkeit
- `source_interface`-Spalte ist UCM-Vorbedingung, von Anfang an drin
- `centroid_embedding` in `known_topics` erlaubt sub-50ms Topic-Inference ohne LLM-Call

**Negativ:**

- Mehr Tabellen, mehr Joins, mehr Indizes (memory.db waechst um ~7 Tabellen)
- JSON-Validation in JS-Layer ist redundant zu kuenftigen JSON1-CHECKs (Doppelpflege)
- FTS-Strategie haengt von Spike-Ergebnis ab, drei Code-Pfade muessen vorbereitet werden

**Risk:** Wenn FTS-Spike alle drei Optionen als untragbar zeigt -> Fallback auf reine Cosine-Suche (kein Hybrid-Retrieval), reduziert Recall-Quality.

## Alternatives Considered

1. **Schema-Merge in knowledge.db** -- Verworfen, weil Engine-Vault-Coupling und Sidecar-Pattern bricht (siehe Diskussion in PLAN-001).
2. **Embedding inline in facts** -- Verworfen wegen Read-Aufschlag.
3. **Free-Form metadata ohne JSON-Validation** -- Verworfen, weil spaetere Audits ohne Schema-Vorgaben unmoeglich werden.
4. **Recursive CTE fuer Edge-Traversal in einer separaten Tabelle** -- ATTACH-Pattern (siehe ADR-079) ist eleganter.

## Open Questions

- ATTACH+CTE-Performance auf Sebastian's realen DBs (Spike Phase 0)
- FTS5-WASM-Bundle-Size-Auswirkung auf Plugin-Bundle-Limit (Spike Phase 0)
- Konflikt-Handling wenn `from_fact_id` deprecated wird, was passiert mit ausgehenden Edges? (Cascade vs. Soft-Drop)
