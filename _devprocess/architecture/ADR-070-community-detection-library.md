# ADR-070: Community Detection Library Selection

**Status:** Accepted
**Date:** 2026-04-11
**Deciders:** Sebastian Hanke

## Context

FEATURE-2002 (Community Detection) erfordert einen Community-Detection-Algorithmus
der auf dem GraphStore-Edge-Graphen laeuft, um emergente Themen-Cluster zu
erkennen. Der Algorithmus muss im Obsidian-Renderer-Prozess ausfuehrbar sein
(kein externer Server, kein Node.js child_process fuer Graph-Algorithmen).

Das Ergebnis sind Community-IDs pro Note, gespeichert in der OntologyStore.
Multiple Features haengen davon ab: Cluster-aware Retrieval (2004), God-Node
Split-Vorschlaege (2003), Batch-Ingest Gruppierung (2005), Knowledge Freshness
Missing-Connection-Analyse (2006).

**Triggering ASR:**
- Leiden algorithm must run in Obsidian renderer process (JS/WASM) -- FEATURE-2002
- Quality Attribute: Feasibility, Performance

## Decision Drivers

- **Obsidian-Kompatibilitaet:** Muss in Electron Renderer laufen (kein Node-only, kein Python)
- **Bundle-Groesse:** Obsidian Community Review-Bot achtet auf Plugin-Groesse. Grosse Dependencies sind ein Risiko.
- **Algorithmus-Qualitaet:** Leiden > Louvain (garantiert well-connected communities). Aber: Ist eine JS-Implementation verfuegbar?
- **Performance:** <5s fuer 1000 Nodes, <1s fuer 500 Nodes
- **Wartbarkeit:** Stabile Library bevorzugt gegenueber Custom-Port

## Considered Options

### Option 1: graphology + graphology-communities-louvain

`graphology` ist eine etablierte JS-Graph-Library. `graphology-communities-louvain`
implementiert den Louvain-Algorithmus (Vorgaenger von Leiden). Es gibt KEIN
`graphology-communities-leiden` Paket.

- Pro: Etabliert, gut getestet, TypeScript-Support
- Pro: Louvain ist gut genug fuer PKM-Graphen (kein akademischer Use Case)
- Pro: Kleine Bundle-Groesse (~20KB minified)
- Pro: Einfache API: `louvain(graph)` -> Community Map
- Con: Louvain, nicht Leiden (kann disconnected communities produzieren)
- Con: Zusaetzliche Dependency (graphology + graphology-communities-louvain)

### Option 2: Custom Leiden-Port in TypeScript

Leiden-Algorithmus direkt portieren basierend auf dem Python-Referenzcode
(igraph/leidenalg). Erfordert Adjacency-Matrix-Operationen.

- Pro: Exakt Leiden (State-of-the-Art)
- Pro: Keine externe Dependency
- Con: 500-1000 Zeilen Custom-Code
- Con: Hoher Wartungsaufwand
- Con: Fehlerrisiko bei der Portierung (Numerik, Konvergenz)

### Option 3: Label Propagation (Eigenimplementierung)

Einfachster Community-Detection-Algorithmus: Jeder Knoten uebernimmt das Label
seiner meisten Nachbarn. Iteriert bis Konvergenz.

- Pro: Trivial zu implementieren (~50 Zeilen)
- Pro: Keine externe Dependency
- Pro: O(m) pro Iteration, sehr schnell
- Con: Instabil (Ergebnis haengt von Iterationsreihenfolge ab)
- Con: Schlechtere Cluster-Qualitaet als Louvain/Leiden
- Con: Keine Hierarchie (nur flache Cluster)

### Option 4: WASM-Modul (igraph/networkit kompiliert)

Bestehende C/C++ Graph-Library als WASM kompilieren und laden.

- Pro: Echter Leiden-Algorithmus, kampferprobt
- Con: Grosses WASM-Binary (mehrere MB)
- Con: Build-Komplexitaet (Emscripten, CI-Integration)
- Con: Debugging schwierig
- Con: Review-Bot koennte WASM-Dateien beanstanden

## Decision

**Vorgeschlagene Option:** Option 1 -- graphology + graphology-communities-louvain

**Begruendung:**
Louvain ist fuer PKM-Graphen ausreichend. Der Unterschied zu Leiden (garantiert
well-connected communities) ist bei Graphen mit 500-5000 Edges vernachlaessigbar.
graphology ist eine etablierte, gut getestete Library mit kleinem Footprint.
Die API ist simpel und das Ergebnis deterministisch.

Falls Louvain-Cluster fuer den User nicht nachvollziehbar sind (H-04), kann spaeter
auf eine Leiden-Portierung oder einen Post-Processing-Schritt gewechselt werden
der disconnected Communities nachtraeglich zusammenfuehrt.

Rekursives Splitting uebergroesser Communities (>25% der Nodes) wie bei Graphify
sollte uebernommen werden.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Schnelle Implementierung (graphology API ist straightforward)
- Kleine Bundle-Groesse (~20KB)
- Bewaeherter Algorithmus mit vorhersagbarem Verhalten
- graphology kann auch fuer zukuenftige Graph-Metriken (Centrality, PageRank) genutzt werden

### Negative
- Louvain statt Leiden (theoretisch schlechtere Cluster-Qualitaet)
- Neue Dependency im Plugin (Review-Bot Risiko: gering, da es eine JS-Library ist)
- GraphStore-Daten muessen in graphology-Format konvertiert werden (Transformation)

### Risks
- graphology-communities-louvain koennte fuer grosse Graphen (>5000 Nodes) langsam sein: Benchmark noetig
- esbuild Bundling: graphology ist ESM-kompatibel, sollte keine Probleme machen

## Implementation Notes

1. `npm install graphology graphology-communities-louvain`
2. Neuer Service: `CommunityDetectionService.ts` in `src/core/knowledge/`
3. Konvertierung: GraphStore edges -> graphology Graph -> louvain() -> Community Map
4. Post-Processing: Rekursives Splitting uebergroesser Communities
5. Ergebnis speichern: OntologyStore mit `source='louvain'`
6. LLM-Call fuer Cluster-Benennung (1 Call pro Cluster, gecached)
7. Optional: `graphology-metrics` fuer Centrality-Berechnung (FEATURE-2003)

## Related Decisions

- ADR-069: Confidence Storage Model -- Confidence als Edge-Gewicht fuer gewichtetes Clustering
- ADR-071: Retrieval Integration Pattern -- Cluster-Membership fuer Retrieval-Boost

## References

- FEATURE-2002: Community Detection
- graphology: https://graphology.github.io/
- Blondel et al. (2008): "Fast unfolding of communities in large networks" (Louvain)
- Traag et al. (2019): "From Louvain to Leiden" (Leiden, theoretischer Hintergrund)
- Graphify: Leiden + rekursives Community-Splitting Pattern
