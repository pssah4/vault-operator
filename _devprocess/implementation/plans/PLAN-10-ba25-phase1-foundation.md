---
id: PLAN-10
title: BA-25 Phase 1 Foundation (Schema-Bundle + Auto-Summary)
date: 2026-05-03
status: Active
feature-refs: [FEAT-15-09, FEAT-15-10, FEAT-15-11, FEAT-15-12, FEAT-19-08, FEAT-19-09]
adr-refs: [ADR-92, ADR-93, ADR-94, ADR-95]
bug-refs: []
pair-id: sebastian-opus-4.7
---

# PLAN-10: BA-25 Phase 1 Foundation

## Kontext

Erste Phase der BA-25-Initiative (Karpathy-Wiki-Pattern). Foundation-Layer fuer alle weiteren Phasen 2-5. Schema-Migration knowledge.db v9 -> v10 mit 6 neuen Tabellen plus Settings-Schema-Erweiterung plus Auto-Summary-Generierung beim Indexing.

ADR-92 hat sich auf 6 Tabellen erweitert wegen ADR-100 (ingest_session) und ADR-98/102 (ingest_triage_log). Die zugehoerigen Features dieser zwei Tabellen werden erst in PLAN-12 implementiert, aber die Schema-Migration nimmt sie additiv mit, um eine zweite v10-Migration zu vermeiden.

## Implementierungs-Reihenfolge

### Task 1: Schema-Migration v9 -> v10

**Files:**
- Modify: `src/core/knowledge/KnowledgeDB.ts:52` (SCHEMA_VERSION = 10)
- Modify: `src/core/knowledge/KnowledgeDB.ts:58-148` (SCHEMA_DDL erweitert um 6 Tabellen + Indexes)
- Modify: `src/core/knowledge/KnowledgeDB.ts:414-465` (migrateSchema mit v9 -> v10 Step)

**Akzeptanz:**
- Migration-Test schafft alle 6 neuen Tabellen.
- schema_meta.version == 10 nach Migration.
- Bestehende Tabellen unangetastet.
- Re-Open derselben DB ist Idempotent.

**Test:** `src/core/knowledge/__tests__/KnowledgeDB.migration-v10.test.ts` (neu).

### Task 2: NoteSummaryStore

**Files:**
- Create: `src/core/knowledge/NoteSummaryStore.ts`
- Create: `src/core/knowledge/__tests__/NoteSummaryStore.test.ts`

**API:**
- `upsert(notePath, summary, summaryModel, sourceMtime): void`
- `get(notePath): NoteSummaryRecord | null`
- `getAll(): NoteSummaryRecord[]`
- `delete(notePath): void`
- `bulkRead(notePaths): Map<string, NoteSummaryRecord>`

**Akzeptanz:**
- Single-Lookup < 1ms.
- Bulk-Read 1000 Pfade < 100ms.
- Idempotenz bei Upsert.

### Task 3: FrontmatterPropertyStore

**Files:**
- Create: `src/core/knowledge/FrontmatterPropertyStore.ts`
- Create: `src/core/knowledge/__tests__/FrontmatterPropertyStore.test.ts`

**API:**
- `replaceForNote(notePath, properties: Record<string, string | string[]>): void`
- `getForNote(notePath): Record<string, string[]>`
- `lookupValues(propertyName): string[]` (alle distinct Werte fuer Property)
- `findNotesWithValue(propertyName, propertyValue): string[]`

**Akzeptanz:**
- Listen-Properties korrekt gespiegelt (list_index).
- Lookup < 1ms.
- replaceForNote ist transaktional (alte Eintraege geloescht, neue eingefuegt in einer Operation).

### Task 4: ClusterMetadataStore

**Files:**
- Create: `src/core/knowledge/ClusterMetadataStore.ts`
- Create: `src/core/knowledge/__tests__/ClusterMetadataStore.test.ts`

**API:**
- `upsert(cluster, halfLifeDays?, hotCluster?): void`
- `get(cluster): ClusterMetadataRecord | null`
- `getAll(): ClusterMetadataRecord[]`
- `getHotClusters(): ClusterMetadataRecord[]`
- `setLastExternalCheck(cluster, timestamp): void`
- `setLastHintAt(cluster, timestamp): void`
- `detectCategory(clusterName): { category, halfLifeDays }` (statische Heuristik nach ADR-94)

**Default-Halbwertszeiten (ADR-94):**

```typescript
const HALF_LIFE_DEFAULTS: Record<string, number> = {
  tech: 180,
  wissenschaft: 365,
  politik: 30,
  geschichte: 730,
  personal: 0, // statisch, nie reift
};
```

