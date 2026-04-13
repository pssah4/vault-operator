# ADR-069: Confidence Storage Model

**Status:** Accepted
**Date:** 2026-04-11
**Deciders:** Sebastian Hanke

## Context

FEATURE-2001 (Confidence Scoring) erfordert, dass jede Graph-Verbindung einen
Confidence-Score (0.0-1.0) traegt. Aktuell speichert die `edges`-Tabelle
explizite Wikilinks und Frontmatter-Properties ohne Score. Die `implicit_edges`-
Tabelle hat bereits eine `similarity REAL`-Spalte. `getNeighbors()` joint beide
Tabellen, hat aber keinen einheitlichen Score zum Gewichten.

FEATURE-2004 (Retrieval Quality) und FEATURE-2002 (Community Detection) haengen
davon ab, dass Confidence einheitlich abfragbar ist.

**Triggering ASR:**
- Confidence computed inline during extraction (no separate pass) -- FEATURE-2001
- Quality Attribute: Performance, Reusability

## Decision Drivers

- **Abwaertskompatibilitaet:** Bestehende edges muessen migriert werden ohne Datenverlust
- **Query-Effizienz:** Confidence muss in SQL-Queries nutzbar sein (VaultHealthService, OntologyStore arbeiten mit SQL)
- **Einheitlichkeit:** `getNeighbors()` braucht einen gemeinsamen Score ueber beide Tabellen
- **Einfachheit:** Minimale Schemaenderung, keine neuen Tabellen wenn vermeidbar

## Considered Options

### Option 1: Column in edges-Tabelle (ALTER TABLE + DEFAULT)

`ALTER TABLE edges ADD COLUMN confidence REAL DEFAULT 1.0` -- alle bestehenden
expliziten Edges erhalten automatisch 1.0. `implicit_edges.similarity` wird
direkt als Confidence verwendet (keine Aenderung an implicit_edges).

`getNeighbors()` liefert `confidence` aus der jeweiligen Quelltabelle.

- Pro: Minimale Schemaenderung, eine Zeile Migration
- Pro: Bestehende Edges werden korrekt mit 1.0 backfilled
- Pro: `implicit_edges` bleibt unveraendert (similarity IST confidence)
- Pro: SQL-queryable fuer Health Checks und OntologyStore
- Con: Zwei verschiedene Spaltennamen (`confidence` vs `similarity`) fuer dasselbe Konzept

### Option 2: Separate confidence-Tabelle

Neue Tabelle `edge_confidence (source_path, target_path, edge_type, confidence)`.
Verbindet sich per JOIN mit `edges` und `implicit_edges`.

- Pro: Saubere Trennung, eine Quelle fuer alle Scores
- Con: JOIN-Overhead bei jedem Query
- Con: Sync-Problem: Confidence-Eintraege muessen synchron mit edges gehalten werden
- Con: Mehr Komplexitaet fuer marginalen Gewinn

### Option 3: Unified edges-Tabelle (edges + implicit_edges zusammenlegen)

Alle Verbindungen in einer Tabelle mit `edge_type` Spalte und `confidence`.

- Pro: Ein Query, ein Score, kein JOIN
- Con: Grosse Migration (implicit_edges Daten verschieben)
- Con: Bricht bestehende Queries die auf `implicit_edges` zugreifen
- Con: Semantisch unterschiedliche Dinge (User-gesetzte vs. berechnete Edges) in einer Tabelle

## Decision

**Vorgeschlagene Option:** Option 1 -- Column in edges-Tabelle

**Begruendung:**
Minimale Aenderung mit maximalem Effekt. `ALTER TABLE edges ADD COLUMN confidence
REAL DEFAULT 1.0` ist eine einzeilige Migration. Bestehende Edges erhalten korrekt
1.0 (User-gesetzt = voll vertrauenswuerdig). `implicit_edges.similarity` ist
bereits ein Confidence-Score und braucht keine Aenderung. `getNeighbors()` wird
erweitert um `confidence` aus der jeweiligen Quelltabelle zu lesen.

Der Unterschied `confidence` vs `similarity` als Spaltennamen ist akzeptabel --
`GraphNeighbor` bekommt ein `confidence: number` Feld das von beiden Quellen
befuellt wird. Die Abstraktion passiert im TypeScript-Interface, nicht im Schema.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Zero-Cost Migration fuer bestehende Daten (DEFAULT 1.0)
- Keine Aenderung an implicit_edges (bewaehrtes Schema)
- `GraphNeighbor` Interface bekommt `confidence: number` -- einheitlich fuer alle Consumer
- SQL-queryable: `SELECT ... WHERE confidence > 0.7`

### Negative
- Zwei Spaltennamen fuer dasselbe Konzept (`confidence` in edges, `similarity` in implicit_edges)
- `getNeighbors()` muss Mapping-Logik enthalten (minor)

### Risks
- ALTER TABLE auf groessen DBs: sql.js fuehrt ALTER TABLE in-memory aus. Bei 10K Edges unkritisch (~1ms).

## Implementation Notes

1. DB Version bump in KnowledgeDB.ts (Schema v4)
2. Migration: `ALTER TABLE edges ADD COLUMN confidence REAL DEFAULT 1.0`
3. `GraphExtractor.updateEdges()`: Confidence wird beim Schreiben gesetzt (immer 1.0 fuer explizite)
4. `GraphStore.getNeighbors()`: Rueckgabe um `confidence` erweitern
5. `GraphNeighbor` Interface: `confidence: number` hinzufuegen
6. Zukunft: Falls explicit Edges jemals variable Confidence brauchen (z.B. gewichtete MOC-Properties), ist die Spalte bereit

## Related Decisions

- ADR-050: Knowledge DB Schema (v3) -- Basis-Schema
- ADR-070: Community Detection Library -- nutzt Confidence fuer gewichtetes Clustering
- ADR-071: Retrieval Integration Pattern -- nutzt Confidence fuer Expansion-Gewichtung

## References

- FEATURE-2001: Confidence Scoring
- FEATURE-2004: Retrieval Quality Improvements
- Graphify: Confidence Scoring Pattern (EXTRACTED=1.0, INFERRED=variable)
