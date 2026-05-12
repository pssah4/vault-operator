---
ba: BA-25
arch-completed: 2026-05-03
related-epics: [EPIC-03, EPIC-15, EPIC-19]
adr-count: 15
plan-count: 5
---

# plan-context BA-25: Karpathy-Wiki-Pattern (Ingest, Retrieval, Lint)

## Tech-Stack (Stand 2026-05-03)

Existing Stack, wird ERWEITERT (nicht ersetzt):

- **Sprache:** TypeScript strict
- **Plugin-Framework:** Obsidian Plugin API
- **Build:** esbuild plus Deploy-Plugin (Watch-Mode)
- **DB:** sql.js WASM (knowledge.db v9 -> v10, memory.db v4, history.db v1)
- **Storage:** Dual-Storage-Mode global (fs.promises) plus obsidian-sync (vault.adapter mit WriterLock)
- **Atomic Writes:** ADR-79 Pattern (.tmp -> rename -> .bak)
- **AI APIs:** Anthropic SDK, OpenAI SDK, Google Gemini, Ollama, Kilo Gateway, ChatGPT-OAuth, GitHub Copilot
- **Embeddings:** VaultOperatorEmbeddingProvider (per User konfigurierbar)
- **Reranker:** transformers.js WASM (Xenova/ms-marco-MiniLM-L-6-v2, INT8)
- **Web-Search:** Brave / Tavily via FEAT-04-02 (BYOK obligatorisch fuer Lint Stufe-2/3, ADR-104)
- **PDF-Parsing:** parseDocument.ts via pdfjs-dist
- **Frontmatter-Edits:** Obsidian Vault.process plus WriterLock im obsidian-sync-Mode (ADR-95)

Keine neuen externen Dependencies geplant.

## Architektur-Stil und Quality-Goals

**Stil:** Plugin-Architektur mit Service-Layer (Singletons in main.ts), Tool-Registry-Pattern (BaseTool plus ToolExecutionPipeline), Event-driven (vault.on-Listener) plus periodische Background-Jobs (setInterval).

**Quality-Goals (BA-25 NFR-Prio):**
1. Daten-Sicherheit (kein Frontmatter-Verlust)
2. User-Trust (Reversibilitaet, Transparenz, Default-konservativ)
3. Performance (< 1ms SQL-Single, < 100ms SQL-Bulk, asynchrones Indexing)
4. Token-Oekonomie (Backfill < 5 USD, Stufe-3 hartes Wochen-Budget)
5. Skalierbarkeit (100 bis 10.000+ Notes pro Vault)

## ADR-Summary-Tabelle

| ADR | Title | Status | Verbindet Feature |
|-----|-------|--------|-------------------|
| ADR-92 | Schema v9 -> v10 Bundle (6 Tabellen) | Proposed | FEAT-15-09, 15-10, 15-11, 15-12, indirekt 19-22 (ingest_session) und 19-12/27 (ingest_triage_log) |
| ADR-93 | Source-Identitaet Domain-only MVP | Proposed | FEAT-15-11, 19-14, 19-17 |
| ADR-94 | Cluster-Halbwertszeit-Modell statisch editierbar | Proposed | FEAT-15-12, 19-16 |
| ADR-95 | Frontmatter-Write Conflict-Detection (Vault.process plus WriterLock) | Proposed | FEAT-19-09, 19-10 |
| ADR-96 | MOC-Marker HTML-Comment-Konvention | Proposed | FEAT-19-11, 19-26 |
| ADR-97 | KV-Cache-Block-Lifecycle (24h Cooldown) | Proposed | FEAT-03-26 |
| ADR-98 | Pre-Triage-Tool-Architektur (eigenes ingest_triage) | Proposed | FEAT-19-12 |
| ADR-99 | Tension-Detection Hybrid Cosine plus LLM | Proposed | FEAT-19-13 |
| ADR-100 | Dialog-Ingest-State-Storage ingest_session-Tabelle | Proposed | FEAT-19-22 |
| ADR-101 | Output-Modus 3 Modi plus Folder-Layout plus Bibliografie | Proposed | FEAT-19-24, 19-25, 19-30 |
| ADR-102 | Auto-Trigger vault.on-Listener mit Tracking | Proposed | FEAT-19-27 |
| ADR-103 | Source-Position-Marker plus PDF-Strategie | Proposed | FEAT-19-28, 19-29 |
| ADR-104 | Web-Search-Provider BYOK obligatorisch | Proposed | FEAT-19-14, 19-19, 19-20 |
| ADR-105 | Stufe-3 setInterval plus Token-Hard-Cap | Proposed | FEAT-19-20, 19-21 |
| ADR-106 | Health-Modal-Severity 3-stufig plus Hint-Cooldown | Proposed | FEAT-19-18, 19-19 |

## Data-Model: 6 neue Tabellen (knowledge.db v10) plus 1 erweiterte Spalte

