# ADR-51: 4-Stufen Retrieval-Pipeline

**Date:** 2026-03-29 (updated 2026-03-30)
**Deciders:** Sebastian Hanke

## Context

Die aktuelle Suche in Obsilo ist ein einfacher Cosine-Similarity-Lookup: Query embedden, gegen alle Chunk-Vektoren vergleichen, besten Chunk pro Datei zurueckgeben. Dies ignoriert den reichen Obsidian-Graph (Wikilinks, Tags, MOC-Properties), erkennt keine impliziten Verbindungen, und liefert nur isolierte Chunks ohne Kontext.

Der User will vernetztes Denken: implizite Verbindungen erkennen, MOC-Struktur nutzen, zusammenhaengende Informationen statt isolierte Chunks.

**Triggering ASRs:**
- ASR-3 (FEAT-15-02): Incremental Graph Updates
- ASR-4 (FEAT-15-04): Graceful Degradation (jede Stufe ueberspringbar)
- ASR-6 (FEAT-15-03): Scalable Pairwise Computation

## Decision Drivers

- **Vernetztes Denken**: Ergebnisse muessen strukturelle und semantische Zusammenhaenge zeigen
- **Graceful Degradation**: Jede Stufe muss optional sein (Mobile: kein Reranking; neuer Vault: kein Graph)
- **Performance**: Gesamte Pipeline <300ms (mit Reranking), <100ms (ohne)
- **Bestehende API**: `semantic_search` Tool-Signatur muss kompatibel bleiben
- **Token-Budget**: Ergebnisse muessen in endliches LLM-Context-Window passen

## Considered Options

### Option 1: Starre 4-Stufen-Kette (immer alle Stufen)

Jede Suche durchlaeuft immer: Vector -> Graph -> Implicit -> Rerank.

- Pro: Einfache Implementierung, deterministisches Verhalten
- Con: Scheitert wenn eine Stufe nicht verfuegbar ist (kein Graph, kein Reranker)
- Con: Overhead fuer einfache Queries die keinen Graph brauchen

### Option 2: Konfigurierbare Pipeline (Stufen einzeln an/aus)

Jede Stufe ist ein eigenstaendiger Service. Pipeline-Orchestrator ruft nur aktivierte Stufen auf. Ergebnisse werden zwischen Stufen als vereinheitlichtes `SearchResult[]` Format weitergereicht.

- Pro: Graceful Degradation -- Mobile hat kein Reranking, neuer Vault hat keinen Graph
- Pro: Performance -- einfache Queries koennen Stufen ueberspringen
- Pro: Testbar -- jede Stufe unabhaengig testbar
- Pro: Erweiterbar -- neue Stufen (z.B. Full-Text) leicht hinzufuegbar
- Con: Komplexere Architektur (Orchestrator + einheitliches Result-Format)
- Con: Ergebnis-Fusion zwischen Stufen braucht Scoring-Strategie

### Option 3: Single monolithischer Retriever (alles in einer Methode)

Eine grosse search() Methode die alle Logik enthaelt, mit if-Bedingungen fuer optionale Teile.

- Pro: Einfach zu verstehen (alles an einem Ort)
- Con: Nicht testbar, nicht erweiterbar, nicht konfigurierbar
- Con: Wiederholt das aktuelle Problem (SemanticIndexService ist bereits monolithisch)

## Decision

**Vorgeschlagene Option:** Option 2 -- Konfigurierbare Pipeline

**Begruendung:**
ASR-4 verlangt Graceful Degradation -- eine starre Kette scheitert daran. Die Pipeline-Architektur erlaubt Mobile-Support (ohne Reranking), frische Vaults (ohne Graph), und User-Konfiguration (Stufen an/aus). Das einheitliche `SearchResult[]` Format zwischen Stufen macht die Pipeline erweiterbar.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Jede Stufe unabhaengig entwickelbar und testbar
- Mobile nutzt Stufe 1-3 (ohne Rerank), Desktop alle 4
- User kann Stufen in Settings deaktivieren
- Neue Stufen (z.B. Full-Text Search, Temporal Ranking) spaeter einfach hinzufuegbar

### Negative
- Scoring-Fusion zwischen Stufen ist nicht trivial (wie kombiniert man Cosine-Score mit Graph-Hop-Distance?)
- Pipeline-Orchestrator ist eine neue Abstraktion die gewartet werden muss
- Mehr Dateien / Services als die aktuelle monolithische Loesung