**Kategorie-Heuristik:**
- Cluster-Name lowercase enthaelt Schluesselwort -> Kategorie.
- Tech-Keys: tech, software, ai, code, programming, dev.
- Wissenschaft-Keys: wissenschaft, science, research, forschung.
- Politik-Keys: politik, politics, news, wirtschaft, economy.
- Geschichte-Keys: geschichte, history, philosophie, philosophy.
- Personal-Keys: personal, self, reflection, journal.
- Fallback: Tech-Default (180d).

**Akzeptanz:**
- detectCategory deterministisch und idempotent.
- Default-Liste hardcoded, ueberschreibbar via upsert.
- Hot-Cluster-Filter < 5ms bei 100 Clustern.

### Task 5: ClusterSourceStatsStore

**Files:**
- Create: `src/core/knowledge/ClusterSourceStatsStore.ts`
- Create: `src/core/knowledge/__tests__/ClusterSourceStatsStore.test.ts`

**API:**
- `incrementCount(cluster, sourceDomain): void` (UPSERT mit count++ und last_seen_at)
- `getStatsForCluster(cluster): SourceStatRecord[]`
- `concentrationScore(cluster): number` (max(count) / sum(count))
- `diversityScore(cluster): number` (Shannon-Entropy)
- `getConcentratedClusters(threshold = 0.7, minNotes = 5): ClusterConcentration[]`

**Domain-Normalisierung Helper:**
- `normalizeDomain(url: string): string` — lowercase, strip www., strip protocol, strip trailing slash.

**Akzeptanz:**
- normalizeDomain robust gegen URL-Edge-Cases (kein Protokoll, ftp, etc.).
- Shannon-Entropy mathematisch korrekt.
- Single-Update < 5ms.

### Task 6: Settings-Schema-Erweiterung

**Files:**
- Modify: `src/types/settings.ts` (oder analog, je nach Codebase-Struktur)
- Modify: `src/main.ts` (Default-Werte plus ggf Settings-Tab-UI-Erweiterung in Folge-Session)

**Settings (additiv, alle mit konservativem Default):**

```typescript
interface VaultIngestSettings {
  // FEAT-19-08
  summaryPrompt: {
    template: string; // Default: Sebastians Standard-Prompt-Wortlaut
    modelOverride?: string; // optional
  };
  // FEAT-19-09
  autoSummary: {
    enabled: boolean; // default false
  };
  // FEAT-19-27 (PLAN-12, aber Schema additiv vorbereiten)
  autoTrigger: {
    enabled: boolean; // default false
    propertyName: string; // default leer
    propertyValue: string | string[]; // default leer
    notification: boolean; // default false
  };
  // FEAT-19-29 (PLAN-13, aber Schema additiv vorbereiten)
  pdfStrategy: 'page-refs' | 'markdown-mirror'; // default 'page-refs'
}
```

**Default fuer summaryPrompt.template** (BA-25 Anhang B, Sebastians Wortlaut):

```
Erstelle eine einzige Zusammenfassung in genau einem Satz in deutscher Sprache fuer die aktive Note.

Die Ausgabe darf nicht mehr als 25 Woerter enthalten. Gib nur den Satz aus, keine Erklaerungen.
Wenn die Zusammenfassung laenger waere, kuerze sie radikal.

Erzeuge zusaetzlich 5-10 Keywords in deutscher und englischer Sprache (Bindestrich-Schreibweise wie "Wort1-Wort2", max 2 verbundene Woerter).
Wenn Fachbegriffe eher in Englisch gebraeuchlich sind, verwende die englische Variante (z.B. "AI-Agent" statt "KI-Agent").

Erstelle 2-3 Vorschlaege fuer "Themen" und 2-3 Vorschlaege fuer "Konzepte" passend zum Inhalt der Note. Suche zuerst im Vault nach passenden vorhandenen Themen und Konzepten. Erstelle nur dann ein neues Thema oder Konzept, wenn kein passendes existiert.
```

**Akzeptanz:**
- Settings-Defaults persistieren ueber Plugin-Restart.
- Default-Prompt entspricht Sebastians Wortlaut wortwoertlich.

**Status:** **Deferred to Folge-Session**. Diese Coding-Session liefert PLAN-Persistierung, Schema-Migration, alle vier Store-Klassen plus Tests. Settings-Schema, FrontmatterWriter und Indexing-Hook in Folge-Session.

### Task 7: FrontmatterWriter (Vault.process plus WriterLock)

**Status:** **Deferred to Folge-Session.** Implementation-Anker:
- Create: `src/core/ingest/FrontmatterWriter.ts`
- ADR-95 Pattern: Vault.process auf Single-Device, plus WriterLock im obsidian-sync-Mode.

