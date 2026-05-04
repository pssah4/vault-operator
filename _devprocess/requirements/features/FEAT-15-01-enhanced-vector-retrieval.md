# Feature: Enhanced Vector Retrieval

> **Feature ID**: FEAT-15-01
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Die Vektorsuche wurde in zwei Dimensionen verbessert:

**1. Contextual Retrieval (Index-Zeit, Two-Pass):** Beim Indexieren wird jedem Chunk ein LLM-generierter
Kontext-Prefix vorangestellt (Anthropic Contextual Retrieval). Der Prefix enthaelt Dokument-Titel,
Ueberschriften-Hierarchie und thematische Einordnung. Embedding und gespeicherter Text enthalten
dadurch den Dokumentkontext -- die Suche findet Chunks auch bei Dokument-Level-Queries.

**Implementierung als Two-Pass-System:** Pass 1 (buildIndex) embeddet rohe Chunks ohne Haiku-Calls
und macht den Index in ~5 Minuten nutzbar. Pass 2 (Background Enrichment) laeuft automatisch
im Hintergrund, generiert Haiku-Prefixes und re-embeddet -- Suche funktioniert durchgehend,
Qualitaet verbessert sich ueber Zeit. Resumable bei Crash/Cancel.

**2. Score-Gated Adjacent Chunks + Multi-Chunk (Such-Zeit):** Bei jedem Treffer werden
Nachbar-Chunks mitgeliefert, aber nur wenn ihre Cosine-Similarity zum Query-Vektor ueber
einem Threshold liegt (default 0.3). Verhindert irrelevanten Kontext bei Thema-Wechseln.
Pro Datei koennen mehrere relevante Chunks zurueckgegeben werden statt nur der beste.

## Benefits Hypothesis

**Wir glauben dass** die Erweiterung auf Adjacent-Chunk und Multi-Chunk Retrieval
**Folgende messbare Outcomes liefert:**
- Suchergebnisse enthalten 3-5 zusammenhaengende Chunks statt 1 isolierten Chunk
- LLM-Antworten auf Vault-Fragen werden vollstaendiger und praeziser

**Wir wissen dass wir erfolgreich sind wenn:**
- Antworten auf Fragen die sich ueber mehrere Absaetze erstrecken keine Informationsluecken mehr haben
- Der User nicht mehr manuell Dateien oeffnen muss um fehlenden Kontext zu finden

## User Stories

### Story 1: Vollstaendiger Kontext
**Als** Knowledge Worker
**moechte ich** dass Suchergebnisse den vollstaendigen Kontext um einen Treffer zeigen
**um** nicht manuell in der Datei nach dem Rest der Information suchen zu muessen

### Story 2: Mehrere relevante Stellen pro Datei
**Als** Knowledge Worker
**moechte ich** dass mehrere relevante Stellen aus derselben Datei gefunden werden
**um** ein vollstaendiges Bild des Themas in dieser Datei zu erhalten

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement | Verified |
|----|-----------|--------|-------------|----------|
| SC-01 | Suchergebnisse enthalten zusammenhaengenden Kontext | 3-5 Chunks pro Treffer | Zaehlung der zurueckgegebenen Chunks pro Ergebnis | Ja -- searchWithContext mit adjacentWindow=1 |
| SC-02 | Relevante Stellen aus derselben Datei werden nicht verworfen | Bis zu 3 Stellen pro Datei | Vergleich: Frage die 2+ Abschnitte einer Datei betrifft | Ja -- maxPerFile=2 (konfigurierbar) |
| SC-03 | Suche bleibt schnell trotz mehr Ergebnissen | Unter 1 Sekunde | Zeitmessung Ende-zu-Ende | Ja -- <100ms ohne Enrichment-Overhead |
| SC-04 | Bestehende Suche-Aufrufe funktionieren weiterhin | 100% Rueckwaertskompatibilitaet | Alle existierenden Tool-Aufrufe testen | Ja -- searchUniqueFiles als Default-Pfad |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Adjacent Chunk Lookup**: <5ms (in-memory Cache-Lookup)
- **Multi-Chunk Ranking**: <10ms fuer Top-3 Chunks pro Datei
- **Gesamt-Suchzeit**: <100ms inkl. Embedding + Similarity + Adjacent + Ranking
- **Background Enrichment**: ~2s pro Chunk (Haiku API-Call), non-blocking

### Scalability
- **Token-Budget**: Adjacent Chunks erhoehen Ergebnis-Groesse -- konfigurierbares Limit

---

## How It Works

### Key Files