### Risks
- **Score-Normalisierung**: Cosine-Similarity (0-1) und Graph-Hop (1-2) haben verschiedene Skalen. Mitigation: Gewichtete Kombination mit konfigurierbaren Gewichten.
- **Latenz-Kumulierung**: 4 Stufen hintereinander koennten >300ms werden. Mitigation: Stufe 2+3 parallel ausfuehrbar (beide arbeiten auf DB-Queries, nicht auf API-Calls).

## Implementation Notes

### Pipeline-Architektur

```typescript
interface RetrievalStage {
    name: string;
    enabled: boolean;
    execute(input: SearchContext): Promise<SearchResult[]>;
}

interface SearchContext {
    query: string;
    queryVector: Float32Array;
    topK: number;
    results: SearchResult[];      // Akkumuliert ueber Stufen
    settings: KnowledgeSettings;
}

interface SearchResult {
    path: string;
    text: string;                 // Chunk-Text (ggf. mit Adjacent)
    score: number;                // Normalisierter Relevanz-Score (0-1)
    source: 'vector' | 'graph' | 'implicit';
    context?: string;             // "via [[Kuenstliche Intelligenz]]" etc.
    chunkIndex?: number;
}

class RetrievalPipeline {
    private stages: RetrievalStage[] = [];

    async search(query: string, topK: number): Promise<SearchResult[]> {
        const queryVector = await this.embed(query);
        const ctx: SearchContext = { query, queryVector, topK, results: [], settings };

        for (const stage of this.stages) {
            if (!stage.enabled) continue;
            ctx.results = await stage.execute(ctx);
        }

        return ctx.results.slice(0, topK);
    }
}
```

### Stufe 0: Contextual Enrichment (Two-Pass Background)

```
Implementierung: Two-Pass-System (Entscheidung 2026-03-30)

Problem:  Single-Pass (Haiku-Call pro Chunk im buildIndex-Loop) machte den
          Full Build von ~5 Min auf ~12h langsam -- unakzeptabel.

Loesung:  Enrichment als separater Background-Pass.

Pass 1 (buildIndex -- schnell, ~5 Min):
  Chunk-Text -> Embedding (Qwen) -> DB (enriched=0)
  Index ist sofort nutzbar fuer Suche.

Pass 2 (runBackgroundEnrichment -- automatisch im Hintergrund):
  getUnenrichedChunks(WHERE enriched=0) -> Haiku-Prefix -> Re-Embedding -> DB (enriched=1)
  Suche funktioniert durchgehend, Qualitaet verbessert sich ueber Zeit.

Steuerung:
  - Startet automatisch nach buildIndex() wenn Contextual Retrieval aktiviert
  - Startet automatisch nach Plugin-Reload wenn unenriched Chunks existieren
  - Contextual Retrieval Toggle steuert Start/Stop
  - Resumable: Crash/Cancel verliert max 1 Chunk (Query: WHERE enriched=0)
  - Model-Wechsel: Reset enriched=0 + Neustart

Schema: vectors.enriched INTEGER NOT NULL DEFAULT 0 (Schema v2)

Technik: Anthropic Contextual Retrieval
  1. Pro Chunk: LLM-Call generiert 2-3 Saetze Kontext-Prefix
  2. Prefix + Original-Text werden zusammen embeddet
  3. Enriched Text wird als 'text' in vectors-Tabelle gespeichert

Beispiel:
  Original: "Q3 revenue grew 20% year-over-year."
  Prefix:   "From Acme Corp 2025 Annual Report, Financial Highlights section."
  Enriched: "From Acme Corp 2025 Annual Report, Financial Highlights section.\n\nQ3 revenue grew 20% year-over-year."
  -> Embedding enthaelt semantisch "Acme Corp" + "Annual Report" + "Q3 Revenue"

Kosten: ~$0.15-1.50 einmalig fuer 800 Notes (2.400 Chunks mit Haiku)
        ~$0.001 pro inkrementelles File-Update
LLM:    Konfigurierbares Modell (default: guenstigstes verfuegbares)
```

### Stufe 1: VectorSearchStage

```
Input:  queryVector
Output: Top-N Chunks sortiert nach Cosine-Similarity
        + Score-Gated Adjacent Chunks (nur wenn similarity > threshold)
        + Multi-Chunk pro Datei (bis zu 3)

Adjacent Chunks: Nachbar-Chunks werden nur mitgeliefert wenn ihre
  Cosine-Similarity zum Query-Vektor ueber einem Threshold liegt (default 0.3).
  Verhindert irrelevanten Kontext bei Thema-Wechseln innerhalb einer Datei.

Implementierung: Bulk-Load Vektoren aus SQLite, JS Cosine-Similarity
Performance: <50ms fuer 6K Vektoren
```