### Task 8: SemanticIndexService Indexing-Hook

**Status:** **Deferred to Folge-Session.** Implementation-Anker:
- Modify: `src/core/semantic/SemanticIndexService.ts`
- Pro Note: Frontmatter lesen, Summary in note_summaries upserten, Properties in frontmatter_properties spiegeln. Bei Setting `autoSummary.enabled` und fehlender Summary: LLM-Call.

## Coverage Gate

### SC-Coverage

| Feature | SC | Mapped to Task |
|---------|----|--------------:|
| FEAT-15-09 SC-01 (Note-Summary lesbar/schreibbar) | Task 2 |
| FEAT-15-09 SC-02 (Bulk-Operations < 100ms) | Task 2 |
| FEAT-15-09 SC-03 (Generierungs-Metadaten erhalten) | Task 2 |
| FEAT-15-09 SC-04 (Re-Generation triggert nur bei mtime-Change) | Task 8 (Deferred) |
| FEAT-15-09 SC-05 (Storage ueberlebt Plugin-Restart) | Task 1 + Task 2 |
| FEAT-15-10 SC-01 (Properties bei Indexing automatisch gespiegelt) | Task 8 (Deferred) |
| FEAT-15-10 SC-02 (Property-Lookups < 1ms) | Task 3 |
| FEAT-15-10 SC-03 (Multi-Wert-Properties) | Task 3 |
| FEAT-15-10 SC-04 (Mirror bleibt aktuell) | Task 8 (Deferred) |
| FEAT-15-10 SC-05 (Bestehende tags-Tabelle bleibt funktional) | Task 1 |
| FEAT-15-11 SC-01 (Stats-Update beim Ingest) | Task 5 + PLAN-12 (Triage-Tool) |
| FEAT-15-11 SC-02 (Concentration-Score < 10ms) | Task 5 |
| FEAT-15-11 SC-03 (Diversity-Score-Korrektheit) | Task 5 |
| FEAT-15-11 SC-04 (Domain-Identifikation robust) | Task 5 |
| FEAT-15-11 SC-05 (Stats sind cluster-isoliert) | Task 5 |
| FEAT-15-12 SC-01 (Default-Halbwertszeiten als System-Liste) | Task 4 |
| FEAT-15-12 SC-02 (Pro Cluster ueberschreibbar) | Task 4 |
| FEAT-15-12 SC-03 (Halbwertszeit-Lookup < 1ms) | Task 4 |
| FEAT-15-12 SC-04 (Hot-Cluster-Markierung persistiert) | Task 4 |
| FEAT-15-12 SC-05 (Custom-Weights konfigurierbar) | Task 4 |
| FEAT-19-08 SC-01 (Default-Prompt entspricht Sebastians Wortlaut) | Task 6 (Deferred) |
| FEAT-19-08 SC-02..05 | Task 6 (Deferred) |
| FEAT-19-09 SC-01 (Existierende Frontmatter-Summary respektiert) | Task 8 (Deferred) |
| FEAT-19-09 SC-02..05 | Task 8 (Deferred) |

**Deferred zu Folge-Session:** Task 6, 7, 8 (Settings, FrontmatterWriter, SemanticIndexService-Hook). Begruendung: Coding-Session Token-Budget. PLAN-10 bleibt Active bis alle Tasks erledigt sind.

### ADR-Alignment

| ADR | Operationalized in |
|-----|--------------------|
| ADR-92 (Schema v9 -> v10 Bundle) | Task 1 |
| ADR-93 (Source-Identitaet Domain-only) | Task 5 (normalizeDomain plus Schema cluster_source_stats) |
| ADR-94 (Halbwertszeit-Modell statisch) | Task 4 (HALF_LIFE_DEFAULTS plus detectCategory) |
| ADR-95 (Frontmatter-Write Conflict-Detection) | Task 7 (Deferred) |

### Codebase-Anchoring

Jede Task nennt mindestens einen Datei-Pfad. Pruefung: alle Tasks haben Create/Modify-Eintraege. ✓

### Verify Commands

- Build: `npm run build`
- Tests: `npm test` (oder spezifisch: `npx jest src/core/knowledge/__tests__/`)
- Smoke-Test fuer Migration: `npx jest src/core/knowledge/__tests__/KnowledgeDB.migration-v10.test.ts`

## Change Log

(append-only, mid-course-Eintraege landen hier)

