# ADR-071: Retrieval Integration Pattern

**Status:** Accepted
**Date:** 2026-04-11
**Deciders:** Sebastian Hanke

## Context

FEATURE-2004 (Retrieval Quality) erfordert, dass Confidence-Scores und Cluster-
Membership in die bestehende Retrieval-Pipeline integriert werden, ohne
zusaetzliche LLM-Calls oder merkbare Latenz.

Aktuelle Pipeline in SemanticSearchTool:
1. HyDE (optional) -> Query-Embedding
2. Parallel: Semantic (Cosine) + Keyword (TF-IDF)
3. RRF Fusion (k=60)
4. Graph-Expansion via `getNeighbors()` (bis 5 Nachbarn)
5. Optional: Reranker (Cross-Encoder)

Das Problem: Schritt 4 behandelt alle Edges gleich. Ein User-gesetzter Wikilink
hat dasselbe Gewicht wie eine schwache implizite Verbindung (Cosine 0.5).
Cluster-Zugehoerigkeit fliesst gar nicht ein.

**Code Review Note (2026-04-12):** Graph-Expansion passiert NACH der RRF-Fusion
als Post-Processing auf den Top-N Ergebnissen (SemanticSearchTool.ts:235-269),
nicht innerhalb der RRF-Formel. Der Confidence-Boost muss als Score-Modifier
in der Expansion implementiert werden, nicht als RRF-Kanal.

Zusaetzlich: `getNeighbors()` queried aktuell NUR `edges`, nicht `implicit_edges`.
Implicit Edges sind komplett unsichtbar fuer die Retrieval-Pipeline.

**Triggering ASR:**
- No additional LLM calls in retrieval path -- FEATURE-2004
- Quality Attribute: Performance, Cost

## Decision Drivers

- **Zero LLM-Calls:** Retrieval laeuft bei jeder User-Nachricht. Zusaetzliche LLM-Calls wuerden Latenz und Kosten vervielfachen.
- **Abwaertskompatibilitaet:** Muss funktionieren wenn keine Confidence/Cluster-Daten existieren (graceful degradation)
- **Messbarkeit:** Verbesserung muss in A/B-Tests nachweisbar sein (H-05: >15% Top-5 Precision)
- **Einfachheit:** Keine grundsaetzliche Aenderung der Pipeline-Architektur

## Considered Options

### Option 1: Confidence als RRF Rank-Boost (multiplikativ)

Graph-Expansion-Ergebnisse erhalten einen Boost basierend auf Edge-Confidence:
`boosted_score = rrf_score * (0.5 + 0.5 * confidence)`. Bei Confidence 1.0
wird der Score mit 1.0 multipliziert (unveraendert). Bei Confidence 0.5
wird er mit 0.75 multipliziert (leicht abgewertet).

Cluster-Boost: Notes im selben Cluster wie ein Top-3-Ergebnis erhalten einen
additiven Score-Bonus (z.B. +0.05 auf den RRF-Score).

- Pro: Einfach, vorhersagbar, keine Pipeline-Aenderung
- Pro: Graceful Degradation: ohne Confidence ist der Boost neutral (1.0)
- Pro: Cluster-Boost ist additiv und hat keinen Effekt wenn keine Cluster existieren
- Con: Multiplikativer Boost kann bei vielen niedrig-konfidenten Edges den Gesamt-Score stark druecken
- Con: Optimale Parameter (0.5, 0.05) muessen experimentell bestimmt werden

### Option 2: Confidence als Filter (Threshold)

Statt Gewichtung: Edges unter einem Confidence-Threshold (z.B. <0.6) werden
komplett aus der Graph-Expansion ausgeschlossen.

- Pro: Einfachste Implementierung (eine if-Bedingung)
- Pro: Eliminiert Noise radikal
- Con: Binaer (drin oder draussen) -- verliert Nuancen
- Con: Schwellwert-Tuning noetig (zu hoch = zu wenig Expansion, zu niedrig = kein Effekt)
- Con: Cluster-Boost muesste separat implementiert werden

### Option 3: Separate Retrieval-Stage (Graph-Retrieval als eigener RRF-Kanal)

