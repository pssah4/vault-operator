# Epic: Unified Knowledge Layer

> **Epic ID**: EPIC-15
> **Business Alignment**: _devprocess/analysis/BA-09-knowledge-layer.md
> **Scope**: MVP

## Epic Hypothesis Statement

FUER Obsidian-Power-User und externe LLM-Clients (via MCP)
DIE semantische Suche, vernetztes Denken und implizite Verbindungen in ihrem Vault benoetigen
IST DER Unified Knowledge Layer
EIN 4-Stufen Hybrid-Retrieval-System mit lokaler Wissensdatenbank
DAS zuverlaessige semantische Suche, Graph-basierte Kontexterweiterung und aktive Erkennung impliziter Verbindungen bietet
IM GEGENSATZ ZU isolierter Vektorsuche (vectra) die bei grossen Vaults scheitert und keine strukturellen Zusammenhaenge erkennt
UNSERE LOESUNG kombiniert Vektor-Aehnlichkeit mit dem existierenden Obsidian-Graph (Wikilinks, Tags, MOC-Properties) und lokalem Reranking zu einem vernetzten Wissenssystem bei minimalen Token-Kosten

## Business Outcomes (messbar)

1. **Suchzuverlaessigkeit**: Index-Build Erfolgsrate steigt von 0% (RangeError) auf 100% sofort nach Migration
2. **Suchqualitaet**: Retrieval-Precision steigt um 33-47% durch Reranking und Graph-Expansion innerhalb 4 Wochen nach Release
3. **Vernetztes Denken**: Implizite Verbindungen werden aktiv vorgeschlagen (0 -> N Vorschlaege pro Session) innerhalb 6 Wochen nach Release
4. **Storage-Effizienz**: Index-Groesse sinkt von 507MB (JSON) auf <120MB (SQLite BLOB) sofort nach Migration
5. **Mobile-Readiness**: Semantische Suche funktioniert auf Mobile (0% -> 100%) nach Migration

## Leading Indicators (Fruehindikatoren)

- **Index-Completion-Rate**: Anteil erfolgreich indexierter Dateien (Ziel: 100%, Baseline: 58%)
- **Incremental-Update-Zeit**: Dauer eines Delta-Updates nach Datei-Aenderung (Ziel: <5s)
- **Graph-Coverage**: Anteil der Notes mit extrahierten Wikilinks/Tags/MOC-Properties in der DB
- **Implicit-Edge-Count**: Anzahl vorberechneter impliziter Verbindungen (zeigt Vernetzungstiefe)
- **Reranker-Precision-Delta**: Subjektive Verbesserung der Top-5 Ergebnisse nach Reranking

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEAT-15-00 | SQLite Knowledge DB | P0 | L | Implemented |
| FEAT-15-01 | Enhanced Vector Retrieval | P0 | M | Implemented |
| FEAT-15-02 | Graph Data Extraction & Expansion | P0 | M | Implemented |
| FEAT-15-03 | Implicit Connection Discovery | P1 | M | Implemented |
| FEAT-15-04 | Local Reranking | P1 | M | Implemented (transformers.js WASM) |
| FEAT-15-05 | Knowledge Data Consolidation | P1 | M | Implemented |
| FEAT-15-06 | Implicit Connection UI | P2 | S | Implemented |
| FEAT-15-07 | Image OCR Indexing | P3 | S | Not Started |
| FEAT-15-08 | Storage Consolidation | P0 | M | Implemented |

**Priority:** P0-Critical (ohne geht MVP nicht), P1-High (wichtig), P2-Medium (wertsteigernd)
**Effort:** S (1-2 Sprints), M (3-5 Sprints), L (6+ Sprints)

## Explizit Out-of-Scope

- **Full GraphRAG (Microsoft)**: Indexierungskosten 100-1000x hoeher. Obsidian hat bereits einen expliziten Graph.
- **PageIndex / Vectorless RAG**: Fuer kurze Notes ungeeignet, designed fuer lange hierarchische Dokumente.
- **ColBERT / Late Interaction**: Multi-Vektor-Ansatz vervielfacht Storage, uebersteigt aktuellen Bedarf.
- **Cloud-basierte Vektor-DB**: Alles bleibt lokal.
- **Automatisches Link-Erstellen**: Vault Operator schlaegt vor, erstellt aber keine Links automatisch.
- **Natural Language Graph Queries**: Keine natuerlichsprachlichen Graph-Traversal-Abfragen.

## Dependencies & Risks

### Dependencies

- **sql.js (WASM)**: Muss stabil in Electron und Mobile WebViews laufen. Impact bei Inkompatibilitaet: Fallback auf Desktop-only.
- **ONNX Runtime (WASM/Node)**: Fuer lokales Reranking. Impact bei Wegfall: Reranking nur via API oder entfaellt.
- **Obsidian vault.adapter**: Muss binaere Dateien zuverlaessig lesen/schreiben. Impact bei Bugs: Persistenz-Probleme.
- **Phase 1 (Refactoring)**: Abgeschlossen. Saubere Codebase als Grundlage.

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| sql.js WASM laeuft nicht auf Obsidian Mobile | L | H | Fruehe PoC-Validierung. Fallback: Desktop-only Index, Mobile read-only. |
| BGE-Reranker ONNX zu gross/langsam fuer Desktop | M | M | Kleineres Modell (TinyBERT ~60MB). Reranking ist optional (Stufe 4). |
| Plugin Review-Bot lehnt sql.js ab | L | H | sql.js ist WASM, kein Native Addon. Praezedenz: andere Plugins nutzen sql.js. |
| Graph-Extraktion blockiert UI bei grossem Vault | M | M | Async mit Yield. Batch-Verarbeitung. Debounced Event-Handler. |
| Implicit Connections erzeugen zu viel Noise | M | M | Similarity-Threshold konfigurierbar (default 0.7). Feature deaktivierbar. |
| vectra-Migration bricht bestehende Daten | L | L | Einmalige Neuindexierung. Checkpoint-Format erkennen, clean rebuild. |
| ONNX Runtime nicht auf Mobile verfuegbar | H | L | Reranking nur auf Desktop. Mobile nutzt Cosine-Fallback (Stufe 1-3 reichen). |