### Stufe 2: GraphExpansionStage (Implementiert: FEAT-15-02)

```
Input:  Stufe-1 Ergebnisse (Pfade der Treffer)
Output: Stufe-1 + erweiterte Notes (1-3 Hops ueber Wikilinks/MOC)
        Jeder erweiterte Treffer hat context: "via [[Link]] (PropertyName)"

Implementierung: GraphStore.getNeighbors() -- BFS auf edges-Tabelle, bidirektional
  - Body-Wikilinks: link_type='body'
  - MOC-Properties: link_type='frontmatter', property_name='Themen'/'Konzepte'/etc.
  - Konfigurierbar: 1-3 Hops, MOC-Property-Namen in Settings

Key Files:
  - src/core/knowledge/GraphStore.ts (BFS + CRUD)
  - src/core/knowledge/GraphExtractor.ts (metadataCache -> edges/tags)

Performance: <10ms (DB Lookup)
Parallel mit Stufe 3 ausfuehrbar
```

### Stufe 3: ImplicitConnectionStage (Implementiert: FEAT-15-03)

```
Input:  Stufe-1+2 Ergebnisse (Pfade der Treffer)
Output: Stufe-1+2 + implizit verwandte Notes (hohe Similarity, kein Link)
        Jeder Treffer hat source: 'implicit', score aus implicit_edges

Implementierung: SQL Query auf implicit_edges-Tabelle
Performance: <5ms (DB Lookup)
Parallel mit Stufe 2 ausfuehrbar
```

### Stufe 4: RerankingStage (Implementiert: FEAT-15-04)

```
Input:  Alle bisherigen Ergebnisse (~20 Kandidaten)
Output: Top-K reranked (Cross-Encoder Score ersetzt bisherigen Score)

Implementierung: @huggingface/transformers (WASM) mit ms-marco-MiniLM-L-6-v2 (INT8)
  - Kein Native Addon (reines JS + WASM)
  - Modell ~23MB, automatischer Download + Cache via transformers.js
  - Lazy Load: Modell wird erst beim ersten rerank() geladen

Key Files:
  - src/core/knowledge/RerankerService.ts

Performance: <200ms auf Desktop (WASM)
Fallback: Nicht ausgefuehrt auf Mobile oder wenn deaktiviert
```

### Ergebnis-Fusion (Score-Normalisierung)

```typescript
// Gewichtete Kombination
const WEIGHTS = {
    vector: 0.5,    // Cosine Similarity (Stufe 1)
    graph: 0.3,     // Graph-Naehe (Stufe 2) -- 1/hop_distance
    implicit: 0.2,  // Implicit Similarity (Stufe 3)
};

// Nach Reranking (Stufe 4): Rerank-Score ersetzt den kombinierten Score
// (Cross-Encoder betrachtet Query+Text gemeinsam = zuverlaessigster Score)
```

### Settings-Integration

```typescript
interface KnowledgeLayerSettings {
    // Stufe 0 (Index-Zeit)
    enableContextualRetrieval: boolean; // default: true
    contextualModel: string;            // default: guenstigstes Embedding-Provider-Modell

    // Stufe 1
    enableSemanticIndex: boolean;       // existiert bereits
    adjacentChunks: number;             // default: 1 (chunk-1 + chunk+1)
    adjacentThreshold: number;          // default: 0.3 (min similarity fuer Adjacent)
    maxChunksPerFile: number;           // default: 3

    // Stufe 2
    enableGraphExpansion: boolean;      // default: true
    graphHops: number;                  // default: 1, max: 2
    mocProperties: string[];            // default: ['Themen', 'Konzepte', 'Personen', ...]

    // Stufe 3
    enableImplicitConnections: boolean; // default: true
    implicitThreshold: number;          // default: 0.7
    enableActiveProposals: boolean;     // default: true

    // Stufe 4
    enableReranking: boolean;           // default: true (Desktop), false (Mobile auto)
    rerankModel: string;                // default: 'bge-reranker-v2-m3'
    rerankCandidates: number;           // default: 20
}
```

## Related Decisions

- ADR-50: SQLite Knowledge DB (Storage-Grundlage)
- ADR-52: Reranker Integration (Stufe 4 Detail)

## References

- FEAT-15-01: Enhanced Vector Retrieval
- FEAT-15-02: Graph Extraction & Expansion
- FEAT-15-03: Implicit Connections
- FEAT-15-04: Local Reranking