Graph-basierte Suche als dritter Kanal neben Semantic und Keyword:
1. Semantic Search -> Ranked List A
2. Keyword Search -> Ranked List B
3. Graph Expansion (confidence-weighted) -> Ranked List C
4. 3-Way RRF Fusion

- Pro: Saubere Trennung der Retrieval-Signale
- Pro: Graph-Signal kann unabhaengig getuned werden
- Con: Erhoehte Komplexitaet (3 statt 2 Kanaele)
- Con: Graph-Expansion ist aktuell ein Post-Processing-Schritt, nicht ein eigener Retrieval-Kanal
- Con: Erfordert Umbau der Pipeline

## Decision

**Vorgeschlagene Option:** Option 1 -- Confidence als RRF Rank-Boost + Cluster-Bonus

**Begruendung:**
Minimaler Eingriff in die bestehende Pipeline mit maximalem Effekt. Der
multiplikative Confidence-Boost in `getNeighbors()` und der additive
Cluster-Bonus im RRF-Schritt sind zwei unabhaengige, kombinierbare
Verbesserungen die beide graceful degradieren.

Konkret:
1. `getNeighbors()` liefert `confidence` pro Nachbar (aus ADR-069)
2. Graph-Expansion-Score wird mit `(0.5 + 0.5 * confidence)` gewichtet
3. Notes im selben Cluster wie Top-3-Treffer erhalten +0.05 RRF-Bonus
4. Hub-Context-Anchoring: Bei expliziter Themen-Abfrage wird der Hub identifiziert und sein Cluster als primaerer Expansion-Scope verwendet

Die Parameter (0.5, 0.05) sind Startwerte. Nach dem A/B-Test (H-05) koennen
sie angepasst werden. Falls der Effekt zu schwach ist, kann Option 2 (Filter)
zusaetzlich aktiviert werden.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Keine Pipeline-Aenderung, nur Score-Anpassung in bestehenden Schritten
- Graceful Degradation: ohne Confidence/Cluster arbeitet die Pipeline wie bisher
- Testbar: A/B-Vergleich mit identischem Setup, nur Score-Berechnung unterschiedlich
- Konfigurierbar: Boost-Faktoren als Settings exponierbar

### Negative
- Parameter-Tuning noetig (welcher Boost-Faktor ist optimal?)
- Cluster-Bonus bevorzugt Notes in grossen Clustern (mehr Kandidaten fuer Bonus)
- Hub-Context-Anchoring erfordert Query-Klassifikation (ist die Frage "breit" oder "spezifisch"?)

### Risks
- Confidence ist nicht diskriminativ genug: Wenn 90% der Edges Confidence 1.0 haben, hat der Boost kaum Effekt. Mitigation: Implicit Edges (variable Confidence) sind der Haupthebel.
- Cluster-Bonus kann zu "Filter-Bubble" fuehren: Notes ausserhalb des Clusters werden systematisch benachteiligt. Mitigation: Bonus ist additiv und klein (+0.05), nicht multiplikativ.

## Implementation Notes

1. `SemanticSearchTool.ts`: Graph-Expansion-Ergebnisse mit Confidence gewichten
2. `GraphStore.getNeighbors()`: `confidence` Feld im Rueckgabe-Objekt (ADR-069)
3. RRF-Schritt: Cluster-Lookup per `OntologyStore.getRelatedEntities()` fuer Top-3
4. Hub-Anchoring: Wenn User nach einem Thema fragt und ein Hub-Note existiert,
   `getNeighbors()` mit dem Hub als Origin aufrufen statt mit dem Query-Ergebnis
5. A/B-Test Infrastruktur: Feature-Flag `confidenceWeightedRetrieval: boolean` in Settings

## Related Decisions

- ADR-069: Confidence Storage Model -- liefert die Confidence-Werte
- ADR-070: Community Detection Library -- liefert die Cluster-Daten

## References

- FEATURE-2004: Retrieval Quality Improvements
- Cormack et al. (2009): "Reciprocal Rank Fusion" (RRF)
- Microsoft Research (2024): "GraphRAG" (Graph-augmented Retrieval)