```sql
-- FEAT-15-09
CREATE TABLE note_summaries (
    note_path TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    summary_model TEXT NOT NULL,
    summarized_at TEXT NOT NULL,
    source_mtime INTEGER NOT NULL
);

-- FEAT-15-10
CREATE TABLE frontmatter_properties (
    note_path TEXT NOT NULL,
    property_name TEXT NOT NULL,
    property_value TEXT NOT NULL,
    list_index INTEGER NOT NULL DEFAULT 0,
    UNIQUE(note_path, property_name, list_index)
);
CREATE INDEX idx_frontmatter_value ON frontmatter_properties(property_name, property_value);

-- FEAT-15-11 (ADR-93 Domain-only)
CREATE TABLE cluster_source_stats (
    cluster TEXT NOT NULL,
    source_domain TEXT NOT NULL,
    note_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (cluster, source_domain)
);

-- FEAT-15-12 (ADR-94 Halbwertszeit + ADR-106 last_hint_at)
CREATE TABLE cluster_metadata (
    cluster TEXT PRIMARY KEY,
    half_life_days INTEGER NOT NULL,
    custom_weights TEXT,
    last_external_check TEXT,
    last_hint_at TEXT,
    hot_cluster INTEGER NOT NULL DEFAULT 0
);

-- ADR-100 (FEAT-19-22 Dialog-State)
CREATE TABLE ingest_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uri TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_turn_at TEXT NOT NULL,
    state_json TEXT NOT NULL,
    conversation_id TEXT
);
CREATE INDEX idx_ingest_session_status ON ingest_session(status);

-- ADR-98 + ADR-102 (Triage-Tracking gegen Doppel-Trigger)
CREATE TABLE ingest_triage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uri TEXT NOT NULL,
    triaged_at TEXT NOT NULL,
    decision TEXT NOT NULL,
    decision_reason TEXT,
    UNIQUE(source_uri)
);

-- Schema-Meta-Update
UPDATE schema_meta SET version = 10;
```

## Externe Integrationen

- **Web-Search-Provider:** Brave Search API, Tavily API (via FEAT-04-02 BYOK).
- **LLM-Provider:** existing Stack (Haiku Default fuer Triage, Summary, Pre-Filter).
- **Obsidian Bases-Plugin:** Bibliografie-Note nutzt Bases-Codeblock (ADR-101). Test in Coding-Phase gegen aktuelles Bases-Schema.

## Performance und Security konkrete Zahlen

**Performance:**
- SQL-Single-Lookup: < 1ms
- SQL-Bulk-Lookup 1.500 Notes: < 100ms
- Score-Berechnung pro Cluster: < 50ms
- Health-Check vollstaendig (50 Cluster): < 500ms
- Triage-Pass: < 15s end-to-end
- Top-Hub-Block-Generierung: < 200ms (asynchron)

**Token-Kosten:**
- Note-Summary (Haiku): < 0.001 USD pro Note
- Triage-Pass: < 0.05 USD
- Tension-Detection (5 Claims, Hybrid): ~0.005 USD
- Stufe-2 Web-Search-Pass (3-5 Searches plus Synthese): 0.10-0.50 USD
- Stufe-3 Wochen-Job (Default-Budget): 2 USD (hard cap)

**Security:**
- Frontmatter-Write nur mit User-Approval (Setting-gated, Default off).
- Web-Search via BYOK, keine Queries ueber Vault Operator-Gateway.
- ingest_triage_log enthaelt nur source_uri und Decision, kein Inhalt-Excerpt.

## Bundling: 5 PLAN-Dokumente fuer Coding-Phase

### PLAN-10: Phase 1 Foundation

**Features:** FEAT-15-09, 15-10, 15-11, 15-12, 19-08, 19-09
**ADRs:** ADR-92, ADR-93, ADR-94, ADR-95
**Code-Ankerpunkte:**
- `src/core/knowledge/KnowledgeDB.ts`: Migration v9 -> v10 ergaenzen (sechs CREATE TABLE)
- `src/core/semantic/SemanticIndexService.ts`: Indexing-Hook fuer note_summaries plus frontmatter_properties
- `src/main.ts`: Settings-Schema-Erweiterung fuer Standard-Prompt
- Neuer Helper: `src/core/knowledge/NoteSummaryStore.ts`
- Neuer Helper: `src/core/knowledge/FrontmatterPropertyStore.ts`
- Neuer Helper: `src/core/knowledge/ClusterMetadataStore.ts`
- Neuer Helper: `src/core/knowledge/ClusterSourceStatsStore.ts`
- Neuer Helper: `src/core/ingest/FrontmatterWriter.ts` (Vault.process plus WriterLock)
**Verifikation:** `npm run build` plus Migrations-Unit-Test plus Indexing-Smoke-Test auf Test-Vault.

### PLAN-11: Phase 2 Lint-Foundation

**Features:** FEAT-19-16, 19-17, 19-18
**ADRs:** ADR-94, ADR-106
**Code-Ankerpunkte:**
- `src/core/health/VaultHealthService.ts`: drei neue Check-Types (cluster_freshness, source_concentration, knowledge_decay_external Stub)
- `src/ui/health/VaultHealthModal.tsx` (oder analog): Severity-Tabs, Filter, Bulk-Dismiss, Action-Button-Map
- Neuer Helper: `src/core/health/FreshnessScorer.ts`
**Verifikation:** Health-Check-Eval mit 10 Test-Cluster, Modal-UI-Test.