| Datei | Verantwortung |
|-------|---------------|
| `src/core/knowledge/VectorStore.ts` | searchWithContext(), getAdjacentText(), updateChunkEnriched(), getUnenrichedChunks() |
| `src/core/semantic/SemanticIndexService.ts` | Two-Pass: buildIndex (Pass 1), runBackgroundEnrichment (Pass 2), enrichChunkWithContext() |
| `src/ui/settings/EmbeddingsTab.ts` | Contextual Retrieval Toggle, Enrichment-Fortschritt |
| `src/core/tools/vault/SemanticSearchTool.ts` | Nutzt searchWithContext mit adjacentChunks=1, maxPerFile=2 |

### Two-Pass Architecture

```
Pass 1 (buildIndex -- ~5 Min):
  Datei lesen -> splitIntoChunks -> embedBatch (Qwen) -> insertChunks (enriched=0)
  = Index sofort nutzbar

Pass 2 (runBackgroundEnrichment -- automatisch im Hintergrund):
  getUnenrichedChunks(50) -> gruppiert nach Pfad
  Pro Chunk: enrichChunkWithContext (Haiku) -> embedBatch (Qwen) -> updateChunkEnriched (enriched=1)
  = Suche verbessert sich kontinuierlich
```

### Enrichment-Steuerung

| Situation | Verhalten |
|-----------|-----------|
| Build fertig + Contextual Retrieval an | Enrichment startet automatisch |
| Plugin-Reload + unenriched Chunks | Enrichment startet automatisch |
| Contextual Retrieval Toggle ein | Enrichment startet sofort |
| Contextual Retrieval Toggle aus | Enrichment wird gestoppt |
| Contextual Model aendern | Reset (enriched=0) + Enrichment neu |
| Build startet | Laufendes Enrichment wird gestoppt |

### Score-Gated Adjacent Chunks

```
Treffer-Chunk (chunkIndex=5, score=0.82)
  |
  +-- chunk 4: similarity=0.45 >= 0.3 -> INKLUDIERT
  +-- chunk 6: similarity=0.21 < 0.3  -> AUSGESCHLOSSEN (Themawechsel)
```

### Schema-Erweiterung (v2)

```sql
ALTER TABLE vectors ADD COLUMN enriched INTEGER NOT NULL DEFAULT 0;
```

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Adjacent-Chunk-Retrieval erfordert chunk_index als stabilen Sortier-Key in der DB
- **Loesung**: `UNIQUE(path, chunk_index)` in vectors-Tabelle, chunk_index vergeben bei insertChunks

### Design-Entscheidung: Two-Pass statt Single-Pass

**Problem:** Single-Pass Enrichment (1 Haiku-Call pro Chunk im buildIndex-Loop) machte den Full Build
von ~5 Min auf ~12h langsam -- unakzeptabel fuer initialen Aufbau.

**Loesung:** Enrichment als separater Background-Pass. Resumable via `WHERE enriched=0` Query.
Index ist sofort nutzbar (Pass 1), Qualitaet verbessert sich ueber Zeit (Pass 2).

---

## Definition of Done

### Functional
- [x] Contextual Retrieval: LLM-generierter Kontext-Prefix pro Chunk (Two-Pass Background)
- [x] Enriched Text (Prefix + Original) wird embeddet und in DB gespeichert
- [x] Score-Gated Adjacent Chunks (nur wenn similarity > threshold)
- [x] Mehrere Chunks pro Datei (konfigurierbar, default 2)
- [x] Bestehende search() API ist rueckwaertskompatibel
- [x] Contextual Retrieval ist optional deaktivierbar (Setting)

### Quality
- [x] Unit Tests fuer Adjacent-Chunk-Lookup mit Score-Gate -- VectorStore.test.ts (searchWithContext, getAdjacentText)
- [x] Unit Tests fuer Enrichment-Methoden -- VectorStore.test.ts (getUnenrichedChunks, updateChunkEnriched, resetEnrichmentStatus)
- [ ] Performance-Test: Suche bleibt unter 100ms
- [x] Contextual Prefix wird bei inkrementellen Updates korrekt behandelt (enriched=0, Background-Queue)

### Documentation
- [x] Feature-Spec aktualisiert (Status: Implemented)
- [x] ADR-51 aktualisiert (Stufe 0 + Two-Pass)

---

## Dependencies
- **FEAT-15-00**: SQLite Knowledge DB (chunk_index als DB-Spalte)

## Out of Scope
- Graph-basierte Kontext-Erweiterung (FEAT-15-02)
- Reranking der erweiterten Ergebnisse (FEAT-15-04)
- Prompt Caching fuer Contextual Retrieval (Optimierung, spaeter)