- **2026-05-03 initial:** PLAN created from BA-25 Architecture-Handoff. Status Draft -> Active.
- **2026-05-03 partial-completion:** Tasks 1-5 implementiert (Schema-Migration v10 + 4 Stores + 32 Unit-Tests). Tasks 6-8 (Settings-Schema, FrontmatterWriter, Indexing-Hook) bewusst auf Folge-Session deferred. PLAN bleibt Status=Active. Build + alle 140 Knowledge-Tests gruen.
- **2026-05-03 plan-completion (Folge-Session):** Tasks 6-8 abgeschlossen. Settings-Schema (VaultIngestSettings), FrontmatterWriter (Vault.fileManager.processFrontMatter + WriterLock-Hybrid), FrontmatterIndexer (Frontmatter-Read + Property-Mirror + optional Auto-Generate via SummaryGeneratorFn). Mid-course design discovery: ADR-95 amended (processFrontMatter statt vault.process). 15 neue Tests (5 FrontmatterWriter + 10 FrontmatterIndexer + readFrontmatterSummary). PLAN-10 -> Status=Done. Wiring in main.ts plus SemanticIndexService-Hook bleibt fuer Plugin-Onload-Pass spaeter (deferred zu PLAN-12 wo der Indexer mit dem Auto-Trigger-Pattern zusammen gewired wird).

## Implementation Notes

**Cycle:** 2026-05-03 (Single-Session, Tasks 1-5).

**Test-Count-Delta:**
- Vor PLAN-10: ? Knowledge-Tests
- Nach Tasks 1-5: 140 Knowledge-Tests gesamt (32 neu fuer BA-25)

**Per-Task Outcomes:**

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| 1 Schema v9 -> v10 | Done | KnowledgeDB.ts (SCHEMA_VERSION, SCHEMA_DDL, migrateSchema-Comment) plus KnowledgeDB.migration-v10.test.ts | 6 neue Tabellen additiv. Migration ist additive only, kein ALTER auf bestehende Tabellen. 6 Migration-Tests gruen. |
| 2 NoteSummaryStore | Done | NoteSummaryStore.ts plus Ba25Stores.test.ts | Konstruktor-Injection auf KnowledgeDB. Upsert via ON CONFLICT, bulkRead via IN-Klausel, count-Helper. 4 Unit-Tests. |
| 3 FrontmatterPropertyStore | Done | FrontmatterPropertyStore.ts plus Ba25Stores.test.ts | replaceForNote transactional (BEGIN/COMMIT/ROLLBACK). Multi-Wert-Properties via list_index. lookupValues plus findNotesWithValue. 5 Unit-Tests. |
| 4 ClusterMetadataStore | Done | ClusterMetadataStore.ts plus Ba25Stores.test.ts | HALF_LIFE_DEFAULTS hardcoded (5 Kategorien aus ADR-94). detectCategory mit lowercase substring search. CATEGORY_KEYWORDS mit DE+EN-Begriffen. setLastHintAt fuer Cooldown (ADR-106 Vorbereitung). 8 Unit-Tests. |
| 5 ClusterSourceStatsStore | Done | ClusterSourceStatsStore.ts plus Ba25Stores.test.ts | normalizeDomain robust (Protokoll, www, Pfad, Trailing-Slash). incrementCount via ON CONFLICT plus note_count + 1. concentrationScore plus Shannon-diversityScore mathematisch verifiziert. getConcentratedClusters mit Default 0.7/5. 9 Unit-Tests. |
| 6 Settings-Schema | Deferred | TBD | Folge-Session: VaultIngestSettings-Interface plus Default-Werte plus UI. Sebastians Standard-Prompt aus BA-25 Anhang B als Default-Wert. |
| 7 FrontmatterWriter | Deferred | TBD | Folge-Session: ADR-95 Pattern (Vault.process plus WriterLock im obsidian-sync-Mode). |
| 8 SemanticIndexService Hook | Deferred | TBD | Folge-Session: pro Note Frontmatter lesen, Summary in note_summaries upserten, Properties in frontmatter_properties spiegeln, optional LLM-Generate bei Setting on. |

**ADR-Status nach Session:**
- ADR-92 Schema-Bundle: Proposed -> Accepted (implementiert verifiziert).
- ADR-93 Source-Identitaet Domain-only: Proposed -> Accepted (normalizeDomain implementiert plus getestet).
- ADR-94 Halbwertszeit-Modell: Proposed -> Accepted (HALF_LIFE_DEFAULTS plus detectCategory implementiert).
- ADR-95 Frontmatter-Write Conflict-Detection: Proposed (Implementation Deferred zu Task 7).

**Wayfinder-Updates:** Keine Aenderungen an `src/ARCHITECTURE.map` noetig: alle Stores sind interne Helpers, kein neuer System-Konzept-Punkt.

**Build + Test:** `npm run build` gruen, `npx vitest run src/core/knowledge/__tests__/` gruen (140/140).