### PLAN-12: Phase 3 Ingest-Foundation

**Features:** FEAT-19-12, 19-22, 19-24, 19-25, 19-27, 19-28
**ADRs:** ADR-93, ADR-98, ADR-100, ADR-101, ADR-102, ADR-103
**Code-Ankerpunkte:**
- Neues Tool: `src/core/tools/ingest/IngestTriageTool.ts`
- Neuer Service: `src/core/ingest/IngestSessionStore.ts` (ingest_session-Tabelle)
- Neuer Service: `src/core/ingest/AutoTriggerObserver.ts` (vault.on-Listener)
- Neuer Service: `src/core/ingest/OutputModeGenerator.ts` plus Drei Modi-Funktionen
- Neuer Helper: `src/core/ingest/BlockIdSetter.ts`
- Settings-Schema-Erweiterung
- `src/main.ts`: AutoTriggerObserver-Wiring im onload
**Verifikation:** Triage-Tool-E2E-Test mit Test-Source, Auto-Trigger-Smoke-Test.

### PLAN-13: Phase 4 Power-User-Erweiterungen

**Features:** FEAT-19-10, 19-13, 19-14, 19-19, 19-21, 19-23, 19-26, 19-29, 19-30
**ADRs:** ADR-95, ADR-96, ADR-99, ADR-104, ADR-106
**Code-Ankerpunkte:**
- `src/core/ingest/FrontmatterBackfillJob.ts` (Job-Runner mit Progress-UI)
- `src/core/ingest/TensionDetector.ts` (Hybrid Cosine plus LLM)
- `src/core/ingest/MOCMaintainer.ts` (Marker-Konvention)
- `src/core/health/StuFe2ActivityTrigger.ts` (vault.on-Listener fuer Activity-Hint)
- `src/ui/health/HotClusterSettings.tsx`
- PDF-Strategie-Switch in OutputModeGenerator
- `src/core/ingest/BibliographyNoteGenerator.ts`
**Verifikation:** Backfill-Diff-Audit plus Tension-Sample-Eval plus Activity-Trigger-Cooldown-Unit-Test.

### PLAN-14: Phase 5 Erweiterte Schichten (telemetrie-getrieben)

**Features:** FEAT-19-11, 19-15, 19-20, 03-26
**ADRs:** ADR-96, ADR-97, ADR-105
**Code-Ankerpunkte:**
- `src/core/ingest/MOCAutoUpdater.ts` (aktive Pflege im Hintergrund)
- `src/ui/inbox/InboxBatchTriageView.tsx`
- `src/core/health/Stufe3PeriodicJob.ts` (setInterval plus Hard-Budget)
- `src/core/memory/TopHubBlockGenerator.ts` (KV-Cache-Block)
- ContextComposer-Integration fuer Top-Hub-Block (vor DateTime, nach Soul)
**Verifikation:** Telemetrie-Auswertung nach 4 Wochen Phase 1-4, Setting-Toggles fuer alle Phase-5-Features Default off.

## Open Items (deferred zu Coding)

- Bibliografie-Codeblock-Syntax-Verifikation gegen aktuelles Obsidian-Bases-Schema (ADR-101 Risk).
- PDF-Page-Refs auf Android-Plattform: Compatibility-Test, ggf Fallback (ADR-103).
- Cluster-Kategorie-Erkennung-Heuristik (Name-Match): Edge-Cases listen, ggf User-Override-UI in Phase 2 (ADR-94).
- Halbwertszeit-Default-Validierung nach 4 Wochen User-Use (ADR-94 Risk).
- Modus-Wechsel retroaktive Re-Verarbeitung als FEAT-19-31 oder FIX, falls User es einfordert (ADR-101).

## Plan-Gate-Verifikation (vor Coding-Start)

Vier Items vor /coding:

1. **SC coverage:** jedes Success Criterion in den 28 FEATURE-Specs auf einen PLAN-Task gemappt oder als Deferred markiert.
2. **ADR alignment:** jeder der 15 ADRs ist in mindestens einem PLAN-Task referenziert (siehe Bundling oben, alle ADRs sind in PLAN-10 bis PLAN-14 zugeordnet).
3. **Codebase anchoring:** jeder PLAN-Task nennt mindestens einen konkreten Datei-Pfad (siehe Code-Ankerpunkte je Phase).
4. **Verify commands:** mindestens ein Build- und ein Test-Command pro PLAN. Default: `npm run build` plus `npm test` plus PLAN-spezifische Smoke-Test-Commands (siehe je Phase).

Plan-Gate-Status: **Vorbereitet, blockiert nicht**. Coding-Phase verifiziert je PLAN beim Start.

## Dialog

(leer beim Architektur-Handoff. Coding-Phase kann hier Rueckfragen ablegen, Architektur antwortet bei Bedarf in spaeterer Session.)
